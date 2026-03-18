/**
 * libraryRouter.ts
 * tRPC procedures for multi-tenant library management.
 *
 * Procedures:
 *  library.me                → Get the active library for the current user
 *  library.list              → List all libraries the user belongs to
 *  library.create            → Create a new library (user becomes owner)
 *  library.update            → Update library name/description (owner/admin only)
 *  library.getMembers        → List members of the active library
 *  library.removeMember      → Remove a member (owner/admin only, cannot remove owner)
 *  library.updateMemberRole  → Change a member's role (owner only)
 *  library.searchUsers       → Search registered users by name/email/openId (admin only)
 *  library.addMemberDirectly → Add a registered user directly without invitation (admin only)
 *  library.invitations.list     → List active invitations
 *  library.invitations.create   → Create an invitation link
 *  library.invitations.revoke   → Revoke an invitation
 *  library.invitations.accept   → Accept an invitation (join a library)
 *  library.invitations.validate → Validate an invite code (public, for pre-login check)
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  acceptInvitation,
  createInvitation,
  createLibrary,
  getActiveInvitations,
  getActiveLibraryForUser,
  getLibrariesForUser,
  getLibraryById,
  getLibraryMembers,
  isLibraryMember,
  removeMember,
  revokeInvitation,
  updateLibrary,
  updateMemberRole,
  validateInvitation,
} from "../libraryDb";
import { getDb } from "../db";
import { users, libraryMembers } from "../../drizzle/schema";
import { eq, inArray, or, like, and } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: assert caller is a member of a library with at least the given role
// ─────────────────────────────────────────────────────────────────────────────
type Role = "owner" | "admin" | "member";
const ROLE_RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1 };

async function assertMembership(
  userId: number,
  libraryId: number,
  minRole: Role = "member"
): Promise<void> {
  const membership = await isLibraryMember(userId, libraryId);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No eres miembro de esta biblioteca." });
  }
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Se requiere rol "${minRole}" o superior.`,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────
export const libraryRouter = router({
  /** Get the active library for the current user (first library they belong to). */
  me: protectedProcedure.query(async ({ ctx }) => {
    const library = await getActiveLibraryForUser(ctx.user!.id);
    return library;
  }),

  /** List all libraries the current user belongs to. */
  list: protectedProcedure.query(async ({ ctx }) => {
    return getLibrariesForUser(ctx.user!.id);
  }),

  /** Create a new library. The caller becomes its owner. */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(255),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const library = await createLibrary(ctx.user!.id, input.name, input.description);
      return library;
    }),

  /** Update library name/description. Requires owner or admin role. */
  update: protectedProcedure
    .input(
      z.object({
        libraryId: z.number().int().positive(),
        name: z.string().min(2).max(255).optional(),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertMembership(ctx.user!.id, input.libraryId, "admin");
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (Object.keys(updates).length > 0) {
        await updateLibrary(input.libraryId, updates as Parameters<typeof updateLibrary>[1]);
      }
      return { success: true };
    }),

  /** Get all members of a library (with user details). */
  getMembers: protectedProcedure
    .input(z.object({ libraryId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertMembership(ctx.user!.id, input.libraryId, "member");
      const members = await getLibraryMembers(input.libraryId);

      // Enrich with user display names
      const db = await getDb();
      if (!db || members.length === 0) return members.map((m) => ({ ...m, userName: null, userEmail: null }));

      const userIds = members.map((m) => m.userId);
      const userRows = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds));

      const userMap = new Map(userRows.map((u) => [u.id, u]));
      return members.map((m) => ({
        ...m,
        userName: userMap.get(m.userId)?.name ?? null,
        userEmail: userMap.get(m.userId)?.email ?? null,
      }));
    }),

  /** Remove a member from a library. Owner/admin only. Cannot remove the owner. */
  removeMember: protectedProcedure
    .input(
      z.object({
        libraryId: z.number().int().positive(),
        userId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertMembership(ctx.user!.id, input.libraryId, "admin");

      // Cannot remove the library owner
      const library = await getLibraryById(input.libraryId);
      if (!library) throw new TRPCError({ code: "NOT_FOUND", message: "Biblioteca no encontrada." });
      if (library.ownerId === input.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No se puede eliminar al propietario de la biblioteca." });
      }

      await removeMember(input.userId, input.libraryId);
      return { success: true };
    }),

  /** Update a member's role. Owner only. Cannot change the owner's own role. */
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        libraryId: z.number().int().positive(),
        userId: z.number().int().positive(),
        role: z.enum(["admin", "member"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertMembership(ctx.user!.id, input.libraryId, "owner");

      const library = await getLibraryById(input.libraryId);
      if (!library) throw new TRPCError({ code: "NOT_FOUND", message: "Biblioteca no encontrada." });
      if (library.ownerId === input.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No se puede cambiar el rol del propietario." });
      }

      await updateMemberRole(input.userId, input.libraryId, input.role);
      return { success: true };
    }),

  /**
   * Search registered users by name, email, or openId.
   * Admin/owner only. Used to find users for manual addition.
   * Returns users who are NOT already members of the library.
   */
  searchUsers: protectedProcedure
    .input(
      z.object({
        libraryId: z.number().int().positive(),
        query: z.string().min(2).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertMembership(ctx.user!.id, input.libraryId, "admin");

      const db = await getDb();
      if (!db) return [];

      const q = `%${input.query}%`;

      // Find users matching the query
      const matchingUsers = await db
        .select({ id: users.id, name: users.name, email: users.email, openId: users.openId })
        .from(users)
        .where(
          or(
            like(users.name, q),
            like(users.email, q),
            like(users.openId, q)
          )
        )
        .limit(20);

      if (matchingUsers.length === 0) return [];

      // Exclude users who are already members of this library
      const existingMemberRows = await db
        .select({ userId: libraryMembers.userId })
        .from(libraryMembers)
        .where(
          and(
            eq(libraryMembers.libraryId, input.libraryId),
            inArray(
              libraryMembers.userId,
              matchingUsers.map((u) => u.id)
            )
          )
        );

      const existingMemberIds = new Set(existingMemberRows.map((m) => m.userId));

      return matchingUsers
        .filter((u) => !existingMemberIds.has(u.id))
        .map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          openId: u.openId,
        }));
    }),

  /**
   * Add a registered user directly to the library without an invitation.
   * Admin/owner only. The user must already have a Manus account (be in the users table).
   * This is the manual alternative to the invitation link flow.
   */
  addMemberDirectly: protectedProcedure
    .input(
      z.object({
        libraryId: z.number().int().positive(),
        userId: z.number().int().positive(),
        role: z.enum(["admin", "member"]).default("member"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertMembership(ctx.user!.id, input.libraryId, "admin");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });

      // Verify the target user exists
      const targetUser = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!targetUser[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado." });
      }

      // Check if the user is already a member
      const existing = await isLibraryMember(input.userId, input.libraryId);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${targetUser[0].name ?? "El usuario"} ya es miembro de esta biblioteca.`,
        });
      }

      // Add the user directly to the library
      await db.insert(libraryMembers).values({
        libraryId: input.libraryId,
        userId: input.userId,
        role: input.role,
      });

      return {
        success: true,
        user: targetUser[0],
        role: input.role,
      };
    }),

  // ─── Invitations sub-router ───────────────────────────────────────────────
  invitations: router({
    /** List active (unused, non-expired) invitations for a library. */
    list: protectedProcedure
      .input(z.object({ libraryId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await assertMembership(ctx.user!.id, input.libraryId, "admin");
        return getActiveInvitations(input.libraryId);
      }),

    /** Create an invitation link for a library. */
    create: protectedProcedure
      .input(
        z.object({
          libraryId: z.number().int().positive(),
          email: z.string().email().optional(),
          role: z.enum(["admin", "member"]).default("member"),
          expiresInDays: z.number().int().min(1).max(30).default(7),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertMembership(ctx.user!.id, input.libraryId, "admin");
        const invitation = await createInvitation(input.libraryId, ctx.user!.id, {
          email: input.email,
          role: input.role,
          expiresInDays: input.expiresInDays,
        });
        return invitation;
      }),

    /** Revoke an invitation. */
    revoke: protectedProcedure
      .input(
        z.object({
          libraryId: z.number().int().positive(),
          invitationId: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertMembership(ctx.user!.id, input.libraryId, "admin");
        await revokeInvitation(input.invitationId, input.libraryId);
        return { success: true };
      }),

    /**
     * Accept an invitation and join the library.
     * This is called after the user is already logged in.
     */
    accept: protectedProcedure
      .input(z.object({ code: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const library = await acceptInvitation(input.code, ctx.user!.id);
        return { success: true, library };
      }),

    /**
     * Validate an invitation code (public procedure — used before login
     * to show the user which library they are being invited to).
     */
    validate: publicProcedure
      .input(z.object({ code: z.string().uuid() }))
      .query(async ({ input }) => {
        const invitation = await validateInvitation(input.code);
        if (!invitation) {
          return { valid: false, library: null };
        }
        const library = await getLibraryById(invitation.libraryId);
        return {
          valid: true,
          library: library
            ? { id: library.id, name: library.name, description: library.description }
            : null,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        };
      }),
  }),
});
