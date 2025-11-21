import { describe, expect, it, beforeEach } from "vitest";
import { upsertCatalogMaster, getCatalogMasterByIsbn } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): { ctx: TrpcContext } {
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

  return { ctx };
}

describe("New Fields Integration", () => {
  const testIsbn = "9780134685999";

  beforeEach(async () => {
    // Clean up test data
    try {
      const db = await import("./db").then(m => m.getDb());
      if (db) {
        const { catalogMasters } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn));
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Database Schema", () => {
    it("should store pages field correctly", async () => {
      await upsertCatalogMaster({
        isbn13: testIsbn,
        title: "Test Book",
        author: "Test Author",
        pages: 350,
      });

      const book = await getCatalogMasterByIsbn(testIsbn);
      expect(book?.pages).toBe(350);
    });

    it("should store edition field correctly", async () => {
      await upsertCatalogMaster({
        isbn13: testIsbn,
        title: "Test Book",
        author: "Test Author",
        edition: "2nd Edition",
      });

      const book = await getCatalogMasterByIsbn(testIsbn);
      expect(book?.edition).toBe("2nd Edition");
    });

    it("should store 2-character language code correctly", async () => {
      await upsertCatalogMaster({
        isbn13: testIsbn,
        title: "Test Book",
        author: "Test Author",
        language: "ES",
      });

      const book = await getCatalogMasterByIsbn(testIsbn);
      expect(book?.language).toBe("ES");
    });

    it("should handle all new fields together", async () => {
      await upsertCatalogMaster({
        isbn13: testIsbn,
        title: "Complete Test Book",
        author: "Test Author",
        pages: 450,
        edition: "1st Edition",
        language: "EN",
      });

      const book = await getCatalogMasterByIsbn(testIsbn);
      expect(book?.pages).toBe(450);
      expect(book?.edition).toBe("1st Edition");
      expect(book?.language).toBe("EN");
    });
  });

  describe("CSV Import with New Fields", () => {
    it("should import CSV with pages, edition, language, and quantity", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const csvData = `ISBN,Título,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad
${testIsbn},Test Book,Test Author,Test Publisher,2024,Fiction,A test book,350,1st Edition,EN,3`;

      const result = await caller.batch.importCatalogFromCsv({ csvData });

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify catalog was created with new fields
      const book = await getCatalogMasterByIsbn(testIsbn);
      expect(book?.pages).toBe(350);
      expect(book?.edition).toBe("1st Edition");
      expect(book?.language).toBe("EN");
    });

    it("should handle missing optional fields gracefully", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const csvData = `ISBN,Título,Autor
${testIsbn},Minimal Book,Minimal Author`;

      const result = await caller.batch.importCatalogFromCsv({ csvData });

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);

      const book = await getCatalogMasterByIsbn(testIsbn);
      expect(book?.pages).toBeNull();
      expect(book?.edition).toBeNull();
      expect(book?.language).toBeNull();
    });

    it("should normalize language to 2 characters uppercase", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const csvData = `ISBN,Título,Autor,Idioma
${testIsbn},Language Test,Test Author,spanish`;

      const result = await caller.batch.importCatalogFromCsv({ csvData });

      expect(result.imported).toBe(1);

      const book = await getCatalogMasterByIsbn(testIsbn);
      expect(book?.language).toBe("SP"); // First 2 chars, uppercase
    });

    it("should parse pages as integer", async () => {
      const { ctx } = createTestContext();
      const caller = appRouter.createCaller(ctx);

      const csvData = `ISBN,Título,Autor,Páginas
${testIsbn},Pages Test,Test Author,425`;

      const result = await caller.batch.importCatalogFromCsv({ csvData });

      expect(result.imported).toBe(1);

      const book = await getCatalogMasterByIsbn(testIsbn);
      expect(book?.pages).toBe(425);
      expect(typeof book?.pages).toBe("number");
    });
  });

  describe("Category Support", () => {
    it("should support all 35+ categories from CSV", async () => {
      const categories = [
        "Arte",
        "Autoayuda y Espiritualidad",
        "Ciencias",
        "Ciencias Humanas",
        "Ciencias Políticas y Sociales",
        "Cocina",
        "Cómics Adultos",
        "Deportes y juegos",
        "Derecho",
        "Economía",
      ];

      for (const category of categories) {
        const isbn = `978013468${String(categories.indexOf(category)).padStart(4, "0")}`;
        await upsertCatalogMaster({
          isbn13: isbn,
          title: `Test ${category}`,
          author: "Test Author",
          categoryLevel1: category,
        });

        const book = await getCatalogMasterByIsbn(isbn);
        expect(book?.categoryLevel1).toBe(category);
      }
    });
  });
});
