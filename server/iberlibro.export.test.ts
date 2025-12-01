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

describe("Iberlibro/AbeBooks TSV Export", () => {
  const testIsbn = "9780000000444";

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

  it("should export TSV with 30 columns and English headers", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test book
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Test Book for Iberlibro",
      author: "Test Author",
      publisher: "Test Publisher",
      publicationYear: 2020,
      synopsis: "This is a test book for Iberlibro export",
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

    // Export to Iberlibro
    const result = await caller.batch.exportToIberlibro({ filters: {} });

    // Parse TSV
    const lines = result.tsv.split("\n");
    const headers = lines[0].split("\t");
    
    // Verify 30 columns
    expect(headers.length).toBe(30);

    // Verify English headers
    expect(headers[0]).toBe("listingid");
    expect(headers[1]).toBe("title");
    expect(headers[2]).toBe("author");
    expect(headers[4]).toBe("price");
    expect(headers[9]).toBe("bookcondition");
    expect(headers[29]).toBe("language");

    // Verify data row exists
    const dataRow = lines.find(line => line.includes(testIsbn));
    expect(dataRow).toBeDefined();
  });

  it("should normalize conditions correctly (BUENO → Good)", async () => {
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

    const result = await caller.batch.exportToIberlibro({ filters: {} });
    const lines = result.tsv.split("\n");
    const headers = lines[0].split("\t");
    const dataRow = lines.find(line => line.includes(testIsbn));
    
    expect(dataRow).toBeDefined();
    
    // Parse the row (handle quoted fields)
    const values = dataRow!.split("\t");
    const conditionIndex = headers.indexOf("bookcondition");
    
    expect(values[conditionIndex]).toBe("Good");
  });

  it("should normalize conditions: COMO_NUEVO → As New", async () => {
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

    const result = await caller.batch.exportToIberlibro({ filters: {} });
    const lines = result.tsv.split("\n");
    const headers = lines[0].split("\t");
    const dataRow = lines.find(line => line.includes(testIsbn));
    
    const values = dataRow!.split("\t");
    const conditionIndex = headers.indexOf("bookcondition");
    
    expect(values[conditionIndex]).toBe("As New");
  });

  it("should normalize conditions: ACEPTABLE → Fair", async () => {
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

    const result = await caller.batch.exportToIberlibro({ filters: {} });
    const lines = result.tsv.split("\n");
    const headers = lines[0].split("\t");
    const dataRow = lines.find(line => line.includes(testIsbn));
    
    const values = dataRow!.split("\t");
    const conditionIndex = headers.indexOf("bookcondition");
    
    expect(values[conditionIndex]).toBe("Fair");
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

    const result = await caller.batch.exportToIberlibro({ filters: {} });
    const lines = result.tsv.split("\n");
    const headers = lines[0].split("\t");
    const dataRow = lines.find(line => line.includes(testIsbn));
    
    const values = dataRow!.split("\t");
    const priceIndex = headers.indexOf("price");
    
    expect(values[priceIndex]).toBe("12.50");
  });

  it("should include Spanish language code (SPA)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Language Test",
      author: "Test Author",
      language: "ES",
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      locationCode: "01A",
      acquisitionDate: new Date(),
      listingPrice: "10.00",
    });

    const result = await caller.batch.exportToIberlibro({ filters: {} });
    const lines = result.tsv.split("\n");
    const headers = lines[0].split("\t");
    const dataRow = lines.find(line => line.includes(testIsbn));
    
    const values = dataRow!.split("\t");
    const languageIndex = headers.indexOf("language");
    
    // Should default to SPA if not set or use stored value
    expect(values[languageIndex]).toMatch(/SPA|ES/);
  });

  it("should include shipping template ID", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Shipping Template Test",
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

    const result = await caller.batch.exportToIberlibro({ 
      filters: {}, 
      shippingTemplateId: "ST-00001" 
    });
    
    const lines = result.tsv.split("\n");
    const headers = lines[0].split("\t");
    const dataRow = lines.find(line => line.includes(testIsbn));
    
    const values = dataRow!.split("\t");
    const templateIndex = headers.indexOf("shippingtemplateid");
    
    expect(values[templateIndex]).toBe("ST-00001");
  });

  it("should return correct stats", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create 3 books: 2 with prices, 2 with ISBNs
    await db.insert(catalogMasters).values([
      { isbn13: testIsbn, title: "Book 1", author: "Author 1" },
      { isbn13: "9780000000445", title: "Book 2", author: "Author 2" },
      { isbn13: "9780000000446", title: "Book 3", author: "Author 3" },
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
        isbn13: "9780000000445",
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        acquisitionDate: new Date(),
        listingPrice: "15.00",
      },
      {
        isbn13: "9780000000446",
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        acquisitionDate: new Date(),
        // No price
      },
    ]);

    const result = await caller.batch.exportToIberlibro({ filters: {} });

    expect(result.stats.totalItems).toBeGreaterThanOrEqual(3);
    expect(result.stats.withPrice).toBeGreaterThanOrEqual(2);
    expect(result.stats.withISBN).toBeGreaterThanOrEqual(3);

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, "9780000000445"));
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, "9780000000446"));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, "9780000000445"));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, "9780000000446"));
  });

  it("should handle special characters in description (TSV escaping)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Special Chars Test",
      author: "Test Author",
      synopsis: 'Description with "quotes" and\ttabs and\nnewlines',
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      locationCode: "01A",
      acquisitionDate: new Date(),
      listingPrice: "10.00",
    });

    const result = await caller.batch.exportToIberlibro({ filters: {} });

    // Should not crash and should escape properly
    expect(result.tsv).toBeDefined();
    expect(result.tsv.length).toBeGreaterThan(0);
    
    const lines = result.tsv.split("\n");
    const dataRow = lines.find(line => line.includes(testIsbn));
    expect(dataRow).toBeDefined();
  });
});
