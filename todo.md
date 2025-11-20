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
