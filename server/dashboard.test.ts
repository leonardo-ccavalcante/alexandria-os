import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { upsertCatalogMaster, createInventoryItem, createSalesTransaction } from "./db";

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
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("Dashboard Procedures", () => {
  beforeAll(async () => {
    // Seed test data
    await upsertCatalogMaster({
      isbn13: "9780140449136",
      title: "The Odyssey",
      author: "Homer",
      categoryLevel1: "LITERATURA",
      marketMinPrice: "10.00",
      marketMedianPrice: "15.00",
      lastPriceCheck: new Date(),
    });

    // Create some inventory items
    const item1 = await createInventoryItem({
      isbn13: "9780140449136",
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      locationCode: "02A",
      listingPrice: "13.25",
      costOfGoods: "0.00",
      createdBy: 1,
    });

    const item2 = await createInventoryItem({
      isbn13: "9780140449136",
      status: "SOLD",
      conditionGrade: "COMO_NUEVO",
      locationCode: "03B",
      listingPrice: "15.50",
      costOfGoods: "0.00",
      createdBy: 1,
      soldAt: new Date(),
      soldChannel: "AMAZON",
      finalSalePrice: "15.50",
      platformFees: "2.33",
      netProfit: "13.17",
    });

    // Create sales transaction
    await createSalesTransaction({
      itemUuid: item2.uuid,
      isbn13: "9780140449136",
      channel: "AMAZON",
      saleDate: new Date(),
      listingPrice: "15.50",
      finalSalePrice: "15.50",
      platformCommissionPct: "15.00",
      platformFees: "2.33",
      shippingCost: "0.00",
      grossProfit: "13.17",
      netProfit: "13.17",
      daysInInventory: 5,
      createdBy: 1,
    });
  });

  it("should get dashboard KPIs", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.getKPIs();

    expect(result).toBeDefined();
    expect(result.totalInventory).toBeGreaterThan(0);
    expect(result.available).toBeGreaterThanOrEqual(0);
    expect(result.listed).toBeGreaterThanOrEqual(0);
    expect(result.sold).toBeGreaterThanOrEqual(0);
    expect(result.totalRevenue).toBeGreaterThanOrEqual(0);
    expect(result.totalProfit).toBeGreaterThanOrEqual(0);
    expect(result.avgProfit).toBeGreaterThanOrEqual(0);
  });

  it("should get sales by channel", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.getSalesByChannel();

    expect(Array.isArray(result)).toBe(true);
    
    if (result.length > 0) {
      const amazonSales = result.find((r: any) => r.channel === "AMAZON");
      if (amazonSales) {
        expect(amazonSales.count).toBeGreaterThan(0);
        expect(amazonSales.revenue).toBeGreaterThan(0);
        expect(amazonSales.profit).toBeGreaterThan(0);
      }
    }
  });

  it("should get top performing books", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.getTopBooks({ limit: 10 });

    expect(Array.isArray(result)).toBe(true);
    
    if (result.length > 0) {
      const book = result[0];
      expect(book.isbn13).toBeDefined();
      expect(book.title).toBeDefined();
      expect(book.author).toBeDefined();
      expect(book.salesCount).toBeGreaterThan(0);
      expect(book.totalRevenue).toBeGreaterThan(0);
      expect(book.totalProfit).toBeGreaterThan(0);
    }
  });

  it("should get sales transactions with filters", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.getSalesTransactions({
      limit: 50,
      offset: 0,
    });

    expect(result.transactions).toBeDefined();
    expect(Array.isArray(result.transactions)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it("should filter sales transactions by channel", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.getSalesTransactions({
      channel: "AMAZON",
      limit: 50,
      offset: 0,
    });

    expect(result.transactions).toBeDefined();
    result.transactions.forEach((tx: any) => {
      expect(tx.channel).toBe("AMAZON");
    });
  });
});

describe("Settings Procedures", () => {
  it("should get all system settings", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.getAll();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    
    const minProfitSetting = result.find((s: any) => s.settingKey === "MIN_PROFIT_THRESHOLD");
    expect(minProfitSetting).toBeDefined();
    expect(minProfitSetting?.settingValue).toBeDefined();
  });

  it("should get single setting by key", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.get({ key: "MIN_PROFIT_THRESHOLD" });

    expect(result).toBeDefined();
    expect(result?.settingKey).toBe("MIN_PROFIT_THRESHOLD");
    expect(result?.settingValue).toBeDefined();
  });

  it("should update setting value", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.settings.update({
      key: "MIN_PROFIT_THRESHOLD",
      value: "9.00",
    });

    expect(result.success).toBe(true);

    // Verify update
    const setting = await caller.settings.get({ key: "MIN_PROFIT_THRESHOLD" });
    expect(setting?.settingValue).toBe("9.00");

    // Reset to original value
    await caller.settings.update({
      key: "MIN_PROFIT_THRESHOLD",
      value: "8.00",
    });
  });
});
