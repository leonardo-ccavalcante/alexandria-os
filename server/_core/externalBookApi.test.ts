import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchExternalBookMetadata } from './externalBookApi';

// Mock fetch
global.fetch = vi.fn();

describe('External Book API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchExternalBookMetadata', () => {
    it('should fetch and normalize book metadata from Google Books API', async () => {
      const mockGoogleBooksResponse = {
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'El Hobbit',
            authors: ['J.R.R. Tolkien'],
            publisher: 'Editorial Minotauro',
            publishedDate: '2018-11-22',
            description: 'Una aventura épica en la Tierra Media',
            pageCount: 320,
            language: 'es',
            categories: ['Ficción'],
            imageLinks: {
              thumbnail: 'http://books.google.com/books/content?id=test&printsec=frontcover&img=1'
            },
            contentVersion: '1.2.3.4'
          }
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockGoogleBooksResponse
      });

      const result = await fetchExternalBookMetadata('9788445077528');

      expect(result.found).toBe(true);
      expect(result.title).toBe('El Hobbit');
      expect(result.author).toBe('J.R.R. Tolkien');
      expect(result.publisher).toBe('Editorial Minotauro');
      expect(result.publishedDate).toBe('2018');
      expect(result.description).toBe('Una aventura épica en la Tierra Media');
      expect(result.pageCount).toBe(320);
      expect(result.language).toBe('ES');
      expect(result.category).toBe('Ficción');
      expect(result.coverImageUrl).toBe('https://books.google.com/books/content?id=test&printsec=frontcover&img=1');
      // Google Books doesn't provide edition info - contentVersion is NOT edition
      expect(result.edition).toBeUndefined();
    });

    it('should handle ISBN-10 format', async () => {
      const mockResponse = {
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'Test Book',
            authors: ['Test Author']
          }
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchExternalBookMetadata('0123456789');

      expect(result.found).toBe(true);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('isbn:0123456789'));
    });

    it('should handle ISBN-13 format', async () => {
      const mockResponse = {
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'Test Book',
            authors: ['Test Author']
          }
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchExternalBookMetadata('9781234567890');

      expect(result.found).toBe(true);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('isbn:9781234567890'));
    });

    it('should sanitize ISBN input (remove hyphens and spaces)', async () => {
      const mockResponse = {
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'Test Book',
            authors: ['Test Author']
          }
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      await fetchExternalBookMetadata('978-84-450-7752-8');

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('isbn:9788445077528'));
    });

    it('should return found:false for invalid ISBN length', async () => {
      const result = await fetchExternalBookMetadata('12345'); // Too short

      expect(result.found).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should return found:false when Google Books returns no results', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ totalItems: 0, items: [] })
      });

      const result = await fetchExternalBookMetadata('9999999999999');

      expect(result.found).toBe(false);
    });

    it('should handle missing optional fields gracefully', async () => {
      const mockResponse = {
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'Minimal Book'
            // No authors, publisher, etc.
          }
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchExternalBookMetadata('9781234567890');

      expect(result.found).toBe(true);
      expect(result.title).toBe('Minimal Book');
      expect(result.author).toBe('');
      expect(result.publisher).toBe('');
      expect(result.publishedDate).toBe('');
      expect(result.description).toBe('');
      expect(result.pageCount).toBe(0);
      expect(result.language).toBe('ES'); // Default
      expect(result.category).toBe('OTROS'); // Default
      expect(result.coverImageUrl).toBeNull();
      expect(result.edition).toBeUndefined(); // Google Books doesn't provide edition
    });

    it('should normalize language to 2-char uppercase', async () => {
      const mockResponse = {
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'Test',
            language: 'en-US' // Should be normalized to 'EN'
          }
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchExternalBookMetadata('9781234567890');

      expect(result.language).toBe('EN');
    });

    it('should convert HTTP image URLs to HTTPS', async () => {
      const mockResponse = {
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'Test',
            imageLinks: {
              thumbnail: 'http://books.google.com/image.jpg'
            }
          }
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchExternalBookMetadata('9781234567890');

      expect(result.coverImageUrl).toBe('https://books.google.com/image.jpg');
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await fetchExternalBookMetadata('9781234567890');

      expect(result.found).toBe(false);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error'
      });

      const result = await fetchExternalBookMetadata('9781234567890');

      expect(result.found).toBe(false);
    });

    it('should handle multiple authors correctly', async () => {
      const mockResponse = {
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'Test',
            authors: ['Author One', 'Author Two', 'Author Three']
          }
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchExternalBookMetadata('9781234567890');

      expect(result.author).toBe('Author One, Author Two, Author Three');
    });

    it('should extract year from full date format', async () => {
      const mockResponse = {
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'Test',
            publishedDate: '2023-05-15' // Should extract '2023'
          }
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchExternalBookMetadata('9781234567890');

      expect(result.publishedDate).toBe('2023');
    });

    it('should handle year-only date format', async () => {
      const mockResponse = {
        totalItems: 1,
        items: [{
          volumeInfo: {
            title: 'Test',
            publishedDate: '2020' // Already year-only
          }
        }]
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchExternalBookMetadata('9781234567890');

      expect(result.publishedDate).toBe('2020');
    });

    it('should fallback to ISBNDB when Google Books returns no results', async () => {
      // Mock Google Books returning empty results
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ totalItems: 0, items: [] })
      });

      // Mock ISBNDB_API_KEY environment variable
      const originalEnv = process.env.ISBNDB_API_KEY;
      process.env.ISBNDB_API_KEY = 'test-api-key';

      // Mock ISBNDB module
      vi.doMock('../isbndbIntegration', () => ({
        fetchFromISBNDB: vi.fn().mockResolvedValue({
          title: 'Test Book from ISBNDB',
          authors: ['ISBNDB Author'],
          publisher: 'ISBNDB Publisher',
          date_published: '2023-01-15',
          synopsis: 'Description from ISBNDB',
          pages: 250,
          language: 'en',
          image: 'https://isbndb.com/cover.jpg',
          edition: '2nd'
        })
      }));

      const result = await fetchExternalBookMetadata('9781234567890');

      expect(result.found).toBe(true);
      expect(result.title).toBe('Test Book from ISBNDB');
      expect(result.author).toBe('ISBNDB Author');
      expect(result.publisher).toBe('ISBNDB Publisher');
      expect(result.publishedDate).toBe('2023');
      expect(result.description).toBe('Description from ISBNDB');
      expect(result.pageCount).toBe(250);
      expect(result.language).toBe('EN');
      expect(result.coverImageUrl).toBe('https://isbndb.com/cover.jpg');
      expect(result.edition).toBe('2nd');

      // Cleanup
      process.env.ISBNDB_API_KEY = originalEnv;
      vi.doUnmock('../isbndbIntegration');
    });

    it('should return found:false when both Google Books and ISBNDB fail', async () => {
      // Mock Google Books returning empty results
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ totalItems: 0, items: [] })
      });

      // Mock ISBNDB_API_KEY environment variable
      const originalEnv = process.env.ISBNDB_API_KEY;
      process.env.ISBNDB_API_KEY = 'test-api-key';

      // Mock ISBNDB module returning null
      vi.doMock('../isbndbIntegration', () => ({
        fetchFromISBNDB: vi.fn().mockResolvedValue(null)
      }));

      const result = await fetchExternalBookMetadata('9999999999999');

      expect(result.found).toBe(false);

      // Cleanup
      process.env.ISBNDB_API_KEY = originalEnv;
      vi.doUnmock('../isbndbIntegration');
    });

    it('should return found:false when ISBNDB_API_KEY is not configured', async () => {
      // Mock Google Books returning empty results
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ totalItems: 0, items: [] })
      });

      // Ensure ISBNDB_API_KEY is not set
      const originalEnv = process.env.ISBNDB_API_KEY;
      delete process.env.ISBNDB_API_KEY;

      const result = await fetchExternalBookMetadata('9781234567890');

      expect(result.found).toBe(false);

      // Cleanup
      if (originalEnv) {
        process.env.ISBNDB_API_KEY = originalEnv;
      }
    });
  });
});
