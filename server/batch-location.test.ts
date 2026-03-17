import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { catalogMasters, inventoryItems } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getTestLibraryId } from "./testHelpers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
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

describe("Batch Location Update", () => {
  const testIsbn = "9780000000099";
  let testItemUuids: string[] = [];
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    testLibraryId = await getTestLibraryId();
    const ctx = createAuthContext();
    caller = appRouter.createCaller(ctx);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clean up any existing test data
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn));

    // Insert test catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Test Book for Location Update",
      author: "Test Author",
      publisher: "Test Publisher",
      publicationYear: 2024,
      language: "es",
      categoryLevel1: "Literatura",
      marketMinPrice: "10.00",
      marketMedianPrice: "15.00",
      lastPriceCheck: new Date(),
    });

    // Insert test inventory items with different locations
    const uuid1 = crypto.randomUUID();
    const uuid2 = crypto.randomUUID();
    const uuid3 = crypto.randomUUID();
    testItemUuids = [uuid1, uuid2, uuid3];

    await db.insert(inventoryItems).values([
      {
        uuid: uuid1,
        isbn13: testIsbn,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        locationCode: "05D",
        listingPrice: "12.00",
        costOfGoods: "5.00",
        createdBy: 1,
        libraryId: testLibraryId,
      },
      {
        uuid: uuid2,
        isbn13: testIsbn,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        locationCode: "05D",
        listingPrice: "12.00",
        costOfGoods: "5.00",
        createdBy: 1,
        libraryId: testLibraryId,
      },
      {
        uuid: uuid3,
        isbn13: testIsbn,
        status: "SOLD",
        conditionGrade: "COMO_NUEVO",
        locationCode: "06A",
        listingPrice: "15.00",
        costOfGoods: "5.00",
        createdBy: 1,
        libraryId: testLibraryId,
      },
    ]);
  });

  it("should update location for multiple items via batch updateFromCsv", async () => {
    const result = await caller.batch.updateFromCsv({
      updates: [
        {
          uuid: testItemUuids[0]!,
          locationCode: "16D",
        },
        {
          uuid: testItemUuids[1]!,
          locationCode: "16D",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.stats.updated).toBe(2);
    expect(result.stats.errors).toHaveLength(0);

    // Verify the locations were updated
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const items = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.isbn13, testIsbn));

    const updatedItems = items.filter(
      (item) => item.uuid === testItemUuids[0] || item.uuid === testItemUuids[1]
    );

    expect(updatedItems).toHaveLength(2);
    expect(updatedItems.every((item) => item.locationCode === "16D")).toBe(true);
  });

  it("should update location for all AVAILABLE items of an ISBN", async () => {
    // Get all AVAILABLE items for the test ISBN
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const availableItems = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.isbn13, testIsbn));

    const availableUuids = availableItems
      .filter((item) => item.status === "AVAILABLE")
      .map((item) => item.uuid);

    // Update all AVAILABLE items to a new location
    const result = await caller.batch.updateFromCsv({
      updates: availableUuids.map((uuid) => ({
        uuid,
        locationCode: "20C",
      })),
    });

    expect(result.success).toBe(true);
    expect(result.stats.updated).toBe(availableUuids.length);

    // Verify all AVAILABLE items have the new location
    const updatedItems = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.isbn13, testIsbn));

    const updatedAvailable = updatedItems.filter((item) => item.status === "AVAILABLE");
    expect(updatedAvailable.every((item) => item.locationCode === "20C")).toBe(true);

    // Verify SOLD items were not affected
    const soldItems = updatedItems.filter((item) => item.status === "SOLD");
    expect(soldItems.every((item) => item.locationCode !== "20C")).toBe(true);
  });

  it("should handle empty location updates", async () => {
    const result = await caller.batch.updateFromCsv({
      updates: [
        {
          uuid: testItemUuids[0]!,
          locationCode: "",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.stats.updated).toBe(1);

    // Verify location was set to null
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const items = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.isbn13, testIsbn));

    const updatedItem = items.find((item) => item.uuid === testItemUuids[0]);
    expect(updatedItem?.locationCode).toBeNull();
  });

  it("should return errors for invalid UUIDs", async () => {
    const result = await caller.batch.updateFromCsv({
      updates: [
        {
          uuid: "invalid-uuid-does-not-exist",
          locationCode: "99Z",
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.stats.errors.length).toBeGreaterThan(0);
    expect(result.stats.updated).toBe(0);
  });

  it("should update multiple fields including location", async () => {
    const result = await caller.batch.updateFromCsv({
      updates: [
        {
          uuid: testItemUuids[0]!,
          locationCode: "25A",
          listingPrice: "18.50",
          conditionNotes: "Updated via batch",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.stats.updated).toBe(1);

    // Verify all fields were updated
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const items = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.isbn13, testIsbn));

    const updatedItem = items.find((item) => item.uuid === testItemUuids[0]);
    expect(updatedItem?.locationCode).toBe("25A");
    expect(updatedItem?.listingPrice).toBe("18.50");
    expect(updatedItem?.conditionNotes).toBe("Updated via batch");
  });

  it("should reflect location changes in grouped inventory view", async () => {
    // Update all AVAILABLE items to a unique location
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const availableItems = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.isbn13, testIsbn));

    const availableUuids = availableItems
      .filter((item) => item.status === "AVAILABLE")
      .map((item) => item.uuid);

    await caller.batch.updateFromCsv({
      updates: availableUuids.map((uuid) => ({
        uuid,
        locationCode: "30F",
      })),
    });

    // Get grouped inventory view
    const groupedResult = await caller.inventory.getGroupedByIsbn({
      searchText: testIsbn,
    });

    const book = groupedResult.items.find((b) => b.isbn13 === testIsbn);
    expect(book).toBeDefined();
    expect(book?.locations).toContain("30F");
    expect(book?.locations).toHaveLength(1); // All AVAILABLE items have same location
  });
});
