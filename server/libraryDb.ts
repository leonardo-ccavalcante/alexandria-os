/**
 * libraryDb.ts
 * Database helpers for multi-tenant library management.
 * All inventory/transaction queries should call getActiveLibraryId(userId)
 * and filter by the returned libraryId.
 */

import { and, eq, gt, isNull } from "drizzle-orm";
import {
  InsertLibrary,
  InsertLibraryInvitation,
  InsertLibraryMember,
  libraries,
  libraryInvitations,
  libraryMembers,
  Library,
  LibraryInvitation,
  LibraryMember,
} from "../drizzle/schema";
import { getDb } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// Library helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Slugify a library name for URL-safe identifiers. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

/** Ensure slug is unique by appending a counter if needed. */
async function uniqueSlug(base: string): Promise<string> {
  const db = await getDb();
  if (!db) return `${base}-${Date.now()}`;
  let slug = base;
  let counter = 1;
  while (true) {
    const existing = await db
      .select({ id: libraries.id })
      .from(libraries)
      .where(eq(libraries.slug, slug))
      .limit(1);
    if (existing.length === 0) return slug;
    slug = `${base}-${counter++}`;
  }
}

/** Create a new library and make the user its owner. */
export async function createLibrary(
  ownerId: number,
  name: string,
  description?: string
): Promise<Library> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const slug = await uniqueSlug(slugify(name));
  const values: InsertLibrary = {
    name,
    slug,
    description: description ?? null,
    ownerId,
    storageQuotaMb: 500,
    isActive: "yes",
  };

  await db.insert(libraries).values(values);

  const created = await db
    .select()
    .from(libraries)
    .where(eq(libraries.slug, slug))
    .limit(1);
  if (!created[0]) throw new Error("Failed to create library");

  // Add owner as member with role 'owner'
  await db.insert(libraryMembers).values({
    libraryId: created[0].id,
    userId: ownerId,
    role: "owner",
    joinedVia: "owner",
    addedByUserId: null,
    lastActivityAt: new Date(),
  });

  return created[0];
}

/** Get all libraries a user belongs to. */
export async function getLibrariesForUser(userId: number): Promise<
  Array<Library & { memberRole: LibraryMember["role"] }>
> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: libraries.id,
      name: libraries.name,
      slug: libraries.slug,
      description: libraries.description,
      ownerId: libraries.ownerId,
      storageQuotaMb: libraries.storageQuotaMb,
      isActive: libraries.isActive,
      createdAt: libraries.createdAt,
      updatedAt: libraries.updatedAt,
      memberRole: libraryMembers.role,
    })
    .from(libraryMembers)
    .innerJoin(libraries, eq(libraryMembers.libraryId, libraries.id))
    .where(
      and(eq(libraryMembers.userId, userId), eq(libraries.isActive, "yes"))
    );

  return rows as Array<Library & { memberRole: LibraryMember["role"] }>;
}

/**
 * Get the active library for a user.
 * Returns the first (and usually only) library the user belongs to.
 * In the future this can be extended to support a "selected library" session.
 */
export async function getActiveLibraryForUser(
  userId: number
): Promise<(Library & { memberRole: LibraryMember["role"] }) | null> {
  const libs = await getLibrariesForUser(userId);
  return libs[0] ?? null;
}

/** Get a library by its ID. */
export async function getLibraryById(id: number): Promise<Library | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Get all members of a library. */
export async function getLibraryMembers(libraryId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(libraryMembers)
    .where(eq(libraryMembers.libraryId, libraryId));
}

/** Check if a user is a member of a library. */
export async function isLibraryMember(
  userId: number,
  libraryId: number
): Promise<LibraryMember | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(libraryMembers)
    .where(
      and(
        eq(libraryMembers.userId, userId),
        eq(libraryMembers.libraryId, libraryId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Update a library's details (admin/owner only). */
export async function updateLibrary(
  libraryId: number,
  data: Partial<Pick<InsertLibrary, "name" | "description" | "storageQuotaMb" | "isActive">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(libraries).set(data).where(eq(libraries.id, libraryId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Invitation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create an invitation code for a library (expires in 7 days by default). */
export async function createInvitation(
  libraryId: number,
  createdBy: number,
  options: {
    email?: string;
    role?: "admin" | "member";
    expiresInDays?: number;
  } = {}
): Promise<LibraryInvitation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const code = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (options.expiresInDays ?? 7));

  const values: InsertLibraryInvitation = {
    libraryId,
    code,
    email: options.email ?? null,
    role: options.role ?? "member",
    createdBy,
    expiresAt,
  };

  await db.insert(libraryInvitations).values(values);

  const created = await db
    .select()
    .from(libraryInvitations)
    .where(eq(libraryInvitations.code, code))
    .limit(1);
  if (!created[0]) throw new Error("Failed to create invitation");
  return created[0];
}

/** Validate an invitation code. Returns the invitation if valid, null otherwise. */
export async function validateInvitation(
  code: string
): Promise<LibraryInvitation | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(libraryInvitations)
    .where(
      and(
        eq(libraryInvitations.code, code),
        isNull(libraryInvitations.usedBy),
        gt(libraryInvitations.expiresAt, new Date())
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Accept an invitation: add the user to the library and mark invite as used.
 * Returns the library the user joined.
 */
export async function acceptInvitation(
  code: string,
  userId: number
): Promise<Library> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const invitation = await validateInvitation(code);
  if (!invitation) throw new Error("Invalid or expired invitation code");

  // Check if user is already a member
  const existing = await isLibraryMember(userId, invitation.libraryId);
  if (!existing) {
    await db.insert(libraryMembers).values({
      libraryId: invitation.libraryId,
      userId,
      role: invitation.role,
      joinedVia: "invitation",
      addedByUserId: invitation.createdBy,
      lastActivityAt: new Date(),
    });
  }

  // Mark invitation as used
  await db
    .update(libraryInvitations)
    .set({ usedBy: userId, usedAt: new Date() })
    .where(eq(libraryInvitations.code, code));

  const library = await getLibraryById(invitation.libraryId);
  if (!library) throw new Error("Library not found");
  return library;
}

/** List all active (unused, non-expired) invitations for a library. */
export async function getActiveInvitations(
  libraryId: number
): Promise<LibraryInvitation[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(libraryInvitations)
    .where(
      and(
        eq(libraryInvitations.libraryId, libraryId),
        isNull(libraryInvitations.usedBy),
        gt(libraryInvitations.expiresAt, new Date())
      )
    );
}

/** Revoke (delete) an invitation. */
export async function revokeInvitation(
  invitationId: number,
  libraryId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(libraryInvitations)
    .where(
      and(
        eq(libraryInvitations.id, invitationId),
        eq(libraryInvitations.libraryId, libraryId)
      )
    );
}

/**
 * Add a member directly (manual addition by an admin).
 * Records who added them and sets joinedVia = 'manual'.
 */
export async function addMemberDirectly(
  libraryId: number,
  userId: number,
  role: "admin" | "member",
  addedByUserId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(libraryMembers).values({
    libraryId,
    userId,
    role,
    joinedVia: "manual",
    addedByUserId,
    lastActivityAt: new Date(),
  });
}

/**
 * Update the lastActivityAt timestamp for a library member.
 * Called by the libraryProcedure middleware on each authenticated request.
 */
export async function updateMemberLastActivity(
  userId: number,
  libraryId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(libraryMembers)
    .set({ lastActivityAt: new Date() })
    .where(
      and(
        eq(libraryMembers.userId, userId),
        eq(libraryMembers.libraryId, libraryId)
      )
    );
}

/** Remove a member from a library (cannot remove the owner). */
export async function removeMember(
  userId: number,
  libraryId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(libraryMembers)
    .where(
      and(
        eq(libraryMembers.userId, userId),
        eq(libraryMembers.libraryId, libraryId)
      )
    );
}

/** Update a member's role within a library. */
export async function updateMemberRole(
  userId: number,
  libraryId: number,
  role: "admin" | "member"
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(libraryMembers)
    .set({ role })
    .where(
      and(
        eq(libraryMembers.userId, userId),
        eq(libraryMembers.libraryId, libraryId)
      )
    );
}
