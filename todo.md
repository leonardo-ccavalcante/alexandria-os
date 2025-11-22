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
- [x] Implement inventory velocity chart (items in/out over time)
- [x] Build sales by channel breakdown
- [x] Add top performing books table
- [x] Implement analytics by author (top authors, revenue)
- [x] Implement analytics by publisher (top publishers, revenue)
- [x] Implement analytics by category (distribution, revenue)
- [x] Implement analytics by location (utilization, density)
- [x] Add date range filters for all analytics
- [x] Create comprehensive dashboard UI with recharts visualizations
- [x] Add tabbed interface for analytics (Por Autor, Por Editorial, Por Categoría, Por Ubicación)
- [x] Implement bar charts, pie charts, and line charts for all analytics
- [x] Add detailed tables with metrics (total, available, sold, revenue, profit, avg price)
- [ ] Complete unit tests for analytics procedures (6/21 passing, SQL parameter issues to resolve)

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

## Sorting Fix Implementation
- [x] Update backend getGroupedByIsbn to accept sortField and sortDirection parameters
- [x] Implement dynamic ORDER BY clause in SQL query supporting all fields (title, author, publisher, isbn13, publicationYear, total, available, location)
- [x] Update frontend to pass sort parameters to backend query
- [x] Remove client-side sorting logic (keep filters only)
- [x] Reset to page 1 when sort changes
- [x] Test all column sorting (TÍTULO, AUTOR, ISBN, UBICACIÓN, DISPONIBLE, TOTAL)
- [x] Verify sorting persists across pagination

## Navigation Fix
- [x] Add /inventory route to App.tsx to fix 404 error when clicking Inventario from home page
- [x] Verify all navigation links work correctly

## Inventory Display Fixes
- [x] Fix filter logic - locations field is a string, not an array, causing all books to be hidden
- [x] Fix card view not displaying any books
- [x] Test filters work correctly with both table and card views
- [x] Verify "Ocultar libros sin ubicación" and "Ocultar libros sin cantidad disponible" filters work as expected

## Filter Bug Fix - "Ocultar sin ubicación"
- [x] Debug why "Ocultar libros sin ubicación" filter shows 0 results when combined with author filter
- [x] Check if filters are being applied on frontend (client-side) or backend (server-side)
- [x] Verify filter logic correctly handles locations array
- [x] Test filter combinations (author + location filter, publisher + location filter, etc.)
- [x] Ensure filters work correctly in both table and card views

## Sales Channel Multi-Select Implementation
- [x] Add salesChannels field to inventory_items table (JSON array)
- [x] Create sales channel enum/constants: Wallapop, Vinted, Todo Colección, Sitio web, Iberlibro, Amazon, Ebay, Casa del Libro, Fnac
- [x] Update backend getGroupedByIsbn to include sales channels in response
- [x] Add backend procedure to update sales channels for an inventory item
- [x] Build multi-select dropdown component for sales channels
- [ ] Integrate multi-select into inventory table inline editing (see SALES_CHANNEL_IMPLEMENTATION_GUIDE.md)
- [ ] Add sales channel badges/tags display in table and card views (see SALES_CHANNEL_IMPLEMENTATION_GUIDE.md)
- [ ] Implement filter by sales channel (show books listed on specific channels) (see SALES_CHANNEL_IMPLEMENTATION_GUIDE.md)
- [ ] Write unit tests for sales channel backend procedures
- [ ] Write unit tests for sales channel filtering logic
- [ ] Test multi-select UI with various combinations
- [ ] Verify sales channels persist correctly in database
- [ ] Test filter by channel works with other filters
- [ ] Conduct full QA and code review
- [x] Document sales channel feature in implementation guide

## Missing Pages Implementation
- [x] Add routes for /carga-masiva, /exportar, /configuracion in App.tsx
- [x] Create CargaMasiva.tsx page component
- [x] Create ExportarDatos.tsx page component  
- [x] Create Configuracion.tsx page component
- [x] Update Home.tsx to link to these pages

## Carga Masiva Features
- [ ] Add admin-only database cleanup button with confirmation dialog
- [ ] Create catalog bulk upload section with CSV template download
- [ ] Create sales channel batch upload section with CSV template download
- [ ] Add file validation and error handling
- [ ] Show upload progress and results
- [ ] Add backend procedures for bulk operations

## Sales Channel Frontend Integration (from guide)
- [ ] Add CANALES column to inventory table view
- [ ] Implement inline editing for sales channels in table
- [ ] Add sales channel badges display in table rows
- [ ] Add sales channel display in card view
- [ ] Add sales channel edit dialog for card view
- [ ] Add sales channel filter dropdown
- [ ] Update backend to support channel filtering
- [ ] Test all sales channel features work correctly

## QA and Testing
- [ ] Write unit tests for bulk upload procedures
- [ ] Write unit tests for database cleanup
- [ ] Test all new pages load correctly
- [ ] Test navigation between all pages works
- [ ] Test sales channel inline editing
- [ ] Test sales channel filtering
- [ ] Test admin-only features are protected
- [ ] Conduct full regression testing

## Bulk Upload Backend Implementation
- [x] Add cleanupDatabase procedure (admin-only) with confirmation
- [x] Add importCatalogFromCsv procedure with validation and error reporting
- [x] Add importSalesChannelsFromCsv procedure for batch channel updates
- [ ] Create CSV template generation for catalog import
- [ ] Create CSV template generation for sales channel import
- [ ] Add proper error handling and validation for CSV parsing
- [ ] Write unit tests for bulk upload procedures

## Dashboard Analytics Implementation
- [x] Add getDashboardKPIs procedure to aggregate inventory statistics
- [x] Calculate total inventory value (sum of listing prices)
- [x] Calculate books by sales channel distribution
- [x] Calculate profitability metrics (estimated profit per book)
- [x] Get top 10 best-selling books (by quantity sold)
- [x] Build Dashboard UI with KPI cards
- [x] Add interactive charts using recharts library
- [x] Add real-time data refresh
- [ ] Write unit tests for dashboard queries

## Bulk Upload UI Implementation (Current Task)
- [x] Implement file upload component with drag-and-drop for CSV files
- [x] Add CSV file validation (check file type, size, format)
- [x] Create CSV template download buttons for catalog and sales channel uploads
- [x] Build upload progress indicators and loading states
- [x] Implement result display with success/error counts
- [x] Show detailed error logs with row numbers and error messages
- [x] Add admin database cleanup confirmation dialog with role check
- [x] Implement safety warnings for destructive operations
- [ ] Test catalog CSV import with sample data
- [ ] Test sales channel batch upload with sample data
- [ ] Test admin cleanup with proper authorization
- [ ] Write unit tests for file upload validation
- [ ] Write unit tests for CSV parsing and error handling
- [ ] Verify all three bulk operations work end-to-end

## URGENT: Inventory Page Crash Fix
- [x] Investigate why inventory page shows 0 books when data exists
- [x] Check backend getGroupedByIsbn query for errors
- [x] Verify database connection and data integrity
- [x] Check browser console for JavaScript errors
- [x] Test with different filter combinations
- [x] Fix the root cause and verify data loads correctly (database was empty, created sample data)

## Sample Test Data Creation
- [x] Create TypeScript script to generate sample catalog data (20-30 books)
- [x] Create sample inventory items with various statuses (available, listed, sold)
- [x] Include different locations (01A, 02B, 03C, etc.)
- [x] Add sales channel data to demonstrate multi-select feature
- [x] Run script to populate database
- [x] Verify inventory page displays all data correctly

## Phase 7: Dashboard & Analytics (Current Task)
- [ ] Design backend analytics procedures for all metrics
- [ ] Implement inventory velocity chart (items added/sold over time with date grouping)
- [ ] Implement analytics by author (top authors by quantity, revenue, average price)
- [ ] Implement analytics by publisher (top publishers by quantity, revenue, average price)
- [ ] Implement analytics by category (distribution pie chart, revenue by category)
- [ ] Implement analytics by location (utilization percentage, items per location, density heatmap)
- [ ] Add date range filters for all analytics (last 7 days, 30 days, 90 days, year, all time, custom)
- [ ] Build interactive charts using recharts library (bar, line, pie, area charts)
- [ ] Add data export functionality for analytics (CSV, Excel)
- [ ] Implement real-time data refresh for dashboard
- [ ] Add loading states and error handling for all analytics
- [ ] Write unit tests for inventory velocity calculations
- [ ] Write unit tests for author/publisher/category/location analytics
- [ ] Test date range filters with various time periods
- [ ] Verify charts render correctly with sample data
- [ ] Test dashboard performance with large datasets

## AI-Powered ISBN Extraction from Images
- [x] Design backend procedure to extract ISBN from book cover images using vision AI
- [x] Implement image upload to S3 storage
- [x] Create AI vision prompt to identify ISBN from book cover photos
- [x] Handle both printed ISBN text and barcode formats
- [x] Add ISBN validation and cleaning after AI extraction
- [x] Build image upload UI component with drag-and-drop
- [x] Add camera capture option for mobile devices
- [x] Integrate AI extraction with existing triage workflow
- [x] Add loading states and progress indicators during AI processing
- [x] Implement error handling for failed extractions
- [x] Add visual feedback showing extracted ISBN before verification
- [ ] Test with various book cover images (clear, blurry, angled, poor lighting)
- [x] Test with different ISBN formats (ISBN-10, ISBN-13, with/without hyphens)
- [x] Write unit tests for AI ISBN extraction procedure (10/10 tests passing)
- [ ] Document AI ISBN extraction feature in user guide

## Triage-to-Inventory Workflow Connection
- [x] Analyze current Triage → Catalog → Inventory workflow
- [x] Identify friction points in manual navigation between pages
- [x] Enhance Catalog page to accept ISBN from URL query parameters
- [x] Pre-fill book data when navigating from Triage with ISBN (added book preview with cover, title, author)
- [x] Add "Quick Add to Inventory" button on Triage success screen (⚡ Catalogar Rápido)
- [x] Implement streamlined inventory creation flow after Triage acceptance (QuickCatalogModal component)
- [x] Add option to skip cataloging and go directly to inventory for accepted books (two-button approach)
- [x] Show success confirmation with link to view newly created inventory item (modal success screen)
- [x] Test complete workflow: Scan ISBN → AI extraction → Triage decision → Inventory creation
- [x] Write unit tests for Triage-to-Inventory connection (7/7 tests passing)
- [ ] Document streamlined workflow in user guide

## Phase 8: UX Polish & Guidelines (Current Task)
- [x] Audit all pages for responsive design issues
- [ ] Implement mobile-first responsive design (breakpoints: sm, md, lg, xl)
- [x] Add loading skeletons for all data-fetching components (LoadingSkeleton component created)
- [x] Implement toast notifications for all CRUD operations (already using sonner toasts)
- [x] Add toast notifications for success/error states (integrated in mutations)
- [x] Implement keyboard shortcuts hook (useKeyboardShortcut created)
- [ ] Add ARIA labels and roles for screen readers
- [ ] Implement focus management for modals and dialogs
- [x] Add empty states component (EmptyState component created with variants)
- [ ] Create error boundary component to catch React errors
- [x] Add confirmation dialogs component (ConfirmDialog created)
- [x] Implement debouncing for search inputs (useDebounce hook created)
- [ ] Add memoization for expensive computations
- [ ] Optimize re-renders with React.memo and useMemo
- [ ] Integrate UX components into Inventory page
- [ ] Integrate UX components into Dashboard page
- [ ] Integrate UX components into Triage page
- [ ] Integrate UX components into Catalog page
- [ ] Test responsive design on mobile, tablet, and desktop
- [ ] Test keyboard navigation throughout the app
- [ ] Verify accessibility with screen reader
- [ ] Write unit tests for new UX components

## Category Expansion and New Fields (Current Task)
- [x] Review all categories from CSV file (35+ top-level categories)
- [x] Update database schema category enum to include all categories (text fields support all categories)
- [x] Add new fields to catalog_masters table: pages (int), edition (varchar), language (varchar 2-char)
- [x] Add quantity field to CSV bulk upload (creates inventory items directly)
- [x] Update CSV import backend to handle new fields (pages, edition, language, quantity)
- [x] Update CSV template download to include new columns (Páginas, Edición, Idioma, Cantidad)
- [x] Update frontend bulk upload UI to show new column requirements
- [x] Update inventory display to show pages, edition, and language fields (edit dialog)
- [x] Update catalog form to include new fields
- [ ] Update triage workflow to display new fields when available
- [x] Run database migration (pnpm db:push)
- [x] Test CSV import with all new fields (9/9 tests passing)
- [x] Write unit tests for new field handling (newFields.test.ts)

## Add UBICACIÓN Column to Catalog CSV Import
- [x] Update backend CSV import procedure to handle UBICACIÓN column
- [x] Create inventory items automatically when UBICACIÓN is provided
- [x] Update CSV template to include UBICACIÓN column with example (e.g., "01A")
- [x] Update UI instructions to show UBICACIÓN as mandatory field
- [x] Test CSV import with location data
- [x] Write unit tests for location-based inventory creation (4/4 tests passing)
