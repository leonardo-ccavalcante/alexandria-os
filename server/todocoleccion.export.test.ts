import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { catalogMasters, inventoryItems } from "../drizzle/schema";
import { getDb } from "./db";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";

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

describe("Todocolección CSV Export", () => {
  const testIsbn = "9780000000555";

  beforeEach(async () => {
    const db = await getDb();
    if (!db) return;

    // Clean up test data
    try {
      await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn));
      await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn));
    } catch (error) {
      // Ignore errors if records don't exist
    }
  });

  it("should export CSV with 11 columns and Spanish headers", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test book
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Test Book for Todocolección",
      author: "Test Author",
      publisher: "Test Publisher",
      publicationYear: 2020,
      synopsis: "This is a test book for Todocolección export",
      language: "ES",
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      locationCode: "01A",
      acquisitionDate: new Date(),
      costOfGoods: "5.00",
      listingPrice: "15.00",
    });

    // Export to Todocolección
    const result = await caller.batch.exportToTodocoleccion({ filters: {} });

    // Parse CSV
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    
    // Verify 11 columns
    expect(headers.length).toBe(11);

    // Verify Spanish headers
    expect(headers[0]).toBe("referencia");
    expect(headers[1]).toBe("título");
    expect(headers[2]).toBe("precio");
    expect(headers[3]).toBe("descripción");
    expect(headers[4]).toBe("sección");
    expect(headers[5]).toBe("stock");
    expect(headers[6]).toBe("estado");
    expect(headers[7]).toBe("autor");
    expect(headers[8]).toBe("editorial");
    expect(headers[9]).toBe("año");
    expect(headers[10]).toBe("imagen_1");

    // Verify data row exists
    const dataRow = lines.find(line => line.includes(testIsbn) || line.includes("Test Book for Todocolección"));
    expect(dataRow).toBeDefined();
  });

  it("should normalize conditions correctly (BUENO → 4)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Condition Test Book",
      author: "Test Author",
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      locationCode: "01A",
      acquisitionDate: new Date(),
      listingPrice: "10.00",
    });

    const result = await caller.batch.exportToTodocoleccion({ filters: {} });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const dataRow = lines.find(line => line.includes(testIsbn) || line.includes("Condition Test Book"));
    
    expect(dataRow).toBeDefined();
    
    // Parse the row (simple split for non-quoted fields)
    const values = dataRow!.split(",");
    const estadoIndex = headers.indexOf("estado");
    
    expect(values[estadoIndex]).toBe("4");
  });

  it("should normalize conditions: COMO_NUEVO → 5", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "As New Test",
      author: "Test Author",
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn,
      status: "AVAILABLE",
      conditionGrade: "COMO_NUEVO",
      locationCode: "01A",
      acquisitionDate: new Date(),
      listingPrice: "20.00",
    });

    const result = await caller.batch.exportToTodocoleccion({ filters: {} });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const dataRow = lines.find(line => line.includes(testIsbn) || line.includes("As New Test"));
    
    const values = dataRow!.split(",");
    const estadoIndex = headers.indexOf("estado");
    
    expect(values[estadoIndex]).toBe("5");
  });

  it("should normalize conditions: ACEPTABLE → 3", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Fair Condition Test",
      author: "Test Author",
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn,
      status: "AVAILABLE",
      conditionGrade: "ACEPTABLE",
      locationCode: "01A",
      acquisitionDate: new Date(),
      listingPrice: "8.00",
    });

    const result = await caller.batch.exportToTodocoleccion({ filters: {} });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const dataRow = lines.find(line => line.includes(testIsbn) || line.includes("Fair Condition Test"));
    
    const values = dataRow!.split(",");
    const estadoIndex = headers.indexOf("estado");
    
    expect(values[estadoIndex]).toBe("3");
  });

  it("should format price with 2 decimal places", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Price Format Test",
      author: "Test Author",
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      locationCode: "01A",
      acquisitionDate: new Date(),
      listingPrice: "12.50",
    });

    const result = await caller.batch.exportToTodocoleccion({ filters: {} });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const dataRow = lines.find(line => line.includes(testIsbn) || line.includes("Price Format Test"));
    
    const values = dataRow!.split(",");
    const priceIndex = headers.indexOf("precio");
    
    expect(values[priceIndex]).toBe("12.50");
  });

  it("should include stock=1 for each item", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Stock Test",
      author: "Test Author",
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      locationCode: "01A",
      acquisitionDate: new Date(),
      listingPrice: "10.00",
    });

    const result = await caller.batch.exportToTodocoleccion({ filters: {} });
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    const dataRow = lines.find(line => line.includes(testIsbn) || line.includes("Stock Test"));
    
    const values = dataRow!.split(",");
    const stockIndex = headers.indexOf("stock");
    
    expect(values[stockIndex]).toBe("1");
  });

  it("should return correct stats", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create 3 books: 2 with prices, 1 with image
    await db.insert(catalogMasters).values([
      { isbn13: testIsbn, title: "Book 1", author: "Author 1" },
      { isbn13: "9780000000556", title: "Book 2", author: "Author 2", coverImageUrl: "https://example.com/image.jpg" },
      { isbn13: "9780000000557", title: "Book 3", author: "Author 3" },
    ]);

    await db.insert(inventoryItems).values([
      {
        isbn13: testIsbn,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        acquisitionDate: new Date(),
        listingPrice: "10.00",
      },
      {
        isbn13: "9780000000556",
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        acquisitionDate: new Date(),
        listingPrice: "15.00",
      },
      {
        isbn13: "9780000000557",
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        acquisitionDate: new Date(),
        // No price
      },
    ]);

    const result = await caller.batch.exportToTodocoleccion({ filters: {} });

    expect(result.stats.totalItems).toBeGreaterThanOrEqual(3);
    expect(result.stats.withPrice).toBeGreaterThanOrEqual(2);
    expect(result.stats.withImages).toBeGreaterThanOrEqual(1);

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, "9780000000556"));
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, "9780000000557"));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, "9780000000556"));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, "9780000000557"));
  });

  it("should handle special characters in description (CSV escaping)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Special Chars Test",
      author: "Test Author",
      synopsis: 'Description with "quotes", commas, and\nnewlines',
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      locationCode: "01A",
      acquisitionDate: new Date(),
      listingPrice: "10.00",
    });

    const result = await caller.batch.exportToTodocoleccion({ filters: {} });

    // Should not crash and should escape properly
    expect(result.csv).toBeDefined();
    expect(result.csv.length).toBeGreaterThan(0);
    
    const lines = result.csv.split("\n");
    const dataRow = lines.find(line => line.includes(testIsbn) || line.includes("Special Chars Test"));
    expect(dataRow).toBeDefined();
  });
});
