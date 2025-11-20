import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

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

export const catalogMasters = mysqlTable("catalog_masters", {
  isbn13: varchar("isbn13", { length: 13 }).primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  publisher: text("publisher"),
  publicationYear: int("publicationYear"),
  language: varchar("language", { length: 5 }),
  synopsis: text("synopsis"),
  categoryLevel1: text("categoryLevel1"),
  categoryLevel2: text("categoryLevel2"),
  categoryLevel3: text("categoryLevel3"),
  materia: varchar("materia", { length: 10 }),
  bisacCode: varchar("bisacCode", { length: 20 }),
  coverImageUrl: text("coverImageUrl"),
  marketMinPrice: decimal("marketMinPrice", { precision: 6, scale: 2 }),
  marketMedianPrice: decimal("marketMedianPrice", { precision: 6, scale: 2 }),
  lastPriceCheck: timestamp("lastPriceCheck"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  categoryLevel1Idx: index("idx_masters_category_l1").on(table.categoryLevel1),
  // NEW INDEXES for faster search/filter
  titleIdx: index("title_idx").on(table.title),
  authorIdx: index("author_idx").on(table.author),
  publisherIdx: index("publisher_idx").on(table.publisher),
}));

export type CatalogMaster = typeof catalogMasters.$inferSelect;
export type InsertCatalogMaster = typeof catalogMasters.$inferInsert;

export const inventoryItems = mysqlTable("inventory_items", {
  uuid: varchar("uuid", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  isbn13: varchar("isbn13", { length: 13 }).notNull(),
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
  locationCode: varchar("locationCode", { length: 3 }),
  salesChannels: text("salesChannels"),
  listingPrice: decimal("listingPrice", { precision: 6, scale: 2 }),
  costOfGoods: decimal("costOfGoods", { precision: 6, scale: 2 }).default("0.00"),
  soldAt: timestamp("soldAt"),
  soldChannel: varchar("soldChannel", { length: 50 }),
  finalSalePrice: decimal("finalSalePrice", { precision: 6, scale: 2 }),
  platformFees: decimal("platformFees", { precision: 6, scale: 2 }),
  netProfit: decimal("netProfit", { precision: 6, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
}, (table) => ({
  isbnIdx: index("idx_items_isbn").on(table.isbn13),
  statusIdx: index("idx_items_status").on(table.status),
  locationIdx: index("idx_items_location").on(table.locationCode),
  createdAtIdx: index("idx_items_created_at").on(table.createdAt),
  // NEW INDEX for faster JOIN queries
  isbnStatusIdx: index("isbn_status_idx").on(table.isbn13, table.status),
}));

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;

export const salesTransactions = mysqlTable("sales_transactions", {
  transactionId: varchar("transactionId", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  itemUuid: varchar("itemUuid", { length: 36 }).notNull(),
  isbn13: varchar("isbn13", { length: 13 }).notNull(),
  channel: varchar("channel", { length: 50 }).notNull(),
  saleDate: timestamp("saleDate").notNull().defaultNow(),
  listingPrice: decimal("listingPrice", { precision: 6, scale: 2 }).notNull(),
  finalSalePrice: decimal("finalSalePrice", { precision: 6, scale: 2 }).notNull(),
  platformCommissionPct: decimal("platformCommissionPct", { precision: 5, scale: 2 }),
  platformFees: decimal("platformFees", { precision: 6, scale: 2 }).notNull(),
  shippingCost: decimal("shippingCost", { precision: 6, scale: 2 }).default("0.00"),
  grossProfit: decimal("grossProfit", { precision: 6, scale: 2 }),
  netProfit: decimal("netProfit", { precision: 6, scale: 2 }),
  daysInInventory: int("daysInInventory"),
  transactionNotes: text("transactionNotes"),
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

export const systemSettings = mysqlTable("system_settings", {
  settingKey: varchar("settingKey", { length: 100 }).primaryKey(),
  settingValue: text("settingValue").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;
