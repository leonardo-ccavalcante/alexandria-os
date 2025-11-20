import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { upsertCatalogMaster, getInventoryItemByUuid } from "./db";

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

describe("Catalog Procedures", () => {
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
  });

  it("should calculate suggested price based on condition COMO_NUEVO", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.catalog.calculatePrice({
      isbn: "9780140449136",
      condition: "COMO_NUEVO",
    });

    // Base price: 15.00, modifier: 1.0, padding: 0.50
    // Expected: (15.00 * 1.0) + 0.50 = 15.50
    expect(result.basePrice).toBe(15.00);
    expect(result.modifier).toBe(1.0);
    expect(result.padding).toBe(0.50);
    expect(result.suggestedPrice).toBe(15.50);
  });

  it("should calculate suggested price based on condition BUENO", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.catalog.calculatePrice({
      isbn: "9780140449136",
      condition: "BUENO",
    });

    // Base price: 15.00, modifier: 0.85, padding: 0.50
    // Expected: (15.00 * 0.85) + 0.50 = 13.25
    expect(result.modifier).toBe(0.85);
    expect(result.suggestedPrice).toBe(13.25);
  });

  it("should calculate suggested price based on condition ACEPTABLE", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.catalog.calculatePrice({
      isbn: "9780140449136",
      condition: "ACEPTABLE",
    });

    // Base price: 15.00, modifier: 0.60, padding: 0.50
    // Expected: (15.00 * 0.60) + 0.50 = 9.50
    expect(result.modifier).toBe(0.60);
    expect(result.suggestedPrice).toBe(9.50);
  });

  it("should create inventory item with valid data", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.catalog.createItem({
      isbn13: "9780140449136",
      conditionGrade: "BUENO",
      conditionNotes: "Test notes",
      locationCode: "02A",
      listingPrice: "13.25",
    });

    expect(result.success).toBe(true);
    expect(result.item).toBeDefined();
    expect(result.item.isbn13).toBe("9780140449136");
    expect(result.item.conditionGrade).toBe("BUENO");
    expect(result.item.locationCode).toBe("02A");
    expect(result.item.listingPrice).toBe("13.25");
    expect(result.item.status).toBe("AVAILABLE");
    expect(result.item.uuid).toBeDefined();

    // Verify item was saved to database
    const savedItem = await getInventoryItemByUuid(result.item.uuid);
    expect(savedItem).toBeDefined();
    expect(savedItem?.isbn13).toBe("9780140449136");
  });

  it("should validate location code format", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Invalid format: missing letter
    await expect(
      caller.catalog.createItem({
        isbn13: "9780140449136",
        conditionGrade: "BUENO",
        locationCode: "02",
        listingPrice: "13.25",
      })
    ).rejects.toThrow();

    // Invalid format: wrong pattern
    await expect(
      caller.catalog.createItem({
        isbn13: "9780140449136",
        conditionGrade: "BUENO",
        locationCode: "A02",
        listingPrice: "13.25",
      })
    ).rejects.toThrow();
  });

  it("should create item without optional location code", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.catalog.createItem({
      isbn13: "9780140449136",
      conditionGrade: "COMO_NUEVO",
      listingPrice: "15.50",
    });

    expect(result.success).toBe(true);
    expect(result.item.locationCode).toBeNull();
  });

  it("should throw error for non-existent book", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.catalog.calculatePrice({
        isbn: "9999999999999",
        condition: "BUENO",
      })
    ).rejects.toThrow("Book not found");
  });
});
