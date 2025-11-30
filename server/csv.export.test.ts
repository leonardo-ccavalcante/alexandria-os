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

describe("CSV Export - Grouped Quantity", () => {
  const testIsbn = "9780000000099";

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

  it("should export one row per ISBN with total quantity", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Test Book for CSV Export",
      author: "Test Author",
      publisher: "Test Publisher",
      publicationYear: 2024,
      categoryLevel1: "Fiction",
    });

    // Create 5 inventory items (5 physical copies)
    for (let i = 0; i < 5; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: `0${i + 1}A`,
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
    
    // Find quantity column index
    const quantityIndex = headers.findIndex(h => h.includes("Cantidad"));
    expect(quantityIndex).toBeGreaterThan(-1);

    // Verify quantity is 5 (not 1)
    expect(values[quantityIndex]).toBe("5");
  });

  it("should combine all locations for books with multiple copies", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Multi-Location Book",
      author: "Test Author",
    });

    // Create 3 inventory items in different locations
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
        locationCode: "02B",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
      },
      {
        isbn13: testIsbn,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: "03C",
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
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
    
    // Find location column index
    const locationIndex = headers.findIndex(h => h.includes("Ubicación"));
    expect(locationIndex).toBeGreaterThan(-1);

    // Verify locations are combined with semicolon
    const locations = values[locationIndex];
    expect(locations).toContain("01A");
    expect(locations).toContain("02B");
    expect(locations).toContain("03C");
    expect(locations).toMatch(/01A; 02B; 03C/);
  });

  it("should not duplicate rows for books with multiple copies", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "No Duplicate Book",
      author: "Test Author",
    });

    // Create 10 inventory items
    for (let i = 0; i < 10; i++) {
      await db.insert(inventoryItems).values({
        isbn13: testIsbn,
        status: "AVAILABLE",
        condition: "BUENO",
        locationCode: `01A`,
        acquisitionDate: new Date(),
        costOfGoods: "5.00",
        listingPrice: "10.00",
      });
    }

    // Export CSV
    const result = await caller.batch.exportToCsv({ filters: {} });

    // Parse CSV
    const lines = result.csv.split("\n").filter(line => line.trim());
    
    // Count how many times the ISBN appears
    const occurrences = lines.filter(line => line.includes(testIsbn)).length;
    
    // Should appear exactly once (not 10 times)
    expect(occurrences).toBe(1);
  });
});
