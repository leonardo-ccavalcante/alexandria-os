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

describe("CSV Export - Price Column", () => {
  const testIsbn = "9780000000333";

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

  it("should export average price when all copies have same price", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Price Test Book",
      author: "Test Author",
    });

    // Create 3 copies with same price (10.00)
    for (let i = 0; i < 3; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
      });
    }

    // Export CSV
    const result = await caller.batch.exportToCsv({ filters: {} });

    // Parse CSV
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    
    // Find the test book row
    const testBookRow = lines.find(line => line.includes(testIsbn));
    expect(testBookRow).toBeDefined();

    // Parse the row
    const values = testBookRow!.match(/"([^"]*)"/g)?.map(v => v.replace(/"/g, "")) || [];
    
    // Find price column index
    const priceIndex = headers.findIndex(h => h.includes("Precio"));
    expect(priceIndex).toBeGreaterThan(-1);

    // Verify price is 10.00
    expect(values[priceIndex]).toBe("10.00");
  });

  it("should export average price when copies have different prices", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Mixed Price Book",
      author: "Test Author",
    });

    // Create 3 copies with different prices: 10.00, 12.00, 14.00 (avg = 12.00)
    await db.insert(inventoryItems).values([
      {
        isbn13: testIsbn,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
      },
      {
        isbn13: testIsbn,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "12.00",
      },
      {
        isbn13: testIsbn,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "14.00",
      },
    ]);

    // Export CSV
    const result = await caller.batch.exportToCsv({ filters: {} });

    // Parse CSV
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    
    // Find the test book row
    const testBookRow = lines.find(line => line.includes(testIsbn));
    expect(testBookRow).toBeDefined();

    // Parse the row
    const values = testBookRow!.match(/"([^"]*)"/g)?.map(v => v.replace(/"/g, "")) || [];
    
    // Find price column index
    const priceIndex = headers.findIndex(h => h.includes("Precio"));
    expect(priceIndex).toBeGreaterThan(-1);

    // Verify price is average (12.00)
    expect(values[priceIndex]).toBe("12.00");
  });

  it("should export empty price when no prices are set", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "No Price Book",
      author: "Test Author",
    });

    // Create 2 copies without prices
    for (let i = 0; i < 2; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        // No listingPrice
      });
    }

    // Export CSV
    const result = await caller.batch.exportToCsv({ filters: {} });

    // Parse CSV
    const lines = result.csv.split("\n");
    const headers = lines[0].split(",");
    
    // Find the test book row
    const testBookRow = lines.find(line => line.includes(testIsbn));
    expect(testBookRow).toBeDefined();

    // Parse the row
    const values = testBookRow!.match(/"([^"]*)"/g)?.map(v => v.replace(/"/g, "")) || [];
    
    // Find price column index
    const priceIndex = headers.findIndex(h => h.includes("Precio"));
    expect(priceIndex).toBeGreaterThan(-1);

    // Verify price is empty
    expect(values[priceIndex]).toBe("");
  });

  it("should handle invalid prices gracefully", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Invalid Price Book",
      author: "Test Author",
    });

    // Create copies with mix of valid and invalid prices
    await db.insert(inventoryItems).values([
      {
        isbn13: testIsbn,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00", // Valid
      },
      {
        isbn13: testIsbn,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "01A",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: null as any, // Invalid (null)
      },
    ]);

    // Export CSV should not crash
    const result = await caller.batch.exportToCsv({ filters: {} });

    // Verify CSV was generated
    expect(result.csv).toBeDefined();
    expect(result.csv.length).toBeGreaterThan(0);
    
    // Find the test book row
    const lines = result.csv.split("\n");
    const testBookRow = lines.find(line => line.includes(testIsbn));
    expect(testBookRow).toBeDefined();
  });
});
