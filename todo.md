# Alexandria OS - Project TODO

## Phase 1: Database Schema
- [x] Create catalog_masters table (ISBN, bibliographic data, pricing)
- [x] Create inventory_items table (physical copies, status, location)
- [x] Create sales_transactions table (sales log for analytics)
- [x] Create system_settings table (business rules, thresholds)
- [x] Add database indexes for performance
- [x] Set up database enums for status, condition, category

## Phase 2: Backend API (tRPC Procedures)
- [x] Implement triage procedures (ISBN lookup, price check, profit calculation)
- [x] Implement cataloging procedures (create inventory item, calculate suggested price)
- [x] Implement inventory procedures (search, filter, update location, update price)
- [x] Implement batch operations procedures (CSV upload, CSV export, bulk location update)
- [x] Implement sales procedures (mark as sold, record transaction)
- [x] Implement dashboard procedures (KPIs, analytics by author/publisher/category/location)
- [x] Implement system settings procedures (get/update thresholds)

## Phase 3: Triage & Scan Workflow
- [x] Build barcode scanner interface with html5-qrcode
- [x] Implement ISBN validation and cleaning
- [x] Integrate Google Books API for book data lookup
- [x] Implement profit calculation logic (market price - estimated fees)
- [x] Build decision UI (ACCEPT/DONATE/RECYCLE with color coding)
- [x] Add audio feedback for decisions (success/warning/error sounds)
- [ ] Handle edge cases (no price data, API failures)

## Phase 4: Item Cataloging & Pricing
- [x] Build cataloging form (condition, location, notes)
- [x] Implement auto-suggested pricing based on condition)
- [x] Add location code validation (format: 02A)
- [x] Implement price modifier system (COMO_NUEVO: 1.0, BUENO: 0.85, ACEPTABLE: 0.60)
- [x] Add manual price override capability
- [x] Generate and display UUID for physical sticker label
- [x] Save inventory item to database

## Phase 5: Inventory Management
- [x] Build inventory list view with pagination
- [x] Implement multi-filter system (status, condition, location, date range)
- [x] Add full-text search (title, author, ISBN)
- [ ] Build item detail view with edit capabilities
- [x] Implement location update (individual)
- [x] Implement price update (individual)
- [ ] Add status change workflow (AVAILABLE → LISTED → SOLD)
- [x] Build sales recording interface

## Phase 6: Batch Operations
- [x] Build CSV upload interface with drag-and-drop
- [x] Implement CSV validation (format, data types, business rules)
- [x] Add batch update logic (location, price, status, notes)
- [x] Build CSV export with filters
- [x] Add downloadable CSV template
- [ ] Implement bulk location update UI
- [x] Add batch operation result summary

## Phase 7: Dashboard & Analytics
- [x] Build main KPI cards (total inventory, available, listed, sold)
- [x] Add revenue metrics (total revenue, average profit, profit margin)
- [ ] Implement inventory velocity chart (items in/out over time)
- [x] Build sales by channel breakdown
- [x] Add top performing books table
- [ ] Implement analytics by author (top authors, revenue)
- [ ] Implement analytics by publisher (top publishers, revenue)
- [ ] Implement analytics by category (distribution, revenue)
- [ ] Implement analytics by location (utilization, density)
- [ ] Add date range filters for all analytics

## Phase 8: UX Polish & Guidelines
- [ ] Implement responsive design (mobile-first)
- [ ] Add loading states and skeletons
- [ ] Implement toast notifications for all actions
- [ ] Add keyboard shortcuts for common actions
- [ ] Implement error boundaries and error handling
- [ ] Add empty states for all lists
- [ ] Optimize performance (debouncing, memoization)
- [ ] Add accessibility features (ARIA labels, focus management)
- [ ] Implement dark/light theme support
- [ ] Add confirmation dialogs for destructive actions

## Phase 9: Testing & Validation
- [ ] Write vitest tests for triage logic
- [ ] Write vitest tests for pricing calculations
- [ ] Write vitest tests for batch operations
- [ ] Write vitest tests for dashboard analytics
- [ ] Test CSV import/export edge cases
- [ ] Test location code validation
- [ ] Test profit calculation accuracy
- [ ] Test search and filter performance
- [ ] Validate all database constraints
- [ ] Test authentication and authorization

## Phase 10: Documentation & Deployment
- [ ] Create user guide for warehouse operators
- [ ] Document system settings and thresholds
- [ ] Add inline help tooltips
- [ ] Create checkpoint for deployment
- [ ] Verify all features working in production

## Bug Fixes
- [x] Fix nested anchor tag error in navigation (App.tsx)
- [x] Fix nested anchor tag error in home page cards (Home.tsx)

## Data Migration & Import
- [x] Analyze CSV structure and map to Alexandria schema
- [x] Identify data quality issues (missing ISBNs, invalid formats, etc.)
- [x] Create data cleaning and normalization logic
- [x] Build migration script to import catalog masters
- [x] Build migration script to import inventory items
- [x] Add validation to prevent duplicate entries
- [x] Handle missing or malformed data gracefully
- [x] Create import summary report
- [ ] Add data validation procedures to backend
- [x] Test with sample data before full import

## Advanced Migration Business Logic (No Synthetic Data)
- [x] Create ISBN validation (checksum verification)
- [x] Implement duplicate detection by exact ISBN match
- [x] Create data quality reporting (what's missing, not fabricated)
- [x] Implement location code validation (format checking only)
- [x] Create author name normalization (clean existing format)
- [x] Build publisher name cleaning (trim, standardize case)
- [x] Add year validation (range checking)
- [x] Create condition grade mapping from description text)
- [x] Implement batch processing with transaction rollback
- [x] Add migration progress tracking
- [x] Create post-migration data quality report
- [x] Handle books without ISBN (skip or separate table)
- [x] Validate all data before insert (fail gracefully)

## Category Taxonomy Update
- [x] Parse complete category taxonomy CSV (3 levels + materia)
- [x] Update database schema to support 3-level categories)
- [x] Create category mapping from old data to new taxonomy
- [ ] Build intelligent category inference using LLM
- [ ] Update migration script with new category logic
- [ ] Re-migrate all 3,419 records with correct categories
- [ ] Verify category distribution matches business logic
- [ ] Update frontend to display 3-level categories

## Enhanced Inventory Page
- [x] Add backend procedure to get inventory grouped by ISBN with counts
- [x] Add backend procedure to increase/decrease inventory quantity
- [x] Add backend procedure to get zero-inventory catalog books
- [x] Add advanced search supporting ISBN, author, publisher, year, category
- [x] Build card view with expandable book details
- [x] Build table view for compact display
- [x] Add view toggle (card/table)
- [x] Show quantity per ISBN with location breakdown
- [x] Add quantity increase/decrease controls
- [x] Display zero-inventory books (catalog only)
- [x] Add book detail modal/expansion
- [x] Test all search and filter combinations

## Item Detail & Status Management
- [x] Build item detail modal showing all item information
- [x] Add edit capabilities for location, price, condition, notes
- [x] Implement status change workflow (AVAILABLE → LISTED → SOLD)
- [x] Add status history tracking
- [x] Build status change confirmation dialogs

## Bulk Operations Enhancement
- [x] Build bulk location update UI with multi-select
- [x] Create CSV template generator with all required fields
- [x] Add CSV upload interface with validation
- [x] Show upload preview before committing
- [x] Add progress indicator for bulk operations

## Search Enhancements
- [ ] Add autocomplete for Editorial (publisher) search field
- [ ] Add autocomplete for Author search field
- [x] Backend procedure to get unique publishers list
- [x] Backend procedure to get unique authors list
- [ ] Implement dropdown suggestions with fuzzy matching

## Book Editing Features
- [ ] Add edit button for each book in inventory table
- [ ] Build comprehensive book edit modal with all CSV fields
- [ ] Include fields: title, author, publisher, year, ISBN, category, synopsis
- [ ] Add category selector with 3-level taxonomy dropdown
- [x] Backend procedure to update catalog master data
- [ ] Validate all fields before saving
- [ ] Show success/error feedback

## Table Sorting
- [ ] Add sorting icons to all table headers
- [ ] Implement A-Z sorting for text columns
- [ ] Implement Z-A sorting for text columns
- [ ] Implement ascending/descending for numeric columns
- [ ] Maintain sort state across page interactions

## Bug Fix - Route Mismatch
- [x] Fix inventory route mismatch (navigation uses /inventory but route is /inventario)

## Inline Location Editing
- [x] Make ubicación cell clickable for inline editing
- [x] Add input field that appears when ubicación is clicked
- [x] Save location on blur or Enter key
- [x] Show visual feedback during save
- [x] Write unit tests for batch location update (6 tests passing)
- [x] Verify location updates reflect in grouped inventory view

## Bug Fix - Inventory Display Issue
- [x] Fix inventory page not showing book cards/table
- [x] Debug why "Mostrando 49 libros" shows but no books display
- [x] Verify data is loading correctly from backend

## Pagination Enhancement
- [x] Add page size selector (10, 50, 100 items per page)
- [x] Implement pagination controls (Previous, Next, page numbers)
- [x] Show total count: "Mostrando X-Y de Z libros"
- [x] Persist page size selection in state
- [x] Show filtered count when filters are active
- [ ] Add "Ir a página" input for quick navigation

## Sales Channel Multi-Select
- [ ] Add sales channel field to inventory_items table (JSON array)
- [ ] Create sales channel enum/list: Wallapop, Vinted, Todo Colección, Sitio web, Iberlibro, Amazon, Ebay, Casa del Libro, Fnac
- [ ] Build multi-select dropdown for sales channels
- [ ] Allow selecting multiple channels per item
- [ ] Update backend procedure to save sales channels
- [ ] Show sales channels in inventory table view
- [ ] Add filter by sales channel
- [ ] Display channel badges/tags in item cards

## Inventory Filters Enhancement
- [x] Add filter button to hide books without UBICACIÓN (location is null/empty)
- [x] Add filter button to hide books without CANTIDAD (quantity = 0)
- [x] Make filters toggleable with checkbox or button
- [x] Update UI to show active filters (filtered count display)
- [x] Persist filter state during pagination

## Claude Code Optimization Implementation (Production-Ready)
- [ ] Push database schema changes with new indexes (pnpm db:push)
- [ ] Replace getGroupedByIsbn with optimized single SQL query
- [ ] Remove duplicate inventory components (Inventory.tsx, InventoryNew.tsx, InventoryEnhanced.tsx)
- [ ] Rename InventoryFinal.tsx to Inventory.tsx
- [ ] Update App.tsx routing to use new Inventory.tsx
- [ ] Test optimized query with full 2,297 book dataset
- [ ] Verify performance improvement (target: <1 second load time)
- [ ] Write unit tests for optimized query
- [ ] Save checkpoint with all optimizations

## Performance Optimization (Documented for Future Implementation)
- [x] Identify N+1 query problem in getGroupedByIsbn procedure
- [x] Document root cause and performance impact (10-30 second load times)
- [x] Design optimized SQL query using JOIN + GROUP_CONCAT
- [x] Add database indexes for performance (title, author, publisher, status, locationCode)
- [x] Document implementation challenges with Drizzle ORM
- [x] Create comprehensive optimization plan with 3 implementation options
- [x] Write PERFORMANCE_OPTIMIZATION_PLAN.md with migration strategy
- [ ] Apply database indexes (run pnpm db:push)
- [ ] Implement optimized query (choose: database view, sql template, or raw connection)
- [ ] Write unit tests for optimized query
- [ ] Verify <1 second load time with 2,297+ books
- [ ] Create checkpoint with optimized version

**Note**: Current version works correctly with all features (pagination, filters, inline editing, sorting) but has slow performance with large datasets. See PERFORMANCE_OPTIMIZATION_PLAN.md for detailed implementation guide.
