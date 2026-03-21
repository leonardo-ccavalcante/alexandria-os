import { describe, expect, it, beforeEach } from "vitest";
import { vi, beforeEach } from "vitest";

vi.mock("./libraryDb", () => ({
  createLibrary: vi.fn(),
  getLibrariesForUser: vi.fn(),
  getActiveLibraryForUser: vi.fn().mockResolvedValue({ id: 1, name: "Test Library", ownerId: 1, memberRole: "owner", createdAt: new Date(), updatedAt: new Date() }),
  getLibraryById: vi.fn(),
  getLibraryMembers: vi.fn(),
  isLibraryMember: vi.fn(),
  updateLibrary: vi.fn(),
  removeMember: vi.fn(),
  updateMemberRole: vi.fn(),
  addMemberDirectly: vi.fn(),
  updateMemberLastActivity: vi.fn().mockResolvedValue(undefined),
  createInvitation: vi.fn(),
  validateInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  getActiveInvitations: vi.fn(),
  revokeInvitation: vi.fn(),
  getMemberActivityLog: vi.fn(),
}));
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getActiveItemsByIsbnAndLibrary: vi.fn().mockResolvedValue([]),
    appendLocationLog: vi.fn().mockResolvedValue(undefined),
  };
});


vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getActiveItemsByIsbnAndLibrary: vi.fn().mockResolvedValue([]),
    appendLocationLog: vi.fn().mockResolvedValue(undefined),
  };
});

import { appRouter } from "./routers";
import { getCatalogMasterByIsbn, getInventoryItemsByIsbn } from "./db";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "5yaf4MVEQLdu9XJxXmQhBb",
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

describe.skip("CSV Import with UBICACIÓN Column", () => {
  const testIsbn = "9780134685991";

  beforeEach(async () => {
    // Clean up test data
    try {
      const db = await import("./db").then(m => m.getDb());
      if (db) {
        const { catalogMasters, inventoryItems } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn));
        await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn));
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should import CSV with UBICACIÓN and create inventory items with location", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const csvData = `ISBN,Título,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Ubicación
${testIsbn},Effective Java,Joshua Bloch,Addison-Wesley,2018,Programming,Java best practices,416,3rd Edition,EN,3,02B`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify catalog was created
    const book = await getCatalogMasterByIsbn(testIsbn);
    expect(book).toBeDefined();
    expect(book?.title).toBe("Effective Java");
    expect(book?.pages).toBe(416);
    expect(book?.edition).toBe("3rd Edition");
    expect(book?.language).toBe("EN");

    // Verify inventory items were created with location
    const items = await getInventoryItemsByIsbn(testIsbn);
    expect(items).toHaveLength(3);
    items.forEach(item => {
      expect(item.locationCode).toBe("02B");
      expect(item.status).toBe("AVAILABLE");
      expect(item.conditionGrade).toBe("BUENO");
    });
  });

  it("should handle CSV without UBICACIÓN (location optional)", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const csvData = `ISBN,Título,Autor,Cantidad
${testIsbn},Test Book,Test Author,2`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);

    // Verify inventory items were created without location
    const items = await getInventoryItemsByIsbn(testIsbn);
    expect(items).toHaveLength(2);
    items.forEach(item => {
      expect(item.locationCode).toBeNull();
    });
  });

  it("should import multiple books with different locations", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const isbn1 = "9780134685991";
    const isbn2 = "9780134685992";
    
    // Clean up both ISBNs before test
    const db = await import("./db").then(m => m.getDb());
    if (db) {
      const { catalogMasters, inventoryItems } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, isbn2));
      await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, isbn2));
    }

    const csvData = `ISBN,Título,Autor,Cantidad,Ubicación
${isbn1},Book One,Author One,2,01A
${isbn2},Book Two,Author Two,3,03C`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);

    // Verify first book items
    const items1 = await getInventoryItemsByIsbn(isbn1);
    expect(items1).toHaveLength(2);
    items1.forEach(item => expect(item.locationCode).toBe("01A"));

    // Verify second book items
    const items2 = await getInventoryItemsByIsbn(isbn2);
    expect(items2).toHaveLength(3);
    items2.forEach(item => expect(item.locationCode).toBe("03C"));

    // Cleanup
    const dbCleanup = await import("./db").then(m => m.getDb());
    if (dbCleanup) {
      const { catalogMasters, inventoryItems } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await dbCleanup.delete(inventoryItems).where(eq(inventoryItems.isbn13, isbn2));
      await dbCleanup.delete(catalogMasters).where(eq(catalogMasters.isbn13, isbn2));
    }
  });

  it("should support all column name variations (Ubicación, Location, location)", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const csvData = `ISBN,Título,Autor,Cantidad,Location
${testIsbn},Test Book,Test Author,1,05E`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    expect(result.created).toBe(1);

    const items = await getInventoryItemsByIsbn(testIsbn);
    expect(items).toHaveLength(1);
    expect(items[0]?.locationCode).toBe("05E");
  });
});
