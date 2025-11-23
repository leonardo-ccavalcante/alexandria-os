import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
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
    res: {} as TrpcContext["res"],
  };
}

describe("CSV Import", () => {
  it("should parse CSV with quoted fields containing commas", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const csvData = `ISBN,Titulo,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Ubicación
9788466319171,"TU ROSTRO MAÑANA 1","Marías, Javier",Punto de Lectura,2021,Arte,"Un libro sobre la cara, con commas, y más",324,1st,ES,1,03A`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("should handle empty fields gracefully", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const csvData = `ISBN,Titulo,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Ubicación
9788426412843,Rabos de lagartija,"Marse, Juan",,,Literatura española,Una novela,,,,1,03F`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("should skip rows with missing ISBN", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const csvData = `ISBN,Titulo,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Ubicación
,Some Book,Some Author,Publisher,2020,Category,Synopsis,100,1st,ES,1,01A`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Missing ISBN");
  });

  it("should handle NaN values in numeric fields", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const csvData = `ISBN,Titulo,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Ubicación
9788467231694,El alquimista,"Coelho, Paulo",Círculo,NaN,Fiction,Synopsis,NaN,1st,ES,1,01A`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    // Should not throw errors for NaN values
  });

  it("should create inventory items when quantity is provided", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const csvData = `ISBN,Titulo,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Ubicación
9781234567890,Test Book,Test Author,Test Publisher,2024,Test Category,Test Synopsis,200,1st,EN,3,01A`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    
    // Verify inventory items were created
    const inventory = await caller.inventory.getGroupedByIsbn({
      limit: 100,
      offset: 0,
      sortBy: "title",
      sortDirection: "asc",
    });
    
    const book = inventory.items.find((item: any) => item.isbn13 === "9781234567890");
    expect(book).toBeDefined();
    expect(book?.totalCount).toBe(3);
  });

  it("should update existing books on duplicate ISBN", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First import
    const csvData1 = `ISBN,Titulo,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Ubicación
9780000000001,Original Title,Original Author,Original Publisher,2020,Category,Synopsis,100,1st,ES,1,01A`;

    await caller.batch.importCatalogFromCsv({ csvData: csvData1 });

    // Second import with same ISBN but different data
    const csvData2 = `ISBN,Titulo,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Ubicación
9780000000001,Updated Title,Updated Author,Updated Publisher,2021,Category,Updated Synopsis,200,2nd,EN,1,02B`;

    const result = await caller.batch.importCatalogFromCsv({ csvData: csvData2 });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    
    // Verify the book was updated
    const inventory = await caller.inventory.getGroupedByIsbn({
      limit: 100,
      offset: 0,
      sortBy: "title",
      sortDirection: "asc",
    });
    
    const book = inventory.items.find((item: any) => item.isbn13 === "9780000000001");
    expect(book?.title).toBe("Updated Title");
    expect(book?.author).toBe("Updated Author");
  });
});
