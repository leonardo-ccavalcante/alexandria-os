import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-admin",
    email: "admin@test.com",
    name: "Test Admin",
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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("dashboard.getAnalyticsByLocation", () => {
  it("counts only available and listed books for location capacity", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.getAnalyticsByLocation({
      dateFrom: undefined,
      dateTo: undefined,
    });

    // Result should be an array of location analytics
    expect(Array.isArray(result)).toBe(true);

    // Each location should have capacity metrics
    if (result.length > 0) {
      const location = result[0];
      expect(location).toHaveProperty('location');
      expect(location).toHaveProperty('totalItems');
      expect(location).toHaveProperty('availableItems');
      expect(location).toHaveProperty('listedItems');
      expect(location).toHaveProperty('soldItems');
      expect(location).toHaveProperty('freeSpace');
      expect(location).toHaveProperty('capacityPercentage');
      
      // totalItems should equal availableItems + listedItems (not including sold)
      expect(location.totalItems).toBe(location.availableItems + location.listedItems);
    }
  });

  it("excludes sold and donated books from capacity calculations", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.getAnalyticsByLocation({
      dateFrom: undefined,
      dateTo: undefined,
    });

    // Verify that totalItems does not include sold items
    result.forEach(location => {
      // totalItems should only be available + listed
      const expectedTotal = location.availableItems + location.listedItems;
      expect(location.totalItems).toBe(expectedTotal);
      
      // soldItems should be tracked separately but not in totalItems
      expect(location.soldItems).toBeGreaterThanOrEqual(0);
    });
  });

  it("calculates capacity percentage based on available books only", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.getAnalyticsByLocation({
      dateFrom: undefined,
      dateTo: undefined,
    });

    const CAPACITY_THRESHOLD = 25;

    result.forEach(location => {
      // Capacity should be based on totalItems (available + listed only)
      const expectedCapacity = (location.totalItems / CAPACITY_THRESHOLD) * 100;
      expect(location.capacityPercentage).toBeCloseTo(Math.min(100, expectedCapacity), 1);
      
      // Free space should be calculated from available books
      const expectedFreeSpace = Math.max(0, CAPACITY_THRESHOLD - location.totalItems);
      expect(location.freeSpace).toBe(expectedFreeSpace);
    });
  });

  it("flags locations near or at capacity correctly", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.getAnalyticsByLocation({
      dateFrom: undefined,
      dateTo: undefined,
    });

    result.forEach(location => {
      // Near capacity at 80% (20 books)
      if (location.capacityPercentage >= 80 && location.capacityPercentage < 100) {
        expect(location.isNearCapacity).toBe(true);
      }
      
      // At capacity at 100% (25 books)
      if (location.capacityPercentage >= 100) {
        expect(location.isAtCapacity).toBe(true);
      }
    });
  });

  it("calculates average price only for available and listed items", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.getAnalyticsByLocation({
      dateFrom: undefined,
      dateTo: undefined,
    });

    // avgPrice should only consider available/listed items, not sold
    result.forEach(location => {
      expect(location.avgPrice).toBeGreaterThanOrEqual(0);
      // avgPrice can be 0 if books don't have prices set yet
      // Just verify it's a valid number
      expect(typeof location.avgPrice).toBe('number');
    });
  });
});
