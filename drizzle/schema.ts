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
  // ISBN13 remains primary key (for pre-1970 books, use synthetic "DL-{hash}" format)
  isbn13: varchar("isbn13", { length: 13 }).primaryKey(),
  // Depósito Legal: Actual legal deposit number for pre-1970 books (e.g., "M-1234-1965")
  depositoLegal: varchar("depositoLegal", { length: 50 }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  publisher: text("publisher"),
  publicationYear: int("publicationYear"),
  language: varchar("language", { length: 2 }),
  pages: int("pages"),
  edition: varchar("edition", { length: 50 }),
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

// Price History - Stores detailed marketplace prices for each book
export const priceHistory = mysqlTable("price_history", {
  id: int("id").autoincrement().primaryKey(),
  isbn13: varchar("isbn13", { length: 13 }).notNull(),
  marketplace: varchar("marketplace", { length: 50 }).notNull(),
  price: decimal("price", { precision: 6, scale: 2 }),
  condition: mysqlEnum("condition", ["NUEVO", "COMO_NUEVO", "BUENO", "ACEPTABLE"]),
  url: text("url"),
  available: mysqlEnum("available", ["YES", "NO"]).notNull().default("YES"),
  scrapedAt: timestamp("scrapedAt").notNull().defaultNow(),
}, (table) => ({
  isbnIdx: index("idx_price_history_isbn").on(table.isbn13),
  scrapedAtIdx: index("idx_price_history_scraped_at").on(table.scrapedAt),
}));

export type PriceHistory = typeof priceHistory.$inferSelect;
export type InsertPriceHistory = typeof priceHistory.$inferInsert;

export const inventoryItems = mysqlTable("inventory_items", {
  uuid: varchar("uuid", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Tenant isolation: which library this item belongs to. */
  libraryId: int("libraryId"),
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
  libraryIdx: index("idx_items_library").on(table.libraryId),
}));

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;

export const salesTransactions = mysqlTable("sales_transactions", {
  transactionId: varchar("transactionId", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Tenant isolation: which library this transaction belongs to. */
  libraryId: int("libraryId"),
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
  libraryIdx: index("idx_transactions_library").on(table.libraryId),
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

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-TENANT: Libraries, Memberships, Invitations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each library is an independent tenant (e.g., a bookshop or donation centre).
 * The owner is the user who created or was assigned the library.
 */
export const libraries = mysqlTable("libraries", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  ownerId: int("ownerId").notNull(),
  /** Storage quota in megabytes. Default 500 MB. Admin can adjust per library. */
  storageQuotaMb: int("storageQuotaMb").default(500).notNull(),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ownerIdx: index("idx_libraries_owner").on(table.ownerId),
  slugIdx: index("idx_libraries_slug").on(table.slug),
}));

export type Library = typeof libraries.$inferSelect;
export type InsertLibrary = typeof libraries.$inferInsert;

/**
 * Membership table — users belong to libraries with a role.
 * role: owner (full control), admin (manage inventory/members), member (read/add only)
 */
export const libraryMembers = mysqlTable("library_members", {
  id: int("id").autoincrement().primaryKey(),
  libraryId: int("libraryId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  /** How the user joined: 'owner' (created the library), 'invitation' (used an invite link), 'manual' (added directly by an admin) */
  joinedVia: mysqlEnum("joinedVia", ["owner", "invitation", "manual"]).default("manual").notNull(),
  /** The user ID of the admin who added this member (null for owners) */
  addedByUserId: int("addedByUserId"),
  /** Last time this member performed any action in the library */
  lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(),
}, (table) => ({
  libraryUserIdx: index("idx_members_library_user").on(table.libraryId, table.userId),
  userIdx: index("idx_members_user").on(table.userId),
  lastActivityIdx: index("idx_members_last_activity").on(table.lastActivityAt),
}));

export type LibraryMember = typeof libraryMembers.$inferSelect;
export type InsertLibraryMember = typeof libraryMembers.$inferInsert;

/**
 * Invitation codes — time-limited tokens that link a new user to a library.
 * When a user logs in with a valid invite code, they join the library instead
 * of creating a new one.
 */
export const libraryInvitations = mysqlTable("library_invitations", {
  id: int("id").autoincrement().primaryKey(),
  libraryId: int("libraryId").notNull(),
  code: varchar("code", { length: 36 }).notNull().unique(), // UUID
  /** Optional: pre-fill a specific email. If set, only that email can use it. */
  email: varchar("email", { length: 320 }),
  role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
  createdBy: int("createdBy").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedBy: int("usedBy"),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  codeIdx: index("idx_invitations_code").on(table.code),
  libraryIdx: index("idx_invitations_library").on(table.libraryId),
  expiresIdx: index("idx_invitations_expires").on(table.expiresAt),
}));

export type LibraryInvitation = typeof libraryInvitations.$inferSelect;
export type InsertLibraryInvitation = typeof libraryInvitations.$inferInsert;

// Export History Tracking
export const exportHistory = mysqlTable("export_history", {
  id: int("id").autoincrement().primaryKey(),
  /** Tenant isolation: which library this export belongs to. */
  libraryId: int("libraryId"),
  platform: varchar("platform", { length: 50 }).notNull(), // 'general', 'iberlibro', 'casadellibro', 'todocoleccion', 'ebay'
  exportDate: timestamp("exportDate").defaultNow().notNull(),
  itemCount: int("itemCount").notNull(),
  withPrice: int("withPrice").default(0),
  withISBN: int("withISBN").default(0),
  filters: text("filters"), // JSON string of applied filters
  status: mysqlEnum("status", ["success", "failed", "partial"]).default("success").notNull(),
  errorMessage: text("errorMessage"),
  userId: int("userId"),
  userName: text("userName"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  platformIdx: index("idx_export_platform").on(table.platform),
  dateIdx: index("idx_export_date").on(table.exportDate),
  userIdx: index("idx_export_user").on(table.userId),
}));

export type ExportHistory = typeof exportHistory.$inferSelect;
export type InsertExportHistory = typeof exportHistory.$inferInsert;

// Database Activity Logging
export const databaseActivityLog = mysqlTable("database_activity_log", {
  id: int("id").autoincrement().primaryKey(),
  action: mysqlEnum("action", ["insert", "update", "delete", "bulk_update", "bulk_delete"]).notNull(),
  tableName: varchar("tableName", { length: 100 }).notNull(),
  recordId: text("recordId"), // ISBN or UUID depending on table
  changes: text("changes"), // JSON string of changed fields
  recordCount: int("recordCount").default(1), // For bulk operations
  userId: int("userId"),
  userName: text("userName"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  actionIdx: index("idx_activity_action").on(table.action),
  tableIdx: index("idx_activity_table").on(table.tableName),
  userIdx: index("idx_activity_user").on(table.userId),
  timestampIdx: index("idx_activity_timestamp").on(table.timestamp),
}));

export type DatabaseActivityLog = typeof databaseActivityLog.$inferSelect;
export type InsertDatabaseActivityLog = typeof databaseActivityLog.$inferInsert;
