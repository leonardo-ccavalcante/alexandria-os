import { getDb } from "./db";
import { exportHistory, databaseActivityLog, InsertExportHistory, InsertDatabaseActivityLog } from "../drizzle/schema";

/**
 * Log a marketplace export to export_history table
 */
export async function logExport(data: {
  platform: string;
  itemCount: number;
  withPrice?: number;
  withISBN?: number;
  filters?: Record<string, any>;
  status?: "success" | "failed" | "partial";
  errorMessage?: string;
  userId?: number;
  userName?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[AuditLog] Cannot log export: database not available");
    return;
  }

  try {
    const record: InsertExportHistory = {
      platform: data.platform,
      itemCount: data.itemCount,
      withPrice: data.withPrice || 0,
      withISBN: data.withISBN || 0,
      filters: data.filters ? JSON.stringify(data.filters) : null,
      status: data.status || "success",
      errorMessage: data.errorMessage || null,
      userId: data.userId || null,
      userName: data.userName || null,
    };

    await db.insert(exportHistory).values(record);
    console.log(`[AuditLog] Export logged: ${data.platform}, ${data.itemCount} items`);
  } catch (error) {
    console.error("[AuditLog] Failed to log export:", error);
  }
}

/**
 * Log a database activity (insert, update, delete) to database_activity_log table
 */
export async function logDatabaseActivity(data: {
  action: "insert" | "update" | "delete" | "bulk_update" | "bulk_delete";
  tableName: string;
  recordId?: string;
  changes?: Record<string, any>;
  recordCount?: number;
  userId?: number;
  userName?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[AuditLog] Cannot log activity: database not available");
    return;
  }

  try {
    const record: InsertDatabaseActivityLog = {
      action: data.action,
      tableName: data.tableName,
      recordId: data.recordId || null,
      changes: data.changes ? JSON.stringify(data.changes) : null,
      recordCount: data.recordCount || 1,
      userId: data.userId || null,
      userName: data.userName || null,
    };

    await db.insert(databaseActivityLog).values(record);
    console.log(`[AuditLog] Activity logged: ${data.action} on ${data.tableName}`);
  } catch (error) {
    console.error("[AuditLog] Failed to log activity:", error);
  }
}

/**
 * Get export history with optional filters
 */
export async function getExportHistory(filters?: {
  platform?: string;
  startDate?: Date;
  endDate?: Date;
  userId?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) {
    return [];
  }

  try {
    let query = db.select().from(exportHistory);

    // Apply filters (simplified - in production use proper Drizzle query builder)
    const results = await query;

    // Apply filters in memory for now
    let filtered = results;
    if (filters?.platform) {
      filtered = filtered.filter(r => r.platform === filters.platform);
    }
    if (filters?.startDate) {
      filtered = filtered.filter(r => r.exportDate >= filters.startDate!);
    }
    if (filters?.endDate) {
      filtered = filtered.filter(r => r.exportDate <= filters.endDate!);
    }
    if (filters?.userId) {
      filtered = filtered.filter(r => r.userId === filters.userId);
    }

    // Sort by date descending
    filtered.sort((a, b) => b.exportDate.getTime() - a.exportDate.getTime());

    // Apply limit
    if (filters?.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  } catch (error) {
    console.error("[AuditLog] Failed to get export history:", error);
    return [];
  }
}

/**
 * Get database activity logs with optional filters
 */
export async function getDatabaseActivityLogs(filters?: {
  action?: "insert" | "update" | "delete" | "bulk_update" | "bulk_delete";
  tableName?: string;
  startDate?: Date;
  endDate?: Date;
  userId?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) {
    return [];
  }

  try {
    let query = db.select().from(databaseActivityLog);

    const results = await query;

    // Apply filters in memory
    let filtered = results;
    if (filters?.action) {
      filtered = filtered.filter(r => r.action === filters.action);
    }
    if (filters?.tableName) {
      filtered = filtered.filter(r => r.tableName === filters.tableName);
    }
    if (filters?.startDate) {
      filtered = filtered.filter(r => r.timestamp >= filters.startDate!);
    }
    if (filters?.endDate) {
      filtered = filtered.filter(r => r.timestamp <= filters.endDate!);
    }
    if (filters?.userId) {
      filtered = filtered.filter(r => r.userId === filters.userId);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    if (filters?.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  } catch (error) {
    console.error("[AuditLog] Failed to get activity logs:", error);
    return [];
  }
}
