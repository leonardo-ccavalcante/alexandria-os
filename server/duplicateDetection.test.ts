import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { catalogMasters, inventoryItems } from "../drizzle/schema";
import { eq } from "drizzle-orm";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("Duplicate Book Detection", () => {
  // Using valid ISBNs with correct checksums
  const testIsbn = "9780306406157"; // Valid ISBN-13
  const testIsbn2 = "9780596520687"; // Valid ISBN-13

  beforeAll(async () => {
    // Clean up test data
    const db = await getDb();
    if (!db) return;

    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn));
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn2));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn2));
  });

  it("should return null inventory summary for non-existent book", async () => {
    const { getInventorySummaryByIsbn } = await import("./db");
    const summary = await getInventorySummaryByIsbn(testIsbn2);
    expect(summary).toBeNull();
  });

  it("should return inventory summary with correct counts", async () => {
    const db = await getDb();
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    // Create a test catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Test Book for Duplicate Detection",
      author: "Test Author",
      publisher: "Test Publisher",
      publishedYear: 2024,
      marketMinPrice: "10.00",
      marketMedianPrice: "15.00",
      marketMaxPrice: "20.00",
      lastPriceCheck: new Date(),
    });

    // Create 3 inventory items with different statuses and locations
    await db.insert(inventoryItems).values([
      {
        uuid: crypto.randomUUID(),
        isbn13: testIsbn,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        locationCode: "01A",
        listingPrice: "15.00",
      },
      {
        uuid: crypto.randomUUID(),
        isbn13: testIsbn,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        locationCode: "01A",
        listingPrice: "15.00",
      },
      {
        uuid: crypto.randomUUID(),
        isbn13: testIsbn,
        status: "SOLD",
        conditionGrade: "BUENO",
        locationCode: "02B",
        listingPrice: "15.00",
      },
    ]);

    const { getInventorySummaryByIsbn } = await import("./db");
    const summary = await getInventorySummaryByIsbn(testIsbn);

    expect(summary).not.toBeNull();
    expect(summary?.totalCount).toBe(3);
    expect(summary?.availableCount).toBe(2); // Only AVAILABLE items
    expect(summary?.mostCommonAllocation).toBe("01A"); // Most common location
  });

  it("should include inventory summary in checkIsbn response", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.triage.checkIsbn({ isbn: testIsbn });

    expect(result.found).toBe(true);
    expect(result.inventorySummary).toBeDefined();
    expect(result.inventorySummary?.totalCount).toBe(3);
    expect(result.inventorySummary?.availableCount).toBe(2);
    expect(result.inventorySummary?.mostCommonAllocation).toBe("01A");
  });

  it("should handle books with no inventory items", async () => {
    const db = await getDb();
    if (!db) {
      console.warn("Database not available, skipping test");
      return;
    }

    // Create catalog master without inventory items
    await db.insert(catalogMasters).values({
      isbn13: testIsbn2,
      title: "Test Book Without Inventory",
      author: "Test Author",
      publisher: "Test Publisher",
      publishedYear: 2024,
      marketMinPrice: "10.00",
      marketMedianPrice: "15.00",
      marketMaxPrice: "20.00",
      lastPriceCheck: new Date(),
    });

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.triage.checkIsbn({ isbn: testIsbn2 });

    expect(result.found).toBe(true);
    expect(result.inventorySummary).toBeNull();
  });
});
