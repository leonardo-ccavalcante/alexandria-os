import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { upsertCatalogMaster, getCatalogMasterByIsbn } from "./db";

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

  return ctx;
}

describe("Triage Procedures", () => {
  beforeAll(async () => {
    // Seed a test book in catalog
    await upsertCatalogMaster({
      isbn13: "9780140449136",
      title: "The Odyssey",
      author: "Homer",
      publisher: "Penguin Classics",
      publicationYear: 1997,
      language: "en",
      category: "LITERATURA",
      marketMinPrice: "10.00",
      marketMedianPrice: "15.00",
      lastPriceCheck: new Date(),
    });
  });

  it("should check ISBN and return profit calculation for existing book", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.triage.checkIsbn({ isbn: "9780140449136" });

    expect(result.found).toBe(true);
    expect(result.bookData).toBeDefined();
    expect(result.bookData?.isbn13).toBe("9780140449136");
    expect(result.decision).toBeDefined();
    expect(result.projectedProfit).toBeDefined();
    expect(result.marketPrice).toBe(15.00);
    
    // With default settings (fees: 4.50, min profit: 8.00)
    // Projected profit = 15.00 - 4.50 = 10.50
    // Should be ACCEPT since 10.50 > 8.00
    expect(result.projectedProfit).toBe(10.50);
    expect(result.decision).toBe("ACCEPT");
  });

  it("should return not found for non-existent ISBN", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.triage.checkIsbn({ isbn: "9999999999999" });

    expect(result.found).toBe(false);
    expect(result.isbn).toBe("9999999999999");
  });

  it("should validate ISBN format and reject invalid ISBNs", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.triage.checkIsbn({ isbn: "123" })
    ).rejects.toThrow("ISBN inválido");

    await expect(
      caller.triage.checkIsbn({ isbn: "ABC1234567890" })
    ).rejects.toThrow("ISBN inválido");
  });

  it("should clean ISBN by removing hyphens and spaces", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.triage.checkIsbn({ isbn: "978-0-14-044913-6" });

    expect(result.found).toBe(true);
    expect(result.bookData?.isbn13).toBe("9780140449136");
  });

  it("should calculate DONATE decision for low profit books", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a book with low market price
    await upsertCatalogMaster({
      isbn13: "9780000000001",
      title: "Low Value Book",
      author: "Test Author",
      category: "OTROS",
      marketMinPrice: "5.00",
      marketMedianPrice: "6.00",
      lastPriceCheck: new Date(),
    });

    const result = await caller.triage.checkIsbn({ isbn: "9780000000001" });

    // Profit = 6.00 - 4.50 = 1.50 (below threshold of 8.00)
    expect(result.decision).toBe("DONATE");
    expect(result.projectedProfit).toBe(1.50);
  });

  it("should calculate RECYCLE decision for negative profit books", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a book with very low market price
    await upsertCatalogMaster({
      isbn13: "9780000000002",
      title: "Worthless Book",
      author: "Test Author",
      category: "OTROS",
      marketMinPrice: "1.00",
      marketMedianPrice: "2.00",
      lastPriceCheck: new Date(),
    });

    const result = await caller.triage.checkIsbn({ isbn: "9780000000002" });

    // Profit = 2.00 - 4.50 = -2.50 (negative)
    expect(result.decision).toBe("RECYCLE");
    expect(result.projectedProfit).toBe(-2.50);
  });
});
