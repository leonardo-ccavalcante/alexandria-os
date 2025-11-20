import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { catalogMasters, inventoryItems } from "../drizzle/schema";
import { eq } from "drizzle-orm";

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

describe("Enhanced Inventory Procedures", () => {
  const testIsbn = "9780000000001";
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const ctx = createAuthContext();
    caller = appRouter.createCaller(ctx);

    // Set up test data
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clean up any existing test data
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn));

    // Insert test catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Test Book for Inventory",
      author: "Test Author",
      publisher: "Test Publisher",
      publicationYear: 2024,
      language: "es",
      categoryLevel1: "Literatura",
      marketMinPrice: "10.00",
      marketMedianPrice: "15.00",
      lastPriceCheck: new Date(),
    });

    // Insert test inventory items
    await db.insert(inventoryItems).values([
      {
        uuid: crypto.randomUUID(),
        isbn13: testIsbn,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        locationCode: "01A",
        listingPrice: "12.00",
        costOfGoods: "5.00",
        createdBy: 1,
      },
      {
        uuid: crypto.randomUUID(),
        isbn13: testIsbn,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        locationCode: "01A",
        listingPrice: "12.00",
        costOfGoods: "5.00",
        createdBy: 1,
      },
      {
        uuid: crypto.randomUUID(),
        isbn13: testIsbn,
        status: "SOLD",
        conditionGrade: "COMO_NUEVO",
        locationCode: "01B",
        listingPrice: "15.00",
        costOfGoods: "5.00",
        createdBy: 1,
      },
    ]);
  });

  it("should get inventory grouped by ISBN with counts", async () => {
    const result = await caller.inventory.getGroupedByIsbn({
      searchText: "Test Book",
      includeZeroInventory: false,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    
    const testBook = result.find(b => b.isbn13 === testIsbn);
    expect(testBook).toBeDefined();
    expect(testBook?.title).toBe("Test Book for Inventory");
    expect(testBook?.totalQuantity).toBe(3);
    expect(testBook?.availableQuantity).toBe(2);
    expect(testBook?.locations).toContain("01A");
  });

  it("should filter by search text (title)", async () => {
    const result = await caller.inventory.getGroupedByIsbn({
      searchText: "Test Book",
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.some(b => b.isbn13 === testIsbn)).toBe(true);
  });

  it("should filter by search text (author)", async () => {
    const result = await caller.inventory.getGroupedByIsbn({
      searchText: "Test Author",
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.some(b => b.isbn13 === testIsbn)).toBe(true);
  });

  it("should filter by search text (ISBN)", async () => {
    const result = await caller.inventory.getGroupedByIsbn({
      searchText: testIsbn,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.isbn13).toBe(testIsbn);
  });

  it("should filter by publisher", async () => {
    const result = await caller.inventory.getGroupedByIsbn({
      publisher: "Test Publisher",
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.some(b => b.publisher === "Test Publisher")).toBe(true);
  });

  it("should filter by year range", async () => {
    const result = await caller.inventory.getGroupedByIsbn({
      yearFrom: 2024,
      yearTo: 2024,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.some(b => b.publicationYear === 2024)).toBe(true);
  });

  it("should filter by category", async () => {
    const result = await caller.inventory.getGroupedByIsbn({
      categoryLevel1: "Literatura",
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every(b => b.categoryLevel1 === "Literatura")).toBe(true);
  });

  it("should include zero inventory books when requested", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create a book with no inventory
    const zeroInventoryIsbn = "9780000000002";
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, zeroInventoryIsbn));
    await db.insert(catalogMasters).values({
      isbn13: zeroInventoryIsbn,
      title: "Book With No Inventory",
      author: "Test Author",
      categoryLevel1: "Literatura",
      marketMinPrice: "10.00",
      marketMedianPrice: "15.00",
      lastPriceCheck: new Date(),
    });

    const result = await caller.inventory.getGroupedByIsbn({
      includeZeroInventory: true,
      searchText: "Book With No Inventory",
    });

    const zeroBook = result.find(b => b.isbn13 === zeroInventoryIsbn);
    expect(zeroBook).toBeDefined();
    expect(zeroBook?.totalQuantity).toBe(0);
    expect(zeroBook?.availableQuantity).toBe(0);
  });

  it("should add quantity to existing ISBN", async () => {
    const beforeResult = await caller.inventory.getGroupedByIsbn({
      searchText: testIsbn,
    });
    const beforeQty = beforeResult[0]?.totalQuantity || 0;

    const addResult = await caller.inventory.addQuantity({
      isbn13: testIsbn,
      quantity: 2,
      condition: "BUENO",
      location: "02A",
    });

    expect(addResult.success).toBe(true);
    expect(addResult.items).toHaveLength(2);
    expect(addResult.items[0]?.isbn13).toBe(testIsbn);

    const afterResult = await caller.inventory.getGroupedByIsbn({
      searchText: testIsbn,
    });
    const afterQty = afterResult[0]?.totalQuantity || 0;

    expect(afterQty).toBe(beforeQty + 2);
  });

  it("should remove quantity from existing ISBN", async () => {
    const beforeResult = await caller.inventory.getGroupedByIsbn({
      searchText: testIsbn,
    });
    const beforeAvailable = beforeResult[0]?.availableQuantity || 0;

    const removeResult = await caller.inventory.removeQuantity({
      isbn13: testIsbn,
      quantity: 1,
      reason: "DONATED",
    });

    expect(removeResult.success).toBe(true);
    expect(removeResult.removed).toBe(1);

    const afterResult = await caller.inventory.getGroupedByIsbn({
      searchText: testIsbn,
    });
    const afterAvailable = afterResult[0]?.availableQuantity || 0;

    expect(afterAvailable).toBe(beforeAvailable - 1);
  });

  it("should fail to remove more quantity than available", async () => {
    const result = await caller.inventory.getGroupedByIsbn({
      searchText: testIsbn,
    });
    const available = result[0]?.availableQuantity || 0;

    await expect(
      caller.inventory.removeQuantity({
        isbn13: testIsbn,
        quantity: available + 100,
        reason: "DONATED",
      })
    ).rejects.toThrow();
  });

  it("should respect quantity limits when adding", async () => {
    await expect(
      caller.inventory.addQuantity({
        isbn13: testIsbn,
        quantity: 101, // exceeds max of 100
        condition: "BUENO",
      })
    ).rejects.toThrow();
  });

  it("should return items with correct structure", async () => {
    const result = await caller.inventory.getGroupedByIsbn({
      searchText: testIsbn,
    });

    const book = result[0];
    expect(book).toBeDefined();
    expect(book).toHaveProperty("isbn13");
    expect(book).toHaveProperty("title");
    expect(book).toHaveProperty("author");
    expect(book).toHaveProperty("totalQuantity");
    expect(book).toHaveProperty("availableQuantity");
    expect(book).toHaveProperty("locations");
    expect(book).toHaveProperty("items");
    expect(Array.isArray(book?.items)).toBe(true);
  });
});
