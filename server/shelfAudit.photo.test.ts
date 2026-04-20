/**
 * shelfAudit.photo.test.ts
 *
 * TDD tests for the iOS/Android photo upload bug in analyzeShelfPhoto.
 *
 * Root causes identified via systematic debugging:
 *
 * 1. MIME type discarded — the procedure always calls storagePut(..., 'image/jpeg')
 *    regardless of the actual image format. iOS can produce WebP, PNG, or HEIC images.
 *    The S3 URL then has wrong Content-Type, causing the LLM vision API to fail or
 *    misprocess the image.
 *
 * 2. The imageBase64 field carries only the raw base64 payload. The MIME type must be
 *    passed separately (or inferred on the server) so storagePut uses the correct
 *    Content-Type.
 *
 * Fix: the client sends the full data URL (data:<mime>;base64,<payload>) OR sends
 * mimeType as a separate field. The server extracts the MIME type and uses it for
 * the S3 upload, and strips the data URL prefix before decoding the base64 payload.
 *
 * These tests are RED before the fix and GREEN after.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as libraryDb from "./libraryDb";
import * as dbModule from "./db";

// ─── Mocks (same pattern as shelfAudit.test.ts) ──────────────────────────────

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
    expectedItemUuids: [],
    confirmedItemUuids: [],
    conflictItems: [],
    photoAnalysisResult: null,
    photoReconciled: false,
    ...overrides,
  };
}

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

describe("shelfAudit.analyzeShelfPhoto — iOS/Android MIME type handling", () => {
  beforeEach(() => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(makeLibrary());
    vi.mocked(libraryDb.updateMemberLastActivity).mockResolvedValue(undefined);
    vi.resetModules();
  });

  it("uploads WebP image with correct Content-Type image/webp (not image/jpeg)", async () => {
    // Bug: the procedure always calls storagePut(..., 'image/jpeg').
    // When iOS sends a WebP image, the S3 URL has wrong Content-Type.
    // Fix: the procedure must detect the MIME type from the imageBase64 field
    // (sent as a data URL: data:image/webp;base64,...) and use it for storagePut.
    const mockDb = makeMockDb();

    // Setup DB: allItems query + session fetch
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
            limit: vi.fn(() => Promise.resolve([makeSession()])),
          })),
        };
      }),
    }));
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    // Capture what Content-Type storagePut is called with
    const storagePutSpy = vi.fn().mockResolvedValue({ url: "https://s3.example.com/photo.webp", key: "k" });
    vi.doMock("./storage", () => ({ storagePut: storagePutSpy }));
    vi.doMock("./_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ books: [] }) } }],
      }),
    }));

    const caller = appRouter.createCaller(makeCtx());

    // Send a WebP data URL (as iOS Safari would produce)
    const fakeWebpBase64 = Buffer.from("fake-webp-image-bytes").toString("base64");
    const webpDataUrl = `data:image/webp;base64,${fakeWebpBase64}`;

    await caller.shelfAudit.analyzeShelfPhoto({
      sessionId: SESSION_ID,
      imageBase64: webpDataUrl,
    });

    // The storagePut MUST be called with 'image/webp', NOT 'image/jpeg'
    expect(storagePutSpy).toHaveBeenCalled();
    const [_key, _buffer, contentType] = storagePutSpy.mock.calls[0];
    expect(contentType).toBe("image/webp");
    expect(contentType).not.toBe("image/jpeg");
  });

  it("uploads PNG image with correct Content-Type image/png", async () => {
    // Same bug: PNG images from Android screenshots or gallery must use 'image/png'
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
            limit: vi.fn(() => Promise.resolve([makeSession()])),
          })),
        };
      }),
    }));
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    const storagePutSpy = vi.fn().mockResolvedValue({ url: "https://s3.example.com/photo.png", key: "k" });
    vi.doMock("./storage", () => ({ storagePut: storagePutSpy }));
    vi.doMock("./_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ books: [] }) } }],
      }),
    }));

    const caller = appRouter.createCaller(makeCtx());

    const fakePngBase64 = Buffer.from("fake-png-image-bytes").toString("base64");
    const pngDataUrl = `data:image/png;base64,${fakePngBase64}`;

    await caller.shelfAudit.analyzeShelfPhoto({
      sessionId: SESSION_ID,
      imageBase64: pngDataUrl,
    });

    expect(storagePutSpy).toHaveBeenCalled();
    const [_key, _buffer, contentType] = storagePutSpy.mock.calls[0];
    expect(contentType).toBe("image/png");
    expect(contentType).not.toBe("image/jpeg");
  });

  it("still works with plain base64 (no data URL prefix) defaulting to image/jpeg", async () => {
    // Backward compatibility: if imageBase64 is sent as raw base64 (no data URL prefix),
    // the procedure should default to 'image/jpeg' as before.
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
            limit: vi.fn(() => Promise.resolve([makeSession()])),
          })),
        };
      }),
    }));
    (mockDb.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    });
    vi.mocked(dbModule.getDb).mockResolvedValue(mockDb);

    const storagePutSpy = vi.fn().mockResolvedValue({ url: "https://s3.example.com/photo.jpg", key: "k" });
    vi.doMock("./storage", () => ({ storagePut: storagePutSpy }));
    vi.doMock("./_core/llm", () => ({
      invokeLLM: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ books: [] }) } }],
      }),
    }));

    const caller = appRouter.createCaller(makeCtx());

    // Plain base64 without data URL prefix (backward compat)
    const rawBase64 = Buffer.from("fake-jpeg-image-bytes").toString("base64");

    await caller.shelfAudit.analyzeShelfPhoto({
      sessionId: SESSION_ID,
      imageBase64: rawBase64,
    });

    expect(storagePutSpy).toHaveBeenCalled();
    const [_key, _buffer, contentType] = storagePutSpy.mock.calls[0];
    expect(contentType).toBe("image/jpeg");
  });
});
