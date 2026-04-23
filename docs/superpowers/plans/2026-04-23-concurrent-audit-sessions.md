# Concurrent Audit Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the critical concurrency bug in the Auditoria workflow so that multiple users can audit simultaneously — each with their own independent session — without interfering with each other's work.

**Architecture:** Each user gets their own `shelfAuditSession` row (keyed by `startedBy = ctx.user.id`). All backend procedures that query or mutate sessions filter by both `libraryId` AND `startedBy`, so User A's session is invisible to User B's procedures. For the edge case where two users audit the same location, `getActiveAuditSession` additionally returns a `coSessions` array (other active sessions at the same location, with name + confirmedCount), displayed as a banner in the frontend. No schema migration needed — `startedBy` already exists in the DB.

**Tech Stack:** TypeScript · tRPC 11 · Drizzle ORM · MySQL · React 19 · Vitest

**Base SHA:** `efb5a18`

---

## Root Cause Summary

The bug has two components:

1. **`initiateShelfAudit` (line 2875-2880):** Abandons ALL active sessions for the library, not just the current user's previous session. When User B starts an audit, User A's session is silently abandoned.

2. **`getActiveAuditSession` (line 2827-2834):** Returns the first ACTIVE session for the library, regardless of who started it. User B sees User A's session on page load.

All other procedures (`analyzeShelfPhoto`, `resolveLocationConflict`, `addManualScanResult`, `applyPhotoReconciliation`, `completeShelfAudit`) use `sessionId` as the primary key, so they are safe — they already operate on a specific session. No changes needed there.

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `server/routers.ts` | Modify lines 2827-2834 | Add `startedBy` filter to `getActiveAuditSession`; add `coSessions` to response |
| `server/routers.ts` | Modify lines 2874-2880 | Add `startedBy` filter to abandon-on-initiate (only abandon own previous session) |
| `server/shelfAudit.concurrency.test.ts` | Create | TDD tests for all concurrency scenarios |
| `client/src/pages/ShelfAudit.tsx` | Modify `InitiateStep` (~line 362-385) | Show co-session banner when `coSessions.length > 0` |
| `client/src/pages/ShelfAudit.tsx` | Modify `ShelfAudit` main component (~line 1135-1138) | Enable polling every 10s in scan step; pass `coSessions` down |

---

## Task 1: Write failing TDD tests for the concurrency bug

**Files:**
- Create: `server/shelfAudit.concurrency.test.ts`

- [ ] **Step 1.1: Write the failing test file**

```typescript
// server/shelfAudit.concurrency.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(userId: number, libraryId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      name: `User ${userId}`,
      email: `user${userId}@test.com`,
      loginMethod: 'manus',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    library: { id: libraryId, name: 'Test Library', slug: 'test-library' },
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: {} as TrpcContext['res'],
  } as TrpcContext;
}

// ─── Mock DB ─────────────────────────────────────────────────────────────────

const sessions: Record<string, {
  id: string; libraryId: number; locationCode: string; status: string;
  startedBy: number; startedAt: Date; expectedItemUuids: string[];
  confirmedItemUuids: string[]; conflictItems: unknown[];
  photoAnalysisResult: null; photoReconciled: boolean; completedAt: Date | null;
}> = {};

const users: Record<number, { id: number; name: string }> = {
  1: { id: 1, name: 'Alice' },
  2: { id: 2, name: 'Bob' },
};

vi.mock('./db', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: unknown) => ({
          limit: () => {
            // Return sessions matching the condition
            // The condition is inspected by extracting Param values
            const params = extractParams(cond);
            const sessionId = params.find((p, i) => i === 0 && typeof p === 'string' && p.length === 36);
            const userId = params.find((p): p is number => typeof p === 'number' && p < 1000);
            const libraryId = params.find((p): p is number => typeof p === 'number' && p >= 1);
            const statusVal = params.find((p): p is string => p === 'ACTIVE' || p === 'COMPLETED' || p === 'ABANDONED');
            
            const all = Object.values(sessions);
            let filtered = all;
            if (sessionId) filtered = filtered.filter(s => s.id === sessionId);
            if (libraryId) filtered = filtered.filter(s => s.libraryId === libraryId);
            if (statusVal) filtered = filtered.filter(s => s.status === statusVal);
            if (userId) filtered = filtered.filter(s => s.startedBy === userId);
            return Promise.resolve(filtered.slice(0, 1));
          },
          orderBy: () => ({ limit: () => Promise.resolve([]) }),
        }),
        innerJoin: () => ({ where: () => Promise.resolve([]) }),
      }),
    }),
    insert: () => ({
      values: (vals: unknown) => {
        const v = vals as typeof sessions[string];
        sessions[v.id] = { ...v, status: 'ACTIVE', startedAt: new Date(), completedAt: null, photoAnalysisResult: null, photoReconciled: false };
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (vals: unknown) => ({
        where: (cond: unknown) => {
          const params = extractParams(cond);
          const sessionId = params.find((p): p is string => typeof p === 'string' && p.length === 36);
          const statusFilter = params.find((p): p is string => p === 'ACTIVE');
          const userIdFilter = params.find((p): p is number => typeof p === 'number' && p < 1000);
          const libraryIdFilter = params.find((p): p is number => typeof p === 'number' && p >= 1);
          
          Object.keys(sessions).forEach(id => {
            const s = sessions[id];
            if (sessionId && s.id !== sessionId) return;
            if (statusFilter && s.status !== statusFilter) return;
            if (userIdFilter && s.startedBy !== userIdFilter) return;
            if (libraryIdFilter && s.libraryId !== libraryIdFilter) return;
            Object.assign(s, vals);
          });
          return Promise.resolve();
        },
      }),
    }),
  }),
}));

function extractParams(expr: unknown): unknown[] {
  if (!expr || typeof expr !== 'object') return [];
  const params: unknown[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.value !== undefined && !Array.isArray(n.value) && typeof n.value !== 'object') {
      params.push(n.value);
    }
    for (const key of Object.keys(n)) {
      if (key !== 'value' && typeof n[key] === 'object') visit(n[key]);
    }
  };
  visit(expr);
  return params;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Concurrent audit sessions', () => {
  beforeEach(() => {
    // Clear all sessions before each test
    Object.keys(sessions).forEach(k => delete sessions[k]);
  });

  it('User A initiating audit does NOT abandon User B active session', async () => {
    // User B already has an active session
    const sessionBId = crypto.randomUUID();
    sessions[sessionBId] = {
      id: sessionBId, libraryId: 1, locationCode: '02B', status: 'ACTIVE',
      startedBy: 2, startedAt: new Date(), expectedItemUuids: [], confirmedItemUuids: [],
      conflictItems: [], photoAnalysisResult: null, photoReconciled: false, completedAt: null,
    };

    // User A starts a new audit
    const callerA = appRouter.createCaller(makeCtx(1));
    await callerA.shelfAudit.initiateShelfAudit({ locationCode: '01A' });

    // User B's session must still be ACTIVE
    expect(sessions[sessionBId].status).toBe('ACTIVE');
  });

  it('User A initiating audit DOES abandon their own previous session', async () => {
    // User A already has an active session
    const oldSessionId = crypto.randomUUID();
    sessions[oldSessionId] = {
      id: oldSessionId, libraryId: 1, locationCode: '01A', status: 'ACTIVE',
      startedBy: 1, startedAt: new Date(), expectedItemUuids: [], confirmedItemUuids: [],
      conflictItems: [], photoAnalysisResult: null, photoReconciled: false, completedAt: null,
    };

    // User A starts a new audit for a different location
    const callerA = appRouter.createCaller(makeCtx(1));
    await callerA.shelfAudit.initiateShelfAudit({ locationCode: '03C' });

    // User A's old session must be ABANDONED
    expect(sessions[oldSessionId].status).toBe('ABANDONED');
  });

  it('getActiveAuditSession returns only the current user own session', async () => {
    // Both users have active sessions
    const sessionAId = crypto.randomUUID();
    const sessionBId = crypto.randomUUID();
    sessions[sessionAId] = {
      id: sessionAId, libraryId: 1, locationCode: '01A', status: 'ACTIVE',
      startedBy: 1, startedAt: new Date(), expectedItemUuids: [], confirmedItemUuids: [],
      conflictItems: [], photoAnalysisResult: null, photoReconciled: false, completedAt: null,
    };
    sessions[sessionBId] = {
      id: sessionBId, libraryId: 1, locationCode: '02B', status: 'ACTIVE',
      startedBy: 2, startedAt: new Date(), expectedItemUuids: [], confirmedItemUuids: [],
      conflictItems: [], photoAnalysisResult: null, photoReconciled: false, completedAt: null,
    };

    const callerA = appRouter.createCaller(makeCtx(1));
    const result = await callerA.shelfAudit.getActiveAuditSession();

    // User A sees only their own session
    expect(result?.id).toBe(sessionAId);
    expect(result?.startedBy).toBe(1);
  });

  it('getActiveAuditSession returns coSessions when another user audits same location', async () => {
    // Both users audit the SAME location
    const sessionAId = crypto.randomUUID();
    const sessionBId = crypto.randomUUID();
    sessions[sessionAId] = {
      id: sessionAId, libraryId: 1, locationCode: '01A', status: 'ACTIVE',
      startedBy: 1, startedAt: new Date(), expectedItemUuids: [], confirmedItemUuids: ['uuid-1', 'uuid-2'],
      conflictItems: [], photoAnalysisResult: null, photoReconciled: false, completedAt: null,
    };
    sessions[sessionBId] = {
      id: sessionBId, libraryId: 1, locationCode: '01A', status: 'ACTIVE',
      startedBy: 2, startedAt: new Date(), expectedItemUuids: [], confirmedItemUuids: ['uuid-3'],
      conflictItems: [], photoAnalysisResult: null, photoReconciled: false, completedAt: null,
    };

    const callerA = appRouter.createCaller(makeCtx(1));
    const result = await callerA.shelfAudit.getActiveAuditSession();

    // User A sees their session + coSessions banner info for User B
    expect(result?.id).toBe(sessionAId);
    expect(result?.coSessions).toHaveLength(1);
    expect(result?.coSessions?.[0]?.userName).toBe('User 2');
    expect(result?.coSessions?.[0]?.confirmedCount).toBe(1);
  });

  it('getActiveAuditSession returns empty coSessions when users audit different locations', async () => {
    const sessionAId = crypto.randomUUID();
    const sessionBId = crypto.randomUUID();
    sessions[sessionAId] = {
      id: sessionAId, libraryId: 1, locationCode: '01A', status: 'ACTIVE',
      startedBy: 1, startedAt: new Date(), expectedItemUuids: [], confirmedItemUuids: [],
      conflictItems: [], photoAnalysisResult: null, photoReconciled: false, completedAt: null,
    };
    sessions[sessionBId] = {
      id: sessionBId, libraryId: 1, locationCode: '02B', status: 'ACTIVE',
      startedBy: 2, startedAt: new Date(), expectedItemUuids: [], confirmedItemUuids: [],
      conflictItems: [], photoAnalysisResult: null, photoReconciled: false, completedAt: null,
    };

    const callerA = appRouter.createCaller(makeCtx(1));
    const result = await callerA.shelfAudit.getActiveAuditSession();

    // No co-session banner — different locations
    expect(result?.coSessions).toHaveLength(0);
  });
});
```

- [ ] **Step 1.2: Run tests to confirm RED**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit.concurrency.test.ts
```

Expected: All 5 tests FAIL (procedures don't filter by `startedBy` yet, `coSessions` doesn't exist).

---

## Task 2: Fix `initiateShelfAudit` — only abandon current user's own session

**Files:**
- Modify: `server/routers.ts` lines 2874-2880

- [ ] **Step 2.1: Change the abandon WHERE clause to include `startedBy`**

Find this block (around line 2874):
```typescript
        // Abandon any existing ACTIVE session for this library
        await db.update(shelfAuditSessions)
          .set({ status: 'ABANDONED' })
          .where(and(
            eq(shelfAuditSessions.libraryId, ctx.library.id),
            eq(shelfAuditSessions.status, 'ACTIVE'),
          ));
```

Replace with:
```typescript
        // Abandon only the current user's own previous ACTIVE session (not other users')
        await db.update(shelfAuditSessions)
          .set({ status: 'ABANDONED' })
          .where(and(
            eq(shelfAuditSessions.libraryId, ctx.library.id),
            eq(shelfAuditSessions.status, 'ACTIVE'),
            eq(shelfAuditSessions.startedBy, ctx.user.id),
          ));
```

- [ ] **Step 2.2: Run tests to check progress**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit.concurrency.test.ts
```

Expected: Tests 1 and 2 now PASS. Tests 3, 4, 5 still FAIL.

---

## Task 3: Fix `getActiveAuditSession` — filter by user + add `coSessions`

**Files:**
- Modify: `server/routers.ts` lines 2823-2865

- [ ] **Step 3.1: Replace `getActiveAuditSession` query with user-scoped query + coSessions**

Find this block (around line 2823):
```typescript
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
```

Replace with:
```typescript
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        // Find only the current user's own active session
        const [session] = await db
          .select()
          .from(shelfAuditSessions)
          .where(and(
            eq(shelfAuditSessions.libraryId, ctx.library.id),
            eq(shelfAuditSessions.status, 'ACTIVE'),
            eq(shelfAuditSessions.startedBy, ctx.user.id),
          ))
          .limit(1);
        if (!session) return null;

        // Find other users' active sessions at the same location (edge case: co-audit)
        const otherSessions = await db
          .select({
            id: shelfAuditSessions.id,
            startedBy: shelfAuditSessions.startedBy,
            confirmedItemUuids: shelfAuditSessions.confirmedItemUuids,
          })
          .from(shelfAuditSessions)
          .where(and(
            eq(shelfAuditSessions.libraryId, ctx.library.id),
            eq(shelfAuditSessions.status, 'ACTIVE'),
            eq(shelfAuditSessions.locationCode, session.locationCode),
            ne(shelfAuditSessions.startedBy, ctx.user.id),
          ));

        // Enrich co-sessions with user names from the users table
        const coSessions = await Promise.all(
          otherSessions.map(async (s) => {
            const [u] = await db
              .select({ name: users.name })
              .from(users)
              .where(eq(users.id, s.startedBy))
              .limit(1);
            return {
              sessionId: s.id,
              userName: u?.name ?? `Usuario ${s.startedBy}`,
              confirmedCount: (s.confirmedItemUuids as string[]).length,
            };
          }),
        );
```

Note: You also need to add `ne` to the Drizzle imports at the top of the file. Find the existing import line:
```typescript
import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
```
And add `ne`:
```typescript
import { and, eq, inArray, like, ne, or, sql } from 'drizzle-orm';
```

Also add `users` to the schema import if not already there:
```typescript
import { catalogMasters, inventoryItems, salesTransactions, locationLog, exportHistory, InsertCatalogMaster, shelfAuditSessions, users } from "../drizzle/schema";
```

- [ ] **Step 3.2: Update the return statement to include `coSessions`**

Find the existing return at the end of `getActiveAuditSession`:
```typescript
        return { ...session, expectedItemDetails };
```

Replace with:
```typescript
        return { ...session, expectedItemDetails, coSessions };
```

- [ ] **Step 3.3: Run tests to check progress**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit.concurrency.test.ts
```

Expected: All 5 tests now PASS.

- [ ] **Step 3.4: Run all shelfAudit tests to confirm no regressions**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit
```

Expected: All existing tests still pass (40+).

---

## Task 4: Update frontend — co-session banner in InitiateStep and ScanStep

**Files:**
- Modify: `client/src/pages/ShelfAudit.tsx`

- [ ] **Step 4.1: Add co-session banner to InitiateStep (when resuming)**

In `InitiateStep` (around line 362-385), after the existing `existing ?` card that shows "Auditoría activa encontrada", add a co-session banner. The `existing` object now has a `coSessions` array.

Find this block:
```tsx
        <CardContent className="pt-0 flex gap-2">
            <Button size="sm" onClick={handleResume} className="bg-amber-600 hover:bg-amber-700 text-white">
              Continuar auditoría
            </Button>
          </CardContent>
        </Card>
```

Replace with:
```tsx
        <CardContent className="pt-0 flex flex-col gap-3">
            {existing.coSessions && existing.coSessions.length > 0 && (
              <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
                <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  {existing.coSessions.map((s: { userName: string; confirmedCount: number }) =>
                    `${s.userName} también está auditando esta ubicación (${s.confirmedCount} confirmados)`
                  ).join(' · ')}
                </span>
              </div>
            )}
            <Button size="sm" onClick={handleResume} className="bg-amber-600 hover:bg-amber-700 text-white">
              Continuar auditoría
            </Button>
          </CardContent>
        </Card>
```

- [ ] **Step 4.2: Add `Users` to the lucide-react import**

Find the lucide-react import at the top of `ShelfAudit.tsx`:
```tsx
import { AlertTriangle, ... } from 'lucide-react';
```
Add `Users` to that import.

- [ ] **Step 4.3: Add co-session banner in ScanStep**

In `ScanStep` (around line 524), add a banner that shows when `coSessions.length > 0`. The `ScanStep` component receives `session` as a prop which now includes `coSessions`.

Find the `ScanStep` function signature:
```tsx
function ScanStep({
  session,
  onComplete,
  onRefresh,
}: {
  session: AuditSession;
  onComplete: () => void;
  onRefresh: () => void;
}) {
```

After the opening of the return JSX (find the first `<div` inside the return), add:
```tsx
      {/* Co-session banner: shown only when another user audits the same location */}
      {session.coSessions && session.coSessions.length > 0 && (
        <div className="mb-4 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
          <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {session.coSessions.map((s: { userName: string; confirmedCount: number }) =>
              `${s.userName} también está auditando esta ubicación — ${s.confirmedCount} libros confirmados por ellos`
            ).join(' · ')}
          </span>
        </div>
      )}
```

- [ ] **Step 4.4: Update `AuditSession` type to include `coSessions`**

Find the `AuditSession` type definition at the top of `ShelfAudit.tsx` (around line 60-78):
```tsx
type AuditSession = ShelfAuditSession & {
  expectedItemDetails?: ExpectedItemDetail[];
};
```

Replace with:
```tsx
type CoSession = {
  sessionId: string;
  userName: string;
  confirmedCount: number;
};

type AuditSession = ShelfAuditSession & {
  expectedItemDetails?: ExpectedItemDetail[];
  coSessions?: CoSession[];
};
```

- [ ] **Step 4.5: Enable polling in ScanStep to refresh co-session data**

Find the `getActiveAuditSession` query in the main `ShelfAudit` component (around line 1135):
```tsx
  const { data: liveSession, refetch } = trpc.shelfAudit.getActiveAuditSession.useQuery(undefined, {
    enabled: step === 'scan',
    refetchInterval: false,
  });
```

Replace with:
```tsx
  const { data: liveSession, refetch } = trpc.shelfAudit.getActiveAuditSession.useQuery(undefined, {
    enabled: step === 'scan',
    // Poll every 10 seconds during scan to keep co-session data fresh
    refetchInterval: step === 'scan' ? 10_000 : false,
  });
```

---

## Task 5: Update the CardDescription text in InitiateStep

The UI currently says "Si hay una sesión activa para otra ubicación, será abandonada." — this is now incorrect (we only abandon the user's own session).

- [ ] **Step 5.1: Fix the misleading UI text**

Find (around line 392):
```tsx
            Si hay una sesión activa para otra ubicación, será abandonada.
```

Replace with:
```tsx
            Si tienes una sesión activa en otra ubicación, será abandonada al iniciar una nueva.
```

---

## Task 6: TypeScript check + full test run + commit

- [ ] **Step 6.1: TypeScript check**

```bash
cd /home/ubuntu/alexandria-os && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 6.2: Run all tests**

```bash
cd /home/ubuntu/alexandria-os && npx vitest run server/shelfAudit 2>&1 | tail -20
```

Expected: All tests pass (45+).

- [ ] **Step 6.3: Request code review**

Get SHAs:
```bash
BASE_SHA=efb5a18
HEAD_SHA=$(git rev-parse HEAD)
```

Review focus: Does the `ne()` filter in `getActiveAuditSession` correctly exclude the current user? Does the `coSessions` enrichment query handle the case where `users` table has no matching row?

- [ ] **Step 6.4: Commit**

```bash
cd /home/ubuntu/alexandria-os && git add -A && git commit -m "fix: concurrent audit sessions — each user gets own session, co-session banner for same-location edge case"
```

---

## Self-Review Checklist

| Requirement | Covered by |
|-------------|-----------|
| User A's session not abandoned when User B starts | Task 2 + Test 1 |
| User A's own old session IS abandoned when they start new one | Task 2 + Test 2 |
| `getActiveAuditSession` returns only current user's session | Task 3 + Test 3 |
| Co-session banner when two users audit same location | Task 3 + Test 4 + Task 4 |
| No banner when users audit different locations | Test 5 |
| Polling to keep co-session data fresh | Task 4.5 |
| Misleading UI text corrected | Task 5 |
| No regressions in existing tests | Task 3.4 + Task 6.2 |
| TypeScript clean | Task 6.1 |
