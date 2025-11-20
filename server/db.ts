import { eq, and, or, like, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  catalogMasters, 
  inventoryItems, 
  salesTransactions, 
  systemSettings,
  CatalogMaster,
  InventoryItem,
  SalesTransaction,
  SystemSetting,
  InsertCatalogMaster,
  InsertInventoryItem,
  InsertSalesTransaction
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// CATALOG MASTERS
// ============================================================================

export async function getCatalogMasterByIsbn(isbn13: string): Promise<CatalogMaster | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(catalogMasters).where(eq(catalogMasters.isbn13, isbn13)).limit(1);
  return result[0];
}

export async function upsertCatalogMaster(data: InsertCatalogMaster): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(catalogMasters).values(data).onDuplicateKeyUpdate({
    set: {
      title: data.title,
      author: data.author,
      publisher: data.publisher,
      publicationYear: data.publicationYear,
      language: data.language,
      synopsis: data.synopsis,
      categoryLevel1: data.categoryLevel1,
      categoryLevel2: data.categoryLevel2,
      categoryLevel3: data.categoryLevel3,
      materia: data.materia,
      bisacCode: data.bisacCode,
      coverImageUrl: data.coverImageUrl,
      marketMinPrice: data.marketMinPrice,
      marketMedianPrice: data.marketMedianPrice,
      lastPriceCheck: data.lastPriceCheck,
      updatedAt: new Date(),
    }
  });
}

// ============================================================================
// INVENTORY ITEMS
// ============================================================================

export async function createInventoryItem(data: InsertInventoryItem): Promise<InventoryItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const uuid = data.uuid || crypto.randomUUID();
  await db.insert(inventoryItems).values({ ...data, uuid });
  
  const result = await db.select().from(inventoryItems).where(eq(inventoryItems.uuid, uuid)).limit(1);
  return result[0]!;
}

export async function getInventoryItemByUuid(uuid: string): Promise<InventoryItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(inventoryItems).where(eq(inventoryItems.uuid, uuid)).limit(1);
  return result[0];
}

export async function updateInventoryItem(uuid: string, data: Partial<InsertInventoryItem>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(inventoryItems).set({ ...data, updatedAt: new Date() }).where(eq(inventoryItems.uuid, uuid));
}

export async function searchInventory(filters: {
  status?: string;
  condition?: string;
  location?: string;
  searchText?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  
  const conditions = [];
  
  if (filters.status) {
    conditions.push(eq(inventoryItems.status, filters.status as any));
  }
  if (filters.condition) {
    conditions.push(eq(inventoryItems.conditionGrade, filters.condition as any));
  }
  if (filters.location) {
    conditions.push(like(inventoryItems.locationCode, `${filters.location}%`));
  }
  if (filters.dateFrom) {
    conditions.push(gte(inventoryItems.createdAt, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(inventoryItems.createdAt, filters.dateTo));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(inventoryItems)
    .where(whereClause);
  const total = Number(countResult[0]?.count || 0);
  
  // Get items with pagination
  let query = db
    .select({
      item: inventoryItems,
      book: catalogMasters
    })
    .from(inventoryItems)
    .leftJoin(catalogMasters, eq(inventoryItems.isbn13, catalogMasters.isbn13))
    .where(whereClause)
    .orderBy(desc(inventoryItems.createdAt));
  
  if (filters.limit) {
    query = query.limit(filters.limit) as any;
  }
  if (filters.offset) {
    query = query.offset(filters.offset) as any;
  }
  
  const items = await query;
  
  // Filter by search text if provided (client-side filtering for text fields)
  let filteredItems = items;
  if (filters.searchText) {
    const searchLower = filters.searchText.toLowerCase();
    filteredItems = items.filter(row => 
      row.book?.title?.toLowerCase().includes(searchLower) ||
      row.book?.author?.toLowerCase().includes(searchLower) ||
      row.item.isbn13.includes(searchLower)
    );
  }
  
  return { items: filteredItems, total };
}

export async function batchUpdateInventoryItems(updates: Array<{
  uuid: string;
  locationCode?: string;
  listingPrice?: string;
  status?: string;
  conditionNotes?: string;
}>): Promise<{ updated: number; errors: Array<{ uuid: string; error: string }> }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  let updated = 0;
  const errors: Array<{ uuid: string; error: string }> = [];
  
  for (const update of updates) {
    try {
      const data: Partial<InsertInventoryItem> = {};
      
      if (update.locationCode !== undefined) {
        data.locationCode = update.locationCode || null;
      }
      if (update.listingPrice !== undefined) {
        data.listingPrice = update.listingPrice;
      }
      if (update.status !== undefined) {
        data.status = update.status as any;
      }
      if (update.conditionNotes !== undefined) {
        data.conditionNotes = update.conditionNotes || null;
      }
      
      await updateInventoryItem(update.uuid, data);
      updated++;
    } catch (error: any) {
      errors.push({ uuid: update.uuid, error: error.message });
    }
  }
  
  return { updated, errors };
}

// ============================================================================
// SALES TRANSACTIONS
// ============================================================================

export async function createSalesTransaction(data: InsertSalesTransaction): Promise<SalesTransaction> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const transactionId = data.transactionId || crypto.randomUUID();
  await db.insert(salesTransactions).values({ ...data, transactionId });
  
  const result = await db.select().from(salesTransactions).where(eq(salesTransactions.transactionId, transactionId)).limit(1);
  return result[0]!;
}

export async function getSalesTransactions(filters: {
  channel?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { transactions: [], total: 0 };
  
  const conditions = [];
  
  if (filters.channel) {
    conditions.push(eq(salesTransactions.channel, filters.channel));
  }
  if (filters.dateFrom) {
    conditions.push(gte(salesTransactions.saleDate, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(salesTransactions.saleDate, filters.dateTo));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(salesTransactions)
    .where(whereClause);
  const total = Number(countResult[0]?.count || 0);
  
  // Get transactions with pagination
  let query = db
    .select()
    .from(salesTransactions)
    .where(whereClause)
    .orderBy(desc(salesTransactions.saleDate));
  
  if (filters.limit) {
    query = query.limit(filters.limit) as any;
  }
  if (filters.offset) {
    query = query.offset(filters.offset) as any;
  }
  
  const transactions = await query;
  
  return { transactions, total };
}

// ============================================================================
// SYSTEM SETTINGS
// ============================================================================

export async function getSystemSetting(key: string): Promise<SystemSetting | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(systemSettings).where(eq(systemSettings.settingKey, key)).limit(1);
  return result[0];
}

export async function getAllSystemSettings(): Promise<SystemSetting[]> {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(systemSettings);
}

export async function updateSystemSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(systemSettings).set({ settingValue: value, updatedAt: new Date() }).where(eq(systemSettings.settingKey, key));
}

// ============================================================================
// DASHBOARD ANALYTICS
// ============================================================================

export async function getDashboardKPIs() {
  const db = await getDb();
  if (!db) return null;
  
  const [totalInventory] = await db
    .select({ count: sql<number>`count(*)` })
    .from(inventoryItems);
  
  const [availableCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(inventoryItems)
    .where(eq(inventoryItems.status, 'AVAILABLE'));
  
  const [listedCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(inventoryItems)
    .where(eq(inventoryItems.status, 'LISTED'));
  
  const [soldCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(inventoryItems)
    .where(eq(inventoryItems.status, 'SOLD'));
  
  const [revenueData] = await db
    .select({ 
      totalRevenue: sql<number>`COALESCE(SUM(${salesTransactions.finalSalePrice}), 0)`,
      totalProfit: sql<number>`COALESCE(SUM(${salesTransactions.netProfit}), 0)`,
      avgProfit: sql<number>`COALESCE(AVG(${salesTransactions.netProfit}), 0)`,
    })
    .from(salesTransactions);
  
  return {
    totalInventory: Number(totalInventory?.count || 0),
    available: Number(availableCount?.count || 0),
    listed: Number(listedCount?.count || 0),
    sold: Number(soldCount?.count || 0),
    totalRevenue: Number(revenueData?.totalRevenue || 0),
    totalProfit: Number(revenueData?.totalProfit || 0),
    avgProfit: Number(revenueData?.avgProfit || 0),
  };
}

export async function getSalesByChannel() {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select({
      channel: salesTransactions.channel,
      count: sql<number>`count(*)`,
      revenue: sql<number>`COALESCE(SUM(${salesTransactions.finalSalePrice}), 0)`,
      profit: sql<number>`COALESCE(SUM(${salesTransactions.netProfit}), 0)`,
    })
    .from(salesTransactions)
    .groupBy(salesTransactions.channel);
  
  return result.map(r => ({
    channel: r.channel,
    count: Number(r.count),
    revenue: Number(r.revenue),
    profit: Number(r.profit),
  }));
}

export async function getTopPerformingBooks(limit: number = 10) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select({
      isbn13: salesTransactions.isbn13,
      title: catalogMasters.title,
      author: catalogMasters.author,
      salesCount: sql<number>`count(*)`,
      totalRevenue: sql<number>`COALESCE(SUM(${salesTransactions.finalSalePrice}), 0)`,
      totalProfit: sql<number>`COALESCE(SUM(${salesTransactions.netProfit}), 0)`,
    })
    .from(salesTransactions)
    .leftJoin(catalogMasters, eq(salesTransactions.isbn13, catalogMasters.isbn13))
    .groupBy(salesTransactions.isbn13, catalogMasters.title, catalogMasters.author)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  
  return result.map(r => ({
    isbn13: r.isbn13,
    title: r.title || 'Unknown',
    author: r.author || 'Unknown',
    salesCount: Number(r.salesCount),
    totalRevenue: Number(r.totalRevenue),
    totalProfit: Number(r.totalProfit),
  }));
}
