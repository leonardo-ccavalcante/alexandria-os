/**
 * Shared types for the Shelf Audit feature.
 * Used by both the backend (server/routers.ts) and the DB schema (drizzle/schema.ts).
 */

export interface ShelfPhotoResult {
  title: string;
  author: string;
  isbn: string | null;            // from Gemini (if visible on spine)
  confidence: number;             // 0.0–1.0 from Gemini
  matchedItemUuid: string | null; // populated after fuzzy match; null if no match
  matchedIsbn: string | null;
}

export interface ConflictItem {
  uuid: string;
  fromLocation: string;           // DB-registered location (e.g. "03C")
  resolution: 'moved' | 'kept' | 'skipped' | null; // null = pending
}
