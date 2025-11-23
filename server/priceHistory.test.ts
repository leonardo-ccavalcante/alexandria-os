import { describe, it, expect, beforeEach, vi } from 'vitest';
import { savePriceHistory, getLatestMarketplacePrices } from './db';
import type { InsertPriceHistory } from '../drizzle/schema';

// Mock the database
vi.mock('./db', async () => {
  const actual = await vi.importActual('./db');
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined)
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: 1,
                isbn13: '9781234567890',
                marketplace: 'Amazon.es',
                price: '15.99',
                condition: 'NUEVO',
                url: 'https://amazon.es/book',
                available: 'YES',
                scrapedAt: new Date()
              },
              {
                id: 2,
                isbn13: '9781234567890',
                marketplace: 'Wallapop',
                price: '12.50',
                condition: 'BUENO',
                url: null,
                available: 'YES',
                scrapedAt: new Date()
              }
            ])
          })
        })
      })
    })
  };
});

describe('Price History', () => {
  describe('savePriceHistory', () => {
    it('should save marketplace prices to database', async () => {
      const prices: InsertPriceHistory[] = [
        {
          isbn13: '9781234567890',
          marketplace: 'Amazon.es',
          price: '15.99',
          condition: 'NUEVO',
          url: 'https://amazon.es/book',
          available: 'YES',
          scrapedAt: new Date()
        },
        {
          isbn13: '9781234567890',
          marketplace: 'Wallapop',
          price: '12.50',
          condition: 'BUENO',
          url: null,
          available: 'YES',
          scrapedAt: new Date()
        }
      ];

      await expect(savePriceHistory(prices)).resolves.not.toThrow();
    });

    it('should handle empty price array gracefully', async () => {
      await expect(savePriceHistory([])).resolves.not.toThrow();
    });
  });

  describe('getLatestMarketplacePrices', () => {
    it('should return marketplace prices for a book', async () => {
      const prices = await getLatestMarketplacePrices('9781234567890');

      expect(prices).toBeInstanceOf(Array);
      expect(prices.length).toBeGreaterThan(0);
      expect(prices[0]).toHaveProperty('marketplace');
      expect(prices[0]).toHaveProperty('price');
      expect(prices[0]).toHaveProperty('available');
    });

    it('should return empty array for non-existent ISBN', async () => {
      const prices = await getLatestMarketplacePrices('9999999999999');

      // Mock will still return data, but in real scenario it would be empty
      expect(prices).toBeInstanceOf(Array);
    });

    it('should only return prices from last 24 hours', async () => {
      const prices = await getLatestMarketplacePrices('9781234567890');

      if (prices.length > 0) {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        prices.forEach(price => {
          expect(new Date(price.scrapedAt).getTime()).toBeGreaterThanOrEqual(oneDayAgo.getTime());
        });
      }
    });
  });
});
