import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { upsertCatalogMaster, createInventoryItem } from "./db";

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

describe("Inventory Procedures", () => {
  let testItemUuid: string;

  beforeAll(async () => {
    // Seed test book
    await upsertCatalogMaster({
      isbn13: "9780140449136",
      title: "The Odyssey",
      author: "Homer",
      category: "LITERATURA",
      marketMinPrice: "10.00",
      marketMedianPrice: "15.00",
      lastPriceCheck: new Date(),
    });

    // Create test inventory item
    const item = await createInventoryItem({
      isbn13: "9780140449136",
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      locationCode: "02A",
      listingPrice: "13.25",
      costOfGoods: "0.00",
      createdBy: 1,
    });
    testItemUuid = item.uuid;
  });

  it("should search inventory with no filters", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inventory.search({
      limit: 50,
      offset: 0,
    });

    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });

  it("should filter inventory by status", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inventory.search({
      status: "AVAILABLE",
      limit: 50,
      offset: 0,
    });

    expect(result.items).toBeDefined();
    result.items.forEach((row: any) => {
      expect(row.item.status).toBe("AVAILABLE");
    });
  });

  it("should filter inventory by condition", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inventory.search({
      condition: "BUENO",
      limit: 50,
      offset: 0,
    });

    expect(result.items).toBeDefined();
    result.items.forEach((row: any) => {
      expect(row.item.conditionGrade).toBe("BUENO");
    });
  });

  it("should get inventory item by UUID", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inventory.getByUuid({ uuid: testItemUuid });

    expect(result).toBeDefined();
    expect(result?.uuid).toBe(testItemUuid);
    expect(result?.isbn13).toBe("9780140449136");
  });

  it("should update inventory item location", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inventory.updateLocation({
      uuid: testItemUuid,
      locationCode: "05C",
    });

    expect(result.success).toBe(true);

    // Verify update
    const item = await caller.inventory.getByUuid({ uuid: testItemUuid });
    expect(item?.locationCode).toBe("05C");
  });

  it("should update inventory item price", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inventory.updatePrice({
      uuid: testItemUuid,
      listingPrice: "14.50",
    });

    expect(result.success).toBe(true);

    // Verify update
    const item = await caller.inventory.getByUuid({ uuid: testItemUuid });
    expect(item?.listingPrice).toBe("14.50");
  });

  it("should update inventory item status", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inventory.updateStatus({
      uuid: testItemUuid,
      status: "LISTED",
    });

    expect(result.success).toBe(true);

    // Verify update
    const item = await caller.inventory.getByUuid({ uuid: testItemUuid });
    expect(item?.status).toBe("LISTED");
  });

  it("should record sale transaction", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inventory.recordSale({
      uuid: testItemUuid,
      channel: "AMAZON",
      finalSalePrice: "14.50",
      platformFees: "2.18",
      shippingCost: "3.50",
      notes: "Test sale",
    });

    expect(result.success).toBe(true);

    // Verify item status changed to SOLD
    const item = await caller.inventory.getByUuid({ uuid: testItemUuid });
    expect(item?.status).toBe("SOLD");
    expect(item?.soldChannel).toBe("AMAZON");
    expect(item?.finalSalePrice).toBe("14.50");
    
    // Net profit = 14.50 - 2.18 - 3.50 = 8.82
    expect(parseFloat(item?.netProfit || "0")).toBeCloseTo(8.82, 2);
  });

  it("should validate location code format when updating", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.inventory.updateLocation({
        uuid: testItemUuid,
        locationCode: "INVALID",
      })
    ).rejects.toThrow();
  });

  it("should handle pagination correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const page1 = await caller.inventory.search({
      limit: 1,
      offset: 0,
    });

    const page2 = await caller.inventory.search({
      limit: 1,
      offset: 1,
    });

    expect(page1.items.length).toBeLessThanOrEqual(1);
    expect(page2.items.length).toBeLessThanOrEqual(1);
    
    if (page1.items[0] && page2.items[0]) {
      expect(page1.items[0].item.uuid).not.toBe(page2.items[0].item.uuid);
    }
  });
});
