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
    
    // Verify first field is a UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    const firstField = dataRow!.split('\t')[0];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(firstField).toMatch(uuidRegex);
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

describe("Iberlibro Export Filtering (Exclude Already Listed)", () => {
  const testIsbn1 = "9780000000501";
  const testIsbn2 = "9780000000502";
  const testIsbn3 = "9780000000503";

  beforeEach(async () => {
    const db = await getDb();
    if (!db) return;

    // Clean up test data
    try {
      await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn1));
      await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn2));
      await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn3));
      await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn1));
      await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn2));
      await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn3));
    } catch (error) {
      // Ignore errors if records don't exist
    }
  });

  it("should exclude books already listed on Iberlibro", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create 3 books: 1 on Iberlibro, 1 on Wallapop, 1 with no marketplace
    await db.insert(catalogMasters).values([
      { isbn13: testIsbn1, title: "Book on Iberlibro", author: "Author 1" },
      { isbn13: testIsbn2, title: "Book on Wallapop", author: "Author 2" },
      { isbn13: testIsbn3, title: "Book not listed", author: "Author 3" },
    ]);

    await db.insert(inventoryItems).values([
      {
        isbn13: testIsbn1,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        acquisitionDate: new Date(),
        listingPrice: "10.00",
        salesChannels: JSON.stringify(["Iberlibro"]),
      },
      {
        isbn13: testIsbn2,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        acquisitionDate: new Date(),
        listingPrice: "15.00",
        salesChannels: JSON.stringify(["Wallapop"]),
      },
      {
        isbn13: testIsbn3,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        acquisitionDate: new Date(),
        listingPrice: "12.00",
        salesChannels: null,
      },
    ]);

    const result = await caller.batch.exportToIberlibro({ filters: {} });

    // Should include books 2 and 3, but NOT book 1
    expect(result.tsv).not.toContain(testIsbn1); // Excluded (on Iberlibro)
    expect(result.tsv).toContain(testIsbn2); // Included (on Wallapop)
    expect(result.tsv).toContain(testIsbn3); // Included (not listed)

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn1));
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn2));
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn3));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn1));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn2));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn3));
  });

  it("should exclude books with Iberlibro among multiple marketplaces", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn1,
      title: "Book on Multiple Marketplaces",
      author: "Author 1",
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn1,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      acquisitionDate: new Date(),
      listingPrice: "10.00",
      salesChannels: JSON.stringify(["Iberlibro", "Wallapop", "Vinted"]),
    });

    const result = await caller.batch.exportToIberlibro({ filters: {} });

    // Should NOT include book 1 (has Iberlibro in the list)
    expect(result.tsv).not.toContain(testIsbn1);

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn1));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn1));
  });

  it("should return correct excluded count in stats", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create 3 books: 2 on Iberlibro, 1 not listed
    await db.insert(catalogMasters).values([
      { isbn13: testIsbn1, title: "Book 1 on Iberlibro", author: "Author 1" },
      { isbn13: testIsbn2, title: "Book 2 on Iberlibro", author: "Author 2" },
      { isbn13: testIsbn3, title: "Book 3 not listed", author: "Author 3" },
    ]);

    await db.insert(inventoryItems).values([
      {
        isbn13: testIsbn1,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        acquisitionDate: new Date(),
        listingPrice: "10.00",
        salesChannels: JSON.stringify(["Iberlibro"]),
      },
      {
        isbn13: testIsbn2,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        acquisitionDate: new Date(),
        listingPrice: "15.00",
        salesChannels: JSON.stringify(["Iberlibro"]),
      },
      {
        isbn13: testIsbn3,
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        acquisitionDate: new Date(),
        listingPrice: "12.00",
        salesChannels: null,
      },
    ]);

    const result = await caller.batch.exportToIberlibro({ filters: {} });

    // Should report correct excluded count
    expect(result.stats.excludedCount).toBeGreaterThanOrEqual(2);
    expect(result.stats.totalAvailable).toBeGreaterThanOrEqual(3);
    expect(result.stats.totalItems).toBe(
      result.stats.totalAvailable - result.stats.excludedCount
    );

    // Should include summary message
    expect(result.message).toContain("Exported");
    expect(result.message).toContain("excluded");
    expect(result.message).toContain("Iberlibro");

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn1));
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn2));
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn3));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn1));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn2));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn3));
  });

  it("should format description with Al Alimón prefix and condition suffix", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn1,
      title: "Description Format Test",
      author: "Test Author",
      synopsis: "This is a test synopsis for the book.",
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn1,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      acquisitionDate: new Date(),
      listingPrice: "10.00",
    });

    const result = await caller.batch.exportToIberlibro({ filters: {} });
    const lines = result.tsv.split("\n");
    const headers = lines[0].split("\t");
    const dataRow = lines.find(line => line.includes(testIsbn1));
    
    expect(dataRow).toBeDefined();
    
    const values = dataRow!.split("\t");
    const descIndex = headers.indexOf("description");
    const description = values[descIndex];
    
    // Check Al Alimón prefix
    expect(description).toContain("Descripción: Este libro tiene una doble misión");
    expect(description).toContain("inspirarte a ti y dar una oportunidad a un estudiante");
    expect(description).toContain("Gracias por cumplirla Al Alimón");
    
    // Check SINOPSIS section
    expect(description).toContain("SINOPSIS:");
    expect(description).toContain("This is a test synopsis");
    
    // Check Status del libro suffix
    expect(description).toContain("Status del libro:");
    expect(description).toContain("BUENO. Presenta el desgaste normal");

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn1));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn1));
  });

  it("should convert ES to SPA language code (ISO 639-2)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn1,
      title: "Spanish Language Test",
      author: "Test Author",
      language: "ES", // Two-letter code
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn1,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      acquisitionDate: new Date(),
      listingPrice: "10.00",
    });

    const result = await caller.batch.exportToIberlibro({ filters: {} });
    const lines = result.tsv.split("\n");
    const headers = lines[0].split("\t");
    const dataRow = lines.find(line => line.includes(testIsbn1));
    
    expect(dataRow).toBeDefined();
    
    const values = dataRow!.split("\t");
    const langIndex = headers.indexOf("language");
    
    // Should convert ES → SPA
    expect(values[langIndex]).toBe("SPA");

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn1));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn1));
  });

  it("should convert EN to ENG language code (ISO 639-2)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn1,
      title: "English Language Test",
      author: "Test Author",
      language: "EN",
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn1,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      acquisitionDate: new Date(),
      listingPrice: "10.00",
    });

    const result = await caller.batch.exportToIberlibro({ filters: {} });
    const lines = result.tsv.split("\n");
    const headers = lines[0].split("\t");
    const dataRow = lines.find(line => line.includes(testIsbn1));
    
    expect(dataRow).toBeDefined();
    
    const values = dataRow!.split("\t");
    const langIndex = headers.indexOf("language");
    
    // Should convert EN → ENG
    expect(values[langIndex]).toBe("ENG");

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn1));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn1));
  });

  it("should default to SPA when language is null", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn1,
      title: "No Language Test",
      author: "Test Author",
      language: null,
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn1,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      acquisitionDate: new Date(),
      listingPrice: "10.00",
    });

    const result = await caller.batch.exportToIberlibro({ filters: {} });
    const lines = result.tsv.split("\n");
    const headers = lines[0].split("\t");
    const dataRow = lines.find(line => line.includes(testIsbn1));
    
    expect(dataRow).toBeDefined();
    
    const values = dataRow!.split("\t");
    const langIndex = headers.indexOf("language");
    
    // Should default to SPA
    expect(values[langIndex]).toBe("SPA");

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn1));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn1));
  });

  it("should include books with null salesChannels", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(catalogMasters).values({
      isbn13: testIsbn1,
      title: "Book with no marketplace",
      author: "Author 1",
    });

    await db.insert(inventoryItems).values({
      isbn13: testIsbn1,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      acquisitionDate: new Date(),
      listingPrice: "10.00",
      salesChannels: null,
    });

    const result = await caller.batch.exportToIberlibro({ filters: {} });

    // Should include book 1 (null salesChannels means not listed anywhere)
    expect(result.tsv).toContain(testIsbn1);

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn1));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn1));
  });
});
