# PostHog Analytics Integration — Design Spec

**Date:** 2026-04-23  
**Status:** Approved  
**Author:** Manus (brainstorming session with user)

---

## 1. Goal

Integrate PostHog analytics into Alexandria OS to capture both product behavior (UI interactions, funnels, session data) and business metrics (books cataloged, sales recorded, audits completed) in a single analytics pipeline.

---

## 2. Architecture

### Dual-SDK Hybrid Approach

| Layer | SDK | Responsibility |
|---|---|---|
| **Client** | `posthog-js` (browser) | Page views, UI clicks, form interactions, search/filter usage, triage decisions |
| **Server** | `posthog-node` (Node.js) | Business events: catalog, sales, audits, exports, user lifecycle |

**User identification:** Manus OpenID (`ctx.user.openId`) is used as the PostHog distinct ID. This enables per-user cohort analysis, retention tracking, and cross-session identity.

**Privacy:** Users can opt out via Settings → Analytics toggle. Opt-out state is stored in `users.analyticsOptOut` (DB column) AND `localStorage` (for immediate client-side effect without a round-trip). On app load, the client reads both sources and disables PostHog if either is `true`.

---

## 3. Database Changes

### Migration 0015 — Add `analyticsOptOut` to `users`

```sql
ALTER TABLE `users` ADD `analyticsOptOut` boolean DEFAULT false NOT NULL;
```

**Schema change in `drizzle/schema.ts`:**
```ts
analyticsOptOut: boolean("analyticsOptOut").default(false).notNull(),
```

---

## 4. Environment Variables

| Variable | Side | Value |
|---|---|---|
| `VITE_POSTHOG_KEY` | Client (public) | `phc_vj4jVXKa9HnPC9cxmaiJs8BtJijgNq34tpJdhGdB8HuC` |
| `VITE_POSTHOG_HOST` | Client (public) | `https://us.posthog.com` |
| `POSTHOG_API_KEY` | Server (secret) | same project token |
| `POSTHOG_HOST` | Server | `https://us.posthog.com` |

---

## 5. New Files

### `client/src/lib/posthog.ts`
Initializes PostHog JS SDK. Exports:
- `initPostHog(user: User | null)` — called once on app load; identifies user if not opted out
- `trackEvent(name: string, props?: Record<string, unknown>)` — safe wrapper that checks opt-out before calling `posthog.capture()`
- `setOptOut(value: boolean)` — updates localStorage and calls `posthog.opt_out_capturing()` / `posthog.opt_in_capturing()`

### `client/src/hooks/useAnalytics.ts`
Thin React hook wrapping `trackEvent`. Provides:
- `track(name, props?)` — calls `trackEvent` with current user context already injected
- Used throughout pages for event tracking

### `server/_core/posthog.ts`
Initializes PostHog Node SDK. Exports:
- `serverTrack(distinctId: string, event: string, props?: Record<string, unknown>)` — checks `analyticsOptOut` from DB before sending; no-ops if opted out
- `shutdownPostHog()` — flushes queue on server shutdown

---

## 6. Event Taxonomy

### Client-Side Events (~25 events)

#### Navigation / Page Views
| Event | Properties |
|---|---|
| `page_view` | `path`, `libraryId` |

#### Triage
| Event | Properties |
|---|---|
| `triage_isbn_scanned` | `method: 'barcode' \| 'manual' \| 'ai_photo'` |
| `triage_decision` | `decision: 'accept' \| 'donate' \| 'recycle'`, `isbn`, `hasExistingCatalog` |
| `triage_search_query` | `query`, `resultCount` |

#### Inventory
| Event | Properties |
|---|---|
| `inventory_search` | `query`, `filters: string[]`, `resultCount` |
| `inventory_filter_applied` | `filterType: 'status' \| 'condition' \| 'location' \| 'channel'`, `value` |
| `inventory_item_edited` | `fields: string[]` |
| `inventory_location_moved` | `from`, `to` |

#### Catalog
| Event | Properties |
|---|---|
| `catalog_search` | `query`, `resultCount` |
| `catalog_enrich_clicked` | `isbn` |

#### Shelf Audit
| Event | Properties |
|---|---|
| `audit_started` | `locationCode` |
| `audit_photo_taken` | — |
| `audit_manual_scan` | — |
| `audit_completed` | `confirmedCount`, `conflictCount`, `notFoundCount` |
| `audit_history_viewed` | — |

#### Exports / Batch
| Event | Properties |
|---|---|
| `export_initiated` | `type: 'csv' \| 'casadellibro' \| 'ebay' \| 'vinted'` |
| `batch_operation_applied` | `operation`, `itemCount` |
| `csv_import_started` | `rowCount` |

#### Settings
| Event | Properties |
|---|---|
| `settings_analytics_toggled` | `optOut: boolean` |
| `settings_isbndb_key_saved` | — |

---

### Server-Side Events (~20 events)

#### User Lifecycle
| Event | Properties |
|---|---|
| `user_signed_in` | `loginMethod` |
| `library_created` | `libraryId` |
| `library_member_added` | `role` |

#### Triage / Catalog
| Event | Properties |
|---|---|
| `book_cataloged` | `isbn`, `condition`, `decision`, `libraryId` |
| `catalog_master_created` | `isbn`, `source: 'manual' \| 'isbndb' \| 'google_books'` |
| `catalog_enriched` | `isbn`, `fieldsUpdated: string[]` |
| `catalog_bulk_imported` | `rowCount`, `successCount`, `errorCount`, `libraryId` |

#### Inventory
| Event | Properties |
|---|---|
| `inventory_item_created` | `isbn`, `condition`, `libraryId` |
| `inventory_item_sold` | `channel`, `netProfit`, `daysInInventory`, `libraryId` |
| `inventory_batch_updated` | `operation`, `itemCount`, `libraryId` |

#### Shelf Audit
| Event | Properties |
|---|---|
| `audit_session_initiated` | `locationCode`, `expectedCount`, `libraryId` |
| `audit_photo_analyzed` | `recognizedCount`, `libraryId` |
| `audit_session_completed` | `confirmedCount`, `conflictCount`, `notFoundCount`, `photoReconciled`, `libraryId` |

#### Exports
| Event | Properties |
|---|---|
| `export_generated` | `format`, `rowCount`, `libraryId` |
| `price_history_recorded` | `isbn`, `channel`, `libraryId` |

---

## 7. Settings UI Change

**File:** `client/src/pages/Configuracion.tsx`

Add a new "Analytics" section with:
- Toggle: "Compartir datos de uso" (Share usage data)
- Description: "Ayuda a mejorar Alexandria compartiendo datos anónimos sobre cómo usas la aplicación."
- Calls `settings.updateAnalyticsOptOut` mutation on toggle
- Reads current state from `trpc.settings.getAnalyticsOptOut.useQuery()`

---

## 8. tRPC Procedures

Two new procedures in `settings` router:
- `settings.getAnalyticsOptOut` — returns `{ optOut: boolean }` for current user
- `settings.updateAnalyticsOptOut` — sets `users.analyticsOptOut`, updates localStorage via client callback

---

## 9. TDD Approach

Each phase writes failing tests first:

1. **Infrastructure tests:** `server/posthog.test.ts` — `serverTrack` no-ops when opted out, sends event when opted in
2. **Client tests:** `server/posthog.settings.test.ts` — `getAnalyticsOptOut` returns correct value, `updateAnalyticsOptOut` persists to DB
3. **Business event tests:** Per-procedure tests asserting `serverTrack` is called with correct event name and properties when a business action occurs (using vi.mock for PostHog)
4. **Layout tests:** `server/posthog.layout.test.ts` — Settings page has analytics toggle, opt-out state is reflected

---

## 10. Implementation Phases

| Phase | Scope | Verify |
|---|---|---|
| 1 | DB migration + env vars + PostHog wrappers (client + server) | `pnpm db:push` succeeds; `serverTrack` no-ops when opted out |
| 2 | Settings UI: `getAnalyticsOptOut` + `updateAnalyticsOptOut` + Configuracion.tsx toggle | Toggle persists to DB; opt-out disables tracking |
| 3 | Client-side event tracking (page views + key UI events) | Events appear in PostHog dashboard |
| 4 | Server-side business event tracking (catalog, sales, audits, exports) | Business events appear in PostHog dashboard |
| 5 | Final verification + cleanup | All tests pass, TypeScript clean, no console errors |

---

## 11. Non-Goals

- No custom PostHog dashboards or funnels are created as part of this spec (PostHog UI configuration is out of scope)
- No A/B testing or feature flags (PostHog feature flags are out of scope)
- No retroactive event backfill for historical data

---

## 12. Success Criteria

- [ ] All ~45 events tracked (client + server)
- [ ] User opt-out persists across sessions (DB + localStorage)
- [ ] Events visible in PostHog dashboard within 5 minutes of user action
- [ ] All tests pass (TDD: tests written first, then implementation)
- [ ] No performance regression (PostHog SDK non-blocking)
- [ ] TypeScript clean, 0 console errors
- [ ] `pnpm db:push` succeeds with migration 0015
