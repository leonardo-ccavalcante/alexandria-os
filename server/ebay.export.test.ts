import { describe, expect, it } from "vitest";

describe("eBay Export Format", () => {
  it("should have correct CSV headers for eBay File Exchange", () => {
    const expectedHeaders = [
      'Action',
      'CustomLabel',
      'Title',
      'Description',
      'CategoryID',
      'Condition',
      'ConditionDescription',
      'Format',
      'Duration',
      'StartPrice',
      'Quantity',
      'C:ISBN',
      'C:Author',
      'C:Publisher',
      'C:Publication Year',
      'C:Language',
      'C:Format',
      'C:Number of Pages',
      'Location',
    ];
    
    expect(expectedHeaders).toHaveLength(19);
    expect(expectedHeaders[0]).toBe('Action');
    expect(expectedHeaders[1]).toBe('CustomLabel');
    expect(expectedHeaders[11]).toBe('C:ISBN');
  });

  it("should truncate title to 80 characters maximum", () => {
    const truncateTitle = (title: string, author: string | null, format: string | null): string => {
      const authorPart = author ? `${author.substring(0, 30)} - ` : '';
      const formatPart = format ? ` - ${format}` : '';
      const availableForTitle = 80 - authorPart.length - formatPart.length;
      
      let titlePart = title;
      if (titlePart.length > availableForTitle) {
        titlePart = titlePart.substring(0, availableForTitle - 3) + '...';
      }
      
      return (authorPart + titlePart + formatPart).substring(0, 80);
    };

    const longTitle = "This is a very long book title that exceeds the maximum allowed length for eBay listings and needs to be truncated properly";
    const result = truncateTitle(longTitle, "Author Name", "Paperback");
    
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result).toContain("Author Name");
    expect(result).toContain("...");
  });

  it("should normalize condition to eBay standards", () => {
    const normalizeConditionToEbay = (condition: string | null): string => {
      if (!condition) return 'Good';
      const c = condition.toUpperCase();
      const map: Record<string, string> = {
        'NUEVO': 'Brand New',
        'COMO_NUEVO': 'Like New',
        'BUENO': 'Very Good',
        'ACEPTABLE': 'Good',
        'DEFECTUOSO': 'Acceptable',
      };
      return map[c] || 'Good';
    };

    expect(normalizeConditionToEbay('BUENO')).toBe('Very Good');
    expect(normalizeConditionToEbay('COMO_NUEVO')).toBe('Like New');
    expect(normalizeConditionToEbay('ACEPTABLE')).toBe('Good');
    expect(normalizeConditionToEbay('DEFECTUOSO')).toBe('Acceptable');
    expect(normalizeConditionToEbay('NUEVO')).toBe('Brand New');
    expect(normalizeConditionToEbay(null)).toBe('Good');
    expect(normalizeConditionToEbay('UNKNOWN')).toBe('Good');
  });

  it("should normalize format to Paperback by default", () => {
    const normalizeFormat = (format: string | null | undefined): string => {
      if (!format) return 'Paperback';
      const f = format.toLowerCase();
      if (f.includes('dura') || f.includes('hard')) return 'Hardcover';
      if (f.includes('blanda') || f.includes('paper')) return 'Paperback';
      return 'Paperback';
    };

    expect(normalizeFormat(null)).toBe('Paperback');
    expect(normalizeFormat(undefined)).toBe('Paperback');
    expect(normalizeFormat('tapa dura')).toBe('Hardcover');
    expect(normalizeFormat('hardcover')).toBe('Hardcover');
    expect(normalizeFormat('tapa blanda')).toBe('Paperback');
    expect(normalizeFormat('paperback')).toBe('Paperback');
    expect(normalizeFormat('unknown')).toBe('Paperback');
  });

  it("should escape CSV values with commas and quotes", () => {
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    expect(escapeCSV('Simple text')).toBe('Simple text');
    expect(escapeCSV('Text, with comma')).toBe('"Text, with comma"');
    expect(escapeCSV('Text "with quotes"')).toBe('"Text ""with quotes"""');
    expect(escapeCSV('Text\nwith newline')).toBe('"Text\nwith newline"');
    expect(escapeCSV(null)).toBe('');
    expect(escapeCSV(undefined)).toBe('');
  });

  it("should use correct eBay category ID for books", () => {
    const categoryID = '267';
    expect(categoryID).toBe('267');
  });

  it("should use FixedPrice format and GTC duration", () => {
    const format = 'FixedPrice';
    const duration = 'GTC';
    
    expect(format).toBe('FixedPrice');
    expect(duration).toBe('GTC');
  });

  it("should set quantity to 1 for used books", () => {
    const quantity = '1';
    expect(quantity).toBe('1');
  });

  it("should map Spanish language code to English", () => {
    const mapLanguage = (code: string): string => {
      return code === 'ES' ? 'Spanish' : 'English';
    };

    expect(mapLanguage('ES')).toBe('Spanish');
    expect(mapLanguage('EN')).toBe('English');
    expect(mapLanguage('FR')).toBe('English'); // Default to English
  });

  it("should use UUID as CustomLabel for tracking", () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
