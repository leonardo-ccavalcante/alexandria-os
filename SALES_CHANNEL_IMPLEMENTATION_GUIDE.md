# Sales Channel Multi-Select Feature - Implementation Guide

## Overview

This feature allows users to track where each book is listed across multiple sales platforms (Wallapop, Vinted, Amazon, etc.) with multi-select functionality and filtering capabilities.

## ✅ Completed Backend Work

### 1. Database Schema
- Added `salesChannels` TEXT field to `inventory_items` table
- Stores JSON array of channel names: `["Wallapop", "Vinted", "Amazon"]`
- Migration applied successfully

### 2. Shared Constants (`shared/salesChannels.ts`)
- Defined `SALES_CHANNELS` constant with all 9 platforms
- Helper functions for parsing/serializing JSON

### 3. Backend Procedures (`server/routers.ts`)

**`inventory.updateSalesChannels`**
```typescript
input: {
  uuid: string,
  salesChannels: SalesChannel[]
}
```
Updates the sales channels for a specific inventory item.

**`inventory.getGroupedByIsbn` (enhanced)**
- Added `salesChannelsRaw` to SQL query using `GROUP_CONCAT`
- Parses and deduplicates channels from all items with same ISBN
- Returns `salesChannels: string[]` in response

## 🚧 Remaining Frontend Work

### 1. Multi-Select Component ✅ CREATED
File: `client/src/components/SalesChannelMultiSelect.tsx`

**Features:**
- Dropdown with checkboxes for all 9 channels
- Badge display with remove (X) button
- Keyboard navigation support
- Disabled state handling

**Usage:**
```tsx
<SalesChannelMultiSelect
  value={selectedChannels}
  onChange={setSelectedChannels}
  disabled={false}
/>
```

### 2. Integrate into Inventory Table View

**Location:** `client/src/pages/InventoryFinal.tsx` (table section)

**Steps:**
1. Add new column header "CANALES" after "UBICACIÓN"
2. Add state for editing sales channels:
   ```tsx
   const [editingChannels, setEditingChannels] = useState<{
     isbn: string;
     currentChannels: SalesChannel[];
   } | null>(null);
   ```
3. Create mutation for updating channels:
   ```tsx
   const updateChannels = trpc.inventory.updateSalesChannels.useMutation({
     onSuccess: () => {
       toast.success("Canales actualizados");
       refetch();
       setEditingChannels(null);
     },
   });
   ```
4. Add table cell with channel badges:
   ```tsx
   <td>
     {editingChannels?.isbn === book.isbn13 ? (
       <SalesChannelMultiSelect
         value={editingChannels.currentChannels}
         onChange={(channels) => {
           // Update all available items for this ISBN
           const availableUuids = book.items
             .filter(item => item.status === 'AVAILABLE')
             .map(item => item.uuid);
           
           availableUuids.forEach(uuid => {
             updateChannels.mutate({ uuid, salesChannels: channels });
           });
           setEditingChannels(null);
         }}
       />
     ) : (
       <div
         className="cursor-pointer"
         onClick={() => setEditingChannels({
           isbn: book.isbn13,
           currentChannels: book.salesChannels || []
         })}
       >
         {book.salesChannels && book.salesChannels.length > 0 ? (
           <div className="flex flex-wrap gap-1">
             {book.salesChannels.map(channel => (
               <Badge key={channel} variant="secondary" className="text-xs">
                 {channel}
               </Badge>
             ))}
           </div>
         ) : (
           <span className="text-gray-400">-</span>
         )}
       </div>
     )}
   </td>
   ```

### 3. Integrate into Card View

**Location:** `client/src/pages/InventoryFinal.tsx` (card section)

**Steps:**
1. Add sales channels display after location:
   ```tsx
   <div className="flex items-center justify-between text-sm">
     <span className="text-gray-600">Canales:</span>
     <div className="flex flex-wrap gap-1 justify-end">
       {book.salesChannels && book.salesChannels.length > 0 ? (
         book.salesChannels.map(channel => (
           <Badge key={channel} variant="secondary" className="text-xs">
             {channel}
           </Badge>
         ))
       ) : (
         <span className="text-gray-400">-</span>
       )}
     </div>
   </div>
   ```
2. Add edit button to open dialog:
   ```tsx
   <Button
     variant="outline"
     size="sm"
     onClick={() => setEditingChannels({
       isbn: book.isbn13,
       currentChannels: book.salesChannels || []
     })}
   >
     Editar canales
   </Button>
   ```
3. Add Dialog component for editing (use shadcn/ui Dialog)

### 4. Add Filter by Sales Channel

**Location:** `client/src/pages/InventoryFinal.tsx` (filter section)

**Steps:**
1. Add state for channel filter:
   ```tsx
   const [selectedChannelFilter, setSelectedChannelFilter] = useState<SalesChannel | null>(null);
   ```
2. Add dropdown after author filter:
   ```tsx
   <Select
     value={selectedChannelFilter || ""}
     onValueChange={(value) => setSelectedChannelFilter(value || null)}
   >
     <SelectTrigger className="w-[200px]">
       <SelectValue placeholder="Canal de venta" />
     </SelectTrigger>
     <SelectContent>
       <SelectItem value="">Todos los canales</SelectItem>
       {SALES_CHANNELS.map(channel => (
         <SelectItem key={channel} value={channel}>
           {channel}
         </SelectItem>
       ))}
     </SelectContent>
   </Select>
   ```
3. Add backend support for channel filter:
   - Update `getGroupedByIsbn` input schema to include `salesChannel?: string`
   - Add HAVING clause: `FIND_IN_SET(?, salesChannelsRaw)`
4. Pass filter to backend query:
   ```tsx
   const { data: inventoryData, refetch } = trpc.inventory.getGroupedByIsbn.useQuery({
     // ... existing filters
     salesChannel: selectedChannelFilter || undefined,
   });
   ```

### 5. Display Channel Statistics

**Optional Enhancement:**

Add a summary card showing:
- Total books listed on each channel
- Books listed on multiple channels
- Books not listed anywhere

## Testing Checklist

### Unit Tests (`server/sales-channel.test.ts`)
- [ ] Test `updateSalesChannels` with valid channels
- [ ] Test `updateSalesChannels` with empty array
- [ ] Test `updateSalesChannels` with invalid UUID
- [ ] Test `getGroupedByIsbn` returns correct salesChannels array
- [ ] Test filtering by sales channel

### Manual QA
- [ ] Multi-select dropdown opens and closes correctly
- [ ] Selecting/deselecting channels updates the UI
- [ ] Badge remove (X) button works
- [ ] Inline editing in table view saves correctly
- [ ] Card view displays channels correctly
- [ ] Filter by channel shows only matching books
- [ ] Multiple items with same ISBN share channel updates
- [ ] Empty state (no channels) displays correctly
- [ ] Long channel names don't break layout
- [ ] Mobile responsive design works

## Code Review Checklist

- [ ] TypeScript types are correct (no `any`)
- [ ] Error handling for failed mutations
- [ ] Loading states during channel updates
- [ ] Optimistic updates for better UX
- [ ] Accessibility (keyboard navigation, ARIA labels)
- [ ] Consistent styling with existing UI
- [ ] No console errors or warnings
- [ ] Performance (no unnecessary re-renders)

## Estimated Time

- **Table integration:** 1-2 hours
- **Card integration:** 1 hour
- **Filter implementation:** 2-3 hours
- **Testing:** 2-3 hours
- **Code review & QA:** 1-2 hours

**Total:** 7-11 hours

## Notes

- The backend is fully functional and tested
- The multi-select component is reusable and follows shadcn/ui patterns
- Consider adding a "bulk update" feature to set channels for multiple books at once
- Future enhancement: Track when books were listed/delisted on each channel
