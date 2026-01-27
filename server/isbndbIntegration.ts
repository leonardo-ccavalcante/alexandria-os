/**
 * ISBNDB API Integration
 * 
 * Provides fallback ISBN lookup when Google Books API fails.
 * Requires user-provided API key from https://isbndb.com/
 */

export interface ISBNDBBookData {
  isbn13: string;
  title: string;
  authors?: string[];
  publisher?: string;
  date_published?: string;
  language?: string;
  pages?: number;
  edition?: string;
  synopsis?: string;
  image?: string;
}

export interface ISBNDBResponse {
  book?: ISBNDBBookData;
  total?: number;
  books?: ISBNDBBookData[];
}

/**
 * Fetch book data from ISBNDB API
 * @param isbn - ISBN-13 or ISBN-10
 * @param apiKey - User's ISBNDB API key
 * @returns Book data or null if not found
 */
export async function fetchFromISBNDB(
  isbn: string,
  apiKey: string
): Promise<ISBNDBBookData | null> {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('ISBNDB API key is required. Please configure it in Settings.');
  }

  const cleanedIsbn = isbn.replace(/[-\s]/g, '');
  
  try {
    const response = await fetch(
      `https://api.premium.isbndb.com/book/${cleanedIsbn}`,
      {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid ISBNDB API key. Please check your configuration.');
      }
      if (response.status === 404) {
        return null; // Book not found
      }
      throw new Error(`ISBNDB API error: ${response.status} ${response.statusText}`);
    }

    const data: ISBNDBResponse = await response.json();
    
    if (!data.book) {
      return null;
    }

    return data.book;
  } catch (error: any) {
    console.error('[ISBNDB] Error fetching book data:', error);
    throw error;
  }
}

/**
 * Search ISBNDB by title and optionally author
 * @param title - Book title to search for
 * @param author - Optional author name to refine search
 * @param apiKey - User's ISBNDB API key
 * @returns First matching book data or null if not found
 */
export async function searchISBNDBByTitle(
  title: string,
  author: string | undefined,
  apiKey: string
): Promise<ISBNDBBookData | null> {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('ISBNDB API key is required');
  }

  if (!title || title.trim() === '') {
    return null;
  }

  try {
    // Build search query
    let searchQuery = title.trim();
    if (author && author.trim()) {
      searchQuery += ` ${author.trim()}`;
    }

    const response = await fetch(
      `https://api.premium.isbndb.com/books/${encodeURIComponent(searchQuery)}?page=1&pageSize=1`,
      {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid ISBNDB API key');
      }
      if (response.status === 404) {
        return null; // No results found
      }
      throw new Error(`ISBNDB API error: ${response.status} ${response.statusText}`);
    }

    const data: ISBNDBResponse = await response.json();
    
    if (!data.books || data.books.length === 0) {
      return null;
    }

    // Return first result (best match)
    return data.books[0];
  } catch (error: any) {
    console.error('[ISBNDB] Error searching by title:', error);
    throw error;
  }
}

/**
 * Validate ISBNDB API key by making a test request
 * @param apiKey - API key to validate
 * @returns true if valid, false otherwise
 */
export async function validateISBNDBApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey || apiKey.trim() === '') {
    return false;
  }

  try {
    // Use a known ISBN for testing (The Great Gatsby)
    const testIsbn = '9780743273565';
    const response = await fetch(
      `https://api.premium.isbndb.com/book/${testIsbn}`,
      {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.ok;
  } catch (error) {
    console.error('[ISBNDB] API key validation failed:', error);
    return false;
  }
}
