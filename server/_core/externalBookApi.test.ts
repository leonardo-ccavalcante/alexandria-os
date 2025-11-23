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
      expect(result.edition).toBe('1.2.3.4');
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
      expect(result.edition).toBe('');
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
  });
});
