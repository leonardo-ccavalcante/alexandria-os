/**
 * shelfAudit.concurrency.test.ts
 *
 * TDD tests for the concurrent audit sessions bug.
 * Problem: When User B starts an audit, User A's session is abandoned.
 * Expected: Each user has their own independent session; only the current
 * user's own previous session is abandoned on re-initiate.
 *
 * Tests:
 *  1. initiateShelfAudit does NOT abandon another user's session
 *  2. initiateShelfAudit DOES abandon the current user's own previous session
 *  3. getActiveAuditSession returns only the current user's own session
 *  4. getActiveAuditSession returns coSessions when two users audit same location
 *  5. getActiveAuditSession returns empty coSessions when users audit different locations
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("./libraryDb", () => ({
  createLibrary: vi.fn(),
  getLibrariesForUser: vi.fn(),
  getActiveLibraryForUser: vi.fn(),
  getLibraryById: vi.fn(),
  getLibraryMembers: vi.fn(),
  isLibraryMember: vi.fn(),
  updateLibrary: vi.fn(),
  removeMember: vi.fn(),
  updateMemberRole: vi.fn(),
  addMemberDirectly: vi.fn(),
  updateMemberLastActivity: vi.fn(() => Promise.resolve(undefined)),
  createInvitation: vi.fn(),
  validateInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  getActiveInvitations: vi.fn(),
  revokeInvitation: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(),
  getPool: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  getCatalogMasterByIsbn: vi.fn(),
  upsertCatalogMaster: vi.fn(),
  createInventoryItem: vi.fn(),
  getInventoryItemByUuid: vi.fn(),
  updateInventoryItem: vi.fn(),
  searchInventory: vi.fn(),
  batchUpdateInventoryItems: vi.fn(),
  createSalesTransaction: vi.fn(),
  getSalesTransactions: vi.fn(),
  getSystemSetting: vi.fn(),
  getDashboardKPIs: vi.fn(),
  getSalesByChannel: vi.fn(),
  getTopPerformingBooks: vi.fn(),
  getInventoryVelocity: vi.fn(),
  getAnalyticsByAuthor: vi.fn(),
  getAnalyticsByPublisher: vi.fn(),
  getAnalyticsByCategory: vi.fn(),
  getAnalyticsByLocation: vi.fn(),
  getActiveItemsByIsbnAndLibrary: vi.fn(),
  getActiveItemsByIsbnsBatch: vi.fn(),
  appendLocationLog: vi.fn(),
  getLocationHistory: vi.fn(),
  getAllSystemSettings: vi.fn(),
  updateSystemSetting: vi.fn(),
}));

import * as libraryDb from "./libraryDb";
import * as dbModule from "./db";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LIBRARY_ID = 42;

function makeUser(id: number): NonNullable<TrpcContext["user"]> {
  return {
    id,
    openId: `user-${id}`,
    name: `User ${id}`,
    email: `user${id}@example.com`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function makeCtx(userId: number): TrpcContext {
  return {
    user: makeUser(userId),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeLibrary() {
  return {
    id: LIBRARY_ID,
    name: "Test Library",
    slug: "test-library",
    description: null,
    ownerId: 1,
    storageQuotaMb: 500,
    isActive: "yes" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    memberRole: "owner" as const,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    libraryId: LIBRARY_ID,
    locationCode: "01A",
    status: "ACTIVE" as const,
    startedBy: 1,
    startedAt: new Date(),
    completedAt: null,
    expectedItemUuids: [],
    confirmedItemUuids: [],
    conflictItems: [],
    photoAnalysisResult: null,
    photoReconciled: false,
    ...overrides,
  };
}

/** Build a minimal Drizzle-like mock db. */
function makeMockDb() {
  const db: Record<string, unknown> = {};
  db.select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
      })),
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
  }));
  db.insert = vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) }));
  db.update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  }));
  db.transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db));
  return db as unknown as Awaited<ReturnType<typeof dbModule.getDb>>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Concurrent audit sessions — initiateShelfAudit", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("does NOT abandon another user's active session when User A initiates", async () => {
    // User B (id=2) has an existing ACTIVE session
    const sessionB = makeSession({ startedBy: 2, locationCode: "02B" });
    const newSessionA = makeSession({ startedBy: 1, locationCode: "01A" });

    const mockDb = makeMockDb();

    // Track the WHERE clause passed to the update (abandon) call
    const abandonedWhereArgs: unknown[] = [];
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn((whereArg: unknown) => {
          abandonedWhereArgs.push(whereArg);
          return Promise.resolve();
        }),
      })),
    });

    // select: 1st call = items snapshot (no .limit()), 2nd call = re-fetch new session
    let selectCallCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // items snapshot — returns array directly (no .limit())
            return Promise.resolve([]);
          }
          // re-fetch newly created session
          return { limit: vi.fn(() => Promise.resolve([newSessionA])) };
        }),
      })),
    }));

    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    const callerA = appRouter.createCaller(makeCtx(1));
    await callerA.shelfAudit.initiateShelfAudit({ locationCode: "01A" });

    // The abandon WHERE clause must include startedBy = 1 (User A's id)
    // We verify this by inspecting the SQL expression's Param values
    expect(abandonedWhereArgs).toHaveLength(1);
    const whereExpr = abandonedWhereArgs[0];
    const paramValues = extractParamValues(whereExpr);
    // Must include ctx.user.id (1) to scope the abandon to User A only
    expect(paramValues).toContain(1); // User A's id
    // Must NOT include User B's id (2) — the abandon is scoped to the current user
    expect(paramValues).not.toContain(2);
  });

  it("DOES abandon the current user's own previous session when re-initiating", async () => {
    const newSession = makeSession({ startedBy: 1, locationCode: "03C" });
    const mockDb = makeMockDb();

    const abandonedWhereArgs: unknown[] = [];
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn((whereArg: unknown) => {
          abandonedWhereArgs.push(whereArg);
          return Promise.resolve();
        }),
      })),
    });

    let selectCallCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          selectCallCount++;
          if (selectCallCount === 1) return Promise.resolve([]);
          return { limit: vi.fn(() => Promise.resolve([newSession])) };
        }),
      })),
    }));

    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    const callerA = appRouter.createCaller(makeCtx(1));
    await callerA.shelfAudit.initiateShelfAudit({ locationCode: "03C" });

    // The abandon WHERE clause must include User A's id (1)
    expect(abandonedWhereArgs).toHaveLength(1);
    const paramValues = extractParamValues(abandonedWhereArgs[0]);
    expect(paramValues).toContain(1); // scoped to User A
  });
});

describe("Concurrent audit sessions — getActiveAuditSession", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("returns only the current user's own session (not another user's)", async () => {
    // User A (id=1) has a session; User B (id=2) also has a session
    const sessionA = makeSession({ startedBy: 1, locationCode: "01A" });

    const mockDb = makeMockDb();

    // Capture the WHERE clause of the first select to verify it includes user id 1
    let firstWhereArg: unknown = null;

    // Query 1: own session → .where().limit() — capture WHERE arg
    // Query 2: otherSessions → .where() (no .limit(), returns empty array)
    (mockDb.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn((whereArg: unknown) => {
            firstWhereArg = whereArg;
            return { limit: vi.fn(() => Promise.resolve([sessionA])) };
          }),
          innerJoin: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])), // otherSessions: empty (no co-auditors)
        })),
      }));

    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    const callerA = appRouter.createCaller(makeCtx(1));
    const result = await callerA.shelfAudit.getActiveAuditSession();

    // The first WHERE clause must include ctx.user.id (1) to scope to User A
    expect(firstWhereArg).not.toBeNull();
    const firstWhereParams = extractParamValues(firstWhereArg);
    expect(firstWhereParams).toContain(1); // User A's id must be in the WHERE
    expect(result?.id).toBe(sessionA.id);
  });

  it("returns coSessions when another user audits the same location", async () => {
    const sessionA = makeSession({ startedBy: 1, locationCode: "01A", confirmedItemUuids: [] });
    const sessionB = makeSession({ startedBy: 2, locationCode: "01A", confirmedItemUuids: ["uuid-x", "uuid-y"] });

    const mockDb = makeMockDb();

    // Query 1: own session → .where().limit()
    // Query 2: otherSessions → .where() (no .limit(), returns array)
    // Query 3: user name lookup → .where().limit()
    (mockDb.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([sessionA])) })),
          innerJoin: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([sessionB])),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([{ name: "User 2" }])) })),
        })),
      }));

    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    const callerA = appRouter.createCaller(makeCtx(1));
    const result = await callerA.shelfAudit.getActiveAuditSession();

    // Must return coSessions with User B's info
    expect(result?.coSessions).toBeDefined();
    expect(result?.coSessions).toHaveLength(1);
    expect(result?.coSessions?.[0]?.userName).toBe("User 2");
    expect(result?.coSessions?.[0]?.confirmedCount).toBe(2);
  });

  it("returns empty coSessions when users audit different locations", async () => {
    const sessionA = makeSession({ startedBy: 1, locationCode: "01A" });

    const mockDb = makeMockDb();
    let selectCallCount = 0;

    (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return { limit: vi.fn(() => Promise.resolve([sessionA])) };
          }
          // No other sessions at same location
          return Promise.resolve([]);
        }),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])),
        })),
      })),
    }));

    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    const callerA = appRouter.createCaller(makeCtx(1));
    const result = await callerA.shelfAudit.getActiveAuditSession();

    // No co-session banner — different locations
    expect(result?.coSessions).toBeDefined();
    expect(result?.coSessions).toHaveLength(0);
  });
});

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Recursively extract all Param values from a Drizzle SQL expression tree.
 * Drizzle's eq(), and(), ne() etc. produce nested objects with { value } leaves.
 */
function extractParamValues(expr: unknown): unknown[] {
  if (!expr || typeof expr !== "object") return [];
  const result: unknown[] = [];
  const visited = new WeakSet<object>();

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (visited.has(node as object)) return;
    visited.add(node as object);
    const n = node as Record<string, unknown>;
    // Drizzle Param nodes have a `value` property that is a primitive
    if ("value" in n && n.value !== undefined && typeof n.value !== "object") {
      result.push(n.value);
    }
    for (const key of Object.keys(n)) {
      if (typeof n[key] === "object" && n[key] !== null) {
        visit(n[key]);
      }
    }
  }

  visit(expr);
  return result;
}
