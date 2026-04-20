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
    const session = makeSession({ expectedItemUuids: [] });
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
      isbn: "9780306406157", // valid ISBN-13 with correct checksum
    });
    expect(result.outcome).toBe("not_found");
  });

  it("returns 'confirmed' when item is at the session's location", async () => {
    const session = makeSession({ locationCode: "01A" });
    const item = {
      uuid: "a0000000-0000-4000-8000-000000000002",
      isbn13: "9780000000002", // valid ISBN-13 with correct checksum
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
      isbn: "9780000000002", // valid ISBN-13 with correct checksum
    });
    expect(result.outcome).toBe("confirmed");
  });

  it("normalizes ISBN-10 to ISBN-13 before querying the DB", async () => {
    // Bug: addManualScanResult used raw input.isbn without normalizing ISBN-10 → ISBN-13.
    // ISBN-10 "8401352835" normalizes to ISBN-13 "9788401352836".
    // This test captures the SQL WHERE expression and asserts the Param value is the
    // normalized ISBN-13, not the raw ISBN-10 input.
    const session = makeSession({ locationCode: "01A" });
    const mockDb = makeMockDb();
    const capturedWhereArgs: unknown[] = [];
    let callCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn((expr: unknown) => {
          capturedWhereArgs.push(expr);
          return {
            limit: vi.fn(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([session]); // session fetch
              return Promise.resolve([]); // item not found (simulates no match)
            }),
          };
        }),
      })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    await caller.shelfAudit.addManualScanResult({
      sessionId: SESSION_ID,
      isbn: "8401352835", // ISBN-10 input
    });
    // Extract all Param values from the captured WHERE expression (2nd call = inventoryItems query)
    function findParamValues(obj: unknown): unknown[] {
      if (!obj || typeof obj !== 'object') return [];
      const o = obj as Record<string, unknown>;
      if (o.constructor?.name === 'Param') return [o.value];
      if (Array.isArray(o)) return o.flatMap(findParamValues);
      if ('queryChunks' in o) return findParamValues(o.queryChunks);
      return [];
    }
    const secondWhereArg = capturedWhereArgs[1]; // 2nd where() call = inventoryItems query
    const paramValues = findParamValues(secondWhereArg);
    // The ISBN param passed to the query MUST be the normalized ISBN-13, not the raw ISBN-10
    expect(paramValues).toContain("9788401352836");
    expect(paramValues).not.toContain("8401352835");
  });

  it("strips hyphens from ISBN-13 before querying the DB", async () => {
    // Bug: addManualScanResult used raw input.isbn without stripping hyphens.
    // Hyphenated "978-84-01-35283-6" should be stored/queried as "9788401352836".
    const session = makeSession({ locationCode: "01A" });
    const mockDb = makeMockDb();
    const capturedWhereArgs: unknown[] = [];
    let callCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn((expr: unknown) => {
          capturedWhereArgs.push(expr);
          return {
            limit: vi.fn(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([session]); // session fetch
              return Promise.resolve([]); // item not found (simulates no match)
            }),
          };
        }),
      })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());
    await caller.shelfAudit.addManualScanResult({
      sessionId: SESSION_ID,
      isbn: "978-84-01-35283-6", // hyphenated ISBN-13 input
    });
    function findParamValues(obj: unknown): unknown[] {
      if (!obj || typeof obj !== 'object') return [];
      const o = obj as Record<string, unknown>;
      if (o.constructor?.name === 'Param') return [o.value];
      if (Array.isArray(o)) return o.flatMap(findParamValues);
      if ('queryChunks' in o) return findParamValues(o.queryChunks);
      return [];
    }
    const secondWhereArg = capturedWhereArgs[1]; // 2nd where() call = inventoryItems query
    const paramValues = findParamValues(secondWhereArg);
    // The ISBN param passed to the query MUST be the normalized ISBN-13 without hyphens
    expect(paramValues).toContain("9788401352836");
    expect(paramValues).not.toContain("978-84-01-35283-6");
  });

  it("returns 'conflict' when item is at a different location", async () => {
    const session = makeSession({ locationCode: "01A" });
    const item = {
      uuid: "a0000000-0000-4000-8000-000000000002",
      isbn13: "9780000000002", // valid ISBN-13 with correct checksum
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
      isbn: "9780000000002", // valid ISBN-13 with correct checksum
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

describe("shelfAudit.analyzeShelfPhoto", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
    vi.resetModules(); // clear dynamic import caches between tests
  });

  it("fuzzy-matches high-confidence books and returns results with matchedItemUuid", async () => {
    const mockDb = makeMockDb();
    const allItems = [
      {
        uuid: "a0000000-0000-4000-8000-000000000002",
        isbn13: "9780000000001",
        title: "El Quijote",
        author: "Miguel de Cervantes",
      },
    ];

    // Call 1: innerJoin query for allItems
    // Call 2: session fetch
    let fromCallCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          // allItems query uses innerJoin
          return {
            innerJoin: vi.fn(() => ({
              where: vi.fn(() => Promise.resolve(allItems)),
            })),
          };
        }
        // session fetch uses .where().limit()
        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([makeSession({ photoAnalysisResult: null })])),
          })),
        };
      }),
    }));

    const updateSpy = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    }));
    (mockDb.update as ReturnType<typeof vi.fn>).mockImplementation(updateSpy);
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    // Dynamic imports are mocked via vi.doMock — must call before createCaller
    vi.doMock("./storage", () => ({
      storagePut: vi.fn().mockResolvedValue({ url: "https://s3.example.com/photo.jpg", key: "k" }),
    }));
    vi.doMock("./_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              books: [
                { title: "El Quijote", author: "Cervantes", isbn: null, confidence: 0.9 },
                { title: "Unknown Book", author: "Nobody", isbn: null, confidence: 0.3 },
              ],
            }),
          },
        }],
      }),
    }));

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shelfAudit.analyzeShelfPhoto({
      sessionId: SESSION_ID,
      imageBase64: Buffer.from("fake-image").toString("base64"),
    });

    expect(result).toHaveLength(2);
    const matched = result.find(r => r.title === "El Quijote");
    expect(matched?.matchedItemUuid).toBe("a0000000-0000-4000-8000-000000000002");
    const unmatched = result.find(r => r.title === "Unknown Book");
    expect(unmatched?.matchedItemUuid).toBeNull();
    expect(updateSpy).toHaveBeenCalled();
  });

  it("throws NOT_FOUND when session does not exist", async () => {
    const mockDb = makeMockDb();

    let fromCallCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          return {
            innerJoin: vi.fn(() => ({
              where: vi.fn(() => Promise.resolve([])),
            })),
          };
        }
        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])), // no session
          })),
        };
      }),
    }));

    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    vi.doMock("./storage", () => ({
      storagePut: vi.fn().mockResolvedValue({ url: "https://s3.example.com/p.jpg", key: "k" }),
    }));
    vi.doMock("./_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ books: [] }) } }],
      }),
    }));

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.shelfAudit.analyzeShelfPhoto({
        sessionId: SESSION_ID,
        imageBase64: Buffer.from("fake").toString("base64"),
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── getActiveAuditSession enrichment ────────────────────────────────────────
describe("shelfAudit.getActiveAuditSession — expectedItemDetails", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("returns expectedItemDetails joined from catalog", async () => {
    const session = { ...makeSession({ expectedItemUuids: ["uuid-A"] }), photoReconciled: false };
    const mockDb = makeMockDb();
    let selectCallCount = 0;
    (mockDb.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([session])),
            })),
          })),
        };
      }
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
    const details = (result as Record<string, unknown>).expectedItemDetails as unknown[];
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ uuid: "uuid-A", title: "Test Book", author: "Test Author", locationCode: "02B" });
  });

  it("returns empty expectedItemDetails when no expected items", async () => {
    const session = { ...makeSession({ expectedItemUuids: [] }), photoReconciled: false };
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
    expect((result as Record<string, unknown>).expectedItemDetails).toEqual([]);
  });
});

// ─── applyPhotoReconciliation ─────────────────────────────────────────────────
describe("shelfAudit.applyPhotoReconciliation", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("moves items and marks session photoReconciled", async () => {
    const session = { ...makeSession({ confirmedItemUuids: [] }), photoReconciled: false };
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
      moves: ["a0000000-0000-4000-8000-000000000010"],
      clearLocations: [],
    });
    expect(result).toEqual({ moved: 1, cleared: 0 });
    const lastUpdate = updatedSets[updatedSets.length - 1] as Record<string, unknown>;
    expect(lastUpdate.photoReconciled).toBe(true);
    expect((lastUpdate.confirmedItemUuids as string[])).toContain("a0000000-0000-4000-8000-000000000010");
  });

  it("clears locations and marks session photoReconciled", async () => {
    const session = { ...makeSession({ confirmedItemUuids: [] }), photoReconciled: false };
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
      clearLocations: ["a0000000-0000-4000-8000-000000000020"],
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
        moves: ["a0000000-0000-4000-8000-000000000010"],
        clearLocations: ["a0000000-0000-4000-8000-000000000010"],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("overlap") });
  });

  it("accepts empty arrays and marks photoReconciled", async () => {
    const session = { ...makeSession({ confirmedItemUuids: [] }), photoReconciled: false };
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

// ─── TDD: Location Clearing Scenario ──────────────────────────────────────────

describe("shelfAudit.applyPhotoReconciliation — location clearing scenario", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("clears locationCode of expected-but-unconfirmed items when user confirms photo", async () => {
    // Scenario: Shelf 07A expected items A, B, C. Photo detects X, Y, Z at different location.
    // User confirms: move X, Y, Z to 07A, clear location of A, B, C.
    // Verify: A, B, C have locationCode = NULL after mutation.

    const session = makeSession({
      locationCode: "07A",
      expectedItemUuids: ["a0000000-0000-4000-8000-000000000001", "a0000000-0000-4000-8000-000000000002", "a0000000-0000-4000-8000-000000000003"],
      confirmedItemUuids: [],
      photoReconciled: false,
    });

    const mockDb = makeMockDb();
    const updateCalls: Array<{ set: Record<string, unknown>, where: unknown }> = [];

    // Mock select for session fetch
    (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([session])),
        })),
      })),
    });

    // Mock update to capture all set() calls
    (mockDb.update as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      set: vi.fn((vals: unknown) => {
        updateCalls.push({ set: vals as Record<string, unknown>, where: null });
        return {
          where: vi.fn(() => Promise.resolve()),
        };
      }),
    }));

    // Mock insert for locationLog
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn(() => Promise.resolve()),
    });

    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);
    const caller = appRouter.createCaller(makeCtx());

    // User confirms: move X, Y, Z to 07A; clear location of A, B, C
    const result = await caller.shelfAudit.applyPhotoReconciliation({
      sessionId: SESSION_ID,
      moves: ["a0000000-0000-4000-8000-000000000010", "a0000000-0000-4000-8000-000000000011", "a0000000-0000-4000-8000-000000000012"],
      clearLocations: ["a0000000-0000-4000-8000-000000000001", "a0000000-0000-4000-8000-000000000002", "a0000000-0000-4000-8000-000000000003"],
    });

    // Verify: mutation returned correct counts
    expect(result).toEqual({ moved: 3, cleared: 3 });

    // Verify: update was called with locationCode = null for clear operation
    const clearUpdate = updateCalls.find(call => call.set.locationCode === null);
    expect(clearUpdate).toBeDefined();
    expect(clearUpdate?.set.locationCode).toBeNull();

    // Verify: update was called with locationCode = "07A" for move operation
    const moveUpdate = updateCalls.find(call => call.set.locationCode === "07A");
    expect(moveUpdate).toBeDefined();
    expect(moveUpdate?.set.locationCode).toBe("07A");

    // Verify: photoReconciled was set to true
    const finalUpdate = updateCalls[updateCalls.length - 1];
    expect(finalUpdate?.set.photoReconciled).toBe(true);
  });
});
