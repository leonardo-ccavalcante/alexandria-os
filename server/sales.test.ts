import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { catalogMasters, inventoryItems, salesTransactions, systemSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("Sales Recording System", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let db: Awaited<ReturnType<typeof getDb>>;

  beforeEach(async () => {
    const { ctx } = createAuthContext();
    caller = appRouter.createCaller(ctx);
    db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clean up test data
    await db.delete(salesTransactions);
    await db.delete(inventoryItems);
    await db.delete(catalogMasters);
    await db.delete(systemSettings).where(eq(systemSettings.settingKey, "ACTIVE_SALES_CHANNELS"));
  });

  describe("sales.recordSale", () => {
    it("should record a sale and update inventory status", async () => {
      // Create test book
      await db.insert(catalogMasters).values({
        isbn13: "9781234567890",
        title: "Test Book",
        author: "Test Author",
        publisher: "Test Publisher",
      });

      // Create available inventory item
      await db.insert(inventoryItems).values({
        isbn13: "9781234567890",
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        listingPrice: "10.00",
        costOfGoods: "2.00",
      });

      // Record sale
      const result = await caller.sales.recordSale({
        isbn13: "9781234567890",
        channel: "Amazon",
        salePrice: 12.50,
      });

      expect(result.success).toBe(true);
      expect(result.transaction.salePrice).toBe(12.50);

      // Verify inventory item is marked as SOLD
      const items = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.isbn13, "9781234567890"));

      expect(items[0]?.status).toBe("SOLD");
      expect(items[0]?.soldChannel).toBe("Amazon");
      expect(parseFloat(items[0]?.finalSalePrice || "0")).toBe(12.50);

      // Verify sales transaction was created
      const transactions = await db
        .select()
        .from(salesTransactions)
        .where(eq(salesTransactions.isbn13, "9781234567890"));

      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.channel).toBe("Amazon");
      expect(parseFloat(transactions[0]?.finalSalePrice || "0")).toBe(12.50);
    });

    it("should calculate profit correctly", async () => {
      await db.insert(catalogMasters).values({
        isbn13: "9781234567891",
        title: "Test Book 2",
        author: "Test Author",
      });

      await db.insert(inventoryItems).values({
        isbn13: "9781234567891",
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        listingPrice: "15.00",
        costOfGoods: "5.00",
      });

      const result = await caller.sales.recordSale({
        isbn13: "9781234567891",
        channel: "Vinted",
        salePrice: 20.00,
      });

      // Expected: grossProfit = 20 - 5 = 15
      // platformFees = 20 * 0.10 = 2
      // shippingCost = 3
      // netProfit = 15 - 2 - 3 = 10
      expect(result.transaction.netProfit).toBeCloseTo(10, 2);
    });

    it("should throw error when no available items found", async () => {
      await db.insert(catalogMasters).values({
        isbn13: "9781234567892",
        title: "Test Book 3",
        author: "Test Author",
      });

      // Create item but mark as SOLD
      await db.insert(inventoryItems).values({
        isbn13: "9781234567892",
        status: "SOLD",
        conditionGrade: "BUENO",
      });

      await expect(
        caller.sales.recordSale({
          isbn13: "9781234567892",
          channel: "Amazon",
          salePrice: 10.00,
        })
      ).rejects.toThrow("No available items found for this ISBN");
    });

    it("should calculate days in inventory", async () => {
      await db.insert(catalogMasters).values({
        isbn13: "9781234567893",
        title: "Test Book 4",
        author: "Test Author",
      });

      // Create item with specific creation date (30 days ago)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      await db.insert(inventoryItems).values({
        isbn13: "9781234567893",
        status: "AVAILABLE",
        conditionGrade: "BUENO",
        createdAt: thirtyDaysAgo,
      });

      await caller.sales.recordSale({
        isbn13: "9781234567893",
        channel: "Wallapop",
        salePrice: 10.00,
      });

      const transactions = await db
        .select()
        .from(salesTransactions)
        .where(eq(salesTransactions.isbn13, "9781234567893"));

      expect(transactions[0]?.daysInInventory).toBeGreaterThanOrEqual(29);
      expect(transactions[0]?.daysInInventory).toBeLessThanOrEqual(31);
    });

    it("should only sell one item when multiple available", async () => {
      await db.insert(catalogMasters).values({
        isbn13: "9781234567894",
        title: "Test Book 5",
        author: "Test Author",
      });

      // Create 3 available items
      await db.insert(inventoryItems).values([
        {
          isbn13: "9781234567894",
          status: "AVAILABLE",
          conditionGrade: "BUENO",
        },
        {
          isbn13: "9781234567894",
          status: "AVAILABLE",
          conditionGrade: "BUENO",
        },
        {
          isbn13: "9781234567894",
          status: "AVAILABLE",
          conditionGrade: "BUENO",
        },
      ]);

      await caller.sales.recordSale({
        isbn13: "9781234567894",
        channel: "Amazon",
        salePrice: 10.00,
      });

      // Verify only 1 item is sold, 2 remain available
      const items = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.isbn13, "9781234567894"));

      const soldItems = items.filter((i) => i.status === "SOLD");
      const availableItems = items.filter((i) => i.status === "AVAILABLE");

      expect(soldItems).toHaveLength(1);
      expect(availableItems).toHaveLength(2);
    });
  });

  describe("sales.getActiveChannels", () => {
    it("should return empty array when no channels configured", async () => {
      const channels = await caller.sales.getActiveChannels();
      expect(channels).toEqual([]);
    });

    it("should return configured channels", async () => {
      await db.insert(systemSettings).values({
        settingKey: "ACTIVE_SALES_CHANNELS",
        settingValue: JSON.stringify(["Amazon", "Vinted", "Wallapop"]),
      });

      const channels = await caller.sales.getActiveChannels();
      expect(channels).toEqual(["Amazon", "Vinted", "Wallapop"]);
    });

    it("should handle invalid JSON gracefully", async () => {
      await db.insert(systemSettings).values({
        settingKey: "ACTIVE_SALES_CHANNELS",
        settingValue: "invalid json",
      });

      const channels = await caller.sales.getActiveChannels();
      expect(channels).toEqual([]);
    });

    it("should handle non-array values gracefully", async () => {
      await db.insert(systemSettings).values({
        settingKey: "ACTIVE_SALES_CHANNELS",
        settingValue: JSON.stringify({ channels: ["Amazon"] }),
      });

      const channels = await caller.sales.getActiveChannels();
      expect(channels).toEqual([]);
    });
  });

  describe("Integration: Full sales workflow", () => {
    it("should complete full workflow: configure channels → record sale → verify inventory decrease", async () => {
      // 1. Configure sales channels
      await db.insert(systemSettings).values({
        settingKey: "ACTIVE_SALES_CHANNELS",
        settingValue: JSON.stringify(["Amazon", "Vinted"]),
      });

      const channels = await caller.sales.getActiveChannels();
      expect(channels).toContain("Amazon");

      // 2. Create book and inventory
      await db.insert(catalogMasters).values({
        isbn13: "9781234567895",
        title: "Integration Test Book",
        author: "Test Author",
      });

      await db.insert(inventoryItems).values([
        {
          isbn13: "9781234567895",
          status: "AVAILABLE",
          conditionGrade: "BUENO",
          listingPrice: "15.00",
        },
        {
          isbn13: "9781234567895",
          status: "AVAILABLE",
          conditionGrade: "BUENO",
          listingPrice: "15.00",
        },
      ]);

      // 3. Verify initial inventory count
      let items = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.isbn13, "9781234567895"));

      expect(items.filter((i) => i.status === "AVAILABLE")).toHaveLength(2);

      // 4. Record sale
      const result = await caller.sales.recordSale({
        isbn13: "9781234567895",
        channel: "Amazon",
        salePrice: 18.00,
      });

      expect(result.success).toBe(true);

      // 5. Verify inventory decreased
      items = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.isbn13, "9781234567895"));

      expect(items.filter((i) => i.status === "AVAILABLE")).toHaveLength(1);
      expect(items.filter((i) => i.status === "SOLD")).toHaveLength(1);

      // 6. Verify transaction recorded
      const transactions = await db
        .select()
        .from(salesTransactions)
        .where(eq(salesTransactions.isbn13, "9781234567895"));

      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.channel).toBe("Amazon");
    });
  });
});
