import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { catalogMasters, inventoryItems } from "../drizzle/schema";
import { getDb } from "./db";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";
import { getTestLibraryId } from "./testHelpers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
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

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

let testLibraryId: number;

describe("Dashboard KPIs - Unique Book Counting", () => {
  const testIsbn1 = "9780000000111";
  const testIsbn2 = "9780000000222";

  beforeEach(async () => {
    testLibraryId = await getTestLibraryId();
    const db = await getDb();
    if (!db) return;

    // Clean up test data
    try {
      await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn1));
      await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn2));
      await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn1));
      await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn2));
    } catch (error) {
      // Ignore errors if records don't exist
    }
  });

  it("should count unique books (ISBNs), not individual items", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get initial KPIs
    const initialKPIs = await caller.dashboard.getKPIs();
    const initialTotal = initialKPIs.totalInventory;

    // Create 2 catalog masters
    await db.insert(catalogMasters).values([
      {
        isbn13: testIsbn1,
        title: "Book One",
        author: "Author One",
      },
      {
        isbn13: testIsbn2,
        title: "Book Two",
        author: "Author Two",
      },
    ]);

    // Create 10 copies of Book One
    for (let i = 0; i < 10; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn1,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
        libraryId: testLibraryId,
      });
    }

    // Create 5 copies of Book Two
    for (let i = 0; i < 5; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn2,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "02B",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
        libraryId: testLibraryId,
      });
    }

    // Get updated KPIs
    const updatedKPIs = await caller.dashboard.getKPIs();

    // Total inventory should increase by 2 (unique books), not 15 (individual items)
    expect(updatedKPIs.totalInventory).toBe(initialTotal + 2);
  });

  it("should count unique available books correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get initial KPIs
    const initialKPIs = await caller.dashboard.getKPIs();
    const initialAvailable = initialKPIs.available;

    // Create catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn1,
      title: "Available Book",
      author: "Test Author",
    });

    // Create 20 AVAILABLE copies
    for (let i = 0; i < 20; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn1,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
        libraryId: testLibraryId,
      });
    }

    // Get updated KPIs
    const updatedKPIs = await caller.dashboard.getKPIs();

    // Available count should increase by 1 (unique book), not 20 (individual items)
    expect(updatedKPIs.available).toBe(initialAvailable + 1);
  });

  it("should count unique listed books correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get initial KPIs
    const initialKPIs = await caller.dashboard.getKPIs();
    const initialListed = initialKPIs.listed;

    // Create catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn1,
      title: "Listed Book",
      author: "Test Author",
    });

    // Create 15 LISTED copies
    for (let i = 0; i < 15; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn1,
        status: "LISTED",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
        libraryId: testLibraryId,
      });
    }

    // Get updated KPIs
    const updatedKPIs = await caller.dashboard.getKPIs();

    // Listed count should increase by 1 (unique book), not 15 (individual items)
    expect(updatedKPIs.listed).toBe(initialListed + 1);
  });

  it("should count unique sold books correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get initial KPIs
    const initialKPIs = await caller.dashboard.getKPIs();
    const initialSold = initialKPIs.sold;

    // Create catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn1,
      title: "Sold Book",
      author: "Test Author",
    });

    // Create 8 SOLD copies
    for (let i = 0; i < 8; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn1,
        status: "SOLD",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
        libraryId: testLibraryId,
      });
    }

    // Get updated KPIs
    const updatedKPIs = await caller.dashboard.getKPIs();

    // Sold count should increase by 1 (unique book), not 8 (individual items)
    expect(updatedKPIs.sold).toBe(initialSold + 1);
  });

  it("should handle mixed statuses correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get initial KPIs
    const initialKPIs = await caller.dashboard.getKPIs();

    // Create catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn1,
      title: "Mixed Status Book",
      author: "Test Author",
    });

    // Create 5 AVAILABLE, 3 LISTED, 2 SOLD copies of the same book
    for (let i = 0; i < 5; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn1,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
        libraryId: testLibraryId,
      });
    }
    for (let i = 0; i < 3; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn1,
        status: "LISTED",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
        libraryId: testLibraryId,
      });
    }
    for (let i = 0; i < 2; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn1,
        status: "SOLD",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
        libraryId: testLibraryId,
      });
    }

    // Get updated KPIs
    const updatedKPIs = await caller.dashboard.getKPIs();

    // Each status count should increase by 1 (same unique book appears in multiple statuses)
    expect(updatedKPIs.available).toBe(initialKPIs.available + 1);
    expect(updatedKPIs.listed).toBe(initialKPIs.listed + 1);
    expect(updatedKPIs.sold).toBe(initialKPIs.sold + 1);
    
    // Total should only increase by 1 (it's the same book)
    expect(updatedKPIs.totalInventory).toBe(initialKPIs.totalInventory + 1);
  });
});
