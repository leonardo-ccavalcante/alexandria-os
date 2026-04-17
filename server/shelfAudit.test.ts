/**
 * shelfAudit.test.ts
 *
 * Unit tests for the shelfAudit router (6 procedures, 13 tests).
 * All DB and libraryDb calls are mocked — no live DB required.
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
const SESSION_ID = "a0000000-0000-4000-8000-000000000001";

function makeUser(): NonNullable<TrpcContext["user"]> {
  return {
    id: 1,
    openId: "user-1",
    name: "Test User",
    email: "test@example.com",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function makeCtx(): TrpcContext {
  return {
    user: makeUser(),
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
    id: SESSION_ID,
    libraryId: LIBRARY_ID,
    locationCode: "01A",
    status: "ACTIVE" as const,
    startedBy: 1,
    startedAt: new Date(),
    completedAt: null,
    expectedItemUuids: ["uuid-1", "uuid-2"],
    confirmedItemUuids: [],
    conflictItems: [],
    photoAnalysisResult: null,
    ...overrides,
  };
}

/** Build a minimal Drizzle-like mock db that records calls. */
function makeMockDb() {
  const db: Record<string, unknown> = {};

  const chainEnd = (result: unknown) => ({
    limit: () => Promise.resolve(Array.isArray(result) ? result : [result]),
    where: () => ({
      limit: () => Promise.resolve(Array.isArray(result) ? result : [result]),
    }),
  });

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

describe("shelfAudit.getActiveAuditSession", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("returns null when no ACTIVE session exists", async () => {
    const mockDb = makeMockDb();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
      })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.getActiveAuditSession();
    expect(result).toBeNull();
  });

  it("returns the ACTIVE session when one exists", async () => {
    const session = makeSession();
    const mockDb = makeMockDb();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([session])) })),
      })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.getActiveAuditSession();
    expect(result).toMatchObject({ id: SESSION_ID, status: "ACTIVE" });
  });
});

describe("shelfAudit.initiateShelfAudit", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("rejects invalid locationCode format", async () => {
    const mockDb = makeMockDb();
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.shelfAudit.initiateShelfAudit({ locationCode: "bad" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("creates a new session and returns it", async () => {
    const newSession = makeSession({ expectedItemUuids: ["a0000000-0000-4000-8000-000000000010"] });
    const mockDb = makeMockDb();
    let insertCalled = false;
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn(() => { insertCalled = true; return Promise.resolve(); }),
    });
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    });
    // select calls in order:
    //  1. snapshot items at location → uses .where() directly (no .limit())
    //  2. re-fetch the newly inserted session → uses .where().limit()
    let selectCallCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // items snapshot: .select().from().where() — no .limit()
            return Promise.resolve([{ uuid: "a0000000-0000-4000-8000-000000000010" }]);
          }
          // re-fetch session: .select().from().where().limit()
          return { limit: vi.fn(() => Promise.resolve([newSession])) };
        }),
      })),
    }));
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.initiateShelfAudit({ locationCode: "01A" });
    expect(insertCalled).toBe(true);
    expect(result).toMatchObject({ status: "ACTIVE", locationCode: "01A" });
  });
});

describe("shelfAudit.addManualScanResult", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("returns 'not_found' when ISBN is unknown", async () => {
    // addManualScanResult fetches session first, then item, then catalog
    const session = makeSession();
    const mockDb = makeMockDb();
    let callCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([session]); // session fetch
            return Promise.resolve([]); // item not found, catalog not found
          }),
        })),
      })),
    }));
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.addManualScanResult({
      sessionId: SESSION_ID,
      isbn: "9999999999999",
    });
    expect(result.outcome).toBe("not_found");
  });

  it("returns 'confirmed' when item is at the session's location", async () => {
    const session = makeSession({ locationCode: "01A" });
    const item = {
      uuid: "a0000000-0000-4000-8000-000000000002",
      isbn13: "9780000000001",
      locationCode: "01A",
      status: "AVAILABLE",
      libraryId: LIBRARY_ID,
    };
    const mockDb = makeMockDb();
    let callCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([session]); // session fetch
            return Promise.resolve([item]); // item fetch
          }),
        })),
      })),
    });
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.addManualScanResult({
      sessionId: SESSION_ID,
      isbn: "9780000000001",
    });
    expect(result.outcome).toBe("confirmed");
  });

  it("returns 'conflict' when item is at a different location", async () => {
    const session = makeSession({ locationCode: "01A" });
    const item = {
      uuid: "a0000000-0000-4000-8000-000000000002",
      isbn13: "9780000000001",
      locationCode: "02B",
      status: "AVAILABLE",
      libraryId: LIBRARY_ID,
    };
    const mockDb = makeMockDb();
    let callCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([session]);
            return Promise.resolve([item]);
          }),
        })),
      })),
    });
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.addManualScanResult({
      sessionId: SESSION_ID,
      isbn: "9780000000001",
    });
    expect(result.outcome).toBe("conflict");
    expect((result as { outcome: string; fromLocation: string | null }).fromLocation).toBe("02B");
  });
});

describe("shelfAudit.resolveLocationConflict", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("updates item location when resolution is 'moved'", async () => {
    const ITEM_UUID = "a0000000-0000-4000-8000-000000000002";
    const session = makeSession({
      conflictItems: [{ uuid: ITEM_UUID, fromLocation: "02B", resolution: null }],
    });
    const mockDb = makeMockDb();
    const updateSpy = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    }));
    const insertSpy = vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) }));
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([session])) })),
      })),
    });
    (mockDb.update as ReturnType<typeof vi.fn>).mockImplementation(updateSpy);
    (mockDb.insert as ReturnType<typeof vi.fn>).mockImplementation(insertSpy);
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    await caller.shelfAudit.resolveLocationConflict({
      sessionId: SESSION_ID,
      itemUuid: ITEM_UUID,
      resolution: "moved",
      targetLocation: "01A",
    });
    expect(updateSpy).toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalled(); // locationLog insert
  });

  it("throws NOT_FOUND when session does not exist", async () => {
    const mockDb = makeMockDb();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
      })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.shelfAudit.resolveLocationConflict({
        sessionId: "a0000000-0000-4000-8000-000000000099",
        itemUuid: "a0000000-0000-4000-8000-000000000002",
        resolution: "skipped",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("shelfAudit.completeShelfAudit", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("marks unconfirmed items as MISSING and returns summary", async () => {
    const session = makeSession({
      expectedItemUuids: ["uuid-1", "uuid-2"],
      confirmedItemUuids: ["uuid-1"],
      conflictItems: [],
    });
    const mockDb = makeMockDb();
    const updateSpy = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    }));
    const insertSpy = vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) }));
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([session])) })),
      })),
    });
    (mockDb.update as ReturnType<typeof vi.fn>).mockImplementation(updateSpy);
    (mockDb.insert as ReturnType<typeof vi.fn>).mockImplementation(insertSpy);
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.completeShelfAudit({ sessionId: SESSION_ID });
    expect(result.confirmed).toBe(1);
    expect(result.missing).toBe(1);
    expect(updateSpy).toHaveBeenCalled(); // status → MISSING + session → COMPLETED
    expect(insertSpy).toHaveBeenCalled(); // locationLog entries
  });

  it("returns 0 missing when all items confirmed", async () => {
    const session = makeSession({
      expectedItemUuids: ["uuid-1"],
      confirmedItemUuids: ["uuid-1"],
      conflictItems: [],
    });
    const mockDb = makeMockDb();
    const updateSpy = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    }));
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([session])) })),
      })),
    });
    (mockDb.update as ReturnType<typeof vi.fn>).mockImplementation(updateSpy);
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn(() => Promise.resolve()),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.completeShelfAudit({ sessionId: SESSION_ID });
    expect(result.missing).toBe(0);
    expect(result.confirmed).toBe(1);
  });

  it("throws NOT_FOUND when session does not exist", async () => {
    const mockDb = makeMockDb();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
      })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.shelfAudit.completeShelfAudit({ sessionId: "a0000000-0000-4000-8000-000000000099" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
