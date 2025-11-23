import { eq, and, or, like, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  catalogMasters, 
  inventoryItems, 
  salesTransactions, 
  systemSettings,
  priceHistory,
  CatalogMaster,
  InventoryItem,
  SalesTransaction,
  SystemSetting,
  PriceHistory,
  InsertCatalogMaster,
  InsertInventoryItem,
  InsertSalesTransaction,
  InsertPriceHistory
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
  
  // Build update set with only defined fields
  const updateSet: Record<string, any> = { updatedAt: new Date() };
  if (data.title !== undefined) updateSet.title = data.title;
  if (data.author !== undefined) updateSet.author = data.author;
  if (data.publisher !== undefined) updateSet.publisher = data.publisher;
  if (data.publicationYear !== undefined) updateSet.publicationYear = data.publicationYear;
  if (data.language !== undefined) updateSet.language = data.language;
  if (data.synopsis !== undefined) updateSet.synopsis = data.synopsis;
  if (data.categoryLevel1 !== undefined) updateSet.categoryLevel1 = data.categoryLevel1;
  if (data.categoryLevel2 !== undefined) updateSet.categoryLevel2 = data.categoryLevel2;
  if (data.categoryLevel3 !== undefined) updateSet.categoryLevel3 = data.categoryLevel3;
  if (data.materia !== undefined) updateSet.materia = data.materia;
  if (data.bisacCode !== undefined) updateSet.bisacCode = data.bisacCode;
  if (data.coverImageUrl !== undefined) updateSet.coverImageUrl = data.coverImageUrl;
  if (data.marketMinPrice !== undefined) updateSet.marketMinPrice = data.marketMinPrice;
  if (data.marketMedianPrice !== undefined) updateSet.marketMedianPrice = data.marketMedianPrice;
  if (data.lastPriceCheck !== undefined) updateSet.lastPriceCheck = data.lastPriceCheck;
  
  await db.insert(catalogMasters).values(data).onDuplicateKeyUpdate({
    set: updateSet
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

export async function getInventoryItemsByIsbn(isbn13: string): Promise<InventoryItem[]> {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(inventoryItems).where(eq(inventoryItems.isbn13, isbn13));
  return result;
}

export async function updateInventoryItem(uuid: string, data: Partial<InsertInventoryItem>): Promise<InventoryItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(inventoryItems).set({ ...data, updatedAt: new Date() }).where(eq(inventoryItems.uuid, uuid));
  
  const updated = await db.select().from(inventoryItems).where(eq(inventoryItems.uuid, uuid)).limit(1);
  if (updated.length === 0) throw new Error("Item not found after update");
  
  return updated[0]!;
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
  
  // Calculate total inventory value (sum of listing prices for available/listed items)
  const [inventoryValue] = await db
    .select({
      totalValue: sql<number>`COALESCE(SUM(CAST(${inventoryItems.listingPrice} AS DECIMAL(10,2))), 0)`,
    })
    .from(inventoryItems)
    .where(sql`${inventoryItems.status} IN ('AVAILABLE', 'LISTED')`);
  
  // Calculate estimated profit (listing price - cost of goods for available/listed items)
  const [profitEstimate] = await db
    .select({
      estimatedProfit: sql<number>`COALESCE(SUM(CAST(${inventoryItems.listingPrice} AS DECIMAL(10,2)) - CAST(${inventoryItems.costOfGoods} AS DECIMAL(10,2))), 0)`,
    })
    .from(inventoryItems)
    .where(sql`${inventoryItems.status} IN ('AVAILABLE', 'LISTED')`);
  
  return {
    totalInventory: Number(totalInventory?.count || 0),
    available: Number(availableCount?.count || 0),
    listed: Number(listedCount?.count || 0),
    sold: Number(soldCount?.count || 0),
    totalRevenue: Number(revenueData?.totalRevenue || 0),
    totalProfit: Number(revenueData?.totalProfit || 0),
    avgProfit: Number(revenueData?.avgProfit || 0),
    inventoryValue: Number(inventoryValue?.totalValue || 0),
    estimatedProfit: Number(profitEstimate?.estimatedProfit || 0),
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

// ============================================================================
// ADVANCED ANALYTICS
// ============================================================================

export async function getInventoryVelocity(params: {
  dateFrom?: Date;
  dateTo?: Date;
  groupBy?: 'day' | 'week' | 'month';
}) {
  const db = await getDb();
  if (!db) return [];
  
  const { dateFrom, dateTo, groupBy = 'day' } = params;
  
  // Date format based on grouping
  const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : 
                     groupBy === 'week' ? '%Y-%U' : 
                     '%Y-%m';
  
  // Build WHERE clause for date filtering
  let whereClause = '1=1';
  const whereParams: any[] = [];
  
  if (dateFrom) {
    whereClause += ' AND createdAt >= ?';
    whereParams.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND createdAt <= ?';
    whereParams.push(dateTo);
  }
  
  // Query for items added (inventory_items.createdAt)
  const addedQuery = `
    SELECT 
      DATE_FORMAT(createdAt, '${dateFormat}') as period,
      COUNT(*) as count
    FROM inventory_items
    WHERE ${whereClause}
    GROUP BY period
    ORDER BY period
  `;
  
  // Query for items sold (sales_transactions.saleDate)
  const soldQuery = `
    SELECT 
      DATE_FORMAT(saleDate, '${dateFormat}') as period,
      COUNT(*) as count
    FROM sales_transactions
    WHERE ${whereClause.replace('createdAt', 'saleDate')}
    GROUP BY period
    ORDER BY period
  `;
  
  const addedResults = await db.execute(sql.raw(addedQuery)) as any;
  const soldResults = await db.execute(sql.raw(soldQuery)) as any;
  
  // Merge results
  const periodsMap = new Map<string, { period: string; added: number; sold: number }>();
  
  addedResults.forEach((row: any) => {
    periodsMap.set(row.period, { period: row.period, added: Number(row.count), sold: 0 });
  });
  
  soldResults.forEach((row: any) => {
    const existing = periodsMap.get(row.period);
    if (existing) {
      existing.sold = Number(row.count);
    } else {
      periodsMap.set(row.period, { period: row.period, added: 0, sold: Number(row.count) });
    }
  });
  
  return Array.from(periodsMap.values()).sort((a, b) => a.period.localeCompare(b.period));
}

export async function getAnalyticsByAuthor(params: {
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const { dateFrom, dateTo, limit = 20 } = params;
  
  let whereClause = '1=1';
  const whereParams: any[] = [];
  
  if (dateFrom) {
    whereClause += ' AND ii.createdAt >= ?';
    whereParams.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND ii.createdAt <= ?';
    whereParams.push(dateTo);
  }
  
  const query = `
    SELECT 
      cm.author,
      COUNT(DISTINCT ii.uuid) as totalItems,
      COUNT(DISTINCT CASE WHEN ii.status = 'AVAILABLE' THEN ii.uuid END) as availableItems,
      COUNT(DISTINCT CASE WHEN ii.status = 'SOLD' THEN ii.uuid END) as soldItems,
      COALESCE(SUM(CASE WHEN ii.status IN ('AVAILABLE', 'LISTED') THEN CAST(ii.listingPrice AS DECIMAL(10,2)) END), 0) as inventoryValue,
      COALESCE(SUM(st.finalSalePrice), 0) as totalRevenue,
      COALESCE(SUM(st.netProfit), 0) as totalProfit,
      COALESCE(AVG(CAST(ii.listingPrice AS DECIMAL(10,2))), 0) as avgPrice
    FROM catalog_masters cm
    LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13
    LEFT JOIN sales_transactions st ON ii.uuid = st.uuid
    WHERE ${whereClause} AND cm.author IS NOT NULL AND cm.author != ''
    GROUP BY cm.author
    ORDER BY totalItems DESC
    LIMIT ${limit}
  `;
  
  const results = await db.execute(sql.raw(query)) as any;
  
  return (results as any[]).map((r: any) => ({
    author: r.author,
    totalItems: Number(r.totalItems),
    availableItems: Number(r.availableItems),
    soldItems: Number(r.soldItems),
    inventoryValue: Number(r.inventoryValue),
    totalRevenue: Number(r.totalRevenue),
    totalProfit: Number(r.totalProfit),
    avgPrice: Number(r.avgPrice),
  }));
}

export async function getAnalyticsByPublisher(params: {
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const { dateFrom, dateTo, limit = 20 } = params;
  
  let whereClause = '1=1';
  const whereParams: any[] = [];
  
  if (dateFrom) {
    whereClause += ' AND ii.createdAt >= ?';
    whereParams.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND ii.createdAt <= ?';
    whereParams.push(dateTo);
  }
  
  const query = `
    SELECT 
      cm.publisher,
      COUNT(DISTINCT ii.uuid) as totalItems,
      COUNT(DISTINCT CASE WHEN ii.status = 'AVAILABLE' THEN ii.uuid END) as availableItems,
      COUNT(DISTINCT CASE WHEN ii.status = 'SOLD' THEN ii.uuid END) as soldItems,
      COALESCE(SUM(CASE WHEN ii.status IN ('AVAILABLE', 'LISTED') THEN CAST(ii.listingPrice AS DECIMAL(10,2)) END), 0) as inventoryValue,
      COALESCE(SUM(st.finalSalePrice), 0) as totalRevenue,
      COALESCE(SUM(st.netProfit), 0) as totalProfit,
      COALESCE(AVG(CAST(ii.listingPrice AS DECIMAL(10,2))), 0) as avgPrice
    FROM catalog_masters cm
    LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13
    LEFT JOIN sales_transactions st ON ii.uuid = st.uuid
    WHERE ${whereClause} AND cm.publisher IS NOT NULL AND cm.publisher != ''
    GROUP BY cm.publisher
    ORDER BY totalItems DESC
    LIMIT ${limit}
  `;
  
  const results = await db.execute(sql.raw(query)) as any;
  
  return (results as any[]).map((r: any) => ({
    publisher: r.publisher,
    totalItems: Number(r.totalItems),
    availableItems: Number(r.availableItems),
    soldItems: Number(r.soldItems),
    inventoryValue: Number(r.inventoryValue),
    totalRevenue: Number(r.totalRevenue),
    totalProfit: Number(r.totalProfit),
    avgPrice: Number(r.avgPrice),
  }));
}

export async function getAnalyticsByCategory(params: {
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const { dateFrom, dateTo } = params;
  
  let whereClause = '1=1';
  const whereParams: any[] = [];
  
  if (dateFrom) {
    whereClause += ' AND ii.createdAt >= ?';
    whereParams.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND ii.createdAt <= ?';
    whereParams.push(dateTo);
  }
  
  const query = `
    SELECT 
      COALESCE(cm.categoryLevel1, 'Uncategorized') as category,
      COUNT(DISTINCT ii.uuid) as totalItems,
      COUNT(DISTINCT CASE WHEN ii.status = 'AVAILABLE' THEN ii.uuid END) as availableItems,
      COUNT(DISTINCT CASE WHEN ii.status = 'SOLD' THEN ii.uuid END) as soldItems,
      COALESCE(SUM(CASE WHEN ii.status IN ('AVAILABLE', 'LISTED') THEN CAST(ii.listingPrice AS DECIMAL(10,2)) END), 0) as inventoryValue,
      COALESCE(SUM(st.finalSalePrice), 0) as totalRevenue,
      COALESCE(SUM(st.netProfit), 0) as totalProfit
    FROM catalog_masters cm
    LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13
    LEFT JOIN sales_transactions st ON ii.uuid = st.uuid
    WHERE ${whereClause}
    GROUP BY category
    ORDER BY totalItems DESC
  `;
  
  const results = await db.execute(sql.raw(query)) as any;
  
  return (results as any[]).map((r: any) => ({
    category: r.category,
    totalItems: Number(r.totalItems),
    availableItems: Number(r.availableItems),
    soldItems: Number(r.soldItems),
    inventoryValue: Number(r.inventoryValue),
    totalRevenue: Number(r.totalRevenue),
    totalProfit: Number(r.totalProfit),
  }));
}

export async function getAnalyticsByLocation(params: {
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  
  // Note: Date filtering temporarily disabled due to SQL template complexity
  // Will be re-enabled after refactoring to use Drizzle query builder
  const query = sql`
    SELECT 
      COALESCE(locationCode, 'No Location') as location,
      COUNT(*) as totalItems,
      COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END) as availableItems,
      COUNT(CASE WHEN status = 'LISTED' THEN 1 END) as listedItems,
      COUNT(CASE WHEN status = 'SOLD' THEN 1 END) as soldItems,
      COALESCE(SUM(CASE WHEN status IN ('AVAILABLE', 'LISTED') THEN CAST(listingPrice AS DECIMAL(10,2)) END), 0) as inventoryValue,
      COALESCE(AVG(CAST(listingPrice AS DECIMAL(10,2))), 0) as avgPrice
    FROM inventory_items
    GROUP BY location
    ORDER BY totalItems DESC
  `;
  
  const results = await db.execute(query) as any;  
  return (results as any[]).map((r: any) => ({
    location: r.location,
    totalItems: Number(r.totalItems),
    availableItems: Number(r.availableItems),
    listedItems: Number(r.listedItems),
    soldItems: Number(r.soldItems),
    inventoryValue: Number(r.inventoryValue),
    avgPrice: Number(r.avgPrice),
    utilization: Number(r.totalItems) > 0 ? (Number(r.availableItems) + Number(r.listedItems)) / Number(r.totalItems) * 100 : 0,
  }));
}

// ============================================================================
// PRICE HISTORY
// ============================================================================

/**
 * Save marketplace price details for a book
 */
export async function savePriceHistory(prices: InsertPriceHistory[]) {
  const db = await getDb();
  if (!db || prices.length === 0) return;
  
  try {
    await db.insert(priceHistory).values(prices);
  } catch (error) {
    console.error("[Database] Failed to save price history:", error);
    throw error;
  }
}

/**
 * Get latest marketplace prices for a book (within last 24 hours)
 */
export async function getLatestMarketplacePrices(isbn: string): Promise<PriceHistory[]> {
  const db = await getDb();
  if (!db) return [];
  
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  try {
    const results = await db
      .select()
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.isbn13, isbn),
          gte(priceHistory.scrapedAt, oneDayAgo)
        )
      )
      .orderBy(desc(priceHistory.scrapedAt));
    
    return results;
  } catch (error) {
    console.error("[Database] Failed to get latest marketplace prices:", error);
    return [];
  }
}
