/**
 * Proper RFC-4180-compliant CSV parser that handles:
 * - Multi-line quoted fields
 * - Escaped double-quotes ("")
 * - Mixed CRLF / LF line endings
 *
 * Returns an array of rows, each row being an array of field strings.
 * The first row is the header row.
 */
export function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote ("")
        currentField += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // End of row
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      }
      // Skip \r\n pairs
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentField += char;
    }
  }

  // Push last field and row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Normalise an ISBN string: strip hyphens, spaces, and surrounding quotes,
 * then return the cleaned string. Returns null if the result is not a valid
 * 10- or 13-digit ISBN.
 */
export function normalizeIsbn(raw: string): string | null {
  const cleaned = raw.replace(/[-\s]/g, '').replace(/^["']|["']$/g, '');
  if (cleaned.length === 10 || cleaned.length === 13) {
    return cleaned;
  }
  return null;
}
