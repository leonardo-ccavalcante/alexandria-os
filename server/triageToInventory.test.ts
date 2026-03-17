import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { users, catalogMasters } from "../drizzle/schema";

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
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("Triage to Inventory Workflow", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    // Ensure test user exists
    await db.insert(users).values({
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
    }).onDuplicateKeyUpdate({
      set: { email: "test@example.com" },
    });

    // Create test catalog entry
    await db.insert(catalogMasters).values({
      isbn13: "9780134685991",
      title: "Effective Java",
      author: "Joshua Bloch",
      publisher: "Addison-Wesley",
      publicationYear: 2018,
      language: "en",
      categoryLevel1: "Programming",
      coverImageUrl: "https://example.com/cover.jpg",
      description: "Best practices for Java programming",
    }).onDuplicateKeyUpdate({
      set: { 
        title: "Effective Java",
        author: "Joshua Bloch",
        marketMedianPrice: "20.00",
      },
    });
  });

  describe("getBookByIsbn query", () => {
    it("should retrieve book data by ISBN", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.triage.getBookByIsbn({
        isbn: "9780134685991",
      });

      expect(result.found).toBe(true);
      expect(result.bookData).toBeDefined();
      if (result.bookData) {
        expect(result.bookData.isbn13).toBe("9780134685991");
        expect(result.bookData.title).toBe("Effective Java");
        expect(result.bookData.author).toBe("Joshua Bloch");
      }
    });

    it("should return not found for non-existent ISBN", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.triage.getBookByIsbn({
        isbn: "9999999999999",
      });

      expect(result.found).toBe(false);
    });

    it("should handle ISBN with hyphens", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.triage.getBookByIsbn({
        isbn: "978-0-13-468599-1",
      });

      expect(result.found).toBe(true);
      if (result.bookData) {
        expect(result.bookData.isbn13).toBe("9780134685991");
      }
    });
  });

  describe("Complete workflow integration", () => {
    it("should support full triage to catalog workflow", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Step 1: Check ISBN in triage
      const triageResult = await caller.triage.checkIsbn({
        isbn: "9780134685991",
      });

      expect(triageResult.found).toBe(true);
      expect(triageResult.decision).toBeDefined();
      expect(triageResult.bookData).toBeDefined();

      // Step 2: Get book data for catalog page
      const bookResult = await caller.triage.getBookByIsbn({
        isbn: "9780134685991",
      });

      expect(bookResult.found).toBe(true);
      expect(bookResult.bookData).toBeDefined();

      // Step 3: Calculate suggested price
      const priceResult = await caller.catalog.calculatePrice({
        isbn: "9780134685991",
        condition: "BUENO",
      });

      expect(priceResult.suggestedPrice).toBeGreaterThan(0);

      // Step 4: Create inventory item
      const catalogResult = await caller.catalog.createItem({
        isbn13: "9780134685991",
        conditionGrade: "BUENO",
        locationCode: "01A",
        listingPrice: priceResult.suggestedPrice.toFixed(2),
      });

      expect(catalogResult.success).toBe(true);
      expect(catalogResult.item).toBeDefined();
      expect(catalogResult.item.isbn13).toBe("9780134685991");
      expect(catalogResult.item.locationCode).toBe("01A");
      expect(catalogResult.item.uuid).toBeDefined();
    });

    it("should validate location code format", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Invalid location code (wrong format)
      await expect(
        caller.catalog.createItem({
          isbn13: "9780134685991",
          conditionGrade: "BUENO",
          locationCode: "INVALID",
          listingPrice: "10.00",
        })
      ).rejects.toThrow();
    });

    it("should require valid condition grade", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Invalid condition grade
      await expect(
        caller.catalog.createItem({
          isbn13: "9780134685991",
          conditionGrade: "INVALID" as any,
          locationCode: "01A",
          listingPrice: "10.00",
        })
      ).rejects.toThrow();
    });
  });

  describe("Price calculation", () => {
    beforeEach(async () => {
      // Ensure the catalog entry has a market price set for price calculation tests
      // This may be cleared by other tests (e.g., csvLocationImport) that update the catalog
      const db = await getDb();
      if (db) {
        const { catalogMasters } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(catalogMasters)
          .set({ marketMedianPrice: "20.00" })
          .where(eq(catalogMasters.isbn13, "9780134685991"));
      }
    });

    it("should calculate different prices for different conditions", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const comoNuevo = await caller.catalog.calculatePrice({
        isbn: "9780134685991",
        condition: "COMO_NUEVO",
      });

      const bueno = await caller.catalog.calculatePrice({
        isbn: "9780134685991",
        condition: "BUENO",
      });

      const aceptable = await caller.catalog.calculatePrice({
        isbn: "9780134685991",
        condition: "ACEPTABLE",
      });

      // Como Nuevo should be highest price
      expect(comoNuevo.suggestedPrice).toBeGreaterThan(bueno.suggestedPrice);
      expect(bueno.suggestedPrice).toBeGreaterThan(aceptable.suggestedPrice);
    });
  });
});
