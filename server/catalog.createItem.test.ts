import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { catalogMasters, inventoryItems } from "../drizzle/schema";
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
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("catalog.createItem with synthetic ISBN", () => {
  it("should create catalog master for synthetic ISBN with bookData", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const syntheticIsbn = "00000TEST1234";
    const bookData = {
      title: "Viaje a la Alcarria",
      author: "Camilo José Cela",
      publisher: "Espasa Calpe",
      publicationYear: 1948,
    };

    // Create item with bookData
    const result = await caller.catalog.createItem({
      isbn13: syntheticIsbn,
      conditionGrade: "BUENO",
      locationCode: "01A",
      listingPrice: "15.00",
      bookData,
    });

    expect(result.success).toBe(true);
    expect(result.item).toBeDefined();
    expect(result.item.isbn13).toBe(syntheticIsbn);

    // Verify catalog master was created
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const catalogResult = await db
      .select()
      .from(catalogMasters)
      .where(eq(catalogMasters.isbn13, syntheticIsbn))
      .limit(1);

    expect(catalogResult.length).toBe(1);
    expect(catalogResult[0]?.title).toBe(bookData.title);
    expect(catalogResult[0]?.author).toBe(bookData.author);
    expect(catalogResult[0]?.publisher).toBe(bookData.publisher);
    expect(catalogResult[0]?.publicationYear).toBe(bookData.publicationYear);

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.uuid, result.item.uuid));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, syntheticIsbn));
  });

  it("should create catalog master with default author if not provided", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const syntheticIsbn = "00000TEST5678";
    const bookData = {
      title: "Libro Sin Autor",
    };

    const result = await caller.catalog.createItem({
      isbn13: syntheticIsbn,
      conditionGrade: "ACEPTABLE",
      locationCode: "02B",
      listingPrice: "8.00",
      bookData,
    });

    expect(result.success).toBe(true);

    // Verify catalog master has default author
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const catalogResult = await db
      .select()
      .from(catalogMasters)
      .where(eq(catalogMasters.isbn13, syntheticIsbn))
      .limit(1);

    expect(catalogResult.length).toBe(1);
    expect(catalogResult[0]?.title).toBe(bookData.title);
    expect(catalogResult[0]?.author).toBe("Autor Desconocido");

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, syntheticIsbn));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, syntheticIsbn));
  });

  it("should not create duplicate catalog master if already exists", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const syntheticIsbn = "00000TEST9999";
    const bookData = {
      title: "Libro Existente",
      author: "Autor Existente",
    };

    // Create first item (creates catalog master)
    const result1 = await caller.catalog.createItem({
      isbn13: syntheticIsbn,
      conditionGrade: "COMO_NUEVO",
      locationCode: "03C",
      listingPrice: "20.00",
      bookData,
    });

    expect(result1.success).toBe(true);

    // Create second item with same ISBN (should not create duplicate catalog master)
    const result2 = await caller.catalog.createItem({
      isbn13: syntheticIsbn,
      conditionGrade: "BUENO",
      locationCode: "03D",
      listingPrice: "18.00",
      bookData,
    });

    expect(result2.success).toBe(true);

    // Verify only one catalog master exists
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const catalogResult = await db
      .select()
      .from(catalogMasters)
      .where(eq(catalogMasters.isbn13, syntheticIsbn));

    expect(catalogResult.length).toBe(1);

    // Verify two inventory items exist
    const inventoryResult = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.isbn13, syntheticIsbn));

    expect(inventoryResult.length).toBe(2);

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, syntheticIsbn));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, syntheticIsbn));
  });

  it("should work without bookData for regular ISBNs", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This test assumes a catalog master already exists for this ISBN
    // In real scenario, this would be a book fetched from external API
    const regularIsbn = "9788420412146"; // El Quijote

    const result = await caller.catalog.createItem({
      isbn13: regularIsbn,
      conditionGrade: "BUENO",
      locationCode: "04A",
      listingPrice: "25.00",
      // No bookData provided - should work fine for existing books
    });

    expect(result.success).toBe(true);
    expect(result.item.isbn13).toBe(regularIsbn);

    // Cleanup
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.delete(inventoryItems).where(eq(inventoryItems.uuid, result.item.uuid));
  });

  it("should set categoryLevel1 to OTROS for synthetic ISBNs", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const syntheticIsbn = "00000CATTEST1";
    const bookData = {
      title: "Libro de Categoría Desconocida",
      author: "Autor Anónimo",
    };

    const result = await caller.catalog.createItem({
      isbn13: syntheticIsbn,
      conditionGrade: "BUENO",
      locationCode: "05A",
      listingPrice: "12.00",
      bookData,
    });

    expect(result.success).toBe(true);

    // Verify category is set to OTROS
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const catalogResult = await db
      .select()
      .from(catalogMasters)
      .where(eq(catalogMasters.isbn13, syntheticIsbn))
      .limit(1);

    expect(catalogResult[0]?.categoryLevel1).toBe("OTROS");

    // Cleanup
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, syntheticIsbn));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, syntheticIsbn));
  });
});
