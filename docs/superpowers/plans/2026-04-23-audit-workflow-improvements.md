# Audit Workflow Improvements Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 3 audit workflow improvements: auto-polling in ScanStep, active-session indicator in InitiateStep, and audit history view.

**Architecture:**
- Task 1 (auto-polling): Frontend-only change — `refetchInterval: 5000` in the ScanStep query. No backend changes.
- Task 2 (location busy indicator): New backend procedure `getActiveSessionsForLocation` (input: locationCode) + frontend warning in InitiateStep. No schema changes.
- Task 3 (audit history): New backend procedure `getAuditHistory` (returns last 50 COMPLETED/ABANDONED sessions with operator name) + new frontend page `AuditHistory.tsx` + nav link.

**Tech Stack:** tRPC + Drizzle ORM (MySQL) + React 19 + Tailwind 4 + Vitest

---

## Task 1: Auto-polling in ScanStep

**Files:**
- Modify: `client/src/pages/ShelfAudit.tsx` (line 1151–1153)
- Test: `server/shelfAudit.photo.layout.test.ts` (append new test)

**Karpathy check:** This is a 1-line frontend change. The test verifies the source code contains `refetchInterval: 5000` in the ScanStep query block.

- [ ] **Step 1: Write the failing test**

Append to `server/shelfAudit.photo.layout.test.ts`:

```typescript
describe('ScanStep auto-polling', () => {
  it('enables refetchInterval: 5000 on getActiveAuditSession query in ScanStep', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../client/src/pages/ShelfAudit.tsx'),
      'utf-8'
    );
    // Find the liveSession query block (the one with enabled: step === 'scan')
    const scanQueryBlock = source.match(
      /const \{ data: liveSession.*?enabled: step === 'scan'.*?\}/s
    )?.[0] ?? '';
    expect(scanQueryBlock).toContain('refetchInterval: 5000');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit.photo.layout.test.ts
```

Expected: FAIL — `expected '' to contain 'refetchInterval: 5000'`

- [ ] **Step 3: Implement the fix**

In `client/src/pages/ShelfAudit.tsx`, change line ~1151–1153:

```typescript
// BEFORE:
const { data: liveSession, refetch } = trpc.shelfAudit.getActiveAuditSession.useQuery(undefined, {
  enabled: step === 'scan',
  refetchInterval: false,
});

// AFTER:
const { data: liveSession, refetch } = trpc.shelfAudit.getActiveAuditSession.useQuery(undefined, {
  enabled: step === 'scan',
  refetchInterval: step === 'scan' ? 5000 : false,
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit.photo.layout.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/alexandria-os && git add client/src/pages/ShelfAudit.tsx server/shelfAudit.photo.layout.test.ts && git commit -m "feat: auto-polling every 5s in ScanStep for co-auditor banner"
```

---

## Task 2: Active-session indicator in InitiateStep

**Files:**
- Modify: `server/routers.ts` (add `getActiveSessionsForLocation` procedure inside `shelfAudit:` router)
- Modify: `client/src/pages/ShelfAudit.tsx` (InitiateStep: call new procedure, show warning)
- Test: `server/shelfAudit.concurrency.test.ts` (append new test)

**Design:** When user types a location code in InitiateStep and submits, before calling `initiateShelfAudit`, the frontend queries `getActiveSessionsForLocation({ locationCode })`. If another user is already auditing that location, show a warning card: *"⚠️ [Nombre] ya está auditando esta ubicación. ¿Deseas iniciar de todas formas?"* with Confirm/Cancel buttons.

**Backend procedure:**
```typescript
getActiveSessionsForLocation: libraryProcedure
  .input(z.object({ locationCode: z.string().min(1).max(10) }))
  .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    const sessions = await db
      .select({ sessionId: shelfAuditSessions.id, startedBy: shelfAuditSessions.startedBy, confirmedCount: shelfAuditSessions.confirmedItemUuids })
      .from(shelfAuditSessions)
      .where(and(
        eq(shelfAuditSessions.libraryId, ctx.library.id),
        eq(shelfAuditSessions.locationCode, input.locationCode),
        eq(shelfAuditSessions.status, 'ACTIVE'),
        ne(shelfAuditSessions.startedBy, ctx.user.id),
      ));
    if (sessions.length === 0) return [];
    // Enrich with user names
    const enriched = await Promise.all(sessions.map(async (s) => {
      const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, s.startedBy)).limit(1);
      return {
        sessionId: s.sessionId,
        userName: user?.name ?? 'Operador',
        confirmedCount: (s.confirmedCount as string[]).length,
      };
    }));
    return enriched;
  }),
```

- [ ] **Step 1: Write the failing test**

Append to `server/shelfAudit.concurrency.test.ts`:

```typescript
describe('getActiveSessionsForLocation', () => {
  it('returns other active sessions for the given location', async () => {
    const sessionB = {
      id: 'session-b',
      libraryId: 1,
      locationCode: '01A',
      status: 'ACTIVE' as const,
      startedBy: 99, // different user
      confirmedItemUuids: ['uuid1', 'uuid2'],
    };
    const mockDb = makeMockDb();
    mockDb.select
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => Promise.resolve([sessionB]) }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ name: 'María' }]) }) }),
      }));
    vi.doMock('../server/db', () => ({ getDb: () => Promise.resolve(mockDb) }));

    const { appRouter } = await import('./routers');
    const caller = appRouter.createCaller(makeCtx({ userId: 1 }));
    const result = await caller.shelfAudit.getActiveSessionsForLocation({ locationCode: '01A' });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ sessionId: 'session-b', userName: 'María', confirmedCount: 2 });
  });

  it('returns empty array when no other users are auditing the location', async () => {
    const mockDb = makeMockDb();
    mockDb.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => Promise.resolve([]) }),
    }));
    vi.doMock('../server/db', () => ({ getDb: () => Promise.resolve(mockDb) }));

    const { appRouter } = await import('./routers');
    const caller = appRouter.createCaller(makeCtx({ userId: 1 }));
    const result = await caller.shelfAudit.getActiveSessionsForLocation({ locationCode: '01A' });

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit.concurrency.test.ts
```

Expected: FAIL — `caller.shelfAudit.getActiveSessionsForLocation is not a function`

- [ ] **Step 3: Implement the backend procedure**

In `server/routers.ts`, inside the `shelfAudit: router({` block, after `getActiveAuditSession`, add:

```typescript
getActiveSessionsForLocation: libraryProcedure
  .input(z.object({ locationCode: z.string().min(1).max(10) }))
  .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    const sessions = await db
      .select({
        sessionId: shelfAuditSessions.id,
        startedBy: shelfAuditSessions.startedBy,
        confirmedCount: shelfAuditSessions.confirmedItemUuids,
      })
      .from(shelfAuditSessions)
      .where(and(
        eq(shelfAuditSessions.libraryId, ctx.library.id),
        eq(shelfAuditSessions.locationCode, input.locationCode),
        eq(shelfAuditSessions.status, 'ACTIVE'),
        ne(shelfAuditSessions.startedBy, ctx.user.id),
      ));
    if (sessions.length === 0) return [];
    const enriched = await Promise.all(sessions.map(async (s) => {
      const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, s.startedBy)).limit(1);
      return {
        sessionId: s.sessionId,
        userName: user?.name ?? 'Operador',
        confirmedCount: (s.confirmedCount as string[]).length,
      };
    }));
    return enriched;
  }),
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit.concurrency.test.ts
```

Expected: PASS (all 7 tests)

- [ ] **Step 5: Implement the frontend warning in InitiateStep**

In `client/src/pages/ShelfAudit.tsx`, update `InitiateStep`:

Add state: `const [pendingCode, setPendingCode] = useState<string | null>(null);`

Add query (disabled by default, enabled when pendingCode is set):
```typescript
const { data: busySessions, isFetching: checkingBusy } = trpc.shelfAudit.getActiveSessionsForLocation.useQuery(
  { locationCode: pendingCode ?? '' },
  { enabled: !!pendingCode }
);
```

Update `handleSubmit`: instead of calling `initiateMutation.mutate` directly, set `setPendingCode(code)`.

Add `useEffect` that watches `busySessions` — if `busySessions !== undefined` and `pendingCode`:
- If `busySessions.length === 0`: call `initiateMutation.mutate({ locationCode: pendingCode })` and `setPendingCode(null)`
- If `busySessions.length > 0`: show the warning card (state: `showBusyWarning: true`)

Add warning card JSX (shown when `showBusyWarning && busySessions`):
```tsx
<Card className="border-orange-200 bg-orange-50">
  <CardHeader className="pb-2">
    <CardTitle className="text-orange-800 text-base flex items-center gap-2">
      <AlertTriangle className="h-4 w-4" />
      Ubicación en uso
    </CardTitle>
    <CardDescription className="text-orange-700">
      {busySessions.map(s => (
        <span key={s.sessionId}>
          <strong>{s.userName}</strong> ya está auditando <strong>{pendingCode}</strong> ({s.confirmedCount} confirmados).
        </span>
      ))}
      {' '}¿Deseas iniciar de todas formas?
    </CardDescription>
  </CardHeader>
  <CardContent className="pt-0 flex gap-2">
    <Button size="sm" onClick={() => { initiateMutation.mutate({ locationCode: pendingCode! }); setPendingCode(null); setShowBusyWarning(false); }}>
      Iniciar de todas formas
    </Button>
    <Button size="sm" variant="outline" onClick={() => { setPendingCode(null); setShowBusyWarning(false); }}>
      Cancelar
    </Button>
  </CardContent>
</Card>
```

- [ ] **Step 6: Run TypeScript check**

```bash
cd /home/ubuntu/alexandria-os && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
cd /home/ubuntu/alexandria-os && git add server/routers.ts client/src/pages/ShelfAudit.tsx server/shelfAudit.concurrency.test.ts && git commit -m "feat: show warning when another user is auditing the same location"
```

---

## Task 3: Audit History View

**Files:**
- Modify: `server/routers.ts` (add `getAuditHistory` procedure)
- Create: `client/src/pages/AuditHistory.tsx`
- Modify: `client/src/App.tsx` (add route `/auditoria/historial`)
- Modify: `client/src/pages/ShelfAudit.tsx` (add "Ver historial" link in CompleteStep)
- Test: `server/shelfAudit.history.test.ts` (new file)

**Backend procedure:**
```typescript
getAuditHistory: libraryProcedure
  .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
  .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    const sessions = await db
      .select({
        id: shelfAuditSessions.id,
        locationCode: shelfAuditSessions.locationCode,
        status: shelfAuditSessions.status,
        startedBy: shelfAuditSessions.startedBy,
        startedAt: shelfAuditSessions.startedAt,
        completedAt: shelfAuditSessions.completedAt,
        expectedCount: shelfAuditSessions.expectedItemUuids,
        confirmedCount: shelfAuditSessions.confirmedItemUuids,
        conflictItems: shelfAuditSessions.conflictItems,
      })
      .from(shelfAuditSessions)
      .where(and(
        eq(shelfAuditSessions.libraryId, ctx.library.id),
        inArray(shelfAuditSessions.status, ['COMPLETED', 'ABANDONED']),
      ))
      .orderBy(desc(shelfAuditSessions.startedAt))
      .limit(input.limit);
    // Enrich with operator names
    const enriched = await Promise.all(sessions.map(async (s) => {
      const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, s.startedBy)).limit(1);
      return {
        id: s.id,
        locationCode: s.locationCode,
        status: s.status,
        operatorName: user?.name ?? 'Operador',
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        expectedCount: (s.expectedCount as string[]).length,
        confirmedCount: (s.confirmedCount as string[]).length,
        conflictCount: (s.conflictItems as import('../shared/auditTypes').ConflictItem[]).filter(c => c.resolution === null).length,
      };
    }));
    return enriched;
  }),
```

**Frontend AuditHistory.tsx:** Table with columns: Fecha, Ubicación, Operador, Estado, Confirmados/Esperados, Conflictos pendientes. Use shadcn/ui Card + Table. Back button to `/auditoria`.

- [ ] **Step 1: Write the failing test**

Create `server/shelfAudit.history.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeCtx, makeMockDb } from './shelfAudit.test';

describe('shelfAudit.getAuditHistory', () => {
  beforeEach(() => { vi.resetModules(); });

  it('returns completed and abandoned sessions with operator name and counts', async () => {
    const completedSession = {
      id: 'session-done',
      locationCode: '01A',
      status: 'COMPLETED' as const,
      startedBy: 1,
      startedAt: new Date('2026-04-20T10:00:00Z'),
      completedAt: new Date('2026-04-20T11:00:00Z'),
      expectedCount: ['uuid1', 'uuid2', 'uuid3'],
      confirmedCount: ['uuid1', 'uuid2'],
      conflictItems: [{ uuid: 'uuid3', fromLocation: '02B', resolution: null }],
    };
    const mockDb = makeMockDb();
    mockDb.select
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: () => Promise.resolve([completedSession]) }),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ name: 'Ana García' }]) }) }),
      }));
    vi.doMock('../server/db', () => ({ getDb: () => Promise.resolve(mockDb) }));

    const { appRouter } = await import('./routers');
    const caller = appRouter.createCaller(makeCtx({ userId: 1 }));
    const result = await caller.shelfAudit.getAuditHistory({ limit: 50 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'session-done',
      locationCode: '01A',
      status: 'COMPLETED',
      operatorName: 'Ana García',
      expectedCount: 3,
      confirmedCount: 2,
      conflictCount: 1,
    });
  });

  it('returns empty array when no completed sessions exist', async () => {
    const mockDb = makeMockDb();
    mockDb.select.mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
    }));
    vi.doMock('../server/db', () => ({ getDb: () => Promise.resolve(mockDb) }));

    const { appRouter } = await import('./routers');
    const caller = appRouter.createCaller(makeCtx({ userId: 1 }));
    const result = await caller.shelfAudit.getAuditHistory({ limit: 50 });

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit.history.test.ts
```

Expected: FAIL — `caller.shelfAudit.getAuditHistory is not a function`

- [ ] **Step 3: Implement the backend procedure**

In `server/routers.ts`, add the `getAuditHistory` procedure inside `shelfAudit: router({`. Requires adding `inArray, desc` to the Drizzle imports at the top of the file.

Check current imports:
```bash
grep -n "^import.*drizzle-orm" server/routers.ts | head -5
```

Add `inArray, desc` if not already imported.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit.history.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Create AuditHistory.tsx frontend page**

Create `client/src/pages/AuditHistory.tsx`:

```tsx
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, ClipboardCheck } from 'lucide-react';
import { Link } from 'wouter';

export default function AuditHistory() {
  const { data: sessions, isLoading } = trpc.shelfAudit.getAuditHistory.useQuery({ limit: 50 });

  return (
    <div className="container py-6 md:py-10 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/auditoria">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-blue-600" />
            Historial de Auditorías
          </h1>
          <p className="text-sm text-gray-500">Últimas 50 sesiones completadas o abandonadas</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !sessions || sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            No hay auditorías completadas aún.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <Card key={s.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-sm font-semibold shrink-0">
                      {s.locationCode}
                    </code>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.operatorName}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(s.startedAt).toLocaleString()} 
                        {s.completedAt && ` → ${new Date(s.completedAt).toLocaleString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500">
                      {s.confirmedCount}/{s.expectedCount}
                    </span>
                    {s.conflictCount > 0 && (
                      <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-xs">
                        {s.conflictCount} conflicto{s.conflictCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={s.status === 'COMPLETED'
                        ? 'text-green-700 border-green-300 bg-green-50 text-xs'
                        : 'text-gray-500 border-gray-300 bg-gray-50 text-xs'}
                    >
                      {s.status === 'COMPLETED' ? 'Completada' : 'Abandonada'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Register route in App.tsx**

In `client/src/App.tsx`, add:
```tsx
import AuditHistory from "./pages/AuditHistory";
// Inside Router():
<Route path={"/auditoria/historial"} component={AuditHistory} />
```

- [ ] **Step 7: Add "Ver historial" link in CompleteStep**

In `client/src/pages/ShelfAudit.tsx`, find the `CompleteStep` component and add a link to `/auditoria/historial` near the "Nueva auditoría" button.

- [ ] **Step 8: Run TypeScript check**

```bash
cd /home/ubuntu/alexandria-os && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 9: Run all shelfAudit tests**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit.test.ts server/shelfAudit.concurrency.test.ts server/shelfAudit.photo.test.ts server/shelfAudit.photo.layout.test.ts server/shelfAudit.history.test.ts
```

Expected: all pass

- [ ] **Step 10: Commit**

```bash
cd /home/ubuntu/alexandria-os && git add server/routers.ts client/src/pages/AuditHistory.tsx client/src/App.tsx client/src/pages/ShelfAudit.tsx server/shelfAudit.history.test.ts && git commit -m "feat: audit history view with operator, location, counts"
```

---

## Final Verification

- [ ] Run full test suite: `npx vitest run server/shelfAudit.test.ts server/shelfAudit.concurrency.test.ts server/shelfAudit.photo.test.ts server/shelfAudit.photo.layout.test.ts server/shelfAudit.history.test.ts server/auth.logout.test.ts`
- [ ] TypeScript: `npx tsc --noEmit`
- [ ] Save checkpoint
- [ ] Push to GitHub
