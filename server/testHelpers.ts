/**
 * testHelpers.ts
 * Shared test utilities for integration tests that need a valid libraryId.
 *
 * Usage:
 *   import { getTestLibraryId } from "./testHelpers";
 *   const libraryId = await getTestLibraryId();
 *   await db.insert(inventoryItems).values({ ..., libraryId });
 */

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { libraryMembers, libraries } from "../drizzle/schema";

// The test user always has id=1 (as set up in createAuthContext helpers)
const TEST_USER_ID = 1;

let _cachedLibraryId: number | null = null;

/**
 * Returns the libraryId for the test user (id=1).
 * Creates a library if none exists.
 * Caches the result for the duration of the test run.
 */
export async function getTestLibraryId(): Promise<number> {
  if (_cachedLibraryId !== null) return _cachedLibraryId;

  const db = await getDb();
  if (!db) throw new Error("Database not available in test environment");

  // Find existing library for test user
  const existing = await db
    .select({ libraryId: libraryMembers.libraryId })
    .from(libraryMembers)
    .where(eq(libraryMembers.userId, TEST_USER_ID))
    .limit(1);

  if (existing[0]) {
    _cachedLibraryId = existing[0].libraryId;
    return _cachedLibraryId;
  }

  // Create a test library
  await db.insert(libraries).values({
    name: "Test Library",
    slug: `test-library-${Date.now()}`,
    ownerId: TEST_USER_ID,
    storageQuotaMb: 500,
    isActive: "yes",
  });

  const created = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(eq(libraries.ownerId, TEST_USER_ID))
    .limit(1);

  if (!created[0]) throw new Error("Failed to create test library");

  await db.insert(libraryMembers).values({
    libraryId: created[0].id,
    userId: TEST_USER_ID,
    role: "owner",
  });

  _cachedLibraryId = created[0].id;
  return _cachedLibraryId;
}

/**
 * Reset the cached library ID (call in afterAll if needed).
 */
export function resetTestLibraryCache(): void {
  _cachedLibraryId = null;
}
