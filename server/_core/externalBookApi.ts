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

    // 3. Try Google Books API first
    console.log(`[ExternalApi] Trying Google Books for ISBN: ${cleanIsbn}`);
    try {
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`);
      
      if (response.ok) {
        const data = await response.json();

        if (data.totalItems > 0 && data.items?.[0]?.volumeInfo) {
          const info = data.items[0].volumeInfo;
          console.log(`[ExternalApi] Found in Google Books: ${info.title}`);
          
          // 4. Map & Normalize Data from Google Books
          return {
            found: true,
            title: info.title || "",
            author: info.authors ? info.authors.join(", ") : "",
            publisher: info.publisher || "",
            publishedDate: info.publishedDate ? info.publishedDate.substring(0, 4) : "",
            description: info.description || "",
            pageCount: info.pageCount || 0,
            language: info.language ? info.language.substring(0, 2).toUpperCase() : "ES",
            category: info.categories?.[0] || "OTROS",
            coverImageUrl: info.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
            // Google Books doesn't reliably provide edition info, leave empty
            // contentVersion is NOT edition (it's "preview", "full_public_domain", etc.)
            edition: undefined 
          };
        }
      }
    } catch (googleError) {
      console.warn(`[ExternalApi] Google Books failed:`, googleError);
    }

    // 5. Fallback to ISBNDB if Google Books failed
    const isbndbApiKey = process.env.ISBNDB_API_KEY;
    
    if (!isbndbApiKey) {
      console.warn('[ExternalApi] ISBNDB_API_KEY not configured in Secrets');
      return { found: false };
    }

    console.log(`[ExternalApi] Trying ISBNDB fallback for ISBN: ${cleanIsbn}`);
    try {
      const { fetchFromISBNDB } = await import('../isbndbIntegration');
      const isbndbBook = await fetchFromISBNDB(cleanIsbn, isbndbApiKey);
      
      if (isbndbBook) {
        console.log(`[ExternalApi] Found in ISBNDB: ${isbndbBook.title}`);
        
        // 6. Map & Normalize Data from ISBNDB
        return {
          found: true,
          title: isbndbBook.title || "",
          author: isbndbBook.authors?.join(", ") || "",
          publisher: isbndbBook.publisher || "",
          publishedDate: isbndbBook.date_published ? isbndbBook.date_published.substring(0, 4) : "",
          description: isbndbBook.synopsis || "",
          pageCount: isbndbBook.pages || 0,
          language: isbndbBook.language ? isbndbBook.language.substring(0, 2).toUpperCase() : "ES",
          category: "OTROS", // ISBNDB doesn't provide categories in same format
          coverImageUrl: isbndbBook.image || undefined,
          edition: isbndbBook.edition || "" 
        };
      }
    } catch (isbndbError) {
      console.warn(`[ExternalApi] ISBNDB failed:`, isbndbError);
    }
    
    console.log(`[ExternalApi] No metadata found for ISBN: ${cleanIsbn}`);
    return { found: false };
  } catch (error) {
    console.error("[ExternalBookApi] Unexpected error:", error);
    return { found: false };
  }
}
