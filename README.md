# Alexandria OS — Donation Edition

> **A multi-tenant inventory management system for second-hand bookshops and donation-based book libraries, built on the Manus platform.**

Alexandria OS is a full-stack web application that helps a small team triage, catalogue, price, and sell donated books across multiple Spanish online marketplaces. It is designed for a single physical library with multiple staff members (members), where each member shares a common inventory under one tenant (library). The system supports multiple independent libraries on the same deployment, each fully isolated from one another.

---

## Table of Contents

1. [Project Context and Purpose](#1-project-context-and-purpose)
2. [Architecture Overview](#2-architecture-overview)
3. [Database Schema](#3-database-schema)
4. [Authentication and Multi-Tenancy](#4-authentication-and-multi-tenancy)
5. [Backend API Surface](#5-backend-api-surface)
6. [Frontend Pages and Navigation](#6-frontend-pages-and-navigation)
7. [External Integrations](#7-external-integrations)
8. [Key Design Decisions](#8-key-design-decisions)
9. [Test Suite](#9-test-suite)
10. [Environment Variables](#10-environment-variables)
11. [Development Workflow](#11-development-workflow)
12. [Known Limitations and Future Work](#12-known-limitations-and-future-work)

---

## 1. Project Context and Purpose

This system was built for a Spanish non-profit book donation operation. Volunteers receive donated books, scan their barcodes, and decide in seconds whether a book is worth listing for sale (ACCEPT), donating to another charity (DONATE), or recycling (RECYCLE). Accepted books are catalogued with a physical location code (e.g., `02A`), a condition grade, and a suggested listing price derived from live marketplace data.

The primary sales channels are Spanish second-hand platforms: **Iberlibro**, **Todocolección**, **Casa del Libro**, **eBay.es**, **Wallapop**, and **Vinted**. The system generates platform-specific CSV exports formatted to each marketplace's import specification.

**Core workflow:**

```
Donation arrives → Triage scan (ISBN barcode) → Price check (live marketplaces)
→ ACCEPT decision → Catalogue (condition + location + price) → UUID label printed
→ List on marketplace → Mark as SOLD → Record sale transaction
```

---

## 2. Architecture Overview

| Layer | Technology |
|---|---|
| Runtime | Node.js 22.13.0 + TypeScript (strict) |
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, wouter |
| Backend | Express 4, tRPC 11, Superjson |
| ORM | Drizzle ORM (mysql2 driver) |
| Database | MySQL 8.0 compatible (TiDB Serverless) |
| Auth | Manus OAuth 2.0 (session cookie, JWT-signed) |
| File Storage | AWS S3 (via Manus built-in storage helpers) |
| AI / LLM | Manus built-in LLM API (`invokeLLM`) |
| Hosting | Manus managed platform |
| Testing | Vitest (39 test files, 343 tests) |

**Key architectural principle:** All data access goes through tRPC procedures — there are no raw REST endpoints for feature logic. The tRPC router is the single contract between frontend and backend, providing end-to-end type safety without any shared contract files.

**File structure:**

```
client/src/
  pages/          ← Page-level React components
  components/     ← Reusable UI (shadcn/ui wrappers + custom)
  hooks/          ← Custom React hooks
  lib/trpc.ts     ← tRPC React client binding
  App.tsx         ← Route definitions and top-level nav
  index.css       ← Global theme (Tailwind CSS variables)
server/
  routers.ts      ← Main tRPC router (all procedures)
  routers/
    libraryRouter.ts  ← Library/membership/invitation procedures
  db.ts           ← Drizzle query helpers (inventory, catalog, analytics)
  libraryDb.ts    ← Drizzle query helpers (libraries, members, invitations)
  priceScraper.ts ← AI-powered marketplace price extraction
  isbndbIntegration.ts ← ISBNdb API fallback for book metadata
  auditLog.ts     ← Database activity logging helpers
  _core/          ← Framework plumbing (DO NOT EDIT)
    trpc.ts       ← Procedure factories incl. libraryProcedure middleware
    context.ts    ← Request context builder
    llm.ts        ← Manus LLM helper
drizzle/
  schema.ts       ← All table definitions and types
shared/
  const.ts        ← Shared constants (cookie name, error messages)
scripts/          ← One-time data migration scripts (not part of app)
```

---

## 3. Database Schema

All timestamps are stored as UTC. Column names use camelCase throughout (Drizzle convention).

### Core Tables

| Table | Purpose |
|---|---|
| `users` | OAuth identity (openId, name, email, role) |
| `catalog_masters` | Bibliographic master record per ISBN |
| `inventory_items` | Physical copy of a book (UUID, status, location, price) |
| `sales_transactions` | Completed sale records |
| `price_history` | Scraped marketplace prices per ISBN |
| `system_settings` | Key-value store for business rules (thresholds, API keys) |
| `export_history` | Audit log of every CSV export performed |
| `database_activity_log` | Row-level audit trail for insert/update/delete |

### Multi-Tenancy Tables

| Table | Purpose |
|---|---|
| `libraries` | A tenant (one physical library). Has an owner, name, and slug. |
| `library_members` | Many-to-many: user ↔ library, with role and join metadata |
| `library_invitations` | Time-limited UUID invite codes for joining a library |

### Inventory Item Status Lifecycle

```
INGESTION → AVAILABLE → LISTED → RESERVED → SOLD
                    ↘ REJECTED / DONATED / MISSING
```

### Condition Grades

| Grade | Multiplier | Meaning |
|---|---|---|
| `COMO_NUEVO` | 1.00 | Like new, no visible wear |
| `BUENO` | 0.85 | Good condition, minor wear |
| `ACEPTABLE` | 0.60 | Readable but clearly used |

The suggested listing price is `marketMedianPrice × conditionMultiplier`, rounded to the nearest €0.50.

### Pre-1970 Books (No ISBN)

Books published before the ISBN system was introduced use a synthetic primary key in the format `DL-{hash}` derived from the Depósito Legal number (Spanish legal deposit system). The actual Depósito Legal string is stored in the `depositoLegal` column.

### Category Taxonomy

Three-level category hierarchy (`categoryLevel1`, `categoryLevel2`, `categoryLevel3`) plus a `materia` code (Spanish book trade standard). The full taxonomy is stored in `category-taxonomy.json` at the project root and was loaded during the initial data migration.

---

## 4. Authentication and Multi-Tenancy

### Authentication Flow

1. User clicks "Login" → redirected to Manus OAuth portal.
2. OAuth callback hits `/api/oauth/callback` → session cookie set (JWT-signed, HttpOnly, Secure).
3. Every tRPC request reads the cookie via `server/_core/context.ts` → `ctx.user` is populated.
4. The first user to log in becomes the library **owner** (auto-provisioned via `OWNER_OPEN_ID` env var).

### Procedure Access Tiers

| Procedure type | Who can call it |
|---|---|
| `publicProcedure` | Anyone (unauthenticated) |
| `protectedProcedure` | Any authenticated user |
| `adminProcedure` | Platform admin (user.role = 'admin') |
| `libraryProcedure` | Authenticated user who is a member of any library |
| `libraryAdminProcedure` | Authenticated user with role 'admin' or 'owner' in their library |

`libraryProcedure` and `libraryAdminProcedure` are defined in `server/_core/trpc.ts`. They call `getActiveLibraryForUser(userId)` on every request and inject `ctx.library` (which includes `memberRole`). They also fire-and-forget `updateMemberLastActivity()` to keep the activity audit log current without blocking the response.

### Library Membership Roles

| Role | Capabilities |
|---|---|
| `owner` | Full control; cannot be removed; created the library |
| `admin` | Manage members, create invitations, all exports, bulk operations |
| `member` | Read inventory, triage, catalogue, record sales |

### Invitation Flow

An admin creates an invitation link (UUID code, 1–30 day expiry, optional email restriction, optional role). The link is shared via the one-click copy button or WhatsApp/email. When a new user logs in and visits `/join?code=<uuid>`, the system validates the code and adds them to the library automatically. The `joinedVia` field records whether they joined via `invitation`, were added `manual`ly by an admin, or are the library `owner`.

### Non-Member Landing Page

Authenticated users who belong to no library are redirected to `NoLibraryAccess.tsx` instead of seeing a blank screen. This page lets them paste an invitation link or code directly, validates it in real time (showing the library name and role they will receive), and completes the join flow without leaving the page.

---

## 5. Backend API Surface

All procedures live in `server/routers.ts` except library management which is in `server/routers/libraryRouter.ts`.

### `auth` router
- `me` — returns current user or null
- `logout` — clears session cookie

### `triage` router
- `getBookByIsbn` — ISBN lookup (Google Books → ISBNdb fallback → LLM extraction)
- `checkIsbn` — validate ISBN-13 checksum
- `fetchBookData` — fetch full book data with price check
- `extractIsbnFromImage` — AI vision extraction from barcode/cover photo
- `extractDepositoLegal` — AI extraction of Depósito Legal from colophon image
- `extractBookMetadata` — AI extraction of title/author from cover image

### `catalog` router
- `calculatePrice` — compute suggested price from market data + condition
- `createItem` — create inventory item (libraryProcedure)
- `getPublishers` / `getAuthors` / `getLocations` — autocomplete lists
- `enrichMetadata` — enrich a single book from ISBNdb/Google Books
- `bulkEnrichMetadata` — batch enrichment with title+author fallback for placeholder ISBNs
- `updateBook` — update catalog master fields

### `inventory` router
- `search` — full-text + multi-filter search (libraryProcedure)
- `getGroupedByIsbn` — grouped view with quantity counts (optimised JOIN+GROUP BY)
- `getByUuid` — single item detail
- `updateLocation` / `updatePrice` / `updateStatus` — individual item mutations
- `increaseQuantity` / `decreaseQuantity` / `addQuantity` / `removeQuantity` — quantity management
- `recordSale` — mark item as sold, record transaction
- `updateSalesChannels` — update which platforms a copy is listed on
- `getBooksWithoutIsbn` — catalog-only books with no inventory

### `batch` router
- `updateFromCsv` — bulk update location/price/status from CSV (libraryAdminProcedure)
- `importCatalogFromCsv` — import new books from CSV (libraryProcedure)
- `importSalesChannelsFromCsv` — update sales channels from CSV
- `exportToCsv` — general CSV export (libraryAdminProcedure)
- `exportToIberlibro` / `exportToTodocoleccion` / `exportToCasaDelLibro` / `exportToEbay` — platform-specific exports (libraryAdminProcedure)
- `cleanupDatabase` — remove orphaned records

### `dashboard` router
- `getKPIs` — total/available/listed/sold counts + revenue metrics
- `getSalesByChannel` — breakdown by sales platform
- `getTopBooks` — top performing titles by revenue
- `getSalesTransactions` — paginated transaction history
- `getInventoryVelocity` — items in/out over time (line chart data)
- `getAnalyticsByAuthor` / `ByPublisher` / `ByCategory` / `ByLocation` — segmented analytics

### `settings` router
- `getAll` / `get` / `update` — system settings key-value store
- `validateIsbndbKey` — test an ISBNdb API key

### `sales` router
- `recordSale` — record a sale transaction
- `getActiveChannels` — list of configured sales channels

### `library` router (in `server/routers/libraryRouter.ts`)
- `create` — create a new library (protectedProcedure)
- `getMyLibrary` — get current user's active library with role
- `update` — update library name/description (admin)
- `getMembers` — list members with roles (admin)
- `removeMember` — remove a member (admin, cannot remove owner)
- `updateMemberRole` — change a member's role (owner only)
- `addMemberDirectly` — add a registered user without invitation (admin)
- `searchUsers` — find users by name/email to add directly (admin)
- `getMemberActivityLog` — audit trail: join method, who added, join date, last activity (admin)
- `invitations.list` — active invitations (admin)
- `invitations.create` — generate invitation link (admin)
- `invitations.accept` — join via invitation code (protectedProcedure)
- `invitations.revoke` — cancel an invitation (admin)

---

## 6. Frontend Pages and Navigation

The app uses a custom top navigation bar (not DashboardLayout) because it is a semi-public operational tool used on tablets and phones in a warehouse environment. Navigation is horizontal with a mobile hamburger menu.

| Route | Page | Access |
|---|---|---|
| `/` | `Home.tsx` | Public landing page |
| `/triage` | `Triage.tsx` | Library member |
| `/inventario` | `Inventory.tsx` | Library member |
| `/dashboard` | `Dashboard.tsx` | Library member |
| `/lotes` | `CargaMasiva.tsx` | Library member |
| `/exportar` | `ExportarDatos.tsx` | Library member |
| `/config` | `Configuracion.tsx` | Library member |
| `/biblioteca` | `LibraryManagement.tsx` | Library admin/owner |
| `/join` | `JoinLibrary.tsx` | Authenticated (no library required) |
| `(no library)` | `NoLibraryAccess.tsx` | Authenticated users with no library |

**`NoLibraryAccess.tsx`** is shown automatically (not via a route) when the router detects that an authenticated user has no library membership. It renders instead of the full navigation shell.

### Key Custom Components

| Component | Purpose |
|---|---|
| `BarcodeScanner.tsx` | html5-qrcode wrapper for ISBN scanning |
| `SalesChannelMultiSelect.tsx` | Multi-select for Wallapop/Vinted/Amazon/etc. |
| `IsbnImageUpload.tsx` | Upload cover image for AI ISBN extraction |
| `CoverColophonCapture.tsx` | Capture colophon page for Depósito Legal extraction |
| `DepositoLegalCapture.tsx` | Dedicated Depósito Legal capture flow |
| `SaleRecordModal.tsx` | Record a completed sale with channel and price |
| `ConfirmDialog.tsx` | Reusable destructive-action confirmation |
| `LoadingSkeleton.tsx` | Skeleton loader for async content |
| `EmptyState.tsx` | Consistent empty state with CTA |

---

## 7. External Integrations

### Google Books API (free tier, no key required)
Used as the primary source for book metadata during triage. Queried by ISBN-13. Returns title, author, publisher, year, cover image, and synopsis. No API key required for basic lookups.

### ISBNdb API (requires user-provided key)
Fallback when Google Books returns no result. Configured via the Settings page (stored in `system_settings` table under key `isbndb_api_key`). The key is validated before saving. Also supports title+author search for books with placeholder ISBNs (`0000...`).

### Manus LLM (`invokeLLM`)
Used for three purposes:
1. **AI price scraping** (`priceScraper.ts`) — given an ISBN and title, the LLM simulates browsing Spanish marketplaces and returns structured price data (min, median, max per marketplace).
2. **ISBN extraction from images** — given a barcode or cover photo, extracts the ISBN-13.
3. **Depósito Legal extraction** — given a colophon page photo, extracts the Depósito Legal number for pre-1970 books.

All LLM calls are server-side only. The API key is injected automatically by the Manus platform.

### Manus S3 Storage (`storagePut` / `storageGet`)
Used for storing uploaded cover images and CSV exports. Helpers are in `server/storage.ts`. The S3 bucket is public-read; URLs are stored in the database.

---

## 8. Key Design Decisions

### Why tRPC instead of REST?
End-to-end type safety without code generation. The `AppRouter` type is imported directly by the frontend client (`client/src/lib/trpc.ts`), so any backend change that breaks a frontend call is caught at compile time. This was critical given the large number of procedures (~60+).

### Why Drizzle ORM instead of Prisma?
Drizzle produces lighter bundles, supports raw SQL escapes via the `sql` template tag when needed, and has first-class MySQL/TiDB support. The schema file (`drizzle/schema.ts`) is the single source of truth for both the database and TypeScript types.

### Why camelCase column names?
The Manus platform uses TiDB Serverless (MySQL-compatible). Drizzle maps camelCase TypeScript fields to camelCase MySQL columns directly. This avoids a snake_case ↔ camelCase mapping layer and keeps the codebase consistent.

### Tenant isolation strategy
Every `inventory_items`, `sales_transactions`, `export_history`, and `database_activity_log` row carries a `libraryId` foreign key. The `libraryProcedure` middleware injects `ctx.library` (which includes `ctx.library.id`) into every protected request. All query helpers in `db.ts` accept `libraryId` as a required parameter and include it in every WHERE clause. There is no global "show all libraries" view — every query is scoped.

### N+1 query fix (inventory grouped view)
The original implementation loaded all catalog masters then issued a separate query per book to count inventory items — O(N) queries for N books. This was replaced with a single `JOIN + GROUP BY` query using Drizzle's `sql` template tag. With 2,300+ books this reduced load time from 10–30 seconds to under 1 second.

### Price suggestion algorithm
```
suggestedPrice = marketMedianPrice × conditionMultiplier
suggestedPrice = round(suggestedPrice / 0.50) × 0.50  // nearest €0.50
suggestedPrice = max(suggestedPrice, minimumPrice)      // floor from settings
```
The minimum price and condition multipliers are configurable in the Settings page.

### Pre-1970 books without ISBN
Books published before 1970 predate the ISBN system. These are identified by their Spanish Depósito Legal number (e.g., `M-1234-1965`). The system uses a synthetic ISBN-like key `DL-{sha256(depositoLegal).slice(0,9)}` as the `isbn13` primary key in `catalog_masters`. The AI extracts the Depósito Legal from a photo of the colophon page.

### Activity tracking (non-blocking)
`updateMemberLastActivity(userId, libraryId)` is called inside `libraryProcedure` and `libraryAdminProcedure` as a fire-and-forget operation (`.catch(() => {})`). This means the activity timestamp is updated on every authenticated library request without adding latency to the response.

### Export format decisions
Each marketplace has a different CSV format. The export procedures hard-code the column order and naming conventions required by each platform's bulk upload tool. The formats were derived from the official import templates of each marketplace as of early 2026.

---

## 9. Test Suite

343 tests across 39 test files, all passing. Tests use Vitest with `singleFork: true` (prevents database race conditions) and `restoreMocks: true` (prevents mock leakage between files).

| Category | Files | Tests |
|---|---|---|
| Library / multi-tenancy | `library.test.ts`, `access-control.test.ts` | 44 |
| Inventory management | `inventory.test.ts`, `item-management.test.ts`, `batch-location.test.ts` | 38 |
| Analytics / dashboard | `analytics.test.ts`, `dashboard.*.test.ts` | 46 |
| Exports | `iberlibro.export.test.ts`, `todocoleccion.export.test.ts`, `casadellibro.export.test.ts`, `ebay.export.test.ts`, `csv.export.test.ts`, `csv.price.export.test.ts`, `export.datefilter.test.ts` | 58 |
| Triage / ISBN | `triage.test.ts`, `triage.isbn-less.test.ts`, `triageToInventory.test.ts`, `isbn-utils.test.ts`, `isbndb.test.ts`, `aiIsbnExtraction.test.ts` | 54 |
| Catalog / enrichment | `catalog.test.ts`, `catalog.createItem.test.ts`, `catalog.enrichment.test.ts`, `catalog.import.test.ts`, `titleauthor.search.test.ts`, `author.search.test.ts` | 31 |
| Other | `auth.logout.test.ts`, `sales.test.ts`, `priceHistory.test.ts`, `priceScraper.test.ts`, `newFields.test.ts`, `duplicateDetection.test.ts`, `bulk-upload.test.ts`, `csv.import.test.ts`, `csvLocationImport.test.ts` | 72 |

Run all tests: `pnpm test`

---

## 10. Environment Variables

All environment variables are injected automatically by the Manus platform. Do not commit `.env` files.

| Variable | Side | Purpose |
|---|---|---|
| `DATABASE_URL` | Server | MySQL/TiDB connection string |
| `JWT_SECRET` | Server | Session cookie signing secret |
| `VITE_APP_ID` | Both | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Server | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | Client | Manus login portal URL |
| `OWNER_OPEN_ID` | Server | OpenID of the library owner (auto-promoted to admin) |
| `OWNER_NAME` | Server | Display name of the owner |
| `BUILT_IN_FORGE_API_KEY` | Server | Manus LLM + Storage API key (server-side) |
| `BUILT_IN_FORGE_API_URL` | Server | Manus built-in API base URL |
| `VITE_FRONTEND_FORGE_API_KEY` | Client | Manus API key for frontend use |
| `VITE_FRONTEND_FORGE_API_URL` | Client | Manus API URL for frontend use |
| `VITE_APP_TITLE` | Client | App title shown in UI |
| `VITE_APP_LOGO` | Client | App logo URL |
| `ISBNDB_API_KEY` | Server | ISBNdb API key (optional, user-configurable in Settings) |

Access server-side env via `import { ENV } from './server/_core/env'`. Access client-side env via `import.meta.env.VITE_*`.

---

## 11. Development Workflow

```bash
# Install dependencies
pnpm install

# Start dev server (frontend + backend, hot reload)
pnpm dev

# Push schema changes to database
pnpm db:push

# Run all tests
pnpm test

# Type-check without emitting
pnpm check
```

The dev server runs on port 3000. Vite proxies `/api/*` to the Express backend.

### Adding a new feature

1. Update `drizzle/schema.ts` if new tables or columns are needed, then run `pnpm db:push`.
2. Add query helpers to `server/db.ts` (or `server/libraryDb.ts` for library-scoped queries).
3. Add procedures to `server/routers.ts` (or a sub-router in `server/routers/`).
4. Build the UI in `client/src/pages/` using `trpc.*.useQuery` / `trpc.*.useMutation`.
5. Register the route in `client/src/App.tsx`.
6. Write tests in `server/*.test.ts`.

### Checkpoint and deploy

Checkpoints are managed by the Manus platform. To deploy:
1. Call `webdev_save_checkpoint` (or use the Manus agent).
2. Click the **Publish** button in the Manus Management UI.

To roll back: use `webdev_rollback_checkpoint` with the target version ID, or click **Rollback** on an older checkpoint in the Management UI.

---

## 12. Known Limitations and Future Work

The following items are tracked in `todo.md` and represent known gaps or planned improvements.

**Incomplete features:**
- Category inference via LLM (taxonomy exists, inference not wired)
- Autocomplete dropdowns for author and publisher search fields
- Inline book editing modal (backend procedure exists, UI not built)
- Table column sorting in the inventory view
- Dark/light theme toggle (ThemeProvider is ready, toggle UI not added)

**Known edge cases:**
- Books with no price data in any marketplace show a €0.00 suggested price; the operator must enter a price manually.
- The AI price scraper can return stale or hallucinated prices for obscure titles; always verify before listing.
- ISBNdb title+author search may return false positives for common titles; the enrichment flow shows a confirmation step.

**Scalability:**
- The current deployment handles ~3,000 books comfortably. Beyond ~50,000 items, the `getGroupedByIsbn` query may need cursor-based pagination instead of OFFSET-based pagination.
- The `priceScraper.ts` LLM calls are slow (3–8 seconds per book) and not parallelised. Bulk enrichment uses sequential processing with a progress indicator.

**Security:**
- The S3 bucket is public-read. File keys include a random suffix to prevent enumeration, but there is no signed URL expiry for stored files.
- The ISBNdb API key is stored in the `system_settings` table (not in environment variables) to allow the owner to update it via the UI without a redeployment.
