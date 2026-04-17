# Shelf Audit — Reconcile Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reconciliar" step (step 3 of 5) to the Shelf Audit wizard that lets the operator bulk-review AI-detected books, move existing items to the current shelf, clear locations for expected-but-unconfirmed items, and route brand-new books to the Triage flow with the location pre-filled.

**Architecture:** Backend adds one boolean column (`photoReconciled`) to `shelfAuditSessions`, one new tRPC procedure (`applyPhotoReconciliation`), and enriches `getActiveAuditSession` with `expectedItemDetails`. Frontend adds a `ReconcileStep` component to `ShelfAudit.tsx`, updates the wizard's `Step` type and `STEP_META`, and adds `?locationCode` query-param support to `Triage.tsx`.

**Tech Stack:** Drizzle ORM (MySQL), tRPC 11, React 19, Tailwind 4, shadcn/ui, Vitest, Zod

---

## File Map

| File | Change |
|---|---|
| `drizzle/schema.ts` | Add `photoReconciled` boolean column to `shelfAuditSessions` |
| `shared/auditTypes.ts` | Add `ExpectedItemDetail` interface |
| `server/routers.ts` | Add `applyPhotoReconciliation` procedure; enrich `getActiveAuditSession` |
| `server/shelfAudit.test.ts` | Add 6 new tests for the two new/changed procedures |
| `client/src/pages/ShelfAudit.tsx` | Add `ReconcileStep` component; update `Step` type, `STEP_META`, `AuditSession` type, wizard navigation |
| `client/src/pages/Triage.tsx` | Add `?locationCode` query-param support; pass `suggestedAllocation` from param to `QuickCatalogModal` |

---

## Task 1: Schema — add `photoReconciled` column

**Files:**
- Modify: `drizzle/schema.ts` (around line 312)

- [ ] **Step 1: Edit `drizzle/schema.ts`**

Find the `shelfAuditSessions` table definition. After the `photoAnalysisResult` column, add:

```ts
photoReconciled: boolean('photoReconciled').notNull().default(false),
```

The table definition should look like:

```ts
export const shelfAuditSessions = mysqlTable('shelfAuditSessions', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  libraryId: int('libraryId').notNull(),
  locationCode: varchar('locationCode', { length: 10 }).notNull(),
  status: mysqlEnum('status', ['ACTIVE', 'COMPLETED', 'ABANDONED']).notNull().default('ACTIVE'),
  startedBy: int('startedBy').notNull(),
  startedAt: timestamp('startedAt').notNull().defaultNow(),
  completedAt: timestamp('completedAt'),
  expectedItemUuids: json('expectedItemUuids').$type<string[]>().notNull(),
  confirmedItemUuids: json('confirmedItemUuids').$type<string[]>().notNull(),
  conflictItems: json('conflictItems').$type<import('../shared/auditTypes').ConflictItem[]>().notNull(),
  photoAnalysisResult: json('photoAnalysisResult').$type<import('../shared/auditTypes').ShelfPhotoResult[] | null>(),
  photoReconciled: boolean('photoReconciled').notNull().default(false),
}, (table) => ({
  libraryStatusIdx: index('idx_audit_library_status').on(table.libraryId, table.status),
}));
```

- [ ] **Step 2: Push migration**

```bash
cd /home/ubuntu/alexandria-os && pnpm db:push
```

Expected: `Changes applied` (or `No changes` if column already exists). No data loss.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/ubuntu/alexandria-os && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/alexandria-os && git add drizzle/schema.ts && git commit -m "feat(schema): add photoReconciled boolean to shelfAuditSessions"
```

---

## Task 2: Shared types — add `ExpectedItemDetail`

**Files:**
- Modify: `shared/auditTypes.ts`

- [ ] **Step 1: Add `ExpectedItemDetail` to `shared/auditTypes.ts`**

Append to the end of the file:

```ts
export interface ExpectedItemDetail {
  uuid: string;
  isbn13: string;
  title: string | null;
  author: string | null;
  locationCode: string | null;  // current registered location (may differ from session.locationCode)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/ubuntu/alexandria-os && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /home/ubuntu/alexandria-os && git add shared/auditTypes.ts && git commit -m "feat(types): add ExpectedItemDetail to auditTypes"
```

---

## Task 3: Backend — enrich `getActiveAuditSession` + add `applyPhotoReconciliation`

**Files:**
- Modify: `server/routers.ts` (shelfAudit sub-router, around lines 2822–2835 and 2960–3000)

### 3a: Enrich `getActiveAuditSession`

The current procedure returns the raw session row. We need to also return `expectedItemDetails` — an array of `ExpectedItemDetail` for every UUID in `expectedItemUuids`.

- [ ] **Step 1: Locate `getActiveAuditSession` in `server/routers.ts`**

Search for `getActiveAuditSession` — it is around line 2822. It currently does a simple `SELECT ... FROM shelfAuditSessions WHERE libraryId = ? AND status = 'ACTIVE' LIMIT 1`.

- [ ] **Step 2: Replace the `getActiveAuditSession` procedure body**

After fetching the session, add a JOIN query to fetch item details. Replace the existing procedure with:

```ts
getActiveAuditSession: libraryProcedure
  .query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    const [session] = await db
      .select()
      .from(shelfAuditSessions)
      .where(and(
        eq(shelfAuditSessions.libraryId, ctx.library.id),
        eq(shelfAuditSessions.status, 'ACTIVE'),
      ))
      .limit(1);
    if (!session) return null;

    // Enrich with catalog data for expected items
    const expectedUuids = (session.expectedItemUuids as string[]);
    let expectedItemDetails: import('../shared/auditTypes').ExpectedItemDetail[] = [];
    if (expectedUuids.length > 0) {
      const rows = await db
        .select({
          uuid: inventoryItems.uuid,
          isbn13: inventoryItems.isbn13,
          title: catalogMasters.title,
          author: catalogMasters.author,
          locationCode: inventoryItems.locationCode,
        })
        .from(inventoryItems)
        .innerJoin(catalogMasters, eq(inventoryItems.isbn13, catalogMasters.isbn13))
        .where(and(
          inArray(inventoryItems.uuid, expectedUuids),
          eq(inventoryItems.libraryId, ctx.library.id),
        ));
      expectedItemDetails = rows.map(r => ({
        uuid: r.uuid,
        isbn13: r.isbn13,
        title: r.title ?? null,
        author: r.author ?? null,
        locationCode: r.locationCode ?? null,
      }));
    }

    return { ...session, expectedItemDetails };
  }),
```

Note: `inArray` is already imported from `drizzle-orm` in this file. Verify with `grep -n "inArray" server/routers.ts | head -3`.

### 3b: Add `applyPhotoReconciliation` procedure

Add this procedure after `resolveLocationConflict` and before `completeShelfAudit` in the `shelfAudit` router:

- [ ] **Step 3: Add `applyPhotoReconciliation` procedure**

```ts
applyPhotoReconciliation: libraryProcedure
  .input(z.object({
    sessionId: z.string().uuid(),
    moves: z.array(z.string().uuid()),
    clearLocations: z.array(z.string().uuid()),
  }).refine(
    ({ moves, clearLocations }) => {
      const moveSet = new Set(moves);
      return !clearLocations.some(u => moveSet.has(u));
    },
    { message: 'moves and clearLocations must not overlap' },
  ))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

    const [session] = await db
      .select()
      .from(shelfAuditSessions)
      .where(and(
        eq(shelfAuditSessions.id, input.sessionId),
        eq(shelfAuditSessions.libraryId, ctx.library.id),
        eq(shelfAuditSessions.status, 'ACTIVE'),
      ))
      .limit(1);
    if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sesión no encontrada' });

    const now = new Date();
    const loc = session.locationCode;
    const newConfirmed = [...(session.confirmedItemUuids as string[])];

    // Process moves: set locationCode = session.locationCode
    if (input.moves.length > 0) {
      await db.update(inventoryItems)
        .set({ locationCode: loc })
        .where(and(
          inArray(inventoryItems.uuid, input.moves),
          eq(inventoryItems.libraryId, ctx.library.id),
        ));
      await db.insert(locationLog).values(
        input.moves.map(uuid => ({
          itemUuid: uuid,
          libraryId: ctx.library.id,
          changedBy: ctx.user.id,
          reason: `Shelf photo reconciliation — moved to ${loc}`,
          changedAt: now,
        })),
      );
      newConfirmed.push(...input.moves);
    }

    // Process clearLocations: set locationCode = null (status unchanged)
    if (input.clearLocations.length > 0) {
      await db.update(inventoryItems)
        .set({ locationCode: null })
        .where(and(
          inArray(inventoryItems.uuid, input.clearLocations),
          eq(inventoryItems.libraryId, ctx.library.id),
        ));
      await db.insert(locationLog).values(
        input.clearLocations.map(uuid => ({
          itemUuid: uuid,
          libraryId: ctx.library.id,
          changedBy: ctx.user.id,
          reason: `Shelf photo reconciliation — location cleared (not found at ${loc})`,
          changedAt: now,
        })),
      );
    }

    // Mark session as reconciled and update confirmedItemUuids
    await db.update(shelfAuditSessions)
      .set({
        confirmedItemUuids: newConfirmed,
        photoReconciled: true,
      })
      .where(eq(shelfAuditSessions.id, input.sessionId));

    return { moved: input.moves.length, cleared: input.clearLocations.length };
  }),
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/ubuntu/alexandria-os && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/alexandria-os && git add server/routers.ts && git commit -m "feat(api): enrich getActiveAuditSession + add applyPhotoReconciliation"
```

---

## Task 4: Tests — 6 new Vitest tests for Task 3 changes

**Files:**
- Modify: `server/shelfAudit.test.ts`

The existing test file already has `makeMockDb()`, `makeSession()`, `makeCtx()`, `makeLibrary()` helpers and the `vi.mock('./db', ...)` and `vi.mock('./libraryDb', ...)` blocks. All new tests follow the same pattern.

**Important:** The `makeSession()` helper must be updated to include `photoReconciled: false` in its default return value (since the schema now has this column). Find the `makeSession` function and add `photoReconciled: false` to the returned object.

- [ ] **Step 1: Update `makeSession` helper to include `photoReconciled`**

Find this in `server/shelfAudit.test.ts`:
```ts
function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    ...
    photoAnalysisResult: null,
    ...overrides,
  };
}
```

Add `photoReconciled: false,` after `photoAnalysisResult: null,`.

- [ ] **Step 2: Write the 6 new tests**

Append the following `describe` blocks to the end of `server/shelfAudit.test.ts`:

```ts
// ─── getActiveAuditSession enrichment ────────────────────────────────────────
describe("shelfAudit.getActiveAuditSession — expectedItemDetails", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("returns expectedItemDetails joined from catalog", async () => {
    const session = makeSession({ expectedItemUuids: ["uuid-A"] });
    const mockDb = makeMockDb();
    let selectCallCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First call: fetch session
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([session])),
            })),
          })),
        };
      }
      // Second call: fetch expectedItemDetails (JOIN)
      return {
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve([
              { uuid: "uuid-A", isbn13: "9780000000001", title: "Test Book", author: "Test Author", locationCode: "02B" },
            ])),
          })),
        })),
      };
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.getActiveAuditSession();
    expect(result).not.toBeNull();
    expect(result!.expectedItemDetails).toHaveLength(1);
    expect(result!.expectedItemDetails[0]).toMatchObject({
      uuid: "uuid-A",
      title: "Test Book",
      author: "Test Author",
      locationCode: "02B",
    });
  });

  it("returns empty expectedItemDetails when no expected items", async () => {
    const session = makeSession({ expectedItemUuids: [] });
    const mockDb = makeMockDb();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([session])),
        })),
      })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.getActiveAuditSession();
    expect(result!.expectedItemDetails).toEqual([]);
  });
});

// ─── applyPhotoReconciliation ─────────────────────────────────────────────────
describe("shelfAudit.applyPhotoReconciliation", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("moves items and marks session photoReconciled", async () => {
    const session = makeSession({ confirmedItemUuids: [] });
    const mockDb = makeMockDb();
    const updatedSets: unknown[] = [];
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([session])),
        })),
      })),
    });
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn((vals: unknown) => {
        updatedSets.push(vals);
        return { where: vi.fn(() => Promise.resolve()) };
      }),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.applyPhotoReconciliation({
      sessionId: SESSION_ID,
      moves: ["uuid-1"],
      clearLocations: [],
    });
    expect(result).toEqual({ moved: 1, cleared: 0 });
    // Last update call should set photoReconciled: true
    const lastUpdate = updatedSets[updatedSets.length - 1] as Record<string, unknown>;
    expect(lastUpdate.photoReconciled).toBe(true);
    expect((lastUpdate.confirmedItemUuids as string[])).toContain("uuid-1");
  });

  it("clears locations and marks session photoReconciled", async () => {
    const session = makeSession({ confirmedItemUuids: [] });
    const mockDb = makeMockDb();
    const updatedSets: unknown[] = [];
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([session])),
        })),
      })),
    });
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn((vals: unknown) => {
        updatedSets.push(vals);
        return { where: vi.fn(() => Promise.resolve()) };
      }),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.applyPhotoReconciliation({
      sessionId: SESSION_ID,
      moves: [],
      clearLocations: ["uuid-2"],
    });
    expect(result).toEqual({ moved: 0, cleared: 1 });
    const lastUpdate = updatedSets[updatedSets.length - 1] as Record<string, unknown>;
    expect(lastUpdate.photoReconciled).toBe(true);
  });

  it("rejects overlapping moves and clearLocations", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.shelfAudit.applyPhotoReconciliation({
        sessionId: SESSION_ID,
        moves: ["uuid-1"],
        clearLocations: ["uuid-1"],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("overlap") });
  });

  it("accepts empty arrays and marks photoReconciled", async () => {
    const session = makeSession({ confirmedItemUuids: [] });
    const mockDb = makeMockDb();
    const updatedSets: unknown[] = [];
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([session])),
        })),
      })),
    });
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn((vals: unknown) => {
        updatedSets.push(vals);
        return { where: vi.fn(() => Promise.resolve()) };
      }),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.applyPhotoReconciliation({
      sessionId: SESSION_ID,
      moves: [],
      clearLocations: [],
    });
    expect(result).toEqual({ moved: 0, cleared: 0 });
    const lastUpdate = updatedSets[updatedSets.length - 1] as Record<string, unknown>;
    expect(lastUpdate.photoReconciled).toBe(true);
  });
});
```

- [ ] **Step 3: Run the new tests**

```bash
cd /home/ubuntu/alexandria-os && timeout 60 npx vitest run server/shelfAudit.test.ts 2>&1 | tail -20
```

Expected: All tests pass (existing 14 + new 6 = 20 total).

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/alexandria-os && git add server/shelfAudit.test.ts && git commit -m "test(shelfAudit): add 6 tests for enriched getActiveAuditSession + applyPhotoReconciliation"
```

---

## Task 5: Frontend — `ReconcileStep` component + wizard update

**Files:**
- Modify: `client/src/pages/ShelfAudit.tsx`

This is the largest task. Read the current file carefully before editing. The file is ~885 lines. Key sections:

- Lines 1–35: imports
- Lines 38–57: type definitions (`AuditSession`, `ConflictItem`, `ScanOutcome`)
- Lines 59–186: `PhotoStep` component
- Lines 188–310: `ReconcileTab` component (used inside `ScanStep`)
- Lines 312–530: `ConflictCard` component + `ScanStep` component
- Lines 532–785: `InitiateStep`, `CompleteStep` components
- Lines 787–885: `STEP_META`, `ShelfAudit` main component

### 5a: Update imports and types

- [ ] **Step 1: Add `ListChecks` to the lucide-react import**

Find the lucide-react import block and add `ListChecks` to it.

- [ ] **Step 2: Update `AuditSession` type to include `expectedItemDetails` and `photoReconciled`**

Find the `AuditSession` type (around line 44) and add two fields:

```ts
type AuditSession = {
  id: string;
  libraryId: number;
  locationCode: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  startedBy: number;
  startedAt: Date;
  completedAt: Date | null;
  expectedItemUuids: string[];
  confirmedItemUuids: string[];
  conflictItems: ConflictItem[];
  photoAnalysisResult: ShelfPhotoResult[] | null;
  photoReconciled: boolean;                          // NEW
  expectedItemDetails: ExpectedItemDetail[];         // NEW
};
```

Also add the import at the top of the file:

```ts
import type { ShelfPhotoResult, ExpectedItemDetail } from '../../../shared/auditTypes';
```

(Replace the existing `import type { ShelfPhotoResult }` line.)

### 5b: Add `ReconcileStep` component

- [ ] **Step 3: Add `ReconcileStep` component**

Insert the following component between `PhotoStep` (ends around line 186) and `ReconcileTab` (starts around line 188):

```tsx
// ─── Step 3: Reconcile ────────────────────────────────────────────────────────
function ReconcileStep({
  session,
  onConfirmed,
  onSkip,
}: {
  session: AuditSession;
  onConfirmed: () => void;
  onSkip: () => void;
}) {
  const photoResults = (session.photoAnalysisResult ?? []) as ShelfPhotoResult[];

  // Section A: photo-detected books matched to an item at a DIFFERENT location
  const sectionA = photoResults.filter(
    r => r.matchedItemUuid !== null && r.confidence >= 0.5,
  ).filter(r => {
    const detail = session.expectedItemDetails.find(d => d.uuid === r.matchedItemUuid);
    // If it's already at the right location, it's not a "move" candidate
    return detail ? detail.locationCode !== session.locationCode : true;
  });

  // Section B: photo-detected books with NO inventory match (new books)
  const sectionB = photoResults.filter(
    r => r.matchedItemUuid === null && r.confidence >= 0.5,
  );

  // Section C: expected items that were NOT confirmed during scanning
  const confirmedSet = new Set(session.confirmedItemUuids);
  const sectionC = session.expectedItemDetails.filter(d => !confirmedSet.has(d.uuid));

  // Checkbox state: uuid → boolean
  const [checkedA, setCheckedA] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sectionA.map(r => [r.matchedItemUuid!, true])),
  );
  const [checkedB, setCheckedB] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sectionB.map((_, i) => [`new-${i}`, true])),
  );
  const [checkedC, setCheckedC] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sectionC.map(d => [d.uuid, true])),
  );
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const applyMutation = trpc.shelfAudit.applyPhotoReconciliation.useMutation({
    onSuccess: (data) => {
      toast.success(`Reconciliación aplicada: ${data.moved} movidos, ${data.cleared} ubicaciones limpiadas.`);
      onConfirmed();
    },
    onError: (err) => toast.error(err.message),
  });

  const totalChanges =
    Object.values(checkedA).filter(Boolean).length +
    Object.values(checkedC).filter(Boolean).length;

  const handleConfirm = () => {
    const moves = sectionA
      .filter(r => checkedA[r.matchedItemUuid!])
      .map(r => r.matchedItemUuid!);
    const clearLocations = sectionC
      .filter(d => checkedC[d.uuid])
      .map(d => d.uuid);
    applyMutation.mutate({ sessionId: session.id, moves, clearLocations });
    // New books (section B) that are ticked: navigate to Triage after mutation
    // This is handled in onSuccess via onConfirmed → parent navigates
  };

  // Read-only mode when already reconciled
  if (session.photoReconciled) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            Reconciliación completada
          </CardTitle>
          <CardDescription>
            Esta sesión ya fue reconciliada. Puedes continuar al escaneo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={onConfirmed}>Continuar al escaneo</Button>
        </CardContent>
      </Card>
    );
  }

  const allEmpty = sectionA.length === 0 && sectionB.length === 0 && sectionC.length === 0;
  if (allEmpty) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Sin cambios pendientes</CardTitle>
          <CardDescription>Todos los libros detectados ya están reconciliados.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button className="flex-1" onClick={onConfirmed}>Continuar al escaneo</Button>
          <Button variant="ghost" onClick={onSkip}>Saltar</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Reconciliar estante — {session.locationCode}</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Revisa los cambios detectados. Desmarca los que no quieras aplicar.
        </p>
      </div>

      {/* Section A: move to this location */}
      {sectionA.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-blue-700">
                Mover a esta ubicación ({sectionA.filter(r => checkedA[r.matchedItemUuid!]).length}/{sectionA.length})
              </CardTitle>
              <button
                className="text-xs text-blue-500 underline"
                onClick={() => {
                  const allOn = sectionA.every(r => checkedA[r.matchedItemUuid!]);
                  setCheckedA(Object.fromEntries(sectionA.map(r => [r.matchedItemUuid!, !allOn])));
                }}
              >
                {sectionA.every(r => checkedA[r.matchedItemUuid!]) ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {sectionA.map(r => {
              const uuid = r.matchedItemUuid!;
              const detail = session.expectedItemDetails.find(d => d.uuid === uuid);
              const isExpanded = expandedRow === `A-${uuid}`;
              return (
                <div key={uuid} className="rounded border border-blue-100 bg-blue-50">
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                    onClick={() => setExpandedRow(isExpanded ? null : `A-${uuid}`)}
                  >
                    <input
                      type="checkbox"
                      checked={!!checkedA[uuid]}
                      onChange={e => { e.stopPropagation(); setCheckedA(prev => ({ ...prev, [uuid]: e.target.checked })); }}
                      className="h-4 w-4 rounded border-gray-300"
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-blue-900 truncate">{r.title}</div>
                      <div className="text-xs text-blue-700 truncate">{r.author}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {detail?.locationCode && (
                        <Badge variant="outline" className="text-xs">{detail.locationCode} → {session.locationCode}</Badge>
                      )}
                      <Badge className="text-xs bg-blue-100 text-blue-800 border-0">{Math.round(r.confidence * 100)}%</Badge>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-2 text-xs text-blue-700 space-y-0.5 border-t border-blue-100 pt-2">
                      <div><span className="font-medium">ISBN:</span> {r.isbn ?? r.matchedIsbn ?? '—'}</div>
                      <div><span className="font-medium">Ubicación actual:</span> {detail?.locationCode ?? '—'}</div>
                      <div><span className="font-medium">UUID:</span> {uuid.slice(0, 8)}…</div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Section B: new books → Triage */}
      {sectionB.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-amber-700">
                Nuevo libro — requiere triage ({sectionB.filter((_, i) => checkedB[`new-${i}`]).length}/{sectionB.length})
              </CardTitle>
              <button
                className="text-xs text-amber-500 underline"
                onClick={() => {
                  const allOn = sectionB.every((_, i) => checkedB[`new-${i}`]);
                  setCheckedB(Object.fromEntries(sectionB.map((_, i) => [`new-${i}`, !allOn])));
                }}
              >
                {sectionB.every((_, i) => checkedB[`new-${i}`]) ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {sectionB.map((r, i) => {
              const key = `new-${i}`;
              const isExpanded = expandedRow === `B-${i}`;
              return (
                <div key={i} className="rounded border border-amber-100 bg-amber-50">
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                    onClick={() => setExpandedRow(isExpanded ? null : `B-${i}`)}
                  >
                    <input
                      type="checkbox"
                      checked={!!checkedB[key]}
                      onChange={e => { e.stopPropagation(); setCheckedB(prev => ({ ...prev, [key]: e.target.checked })); }}
                      className="h-4 w-4 rounded border-gray-300"
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-amber-900 truncate">{r.title}</div>
                      <div className="text-xs text-amber-700 truncate">{r.author}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Badge className="text-xs bg-amber-100 text-amber-800 border-0">NUEVO</Badge>
                      <Badge className="text-xs bg-amber-100 text-amber-700 border-0">{Math.round(r.confidence * 100)}%</Badge>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-2 text-xs text-amber-700 space-y-0.5 border-t border-amber-100 pt-2">
                      <div><span className="font-medium">ISBN detectado:</span> {r.isbn ?? '—'}</div>
                      <div><span className="font-medium">Confianza:</span> {Math.round(r.confidence * 100)}%</div>
                      <div className="text-amber-600 italic">Se abrirá el proceso de triage con ubicación {session.locationCode} pre-rellenada.</div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Section C: expected-but-unconfirmed → clear location */}
      {sectionC.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-red-700">
                Limpiar ubicación ({sectionC.filter(d => checkedC[d.uuid]).length}/{sectionC.length})
              </CardTitle>
              <button
                className="text-xs text-red-500 underline"
                onClick={() => {
                  const allOn = sectionC.every(d => checkedC[d.uuid]);
                  setCheckedC(Object.fromEntries(sectionC.map(d => [d.uuid, !allOn])));
                }}
              >
                {sectionC.every(d => checkedC[d.uuid]) ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {sectionC.map(d => {
              const isExpanded = expandedRow === `C-${d.uuid}`;
              return (
                <div key={d.uuid} className="rounded border border-red-100 bg-red-50">
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                    onClick={() => setExpandedRow(isExpanded ? null : `C-${d.uuid}`)}
                  >
                    <input
                      type="checkbox"
                      checked={!!checkedC[d.uuid]}
                      onChange={e => { e.stopPropagation(); setCheckedC(prev => ({ ...prev, [d.uuid]: e.target.checked })); }}
                      className="h-4 w-4 rounded border-gray-300"
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-red-900 truncate">{d.title ?? `${d.uuid.slice(0, 8)}…`}</div>
                      <div className="text-xs text-red-700 truncate">{d.author ?? d.isbn13}</div>
                    </div>
                    <Badge variant="outline" className="text-xs text-red-600 border-red-200 flex-shrink-0">
                      {d.locationCode ?? 'sin ubicación'}
                    </Badge>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-2 text-xs text-red-700 space-y-0.5 border-t border-red-100 pt-2">
                      <div><span className="font-medium">ISBN:</span> {d.isbn13}</div>
                      <div><span className="font-medium">Ubicación actual:</span> {d.locationCode ?? '—'}</div>
                      <div><span className="font-medium">UUID:</span> {d.uuid.slice(0, 8)}…</div>
                      <div className="text-red-600 italic">La ubicación se limpiará (estado AVAILABLE sin cambios).</div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="flex gap-2 pt-2 pb-6">
        <Button
          className="flex-1"
          disabled={totalChanges === 0 || applyMutation.isPending}
          onClick={handleConfirm}
        >
          {applyMutation.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Aplicando…</>
          ) : (
            `Confirmar (${totalChanges} cambios)`
          )}
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={applyMutation.isPending}>
          Saltar
        </Button>
      </div>
    </div>
  );
}
```

### 5c: Update wizard `Step` type, `STEP_META`, and navigation

- [ ] **Step 4: Update `Step` type**

Find:
```ts
type Step = 'initiate' | 'photo' | 'scan' | 'complete';
```

Replace with:
```ts
type Step = 'initiate' | 'photo' | 'reconcile' | 'scan' | 'complete';
```

- [ ] **Step 5: Update `STEP_META`**

Find:
```ts
const STEP_META: { id: Step; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'initiate', label: 'Iniciar',      Icon: ClipboardList },
  { id: 'photo',    label: 'Fotografiar',  Icon: ImagePlus },
  { id: 'scan',     label: 'Escanear',     Icon: ScanLine },
  { id: 'complete', label: 'Completar',    Icon: ClipboardCheck },
];
```

Replace with:
```ts
const STEP_META: { id: Step; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'initiate',   label: 'Iniciar',      Icon: ClipboardList },
  { id: 'photo',      label: 'Fotografiar',  Icon: ImagePlus },
  { id: 'reconcile',  label: 'Reconciliar',  Icon: ListChecks },
  { id: 'scan',       label: 'Escanear',     Icon: ScanLine },
  { id: 'complete',   label: 'Completar',    Icon: ClipboardCheck },
];
```

- [ ] **Step 6: Update `handlePhotoAnalyzed` and add `handleReconciled` / `handleSkipReconcile`**

Find:
```ts
const handlePhotoAnalyzed = (results: ShelfPhotoResult[]) => {
  setSession(prev => prev ? { ...prev, photoAnalysisResult: results } : prev);
  setStep('scan');
};
const handleSkipPhoto = () => setStep('scan');
```

Replace with:
```ts
const handlePhotoAnalyzed = (results: ShelfPhotoResult[]) => {
  setSession(prev => prev ? { ...prev, photoAnalysisResult: results } : prev);
  if (results.length > 0) {
    setStep('reconcile');
  } else {
    setStep('scan');
  }
};
const handleSkipPhoto = () => setStep('scan');
const handleReconciled = () => setStep('scan');
const handleSkipReconcile = () => setStep('scan');
```

- [ ] **Step 7: Update `getActiveAuditSession` query — add `reconcile` to enabled steps**

Find:
```ts
const { data: liveSession, refetch } = trpc.shelfAudit.getActiveAuditSession.useQuery(undefined, {
  enabled: step === 'scan',
  refetchInterval: false,
});
```

Replace with:
```ts
const { data: liveSession, refetch } = trpc.shelfAudit.getActiveAuditSession.useQuery(undefined, {
  enabled: step === 'scan' || step === 'reconcile',
  refetchInterval: false,
});
```

- [ ] **Step 8: Update `currentSession` merge logic**

Find:
```ts
const currentSession = (step === 'scan' && liveSession) ? (liveSession as AuditSession) : session;
```

Replace with:
```ts
const currentSession = ((step === 'scan' || step === 'reconcile') && liveSession) ? (liveSession as AuditSession) : session;
```

- [ ] **Step 9: Add `ReconcileStep` to the JSX render**

Find:
```tsx
      {step === 'scan' && currentSession && (
```

Insert before it:
```tsx
      {step === 'reconcile' && currentSession && (
        <ReconcileStep
          session={currentSession}
          onConfirmed={handleReconciled}
          onSkip={handleSkipReconcile}
        />
      )}
```

- [ ] **Step 10: Verify TypeScript compiles**

```bash
cd /home/ubuntu/alexandria-os && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
cd /home/ubuntu/alexandria-os && git add client/src/pages/ShelfAudit.tsx && git commit -m "feat(ui): add ReconcileStep to ShelfAudit wizard (5-step flow)"
```

---

## Task 6: Frontend — Triage `?locationCode` query param

**Files:**
- Modify: `client/src/pages/Triage.tsx`

The `QuickCatalogModal` already accepts a `suggestedAllocation` prop (see `client/src/components/QuickCatalogModal.tsx` line 20). We just need to read the query param and pass it through.

- [ ] **Step 1: Read `?locationCode` on mount in `Triage.tsx`**

Find the existing `useState` declarations at the top of the `Triage` component function (around line 24). Add:

```ts
const [prefillLocation] = useState<string>(() => {
  const params = new URLSearchParams(window.location.search);
  const loc = params.get('locationCode') ?? '';
  return /^[0-9]{2}[A-Z]$/.test(loc) ? loc : '';
});
```

- [ ] **Step 2: Pass `prefillLocation` as `suggestedAllocation` to `QuickCatalogModal`**

Find the `QuickCatalogModal` render (around line 479). The current `suggestedAllocation` prop is:

```tsx
suggestedAllocation={result?.kind === 'found' ? result.data.inventorySummary?.mostCommonAllocation : undefined}
```

Replace with:

```tsx
suggestedAllocation={
  prefillLocation ||
  (result?.kind === 'found' ? result.data.inventorySummary?.mostCommonAllocation : undefined)
}
```

This means: if we came from ShelfAudit with a `?locationCode`, always use that; otherwise fall back to the catalog's most common allocation.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/ubuntu/alexandria-os && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 4: Run all tests to confirm nothing is broken**

```bash
cd /home/ubuntu/alexandria-os && timeout 120 npx vitest run 2>&1 | tail -20
```

Expected: All existing tests pass + 6 new shelfAudit tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/alexandria-os && git add client/src/pages/Triage.tsx && git commit -m "feat(triage): pre-fill locationCode from ?locationCode query param"
```

---

## Task 7: Update `todo.md` and save checkpoint

- [ ] **Step 1: Mark new items in `todo.md`**

Append to `/home/ubuntu/alexandria-os/todo.md`:

```
## Shelf Audit — Reconcile Step (2026-04-17)
- [x] Schema: photoReconciled boolean column on shelfAuditSessions
- [x] Shared types: ExpectedItemDetail interface
- [x] API: getActiveAuditSession enriched with expectedItemDetails
- [x] API: applyPhotoReconciliation procedure (moves + clearLocations)
- [x] Tests: 6 new Vitest tests for enriched getActiveAuditSession + applyPhotoReconciliation
- [x] UI: ReconcileStep component (3 sections: move/new/clear)
- [x] UI: 5-step wizard (Iniciar → Fotografiar → Reconciliar → Escanear → Completar)
- [x] UI: Triage ?locationCode query param pre-fills location in QuickCatalogModal
```

- [ ] **Step 2: Run full test suite one final time**

```bash
cd /home/ubuntu/alexandria-os && timeout 120 npx vitest run 2>&1 | tail -10
```

Expected: All tests pass, 0 failures.

- [ ] **Step 3: Save checkpoint via webdev_save_checkpoint**

Use the `webdev_save_checkpoint` tool with description: "Shelf Audit Reconcile Step: 5-step wizard, ReconcileStep component, applyPhotoReconciliation procedure, getActiveAuditSession enrichment, Triage locationCode prefill, 6 new tests"

- [ ] **Step 4: Push to GitHub**

```bash
cd /home/ubuntu/alexandria-os && git push origin main
```

---

## Self-Review Against Spec

| Spec Section | Task covering it |
|---|---|
| 5-step wizard | Task 5c (STEP_META + navigation) |
| `photoReconciled` column | Task 1 |
| `ExpectedItemDetail` type | Task 2 |
| `getActiveAuditSession` enrichment | Task 3a |
| `applyPhotoReconciliation` procedure | Task 3b |
| Overlap validation | Task 3b (`z.refine`) |
| Section A (move existing) | Task 5b |
| Section B (new books → Triage) | Task 5b |
| Section C (clear location) | Task 5b |
| Inline row expansion | Task 5b |
| Section "select all / deselect all" | Task 5b |
| Read-only mode when `photoReconciled=true` | Task 5b |
| Skip Reconcile when 0 photo results | Task 5c `handlePhotoAnalyzed` |
| Triage `?locationCode` param | Task 6 |
| 6 Vitest tests | Task 4 |
| `todo.md` + checkpoint | Task 7 |

No gaps found.
