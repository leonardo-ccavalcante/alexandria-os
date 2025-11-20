import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { catalogMasters, inventoryItems } from "../drizzle/schema";
import { eq } from "drizzle-orm";

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

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Item Detail and Status Management", () => {
  const testIsbn = "9780000000010";
  let testItemUuid: string;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const ctx = createAuthContext();
    caller = appRouter.createCaller(ctx);

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clean up
    await db.delete(inventoryItems).where(eq(inventoryItems.isbn13, testIsbn));
    await db.delete(catalogMasters).where(eq(catalogMasters.isbn13, testIsbn));

    // Insert test catalog master
    await db.insert(catalogMasters).values({
      isbn13: testIsbn,
      title: "Test Book for Item Management",
      author: "Test Author",
      publisher: "Test Publisher",
      publicationYear: 2024,
      language: "es",
      categoryLevel1: "Literatura",
      marketMinPrice: "10.00",
      marketMedianPrice: "15.00",
      lastPriceCheck: new Date(),
    });

    // Insert test inventory item
    const uuid = crypto.randomUUID();
    await db.insert(inventoryItems).values({
      uuid,
      isbn13: testIsbn,
      status: "AVAILABLE",
      conditionGrade: "BUENO",
      locationCode: "01A",
      listingPrice: "12.00",
      costOfGoods: "5.00",
      createdBy: 1,
    });

    testItemUuid = uuid;
  });

  describe("Item Detail Retrieval", () => {
    it("should get item by UUID", async () => {
      const result = await caller.inventory.getByUuid({ uuid: testItemUuid });

      expect(result).toBeDefined();
      expect(result.uuid).toBe(testItemUuid);
      expect(result.isbn13).toBe(testIsbn);
      expect(result.status).toBe("AVAILABLE");
      expect(result.conditionGrade).toBe("BUENO");
      expect(result.locationCode).toBe("01A");
    });

    it("should throw error for non-existent UUID", async () => {
      await expect(
        caller.inventory.getByUuid({ uuid: "non-existent-uuid" })
      ).rejects.toThrow();
    });
  });

  describe("Location Updates", () => {
    it("should update item location", async () => {
      const result = await caller.inventory.updateLocation({
        uuid: testItemUuid,
        locationCode: "02B",
      });

      expect(result.success).toBe(true);
      expect(result.item.locationCode).toBe("02B");
    });

    it("should validate location format", async () => {
      await expect(
        caller.inventory.updateLocation({
          uuid: testItemUuid,
          locationCode: "INVALID",
        })
      ).rejects.toThrow();
    });

    it("should reject empty location code", async () => {
      await expect(
        caller.inventory.updateLocation({
          uuid: testItemUuid,
          locationCode: "",
        })
      ).rejects.toThrow();
    });
  });

  describe("Price Updates", () => {
    it("should update item price", async () => {
      const result = await caller.inventory.updatePrice({
        uuid: testItemUuid,
        listingPrice: "18.50",
      });

      expect(result.success).toBe(true);
      expect(result.item.listingPrice).toBe("18.50");
    });

    it("should validate price format", async () => {
      await expect(
        caller.inventory.updatePrice({
          uuid: testItemUuid,
          listingPrice: "-5.00",
        })
      ).rejects.toThrow();
    });

    it("should accept decimal prices", async () => {
      const result = await caller.inventory.updatePrice({
        uuid: testItemUuid,
        listingPrice: "12.99",
      });

      expect(result.success).toBe(true);
      expect(parseFloat(result.item.listingPrice || "0")).toBeCloseTo(12.99, 2);
    });
  });

  describe("Status Management", () => {
    it("should update item status to LISTED", async () => {
      const result = await caller.inventory.updateStatus({
        uuid: testItemUuid,
        status: "LISTED",
      });

      expect(result.success).toBe(true);
      expect(result.item.status).toBe("LISTED");
    });

    it("should update item status to SOLD", async () => {
      const result = await caller.inventory.updateStatus({
        uuid: testItemUuid,
        status: "SOLD",
      });

      expect(result.success).toBe(true);
      expect(result.item.status).toBe("SOLD");
    });

    it("should update item status to RESERVED", async () => {
      const result = await caller.inventory.updateStatus({
        uuid: testItemUuid,
        status: "RESERVED",
      });

      expect(result.success).toBe(true);
      expect(result.item.status).toBe("RESERVED");
    });

    it("should update item status to DONATED", async () => {
      const result = await caller.inventory.updateStatus({
        uuid: testItemUuid,
        status: "DONATED",
      });

      expect(result.success).toBe(true);
      expect(result.item.status).toBe("DONATED");
    });

    it("should update item status to MISSING", async () => {
      const result = await caller.inventory.updateStatus({
        uuid: testItemUuid,
        status: "MISSING",
      });

      expect(result.success).toBe(true);
      expect(result.item.status).toBe("MISSING");
    });

    it("should update item status back to AVAILABLE", async () => {
      const result = await caller.inventory.updateStatus({
        uuid: testItemUuid,
        status: "AVAILABLE",
      });

      expect(result.success).toBe(true);
      expect(result.item.status).toBe("AVAILABLE");
    });

    it("should reject invalid status", async () => {
      await expect(
        caller.inventory.updateStatus({
          uuid: testItemUuid,
          status: "INVALID_STATUS" as any,
        })
      ).rejects.toThrow();
    });
  });

  describe("Batch Updates", () => {
    let batchUuids: string[];

    beforeAll(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Create multiple items for batch testing
      batchUuids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

      for (const uuid of batchUuids) {
        await db.insert(inventoryItems).values({
          uuid,
          isbn13: testIsbn,
          status: "AVAILABLE",
          conditionGrade: "BUENO",
          locationCode: "01A",
          listingPrice: "10.00",
          costOfGoods: "5.00",
          createdBy: 1,
        });
      }
    });

    it("should batch update locations", async () => {
      const result = await caller.batch.updateFromCsv({
        updates: batchUuids.map(uuid => ({
          uuid,
          locationCode: "05C",
        })),
      });

      expect(result.success).toBe(true);
      expect(result.stats.updated).toBe(batchUuids.length);
      expect(result.stats.skipped).toBe(0);
    });

    it("should batch update prices", async () => {
      const result = await caller.batch.updateFromCsv({
        updates: batchUuids.map(uuid => ({
          uuid,
          listingPrice: "20.00",
        })),
      });

      expect(result.success).toBe(true);
      expect(result.stats.updated).toBe(batchUuids.length);
    });

    it("should batch update multiple fields", async () => {
      const result = await caller.batch.updateFromCsv({
        updates: batchUuids.map(uuid => ({
          uuid,
          locationCode: "06D",
          listingPrice: "25.00",
          status: "LISTED",
        })),
      });

      expect(result.success).toBe(true);
      expect(result.stats.updated).toBe(batchUuids.length);

      // Verify one of the items
      const item = await caller.inventory.getByUuid({ uuid: batchUuids[0]! });
      expect(item.locationCode).toBe("06D");
      expect(item.listingPrice).toBe("25.00");
      expect(item.status).toBe("LISTED");
    });

    it("should handle batch updates with all valid items", async () => {
      const result = await caller.batch.updateFromCsv({
        updates: [
          { uuid: batchUuids[0]!, locationCode: "07E" },
          { uuid: batchUuids[1]!, locationCode: "07E" },
          { uuid: batchUuids[2]!, locationCode: "07E" },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.stats.updated).toBe(3);
      expect(result.stats.errors.length).toBe(0);
    });

    it("should handle mixed valid and invalid updates", async () => {
      const result = await caller.batch.updateFromCsv({
        updates: [
          { uuid: batchUuids[0]!, locationCode: "08F" },
          { uuid: "non-existent-uuid", locationCode: "08F" },
        ],
      });

      // Some items updated, some failed
      expect(result.stats.totalRows).toBe(2);
      expect(result.stats.updated).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Combined Operations", () => {
    it("should update location and price in sequence", async () => {
      await caller.inventory.updateLocation({
        uuid: testItemUuid,
        locationCode: "10A",
      });

      const result = await caller.inventory.updatePrice({
        uuid: testItemUuid,
        listingPrice: "30.00",
      });

      expect(result.item.locationCode).toBe("10A");
      expect(result.item.listingPrice).toBe("30.00");
    });

    it("should maintain status through other updates", async () => {
      await caller.inventory.updateStatus({
        uuid: testItemUuid,
        status: "LISTED",
      });

      await caller.inventory.updateLocation({
        uuid: testItemUuid,
        locationCode: "11B",
      });

      const item = await caller.inventory.getByUuid({ uuid: testItemUuid });
      expect(item.status).toBe("LISTED");
      expect(item.locationCode).toBe("11B");
    });
  });
});
