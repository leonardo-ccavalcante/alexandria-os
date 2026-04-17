# Alexandria OS — Code Review & Implementation Plan

> Generated: 2026-04-17 | Methodology: Karpathy guidelines + systematic debugging + red-team analysis

---

## Executive Summary

The codebase is functional and well-structured for a single-library deployment. However, as a **multi-library SaaS**, several critical security gaps, data integrity risks, and architectural debt items need to be addressed before the system can be trusted with multiple tenants. The issues below are ordered by severity.

---

## CRITICAL — Security & Data Integrity

### C1 · `settings.update` allows any authenticated user to overwrite any system setting key

**File:** `server/routers.ts` line 2737  
**Procedure:** `settings.update` uses `protectedProcedure` — any logged-in user from any library can call it.  
**Impact:** A user from Library B can overwrite `ACTIVE_SALES_CHANNELS`, `ISBNDB_API_KEY`, or any other global system setting, corrupting data for all libraries.  
**Fix:** Change to `libraryAdminProcedure` and scope settings to the user's library (add `libraryId` to `system_settings` table), OR use `adminProcedure` (owner-only) for truly global settings.

---

### C2 · `settings.get` leaks all system settings to any authenticated user

**File:** `server/routers.ts` line 2728  
**Procedure:** `settings.get` uses `protectedProcedure` with no key allowlist.  
**Impact:** Any user can read `ISBNDB_API_KEY` and other sensitive keys by calling `trpc.settings.get({ key: 'ISBNDB_API_KEY' })`.  
**Fix:** Either scope to `libraryAdminProcedure`, or add an explicit allowlist of readable keys.

---

### C3 · `catalog.updateBook` modifies shared `catalog_masters` with no library ownership check

**File:** `server/routers.ts` line 928  
**Procedure:** `catalog.updateBook` uses `protectedProcedure` — any authenticated user can update title, author, synopsis, cover image of any book in the shared catalog.  
**Impact:** A malicious user can corrupt book metadata that is shared across all libraries.  
**Fix:** Either (a) make `catalog_masters` truly shared and read-only to non-admins, or (b) add a `libraryId` override layer so each library has its own editable copy of the metadata.

---

### C4 · `catalog.enrichMetadata` and `catalog.bulkEnrichMetadata` use `protectedProcedure` with no library check

**File:** `server/routers.ts` lines 525, 620  
**Impact:** Any authenticated user can trigger bulk LLM/API calls that modify shared catalog data and consume API quota.  
**Fix:** Change to `libraryAdminProcedure`.

---

### C5 · `sales.recordSale` (line 2762) is a duplicate procedure with no library isolation

**File:** `server/routers.ts` line 2762  
**Router:** `sales.recordSale` uses `protectedProcedure` and queries `inventoryItems` **without** filtering by `libraryId`. A user from Library B can sell an item belonging to Library A.  
**Impact:** Cross-library data corruption — items from other libraries can be marked as SOLD, revenue attributed to wrong library.  
**Fix:** Delete the duplicate `sales.recordSale` entirely. The correct implementation is `inventory.recordSale` at line 1360 which uses `libraryProcedure` and checks `item.libraryId !== ctx.library.id`.

---

### C6 · `batch.updateFromCsv` calls `batchUpdateInventoryItems` with no library ownership check

**File:** `server/routers.ts` line 1451, `server/db.ts` line 353  
**Impact:** The batch CSV update sends UUIDs directly to `batchUpdateInventoryItems` which does `updateInventoryItem(uuid, data)` with no `libraryId` filter. A user who knows UUIDs from another library can overwrite their items' location, price, or status.  
**Fix:** Add `libraryId` parameter to `batchUpdateInventoryItems`; add `AND libraryId = ?` to the UPDATE WHERE clause.

---

### C7 · `catalog.getBooksWithoutIsbn` uses `protectedProcedure` — returns data from all libraries

**File:** `server/routers.ts` line 1228  
**Impact:** Returns catalog master entries visible to all authenticated users regardless of library membership.  
**Fix:** Change to `libraryProcedure` and join with `inventory_items` to only return books that have items in the user's library.

---

### C8 · `LIMIT` and `OFFSET` injected directly into raw SQL without bounds validation

**File:** `server/routers.ts` line 1156  
**Code:** `` LIMIT ${input.limit} OFFSET ${input.offset} ``  
**Impact:** `input.limit` and `input.offset` are validated as `z.number()` but have no `.min()` or `.max()` constraints. A client can send `limit: 999999` to dump the entire catalog in one request, or `limit: -1` which may cause a MySQL error.  
**Fix:** Add `.min(1).max(500)` to `limit` and `.min(0)` to `offset` in the input schema.

---

### C9 · `imageBase64` inputs have no size limit — DoS vector

**File:** `server/routers.ts` lines 243, 259, 309  
**Procedures:** `catalog.extractIsbnFromImage`, `catalog.extractDepositoLegal`, `catalog.extractCoverFromImage`  
**Impact:** A client can send a 50 MB base64 string (the body parser limit), causing the server to allocate a large buffer and make an expensive LLM call, consuming API quota and memory.  
**Fix:** Add `.max(5_000_000)` (5 MB base64 ≈ 3.75 MB image) to `imageBase64` string validation.

---

### C10 · `recordSale` (inventory router) is not wrapped in a database transaction

**File:** `server/routers.ts` line 1360  
**Impact:** If `createSalesTransaction` succeeds but `updateInventoryItem` fails (network blip, DB timeout), the item remains AVAILABLE but a sales transaction exists for it. The item can be sold again, creating phantom revenue.  
**Fix:** Wrap both operations in a Drizzle transaction: `await db.transaction(async (tx) => { ... })`.

---

### C11 · `addQuantity` creates N items with N sequential DB round-trips — no transaction

**File:** `server/routers.ts` line 1300  
**Impact:** If the loop fails halfway (e.g. after creating 3 of 10 items), 3 orphaned items exist with no way to know the operation was partial.  
**Fix:** Use a single `db.insert(inventoryItems).values([...])` batch insert inside a transaction.

---

## HIGH — Architecture & Code Quality

### H1 · `routers.ts` is 2,860 lines — violates the 150-line guideline

**Impact:** Impossible to navigate, test, or review. All procedures are in one file, making merge conflicts inevitable and onboarding very slow.  
**Fix:** Split into feature routers: `server/routers/catalog.ts`, `server/routers/inventory.ts`, `server/routers/sales.ts`, `server/routers/batch.ts`, `server/routers/settings.ts`, `server/routers/exports.ts`.

---

### H2 · `db.ts` is 1,106 lines with raw SQL mixed with Drizzle ORM

**Impact:** Two different query styles (Drizzle ORM + raw `pool.execute()`) make the code hard to maintain and test. Raw SQL bypasses Drizzle's type safety.  
**Fix:** Split into `server/db/catalog.ts`, `server/db/inventory.ts`, `server/db/sales.ts`. Migrate raw SQL queries to Drizzle where possible (the `getGroupedByIsbn` query is legitimately complex and can stay as raw SQL, but should be isolated in its own file).

---

### H3 · `Inventory.tsx` is a dead file (not routed) — `InventoryFinal.tsx` is the active page

**File:** `client/src/pages/Inventory.tsx` (not imported in `App.tsx`)  
**Impact:** Dead code confuses contributors. Any bug fixes applied to `Inventory.tsx` will never reach production.  
**Fix:** Delete `Inventory.tsx`. Rename `InventoryFinal.tsx` to `Inventory.tsx`.

---

### H4 · `importSalesChannelsFromCsv` uses naive `split(',')` — breaks on quoted fields

**File:** `server/routers.ts` line 1791  
**Impact:** If a sales channel name contains a comma (e.g. `"Amazon, Spain"`), the CSV row is parsed incorrectly, corrupting the channel assignment.  
**Fix:** Use the same `parseCSV` function already defined in `importCatalogFromCsv` (line 1521). Extract it to a shared utility `server/utils/csv.ts`.

---

### H5 · `locationLog` table has no index on `libraryId`

**File:** `drizzle/schema.ts` line 121  
**Impact:** The `cleanupDatabase` procedure does `DELETE FROM location_log WHERE libraryId = ?` — a full table scan on a potentially large table.  
**Fix:** Add `libraryIdx: index("idx_location_log_library").on(table.libraryId)` to the `locationLog` table definition and run `pnpm db:push`.

---

### H6 · `salesTransactions.libraryId` is nullable — breaks tenant isolation

**File:** `drizzle/schema.ts` line 136  
**Impact:** `libraryId: int("libraryId")` — nullable means old transactions have no library association. The `cleanupDatabase` delete `WHERE libraryId = ?` will skip them.  
**Fix:** Make `libraryId` `notNull()` and backfill existing rows. Add a migration.

---

### H7 · CSV import does not normalize ISBNs with hyphens before DB insert

**File:** `server/routers.ts` line 1629  
**Impact:** If the CSV contains `978-84-204-3283-0` (hyphenated), the `isbn.length > 13` check passes (length is 18) and the row is **skipped** with an error. But if the CSV contains `9788420432830` (no hyphens, length 13), it works. Inconsistent behavior depending on CSV source.  
**Fix:** After stripping quotes, also strip hyphens and spaces: `isbn = isbn.replace(/[-\s]/g, '')`. Then validate length === 13.

---

### H8 · `getGroupedByIsbn` uses `GROUP_CONCAT` with default 1024-byte limit

**File:** `server/routers.ts` line 1135  
**Impact:** If a book has many inventory items, `GROUP_CONCAT(DISTINCT CASE WHEN ii.status = 'AVAILABLE' THEN ii.uuid END ...)` can silently truncate at 1024 bytes (about 28 UUIDs). The `availableItemUuids` list will be incomplete, causing the UI to show fewer items than actually exist.  
**Fix:** Add `SET SESSION group_concat_max_len = 65536` before the query, or use a subquery approach.

---

## MEDIUM — UX & Operational

### M1 · CSV import errors are returned but not persisted — lost on page refresh

**Impact:** If an import has 50 errors, the user must re-run the import to see them again. There is no audit trail of import failures.  
**Fix:** Save import results (created, updated, skipped, errors) to a new `import_log` table with `libraryId`, `timestamp`, `filename`, and `results` (JSON).

---

### M2 · `cleanupDatabase` deletes data without a confirmation step or soft-delete

**Impact:** One misclick permanently deletes all inventory data with no recovery path.  
**Fix:** Add a 30-second "undo window" using a soft-delete approach: set `deletedAt` timestamp, run a scheduled job to hard-delete after 30 seconds. Or at minimum, require the user to type the library name to confirm.

---

### M3 · `exportToIberlibro` and `exportToTodocoleccion` use `limit: 10000` — no pagination

**File:** `server/routers.ts` lines 2009, 2210  
**Impact:** A library with 10,000+ items will hit memory limits and timeout.  
**Fix:** Stream the export in chunks of 500 items and write to a temporary file, then return a download URL.

---

### M4 · `bulkEnrichMetadata` has no rate limiting or progress feedback

**File:** `server/routers.ts` line 620  
**Impact:** For a library with 500 books, this fires 500 sequential LLM/API calls, taking 5-10 minutes and potentially hitting API rate limits with no feedback to the user.  
**Fix:** Add a `concurrency` limit (process 5 at a time), persist progress to a `job_status` table, and return a job ID that the frontend polls.

---

### M5 · `synopsis` field in `catalog_masters` is `text` but rendered as raw HTML in the description card

**File:** `client/src/pages/InventoryFinal.tsx` (synopsis display)  
**Impact:** The triage result card shows raw HTML tags (`<b>Un nuevo nombre...</b><br><br>`) because synopsis from the ISBNdb API contains HTML. This is visible in the user's own screenshot.  
**Fix:** Strip HTML tags from synopsis on import: `synopsis.replace(/<[^>]*>/g, ' ').trim()`. Or render with `dangerouslySetInnerHTML` (acceptable here since it's API data, not user input).

---

## LOW — Refactor & Cleanup

### L1 · `InventoryFinal.tsx` is 1,222 lines — should be split into components

**Fix:** Extract `BookCard`, `BookTableRow`, `SaleRecordModal`, `EditBookModal`, `FilterPanel` into `client/src/components/inventory/`.

---

### L2 · `Triage.tsx` has inline `QuickCatalogModal` — should be a separate file

**Fix:** Move `QuickCatalogModal` to `client/src/components/QuickCatalogModal.tsx`.

---

### L3 · `CargaMasiva.tsx` has three separate upload sections with duplicated file-picker logic

**Fix:** Extract a reusable `CsvUploader` component that accepts `onUpload: (csvData: string) => void`.

---

### L4 · `addQuantity` loop creates items one by one — N DB round-trips

**File:** `server/routers.ts` line 1309  
**Fix:** Use `db.insert(inventoryItems).values(itemsArray)` batch insert.

---

### L5 · No vitest tests for any inventory, catalog, or sales procedures

**Current state:** Only `auth.logout.test.ts` exists.  
**Fix:** Add tests for: `inventory.recordSale` (happy path + item-not-found + wrong-library), `batch.cleanupDatabase` (only deletes own library data), `catalog.updateBook` (ownership check), `importCatalogFromCsv` (ISBN normalization, duplicate handling).

---

## Implementation Priority Order

| Priority | Issue | Effort | Risk |
|----------|-------|--------|------|
| 1 | C5 — Delete duplicate `sales.recordSale` | 5 min | Critical |
| 2 | C1/C2 — Scope `settings.get/update` to libraryAdmin | 15 min | Critical |
| 3 | C3 — Scope `catalog.updateBook` to libraryAdmin | 5 min | High |
| 4 | C4 — Scope `enrichMetadata/bulkEnrich` to libraryAdmin | 5 min | High |
| 5 | C6 — Add libraryId check to `batchUpdateInventoryItems` | 30 min | Critical |
| 6 | C8 — Add `.min(1).max(500)` to limit/offset inputs | 10 min | Medium |
| 7 | C9 — Add `.max(5_000_000)` to imageBase64 inputs | 10 min | Medium |
| 8 | C10 — Wrap `recordSale` in DB transaction | 30 min | High |
| 9 | H5 — Add index on `locationLog.libraryId` | 10 min | Medium |
| 10 | H7 — Normalize hyphens in CSV ISBN import | 10 min | High |
| 11 | M5 — Strip HTML from synopsis on import | 15 min | Low |
| 12 | H4 — Use `parseCSV` in `importSalesChannelsFromCsv` | 20 min | Medium |
| 13 | H8 — Set `group_concat_max_len` before inventory query | 10 min | Medium |
| 14 | H1/H2 — Split `routers.ts` and `db.ts` into feature files | 4h | Low |
| 15 | H3 — Delete dead `Inventory.tsx` | 5 min | Low |
| 16 | L5 — Add vitest tests for critical procedures | 3h | High |

---

*Total estimated effort for items 1–13 (critical + high): ~3 hours*  
*Total estimated effort for items 14–16 (refactor + tests): ~8 hours*
