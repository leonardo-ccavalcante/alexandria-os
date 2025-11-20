/**
 * Sales channel constants shared between frontend and backend
 */

export const SALES_CHANNELS = [
  "Wallapop",
  "Vinted",
  "Todo Colección",
  "Sitio web",
  "Iberlibro",
  "Amazon",
  "Ebay",
  "Casa del Libro",
  "Fnac",
] as const;

export type SalesChannel = (typeof SALES_CHANNELS)[number];

/**
 * Parse sales channels from JSON string stored in database
 */
export function parseSalesChannels(json: string | null): SalesChannel[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((ch): ch is SalesChannel => 
      SALES_CHANNELS.includes(ch as SalesChannel)
    );
  } catch {
    return [];
  }
}

/**
 * Serialize sales channels to JSON string for database storage
 */
export function serializeSalesChannels(channels: SalesChannel[]): string {
  return JSON.stringify(channels);
}
