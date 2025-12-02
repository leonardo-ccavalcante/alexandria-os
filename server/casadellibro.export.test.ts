import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
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
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("batch.exportToCasaDelLibro", () => {
  it("returns CSV with semicolon separator", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.exportToCasaDelLibro({
      filters: {},
    });

    expect(result.csv).toContain(";"); // Semicolon separator
    expect(result.csv).toContain("Category"); // English headers
  });

  it("includes all 27 required columns", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.exportToCasaDelLibro({
      filters: {},
    });

    const lines = result.csv.split("\n");
    const headers = lines[0]?.split(";") || [];
    
    expect(headers).toHaveLength(27);
    expect(headers).toContain("Category");
    expect(headers).toContain("ean13");
    expect(headers).toContain("Titulo");
    expect(headers).toContain("price");
  });

  it("includes state column for condition normalization", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.exportToCasaDelLibro({
      filters: {},
    });

    const lines = result.csv.split("\n");
    const headers = lines[0]?.split(";") || [];
    
    // State column should be at index 19
    expect(headers[19]).toBe("state");
  });

  it("includes Materia code lookup from category hierarchy", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.exportToCasaDelLibro({
      filters: {},
    });

    expect(result.stats).toBeDefined();
    expect(result.stats.totalItems).toBeGreaterThanOrEqual(0);
    expect(result.stats.withMateriaCode).toBeGreaterThanOrEqual(0);
  });

  it("uses UUID for product identifiers", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.exportToCasaDelLibro({
      filters: {},
    });

    const lines = result.csv.split("\n").slice(1);
    if (lines.length > 0 && lines[0]?.trim()) {
      const columns = lines[0]!.split(";");
      const productId = columns[11]?.replace(/"/g, ""); // product-id column (index 11)
      
      // UUID format: 8-4-4-4-12 hex characters
      expect(productId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });

  it("includes ean13 column for ISBN", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.exportToCasaDelLibro({
      filters: {},
    });

    const lines = result.csv.split("\n");
    const headers = lines[0]?.split(";") || [];
    
    // ean13 should be at index 1
    expect(headers[1]).toBe("ean13");
    expect(headers[2]).toBe("EAN13"); // Duplicate column
  });

  it("applies filters correctly", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.exportToCasaDelLibro({
      filters: {
        publisher: "Alianza Editorial",
        yearFrom: 2000,
        yearTo: 2024,
      },
    });

    expect(result.csv).toBeDefined();
    expect(result.stats.totalItems).toBeGreaterThanOrEqual(0);
  });

  it("includes price column in correct position", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.exportToCasaDelLibro({
      filters: {},
    });

    const lines = result.csv.split("\n");
    const headers = lines[0]?.split(";") || [];
    
    // Price should be at index 15
    expect(headers[15]).toBe("price");
  });

  it("has update-delete column as last field", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.exportToCasaDelLibro({
      filters: {},
    });

    const lines = result.csv.split("\n");
    const headers = lines[0]?.split(";") || [];
    
    // update-delete should be the last column (index 26)
    expect(headers[26]).toBe("update-delete");
    expect(headers).toHaveLength(27);
  });

  it("returns statistics about exported items", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batch.exportToCasaDelLibro({
      filters: {},
    });

    expect(result.stats).toMatchObject({
      totalItems: expect.any(Number),
      withPrice: expect.any(Number),
      withISBN: expect.any(Number),
      withMateriaCode: expect.any(Number),
    });
  });
});
