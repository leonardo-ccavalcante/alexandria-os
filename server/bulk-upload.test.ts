import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { catalogMasters, inventoryItems } from "../drizzle/schema";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
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

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
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

describe("batch.importCatalogFromCsv", () => {
  it("imports valid catalog data from CSV", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const timestamp = Date.now().toString().slice(-6); // Last 6 digits
    const csvData = `ISBN,Title,Author,Publisher,publicationYear,language,synopsis,categoryLevel1
978000${timestamp}1,Test Book 1,Test Author 1,Test Publisher,2020,Spanish,Test synopsis,Fiction
978000${timestamp}2,Test Book 2,Test Author 2,Test Publisher,2021,English,Another synopsis,Non-Fiction`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    // Debug: log the result
    console.log('Import result:', JSON.stringify(result, null, 2));

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("skips rows with missing ISBN", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const timestamp = Date.now().toString().slice(-6); // Last 6 digits
    const csvData = `ISBN,Title,Author,Publisher,publicationYear
,Test Book Without ISBN,Test Author,Test Publisher,2020
978000${timestamp}3,Test Book With ISBN,Test Author,Test Publisher,2021`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Missing ISBN");
  });

  it("handles empty CSV file", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const csvData = ``;

    await expect(
      caller.batch.importCatalogFromCsv({ csvData })
    ).rejects.toThrow("CSV file is empty or invalid");
  });

  it("handles CSV with only headers", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const csvData = `ISBN,Title,Author,Publisher,publicationYear`;

    await expect(
      caller.batch.importCatalogFromCsv({ csvData })
    ).rejects.toThrow("CSV file is empty or invalid");
  });
});

describe("batch.importSalesChannelsFromCsv", () => {
  it("updates sales channels for inventory items", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // First, create a test inventory item with unique ISBN
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const timestamp = Date.now().toString().slice(-9); // Last 9 digits
    const testIsbn = `9780${timestamp}`;

    // Insert test catalog
    try {
      await db.insert(catalogMasters).values({
        isbn13: testIsbn,
        title: "Test Book for Channels",
        author: "Test Author",
        publisher: "Test Publisher",
      });
    } catch (error) {
      // Ignore duplicate key errors
    }

    // Insert test inventory item
    const [item] = await db.insert(inventoryItems).values({
      isbn13: testIsbn,
      locationCode: "01A",
      conditionNotes: "Good",
      status: "available",
      listingPrice: "10.00",
    }).$returningId();

    // Now update sales channels via CSV
    const csvData = `UUID,Canales
${item.uuid},Wallapop;Vinted;Amazon`;

    const result = await caller.batch.importSalesChannelsFromCsv({ csvData });

    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("skips rows with missing UUID", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const csvData = `UUID,Canales
,Wallapop;Vinted
test-uuid-123,Amazon;Ebay`;

    const result = await caller.batch.importSalesChannelsFromCsv({ csvData });

    expect(result.updated).toBeLessThanOrEqual(1); // May be 0 or 1 depending on if UUID exists
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});

describe("batch.cleanupDatabase", () => {
  it("allows admin to clean up database", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.cleanupDatabase();

    expect(result.success).toBe(true);
    expect(result.message).toContain("cleaned successfully");
  });

  it("prevents non-admin from cleaning up database", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.batch.cleanupDatabase()).rejects.toThrow(
      "Only admins can clean up the database"
    );
  });
});
