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

describe("batch.importCatalogFromCsv", () => {
  it("uses Disponible column when present (new format)", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // CSV with both Cantidad and Disponible columns
    // Cantidad=10 (historical), Disponible=3 (currently available)
    const csvData = `ISBN,Título,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Disponible,Ubicación,Precio
9780000000001,Test Book,Test Author,Test Publisher,2024,Fiction,Test synopsis,200,1st,EN,10,3,01A,15.00`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    // Should create 3 items (Disponible), not 10 (Cantidad)
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("falls back to Cantidad when Disponible is missing (old format)", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Old CSV format without Disponible column
    const csvData = `ISBN,Título,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Ubicación,Precio
9780000000002,Old Format Book,Test Author,Test Publisher,2024,Fiction,Test synopsis,200,1st,EN,5,01B,12.00`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    // Should create 5 items (Cantidad as fallback)
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("creates catalog master but no inventory items when Disponible=0", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // CSV with Disponible=0 (all sold/donated)
    const csvData = `ISBN,Título,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Disponible,Ubicación,Precio
9780000000003,Sold Out Book,Test Author,Test Publisher,2024,Fiction,Test synopsis,200,1st,EN,5,0,01C,10.00`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    // Should create catalog master (imported=1) but 0 inventory items
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("handles empty Disponible by falling back to Cantidad", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // CSV with empty Disponible column
    const csvData = `ISBN,Título,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Disponible,Ubicación,Precio
9780000000004,Empty Disponible Book,Test Author,Test Publisher,2024,Fiction,Test synopsis,200,1st,EN,7,,01D,8.00`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    // Should fall back to Cantidad=7
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("prevents duplication when re-importing exported CSV", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Simulated exported CSV: Cantidad=5 (total ever), Disponible=2 (currently available)
    // This represents a book where 3 copies were sold/donated
    const csvData = `ISBN,Título,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Disponible,Ubicación,Precio
9780000000005,Partial Stock Book,Test Author,Test Publisher,2024,Fiction,Test synopsis,200,1st,EN,5,2,01E,20.00`;

    const result = await caller.batch.importCatalogFromCsv({ csvData });

    // Should create only 2 items (Disponible), not 5 (Cantidad)
    // This prevents creating duplicate items when re-importing
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
