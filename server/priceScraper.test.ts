import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrapeBookPrices } from './priceScraper';

// Mock fetch and LLM
global.fetch = vi.fn();
vi.mock('./_core/llm', () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from './_core/llm';

describe('Price Scraper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scrapeBookPrices', () => {
    it('should scrape prices from all 7 marketplaces', async () => {
      // Mock successful HTML fetch for all marketplaces
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => '<html><body>Mock marketplace page</body></html>',
      });

      // Mock AI responses with different prices for each marketplace
      const mockPrices = ['12.50', '15.00', '10.99', '18.00', '14.50', '11.00', '16.50'];
      let callCount = 0;
      
      (invokeLLM as any).mockImplementation(() => {
        const price = mockPrices[callCount % mockPrices.length];
        callCount++;
        return Promise.resolve({
          choices: [{ message: { content: price } }],
        });
      });

      const result = await scrapeBookPrices('9788408276128', 'El Hobbit', 'J.R.R. Tolkien');

      expect(result.isbn).toBe('9788408276128');
      expect(result.title).toBe('El Hobbit');
      expect(result.prices).toHaveLength(7);
      expect(result.minPrice).toBe(10.99);
      expect(result.maxPrice).toBe(18.00);
      expect(result.medianPrice).toBeCloseTo(14.50, 2);
    });

    it('should handle marketplaces that return NO_DISPONIBLE', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => '<html><body>No results found</body></html>',
      });

      // Mock AI responses: some available, some not
      const mockResponses = ['12.50', 'NO_DISPONIBLE', '15.00', 'NO_DISPONIBLE', '14.00', 'NO_DISPONIBLE', '13.00'];
      let callCount = 0;
      
      (invokeLLM as any).mockImplementation(() => {
        const response = mockResponses[callCount % mockResponses.length];
        callCount++;
        return Promise.resolve({
          choices: [{ message: { content: response } }],
        });
      });

      const result = await scrapeBookPrices('9788408276128', 'El Hobbit');

      const availablePrices = result.prices.filter(p => p.available);
      expect(availablePrices.length).toBe(4); // 4 available out of 7
      expect(result.minPrice).toBe(12.50);
      expect(result.maxPrice).toBe(15.00);
    });

    it('should handle network errors gracefully', async () => {
      // Mock fetch to fail for some marketplaces
      let fetchCallCount = 0;
      (global.fetch as any).mockImplementation(() => {
        fetchCallCount++;
        if (fetchCallCount % 2 === 0) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          text: async () => '<html><body>Mock page</body></html>',
        });
      });

      (invokeLLM as any).mockResolvedValue({
        choices: [{ message: { content: '12.50' } }],
      });

      const result = await scrapeBookPrices('9788408276128', 'El Hobbit');

      // Should still return results from successful marketplaces
      expect(result.prices.length).toBeGreaterThan(0);
      expect(result.prices.length).toBeLessThan(7); // Some failed
    });

    it('should calculate median correctly for odd number of prices', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => '<html><body>Mock page</body></html>',
      });

      // Prices: 10, 12, 14, 16, 18, NO_DISPONIBLE, NO_DISPONIBLE
      // Median of [10, 12, 14, 16, 18] = 14
      const mockResponses = ['10.00', '12.00', '14.00', '16.00', '18.00', 'NO_DISPONIBLE', 'NO_DISPONIBLE'];
      let callCount = 0;
      
      (invokeLLM as any).mockImplementation(() => {
        const response = mockResponses[callCount % mockResponses.length];
        callCount++;
        return Promise.resolve({
          choices: [{ message: { content: response } }],
        });
      });

      const result = await scrapeBookPrices('9788408276128', 'Test Book');

      expect(result.medianPrice).toBe(14.00);
    });

    it('should calculate median correctly for even number of prices', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => '<html><body>Mock page</body></html>',
      });

      // Prices: 10, 12, 14, 16, NO_DISPONIBLE, NO_DISPONIBLE, NO_DISPONIBLE
      // Median of [10, 12, 14, 16] = (12 + 14) / 2 = 13
      const mockResponses = ['10.00', '12.00', '14.00', '16.00', 'NO_DISPONIBLE', 'NO_DISPONIBLE', 'NO_DISPONIBLE'];
      let callCount = 0;
      
      (invokeLLM as any).mockImplementation(() => {
        const response = mockResponses[callCount % mockResponses.length];
        callCount++;
        return Promise.resolve({
          choices: [{ message: { content: response } }],
        });
      });

      const result = await scrapeBookPrices('9788408276128', 'Test Book');

      expect(result.medianPrice).toBe(13.00);
    });

    it('should return null prices when no marketplace has results', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => '<html><body>No results</body></html>',
      });

      (invokeLLM as any).mockResolvedValue({
        choices: [{ message: { content: 'NO_DISPONIBLE' } }],
      });

      const result = await scrapeBookPrices('9999999999999', 'Nonexistent Book');

      expect(result.minPrice).toBeNull();
      expect(result.medianPrice).toBeNull();
      expect(result.maxPrice).toBeNull();
      expect(result.prices.every(p => !p.available)).toBe(true);
    });

    it('should include marketplace names and URLs in results', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => '<html><body>Mock page</body></html>',
      });

      (invokeLLM as any).mockResolvedValue({
        choices: [{ message: { content: '12.50' } }],
      });

      const result = await scrapeBookPrices('9788408276128', 'El Hobbit');

      const marketplaceNames = result.prices.map(p => p.marketplace);
      expect(marketplaceNames).toContain('Wallapop');
      expect(marketplaceNames).toContain('Vinted');
      expect(marketplaceNames).toContain('Amazon.es');
      expect(marketplaceNames).toContain('Iberlibro');
      expect(marketplaceNames).toContain('Casa del Libro');
      expect(marketplaceNames).toContain('Todocolección');
      expect(marketplaceNames).toContain('FNAC');

      // Check that URLs are included
      result.prices.forEach(price => {
        expect(price.url).toBeDefined();
        expect(typeof price.url).toBe('string');
      });
    });
  });
});
