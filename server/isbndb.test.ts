import { describe, it, expect, vi } from 'vitest';
import { fetchFromISBNDB, validateISBNDBApiKey } from './isbndbIntegration';

// Mock fetch globally
global.fetch = vi.fn();

describe('ISBNDB Integration', () => {
  describe('fetchFromISBNDB', () => {
    it('should throw error if API key is empty', async () => {
      await expect(fetchFromISBNDB('9780743273565', '')).rejects.toThrow(
        'ISBNDB API key is required'
      );
    });

    it('should return book data when API responds successfully', async () => {
      const mockBook = {
        isbn13: '9780743273565',
        title: 'The Great Gatsby',
        authors: ['F. Scott Fitzgerald'],
        publisher: 'Scribner',
        date_published: '2004',
        language: 'en',
        pages: 180,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ book: mockBook }),
      });

      const result = await fetchFromISBNDB('9780743273565', 'test-api-key');
      
      expect(result).toEqual(mockBook);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api2.isbndb.com/book/9780743273565',
        expect.objectContaining({
          headers: {
            'Authorization': 'test-api-key',
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should return null when book is not found (404)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await fetchFromISBNDB('9999999999999', 'test-api-key');
      expect(result).toBeNull();
    });

    it('should throw error for invalid API key (401)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(fetchFromISBNDB('9780743273565', 'invalid-key')).rejects.toThrow(
        'Invalid ISBNDB API key'
      );
    });

    it('should clean ISBN before making request', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ book: { isbn13: '9780743273565', title: 'Test' } }),
      });

      await fetchFromISBNDB('978-0-7432-7356-5', 'test-api-key');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api2.isbndb.com/book/9780743273565',
        expect.any(Object)
      );
    });
  });

  describe('validateISBNDBApiKey', () => {
    it('should return false for empty API key', async () => {
      const result = await validateISBNDBApiKey('');
      expect(result).toBe(false);
    });

    it('should return true for valid API key', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await validateISBNDBApiKey('valid-key');
      expect(result).toBe(true);
    });

    it('should return false for invalid API key', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await validateISBNDBApiKey('invalid-key');
      expect(result).toBe(false);
    });

    it('should return false when network error occurs', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await validateISBNDBApiKey('test-key');
      expect(result).toBe(false);
    });
  });
});
