import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
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

describe("Author Search Filter", () => {
  it("should filter books by author name", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First, import some test books
    const csvData = `ISBN,Titulo,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Ubicación
9788466319171,TU ROSTRO MAÑANA,"Marías, Javier",Punto de Lectura,2023,Arte,Una novela fascinante,324,1st Edition,ES,1,03A
9788420685083,La música en tiempos de Carlos III,"Gallego, Antonio",Alianza Editorial,2023,Música,Un estudio sobre música,184,1st Edition,ES,1,01A`;

    await caller.batch.importCatalogFromCsv({ csvData });

    // Test 1: Search by full author name
    const result1 = await caller.inventory.getGroupedByIsbn({
      author: "Marías, Javier",
      includeZeroInventory: true,
    });

    expect(result1.items.length).toBeGreaterThan(0);
    expect(result1.items.every((item: any) => item.author.includes("Marías"))).toBe(true);

    // Test 2: Search by partial author name
    const result2 = await caller.inventory.getGroupedByIsbn({
      author: "Gallego",
      includeZeroInventory: true,
    });

    expect(result2.items.length).toBeGreaterThan(0);
    expect(result2.items.every((item: any) => item.author.includes("Gallego"))).toBe(true);

    // Test 3: Search with no author filter should return all books
    const result3 = await caller.inventory.getGroupedByIsbn({
      includeZeroInventory: true,
    });

    expect(result3.items.length).toBeGreaterThanOrEqual(2);
  });

  it("should combine author filter with searchText", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Import test data
    const csvData = `ISBN,Titulo,Autor,Editorial,Año,Categoría,Sinopsis,Páginas,Edición,Idioma,Cantidad,Ubicación
9788493895761,La vida de 100 años,"Worth, Jennifer",Verssus Libros,2017,Economía,Análisis de longevidad,200,Primera edición,ES,4,01A`;

    await caller.batch.importCatalogFromCsv({ csvData });

    // Search by author AND title text
    const result = await caller.inventory.getGroupedByIsbn({
      author: "Worth",
      searchText: "vida",
      includeZeroInventory: true,
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]?.author).toContain("Worth");
    expect(result.items[0]?.title).toContain("vida");
  });
});
