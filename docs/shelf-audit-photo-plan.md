# Shelf Audit — Photo-Scan Batch AI Step: Implementation Plan

**Date:** 2026-04-17  
**Status:** Ready for implementation  
**Scope:** Complete the missing photo-scan (Job 2) and reconciliation dashboard (Job 3) in `ShelfAudit.tsx`, plus fix the Dashboard card active-session state.

---

## 1. Problem Statement

The `analyzeShelfPhoto` backend procedure is fully implemented and tested. The frontend `ShelfAudit.tsx` is missing:

1. **Photo step** — No UI to photograph the shelf and call `analyzeShelfPhoto`.
2. **Reconciliation dashboard** — No 4-tab view (Confirmados / Conflictos / No reconocidos / No encontrados) computed from `photoAnalysisResult`.
3. **Auto-transition** — After photo analysis, should auto-move to reconciliation without a button.
4. **Dashboard card** — Does not query `getActiveAuditSession` to show "Auditoría en curso: 01A" with [Continuar].

---

## 2. What NOT to change (Karpathy constraint)

- `analyzeShelfPhoto` procedure — already correct, do NOT touch.
- `BarcodeScanner.tsx` — reuse as-is.
- `IsbnImageUpload.tsx` — hardwired to `extractIsbnFromImage`; do NOT modify. Build a new inline photo capture section instead.
- All other procedures (`initiateShelfAudit`, `addManualScanResult`, `resolveLocationConflict`, `completeShelfAudit`, `getActiveAuditSession`) — already correct, do NOT touch.
- `shelfAudit.test.ts` — add 1 test for `analyzeShelfPhoto`; do NOT modify existing 12 tests.

---

## 3. Tasks (MECE, ordered)

### Task A — `ShelfPhotoCapture` inline component in ShelfAudit.tsx

**File:** `client/src/pages/ShelfAudit.tsx`  
**What:** Add a new `ShelfPhotoCapture` sub-component (defined inside the same file, not a separate file — it's only used here). It:
- Renders a file input + camera button (same UX pattern as `IsbnImageUpload` but calls `shelfAudit.analyzeShelfPhoto`)
- Accepts `sessionId: string` and `onAnalyzed: (results: ShelfPhotoResult[]) => void`
- Shows loading state: "Analizando estantería..."
- On success: calls `onAnalyzed(results)` — parent auto-transitions to reconciliation

**Verifiable success:** User can select a photo file → loading spinner appears → `analyzeShelfPhoto` mutation fires with correct `sessionId` and `imageBase64`.

---

### Task B — Refactor `ScanStep` into a 4-step wizard: `start → photo → reconcile → complete`

**File:** `client/src/pages/ShelfAudit.tsx`  
**What:** Replace the current 3-step flow (`initiate → scan → complete`) with a 4-step flow:

```
'initiate' → 'photo' → 'reconcile' → 'complete'
```

- `'initiate'` — existing `InitiateStep` (unchanged)
- `'photo'` — new `PhotoStep` component using `ShelfPhotoCapture` from Task A
  - Shows `IsbnImageUpload`-style UI with label "Fotografiar todos los lomos del estante"
  - After analysis completes → auto-sets step to `'reconcile'`
  - "Saltar foto" link → also advances to `'reconcile'` (for shelves where photo is impractical)
- `'reconcile'` — new `ReconcileStep` component with 4 tabs (Task C)
- `'complete'` — existing `CompleteStep` (unchanged)

**Verifiable success:** Step indicator shows 4 steps. After photo analysis, step auto-advances to reconcile without user pressing a button.

---

### Task C — `ReconcileStep` with 4 tabs

**File:** `client/src/pages/ShelfAudit.tsx`  
**What:** New `ReconcileStep` component that:

1. Derives 4 lists from session data:
   - **Confirmados** — `session.confirmedItemUuids` (items confirmed via photo match OR manual scan)
   - **Conflictos** — `session.conflictItems` (items with `resolution === null`)
   - **No reconocidos** — books in `photoAnalysisResult` where `matchedItemUuid === null` and not yet manually scanned or skipped
   - **No encontrados** — `session.expectedItemUuids` that are NOT in `confirmedItemUuids` AND NOT in `conflictItems`

2. Renders `<Tabs>` with 4 `<TabsContent>` panels:
   - ✅ Confirmados (N) — list of confirmed item UUIDs (show UUID or title if available)
   - ⚠️ Conflictos (N) — `ConflictCard` per pending conflict (reuse existing `ConflictCard`)
   - ❓ No reconocidos (N) — list of unmatched photo results + `BarcodeScanner` for manual scan
   - ❌ No encontrados (N) — list of expected-but-absent item UUIDs

3. Progress indicator: "35/47 libros verificados"

4. [Finalizar auditoría de 01A] button:
   - Disabled until `allConflictsResolved && allUnrecognizedHandled`
   - `allConflictsResolved` = `conflicts.every(c => c.resolution !== null)`
   - `allUnrecognizedHandled` = `unrecognized.every(u => u.skipped || u.matchedItemUuid !== null)`

5. Status warning badge: `{item.status !== 'AVAILABLE' && <Badge>⚠️ {item.status}</Badge>}`

**Verifiable success:** After photo analysis with 3 matched books out of 5 expected → Confirmados tab shows 3, No encontrados tab shows 2.

---

### Task D — Fix Dashboard card to show active session state

**File:** `client/src/pages/Dashboard.tsx`  
**What:**
- Add `const { data: activeSession } = trpc.shelfAudit.getActiveAuditSession.useQuery()`
- If `activeSession`: show "Auditoría en curso: **01A**" + [Continuar auditoría] button
- If no session: show [Iniciar auditoría] button (existing behavior)

**Verifiable success:** Start an audit → navigate to Dashboard → card shows "Auditoría en curso: 01A" with [Continuar].

---

### Task E — Add `analyzeShelfPhoto` test to `shelfAudit.test.ts`

**File:** `server/shelfAudit.test.ts`  
**What:** Add 1 test:
```
it('analyzeShelfPhoto — appends Gemini response to photoAnalysisResult')
```
- Mock `storagePut` → returns `{ url: 'https://s3.example.com/photo.jpg' }`
- Mock `invokeLLM` → returns `{ choices: [{ message: { content: '{"books":[{"title":"El Quijote","author":"Cervantes","isbn":null,"confidence":0.9}]}' } }] }`
- Mock `db.select` for the `allItems` query → returns `[{ uuid: 'item-uuid-1', isbn13: '9780000000001', title: 'El Quijote', author: 'Cervantes' }]`
- Mock `db.select` for the session fetch → returns session with empty `photoAnalysisResult`
- Assert: result has 1 item with `matchedItemUuid: 'item-uuid-1'`

**Verifiable success:** `pnpm test server/shelfAudit.test.ts` passes with 13 tests.

---

## 4. Definition of Done

| # | Check | Verification |
|---|-------|-------------|
| A | Photo step renders `ShelfPhotoCapture` | File input visible on `/auditoria` after initiating session |
| B | 4-step wizard flow | Step indicator shows 4 steps; photo → reconcile auto-transition |
| C | 4-tab reconciliation dashboard | All 4 tabs visible with correct counts |
| D | Dashboard card shows active session | Start audit → Dashboard shows "Auditoría en curso: 01A" |
| E | `analyzeShelfPhoto` test passes | `pnpm test server/shelfAudit.test.ts` → 13 passing |
| F | `pnpm build` green | 0 TypeScript errors |
| G | All 300+ existing tests still pass | `pnpm test` → no regressions |

---

## 5. Implementation Order

Execute in this order to minimize rework:
1. Task E (test first — TDD)
2. Task A (ShelfPhotoCapture component)
3. Task B (4-step wizard refactor)
4. Task C (ReconcileStep with 4 tabs)
5. Task D (Dashboard card fix)
6. TypeScript check + full test run
