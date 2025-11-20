# Performance Optimization Plan: N+1 Query Problem

**Document Version**: 1.0  
**Date**: November 20, 2025  
**Author**: Manus AI  
**Status**: Documented for Future Implementation

---

## Executive Summary

The Alexandria OS inventory management system currently suffers from a **critical N+1 query performance problem** in the `getGroupedByIsbn` procedure. With 2,297+ books in the database, this results in **2,298 separate database queries** (1 initial query + 2,297 follow-up queries) to load the inventory page, causing **10-30 second load times**.

This document outlines the technical root cause, the proposed optimization strategy using SQL JOIN operations with GROUP_CONCAT, implementation challenges encountered, and a recommended path forward for future optimization work.

---

## Problem Statement

### Current Implementation

The `inventory.getGroupedByIsbn` procedure in `/home/ubuntu/alexandria-os/server/routers.ts` (lines 373-474) uses the following pattern:

```typescript
// Step 1: Query all catalog_masters (1 query)
const books = await db
  .select({...})
  .from(catalogMasters)
  .where(and(...conditions))
  .limit(input.limit)
  .offset(input.offset);

// Step 2: For EACH book, query inventory_items (N queries)
const results = await Promise.all(books.map(async (book) => {
  const items = await db
    .select({...})
    .from(inventoryItems)
    .where(eq(inventoryItems.isbn13, book.isbn13));
  
  // Process items...
  return {...book, totalQuantity, availableQuantity, locations};
}));
```

### Performance Impact

With the current dataset of **2,297 books**:

- **Query Count**: 1 + 2,297 = **2,298 database queries** per page load
- **Load Time**: **10-30 seconds** (depending on network latency and database load)
- **Database Load**: Excessive connection overhead and query processing
- **User Experience**: Unacceptable wait times, perceived system instability

### Root Cause

The N+1 query problem occurs because the implementation:

1. Fetches all catalog records first (the "1" query)
2. Then executes a separate query for each catalog record to fetch related inventory items (the "N" queries)

This is a classic **ORM anti-pattern** where relationship loading is not optimized.

---

## Proposed Solution

### Optimization Strategy

Replace the N+1 query pattern with a **single SQL query** using:

- **LEFT JOIN** to combine `catalog_masters` and `inventory_items` tables
- **GROUP_CONCAT** to aggregate multiple inventory locations into a single comma-separated string
- **COUNT** and **SUM** with **CASE** expressions to calculate quantities
- **GROUP BY** to group results by ISBN

### Target SQL Query

```sql
SELECT 
  cm.isbn13,
  cm.title,
  cm.author,
  cm.publisher,
  cm.publicationYear,
  cm.categoryLevel1,
  cm.categoryLevel2,
  cm.categoryLevel3,
  cm.synopsis,
  cm.coverImageUrl,
  COUNT(ii.uuid) as totalQuantity,
  SUM(CASE WHEN ii.status = 'AVAILABLE' THEN 1 ELSE 0 END) as availableQuantity,
  GROUP_CONCAT(DISTINCT CASE 
    WHEN ii.status = 'AVAILABLE' AND ii.locationCode IS NOT NULL AND ii.locationCode != '' 
    THEN ii.locationCode 
  END ORDER BY ii.locationCode SEPARATOR ',') as locations,
  GROUP_CONCAT(DISTINCT CASE 
    WHEN ii.status = 'AVAILABLE' 
    THEN ii.uuid 
  END SEPARATOR ',') as availableItemUuids
FROM catalog_masters cm
LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13
WHERE [filter conditions]
GROUP BY cm.isbn13, cm.title, cm.author, cm.publisher, cm.publicationYear, 
         cm.categoryLevel1, cm.categoryLevel2, cm.categoryLevel3, cm.synopsis, cm.coverImageUrl
HAVING totalQuantity > 0
ORDER BY [sort column] [sort direction]
LIMIT ? OFFSET ?
```

### Expected Performance Improvement

- **Query Count**: 2,298 queries → **1 query** (99.96% reduction)
- **Load Time**: 10-30 seconds → **<1 second** (estimated 95%+ improvement)
- **Database Load**: Minimal connection overhead, single query execution
- **Scalability**: Performance remains constant as dataset grows

---

## Implementation Challenges

### Challenge 1: Drizzle ORM Limitations

**Issue**: Drizzle ORM does not natively support `GROUP_CONCAT` or complex aggregation functions in its query builder API.

**Attempted Solution**: Use `sql.raw()` to execute raw SQL queries.

**Problem Encountered**: The `sql.raw()` function does not support parameterized queries with `?` placeholders. When attempting to pass parameters separately, the database driver throws a syntax error:

```
Error: syntax error, unexpected '?'
```

**Technical Details**:

- Drizzle's `sql.raw()` expects the complete SQL string with values interpolated
- Using `sql.raw()` with template literals and `${value}` interpolation bypasses parameter binding
- This creates **SQL injection vulnerabilities** if user input is not properly sanitized
- The safer approach would be to use Drizzle's `sql` tagged template, but this doesn't support the complex GROUP_CONCAT syntax needed

### Challenge 2: Table Alias Mismatch

**Issue**: Mixing raw SQL (which uses table aliases like `cm`, `ii`) with Drizzle's query builder (which uses full table names like `catalog_masters`, `inventory_items`) causes WHERE clause mismatches.

**Example**:

```typescript
// Raw SQL uses aliases
const query = sql.raw(`
  SELECT cm.title, ii.locationCode
  FROM catalog_masters cm
  LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13
`);

// But Drizzle's WHERE builder uses full names
.where(eq(catalogMasters.title, 'Some Book'))  // Generates: catalog_masters.title = 'Some Book'
```

This results in SQL errors because the query references `cm.title` but the WHERE clause references `catalog_masters.title`.

### Challenge 3: Type Safety

**Issue**: Raw SQL queries lose TypeScript type safety, making the code more error-prone and harder to maintain.

**Impact**:

- No compile-time validation of column names
- No type inference for query results
- Manual type casting required
- Increased risk of runtime errors

---

## Database Schema Optimization

### Indexes Added

The following indexes were added to `/home/ubuntu/alexandria-os/server/db/schema.ts` to support the optimized query:

```typescript
export const catalogMasters = mysqlTable(
  "catalog_masters",
  {
    // ... column definitions ...
  },
  (table) => ({
    titleIdx: index("title_idx").on(table.title),
    authorIdx: index("author_idx").on(table.author),
    publisherIdx: index("publisher_idx").on(table.publisher),
  })
);

export const inventoryItems = mysqlTable(
  "inventory_items",
  {
    // ... column definitions ...
  },
  (table) => ({
    statusIdx: index("status_idx").on(table.status),
    locationIdx: index("location_idx").on(table.locationCode),
  })
);
```

### Index Purpose

| Index | Table | Column | Purpose |
|-------|-------|--------|---------|
| `title_idx` | `catalog_masters` | `title` | Speed up search and sorting by book title |
| `author_idx` | `catalog_masters` | `author` | Speed up filtering by author name |
| `publisher_idx` | `catalog_masters` | `publisher` | Speed up filtering by publisher |
| `status_idx` | `inventory_items` | `status` | Speed up filtering by item status (AVAILABLE, SOLD, etc.) |
| `location_idx` | `inventory_items` | `locationCode` | Speed up location-based queries and sorting |

**Note**: These indexes have been defined in the schema but **not yet pushed to the database**. Run `pnpm db:push` to apply them.

---

## Recommended Implementation Path

### Option 1: Use Drizzle's `sql` Tagged Template (Recommended)

Instead of `sql.raw()`, use Drizzle's `sql` tagged template with proper parameter binding:

```typescript
import { sql } from 'drizzle-orm';

const result = await db.execute(sql`
  SELECT 
    cm.isbn13,
    cm.title,
    COUNT(ii.uuid) as totalQuantity,
    GROUP_CONCAT(DISTINCT ii.locationCode) as locations
  FROM catalog_masters cm
  LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13
  WHERE cm.publicationYear >= ${input.yearFrom} 
    AND cm.publicationYear <= ${input.yearTo}
  GROUP BY cm.isbn13, cm.title
  LIMIT ${input.limit} OFFSET ${input.offset}
`);
```

**Advantages**:
- Safe parameter binding (no SQL injection risk)
- Cleaner syntax
- Better integration with Drizzle

**Disadvantages**:
- Still loses some type safety
- Requires manual result mapping

### Option 2: Create a Database View

Create a MySQL view that pre-aggregates the inventory data:

```sql
CREATE VIEW inventory_grouped AS
SELECT 
  cm.isbn13,
  cm.title,
  cm.author,
  cm.publisher,
  cm.publicationYear,
  cm.categoryLevel1,
  cm.categoryLevel2,
  cm.categoryLevel3,
  cm.synopsis,
  cm.coverImageUrl,
  COUNT(ii.uuid) as totalQuantity,
  SUM(CASE WHEN ii.status = 'AVAILABLE' THEN 1 ELSE 0 END) as availableQuantity,
  GROUP_CONCAT(DISTINCT CASE 
    WHEN ii.status = 'AVAILABLE' AND ii.locationCode IS NOT NULL 
    THEN ii.locationCode 
  END ORDER BY ii.locationCode) as locations
FROM catalog_masters cm
LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13
GROUP BY cm.isbn13, cm.title, cm.author, cm.publisher, cm.publicationYear,
         cm.categoryLevel1, cm.categoryLevel2, cm.categoryLevel3, cm.synopsis, cm.coverImageUrl;
```

Then query the view using Drizzle's normal query builder:

```typescript
const results = await db
  .select()
  .from(inventoryGroupedView)
  .where(and(...conditions))
  .limit(input.limit)
  .offset(input.offset);
```

**Advantages**:
- Full type safety with Drizzle
- Clean, maintainable code
- Database-level optimization
- Reusable across multiple queries

**Disadvantages**:
- Requires database migration
- View may need to be refreshed if schema changes
- Slightly more complex deployment

### Option 3: Use Raw Connection Pool

Bypass Drizzle entirely for this specific query and use the underlying MySQL2 connection pool:

```typescript
import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);
const [rows] = await pool.execute(query, [yearFrom, yearTo, limit, offset]);
```

**Advantages**:
- Full control over SQL
- Standard parameterized queries
- Maximum performance

**Disadvantages**:
- Loses all Drizzle benefits
- Manual type definitions required
- Inconsistent with rest of codebase

---

## Testing Strategy

### Unit Tests Required

When implementing the optimization, the following test cases must pass:

1. **Basic Aggregation**: Verify totalQuantity and availableQuantity are calculated correctly
2. **Location Grouping**: Verify locations are concatenated and deduplicated properly
3. **Filtering**: Verify all filter conditions work (search, category, publisher, author, year range)
4. **Pagination**: Verify limit and offset work correctly
5. **Sorting**: Verify sorting by different columns (title, author, year) works
6. **Zero Inventory**: Verify books with zero inventory are excluded/included based on flag
7. **Empty Results**: Verify empty result sets are handled gracefully
8. **Special Characters**: Verify books with special characters in titles/authors work correctly
9. **NULL Handling**: Verify NULL locations and missing data are handled properly
10. **Performance**: Verify query executes in <1 second with 2,297+ books

### Performance Benchmarking

Before and after optimization, measure:

- **Query execution time** (database-level timing)
- **Total API response time** (including network overhead)
- **Memory usage** (ensure GROUP_CONCAT doesn't cause memory issues)
- **Database CPU usage** (ensure query is properly indexed)

---

## Migration Plan

### Phase 1: Preparation (Estimated: 1 hour)

1. **Apply Database Indexes**:
   ```bash
   cd /home/ubuntu/alexandria-os
   pnpm db:push
   ```

2. **Backup Current Implementation**:
   - Create checkpoint with current working version
   - Document current performance metrics

3. **Set Up Performance Monitoring**:
   - Add query timing logs
   - Set up database query profiling

### Phase 2: Implementation (Estimated: 2-3 hours)

1. **Choose Implementation Approach**:
   - Recommended: Option 2 (Database View)
   - Alternative: Option 1 (sql tagged template)

2. **Implement Optimized Query**:
   - Create database view OR update procedure with sql template
   - Update TypeScript types
   - Handle result mapping

3. **Update Frontend**:
   - Ensure frontend correctly handles the new data structure
   - Verify location string splitting works correctly

### Phase 3: Testing (Estimated: 2 hours)

1. **Run Unit Tests**:
   ```bash
   pnpm test
   ```

2. **Manual Testing**:
   - Test all filter combinations
   - Test pagination with different page sizes
   - Test sorting by all columns
   - Test with edge cases (special characters, NULL values)

3. **Performance Testing**:
   - Measure query execution time
   - Verify <1 second load time target is met
   - Test with full 2,297 book dataset

### Phase 4: Deployment (Estimated: 30 minutes)

1. **Create Checkpoint**:
   ```bash
   # Via webdev_save_checkpoint tool
   ```

2. **Monitor Production**:
   - Watch for errors in logs
   - Monitor query performance
   - Gather user feedback

---

## Rollback Plan

If the optimization causes issues:

1. **Immediate Rollback**:
   ```bash
   # Use webdev_rollback_checkpoint to restore previous version
   # Checkpoint ID: 577041df (current working version)
   ```

2. **Investigate Issues**:
   - Review error logs
   - Check database query logs
   - Verify data integrity

3. **Fix and Retry**:
   - Address root cause
   - Re-test thoroughly
   - Deploy again

---

## Current Status

### What's Working

✅ **Core Functionality**: All inventory features work correctly (pagination, filters, inline editing, sorting)  
✅ **Data Integrity**: All 2,297 books are correctly stored and displayed  
✅ **Test Coverage**: 60 unit tests passing (7 test files)  
✅ **User Experience**: All features functional, just slow with large datasets  

### What's Not Working

❌ **Performance**: 10-30 second load times with 2,297+ books  
❌ **Scalability**: Performance degrades linearly as dataset grows  
❌ **Database Efficiency**: 2,298 queries per page load is unsustainable  

### Indexes Status

⚠️ **Database indexes defined but not applied**: Run `pnpm db:push` to apply the performance indexes

---

## Conclusion

The N+1 query problem is a **critical performance issue** that must be addressed for Alexandria OS to be production-ready. The proposed solution using SQL JOIN operations with GROUP_CONCAT will reduce query count by **99.96%** and improve load times by **95%+**.

While implementation challenges exist due to Drizzle ORM limitations, the recommended approach using **database views** provides the best balance of performance, type safety, and maintainability.

The optimization work is **well-documented and ready for implementation** when development resources are available. All necessary indexes have been defined, and a clear implementation path has been established.

---

## References

- **Drizzle ORM Documentation**: https://orm.drizzle.team/docs/overview
- **MySQL GROUP_CONCAT Documentation**: https://dev.mysql.com/doc/refman/8.0/en/aggregate-functions.html#function_group-concat
- **N+1 Query Problem Explanation**: https://stackoverflow.com/questions/97197/what-is-the-n1-selects-problem-in-orm-object-relational-mapping

---

**Next Steps**: When ready to implement, start with Phase 1 (apply database indexes) and proceed through the migration plan systematically.
