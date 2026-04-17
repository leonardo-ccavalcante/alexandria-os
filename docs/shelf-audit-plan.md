# Shelf Audit Implementation Plan

## Goal
Implement the full Shelf Audit feature as specified in `ALEXANDRIA_OS_SHELF_AUDIT.md`.
All 6 tRPC procedures, the DB schema, shared types, the ShelfAudit.tsx wizard page,
the Dashboard card, and 13+ Vitest tests — with 0 TypeScript errors and all existing
299 tests still passing.

---

## Constraints (Andrej Karpathy rules applied)

1. **No new abstractions** — inline the fuzzy-match logic in `analyzeShelfPhoto`; no
   separate utility function.
2. **No relational API** — `drizzle(url_string)` does not register schemas for
   `db.query.*`. Use `db.select().from()...` throughout.
3. **libraryId is `int`** — the spec says `varchar(36)` for `shelfAuditSessions.libraryId`
   but every other table uses `int`. Use `int` to stay consistent.
4. **startedBy is `int`** — `ctx.user.id` is an int; use `int` not `varchar(255)`.
5. **locationLog.reason needs expanding** — current `varchar(50)` is too short for
   `"Shelf audit completed — not found at 01A on 2026-04-17"` (56 chars). Expand to
   `varchar(100)`.
6. **IsbnImageUpload is NOT modified** — the spec says "reuse as-is". The ShelfAudit
   page will use a plain `<input type="file">` + base64 conversion for the photo step,
   since `IsbnImageUpload` has a fixed `onIsbnExtracted` prop (not `onCapture`).
7. **Procedures go in a `shelfAudit` sub-router** — the spec's frontend calls
   `trpc.getActiveAuditSession` (top-level) but that conflicts with the existing
   pattern of sub-routers. Use `trpc.shelfAudit.*` to match the pattern. Update
   frontend calls accordingly.
8. **Tests go in `server/shelfAudit.test.ts`** — the spec says
   `server/tests/shelfAudit.test.ts` but the existing pattern is flat in `server/`.
9. **No scope creep** — do not touch any existing procedure, component, or test file
   except: `schema.ts`, `routers.ts`, `Dashboard.tsx`, `App.tsx`,
   `DashboardLayout.tsx`.

---

## Success Criteria (Definition of Done)

- [ ] `pnpm db:push` succeeds — `shelfAuditSessions` table created
- [ ] `pnpm test` passes — 299 + 13 new = ≥312 tests passing, 0 failures
- [ ] `npx tsc --noEmit` — 0 TypeScript errors
- [ ] Dashboard card visible, navigates to `/shelf-audit`
- [ ] ShelfAudit wizard: start → photo → reconcile → complete flow works
- [ ] Auto-resume: existing ACTIVE session → wizard jumps to reconcile step
- [ ] All 6 procedures return correct shapes per spec

---

## Task 1 — Schema + Types (Phase A)

**Files changed:**
- `drizzle/schema.ts` — add `shelfAuditSessions` table
- `shared/auditTypes.ts` — new file with `ShelfPhotoResult` and `ConflictItem`

**Exact changes:**

### drizzle/schema.ts

Add to imports: `json` from `drizzle-orm/mysql-core`

Add after `exportHistory` table:

```typescript
export const shelfAuditSessions = mysqlTable('shelfAuditSessions', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  libraryId: int('libraryId').notNull(),           // int, consistent with all other tables
  locationCode: varchar('locationCode', { length: 10 }).notNull(),
  status: mysqlEnum('status', ['ACTIVE', 'COMPLETED', 'ABANDONED']).notNull().default('ACTIVE'),
  startedBy: int('startedBy').notNull(),            // int (ctx.user.id)
  startedAt: timestamp('startedAt').notNull().defaultNow(),
  completedAt: timestamp('completedAt'),
  expectedItemUuids: json('expectedItemUuids').$type<string[]>().notNull().default(sql`('[]')`),
  confirmedItemUuids: json('confirmedItemUuids').$type<string[]>().notNull().default(sql`('[]')`),
  conflictItems: json('conflictItems').$type<import('../shared/auditTypes').ConflictItem[]>().notNull().default(sql`('[]')`),
  photoAnalysisResult: json('photoAnalysisResult').$type<import('../shared/auditTypes').ShelfPhotoResult[] | null>(),
}, (table) => ({
  libraryStatusIdx: index('idx_audit_library_status').on(table.libraryId, table.status),
}));
export type ShelfAuditSession = typeof shelfAuditSessions.$inferSelect;
export type InsertShelfAuditSession = typeof shelfAuditSessions.$inferInsert;
```

Also expand `locationLog.reason` from `varchar(50)` to `varchar(100)`.

### shared/auditTypes.ts (new)

```typescript
export interface ShelfPhotoResult {
  title: string
  author: string
  isbn: string | null
  confidence: number
  matchedItemUuid: string | null
  matchedIsbn: string | null
}

export interface ConflictItem {
  uuid: string
  fromLocation: string
  resolution: 'moved' | 'kept' | 'skipped' | null
}
```

**After changes:** run `pnpm db:push`

**Verification:** `npx tsc --noEmit` passes; `pnpm db:push` succeeds.

---

## Task 2 — Backend Procedures (Phase B)

**File changed:** `server/routers.ts`

Add `shelfAudit` sub-router with 6 `libraryProcedure` procedures.
All procedures use `db.select().from()...` (NOT `db.query.*`).

### Imports to add in routers.ts

```typescript
import { shelfAuditSessions, ShelfAuditSession } from '../drizzle/schema';
import { ShelfPhotoResult, ConflictItem } from '../shared/auditTypes';
import { invokeLLM } from './_core/llm';
import { storagePut } from './storage';
import { inArray } from 'drizzle-orm';  // already imported
```

### Procedure 1: `shelfAudit.getActiveAuditSession`

```typescript
getActiveAuditSession: libraryProcedure
  .query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const [session] = await db
      .select()
      .from(shelfAuditSessions)
      .where(and(
        eq(shelfAuditSessions.libraryId, ctx.library.id),
        eq(shelfAuditSessions.status, 'ACTIVE'),
      ))
      .limit(1);
    return session ?? null;
  }),
```

### Procedure 2: `shelfAudit.initiateShelfAudit`

```typescript
initiateShelfAudit: libraryProcedure
  .input(z.object({
    locationCode: z.string().regex(/^[0-9]{2}[A-Z]$/, 'Formato inválido. Debe ser: 01A'),
  }))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    // Abandon any existing ACTIVE session for this library
    await db.update(shelfAuditSessions)
      .set({ status: 'ABANDONED' })
      .where(and(
        eq(shelfAuditSessions.libraryId, ctx.library.id),
        eq(shelfAuditSessions.status, 'ACTIVE'),
      ));
    // Snapshot items at this location
    const items = await db
      .select({ uuid: inventoryItems.uuid })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.libraryId, ctx.library.id),
        eq(inventoryItems.locationCode, input.locationCode),
      ));
    const id = crypto.randomUUID();
    await db.insert(shelfAuditSessions).values({
      id,
      libraryId: ctx.library.id,
      locationCode: input.locationCode,
      startedBy: ctx.user.id,
      expectedItemUuids: items.map(i => i.uuid),
      confirmedItemUuids: [],
      conflictItems: [],
    });
    const [session] = await db.select().from(shelfAuditSessions).where(eq(shelfAuditSessions.id, id)).limit(1);
    return session;
  }),
```

### Procedure 3: `shelfAudit.analyzeShelfPhoto`

```typescript
analyzeShelfPhoto: libraryProcedure
  .input(z.object({
    sessionId: z.string().uuid(),
    imageBase64: z.string().max(5_000_000),
  }))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    // Upload to S3
    const suffix = Math.random().toString(36).slice(7);
    const { url: imageUrl } = await storagePut(
      `audit-photos/${input.sessionId}/${Date.now()}-${suffix}.jpg`,
      Buffer.from(input.imageBase64, 'base64'),
      'image/jpeg',
    );
    // Call Gemini Vision
    const SHELF_ANALYSIS_PROMPT = `This is a photo of a library bookshelf.
Identify every visible book from its spine.
For each book return: { "title": string, "author": string, "isbn": string | null, "confidence": number }
where confidence is 0.0–1.0 (your certainty of correct identification).
Include EVERY book spine visible, even partially visible ones.
Return JSON: { "books": [ ... ] }`;
    const response = await invokeLLM({
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          { type: 'text', text: SHELF_ANALYSIS_PROMPT },
        ],
      }],
      response_format: { type: 'json_object' },
    });
    const raw = response.choices[0].message.content as string;
    const { books } = JSON.parse(raw) as {
      books: Array<{ title: string; author: string; isbn: string | null; confidence: number }>;
    };
    // Fetch all items with catalog data for fuzzy match
    const allItems = await db
      .select({
        uuid: inventoryItems.uuid,
        isbn13: inventoryItems.isbn13,
        title: catalogMasters.title,
        author: catalogMasters.author,
      })
      .from(inventoryItems)
      .innerJoin(catalogMasters, eq(inventoryItems.isbn13, catalogMasters.isbn13))
      .where(eq(inventoryItems.libraryId, ctx.library.id));
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
    const matched: ShelfPhotoResult[] = books.map(book => {
      if (book.confidence < 0.5) return { ...book, matchedItemUuid: null, matchedIsbn: null };
      const normTitle = normalize(book.title);
      const normAuthor = normalize(book.author);
      const hit = allItems.find(item => {
        const t = normalize(item.title ?? '');
        const a = normalize(item.author ?? '');
        return (t.includes(normTitle) || normTitle.includes(t)) &&
               (a.includes(normAuthor) || normAuthor.includes(a));
      });
      return { ...book, matchedItemUuid: hit?.uuid ?? null, matchedIsbn: hit?.isbn13 ?? null };
    });
    // Append to existing photoAnalysisResult
    const [session] = await db.select().from(shelfAuditSessions).where(eq(shelfAuditSessions.id, input.sessionId)).limit(1);
    const existing: ShelfPhotoResult[] = session?.photoAnalysisResult ?? [];
    await db.update(shelfAuditSessions)
      .set({ photoAnalysisResult: [...existing, ...matched] })
      .where(eq(shelfAuditSessions.id, input.sessionId));
    return matched;
  }),
```

### Procedure 4: `shelfAudit.resolveLocationConflict`

```typescript
resolveLocationConflict: libraryProcedure
  .input(z.object({
    sessionId: z.string().uuid(),
    itemUuid: z.string().uuid(),
    resolution: z.enum(['moved', 'kept', 'skipped']),
    targetLocation: z.string().regex(/^[0-9]{2}[A-Z]$/).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    if (input.resolution === 'moved' && input.targetLocation) {
      await db.update(inventoryItems)
        .set({ locationCode: input.targetLocation })
        .where(and(
          eq(inventoryItems.uuid, input.itemUuid),
          eq(inventoryItems.libraryId, ctx.library.id),
        ));
      await db.insert(locationLog).values({
        itemUuid: input.itemUuid,
        libraryId: ctx.library.id,
        toLocation: input.targetLocation,
        changedBy: ctx.user.id,
        reason: `Shelf audit — moved to ${input.targetLocation}`,
        changedAt: new Date(),
      });
    }
    const [session] = await db.select().from(shelfAuditSessions).where(eq(shelfAuditSessions.id, input.sessionId)).limit(1);
    if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
    const updatedConflicts: ConflictItem[] = (session.conflictItems as ConflictItem[]).map(c =>
      c.uuid === input.itemUuid ? { ...c, resolution: input.resolution } : c,
    );
    await db.update(shelfAuditSessions)
      .set({ conflictItems: updatedConflicts })
      .where(eq(shelfAuditSessions.id, input.sessionId));
  }),
```

### Procedure 5: `shelfAudit.addManualScanResult`

```typescript
addManualScanResult: libraryProcedure
  .input(z.object({
    sessionId: z.string().uuid(),
    isbn: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const [session] = await db.select().from(shelfAuditSessions).where(eq(shelfAuditSessions.id, input.sessionId)).limit(1);
    if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.isbn13, input.isbn),
        eq(inventoryItems.libraryId, ctx.library.id),
      ))
      .limit(1);
    if (!item) {
      const [inCatalog] = await db
        .select({ isbn13: catalogMasters.isbn13 })
        .from(catalogMasters)
        .where(eq(catalogMasters.isbn13, input.isbn))
        .limit(1);
      return { outcome: inCatalog ? 'catalog_only' : 'not_found' } as const;
    }
    if (item.locationCode === session.locationCode) {
      await db.update(shelfAuditSessions)
        .set({ confirmedItemUuids: [...(session.confirmedItemUuids as string[]), item.uuid] })
        .where(eq(shelfAuditSessions.id, input.sessionId));
      return { outcome: 'confirmed' as const, statusWarning: item.status !== 'AVAILABLE' ? item.status : null };
    }
    const conflict: ConflictItem = { uuid: item.uuid, fromLocation: item.locationCode ?? '', resolution: null };
    await db.update(shelfAuditSessions)
      .set({ conflictItems: [...(session.conflictItems as ConflictItem[]), conflict] })
      .where(eq(shelfAuditSessions.id, input.sessionId));
    return { outcome: 'conflict' as const, fromLocation: item.locationCode };
  }),
```

### Procedure 6: `shelfAudit.completeShelfAudit`

```typescript
completeShelfAudit: libraryProcedure
  .input(z.object({ sessionId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const [session] = await db.select().from(shelfAuditSessions).where(eq(shelfAuditSessions.id, input.sessionId)).limit(1);
    if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
    const expected = session.expectedItemUuids as string[];
    const confirmed = session.confirmedItemUuids as string[];
    const conflicts = session.conflictItems as ConflictItem[];
    const notFoundUuids = expected.filter(uuid => !confirmed.includes(uuid));
    const today = new Date().toISOString().split('T')[0];
    const reason = `Shelf audit completed — not found at ${session.locationCode} on ${today}`;
    if (notFoundUuids.length > 0) {
      await db.update(inventoryItems)
        .set({ status: 'MISSING' })
        .where(and(
          inArray(inventoryItems.uuid, notFoundUuids),
          eq(inventoryItems.libraryId, ctx.library.id),
        ));
      await db.insert(locationLog).values(
        notFoundUuids.map(uuid => ({
          itemUuid: uuid,
          libraryId: ctx.library.id,
          changedBy: ctx.user.id,
          reason,
          changedAt: new Date(),
        })),
      );
    }
    await db.update(shelfAuditSessions)
      .set({ status: 'COMPLETED', completedAt: new Date() })
      .where(eq(shelfAuditSessions.id, input.sessionId));
    return {
      confirmed: confirmed.length,
      missing: notFoundUuids.length,
      relocated: conflicts.filter(c => c.resolution === 'moved').length,
      skipped: conflicts.filter(c => c.resolution === 'skipped').length,
    };
  }),
```

**Verification:** `npx tsc --noEmit` passes.

---

## Task 3 — Dashboard Card (Phase C0)

**File changed:** `client/src/pages/Dashboard.tsx`

Add imports:
```typescript
import { CardDescription } from '@/components/ui/card';
import { Clipboard } from 'lucide-react';
import { useLocation } from 'wouter';
```

Add query near the top of the component:
```typescript
const [, navigate] = useLocation();
const { data: activeAuditSession } = trpc.shelfAudit.getActiveAuditSession.useQuery();
```

Add card at the end of the KPI section (after stale books alert):
```tsx
{/* Shelf Audit Feature Card */}
<Card className="border-gray-200 shadow-sm">
  <CardHeader className="pb-3">
    <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-900">
      <Clipboard className="h-4 w-4" />
      Auditoría de Estanterías
    </CardTitle>
    <CardDescription className="text-xs text-gray-500">
      Verifica que los libros físicos coincidan con la base de datos
    </CardDescription>
  </CardHeader>
  <CardContent>
    {activeAuditSession ? (
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          Auditoría en curso: <strong>{activeAuditSession.locationCode}</strong>
        </p>
        <Button size="sm" onClick={() => navigate('/shelf-audit')}>Continuar auditoría</Button>
      </div>
    ) : (
      <Button size="sm" onClick={() => navigate('/shelf-audit')}>Iniciar auditoría</Button>
    )}
  </CardContent>
</Card>
```

---

## Task 4 — ShelfAudit.tsx Wizard Page (Phase C)

**File:** `client/src/pages/ShelfAudit.tsx` (new)

Multi-step wizard with steps: `'start' | 'photo' | 'reconcile' | 'complete'`

Key implementation notes:
- Step state in `useState` — NOT URL params
- Auto-resume: `useEffect` on `activeSession` → jump to `'reconcile'`
- Location auto-pad: `normalizeLocation` function per spec
- Photo step: plain `<input type="file">` + FileReader → base64 → `analyzeShelfPhoto.mutate()`
  (IsbnImageUpload is NOT used here — it has wrong props and calls `triage.extractIsbnFromImage`)
- Reconcile step: 4 tabs (Confirmados, Conflictos, No reconocidos, No encontrados)
- Finalize guard: disabled until all conflicts resolved/skipped AND all unrecognized handled
- Complete step: summary modal with counts + "Siguiente estantería" / "Terminar" buttons
- BarcodeScanner: reused as-is for "No reconocidos" tab
- `nextShelf` function per spec (A→B…Z→null)

All trpc calls use `trpc.shelfAudit.*` prefix.

---

## Task 5 — Routes + Nav (Phase C)

**Files changed:**
- `client/src/App.tsx` — add `<Route path="/shelf-audit" component={ShelfAudit} />`
- `client/src/components/DashboardLayout.tsx` — add Clipboard nav item

---

## Task 6 — Tests (Phase D)

**File:** `server/shelfAudit.test.ts` (new)

Follow existing pattern from `library.test.ts`:
- `vi.mock('./libraryDb', ...)` — full mock
- `vi.mock('./db', async (importOriginal) => ...)` — partial mock, spread actual
- `vi.mock('./_core/llm', ...)` — mock `invokeLLM`
- `vi.mock('./storage', ...)` — mock `storagePut`
- `makeUser()`, `makeLibrary()`, `makeCtx()` factories
- `mockUpdateMemberLastActivity()` called in `beforeEach`

13 test cases per spec:
1. `initiateShelfAudit` — returns UUID snapshot
2. `initiateShelfAudit` — 0 items → empty expectedItemUuids
3. `getActiveAuditSession` — returns ACTIVE, not COMPLETED
4. `analyzeShelfPhoto` — appends Gemini response to photoAnalysisResult
5. `resolveLocationConflict moved` — updates locationCode + inserts locationLog
6. `resolveLocationConflict kept` — no DB changes to inventoryItems
7. `addManualScanResult` — ISBN at this location → adds to confirmedItemUuids
8. `addManualScanResult` — ISBN at different location → adds to conflictItems
9. `addManualScanResult` — ISBN not in inventoryItems → catalog_only or not_found
10. `completeShelfAudit` — marks non-confirmed as MISSING
11. `completeShelfAudit` — inserts locationLog for each MISSING
12. `completeShelfAudit` — sets COMPLETED + completedAt
13. `completeShelfAudit` — confirmed items NOT marked MISSING

---

## Execution Order

1. Task 1 (schema + types) → `pnpm db:push` → verify TypeScript
2. Task 2 (backend procedures) → verify TypeScript
3. Task 6 (tests) → `pnpm test` → all pass
4. Task 3 (Dashboard card) → verify TypeScript
5. Task 4 (ShelfAudit.tsx) → verify TypeScript
6. Task 5 (routes + nav) → final TypeScript check
7. Final: `pnpm test` → ≥312 passing, 0 failures

---

## What We Are NOT Doing (Scope Guard)

- No audit history / past reports
- No PDF/CSV export of audit results
- No parallel multi-shelf audits
- No QR code scanning
- No auto-unlisting of MISSING books
- No auto-creating triage entries for new discoveries
- No changes to `IsbnImageUpload.tsx`, `BarcodeScanner.tsx`, `aiIsbnExtractor.ts`, `llm.ts`
