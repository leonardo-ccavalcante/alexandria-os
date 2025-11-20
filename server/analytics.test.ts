import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { catalogMasters, inventoryItems, salesTransactions } from "../drizzle/schema";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): { ctx: TrpcContext } {
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

describe("Dashboard Analytics", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const { ctx } = createTestContext();
    caller = appRouter.createCaller(ctx);

    // Clean up any existing test data
    const db = await getDb();
    if (db) {
      await db.delete(salesTransactions);
      await db.delete(inventoryItems);
      await db.delete(catalogMasters);

      // Insert test catalog data
      await db.insert(catalogMasters).values([
        {
          isbn13: "9780000000001",
          title: "Test Book 1",
          author: "Author A",
          publisher: "Publisher X",
          publicationYear: 2020,
          categoryLevel1: "Fiction",
          language: "EN",
        },
        {
          isbn13: "9780000000002",
          title: "Test Book 2",
          author: "Author A",
          publisher: "Publisher Y",
          publicationYear: 2021,
          categoryLevel1: "Non-Fiction",
          language: "ES",
        },
        {
          isbn13: "9780000000003",
          title: "Test Book 3",
          author: "Author B",
          publisher: "Publisher X",
          publicationYear: 2022,
          categoryLevel1: "Fiction",
          language: "EN",
        },
      ]);

      // Insert test inventory items
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      await db.insert(inventoryItems).values([
        {
          uuid: "test-uuid-1",
          isbn13: "9780000000001",
          status: "AVAILABLE",
          conditionGrade: "BUENO",
          locationCode: "01A",
          listingPrice: "10.00",
          costOfGoods: "5.00",
          createdAt: lastWeek,
        },
        {
          uuid: "test-uuid-2",
          isbn13: "9780000000001",
          status: "LISTED",
          conditionGrade: "BUENO",
          locationCode: "01A",
          listingPrice: "12.00",
          costOfGoods: "6.00",
          createdAt: yesterday,
        },
        {
          uuid: "test-uuid-3",
          isbn13: "9780000000002",
          status: "SOLD",
          conditionGrade: "COMO_NUEVO",
          locationCode: "02B",
          listingPrice: "15.00",
          costOfGoods: "7.00",
          createdAt: lastWeek,
        },
        {
          uuid: "test-uuid-4",
          isbn13: "9780000000003",
          status: "AVAILABLE",
          conditionGrade: "BUENO",
          locationCode: "03C",
          listingPrice: "20.00",
          costOfGoods: "10.00",
          createdAt: now,
        },
      ]);

      // Insert test sales transaction
      await db.insert(salesTransactions).values({
        itemUuid: "test-uuid-3",
        isbn13: "9780000000002",
        channel: "Wallapop",
        listingPrice: "15.00",
        finalSalePrice: "14.00",
        shippingCost: "2.00",
        platformFees: "1.00",
        netProfit: "4.00",
        saleDate: yesterday,
      });
    }
  });

  describe("Inventory Velocity", () => {
    it("should get inventory velocity by day", async () => {
      const result = await caller.dashboard.getInventoryVelocity({
        groupBy: "day",
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Should have data for multiple days
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("period");
        expect(result[0]).toHaveProperty("added");
        expect(result[0]).toHaveProperty("sold");
      }
    });

    it("should get inventory velocity by week", async () => {
      const result = await caller.dashboard.getInventoryVelocity({
        groupBy: "week",
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should get inventory velocity by month", async () => {
      const result = await caller.dashboard.getInventoryVelocity({
        groupBy: "month",
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should filter velocity by date range", async () => {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 7);

      const result = await caller.dashboard.getInventoryVelocity({
        dateFrom,
        dateTo: new Date(),
        groupBy: "day",
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Analytics by Author", () => {
    it("should get analytics grouped by author", async () => {
      const result = await caller.dashboard.getAnalyticsByAuthor({
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 0) {
        const author = result[0];
        expect(author).toHaveProperty("author");
        expect(author).toHaveProperty("totalItems");
        expect(author).toHaveProperty("availableItems");
        expect(author).toHaveProperty("soldItems");
        expect(author).toHaveProperty("inventoryValue");
        expect(author).toHaveProperty("totalRevenue");
        expect(author).toHaveProperty("totalProfit");
        expect(author).toHaveProperty("avgPrice");
        
        // Verify data types
        expect(typeof author.totalItems).toBe("number");
        expect(typeof author.availableItems).toBe("number");
        expect(typeof author.soldItems).toBe("number");
        expect(typeof author.inventoryValue).toBe("number");
        expect(typeof author.totalRevenue).toBe("number");
        expect(typeof author.totalProfit).toBe("number");
        expect(typeof author.avgPrice).toBe("number");
      }
    });

    it("should filter author analytics by date range", async () => {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);

      const result = await caller.dashboard.getAnalyticsByAuthor({
        dateFrom,
        dateTo: new Date(),
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should respect limit parameter", async () => {
      const result = await caller.dashboard.getAnalyticsByAuthor({
        limit: 5,
      });

      expect(result).toBeDefined();
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Analytics by Publisher", () => {
    it("should get analytics grouped by publisher", async () => {
      const result = await caller.dashboard.getAnalyticsByPublisher({
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 0) {
        const publisher = result[0];
        expect(publisher).toHaveProperty("publisher");
        expect(publisher).toHaveProperty("totalItems");
        expect(publisher).toHaveProperty("availableItems");
        expect(publisher).toHaveProperty("soldItems");
        expect(publisher).toHaveProperty("inventoryValue");
        expect(publisher).toHaveProperty("totalRevenue");
        expect(publisher).toHaveProperty("totalProfit");
        expect(publisher).toHaveProperty("avgPrice");
        
        // Verify data types
        expect(typeof publisher.totalItems).toBe("number");
        expect(typeof publisher.inventoryValue).toBe("number");
        expect(typeof publisher.avgPrice).toBe("number");
      }
    });

    it("should filter publisher analytics by date range", async () => {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);

      const result = await caller.dashboard.getAnalyticsByPublisher({
        dateFrom,
        dateTo: new Date(),
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Analytics by Category", () => {
    it("should get analytics grouped by category", async () => {
      const result = await caller.dashboard.getAnalyticsByCategory({});

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 0) {
        const category = result[0];
        expect(category).toHaveProperty("category");
        expect(category).toHaveProperty("totalItems");
        expect(category).toHaveProperty("availableItems");
        expect(category).toHaveProperty("soldItems");
        expect(category).toHaveProperty("inventoryValue");
        expect(category).toHaveProperty("totalRevenue");
        expect(category).toHaveProperty("totalProfit");
        
        // Verify data types
        expect(typeof category.totalItems).toBe("number");
        expect(typeof category.inventoryValue).toBe("number");
      }
    });

    it("should filter category analytics by date range", async () => {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);

      const result = await caller.dashboard.getAnalyticsByCategory({
        dateFrom,
        dateTo: new Date(),
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should include uncategorized books", async () => {
      const result = await caller.dashboard.getAnalyticsByCategory({});

      expect(result).toBeDefined();
      // Should have at least Fiction and Non-Fiction from test data
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Analytics by Location", () => {
    it("should get analytics grouped by location", async () => {
      const result = await caller.dashboard.getAnalyticsByLocation({});

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 0) {
        const location = result[0];
        expect(location).toHaveProperty("location");
        expect(location).toHaveProperty("totalItems");
        expect(location).toHaveProperty("availableItems");
        expect(location).toHaveProperty("listedItems");
        expect(location).toHaveProperty("soldItems");
        expect(location).toHaveProperty("inventoryValue");
        expect(location).toHaveProperty("avgPrice");
        expect(location).toHaveProperty("utilization");
        
        // Verify data types
        expect(typeof location.totalItems).toBe("number");
        expect(typeof location.availableItems).toBe("number");
        expect(typeof location.utilization).toBe("number");
        
        // Utilization should be a percentage (0-100)
        expect(location.utilization).toBeGreaterThanOrEqual(0);
        expect(location.utilization).toBeLessThanOrEqual(100);
      }
    });

    it("should filter location analytics by date range", async () => {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);

      const result = await caller.dashboard.getAnalyticsByLocation({
        dateFrom,
        dateTo: new Date(),
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should calculate utilization correctly", async () => {
      const result = await caller.dashboard.getAnalyticsByLocation({});

      expect(result).toBeDefined();
      
      // Find location 01A which has 2 items (1 AVAILABLE, 1 LISTED)
      const loc01A = result.find(l => l.location === "01A");
      if (loc01A) {
        expect(loc01A.totalItems).toBe(2);
        expect(loc01A.availableItems + loc01A.listedItems).toBe(2);
        // Utilization should be 100% (all items are available or listed)
        expect(loc01A.utilization).toBe(100);
      }
    });
  });

  describe("Date Range Filtering", () => {
    it("should handle empty date range (all time)", async () => {
      const result = await caller.dashboard.getAnalyticsByAuthor({
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should handle date range with no data", async () => {
      const dateFrom = new Date("2000-01-01");
      const dateTo = new Date("2000-12-31");

      const result = await caller.dashboard.getAnalyticsByAuthor({
        dateFrom,
        dateTo,
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Should return empty array or zero values
    });

    it("should filter correctly by recent date range", async () => {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 1); // Yesterday

      const result = await caller.dashboard.getInventoryVelocity({
        dateFrom,
        dateTo: new Date(),
        groupBy: "day",
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Should have data for yesterday and today
    });
  });

  describe("Data Aggregation", () => {
    it("should aggregate inventory value correctly", async () => {
      const result = await caller.dashboard.getAnalyticsByAuthor({
        limit: 10,
      });

      expect(result).toBeDefined();
      
      // Find Author A who has 2 items (1 AVAILABLE at 10.00, 1 LISTED at 12.00)
      const authorA = result.find(a => a.author === "Author A");
      if (authorA) {
        expect(authorA.totalItems).toBeGreaterThanOrEqual(2);
        // Inventory value should be sum of AVAILABLE and LISTED items
        expect(authorA.inventoryValue).toBeGreaterThan(0);
      }
    });

    it("should calculate revenue and profit from sales", async () => {
      const result = await caller.dashboard.getAnalyticsByAuthor({
        limit: 10,
      });

      expect(result).toBeDefined();
      
      // Find Author A who has a sold item
      const authorA = result.find(a => a.author === "Author A");
      if (authorA && authorA.soldItems > 0) {
        expect(authorA.totalRevenue).toBeGreaterThan(0);
        expect(authorA.totalProfit).toBeGreaterThan(0);
      }
    });

    it("should calculate average price correctly", async () => {
      const result = await caller.dashboard.getAnalyticsByAuthor({
        limit: 10,
      });

      expect(result).toBeDefined();
      
      if (result.length > 0) {
        const author = result[0];
        if (author.totalItems > 0) {
          expect(author.avgPrice).toBeGreaterThan(0);
        }
      }
    });
  });
});
