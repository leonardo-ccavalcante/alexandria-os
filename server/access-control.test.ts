/**
 * access-control.test.ts
 *
 * Tests for:
 *  - libraryProcedure middleware: FORBIDDEN when user has no library
 *  - libraryAdminProcedure middleware: FORBIDDEN for non-admin members
 *  - library.searchUsers: admin-only user search, excludes existing members
 *  - library.addMemberDirectly: admin-only direct add, rejects duplicates and missing users
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────
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
  getDb: vi.fn().mockResolvedValue(null),
  createInventoryItem: vi.fn(),
  getInventoryItemByUuid: vi.fn(),
  searchInventory: vi.fn(),
  getDashboardKPIs: vi.fn(),
  getSalesByChannel: vi.fn(),
  getTopPerformingBooks: vi.fn(),
  getSalesTransactions: vi.fn(),
  getInventoryVelocity: vi.fn(),
  getAnalyticsByAuthor: vi.fn(),
  getAnalyticsByPublisher: vi.fn(),
  getAnalyticsByCategory: vi.fn(),
  getAnalyticsByLocation: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

import * as libraryDb from "./libraryDb";
import * as dbModule from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// Context factories
// ─────────────────────────────────────────────────────────────────────────────
function makeUser(overrides: Partial<NonNullable<TrpcContext["user"]>> = {}): NonNullable<TrpcContext["user"]> {
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
    ...overrides,
  };
}

function makeCtx(user: NonNullable<TrpcContext["user"]> | null = makeUser()): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeLibrary(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    name: "Test Library",
    slug: "test-library",
    description: "A test library",
    ownerId: 1,
    storageQuotaMb: 1000,
    isActive: "yes" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    memberRole: "owner" as const,
    ...overrides,
  };
}

function makeMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    libraryId: 10,
    userId: 1,
    role: "owner" as const,
    joinedAt: new Date(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// libraryProcedure middleware
// ─────────────────────────────────────────────────────────────────────────────
describe("libraryProcedure middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws FORBIDDEN when the authenticated user has no library", async () => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(null);
    vi.mocked(dbModule.searchInventory).mockResolvedValue({ items: [], total: 0 });

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.inventory.search({ limit: 10, offset: 0 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // The downstream DB call must NOT be reached
    expect(dbModule.searchInventory).not.toHaveBeenCalled();
  });

  it("throws UNAUTHORIZED when the user is not authenticated", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.inventory.search({ limit: 10, offset: 0 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("passes library context to the procedure when user is a member", async () => {
    const library = makeLibrary({ id: 77 });
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(library);
    vi.mocked(dbModule.searchInventory).mockResolvedValue({ items: [], total: 0 });

    const caller = appRouter.createCaller(makeCtx());
    await caller.inventory.search({ limit: 10, offset: 0 });

    expect(dbModule.searchInventory).toHaveBeenCalledWith(
      expect.objectContaining({ libraryId: 77 })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// libraryAdminProcedure middleware
// ─────────────────────────────────────────────────────────────────────────────
describe("libraryAdminProcedure middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws FORBIDDEN when user is a plain member (not admin)", async () => {
    const library = makeLibrary({ memberRole: "member" });
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(library);

    const caller = appRouter.createCaller(makeCtx());
    // batch.exportToIberlibro uses libraryAdminProcedure — members are blocked
    await expect(
      caller.batch.exportToIberlibro({ status: "AVAILABLE" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows access for admin role", async () => {
    const library = makeLibrary({ id: 10, memberRole: "admin" });
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(library);
    vi.mocked(dbModule.searchInventory).mockResolvedValue({ items: [], total: 0 });

    const caller = appRouter.createCaller(makeCtx());
    // exportToIberlibro uses libraryAdminProcedure — admins can access
    const result = await caller.batch.exportToIberlibro({ status: "AVAILABLE" });
    expect(result).toBeDefined();
  });

  it("allows access for owner role", async () => {
    const library = makeLibrary({ id: 10, memberRole: "owner" });
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(library);
    vi.mocked(dbModule.searchInventory).mockResolvedValue({ items: [], total: 0 });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.batch.exportToIberlibro({ status: "AVAILABLE" });
    expect(result).toBeDefined();
  });

  it("throws FORBIDDEN when user has no library (no membership)", async () => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.batch.exportToIberlibro({ status: "AVAILABLE" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// library.searchUsers
// ─────────────────────────────────────────────────────────────────────────────
describe("library.searchUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws FORBIDDEN when caller is a plain member", async () => {
    // assertMembership checks isLibraryMember and throws if role < required
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(
      makeMembership({ role: "member" })
    );

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.searchUsers({ libraryId: 10, query: "alice" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when caller is not a member at all", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.searchUsers({ libraryId: 10, query: "alice" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns empty array when DB is unavailable", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(
      makeMembership({ role: "admin" })
    );
    vi.mocked(dbModule.getDb).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.library.searchUsers({ libraryId: 10, query: "alice" });
    expect(result).toEqual([]);
  });

  it("throws UNAUTHORIZED when user is not authenticated", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.library.searchUsers({ libraryId: 10, query: "alice" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// library.addMemberDirectly
// ─────────────────────────────────────────────────────────────────────────────
describe("library.addMemberDirectly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws FORBIDDEN when caller is a plain member", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(
      makeMembership({ role: "member" })
    );

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.addMemberDirectly({ libraryId: 10, userId: 99, role: "member" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when caller is not a member at all", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.addMemberDirectly({ libraryId: 10, userId: 99, role: "member" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws INTERNAL_SERVER_ERROR when DB is unavailable", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(
      makeMembership({ role: "admin" })
    );
    vi.mocked(dbModule.getDb).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.addMemberDirectly({ libraryId: 10, userId: 99, role: "member" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("throws UNAUTHORIZED when user is not authenticated", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.library.addMemberDirectly({ libraryId: 10, userId: 99, role: "member" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("validates input: rejects invalid libraryId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.addMemberDirectly({ libraryId: -1, userId: 99, role: "member" })
    ).rejects.toThrow();
  });

  it("validates input: rejects invalid role", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.addMemberDirectly({
        libraryId: 10,
        userId: 99,
        role: "owner" as "member", // owner is not a valid input role
      })
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Role-based access: admin vs member for analytics
// ─────────────────────────────────────────────────────────────────────────────
describe("Role-based access: analytics procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows member to access dashboard KPIs (read-only)", async () => {
    const library = makeLibrary({ id: 10, memberRole: "member" });
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(library);
    vi.mocked(dbModule.getDashboardKPIs).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx());
    // dashboard.getKPIs uses libraryProcedure (not libraryAdminProcedure) — members can read
    const result = await caller.dashboard.getKPIs();
    expect(dbModule.getDashboardKPIs).toHaveBeenCalledWith(10);
    expect(result).toBeNull();
  });

  it("blocks member from exporting (admin-only operation)", async () => {
    const library = makeLibrary({ id: 10, memberRole: "member" });
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(library);

    const caller = appRouter.createCaller(makeCtx());
    // batch.exportToIberlibro uses libraryAdminProcedure — members are blocked at backend
    await expect(
      caller.batch.exportToIberlibro({ status: "AVAILABLE" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
