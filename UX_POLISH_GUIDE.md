# UX Polish Implementation Guide

This document outlines the UX improvements implemented and provides guidance for completing the Phase 8 UX polish tasks.

## Completed Components

### 1. LoadingSkeleton Component
**Location:** `client/src/components/LoadingSkeleton.tsx`

Provides consistent loading states across the application with multiple variants:
- `table` - Skeleton for table layouts
- `card` - Skeleton for card grids
- `list` - Skeleton for list views
- `dashboard` - Skeleton for dashboard KPIs and charts
- `form` - Skeleton for form inputs

**Usage:**
```tsx
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

// In your component
{isLoading && <LoadingSkeleton variant="table" count={5} />}
```

### 2. EmptyState Component
**Location:** `client/src/components/EmptyState.tsx`

Displays user-friendly empty states with icons and call-to-action buttons:
- `inventory` - No books in inventory
- `dashboard` - No analytics data
- `sales` - No sales recorded
- `catalog` - No books cataloged
- `generic` - Generic empty state

**Usage:**
```tsx
import { EmptyState } from "@/components/EmptyState";

// In your component
{data.length === 0 && (
  <EmptyState
    variant="inventory"
    onAction={() => navigate("/triage")}
  />
)}
```

### 3. ConfirmDialog Component
**Location:** `client/src/components/ConfirmDialog.tsx`

Confirmation dialog for destructive actions with customizable variants:
- `default` - Standard confirmation
- `destructive` - Red warning for dangerous actions

**Usage:**
```tsx
import { ConfirmDialog } from "@/components/ConfirmDialog";

const [showConfirm, setShowConfirm] = useState(false);

<ConfirmDialog
  open={showConfirm}
  onOpenChange={setShowConfirm}
  onConfirm={handleDelete}
  title="Eliminar libro"
  description="¿Estás seguro de que deseas eliminar este libro?"
  confirmLabel="Eliminar"
  variant="destructive"
/>
```

### 4. useDebounce Hook
**Location:** `client/src/hooks/useDebounce.ts`

Debounces rapidly changing values to optimize performance:

**Usage:**
```tsx
import { useDebounce } from "@/hooks/useDebounce";

const [searchText, setSearchText] = useState("");
const debouncedSearch = useDebounce(searchText, 300); // 300ms delay

// Use debouncedSearch in your query
const { data } = trpc.inventory.search.useQuery({ query: debouncedSearch });
```

### 5. useKeyboardShortcut Hook
**Location:** `client/src/hooks/useKeyboardShortcut.ts`

Registers keyboard shortcuts for improved navigation:

**Usage:**
```tsx
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";

// Ctrl+K to open search
useKeyboardShortcut(
  { ctrl: true, key: "k" },
  () => setSearchOpen(true)
);

// Escape to close modal
useKeyboardShortcut(
  { key: "Escape" },
  () => setModalOpen(false),
  modalOpen // Only enabled when modal is open
);
```

## Integration Checklist

### Inventory Page (`client/src/pages/InventoryFinal.tsx`)
- [x] Add useDebounce for search input
- [ ] Replace loading spinner with LoadingSkeleton (table variant)
- [ ] Add EmptyState when no books found
- [ ] Add ConfirmDialog for bulk delete operations
- [ ] Implement keyboard shortcuts (Ctrl+F for search focus)
- [ ] Add ARIA labels to filter controls
- [ ] Optimize with React.memo for table rows

### Dashboard Page (`client/src/pages/Dashboard.tsx`)
- [ ] Replace loading states with LoadingSkeleton (dashboard variant)
- [ ] Add EmptyState when no analytics data
- [ ] Add keyboard shortcuts (Ctrl+R to refresh)
- [ ] Add ARIA labels to charts
- [ ] Optimize chart re-renders with useMemo

### Triage Page (`client/src/pages/Triage.tsx`)
- [ ] Add LoadingSkeleton for book lookup
- [ ] Add EmptyState for no ISBN entered
- [ ] Implement keyboard shortcuts (Enter to verify ISBN)
- [ ] Add ARIA labels to form inputs
- [ ] Add focus management for ISBN input

### Catalog Page (`client/src/pages/Catalog.tsx`)
- [ ] Add LoadingSkeleton for book data fetch
- [ ] Add EmptyState when ISBN not found
- [ ] Add ConfirmDialog before creating inventory item
- [ ] Implement keyboard shortcuts (Ctrl+S to save)
- [ ] Add ARIA labels to form fields

### Carga Masiva Page (`client/src/pages/CargaMasiva.tsx`)
- [ ] Add LoadingSkeleton during file upload
- [ ] Add ConfirmDialog for database cleanup (already has basic confirm)
- [ ] Enhance ConfirmDialog with destructive variant
- [ ] Add keyboard shortcuts (Ctrl+U to trigger upload)
- [ ] Add ARIA labels to file upload zones

## Responsive Design Guidelines

### Breakpoints
- `sm`: 640px - Mobile landscape
- `md`: 768px - Tablet
- `lg`: 1024px - Desktop
- `xl`: 1280px - Large desktop

### Mobile-First Approach
1. Start with mobile layout (single column)
2. Add `md:` prefix for tablet adjustments
3. Add `lg:` prefix for desktop enhancements

**Example:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Cards stack on mobile, 2 columns on tablet, 3 on desktop */}
</div>
```

### Common Responsive Patterns

#### Navigation
```tsx
{/* Mobile: Hamburger menu, Desktop: Full nav */}
<nav className="flex items-center justify-between">
  <div className="lg:hidden">
    <MobileMenu />
  </div>
  <div className="hidden lg:flex gap-4">
    <NavLinks />
  </div>
</nav>
```

#### Tables
```tsx
{/* Mobile: Card view, Desktop: Table view */}
<div className="block lg:hidden">
  <CardView data={data} />
</div>
<div className="hidden lg:block">
  <TableView data={data} />
</div>
```

#### Filters
```tsx
{/* Mobile: Stacked, Desktop: Horizontal */}
<div className="flex flex-col lg:flex-row gap-4">
  <Input placeholder="Search..." />
  <Select options={publishers} />
  <Select options={authors} />
</div>
```

## Accessibility Guidelines

### ARIA Labels
Add descriptive labels to interactive elements:
```tsx
<button aria-label="Aumentar cantidad">
  <Plus />
</button>

<input
  type="search"
  aria-label="Buscar libros por título, autor o ISBN"
  placeholder="Buscar..."
/>
```

### Focus Management
Ensure keyboard navigation works correctly:
```tsx
// Auto-focus first input in modal
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <input ref={inputRef} autoFocus />
  </DialogContent>
</Dialog>

// Trap focus within modal
useEffect(() => {
  if (modalOpen) {
    firstInputRef.current?.focus();
  }
}, [modalOpen]);
```

### Keyboard Navigation
- Tab: Navigate between focusable elements
- Enter: Submit forms, activate buttons
- Escape: Close modals, cancel actions
- Arrow keys: Navigate lists, adjust values

## Performance Optimization

### Debouncing
Use for frequently changing inputs:
- Search fields
- Filter dropdowns
- Auto-save forms

### Memoization
Use `useMemo` for expensive computations:
```tsx
const sortedData = useMemo(() => {
  return data.sort((a, b) => a.title.localeCompare(b.title));
}, [data]);
```

Use `React.memo` for expensive components:
```tsx
const BookCard = React.memo(({ book }: { book: Book }) => {
  return <Card>...</Card>;
});
```

### Optimistic Updates
Update UI immediately, rollback on error:
```tsx
const updateMutation = trpc.inventory.update.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await utils.inventory.getAll.cancel();
    
    // Snapshot previous value
    const previous = utils.inventory.getAll.getData();
    
    // Optimistically update
    utils.inventory.getAll.setData(undefined, (old) => ({
      ...old,
      ...newData,
    }));
    
    return { previous };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    utils.inventory.getAll.setData(undefined, context?.previous);
  },
});
```

## Toast Notifications

Already implemented using `sonner`. Best practices:
- Success: Green, brief message ("Libro actualizado")
- Error: Red, descriptive message ("Error: ISBN no válido")
- Info: Blue, informational ("Cargando datos...")
- Warning: Yellow, cautionary ("Algunos libros no se pudieron importar")

```tsx
import { toast } from "sonner";

// Success
toast.success("Libro catalogado correctamente");

// Error
toast.error("Error al guardar el libro");

// With action
toast.success("Libro eliminado", {
  action: {
    label: "Deshacer",
    onClick: () => undoDelete(),
  },
});
```

## Testing Checklist

### Manual Testing
- [ ] Test all pages on mobile (< 640px)
- [ ] Test all pages on tablet (768px - 1024px)
- [ ] Test all pages on desktop (> 1024px)
- [ ] Test keyboard navigation (Tab, Enter, Escape)
- [ ] Test with screen reader (NVDA, JAWS, VoiceOver)
- [ ] Test loading states (slow network simulation)
- [ ] Test empty states (clear database, check all pages)
- [ ] Test error states (disconnect network, check error handling)

### Unit Testing
Create tests for new components:
```tsx
// LoadingSkeleton.test.tsx
describe("LoadingSkeleton", () => {
  it("renders table variant", () => {
    render(<LoadingSkeleton variant="table" count={3} />);
    expect(screen.getAllByRole("status")).toHaveLength(3);
  });
});

// useDebounce.test.ts
describe("useDebounce", () => {
  it("debounces value changes", async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: "initial" } }
    );
    
    expect(result.current).toBe("initial");
    
    rerender({ value: "updated" });
    expect(result.current).toBe("initial"); // Still old value
    
    await waitFor(() => {
      expect(result.current).toBe("updated"); // Updated after delay
    }, { timeout: 600 });
  });
});
```

## Next Steps

1. **Integrate components into Inventory page** - Start with the most complex page
2. **Add responsive design** - Implement mobile-first layouts
3. **Test accessibility** - Use screen reader and keyboard navigation
4. **Optimize performance** - Add memoization where needed
5. **Write unit tests** - Ensure components work correctly
6. **Document changes** - Update user guide with new features

## Resources

- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Tailwind CSS Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [React Accessibility](https://react.dev/learn/accessibility)
- [Web Content Accessibility Guidelines (WCAG)](https://www.w3.org/WAI/WCAG21/quickref/)
