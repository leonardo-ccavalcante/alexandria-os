/**
 * AI-Powered Price Scraping Module
 * 
 * Uses Manus LLM to intelligently extract book prices from Spanish marketplaces:
 * - Wallapop (segunda mano)
 * - Vinted (segunda mano)
 * - Amazon.es (nuevo y usado)
 * - Iberlibro (libros usados especializados)
 * - Casa del Libro (librería española)
 * - Todocolección (coleccionables y antiguos)
 * - FNAC (electrónica y libros)
 */

import { invokeLLM } from './_core/llm';

export interface MarketplacePrice {
  marketplace: string;
  price: number;
  condition?: 'NUEVO' | 'COMO_NUEVO' | 'BUENO' | 'ACEPTABLE';
  url?: string;
  available: boolean;
}

export interface PriceScrapingResult {
  isbn: string;
  title: string;
  prices: MarketplacePrice[];
  minPrice: number | null;
  medianPrice: number | null;
  maxPrice: number | null;
  scrapedAt: Date;
}

/**
 * Scrape prices from all marketplaces using AI
 */
export async function scrapeBookPrices(
  isbn: string,
  title: string,
  author?: string
): Promise<PriceScrapingResult> {
  console.log(`[PriceScraper] Starting price scraping for ISBN: ${isbn}, Title: ${title}`);
  
  const marketplaces = [
    { name: 'Wallapop', url: `https://es.wallapop.com/search?keywords=${encodeURIComponent(isbn + ' ' + title)}` },
    { name: 'Vinted', url: `https://www.vinted.es/catalog?search_text=${encodeURIComponent(isbn + ' ' + title)}` },
    { name: 'Amazon.es', url: `https://www.amazon.es/s?k=${encodeURIComponent(isbn)}` },
    { name: 'Iberlibro', url: `https://www.iberlibro.com/servlet/SearchResults?isbn=${isbn}` },
    { name: 'Casa del Libro', url: `https://www.casadellibro.com/buscar?q=${encodeURIComponent(isbn)}` },
    { name: 'Todocolección', url: `https://www.todocoleccion.net/s/${encodeURIComponent(isbn + ' ' + title)}` },
    { name: 'FNAC', url: `https://www.fnac.es/SearchResult/ResultList.aspx?Search=${encodeURIComponent(isbn)}` },
  ];

  const prices: MarketplacePrice[] = [];

  // Scrape each marketplace using AI
  for (const marketplace of marketplaces) {
    try {
      const price = await scrapeMarketplace(marketplace.name, marketplace.url, isbn, title, author);
      if (price) {
        prices.push(price);
      }
    } catch (error: any) {
      console.error(`[PriceScraper] Error scraping ${marketplace.name}:`, error.message);
    }
  }

  // Calculate statistics
  const availablePrices = prices.filter(p => p.available && p.price > 0).map(p => p.price);
  const minPrice = availablePrices.length > 0 ? Math.min(...availablePrices) : null;
  const maxPrice = availablePrices.length > 0 ? Math.max(...availablePrices) : null;
  const medianPrice = availablePrices.length > 0 ? calculateMedian(availablePrices) : null;

  console.log(`[PriceScraper] Completed scraping. Found ${prices.length} results. Min: €${minPrice}, Median: €${medianPrice}, Max: €${maxPrice}`);

  return {
    isbn,
    title,
    prices,
    minPrice,
    medianPrice,
    maxPrice,
    scrapedAt: new Date(),
  };
}

/**
 * Scrape a single marketplace using AI to extract price information
 */
async function scrapeMarketplace(
  marketplaceName: string,
  searchUrl: string,
  isbn: string,
  title: string,
  author?: string
): Promise<MarketplacePrice | null> {
  console.log(`[PriceScraper] Scraping ${marketplaceName}...`);

  try {
    // Fetch the search results page
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      console.warn(`[PriceScraper] ${marketplaceName} returned ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Use AI to extract price information from HTML
    const aiResponse = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `Eres un experto en extraer información de precios de páginas web de marketplaces españoles. 
Tu tarea es analizar el HTML de una página de resultados de búsqueda y extraer el precio más bajo disponible para un libro específico.

IMPORTANTE:
- Busca precios en euros (€)
- Ignora precios de envío
- Si hay múltiples resultados, devuelve el precio MÁS BAJO
- Si no encuentras ningún resultado relevante, responde con "NO_DISPONIBLE"
- Responde SOLO con un número (ejemplo: 12.50) o "NO_DISPONIBLE"`,
        },
        {
          role: 'user',
          content: `Marketplace: ${marketplaceName}
ISBN: ${isbn}
Título del libro: ${title}
${author ? `Autor: ${author}` : ''}

HTML de la página (primeros 8000 caracteres):
${html.substring(0, 8000)}

¿Cuál es el precio más bajo disponible para este libro en ${marketplaceName}? Responde solo con el número o "NO_DISPONIBLE".`,
        },
      ],
    });

    const aiContent = aiResponse.choices[0]?.message?.content;
    const aiResult = typeof aiContent === 'string' ? aiContent.trim() : null;

    if (!aiResult || aiResult === 'NO_DISPONIBLE') {
      console.log(`[PriceScraper] ${marketplaceName}: No disponible`);
      return {
        marketplace: marketplaceName,
        price: 0,
        available: false,
        url: searchUrl,
      };
    }

    // Parse the price
    const priceMatch = aiResult.match(/(\d+[.,]?\d*)/);
    if (!priceMatch) {
      console.warn(`[PriceScraper] ${marketplaceName}: Could not parse price from AI response: ${aiResult}`);
      return null;
    }

    const price = parseFloat(priceMatch[1].replace(',', '.'));

    console.log(`[PriceScraper] ${marketplaceName}: €${price.toFixed(2)}`);

    return {
      marketplace: marketplaceName,
      price,
      available: true,
      url: searchUrl,
    };
  } catch (error: any) {
    console.error(`[PriceScraper] Error scraping ${marketplaceName}:`, error.message);
    return null;
  }
}

/**
 * Calculate median of an array of numbers
 */
function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    return sorted[mid];
  }
}

/**
 * Get cached prices or scrape if cache is expired (24h)
 */
export async function getCachedOrScrapePrices(
  isbn: string,
  title: string,
  author?: string,
  lastPriceCheck?: Date | null
): Promise<PriceScrapingResult> {
  // Check if we have recent prices (within 24 hours)
  if (lastPriceCheck) {
    const hoursSinceLastCheck = (Date.now() - new Date(lastPriceCheck).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastCheck < 24) {
      console.log(`[PriceScraper] Using cached prices for ${isbn} (checked ${hoursSinceLastCheck.toFixed(1)}h ago)`);
      // Return cached data - caller should use existing database values
      return {
        isbn,
        title,
        prices: [],
        minPrice: null,
        medianPrice: null,
        maxPrice: null,
        scrapedAt: lastPriceCheck,
      };
    }
  }

  // Cache expired or doesn't exist - scrape new prices
  return await scrapeBookPrices(isbn, title, author);
}
