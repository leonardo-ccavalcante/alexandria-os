/**
 * FILE: server/_core/externalBookApi.ts
 * PURPOSE: Centralized service to fetch book metadata from external providers.
 * HANDLES: ISBN-10 and ISBN-13 auto-detection.
 */

export interface ExternalBookMetadata {
  found: boolean;
  title?: string;
  author?: string;
  publisher?: string;
  publishedDate?: string; // Format YYYY
  description?: string;
  pageCount?: number;
  language?: string;
  category?: string;
  coverImageUrl?: string;
  edition?: string;
}

export async function fetchExternalBookMetadata(isbn: string): Promise<ExternalBookMetadata> {
  try {
    // 1. Sanitize Input (Allow only numbers and 'X' for ISBN-10)
    const cleanIsbn = isbn.replace(/[^0-9X]/gi, '');

    // 2. Validation (Basic Length Check)
    if (cleanIsbn.length !== 10 && cleanIsbn.length !== 13) {
      console.warn(`[ExternalApi] Invalid ISBN length: ${cleanIsbn}`);
      return { found: false };
    }

    // 3. Call Google Books API
    // Note: Google's 'q=isbn:...' endpoint automatically handles both ISBN-10 and 13
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`);
    
    if (!response.ok) {
      throw new Error(`Google Books API Error: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.totalItems > 0 && data.items?.[0]?.volumeInfo) {
      const info = data.items[0].volumeInfo;
      
      // 4. Map & Normalize Data
      return {
        found: true,
        title: info.title || "",
        author: info.authors ? info.authors.join(", ") : "",
        publisher: info.publisher || "",
        // Extract just the year (YYYY) if full date is provided
        publishedDate: info.publishedDate ? info.publishedDate.substring(0, 4) : "",
        description: info.description || "",
        pageCount: info.pageCount || 0,
        // Normalize language to 2-char uppercase (e.g., "en" -> "EN")
        language: info.language ? info.language.substring(0, 2).toUpperCase() : "ES",
        // Map Google Categories to our CategoryLevel1 (Fallback to OTROS)
        category: info.categories?.[0] || "OTROS",
        coverImageUrl: info.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
        // Google doesn't always give explicit edition, check contentVersion
        edition: info.contentVersion || "" 
      };
    }
    
    return { found: false };
  } catch (error) {
    console.error("[ExternalBookApi] Error:", error);
    return { found: false };
  }
}
