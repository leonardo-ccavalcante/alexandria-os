/**
 * library.test.ts
 * Comprehensive tests for multi-tenant library management:
 *  - Library creation and membership
 *  - Invitation creation, validation, acceptance, and revocation
 *  - Permission enforcement (owner / admin / member / non-member)
 *  - Tenant isolation: inventory and analytics scoped to libraryId
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

// Mock the entire libraryDb module so tests don't need a real DB
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
  createInvitation: vi.fn(),
  validateInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  getActiveInvitations: vi.fn(),
  revokeInvitation: vi.fn(),
}));

// Mock db module for user enrichment in getMembers
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

function makeUser(overrides: Partial<TrpcContext["user"]> = {}): NonNullable<TrpcContext["user"]> {
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

function makeLibrary(overrides: Partial<any> = {}) {
  return {
    id: 10,
    name: "Test Library",
    slug: "test-library",
    description: null,
    ownerId: 1,
    storageQuotaMb: 500,
    isActive: "yes",
    createdAt: new Date(),
    updatedAt: new Date(),
    memberRole: "owner",
    ...overrides,
  };
}

function makeMembership(overrides: Partial<any> = {}) {
  return {
    id: 1,
    libraryId: 10,
    userId: 1,
    role: "owner" as const,
    joinedAt: new Date(),
    ...overrides,
  };
}

function makeInvitation(overrides: Partial<any> = {}) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  return {
    id: 1,
    libraryId: 10,
    code: "550e8400-e29b-41d4-a716-446655440000",
    email: null,
    role: "member" as const,
    createdBy: 1,
    usedBy: null,
    usedAt: null,
    expiresAt,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("library.me", () => {
  it("returns the active library for the current user", async () => {
    const library = makeLibrary();
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(library);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.library.me();

    expect(result).toEqual(library);
    expect(libraryDb.getActiveLibraryForUser).toHaveBeenCalledWith(1);
  });

  it("returns null when user has no library", async () => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.library.me();

    expect(result).toBeNull();
  });
});

describe("library.create", () => {
  it("creates a library and returns it", async () => {
    const library = makeLibrary({ name: "My New Library", memberRole: "owner" });
    vi.mocked(libraryDb.createLibrary).mockResolvedValue(library);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.library.create({ name: "My New Library" });

    expect(result).toEqual(library);
    expect(libraryDb.createLibrary).toHaveBeenCalledWith(1, "My New Library", undefined);
  });

  it("rejects names shorter than 2 characters", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.library.create({ name: "A" })).rejects.toThrow();
  });
});

describe("library.update", () => {
  it("allows admin to update library name", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "admin" }));
    vi.mocked(libraryDb.updateLibrary).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.library.update({ libraryId: 10, name: "Updated Name" });

    expect(result).toEqual({ success: true });
    expect(libraryDb.updateLibrary).toHaveBeenCalledWith(10, { name: "Updated Name" });
  });

  it("rejects update from a plain member", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "member" }));

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.update({ libraryId: 10, name: "Hacked" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects update from a non-member", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.update({ libraryId: 10, name: "Hacked" })
    ).rejects.toThrow(TRPCError);
  });
});

describe("library.removeMember", () => {
  it("allows admin to remove a regular member", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "admin" }));
    vi.mocked(libraryDb.getLibraryById).mockResolvedValue(makeLibrary({ ownerId: 1 }));
    vi.mocked(libraryDb.removeMember).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.library.removeMember({ libraryId: 10, userId: 99 });

    expect(result).toEqual({ success: true });
    expect(libraryDb.removeMember).toHaveBeenCalledWith(99, 10);
  });

  it("prevents removing the library owner", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "admin" }));
    vi.mocked(libraryDb.getLibraryById).mockResolvedValue(makeLibrary({ ownerId: 99 }));

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.removeMember({ libraryId: 10, userId: 99 })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects removal by a plain member", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "member" }));

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.removeMember({ libraryId: 10, userId: 99 })
    ).rejects.toThrow(TRPCError);
  });
});

describe("library.updateMemberRole", () => {
  it("allows owner to change a member's role", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "owner" }));
    vi.mocked(libraryDb.getLibraryById).mockResolvedValue(makeLibrary({ ownerId: 1 }));
    vi.mocked(libraryDb.updateMemberRole).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.library.updateMemberRole({
      libraryId: 10,
      userId: 99,
      role: "admin",
    });

    expect(result).toEqual({ success: true });
    expect(libraryDb.updateMemberRole).toHaveBeenCalledWith(99, 10, "admin");
  });

  it("prevents changing the owner's own role", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "owner" }));
    vi.mocked(libraryDb.getLibraryById).mockResolvedValue(makeLibrary({ ownerId: 1 }));

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.updateMemberRole({ libraryId: 10, userId: 1, role: "admin" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects role change by an admin (owner-only operation)", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "admin" }));

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.updateMemberRole({ libraryId: 10, userId: 99, role: "member" })
    ).rejects.toThrow(TRPCError);
  });
});

describe("library.invitations.create", () => {
  it("allows admin to create an invitation", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "admin" }));
    const invitation = makeInvitation();
    vi.mocked(libraryDb.createInvitation).mockResolvedValue(invitation);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.library.invitations.create({
      libraryId: 10,
      role: "member",
      expiresInDays: 7,
    });

    expect(result).toEqual(invitation);
    expect(libraryDb.createInvitation).toHaveBeenCalledWith(10, 1, {
      email: undefined,
      role: "member",
      expiresInDays: 7,
    });
  });

  it("rejects invitation creation by a plain member", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "member" }));

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.invitations.create({ libraryId: 10, role: "member", expiresInDays: 7 })
    ).rejects.toThrow(TRPCError);
  });
});

describe("library.invitations.validate (public)", () => {
  it("returns valid=true and library info for a valid code", async () => {
    const invitation = makeInvitation();
    const library = makeLibrary();
    vi.mocked(libraryDb.validateInvitation).mockResolvedValue(invitation);
    vi.mocked(libraryDb.getLibraryById).mockResolvedValue(library);

    // Public procedure — no auth required
    const caller = appRouter.createCaller(makeCtx(null));
    const result = await caller.library.invitations.validate({
      code: invitation.code,
    });

    expect(result.valid).toBe(true);
    expect(result.library?.name).toBe("Test Library");
    expect(result.role).toBe("member");
  });

  it("returns valid=false for an invalid/expired code", async () => {
    vi.mocked(libraryDb.validateInvitation).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx(null));
    const result = await caller.library.invitations.validate({
      code: "00000000-0000-0000-0000-000000000000",
    });

    expect(result.valid).toBe(false);
    expect(result.library).toBeNull();
  });
});

describe("library.invitations.accept", () => {
  it("allows an authenticated user to accept a valid invitation", async () => {
    const library = makeLibrary();
    vi.mocked(libraryDb.acceptInvitation).mockResolvedValue(library);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.library.invitations.accept({
      code: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(true);
    expect(result.library).toEqual(library);
    expect(libraryDb.acceptInvitation).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      1
    );
  });

  it("propagates errors from acceptInvitation (e.g. expired invite)", async () => {
    vi.mocked(libraryDb.acceptInvitation).mockRejectedValue(
      new Error("Invalid or expired invitation code")
    );

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.invitations.accept({ code: "550e8400-e29b-41d4-a716-446655440000" })
    ).rejects.toThrow("Invalid or expired invitation code");
  });
});

describe("library.invitations.revoke", () => {
  it("allows admin to revoke an invitation", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "admin" }));
    vi.mocked(libraryDb.revokeInvitation).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.library.invitations.revoke({
      libraryId: 10,
      invitationId: 1,
    });

    expect(result).toEqual({ success: true });
    expect(libraryDb.revokeInvitation).toHaveBeenCalledWith(1, 10);
  });

  it("rejects revocation by a plain member", async () => {
    vi.mocked(libraryDb.isLibraryMember).mockResolvedValue(makeMembership({ role: "member" }));

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.invitations.revoke({ libraryId: 10, invitationId: 1 })
    ).rejects.toThrow(TRPCError);
  });
});

describe("Tenant isolation: inventory.search passes libraryId", () => {
  it("calls searchInventory with the user's active libraryId", async () => {
    const library = makeLibrary({ id: 42 });
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(library);
    vi.mocked(dbModule.searchInventory).mockResolvedValue({ items: [], total: 0 });

    const caller = appRouter.createCaller(makeCtx());
    await caller.inventory.search({ limit: 10, offset: 0 });

    expect(dbModule.searchInventory).toHaveBeenCalledWith(
      expect.objectContaining({ libraryId: 42 })
    );
  });

  it("throws FORBIDDEN when user has no library (access control enforced by libraryProcedure)", async () => {
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(null);
    vi.mocked(dbModule.searchInventory).mockResolvedValue({ items: [], total: 0 });

    const caller = appRouter.createCaller(makeCtx());
    // libraryProcedure middleware must block access when user has no library
    await expect(caller.inventory.search({ limit: 10, offset: 0 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // searchInventory must NOT be called — access was blocked upstream
    expect(dbModule.searchInventory).not.toHaveBeenCalled();
  });
});

describe("Tenant isolation: dashboard.getKPIs passes libraryId", () => {
  it("calls getDashboardKPIs with the user's active libraryId", async () => {
    const library = makeLibrary({ id: 99 });
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(library);
    vi.mocked(dbModule.getDashboardKPIs).mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx());
    await caller.dashboard.getKPIs();

    expect(dbModule.getDashboardKPIs).toHaveBeenCalledWith(99);
  });
});

describe("Tenant isolation: dashboard.getSalesByChannel passes libraryId", () => {
  it("calls getSalesByChannel with the user's active libraryId", async () => {
    const library = makeLibrary({ id: 55 });
    vi.mocked(libraryDb.getActiveLibraryForUser).mockResolvedValue(library);
    vi.mocked(dbModule.getSalesByChannel).mockResolvedValue([]);

    const caller = appRouter.createCaller(makeCtx());
    await caller.dashboard.getSalesByChannel();

    expect(dbModule.getSalesByChannel).toHaveBeenCalledWith(55);
  });
});
