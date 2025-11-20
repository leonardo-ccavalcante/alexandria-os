# Sorting Fix Instructions for Claude Code

## Problem Description

The inventory table sorting is **NOT working**. When users click on column headers (TÍTULO, AUTOR, UBICACIÓN, etc.), the sort icon changes but the data remains in the same order. This is because:

1. **Frontend sorting is happening AFTER pagination** - The frontend only sorts the 10-50 items on the current page, not the entire dataset
2. **Backend has no sorting logic** - The backend query doesn't accept sort parameters and always returns data in database insertion order
3. **Client-side sorting is ineffective** - You can't properly sort 2,297 books when you only have 50 loaded in memory

## Root Cause

Looking at the code:

**Frontend** (`/home/ubuntu/alexandria-os/client/src/pages/InventoryFinal.tsx`):
- Lines 112-175: Client-side sorting using `useMemo` and `Array.sort()`
- Lines 47-56: tRPC query does NOT pass `sortField` or `sortDirection` to backend
- The sorting only affects the current page's data (10-50 items), not the full dataset

**Backend** (`/home/ubuntu/alexandria-os/server/routers.ts`):
- Lines 373-474: `getGroupedByIsbn` procedure
- Lines 374-384: Input schema has NO `sortField` or `sortDirection` parameters
- Lines 426-428: Query has NO `.orderBy()` clause - data comes back in random/insertion order

## Solution: Add Backend Sorting

### Step 1: Update Backend Input Schema

**File**: `/home/ubuntu/alexandria-os/server/routers.ts`  
**Location**: Lines 374-384 (inside `getGroupedByIsbn` procedure)

**Current code**:
```typescript
.input(z.object({
  searchText: z.string().optional(),
  categoryLevel1: z.string().optional(),
  publisher: z.string().optional(),
  author: z.string().optional(),
  yearFrom: z.number().optional(),
  yearTo: z.number().optional(),
  includeZeroInventory: z.boolean().default(false),
  limit: z.number().default(50),
  offset: z.number().default(0),
}))
```

**Add these two fields**:
```typescript
.input(z.object({
  searchText: z.string().optional(),
  categoryLevel1: z.string().optional(),
  publisher: z.string().optional(),
  author: z.string().optional(),
  yearFrom: z.number().optional(),
  yearTo: z.number().optional(),
  includeZeroInventory: z.boolean().default(false),
  limit: z.number().default(50),
  offset: z.number().default(0),
  sortField: z.enum(['title', 'author', 'publisher', 'publicationYear', 'isbn13']).default('title'),
  sortDirection: z.enum(['asc', 'desc']).default('asc'),
}))
```

### Step 2: Add Sorting Logic to Backend Query

**File**: `/home/ubuntu/alexandria-os/server/routers.ts`  
**Location**: Lines 411-428 (the database query section)

**Current code**:
```typescript
// Execute query with filters
const baseQuery = db
  .select({
    isbn13: catalogMasters.isbn13,
    title: catalogMasters.title,
    author: catalogMasters.author,
    publisher: catalogMasters.publisher,
    publicationYear: catalogMasters.publicationYear,
    categoryLevel1: catalogMasters.categoryLevel1,
    categoryLevel2: catalogMasters.categoryLevel2,
    categoryLevel3: catalogMasters.categoryLevel3,
    synopsis: catalogMasters.synopsis,
    coverImageUrl: catalogMasters.coverImageUrl,
  })
  .from(catalogMasters);

const books = conditions.length > 0
  ? await baseQuery.where(and(...conditions)).limit(input.limit).offset(input.offset)
  : await baseQuery.limit(input.limit).offset(input.offset);
```

**Replace with**:
```typescript
import { asc, desc } from 'drizzle-orm';

// Execute query with filters
const baseQuery = db
  .select({
    isbn13: catalogMasters.isbn13,
    title: catalogMasters.title,
    author: catalogMasters.author,
    publisher: catalogMasters.publisher,
    publicationYear: catalogMasters.publicationYear,
    categoryLevel1: catalogMasters.categoryLevel1,
    categoryLevel2: catalogMasters.categoryLevel2,
    categoryLevel3: catalogMasters.categoryLevel3,
    synopsis: catalogMasters.synopsis,
    coverImageUrl: catalogMasters.coverImageUrl,
  })
  .from(catalogMasters);

// Determine sort column
const sortColumn = {
  title: catalogMasters.title,
  author: catalogMasters.author,
  publisher: catalogMasters.publisher,
  publicationYear: catalogMasters.publicationYear,
  isbn13: catalogMasters.isbn13,
}[input.sortField];

// Determine sort function
const sortFn = input.sortDirection === 'asc' ? asc : desc;

// Apply filters, sorting, and pagination
const books = conditions.length > 0
  ? await baseQuery
      .where(and(...conditions))
      .orderBy(sortFn(sortColumn))
      .limit(input.limit)
      .offset(input.offset)
  : await baseQuery
      .orderBy(sortFn(sortColumn))
      .limit(input.limit)
      .offset(input.offset);
```

### Step 3: Update Frontend to Pass Sort Parameters

**File**: `/home/ubuntu/alexandria-os/client/src/pages/InventoryFinal.tsx`  
**Location**: Lines 47-56 (the tRPC query)

**Current code**:
```typescript
const { data: inventoryResponse, refetch } = trpc.inventory.getGroupedByIsbn.useQuery({
  searchText,
  publisher,
  author,
  yearFrom: yearFrom ? parseInt(yearFrom) : undefined,
  yearTo: yearTo ? parseInt(yearTo) : undefined,
  includeZeroInventory: showZeroInventory,
  limit: pageSize,
  offset: (currentPage - 1) * pageSize,
});
```

**Add sort parameters**:
```typescript
const { data: inventoryResponse, refetch } = trpc.inventory.getGroupedByIsbn.useQuery({
  searchText,
  publisher,
  author,
  yearFrom: yearFrom ? parseInt(yearFrom) : undefined,
  yearTo: yearTo ? parseInt(yearTo) : undefined,
  includeZeroInventory: showZeroInventory,
  limit: pageSize,
  offset: (currentPage - 1) * pageSize,
  sortField: sortField === 'location' || sortField === 'available' || sortField === 'total' 
    ? 'title'  // These fields can't be sorted on backend, default to title
    : sortField,
  sortDirection,
});
```

### Step 4: Remove Client-Side Sorting (Optional but Recommended)

**File**: `/home/ubuntu/alexandria-os/client/src/pages/InventoryFinal.tsx`  
**Location**: Lines 112-175

**Current code**:
```typescript
// Sort and filter data
const sortedData = useMemo(() => {
  if (!inventoryData) return [];
  
  // Apply filters
  let filtered = [...inventoryData];
  
  if (hideWithoutLocation) {
    filtered = filtered.filter(book => 
      book.locations && 
      book.locations.length > 0 && 
      book.locations.some(loc => loc !== null && loc !== "" && loc !== "-")
    );
  }
  
  if (hideWithoutQuantity) {
    filtered = filtered.filter(book => book.availableQuantity > 0);
  }
  
  const sorted = filtered.sort((a, b) => {
    let aVal: any, bVal: any;
    
    switch (sortField) {
      case "title":
        aVal = a.title?.toLowerCase() || "";
        bVal = b.title?.toLowerCase() || "";
        break;
      case "author":
        aVal = a.author?.toLowerCase() || "";
        bVal = b.author?.toLowerCase() || "";
        break;
      case "publisher":
        aVal = a.publisher?.toLowerCase() || "";
        bVal = b.publisher?.toLowerCase() || "";
        break;
      case "isbn":
        aVal = a.isbn13 || "";
        bVal = b.isbn13 || "";
        break;
      case "location":
        aVal = a.locations || "";
        bVal = b.locations || "";
        break;
      case "available":
        aVal = a.availableQuantity;
        bVal = b.availableQuantity;
        break;
      case "total":
        aVal = a.totalQuantity;
        bVal = b.totalQuantity;
        break;
      default:
        return 0;
    }
    
    if (sortDirection === "asc") {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });
  
  return sorted;
}, [inventoryData, sortField, sortDirection, hideWithoutLocation, hideWithoutQuantity]);
```

**Replace with** (keep filters, remove sorting):
```typescript
// Filter data (sorting now happens on backend)
const filteredData = useMemo(() => {
  if (!inventoryData) return [];
  
  let filtered = [...inventoryData];
  
  if (hideWithoutLocation) {
    filtered = filtered.filter(book => 
      book.locations && 
      book.locations.length > 0 && 
      book.locations.some(loc => loc !== null && loc !== "" && loc !== "-")
    );
  }
  
  if (hideWithoutQuantity) {
    filtered = filtered.filter(book => book.availableQuantity > 0);
  }
  
  return filtered;
}, [inventoryData, hideWithoutLocation, hideWithoutQuantity]);
```

### Step 5: Update All References to `sortedData`

**File**: `/home/ubuntu/alexandria-os/client/src/pages/InventoryFinal.tsx`  
**Throughout the file** (multiple locations)

Find all instances of `sortedData` and replace with `filteredData`:

- Line ~300: `{sortedData.length === 0 ? (...) : (...)}`
- Line ~350: `{sortedData.map((book) => (...)}`
- Line ~450: `{sortedData.map((book) => (...)}`

Use find-and-replace: `sortedData` → `filteredData`

### Step 6: Reset to Page 1 When Sort Changes

**File**: `/home/ubuntu/alexandria-os/client/src/pages/InventoryFinal.tsx`  
**Location**: Lines 177-184 (the `handleSort` function)

**Current code**:
```typescript
const handleSort = (field: SortField) => {
  if (sortField === field) {
    setSortDirection(sortDirection === "asc" ? "desc" : "asc");
  } else {
    setSortField(field);
    setSortDirection("asc");
  }
};
```

**Add page reset**:
```typescript
const handleSort = (field: SortField) => {
  if (sortField === field) {
    setSortDirection(sortDirection === "asc" ? "desc" : "asc");
  } else {
    setSortField(field);
    setSortDirection("asc");
  }
  setCurrentPage(1); // Reset to first page when sorting changes
};
```

## Important Notes

### Fields That CAN Be Sorted on Backend:
- ✅ **TÍTULO** (title) - catalogMasters.title
- ✅ **AUTOR** (author) - catalogMasters.author  
- ✅ **ISBN** (isbn13) - catalogMasters.isbn13
- ✅ **Editorial** (publisher) - catalogMasters.publisher
- ✅ **Año** (publicationYear) - catalogMasters.publicationYear

### Fields That CANNOT Be Sorted on Backend (require client-side):
- ❌ **UBICACIÓN** (location) - This is aggregated from inventory_items using GROUP_CONCAT, not a direct column
- ❌ **DISPONIBLE** (availableQuantity) - This is calculated via COUNT(), not a direct column
- ❌ **TOTAL** (totalQuantity) - This is calculated via COUNT(), not a direct column

**Why?** These fields are computed in the backend AFTER the query runs (lines 431-453), so they can't be used in the SQL ORDER BY clause.

**Solution**: For these fields, you have two options:
1. Keep them client-side only (current approach) - works but only sorts current page
2. Implement them in the optimized SQL query (future work when you fix the N+1 problem)

## Testing Checklist

After implementing the fix:

1. ✅ Click on **TÍTULO** header - books should sort A-Z, then Z-A on second click
2. ✅ Click on **AUTOR** header - books should sort by author A-Z, then Z-A
3. ✅ Click on **ISBN** header - books should sort by ISBN ascending/descending
4. ✅ Navigate to page 2 - sorting should persist across pages
5. ✅ Change sort while on page 3 - should reset to page 1 with new sort order
6. ✅ Apply filters then sort - should work together correctly
7. ✅ Check that pagination count updates correctly with filters

## Summary

**What's broken**: Sorting happens client-side on only 10-50 items per page, not the full 2,297 book dataset.

**What needs to change**: 
1. Backend must accept `sortField` and `sortDirection` parameters
2. Backend must use Drizzle's `.orderBy()` to sort at database level
3. Frontend must pass sort parameters to backend
4. Frontend should remove redundant client-side sorting (keep filters only)

**Expected result**: Clicking any column header will sort the ENTIRE dataset across all pages, not just the current page.

**Files to modify**:
1. `/home/ubuntu/alexandria-os/server/routers.ts` - Add sort parameters and `.orderBy()` clause
2. `/home/ubuntu/alexandria-os/client/src/pages/InventoryFinal.tsx` - Pass sort params, remove client sorting

**Estimated time**: 15-20 minutes to implement and test.
