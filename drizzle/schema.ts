import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * TABLE 1: catalog_masters
 * Purpose: Immutable bibliographic "soul" of a book. One record per ISBN.
 */
export const catalogMasters = mysqlTable("catalog_masters", {
  // Primary Key
  isbn13: varchar("isbn13", { length: 13 }).primaryKey(),
  
  // Bibliographic Data (from API)
  title: text("title").notNull(),
  author: text("author").notNull(),
  publisher: text("publisher"),
  publicationYear: int("publicationYear"),
  language: varchar("language", { length: 5 }),
  
  // Enriched Data (AI-generated or scraped)
  synopsis: text("synopsis"),
  
  // 3-Level Category Taxonomy
  categoryLevel1: text("categoryLevel1"), // e.g., "Literatura", "Historia", "Arte"
  categoryLevel2: text("categoryLevel2"), // e.g., "Narrativa española", "Historia de España"
  categoryLevel3: text("categoryLevel3"), // e.g., "Novela contemporánea", "Siglo XIX"
  materia: varchar("materia", { length: 10 }), // Numeric code from taxonomy
  
  bisacCode: varchar("bisacCode", { length: 20 }),
  
  // Visual
  coverImageUrl: text("coverImageUrl"),
  
  // Market Intelligence (scraped/cached)
  marketMinPrice: decimal("marketMinPrice", { precision: 6, scale: 2 }),
  marketMedianPrice: decimal("marketMedianPrice", { precision: 6, scale: 2 }),
  lastPriceCheck: timestamp("lastPriceCheck"),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  categoryLevel1Idx: index("idx_masters_category_l1").on(table.categoryLevel1),
}));

export type CatalogMaster = typeof catalogMasters.$inferSelect;
export type InsertCatalogMaster = typeof catalogMasters.$inferInsert;

/**
 * TABLE 2: inventory_items
 * Purpose: Physical copies. Multiple items can share the same ISBN.
 */
export const inventoryItems = mysqlTable("inventory_items", {
  // Primary Key (UUID for physical sticker label)
  uuid: varchar("uuid", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // Foreign Key
  isbn13: varchar("isbn13", { length: 13 }).notNull(),
  
  // Physical State
  status: mysqlEnum("status", [
    "INGESTION",
    "AVAILABLE",
    "LISTED",
    "RESERVED",
    "SOLD",
    "REJECTED",
    "DONATED",
    "MISSING"
  ]).notNull().default("INGESTION"),
  
  conditionGrade: mysqlEnum("conditionGrade", [
    "COMO_NUEVO",
    "BUENO",
    "ACEPTABLE"
  ]).notNull(),
  
  conditionNotes: text("conditionNotes"),
  
  // Location (validated format: 02A, 15C, etc.)
  locationCode: varchar("locationCode", { length: 3 }),
  
  // Pricing Logic
  listingPrice: decimal("listingPrice", { precision: 6, scale: 2 }),
  costOfGoods: decimal("costOfGoods", { precision: 6, scale: 2 }).default("0.00"),
  
  // Sales Data (populated on sale)
  soldAt: timestamp("soldAt"),
  soldChannel: varchar("soldChannel", { length: 50 }),
  finalSalePrice: decimal("finalSalePrice", { precision: 6, scale: 2 }),
  platformFees: decimal("platformFees", { precision: 6, scale: 2 }),
  
  // Calculated profit (stored as separate field since MySQL doesn't support GENERATED columns easily in Drizzle)
  netProfit: decimal("netProfit", { precision: 6, scale: 2 }),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
}, (table) => ({
  isbnIdx: index("idx_items_isbn").on(table.isbn13),
  statusIdx: index("idx_items_status").on(table.status),
  locationIdx: index("idx_items_location").on(table.locationCode),
  createdAtIdx: index("idx_items_created_at").on(table.createdAt),
}));

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;

/**
 * TABLE 3: sales_transactions
 * Purpose: Detailed sales log for analytics/reporting.
 */
export const salesTransactions = mysqlTable("sales_transactions", {
  // Primary Key
  transactionId: varchar("transactionId", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  
  // Foreign Key
  itemUuid: varchar("itemUuid", { length: 36 }).notNull(),
  isbn13: varchar("isbn13", { length: 13 }).notNull(),
  
  // Sale Details
  channel: varchar("channel", { length: 50 }).notNull(),
  saleDate: timestamp("saleDate").notNull().defaultNow(),
  
  // Financial Data
  listingPrice: decimal("listingPrice", { precision: 6, scale: 2 }).notNull(),
  finalSalePrice: decimal("finalSalePrice", { precision: 6, scale: 2 }).notNull(),
  platformCommissionPct: decimal("platformCommissionPct", { precision: 5, scale: 2 }),
  platformFees: decimal("platformFees", { precision: 6, scale: 2 }).notNull(),
  shippingCost: decimal("shippingCost", { precision: 6, scale: 2 }).default("0.00"),
  
  // Calculated Profit (stored fields)
  grossProfit: decimal("grossProfit", { precision: 6, scale: 2 }),
  netProfit: decimal("netProfit", { precision: 6, scale: 2 }),
  
  // Operational Metrics
  daysInInventory: int("daysInInventory"),
  
  // Notes
  transactionNotes: text("transactionNotes"),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
}, (table) => ({
  itemIdx: index("idx_transactions_item").on(table.itemUuid),
  isbnIdx: index("idx_transactions_isbn").on(table.isbn13),
  channelIdx: index("idx_transactions_channel").on(table.channel),
  dateIdx: index("idx_transactions_date").on(table.saleDate),
}));

export type SalesTransaction = typeof salesTransactions.$inferSelect;
export type InsertSalesTransaction = typeof salesTransactions.$inferInsert;

/**
 * TABLE 4: system_settings
 * Purpose: Global configuration (business rules, thresholds, etc.).
 */
export const systemSettings = mysqlTable("system_settings", {
  settingKey: varchar("settingKey", { length: 100 }).primaryKey(),
  settingValue: text("settingValue").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;
