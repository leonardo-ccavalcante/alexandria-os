# Shelf Audit — Reconcile Step Design

**Date:** 2026-04-17  
**Feature:** Photo Reconciliation Recatalogation  
**Status:** Approved for implementation

---

## 1. Problem Statement

After the AI analyses a shelf photo and returns a list of detected books, the operator has no way to act on that list. Specifically:

- There is no way to click on a detected book to see its details or find its inventory match.
- There is no bulk action to say "these are the books physically on this shelf — update the system accordingly."
- Books expected at this shelf but not confirmed during scanning are silently left for the MISSING flow, even when the photo proves they are not there and their location should be cleared.

---

## 2. Solution Overview

Add a **Reconcile step** (step 3 of 5) to the Shelf Audit wizard, between the Photo step and the Scan step. This step presents a full-page checklist of all books that need location reconciliation, grouped by action type. The operator reviews, unticks exceptions, and confirms. New books (not in inventory) are routed to the existing Triage flow with the shelf location pre-filled.

---

## 3. Wizard Step Changes

The wizard grows from 4 steps to 5:

| # | Step ID | Label | Icon | Condition |
|---|---|---|---|---|
| 1 | `initiate` | Iniciar | ClipboardList | Always |
| 2 | `photo` | Fotografiar | ImagePlus | Always |
| 3 | `reconcile` | **Reconciliar** | ListChecks | **New** |
| 4 | `scan` | Escanear | ScanLine | Always |
| 5 | `complete` | Completar | ClipboardCheck | Always |

**Navigation rules:**
- After photo analysis succeeds AND `photoAnalysisResult.length > 0`: advance to `reconcile`.
- After photo analysis succeeds AND `photoAnalysisResult.length === 0`: skip `reconcile`, advance to `scan`.
- "Saltar" link on the Reconcile step advances directly to `scan` without calling `applyPhotoReconciliation`.
- After `applyPhotoReconciliation` succeeds: advance to `scan`.
- Resuming a session where `photoReconciled === true`: Reconcile step shows read-only summary with "Continuar" button.

---

## 4. Backend: Schema Change

Add one column to `shelfAuditSessions`:

```ts
// drizzle/schema.ts
photoReconciled: boolean('photoReconciled').notNull().default(false),
```

Requires `pnpm db:push` after schema edit.

---

## 5. Backend: New tRPC Procedure

**Procedure:** `shelfAudit.applyPhotoReconciliation`  
**Type:** `libraryProcedure` (protected, library-scoped)

### Input

```ts
z.object({
  sessionId: z.string().uuid(),
  moves: z.array(z.string().uuid()),         // itemUuids to move to session.locationCode
  clearLocations: z.array(z.string().uuid()), // itemUuids to set locationCode = null
})
```

### Logic (in order)

1. Load session by `sessionId`; throw `NOT_FOUND` if missing or not `ACTIVE`.
2. For each UUID in `moves`:
   - `UPDATE inventory_items SET locationCode = session.locationCode WHERE uuid = ? AND libraryId = ?`
   - Insert into `locationLog`: `reason = "Shelf photo reconciliation — moved to {locationCode}"`
   - Append UUID to `session.confirmedItemUuids`
3. For each UUID in `clearLocations`:
   - `UPDATE inventory_items SET locationCode = NULL WHERE uuid = ? AND libraryId = ?`
   - Insert into `locationLog`: `reason = "Shelf photo reconciliation — location cleared (not found at {locationCode})"`
   - Status remains unchanged (AVAILABLE).
4. `UPDATE shelfAuditSessions SET confirmedItemUuids = [...], photoReconciled = true WHERE id = ?`
5. Return `{ moved: number, cleared: number }`.

### Constraints

- `moves` and `clearLocations` must not overlap (validated with `z.refine`).
- Empty arrays are valid (user ticked nothing — still marks `photoReconciled = true`).

---

## 6. Frontend: `ReconcileStep` Component

**File:** `client/src/pages/ShelfAudit.tsx` — new `ReconcileStep` function component.

### Props

```ts
{
  session: AuditSession;
  onConfirmed: () => void;   // advance to scan
  onSkip: () => void;        // skip to scan without applying
  onRefresh: () => void;
}
```

### Checklist Sections

The component derives three lists from `session` data:

**Section A — "Mover a esta ubicación"**  
Source: `photoAnalysisResult` entries where `matchedItemUuid !== null` AND the matched item's current `locationCode !== session.locationCode`.  
Each row shows: title, author, confidence badge, current location badge (e.g. "03B → 07A").  
Default: checkbox ticked.

**Section B — "Nuevo libro (requiere triage)"**  
Source: `photoAnalysisResult` entries where `matchedItemUuid === null` AND `confidence >= 0.5`.  
Each row shows: title, author, confidence badge, "NUEVO" badge.  
Default: checkbox ticked.  
On confirm: these UUIDs are excluded from `applyPhotoReconciliation`; after mutation succeeds, the frontend navigates to `/triage?locationCode={session.locationCode}` for each ticked new book (one at a time, in sequence).

**Section C — "Limpiar ubicación"**  
Source: `session.expectedItemUuids` filtered to exclude `session.confirmedItemUuids`.  
Each row shows: UUID prefix + catalog title/author if available (requires enriching `getActiveAuditSession` to join catalog data — see Section 7).  
Default: checkbox ticked.

### Row Interaction

Tapping a row body (not the checkbox) toggles an inline expansion showing: full title, author, ISBN, confidence (for photo rows), current location (for move rows), UUID (for clear rows).

### Section Controls

Each section header has a "Seleccionar todo / Deseleccionar todo" toggle.

### Footer

- **"Confirmar (N cambios)"** button — disabled when 0 checkboxes ticked. Calls `applyPhotoReconciliation` with `moves` and `clearLocations` derived from ticked rows in sections A and C. On success: if section B has ticked rows, navigate to Triage for first new book; otherwise call `onConfirmed()`.
- **"Saltar"** text link — calls `onSkip()` directly.

### Read-Only Mode

When `session.photoReconciled === true` (resumed session): render a static summary (N moved, N cleared) with a single "Continuar" button that calls `onConfirmed()`.

---

## 7. Frontend: `getActiveAuditSession` Enrichment

The `ReconcileStep` needs catalog title/author for items in Section C (expected-but-unconfirmed). The current `getActiveAuditSession` returns only UUIDs.

**Change:** Extend `getActiveAuditSession` to also return an `expectedItemDetails` array:

```ts
expectedItemDetails: Array<{
  uuid: string;
  title: string | null;
  author: string | null;
  isbn13: string;
  locationCode: string | null;  // current registered location (needed for Section A)
}>
```

This requires a JOIN of `inventoryItems` + `catalogMasters` on the `expectedItemUuids` list. The existing `AuditSession` type in the frontend must be extended accordingly.

---

## 8. Frontend: Triage Pre-filled Location

**File:** `client/src/pages/Triage.tsx`

Add support for `?locationCode=07A` query parameter. On mount, if the param is present and matches the location format regex (`/^[0-9]{2}[A-Z]$/`), pre-fill the location field in the cataloging form.

Implementation: read `new URLSearchParams(window.location.search).get('locationCode')` in a `useState` initializer.

---

## 9. Testing Plan

### Backend (Vitest)

| Test | Description |
|---|---|
| `applyPhotoReconciliation — moves items` | Given session with 2 moves, verify locationCode updated and locationLog entries created |
| `applyPhotoReconciliation — clears locations` | Given session with 2 clearLocations, verify locationCode = null, status unchanged |
| `applyPhotoReconciliation — marks photoReconciled` | After call, session.photoReconciled === true |
| `applyPhotoReconciliation — rejects overlapping moves/clearLocations` | Input with same UUID in both arrays → TRPC BAD_REQUEST |
| `applyPhotoReconciliation — empty arrays valid` | moves=[], clearLocations=[] → success, photoReconciled=true |
| `getActiveAuditSession — returns expectedItemDetails` | Session with 3 expected items → returns enriched array with title/author |

### Frontend (manual verification)

- Reconcile step appears after photo analysis with >0 results.
- Reconcile step is skipped when photo returns 0 results.
- All three sections render with correct data.
- Inline row expansion works on tap.
- "Confirmar" button calls mutation and advances to Scan.
- "Saltar" skips to Scan without mutation.
- New books navigate to Triage with `?locationCode` pre-filled.
- Resumed session with `photoReconciled=true` shows read-only summary.

---

## 10. Files Changed

| File | Change |
|---|---|
| `drizzle/schema.ts` | Add `photoReconciled` boolean column |
| `server/routers.ts` | Add `applyPhotoReconciliation` procedure; extend `getActiveAuditSession` |
| `shared/auditTypes.ts` | Add `ExpectedItemDetail` type |
| `client/src/pages/ShelfAudit.tsx` | Add `ReconcileStep` component; update `STEP_META`; update `AuditSession` type; update wizard navigation logic |
| `client/src/pages/Triage.tsx` | Add `?locationCode` query param support |
| `server/shelfAudit.test.ts` | Add 6 new tests |

---

## 11. Out of Scope

- Bulk photo re-analysis (taking a second photo during Reconcile step — already covered by "Saltar → back to Photo" pattern).
- Editing catalog master data (title, author) from the Reconcile step.
- Undo after `applyPhotoReconciliation` — locationLog provides audit trail.
