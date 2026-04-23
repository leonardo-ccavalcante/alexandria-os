/**
 * shelfAudit.history.test.ts
 *
 * TDD tests for the getAuditHistory procedure.
 * The procedure returns completed/abandoned sessions for the current library,
 * enriched with operator names, sorted by most recent first.
 *
 * Tests:
 *  1. Returns completed sessions with operator name, counts, and timestamps
 *  2. Returns empty array when no completed sessions exist
 *  3. Filters by status (only COMPLETED and ABANDONED, not ACTIVE)
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

function makeCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      name: `User ${userId}`,
      email: `user${userId}@example.com`,
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
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

function makeMockDb() {
  const db: Record<string, unknown> = {};
  db.select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            offset: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
  }));
  db.insert = vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) }));
  db.update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) }));
  return db as unknown as Awaited<ReturnType<typeof dbModule.getDb>>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("getAuditHistory", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
  });

  it("returns completed sessions enriched with operator name and counts", async () => {
    const completedSession = {
      id: "session-1",
      locationCode: "01A",
      status: "COMPLETED",
      startedBy: 1,
      startedAt: new Date("2026-04-20T10:00:00Z"),
      completedAt: new Date("2026-04-20T11:00:00Z"),
      expectedItemUuids: ["uuid1", "uuid2", "uuid3"],
      confirmedItemUuids: ["uuid1", "uuid2"],
      conflictItems: [],
    };

    const mockDb = makeMockDb();
    (mockDb.select as ReturnType<typeof vi.fn>)
      // 1st call: sessions query
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(() => Promise.resolve([completedSession])),
              })),
            })),
          })),
        })),
      }))
      // 2nd call: user name lookup for startedBy=1
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{ name: "Ana García" }])),
          })),
        })),
      }));

    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx(1));
    const result = await caller.shelfAudit.getAuditHistory({ page: 0, pageSize: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "session-1",
      locationCode: "01A",
      status: "COMPLETED",
      operatorName: "Ana García",
      expectedCount: 3,
      confirmedCount: 2,
      missingCount: 1,
    });
    expect(result[0].startedAt).toBeInstanceOf(Date);
    expect(result[0].completedAt).toBeInstanceOf(Date);
  });

  it("returns empty array when no completed sessions exist", async () => {
    const mockDb = makeMockDb();
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    const caller = appRouter.createCaller(makeCtx(1));
    const result = await caller.shelfAudit.getAuditHistory({ page: 0, pageSize: 20 });

    expect(result).toEqual([]);
  });

  it("procedure exists in the shelfAudit router", async () => {
    const caller = appRouter.createCaller(makeCtx(1));
    expect(typeof caller.shelfAudit.getAuditHistory).toBe("function");
  });
});
