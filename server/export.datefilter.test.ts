import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

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
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("Export Date Range Filtering", () => {
  it("exportToCsv accepts createdFrom and createdTo date parameters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Mock searchInventory to verify it receives date parameters
    const searchInventorySpy = vi.spyOn(db, "searchInventory");
    searchInventorySpy.mockResolvedValue({
      items: [],
      total: 0,
      hasMore: false,
    });

    const createdFrom = new Date("2026-01-01");
    const createdTo = new Date("2026-01-05");

    await caller.batch.exportToCsv({
      filters: {
        createdFrom,
        createdTo,
      },
    });

    expect(searchInventorySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: createdFrom,
        dateTo: createdTo,
        limit: 10000,
      })
    );

    searchInventorySpy.mockRestore();
  });

  it("exportToIberlibro accepts createdFrom and createdTo date parameters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const searchInventorySpy = vi.spyOn(db, "searchInventory");
    searchInventorySpy.mockResolvedValue({
      items: [],
      total: 0,
      hasMore: false,
    });

    const createdFrom = new Date("2026-01-01");
    const createdTo = new Date("2026-01-05");

    await caller.batch.exportToIberlibro({
      filters: {
        createdFrom,
        createdTo,
      },
      shippingTemplateId: "ST-00001",
    });

    expect(searchInventorySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: createdFrom,
        dateTo: createdTo,
        limit: 10000,
        excludeSalesChannel: "Iberlibro",
      })
    );

    searchInventorySpy.mockRestore();
  });

  it("exportToTodocoleccion accepts createdFrom and createdTo date parameters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const searchInventorySpy = vi.spyOn(db, "searchInventory");
    searchInventorySpy.mockResolvedValue({
      items: [],
      total: 0,
      hasMore: false,
    });

    const createdFrom = new Date("2026-01-01");
    const createdTo = new Date("2026-01-05");

    await caller.batch.exportToTodocoleccion({
      filters: {
        createdFrom,
        createdTo,
      },
    });

    expect(searchInventorySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: createdFrom,
        dateTo: createdTo,
        limit: 10000,
      })
    );

    searchInventorySpy.mockRestore();
  });

  it("exportToCasaDelLibro accepts createdFrom and createdTo date parameters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const searchInventorySpy = vi.spyOn(db, "searchInventory");
    searchInventorySpy.mockResolvedValue({
      items: [],
      total: 0,
      hasMore: false,
    });

    const createdFrom = new Date("2026-01-01");
    const createdTo = new Date("2026-01-05");

    await caller.batch.exportToCasaDelLibro({
      filters: {
        createdFrom,
        createdTo,
      },
    });

    expect(searchInventorySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: createdFrom,
        dateTo: createdTo,
        limit: 10000,
      })
    );

    searchInventorySpy.mockRestore();
  });

  it("exportToEbay accepts createdFrom and createdTo date parameters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const searchInventorySpy = vi.spyOn(db, "searchInventory");
    searchInventorySpy.mockResolvedValue({
      items: [],
      total: 0,
      hasMore: false,
    });

    const createdFrom = new Date("2026-01-01");
    const createdTo = new Date("2026-01-05");

    await caller.batch.exportToEbay({
      filters: {
        createdFrom,
        createdTo,
      },
    });

    expect(searchInventorySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: createdFrom,
        dateTo: createdTo,
        limit: 10000,
      })
    );

    searchInventorySpy.mockRestore();
  });

  it("all export functions work without date parameters (backward compatible)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const searchInventorySpy = vi.spyOn(db, "searchInventory");
    searchInventorySpy.mockResolvedValue({
      items: [],
      total: 0,
      hasMore: false,
    });

    // Test without date filters
    await caller.batch.exportToCsv({ filters: {} });

    expect(searchInventorySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: undefined,
        dateTo: undefined,
        limit: 10000,
      })
    );

    searchInventorySpy.mockRestore();
  });
});
