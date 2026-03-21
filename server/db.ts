import { eq, desc, and, or, gte, lte, like, isNull, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from 'mysql2/promise';
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
  InsertPriceHistory,
  locationLog,
  LocationLog
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

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

// Get mysql2 connection pool for raw queries
export async function getPool() {
  if (!_pool && process.env.DATABASE_URL) {
    try {
      _pool = mysql.createPool(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to create pool:", error);
      _pool = null;
    }
  }
  return _pool;
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
  if (!db) throw new Error('Database not available');
  
  const result = await db.select().from(catalogMasters).where(eq(catalogMasters.isbn13, isbn13)).limit(1);
  return result[0];
}

export async function upsertCatalogMaster(data: InsertCatalogMaster): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new Error("Database not available");
  
  // Filter out undefined values
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([_, value]) => value !== undefined)
  );
  
  // Build column names and placeholders for INSERT
  const columns = Object.keys(cleanData);
  const values = Object.values(cleanData);
  const placeholders = columns.map(() => '?').join(', ');
  
  // Build UPDATE clause (exclude primary key)
  const updateClauses = columns
    .filter(col => col !== 'isbn13')
    .map(col => `\`${col}\` = VALUES(\`${col}\`)`)
    .join(', ');
  
  // Add updatedAt to update clause
  const finalUpdateClause = updateClauses + ', `updatedAt` = NOW()';
  
  // Build SQL query
  const columnList = columns.map(c => `\`${c}\``).join(', ');
  const query = `
    INSERT INTO \`catalog_masters\` (${columnList})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE ${finalUpdateClause}
  `;
  
  // Execute with mysql2 pool
  await pool.execute(query, values);
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

/**
 * Get inventory summary for a book (total count and most common allocation)
 * Used for duplicate detection in triage
 */
export async function getInventorySummaryByIsbn(isbn13: string): Promise<{
  totalCount: number;
  availableCount: number;
  mostCommonAllocation: string | null;
} | null> {
  const db = await getDb();
  if (!db) return null;
  
  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.isbn13, isbn13));
  
  if (items.length === 0) {
    return null;
  }
  
  // Count available items (not SOLD, DONATED, REJECTED, MISSING)
  const availableStatuses = ['INGESTION', 'AVAILABLE', 'LISTED', 'RESERVED'];
  const availableCount = items.filter(item => availableStatuses.includes(item.status)).length;
  
  // Find most common allocation (locationCode)
  const locationCounts = new Map<string, number>();
  items.forEach(item => {
    if (item.locationCode) {
      locationCounts.set(item.locationCode, (locationCounts.get(item.locationCode) || 0) + 1);
    }
  });
  
  let mostCommonAllocation: string | null = null;
  let maxCount = 0;
  locationCounts.forEach((count, location) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommonAllocation = location;
    }
  });
  
  return {
    totalCount: items.length,
    availableCount,
    mostCommonAllocation,
  };
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
  excludeSalesChannel?: string;
  /** Tenant isolation: only return items belonging to this library. */
  libraryId?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  
  const conditions = [];
  
  // Tenant isolation
  if (filters.libraryId !== undefined) {
    conditions.push(eq(inventoryItems.libraryId, filters.libraryId));
  }
  
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
  if (filters.excludeSalesChannel) {
    // Exclude items where salesChannels JSON array contains the specified channel
    // Using NOT LIKE to check if the channel name appears in the JSON array
    conditions.push(sql`(${inventoryItems.salesChannels} IS NULL OR ${inventoryItems.salesChannels} NOT LIKE ${`%"${filters.excludeSalesChannel}"%`})`);
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
  /** Tenant isolation: only return transactions belonging to this library. */
  libraryId?: number;
}) {
  const db = await getDb();
  if (!db) return { transactions: [], total: 0 };
  
  const conditions = [];
  
  // Tenant isolation
  if (filters.libraryId !== undefined) {
    conditions.push(eq(salesTransactions.libraryId, filters.libraryId));
  }
  
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

export async function getDashboardKPIs(libraryId?: number) {
  const db = await getDb();
  if (!db) return null;
  
  // Build tenant filter condition
  const tenantFilter = libraryId !== undefined ? eq(inventoryItems.libraryId, libraryId) : undefined;
  const txTenantFilter = libraryId !== undefined ? eq(salesTransactions.libraryId, libraryId) : undefined;
  
  // Count unique books (ISBNs), not individual inventory items
  const [totalInventory] = await db
    .select({ count: sql<number>`count(DISTINCT ${inventoryItems.isbn13})` })
    .from(inventoryItems)
    .where(tenantFilter);
  
  const [availableCount] = await db
    .select({ count: sql<number>`count(DISTINCT ${inventoryItems.isbn13})` })
    .from(inventoryItems)
    .where(tenantFilter ? and(tenantFilter, eq(inventoryItems.status, 'AVAILABLE')) : eq(inventoryItems.status, 'AVAILABLE'));
  
  const [listedCount] = await db
    .select({ count: sql<number>`count(DISTINCT ${inventoryItems.isbn13})` })
    .from(inventoryItems)
    .where(tenantFilter ? and(tenantFilter, eq(inventoryItems.status, 'LISTED')) : eq(inventoryItems.status, 'LISTED'));
  
  const [soldCount] = await db
    .select({ count: sql<number>`count(DISTINCT ${inventoryItems.isbn13})` })
    .from(inventoryItems)
    .where(tenantFilter ? and(tenantFilter, eq(inventoryItems.status, 'SOLD')) : eq(inventoryItems.status, 'SOLD'));
  
  const [revenueData] = await db
    .select({ 
      totalRevenue: sql<number>`COALESCE(SUM(${salesTransactions.finalSalePrice}), 0)`,
      totalProfit: sql<number>`COALESCE(SUM(${salesTransactions.netProfit}), 0)`,
      avgProfit: sql<number>`COALESCE(AVG(${salesTransactions.netProfit}), 0)`,
    })
    .from(salesTransactions)
    .where(txTenantFilter);
  
  // Calculate total inventory value (sum of listing prices for available/listed items)
  const availableListedFilter = sql`${inventoryItems.status} IN ('AVAILABLE', 'LISTED')`;
  const [inventoryValue] = await db
    .select({
      totalValue: sql<number>`COALESCE(SUM(CAST(${inventoryItems.listingPrice} AS DECIMAL(10,2))), 0)`,
    })
    .from(inventoryItems)
    .where(tenantFilter ? and(tenantFilter, availableListedFilter) : availableListedFilter);
  
  // Calculate estimated profit (listing price - cost of goods for available/listed items)
  const [profitEstimate] = await db
    .select({
      estimatedProfit: sql<number>`COALESCE(SUM(CAST(${inventoryItems.listingPrice} AS DECIMAL(10,2)) - CAST(${inventoryItems.costOfGoods} AS DECIMAL(10,2))), 0)`,
    })
    .from(inventoryItems)
    .where(tenantFilter ? and(tenantFilter, availableListedFilter) : availableListedFilter);
  
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

export async function getSalesByChannel(libraryId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  const tenantFilter = libraryId !== undefined ? eq(salesTransactions.libraryId, libraryId) : undefined;
  
  const result = await db
    .select({
      channel: salesTransactions.channel,
      count: sql<number>`count(*)`,
      revenue: sql<number>`COALESCE(SUM(${salesTransactions.finalSalePrice}), 0)`,
      profit: sql<number>`COALESCE(SUM(${salesTransactions.netProfit}), 0)`,
    })
    .from(salesTransactions)
    .where(tenantFilter)
    .groupBy(salesTransactions.channel);
  
  return result.map(r => ({
    channel: r.channel,
    count: Number(r.count),
    revenue: Number(r.revenue),
    profit: Number(r.profit),
  }));
}

export async function getTopPerformingBooks(limit: number = 10, libraryId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  const tenantFilter = libraryId !== undefined ? eq(salesTransactions.libraryId, libraryId) : undefined;
  
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
    .where(tenantFilter)
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
  libraryId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const { dateFrom, dateTo, groupBy = 'day', libraryId } = params;
  
  // Date format based on grouping
  const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : 
                     groupBy === 'week' ? '%Y-%U' : 
                     '%Y-%m';
  
  // Build WHERE clause for date filtering
  let whereClause = '1=1';
  const whereParams: any[] = [];
  
  if (libraryId !== undefined) {
    whereClause += ` AND libraryId = ${libraryId}`;
  }
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
  const soldWhereClause = whereClause.replace('createdAt', 'saleDate');
  const soldQuery = `
    SELECT 
      DATE_FORMAT(saleDate, '${dateFormat}') as period,
      COUNT(*) as count
    FROM sales_transactions
    WHERE ${soldWhereClause}
    GROUP BY period
    ORDER BY period
  `;
  
  const pool = await getPool();
  if (!pool) return [];
  const [addedRows] = await pool.execute(addedQuery, whereParams) as any;
  const addedResults = addedRows;
  const soldWhereParams = [...whereParams];
  const [soldRows] = await pool.execute(soldQuery, soldWhereParams) as any;
  const soldResults = soldRows;
  
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
  libraryId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const { limit = 20, libraryId } = params;
  const tenantClause = libraryId !== undefined ? `AND ii.libraryId = ${libraryId}` : '';
  
  // Note: Date filtering temporarily disabled due to SQL parameter binding complexity
  // Will be re-enabled after refactoring to use Drizzle query builder
  const query = sql.raw(`
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
    LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13 ${tenantClause}
    LEFT JOIN sales_transactions st ON ii.uuid = st.itemUuid
    WHERE cm.author IS NOT NULL AND cm.author != ''
    GROUP BY cm.author
    ORDER BY totalItems DESC
    LIMIT ${limit}
  `);
  
  const rawResults = await db.execute(query) as any;
  // Drizzle execute() returns [rows, metadata], we need the rows
  const results = Array.isArray(rawResults[0]) ? rawResults[0] : rawResults;
  
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
  libraryId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const { limit = 20, libraryId } = params;
  const tenantClause = libraryId !== undefined ? `AND ii.libraryId = ${libraryId}` : '';
  
  // Note: Date filtering temporarily disabled due to SQL parameter binding complexity
  // Will be re-enabled after refactoring to use Drizzle query builder
  const query = sql.raw(`
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
    LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13 ${tenantClause}
    LEFT JOIN sales_transactions st ON ii.uuid = st.itemUuid
    WHERE cm.publisher IS NOT NULL AND cm.publisher != ''
    GROUP BY cm.publisher
    ORDER BY totalItems DESC
    LIMIT ${limit}
  `);
  
  const rawResults = await db.execute(query) as any;
  // Drizzle execute() returns [rows, metadata], we need the rows
  const results = Array.isArray(rawResults[0]) ? rawResults[0] : rawResults;
  
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
  libraryId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const { libraryId } = params;
  const tenantClause = libraryId !== undefined ? `AND ii.libraryId = ${libraryId}` : '';
  
  // Note: Date filtering temporarily disabled due to SQL parameter binding complexity
  // Will be re-enabled after refactoring to use Drizzle query builder
  const query = sql.raw(`
    SELECT 
      COALESCE(cm.categoryLevel1, 'Uncategorized') as category,
      COUNT(DISTINCT ii.uuid) as totalItems,
      COUNT(DISTINCT CASE WHEN ii.status = 'AVAILABLE' THEN ii.uuid END) as availableItems,
      COUNT(DISTINCT CASE WHEN ii.status = 'SOLD' THEN ii.uuid END) as soldItems,
      COALESCE(SUM(CASE WHEN ii.status IN ('AVAILABLE', 'LISTED') THEN CAST(ii.listingPrice AS DECIMAL(10,2)) END), 0) as inventoryValue,
      COALESCE(SUM(st.finalSalePrice), 0) as totalRevenue,
      COALESCE(SUM(st.netProfit), 0) as totalProfit
    FROM catalog_masters cm
    LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13 ${tenantClause}
    LEFT JOIN sales_transactions st ON ii.uuid = st.itemUuid
    GROUP BY category
    ORDER BY totalItems DESC
  `);
  
  const rawResults = await db.execute(query) as any;
  // Drizzle execute() returns [rows, metadata], we need the rows
  const results = Array.isArray(rawResults[0]) ? rawResults[0] : rawResults;
  
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
  libraryId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const { libraryId } = params;
  const tenantClause = libraryId !== undefined ? `AND libraryId = ${libraryId}` : '';
  
  // Note: Date filtering temporarily disabled due to SQL template complexity
  // Will be re-enabled after refactoring to use Drizzle query builder
  const query = sql.raw(`
    SELECT 
      COALESCE(locationCode, 'No Location') as location,
      COUNT(CASE WHEN status IN ('AVAILABLE', 'LISTED') THEN 1 END) as totalItems,
      COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END) as availableItems,
      COUNT(CASE WHEN status = 'LISTED' THEN 1 END) as listedItems,
      COUNT(CASE WHEN status = 'SOLD' THEN 1 END) as soldItems,
      COALESCE(SUM(CASE WHEN status IN ('AVAILABLE', 'LISTED') THEN CAST(listingPrice AS DECIMAL(10,2)) END), 0) as inventoryValue,
      COALESCE(AVG(CASE WHEN status IN ('AVAILABLE', 'LISTED') THEN CAST(listingPrice AS DECIMAL(10,2)) END), 0) as avgPrice
    FROM inventory_items
    WHERE 1=1 ${tenantClause}
    GROUP BY location
    ORDER BY totalItems DESC
  `);
  
  const rawResults = await db.execute(query) as any;
  // Drizzle execute() returns [rows, metadata], we need the rows
  const results = Array.isArray(rawResults[0]) ? rawResults[0] : rawResults;
  const CAPACITY_THRESHOLD = 25;
  
  return (results as any[]).map((r: any) => {
    const totalItems = Number(r.totalItems);
    const freeSpace = Math.max(0, CAPACITY_THRESHOLD - totalItems);
    const capacityPercentage = (totalItems / CAPACITY_THRESHOLD) * 100;
    const isNearCapacity = capacityPercentage >= 80; // Warning at 80% (20 books)
    const isAtCapacity = capacityPercentage >= 100; // Full at 100% (25 books)
    
    return {
      location: r.location,
      totalItems,
      availableItems: Number(r.availableItems),
      listedItems: Number(r.listedItems),
      soldItems: Number(r.soldItems),
      inventoryValue: Number(r.inventoryValue),
      avgPrice: Number(r.avgPrice),
      utilization: totalItems > 0 ? (Number(r.availableItems) + Number(r.listedItems)) / totalItems * 100 : 0,
      // Capacity tracking fields
      freeSpace,
      capacityPercentage: Math.min(100, capacityPercentage),
      isNearCapacity,
      isAtCapacity,
    };
  });
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


// --- Recatalogation helpers ---------------------------------------------------

/** Return all non-sold, non-donated items for a given ISBN in a library. */
export async function getActiveItemsByIsbnAndLibrary(
  isbn13: string,
  libraryId: number
): Promise<InventoryItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.isbn13, isbn13),
        eq(inventoryItems.libraryId, libraryId),
        sql`${inventoryItems.status} NOT IN ('SOLD','DONATED','REJECTED')`
      )
    );
}

/**
 * Batch fetch active inventory items for multiple ISBNs in a single query.
 * Returns a Map<isbn13, InventoryItem[]> for O(1) lookup during CSV import.
 */
export async function getActiveItemsByIsbnsBatch(
  isbn13s: string[],
  libraryId: number
): Promise<Map<string, InventoryItem[]>> {
  const db = await getDb();
  const result = new Map<string, InventoryItem[]>();
  if (!db || isbn13s.length === 0) return result;
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(
      and(
        inArray(inventoryItems.isbn13, isbn13s),
        eq(inventoryItems.libraryId, libraryId),
        sql`${inventoryItems.status} NOT IN ('SOLD','DONATED','REJECTED')`
      )
    );
  for (const row of rows) {
    const list = result.get(row.isbn13) ?? [];
    list.push(row);
    result.set(row.isbn13, list);
  }
  return result;
}

/** Append a row to location_log. Fire-and-forget safe (never throws). */
export async function appendLocationLog(entry: {
  itemUuid: string;
  libraryId: number;
  fromLocation: string | null;
  toLocation: string | null;
  changedBy?: number;
  reason?: string;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(locationLog).values({
      itemUuid: entry.itemUuid,
      libraryId: entry.libraryId,
      fromLocation: entry.fromLocation ?? undefined,
      toLocation: entry.toLocation ?? undefined,
      changedBy: entry.changedBy,
      reason: entry.reason ?? "import",
    });
  } catch (e) {
    console.warn("[DB] appendLocationLog failed:", e);
  }
}

/** Return location history for a single item, newest first. */
export async function getLocationHistory(itemUuid: string): Promise<LocationLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(locationLog)
    .where(eq(locationLog.itemUuid, itemUuid))
    .orderBy(desc(locationLog.changedAt));
}

/** Return recent location changes across a whole library. */
export async function getLibraryLocationHistory(
  libraryId: number,
  limit = 50
): Promise<LocationLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(locationLog)
    .where(eq(locationLog.libraryId, libraryId))
    .orderBy(desc(locationLog.changedAt))
    .limit(limit);
}

/** Count items not verified within the last N days. */
export async function countStaleItems(
  libraryId: number,
  thresholdDays = 90
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - thresholdDays * 86400_000);
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.libraryId, libraryId),
        sql`${inventoryItems.status} IN ('AVAILABLE','LISTED','RESERVED')`,
        or(
          isNull(inventoryItems.lastVerifiedAt),
          lte(inventoryItems.lastVerifiedAt, cutoff)
        )
      )
    );
  return Number(row?.count ?? 0);
}

/** Return stale items (not verified within N days), oldest first. */
export async function getStaleItems(params: {
  libraryId: number;
  thresholdDays?: number;
  limit?: number;
  offset?: number;
}): Promise<InventoryItem[]> {
  const db = await getDb();
  if (!db) return [];
  const { libraryId, thresholdDays = 90, limit = 50, offset = 0 } = params;
  const cutoff = new Date(Date.now() - thresholdDays * 86400_000);
  return db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.libraryId, libraryId),
        sql`${inventoryItems.status} IN ('AVAILABLE','LISTED','RESERVED')`,
        or(
          isNull(inventoryItems.lastVerifiedAt),
          lte(inventoryItems.lastVerifiedAt, cutoff)
        )
      )
    )
    .orderBy(inventoryItems.lastVerifiedAt)
    .limit(limit)
    .offset(offset);
}
