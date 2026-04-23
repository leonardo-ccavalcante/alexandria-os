# PostHog Analytics Integration — Implementation Plan

**Date:** 2026-04-23  
**Spec:** `docs/superpowers/specs/2026-04-23-posthog-analytics-design.md`  
**Approach:** TDD (Red → Green → Refactor), Karpathy surgical changes

---

## Phase 1: Infrastructure (DB + packages + wrappers)

### Task 1.1 — Install PostHog packages
```bash
pnpm add posthog-node posthog-js
```
Verify: `package.json` has both packages.

### Task 1.2 — Add `analyticsOptOut` column to schema + migration
- Edit `drizzle/schema.ts`: add `analyticsOptOut: boolean("analyticsOptOut").default(false).notNull()` to `users` table
- Run `pnpm db:push` → migration 0015 applied
- Verify: `SHOW COLUMNS FROM users` shows `analyticsOptOut`

### Task 1.3 — TDD: Write failing tests for `serverTrack`
- Write `server/posthog.test.ts`:
  - `serverTrack` no-ops when user has `analyticsOptOut = true`
  - `serverTrack` calls PostHog when `analyticsOptOut = false`
  - `serverTrack` no-ops when PostHog key not configured
- Run tests → RED (module doesn't exist yet)

### Task 1.4 — Implement `server/_core/posthog.ts`
- Create minimal `serverTrack(distinctId, event, props)` function
- Uses `posthog-node` client, checks `analyticsOptOut` via DB lookup
- Lazy initialization (no-op if `POSTHOG_API_KEY` not set)
- Run tests → GREEN

### Task 1.5 — Set environment variables
- `VITE_POSTHOG_KEY` = `phc_vj4jVXKa9HnPC9cxmaiJs8BtJijgNq34tpJdhGdB8HuC`
- `VITE_POSTHOG_HOST` = `https://us.posthog.com`
- `POSTHOG_API_KEY` = same token (server-side secret)
- `POSTHOG_HOST` = `https://us.posthog.com`

### Task 1.6 — Implement `client/src/lib/posthog.ts`
- Initialize PostHog JS SDK
- `initPostHog(user)` — identifies user, checks opt-out from localStorage
- `trackEvent(name, props?)` — safe wrapper checking opt-out
- `setOptOut(value)` — updates localStorage + PostHog opt-in/out

---

## Phase 2: Settings UI (opt-out toggle)

### Task 2.1 — TDD: Write failing tests for analytics opt-out procedures
- Write `server/posthog.settings.test.ts`:
  - `settings.getAnalyticsOptOut` returns `{ optOut: false }` by default
  - `settings.updateAnalyticsOptOut` persists `true` to DB
  - `settings.updateAnalyticsOptOut` persists `false` to DB
- Run tests → RED

### Task 2.2 — Add procedures to settings router
- Add `getAnalyticsOptOut: protectedProcedure` → reads `users.analyticsOptOut`
- Add `updateAnalyticsOptOut: protectedProcedure` → writes `users.analyticsOptOut`
- Run tests → GREEN

### Task 2.3 — Add Analytics toggle to Configuracion.tsx
- Add "Privacidad y Analítica" section with toggle switch
- Reads from `trpc.settings.getAnalyticsOptOut.useQuery()`
- On toggle: calls `updateAnalyticsOptOut` mutation + `setOptOut()` from `posthog.ts`
- Verify: toggle persists across page reload

---

## Phase 3: Client-side event tracking

### Task 3.1 — TDD: Write layout tests for client-side tracking
- Write `server/posthog.layout.test.ts`:
  - `client/src/lib/posthog.ts` exports `initPostHog`, `trackEvent`, `setOptOut`
  - `client/src/App.tsx` calls `initPostHog` on user auth state change
  - Configuracion.tsx has analytics toggle element
- Run tests → RED

### Task 3.2 — Wire `initPostHog` into App.tsx
- Call `initPostHog(user)` in App.tsx when auth state resolves
- Run layout tests → GREEN

### Task 3.3 — Add page view tracking
- Add `trackEvent('page_view', { path })` to main Router component using `useLocation` from wouter

### Task 3.4 — Add triage event tracking
- `triage_isbn_scanned` on scan submission (Triage.tsx)
- `triage_decision` on Accept/Donate/Recycle (Triage.tsx)
- `triage_search_query` on search (Triage.tsx)

### Task 3.5 — Add inventory + catalog event tracking
- `inventory_search` on search (InventoryFinal.tsx)
- `inventory_filter_applied` on filter change (InventoryFinal.tsx)
- `catalog_search` on search (Catalog.tsx)

### Task 3.6 — Add audit event tracking (client-side)
- `audit_started` on InitiateStep submit (ShelfAudit.tsx)
- `audit_photo_taken` on PhotoStep submit (ShelfAudit.tsx)
- `audit_completed` on CompleteStep (ShelfAudit.tsx)
- `audit_history_viewed` on AuditHistory page load

### Task 3.7 — Add export/batch event tracking (client-side)
- `export_initiated` on export button click (ExportarDatos.tsx)
- `batch_operation_applied` on batch submit (BatchOperations.tsx)

---

## Phase 4: Server-side business event tracking

### Task 4.1 — TDD: Write failing tests for server-side business events
- Write `server/posthog.events.test.ts`:
  - `book_cataloged` event fired when `triage.scanAndDecide` called with `decision: 'accept'`
  - `inventory_item_sold` event fired when `sales.recordSale` called
  - `audit_session_completed` event fired when `shelfAudit.completeShelfAudit` called
  - `export_generated` event fired when `export.generateCsv` called
  - Events NOT fired when user has `analyticsOptOut = true`
- Run tests → RED (serverTrack not yet called in procedures)

### Task 4.2 — Add business events to triage procedures
- `book_cataloged` in `triage.scanAndDecide` (when decision = 'accept')
- `catalog_master_created` in `catalog.createBook` (new catalog entry)
- `catalog_bulk_imported` in `catalog.importCatalogFromCsv`

### Task 4.3 — Add business events to sales + inventory procedures
- `inventory_item_sold` in `sales.recordSale`
- `inventory_item_created` in `catalog.createInventoryItem`
- `inventory_batch_updated` in `inventory.batchUpdateInventoryItems`

### Task 4.4 — Add business events to audit procedures
- `audit_session_initiated` in `shelfAudit.initiateShelfAudit`
- `audit_photo_analyzed` in `shelfAudit.analyzeShelfPhoto`
- `audit_session_completed` in `shelfAudit.completeShelfAudit`

### Task 4.5 — Add business events to export procedures
- `export_generated` in export procedures (ExportarDatos)
- `catalog_enriched` in `catalog.enrichMetadata`

### Task 4.6 — Add user lifecycle events
- `user_signed_in` in auth flow (server/_core/auth handler)
- `library_created` in `library.createLibrary`
- `library_member_added` in `library.addMember`

### Task 4.7 — Run all business event tests → GREEN

---

## Phase 5: Final verification

### Task 5.1 — Run full test suite
```bash
npx vitest run
```
All tests pass (including pre-existing 350).

### Task 5.2 — TypeScript check
```bash
npx tsc --noEmit
```
0 errors.

### Task 5.3 — Manual PostHog verification
- Log in to Alexandria, perform a triage scan, complete an audit
- Verify events appear in PostHog dashboard within 5 minutes

### Task 5.4 — Save checkpoint + push GitHub

---

## Success Criteria

- [ ] `pnpm db:push` succeeds with migration 0015 (`analyticsOptOut` column)
- [ ] `serverTrack` no-ops when opted out, sends when opted in
- [ ] Analytics toggle in Configuracion.tsx persists to DB
- [ ] ~45 events tracked (client + server)
- [ ] All tests pass (TDD: tests written first)
- [ ] TypeScript clean
- [ ] Events visible in PostHog dashboard
