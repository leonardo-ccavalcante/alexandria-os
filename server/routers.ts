import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { eq, and, sql, or, isNull } from "drizzle-orm";
import mysql from 'mysql2/promise';
import { catalogMasters, inventoryItems, salesTransactions, InsertCatalogMaster } from "../drizzle/schema";
import { getDb } from "./db";
import { extractIsbnFromImage } from "./aiIsbnExtractor";
import { fetchExternalBookMetadata } from "./_core/externalBookApi";
import { logExport, logDatabaseActivity } from "./auditLog";
import {
  getCatalogMasterByIsbn,
  upsertCatalogMaster,
  createInventoryItem,
  getInventoryItemByUuid,
  updateInventoryItem,
  searchInventory,
  batchUpdateInventoryItems,
  createSalesTransaction,
  getSalesTransactions,
  getSystemSetting,
  getAllSystemSettings,
  updateSystemSetting,
  getDashboardKPIs,
  getSalesByChannel,
  getTopPerformingBooks,
  getInventoryVelocity,
  getAnalyticsByAuthor,
  getAnalyticsByPublisher,
  getAnalyticsByCategory,
  getAnalyticsByLocation,
  getInventorySummaryByIsbn,
} from "./db";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============================================================================
  // TRIAGE & SCAN
  // ============================================================================
  triage: router({
    // Get book data by ISBN (for catalog page preview)
    getBookByIsbn: protectedProcedure
      .input(z.object({ isbn: z.string() }))
      .query(async ({ input }) => {
        const cleanedIsbn = input.isbn.replace(/[-\s]/g, '');
        const bookData = await getCatalogMasterByIsbn(cleanedIsbn);
        
        if (!bookData) {
          return { found: false };
        }
        
        return {
          found: true,
          bookData,
        };
      }),
    
    // Check if book exists in catalog and get profit projection
    checkIsbn: protectedProcedure
      .input(z.object({ isbn: z.string() }))
      .mutation(async ({ input }) => {
        // Import ISBN utilities
        const { normalizeISBN, isValidISBN } = await import('../shared/isbn-utils');
        
        // Clean ISBN (remove hyphens and spaces)
        const cleanedIsbn = input.isbn.replace(/[-\s]/g, '');
        
        // Validate ISBN format (accept both ISBN-10 and ISBN-13)
        if (!isValidISBN(cleanedIsbn)) {
          throw new Error('ISBN inválido. Debe ser un ISBN-10 (10 dígitos) o ISBN-13 (13 dígitos) válido.');
        }
        
        // Normalize to ISBN-13 for database lookup
        const isbn13 = normalizeISBN(cleanedIsbn);
        
        // Check if book exists in catalog (using normalized ISBN-13)
        let bookData = await getCatalogMasterByIsbn(isbn13);
        
        // Check if book exists in inventory (for duplicate detection)
        const inventorySummary = await getInventorySummaryByIsbn(isbn13);
        
        // If book exists, check if price data is stale (>7 days)
        if (bookData) {
          const daysSinceCheck = bookData.lastPriceCheck 
            ? Math.floor((Date.now() - bookData.lastPriceCheck.getTime()) / (1000 * 60 * 60 * 24))
            : 999;
          
          // For MVP, we'll use cached data even if stale
          // In production, implement price refresh here
        }
        
        // If book doesn't exist in catalog, return error (frontend should call fetchBookData)
        if (!bookData) {
          return {
            found: false,
            isbn: isbn13, // Return normalized ISBN-13
            inventorySummary, // Include inventory info even if not in catalog
          };
        }
        
        // Get system thresholds
        const minProfitThreshold = await getSystemSetting('MIN_PROFIT_THRESHOLD');
        const estimatedFees = await getSystemSetting('ESTIMATED_FEES');
        
        const minProfit = parseFloat(minProfitThreshold?.settingValue || '8.00');
        const fees = parseFloat(estimatedFees?.settingValue || '4.50');
        
        // Calculate projected profit
        const marketPrice = parseFloat(bookData.marketMedianPrice || bookData.marketMinPrice || '0');
        const projectedProfit = marketPrice - fees;
        
        // Determine decision
        let decision: 'ACCEPT' | 'DONATE' | 'RECYCLE';
        let reason: string;
        let color: string;
        
        if (projectedProfit < 0) {
          decision = 'RECYCLE';
          reason = `Pérdida total. Precio mercado (€${marketPrice.toFixed(2)}) no cubre gastos estimados (€${fees.toFixed(2)})`;
          color = 'red';
        } else if (projectedProfit < minProfit) {
          decision = 'DONATE';
          reason = `Beneficio bajo (€${projectedProfit.toFixed(2)}), por debajo del umbral mínimo (€${minProfit.toFixed(2)})`;
          color = 'yellow';
        } else {
          decision = 'ACCEPT';
          reason = `Beneficio proyectado: €${projectedProfit.toFixed(2)}. ¡CATALOGAR!`;
          color = 'green';
        }
        
        // Get latest marketplace prices
        const { getLatestMarketplacePrices } = await import('./db');
        const marketplacePrices = await getLatestMarketplacePrices(isbn13);
        
        return {
          found: true,
          decision,
          projectedProfit,
          marketPrice,
          estimatedFees: fees,
          reason,
          color,
          bookData,
          marketplacePrices, // Include detailed marketplace prices
          inventorySummary, // Include inventory summary for duplicate detection
        };
      }),
    
    // Fetch book data from external API (Google Books)
    fetchBookData: protectedProcedure
      .input(z.object({ isbn: z.string() }))
      .mutation(async ({ input }) => {
        // Import ISBN utilities and normalize
        const { normalizeISBN } = await import('../shared/isbn-utils');
        const isbn13 = normalizeISBN(input.isbn);
        
        // 1. Fetch Extended Metadata using centralized service
        const metadata = await fetchExternalBookMetadata(isbn13);
        
        if (!metadata.found) {
          return { 
            success: false, 
            message: "Libro no encontrado en bases de datos externas." 
          };
        }
        
        // 2. Prepare Catalog Master Object
        const bookTitle = metadata.title || 'Unknown Title';
        const bookAuthor = metadata.author || 'Autor Desconocido';
        
        // 3. Scrape real prices from marketplaces using AI (parallel)
        console.log('[Triage] Scraping real prices from 7 marketplaces...');
        const { scrapeBookPrices } = await import('./priceScraper');
        const priceData = await scrapeBookPrices(isbn13, bookTitle, bookAuthor);
        console.log(`[Triage] Prices found - Min: €${priceData.minPrice}, Median: €${priceData.medianPrice}, Max: €${priceData.maxPrice}`);

        const catalogData: InsertCatalogMaster = {
          isbn13: isbn13,
          title: bookTitle,
          author: bookAuthor,
          publisher: metadata.publisher || null,
          publicationYear: metadata.publishedDate ? parseInt(metadata.publishedDate) : null,
          language: metadata.language || 'ES',
          pages: metadata.pageCount || null,
          synopsis: metadata.description ? metadata.description.substring(0, 2000) : null, // DB Limit Safety
          categoryLevel1: metadata.category || 'Otros', 
          edition: metadata.edition || null,
          coverImageUrl: metadata.coverImageUrl || null,
          // Use real scraped prices instead of mock
          marketMinPrice: priceData.minPrice?.toFixed(2) || null,
          marketMedianPrice: priceData.medianPrice?.toFixed(2) || null,
          lastPriceCheck: new Date(),
        };
        
        // 4. Save marketplace price history
        const { savePriceHistory } = await import('./db');
        const priceHistoryRecords = priceData.prices.map(p => ({
          isbn13: isbn13,
          marketplace: p.marketplace,
          price: p.price?.toFixed(2) || null,
          condition: p.condition || null,
          url: p.url || null,
          available: p.available ? 'YES' as const : 'NO' as const,
          scrapedAt: new Date(),
        }));
        await savePriceHistory(priceHistoryRecords);
        
        // 5. Upsert to Database (Save immediately so it's available for Inventory)
        await upsertCatalogMaster(catalogData);
        
        return {
          success: true,
          bookData: catalogData,
          marketplacePrices: priceData.prices, // Include detailed marketplace prices
        };
      }),
    
    // Extract IS    // Extract ISBN from book cover image using AI vision
    extractIsbnFromImage: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
        mimeType: z.string().default('image/jpeg'),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.imageBase64.split(',')[1] || input.imageBase64, 'base64');
        const result = await extractIsbnFromImage({
          buffer,
          mimeType: input.mimeType,
        });
        
        return result;
      }),
    
    // Extract Depósito Legal from copyright page image using AI vision
    extractDepositoLegal: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm');
        
        try {
          const response = await invokeLLM({
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extract the "Depósito Legal" number from this image. The Depósito Legal is a legal deposit number found in Spanish books, typically on the copyright page. It usually follows formats like "M-1234-1965" or "B-5678-1968" (province letter + number + year). Return ONLY the Depósito Legal number, nothing else. If you cannot find it, return "NOT_FOUND".'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: input.imageBase64,
                      detail: 'high'
                    }
                  }
                ]
              }
            ]
          });
          
          const content = response.choices[0]?.message?.content;
          const extractedText = (typeof content === 'string' ? content.trim() : 'NOT_FOUND') || 'NOT_FOUND';
          
          if (extractedText === 'NOT_FOUND' || !extractedText) {
            return { depositoLegal: null };
          }
          
          // Validate and normalize the extracted Depósito Legal
          const { isValidDepositoLegal, normalizeDepositoLegal } = await import('../shared/deposito-legal-utils');
          
          if (isValidDepositoLegal(extractedText)) {
            return { depositoLegal: normalizeDepositoLegal(extractedText) };
          }
          
          return { depositoLegal: null };
        } catch (error: any) {
          throw new Error(`Error al extraer Depósito Legal: ${error.message}`);
        }
      }),

    // Extract book metadata from cover or colophon image using AI vision
    extractBookMetadata: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm');
        
        try {
          const response = await invokeLLM({
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extract book information from this image (book cover or colophon/copyright page). Return a JSON object with: {"title": "book title", "author": "author name", "publisher": "publisher name", "publicationYear": year}. If any field cannot be found, omit it from the response. Return ONLY valid JSON, nothing else.'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: input.imageBase64,
                      detail: 'high'
                    }
                  }
                ]
              }
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'book_metadata',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'The book title' },
                    author: { type: 'string', description: 'The author name' },
                    publisher: { type: 'string', description: 'The publisher name' },
                    publicationYear: { type: 'integer', description: 'The publication year' },
                  },
                  required: ['title'],
                  additionalProperties: false,
                },
              },
            },
          });
          
          const content = response.choices[0]?.message?.content;
          if (!content || typeof content !== 'string') {
            return { title: null, author: null, publisher: null, publicationYear: null };
          }
          
          const metadata = JSON.parse(content);
          return {
            title: metadata.title || null,
            author: metadata.author || null,
            publisher: metadata.publisher || null,
            publicationYear: metadata.publicationYear || null,
          };
        } catch (error: any) {
          throw new Error(`Error al extraer metadata del libro: ${error.message}`);
        }
      }),
  }),

  // ============================================================================
  // CATALOGING
  // ============================================================================
  catalog: router({
    // Calculate suggested price based on condition
    calculatePrice: protectedProcedure
      .input(z.object({
        isbn: z.string(),
        condition: z.enum(['COMO_NUEVO', 'BUENO', 'ACEPTABLE']),
      }))
      .query(async ({ input }) => {
        const book = await getCatalogMasterByIsbn(input.isbn);
        if (!book) {
          throw new Error('Book not found in catalog');
        }
        
        const basePrice = parseFloat(book.marketMedianPrice || book.marketMinPrice || '0');
        
        // Get price modifiers
        const modifiersSetting = await getSystemSetting('PRICE_MODIFIERS');
        const modifiers = modifiersSetting ? JSON.parse(modifiersSetting.settingValue) : {
          COMO_NUEVO: 1.0,
          BUENO: 0.85,
          ACEPTABLE: 0.60,
        };
        
        const paddingSetting = await getSystemSetting('AUTO_PRICE_PADDING');
        const padding = parseFloat(paddingSetting?.settingValue || '0.50');
        
        const modifier = modifiers[input.condition] || 0.85;
        const suggestedPrice = (basePrice * modifier) + padding;
        
        return {
          suggestedPrice: parseFloat(suggestedPrice.toFixed(2)),
          basePrice,
          modifier,
          padding,
        };
      }),
    
    // Create new inventory item
    createItem: protectedProcedure
      .input(z.object({
        isbn13: z.string(),
        conditionGrade: z.enum(['COMO_NUEVO', 'BUENO', 'ACEPTABLE']),
        conditionNotes: z.string().optional(),
        locationCode: z.string().regex(/^[0-9]{2}[A-Z]$/).optional(),
        listingPrice: z.string(),
        // Optional book data for synthetic ISBNs (books without ISBN)
        bookData: z.object({
          title: z.string(),
          author: z.string().optional(),
          publisher: z.string().optional(),
          publicationYear: z.number().optional(),
        }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Check if catalog master exists
        const existingBook = await getCatalogMasterByIsbn(input.isbn13);
        
        // If book doesn't exist and we have bookData (synthetic ISBN case), create catalog master
        if (!existingBook && input.bookData) {
          const catalogData: InsertCatalogMaster = {
            isbn13: input.isbn13,
            title: input.bookData.title,
            author: input.bookData.author || 'Autor Desconocido',
            publisher: input.bookData.publisher || null,
            publicationYear: input.bookData.publicationYear || null,
            language: 'ES',
            categoryLevel1: 'OTROS',
          };
          
          await upsertCatalogMaster(catalogData);
          console.log(`[Catalog] Created catalog master for synthetic ISBN: ${input.isbn13}`);
        }
        
        const item = await createInventoryItem({
          isbn13: input.isbn13,
          status: 'AVAILABLE',
          conditionGrade: input.conditionGrade,
          conditionNotes: input.conditionNotes || null,
          locationCode: input.locationCode || null,
          listingPrice: input.listingPrice,
          costOfGoods: '0.00',
          createdBy: ctx.user.id,
        });
        
        return { success: true, item };
      }),
    
    // Get unique publishers for autocomplete
    getPublishers: protectedProcedure
      .input(z.object({ search: z.string().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        
        const conditions = [sql`${catalogMasters.publisher} IS NOT NULL`];
        if (input.search) {
          conditions.push(sql`${catalogMasters.publisher} LIKE ${`%${input.search}%`}`);
        }
        
        const results = await db.selectDistinct({ publisher: catalogMasters.publisher })
          .from(catalogMasters)
          .where(and(...conditions))
          .limit(50);
        
        return results.map(r => r.publisher).filter(Boolean);
      }),
    
    // Get unique authors for autocomplete
    getAuthors: protectedProcedure
      .input(z.object({ search: z.string().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        
        const conditions = [sql`${catalogMasters.author} IS NOT NULL`];
        if (input.search) {
          conditions.push(sql`${catalogMasters.author} LIKE ${`%${input.search}%`}`);
        }
        
        const results = await db.selectDistinct({ author: catalogMasters.author })
          .from(catalogMasters)
          .where(and(...conditions))
          .limit(50);
        
        return results.map(r => r.author).filter(Boolean);
      }),
    
    // Get unique locations for filter dropdown
    getLocations: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) return [];
        
        const results = await db.selectDistinct({ locationCode: inventoryItems.locationCode })
          .from(inventoryItems)
          .where(and(
            sql`${inventoryItems.locationCode} IS NOT NULL`,
            sql`${inventoryItems.locationCode} != ''`,
            sql`${inventoryItems.status} = 'AVAILABLE'`
          ))
          .orderBy(inventoryItems.locationCode)
          .limit(200);
        
        return results.map(r => r.locationCode).filter(Boolean);
      }),
    
    // Enrich catalog master with missing metadata from external APIs
    enrichMetadata: protectedProcedure
      .input(z.object({ isbn13: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        // Get current book data
        const existing = await getCatalogMasterByIsbn(input.isbn13);
        if (!existing) throw new Error("Book not found in catalog");
        
        // Check if enrichment is needed (pages can be 0 or null, author can be "Autor Desconocido")
        const needsEnrichment = !existing.author || existing.author === "Autor Desconocido" || !existing.publisher || !existing.pages || existing.pages === 0;
        if (!needsEnrichment) {
          return { success: true, enriched: false, message: "Book already has complete metadata" };
        }

        // Fetch metadata from external APIs
        const metadata = await fetchExternalBookMetadata(input.isbn13);
        if (!metadata.found) {
          return { success: false, enriched: false, message: "Metadata not found in external APIs" };
        }

        // Update only missing fields or fix bad data
        const updateData: Partial<InsertCatalogMaster> = {};
        if ((!existing.author || existing.author === "Autor Desconocido") && metadata.author) updateData.author = metadata.author;
        if (!existing.publisher && metadata.publisher) updateData.publisher = metadata.publisher;
        if ((!existing.pages || existing.pages === 0) && metadata.pageCount) updateData.pages = metadata.pageCount;

        // Fix bad edition values ("preview", "full_public_domain", etc.) by clearing them
        const badEditionValues = ['preview', 'full_public_domain', 'full', 'partial', 'sample'];
        if (existing.edition && badEditionValues.some(bad => existing.edition?.toLowerCase().includes(bad))) {
          updateData.edition = null; // Clear bad edition data
        } else if (!existing.edition && metadata.edition) {
          updateData.edition = metadata.edition;
        }
        
        if (!existing.language && metadata.language) updateData.language = metadata.language;
        if (!existing.synopsis && metadata.description) updateData.synopsis = metadata.description;
        if (!existing.coverImageUrl && metadata.coverImageUrl) updateData.coverImageUrl = metadata.coverImageUrl;
        
        if (Object.keys(updateData).length === 0) {
          return { success: true, enriched: false, message: "No new metadata available" };
        }
        
        // Update database
        await db.update(catalogMasters)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(catalogMasters.isbn13, input.isbn13));
        
        const updated = await db.select().from(catalogMasters)
          .where(eq(catalogMasters.isbn13, input.isbn13))
          .limit(1);
        
        return { 
          success: true, 
          enriched: true, 
          book: updated[0],
          fieldsUpdated: Object.keys(updateData)
        };
      }),
    
    // Bulk enrich all books with missing metadata
    bulkEnrichMetadata: protectedProcedure
      .input(z.object({
        enrichFields: z.array(z.enum(['author', 'publisher', 'pages', 'edition', 'language', 'synopsis', 'coverImageUrl'])).optional(),
      }).optional())
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Determine which fields to enrich (default: all)
        const fieldsToEnrich = input?.enrichFields || ['author', 'publisher', 'pages', 'edition', 'language', 'synopsis', 'coverImageUrl'];

        // Build dynamic WHERE clause based on selected fields
        const conditions: any[] = [];
        if (fieldsToEnrich.includes('author')) {
          conditions.push(isNull(catalogMasters.author), eq(catalogMasters.author, ""), eq(catalogMasters.author, "Autor Desconocido"));
        }
        if (fieldsToEnrich.includes('publisher')) {
          conditions.push(isNull(catalogMasters.publisher), eq(catalogMasters.publisher, ""));
        }
        if (fieldsToEnrich.includes('pages')) {
          conditions.push(isNull(catalogMasters.pages), eq(catalogMasters.pages, 0));
        }
        if (fieldsToEnrich.includes('edition')) {
          conditions.push(isNull(catalogMasters.edition), eq(catalogMasters.edition, ""));
        }
        if (fieldsToEnrich.includes('language')) {
          conditions.push(isNull(catalogMasters.language), eq(catalogMasters.language, ""));
        }
        if (fieldsToEnrich.includes('synopsis')) {
          conditions.push(isNull(catalogMasters.synopsis), eq(catalogMasters.synopsis, ""));
        }
        if (fieldsToEnrich.includes('coverImageUrl')) {
          conditions.push(isNull(catalogMasters.coverImageUrl), eq(catalogMasters.coverImageUrl, ""));
        }

        // Find all books with missing metadata in selected fields
        const booksNeedingEnrichment = await db
          .select({ isbn13: catalogMasters.isbn13 })
          .from(catalogMasters)
          .where(or(...conditions));
        
        const results = {
          total: booksNeedingEnrichment.length,
          enriched: 0,
          failed: 0,
          skipped: 0,
          errors: [] as string[],
          detailedReport: [] as Array<{
            isbn13: string;
            title: string;
            status: 'enriched' | 'failed' | 'skipped';
            fieldsUpdated: string[];
            beforeValues: Record<string, any>;
            afterValues: Record<string, any>;
            source: string | null;
            error: string | null;
            timestamp: string;
          }>,
        };

        // Process each book
        for (const book of booksNeedingEnrichment) {
          const startTime = new Date();
          try {
            // Get current book data
            const existing = await getCatalogMasterByIsbn(book.isbn13);
            if (!existing) {
              results.skipped++;
              results.detailedReport.push({
                isbn13: book.isbn13,
                title: 'Unknown',
                status: 'skipped',
                fieldsUpdated: [],
                beforeValues: {},
                afterValues: {},
                source: null,
                error: 'Book not found in catalog',
                timestamp: startTime.toISOString(),
              });
              continue;
            }

            // Check if enrichment is needed for selected fields only
            const needsEnrichmentChecks: boolean[] = [];
            if (fieldsToEnrich.includes('author')) {
              needsEnrichmentChecks.push(!existing.author || existing.author === "" || existing.author === "Autor Desconocido");
            }
            if (fieldsToEnrich.includes('publisher')) {
              needsEnrichmentChecks.push(!existing.publisher || existing.publisher === "");
            }
            if (fieldsToEnrich.includes('pages')) {
              needsEnrichmentChecks.push(!existing.pages || existing.pages === 0);
            }
            if (fieldsToEnrich.includes('edition')) {
              needsEnrichmentChecks.push(!existing.edition || existing.edition === "");
            }
            if (fieldsToEnrich.includes('language')) {
              needsEnrichmentChecks.push(!existing.language || existing.language === "");
            }
            if (fieldsToEnrich.includes('synopsis')) {
              needsEnrichmentChecks.push(!existing.synopsis || existing.synopsis === "");
            }
            if (fieldsToEnrich.includes('coverImageUrl')) {
              needsEnrichmentChecks.push(!existing.coverImageUrl || existing.coverImageUrl === "");
            }

            const needsEnrichment = needsEnrichmentChecks.some(check => check);
            if (!needsEnrichment) {
              results.skipped++;
              results.detailedReport.push({
                isbn13: book.isbn13,
                title: existing.title || 'Unknown',
                status: 'skipped',
                fieldsUpdated: [],
                beforeValues: {},
                afterValues: {},
                source: null,
                error: 'All selected fields already complete',
                timestamp: startTime.toISOString(),
              });
              continue;
            }
            
            // Fetch metadata from external APIs
            const metadata = await fetchExternalBookMetadata(book.isbn13);
            if (!metadata.found) {
              results.failed++;
              results.errors.push(`${book.isbn13}: Metadata not found`);
              results.detailedReport.push({
                isbn13: book.isbn13,
                title: existing.title || 'Unknown',
                status: 'failed',
                fieldsUpdated: [],
                beforeValues: {},
                afterValues: {},
                source: null,
                error: 'Metadata not found in external APIs',
                timestamp: startTime.toISOString(),
              });
              continue;
            }

            // Track before/after values for report
            const beforeValues: Record<string, any> = {};
            const afterValues: Record<string, any> = {};
            const fieldsUpdated: string[] = [];

            // Update only missing fields for selected field types
            const updateData: Partial<InsertCatalogMaster> = {};

            if (fieldsToEnrich.includes('author') && (!existing.author || existing.author === "" || existing.author === "Autor Desconocido") && metadata.author) {
              beforeValues.author = existing.author || null;
              updateData.author = metadata.author;
              afterValues.author = metadata.author;
              fieldsUpdated.push('author');
            }

            if (fieldsToEnrich.includes('publisher') && (!existing.publisher || existing.publisher === "") && metadata.publisher) {
              beforeValues.publisher = existing.publisher || null;
              updateData.publisher = metadata.publisher;
              afterValues.publisher = metadata.publisher;
              fieldsUpdated.push('publisher');
            }

            if (fieldsToEnrich.includes('pages') && (!existing.pages || existing.pages === 0) && metadata.pageCount) {
              beforeValues.pages = existing.pages || null;
              updateData.pages = metadata.pageCount;
              afterValues.pages = metadata.pageCount;
              fieldsUpdated.push('pages');
            }

            // Fix bad edition values ("preview", "full_public_domain", etc.) by clearing them
            if (fieldsToEnrich.includes('edition')) {
              const badEditionValues = ['preview', 'full_public_domain', 'full', 'partial', 'sample'];
              if (existing.edition && badEditionValues.some(bad => existing.edition?.toLowerCase().includes(bad))) {
                beforeValues.edition = existing.edition;
                updateData.edition = null; // Clear bad edition data
                afterValues.edition = null;
                fieldsUpdated.push('edition');
              } else if ((!existing.edition || existing.edition === "") && metadata.edition) {
                beforeValues.edition = existing.edition || null;
                updateData.edition = metadata.edition;
                afterValues.edition = metadata.edition;
                fieldsUpdated.push('edition');
              }
            }

            if (fieldsToEnrich.includes('language') && (!existing.language || existing.language === "") && metadata.language) {
              beforeValues.language = existing.language || null;
              updateData.language = metadata.language;
              afterValues.language = metadata.language;
              fieldsUpdated.push('language');
            }

            if (fieldsToEnrich.includes('synopsis') && (!existing.synopsis || existing.synopsis === "") && metadata.description) {
              beforeValues.synopsis = existing.synopsis || null;
              updateData.synopsis = metadata.description;
              afterValues.synopsis = metadata.description.substring(0, 100) + '...'; // Truncate for report
              fieldsUpdated.push('synopsis');
            }

            if (fieldsToEnrich.includes('coverImageUrl') && (!existing.coverImageUrl || existing.coverImageUrl === "") && metadata.coverImageUrl) {
              beforeValues.coverImageUrl = existing.coverImageUrl || null;
              updateData.coverImageUrl = metadata.coverImageUrl;
              afterValues.coverImageUrl = metadata.coverImageUrl;
              fieldsUpdated.push('coverImageUrl');
            }

            if (Object.keys(updateData).length === 0) {
              results.skipped++;
              results.detailedReport.push({
                isbn13: book.isbn13,
                title: existing.title || 'Unknown',
                status: 'skipped',
                fieldsUpdated: [],
                beforeValues: {},
                afterValues: {},
                source: null,
                error: 'No new metadata available from APIs',
                timestamp: startTime.toISOString(),
              });
              continue;
            }

            // Update database
            await db.update(catalogMasters)
              .set({ ...updateData, updatedAt: new Date() })
              .where(eq(catalogMasters.isbn13, book.isbn13));

            results.enriched++;
            results.detailedReport.push({
              isbn13: book.isbn13,
              title: existing.title || 'Unknown',
              status: 'enriched',
              fieldsUpdated,
              beforeValues,
              afterValues,
              source: metadata.found ? 'Google Books/ISBNdb' : null,
              error: null,
              timestamp: startTime.toISOString(),
            });
          } catch (error: any) {
            results.failed++;
            results.errors.push(`${book.isbn13}: ${error.message}`);
            results.detailedReport.push({
              isbn13: book.isbn13,
              title: 'Unknown',
              status: 'failed',
              fieldsUpdated: [],
              beforeValues: {},
              afterValues: {},
              source: null,
              error: error.message,
              timestamp: startTime.toISOString(),
            });
          }
        }
        
        return results;
      }),
    
    // Get unique publishers (book metadata)
    updateBook: protectedProcedure
      .input(z.object({
        isbn13: z.string(),
        title: z.string().optional(),
        author: z.string().optional(),
        publisher: z.string().optional(),
        publicationYear: z.number().optional(),
        language: z.string().optional(),
        categoryLevel1: z.string().optional(),
        categoryLevel2: z.string().optional(),
        categoryLevel3: z.string().optional(),
        materia: z.string().optional(),
        synopsis: z.string().optional(),
        coverImageUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const { isbn13, ...updateData } = input;
        
        await db.update(catalogMasters)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(catalogMasters.isbn13, isbn13));
        
        const updated = await db.select().from(catalogMasters)
          .where(eq(catalogMasters.isbn13, isbn13))
          .limit(1);
        
        if (updated.length === 0) throw new Error("Book not found");
        
        return { success: true, book: updated[0] };
      }),
  }),

  // ============================================================================
  // INVENTORY MANAGEMENT
  // ============================================================================
  inventory: router({
    // Search and filter inventory
    search: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        condition: z.string().optional(),
        location: z.string().optional(),
        searchText: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }))
      .query(async ({ input }) => {
        return await searchInventory(input);
      }),
    
    // Get single item by UUID
    getByUuid: protectedProcedure
      .input(z.object({ uuid: z.string() }))
      .query(async ({ input }) => {
        const item = await getInventoryItemByUuid(input.uuid);
        if (!item) throw new Error("Item not found");
        return item;
      }),
    
    // Update item location
    updateLocation: protectedProcedure
      .input(z.object({
        uuid: z.string(),
        locationCode: z.string().regex(/^[0-9]{2}[A-Z]$/),
      }))
      .mutation(async ({ input }) => {
        const item = await updateInventoryItem(input.uuid, {
          locationCode: input.locationCode,
        });
        return { success: true, item };
      }),
    
    // Update item price
    updatePrice: protectedProcedure
      .input(z.object({
        uuid: z.string(),
        listingPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
      }))
      .mutation(async ({ input }) => {
        const item = await updateInventoryItem(input.uuid, {
          listingPrice: input.listingPrice,
        });
        return { success: true, item };
      }),
    
    // Update item status
    updateStatus: protectedProcedure
      .input(z.object({
        uuid: z.string(),
        status: z.enum(['INGESTION', 'AVAILABLE', 'LISTED', 'RESERVED', 'SOLD', 'REJECTED', 'DONATED', 'MISSING']),
      }))
      .mutation(async ({ input }) => {
        const item = await updateInventoryItem(input.uuid, {
          status: input.status,
        });
        return { success: true, item };
      }),
    
    // ✅ OPTIMIZED: Single SQL query with GROUP BY, sorting support for all fields
    getGroupedByIsbn: protectedProcedure
      .input(z.object({
        searchText: z.string().optional(),
        categoryLevel1: z.string().optional(),
        publisher: z.string().optional(),
        author: z.string().optional(),
        location: z.string().optional(),
        yearFrom: z.number().optional(),
        yearTo: z.number().optional(),
        includeZeroInventory: z.boolean().default(false),
        hideWithoutLocation: z.boolean().default(false),
        hideWithoutQuantity: z.boolean().default(false),
        limit: z.number().default(50),
        offset: z.number().default(0),
        // NEW: Sort Parameters
        sortField: z.enum(['title', 'author', 'publisher', 'isbn13', 'publicationYear', 'total', 'available', 'location', 'price']).default('title'),
        sortDirection: z.enum(['asc', 'desc']).default('asc'),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        
        // Build WHERE conditions as raw SQL strings to avoid alias mismatch
        const whereConditions = ['1=1'];
        const whereParams: any[] = [];
        
        if (input.searchText) {
          const search = `%${input.searchText}%`;
          whereConditions.push('(cm.title LIKE ? OR cm.author LIKE ? OR cm.isbn13 LIKE ?)');
          whereParams.push(search, search, search);
        }
        if (input.categoryLevel1) {
          whereConditions.push('cm.categoryLevel1 = ?');
          whereParams.push(input.categoryLevel1);
        }
        if (input.publisher) {
          whereConditions.push('cm.publisher LIKE ?');
          whereParams.push(`%${input.publisher}%`);
        }
        if (input.author) {
          whereConditions.push('cm.author LIKE ?');
          whereParams.push(`%${input.author}%`);
        }
        if (input.location) {
          whereConditions.push('ii.locationCode LIKE ?');
          whereParams.push(`%${input.location}%`);
        }
        if (input.yearFrom) {
          whereConditions.push('cm.publicationYear >= ?');
          whereParams.push(input.yearFrom);
        }
        if (input.yearTo) {
          whereConditions.push('cm.publicationYear <= ?');
          whereParams.push(input.yearTo);
        }

        const whereClause = whereConditions.join(' AND ');

        // Dynamic Sort Clause
        const dir = input.sortDirection === 'asc' ? 'ASC' : 'DESC';
        let orderByClause;
        switch (input.sortField) {
            case 'title': orderByClause = `cm.title ${dir}`; break;
            case 'author': orderByClause = `cm.author ${dir}`; break;
            case 'publisher': orderByClause = `cm.publisher ${dir}`; break;
            case 'isbn13': orderByClause = `cm.isbn13 ${dir}`; break;
            case 'publicationYear': orderByClause = `cm.publicationYear ${dir}`; break;
            case 'total': orderByClause = `totalQuantity ${dir}`; break;
            case 'available': orderByClause = `availableQuantity ${dir}`; break;
            case 'location': orderByClause = `locations ${dir}`; break;
            case 'price': orderByClause = `avgPrice ${dir}`; break;
            default: orderByClause = `cm.title ${dir}`;
        }

        // Build HAVING clause for post-aggregation filters
        const havingConditions = [];
        if (!input.includeZeroInventory) {
          havingConditions.push('totalQuantity > 0');
        }
        if (input.hideWithoutLocation) {
          havingConditions.push('locations IS NOT NULL AND locations != ""');
        }
        if (input.hideWithoutQuantity) {
          havingConditions.push('availableQuantity > 0');
        }
        const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : '';
        
        const dataQuery = `
          SELECT 
            cm.isbn13, cm.title, cm.author, cm.publisher, cm.publicationYear, 
            cm.categoryLevel1, cm.categoryLevel2, cm.categoryLevel3, cm.synopsis, cm.coverImageUrl,
            cm.pages, cm.edition, cm.language,
            COUNT(ii.uuid) as totalQuantity,
            SUM(CASE WHEN ii.status = 'AVAILABLE' THEN 1 ELSE 0 END) as availableQuantity,
            GROUP_CONCAT(DISTINCT CASE WHEN ii.status = 'AVAILABLE' AND ii.locationCode IS NOT NULL AND ii.locationCode != '' THEN ii.locationCode END ORDER BY ii.locationCode SEPARATOR ',') as locations,
            GROUP_CONCAT(DISTINCT CASE WHEN ii.status = 'AVAILABLE' THEN ii.uuid END SEPARATOR ',') as availableItemUuids,
            GROUP_CONCAT(DISTINCT CASE WHEN ii.status = 'AVAILABLE' AND ii.salesChannels IS NOT NULL THEN ii.salesChannels END SEPARATOR '|') as salesChannelsRaw,
            AVG(CASE WHEN ii.status = 'AVAILABLE' AND ii.listingPrice IS NOT NULL THEN ii.listingPrice ELSE NULL END) as avgPrice,
            MIN(CASE WHEN ii.status = 'AVAILABLE' AND ii.listingPrice IS NOT NULL THEN ii.listingPrice ELSE NULL END) as minPrice,
            MAX(CASE WHEN ii.status = 'AVAILABLE' AND ii.listingPrice IS NOT NULL THEN ii.listingPrice ELSE NULL END) as maxPrice
          FROM catalog_masters cm
          LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13
          WHERE ${whereClause}
          GROUP BY cm.isbn13, cm.title, cm.author, cm.publisher, cm.publicationYear, cm.categoryLevel1, cm.categoryLevel2, cm.categoryLevel3, cm.synopsis, cm.coverImageUrl, cm.pages, cm.edition, cm.language
          ${havingClause}
          ORDER BY ${orderByClause}
          LIMIT ${input.limit} OFFSET ${input.offset}
        `;

        // Count query must also respect the HAVING logic for consistency
        // Use subquery to apply HAVING clause correctly
        const countQuerySql = `
          SELECT COUNT(*) as count FROM (
            SELECT cm.isbn13,
              COUNT(ii.uuid) as totalQuantity,
              SUM(CASE WHEN ii.status = 'AVAILABLE' THEN 1 ELSE 0 END) as availableQuantity,
              GROUP_CONCAT(DISTINCT CASE WHEN ii.status = 'AVAILABLE' AND ii.locationCode IS NOT NULL AND ii.locationCode != '' THEN ii.locationCode END ORDER BY ii.locationCode SEPARATOR ',') as locations
            FROM catalog_masters cm
            LEFT JOIN inventory_items ii ON cm.isbn13 = ii.isbn13
            WHERE ${whereClause}
            GROUP BY cm.isbn13
            ${havingClause}
          ) as filtered_books
        `;

        // Use mysql2 pool directly for parameterized queries
        const pool = mysql.createPool(process.env.DATABASE_URL!);
        const [[rawRows], [countRows]] = await Promise.all([
          pool.execute(dataQuery, whereParams),
          pool.execute(countQuerySql, whereParams)
        ]);
        await pool.end();
        
        // Extract data from RowDataPacket format
        const rawItems = rawRows as any[];
        const totalCount = countRows && (countRows as any[]).length > 0 ? Number((countRows as any[])[0].count) : 0;

        const items = rawItems.map((row: any) => {
          // Parse sales channels from concatenated JSON arrays
          let salesChannels: string[] = [];
          if (row.salesChannelsRaw) {
            const channelArrays = row.salesChannelsRaw.split('|');
            const allChannels = channelArrays.flatMap((jsonStr: string) => {
              try {
                return JSON.parse(jsonStr);
              } catch {
                return [];
              }
            });
            // Remove duplicates
            salesChannels = Array.from(new Set(allChannels));
          }
          
          return {
            ...row,
            totalQuantity: Number(row.totalQuantity),
            availableQuantity: Number(row.availableQuantity),
            locations: row.locations ? row.locations.split(',') : [],
            salesChannels,
            avgPrice: row.avgPrice ? Number(row.avgPrice) : null,
            minPrice: row.minPrice ? Number(row.minPrice) : null,
            maxPrice: row.maxPrice ? Number(row.maxPrice) : null,
            items: row.availableItemUuids ? row.availableItemUuids.split(',').map((uuid: string) => ({ uuid, status: 'AVAILABLE' })) : []
          };
        });

        return {
          items,
          total: totalCount,
          page: Math.floor(input.offset / input.limit) + 1,
          pageSize: input.limit,
          totalPages: Math.ceil(totalCount / input.limit),
        };
      }),
    
    // Get books without valid ISBN (for collapsible section)
    getBooksWithoutIsbn: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        
        const books = await db
          .select({
            isbn13: catalogMasters.isbn13,
            title: catalogMasters.title,
            author: catalogMasters.author,
            publisher: catalogMasters.publisher,
            publicationYear: catalogMasters.publicationYear,
          })
          .from(catalogMasters)
          .where(
            or(
              isNull(catalogMasters.isbn13),
              eq(catalogMasters.isbn13, ''),
              sql`LENGTH(${catalogMasters.isbn13}) < 10`
            )
          )
          .limit(100); // Limit to 100 for performance
        
        return { books, count: books.length };
      }),
    
    // Increase quantity (alias for addQuantity)
    increaseQuantity: protectedProcedure
      .input(z.object({ isbn13: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const item = await createInventoryItem({
          isbn13: input.isbn13,
          status: 'AVAILABLE',
          conditionGrade: 'BUENO',
          locationCode: null,
          createdBy: ctx.user.id,
        });
        return { success: true, item };
      }),
    
    // Decrease quantity (alias for removeQuantity)
    decreaseQuantity: protectedProcedure
      .input(z.object({ isbn13: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        
        // Get one available item for this ISBN
        const items = await db
          .select({ uuid: inventoryItems.uuid })
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.isbn13, input.isbn13),
            eq(inventoryItems.status, 'AVAILABLE')
          ))
          .limit(1);
        
        if (items.length === 0) {
          throw new Error('No available items to remove');
        }
        
        // Update status to DONATED
        await db.update(inventoryItems)
          .set({ status: 'DONATED', updatedAt: new Date() })
          .where(eq(inventoryItems.uuid, items[0]!.uuid));
        
        return { success: true };
      }),
    
    // Add new inventory item for existing ISBN
    addQuantity: protectedProcedure
      .input(z.object({
        isbn13: z.string(),
        quantity: z.number().min(1).max(100),
        condition: z.enum(['COMO_NUEVO', 'BUENO', 'ACEPTABLE']).default('BUENO'),
        location: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const items = [];
        for (let i = 0; i < input.quantity; i++) {
          const item = await createInventoryItem({
            isbn13: input.isbn13,
            status: 'AVAILABLE',
            conditionGrade: input.condition,
            locationCode: input.location || null,
            createdBy: ctx.user.id,
          });
          items.push(item);
        }
        return { success: true, items };
      }),
    
    // Remove inventory items (mark as donated/missing)
    removeQuantity: protectedProcedure
      .input(z.object({
        isbn13: z.string(),
        quantity: z.number().min(1),
        reason: z.enum(['DONATED', 'MISSING', 'REJECTED']).default('DONATED'),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        
        // Get available items for this ISBN
        const items = await db
          .select({ uuid: inventoryItems.uuid })
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.isbn13, input.isbn13),
            eq(inventoryItems.status, 'AVAILABLE')
          ))
          .limit(input.quantity);
        
        if (items.length < input.quantity) {
          throw new Error(`Only ${items.length} available items found, cannot remove ${input.quantity}`);
        }
        
        // Update status for each item
        for (const item of items) {
          await updateInventoryItem(item.uuid, {
            status: input.reason,
          });
        }
        
        return { success: true, removed: items.length };
      }),
    
    // Record sale
    recordSale: protectedProcedure
      .input(z.object({
        uuid: z.string(),
        channel: z.string(),
        finalSalePrice: z.string(),
        platformFees: z.string(),
        shippingCost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const item = await getInventoryItemByUuid(input.uuid);
        if (!item) {
          throw new Error('Item not found');
        }
        
        const finalPrice = parseFloat(input.finalSalePrice);
        const fees = parseFloat(input.platformFees);
        const shipping = parseFloat(input.shippingCost || '0');
        const grossProfit = finalPrice - fees;
        const netProfit = finalPrice - fees - shipping;
        
        const daysInInventory = Math.floor(
          (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // Create sales transaction
        await createSalesTransaction({
          itemUuid: input.uuid,
          isbn13: item.isbn13,
          channel: input.channel,
          saleDate: new Date(),
          listingPrice: item.listingPrice || '0',
          finalSalePrice: input.finalSalePrice,
          platformCommissionPct: fees > 0 ? ((fees / finalPrice) * 100).toFixed(2) : '0',
          platformFees: input.platformFees,
          shippingCost: input.shippingCost || '0.00',
          grossProfit: grossProfit.toFixed(2),
          netProfit: netProfit.toFixed(2),
          daysInInventory,
          transactionNotes: input.notes || null,
          createdBy: ctx.user.id,
        });
        
        // Update inventory item
        await updateInventoryItem(input.uuid, {
          status: 'SOLD',
          soldAt: new Date(),
          soldChannel: input.channel,
          finalSalePrice: input.finalSalePrice,
          platformFees: input.platformFees,
          netProfit: netProfit.toFixed(2),
        });
        
        return { success: true };
      }),
    
    // Update sales channels for an inventory item
    updateSalesChannels: protectedProcedure
      .input(z.object({
        uuid: z.string(),
        salesChannels: z.array(z.enum([
          'Wallapop',
          'Vinted',
          'Todo Colección',
          'Sitio web',
          'Iberlibro',
          'Amazon',
          'Ebay',
          'Casa del Libro',
          'Fnac',
        ])),
      }))
      .mutation(async ({ input }) => {
        const item = await updateInventoryItem(input.uuid, {
          salesChannels: JSON.stringify(input.salesChannels),
        });
        return { success: true, item };
      }),
  }),

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================
  batch: router({
    // Batch update from CSV
    updateFromCsv: protectedProcedure
      .input(z.object({
        updates: z.array(z.object({
          uuid: z.string(),
          locationCode: z.string().optional(),
          listingPrice: z.string().optional(),
          status: z.string().optional(),
          conditionNotes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const result = await batchUpdateInventoryItems(input.updates);
        return {
          success: result.errors.length === 0,
          stats: {
            totalRows: input.updates.length,
            updated: result.updated,
            skipped: result.errors.length,
            errors: result.errors,
          },
        };
      }),
    
    // Admin-only: Clean up database
    cleanupDatabase: protectedProcedure
      .mutation(async ({ ctx }) => {
        // Check if user is admin
        if (ctx.user?.role !== 'admin') {
          throw new Error('Only admins can clean up the database');
        }
        
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        
        try {
          // Delete all inventory items
          await db.delete(inventoryItems);
          
          // Delete all catalog masters
          await db.delete(catalogMasters);
          
          return {
            success: true,
            message: 'Database cleaned successfully',
          };
        } catch (error: any) {
          throw new Error(`Failed to clean database: ${error.message}`);
        }
      }),
    
    // Import catalog from CSV
    importCatalogFromCsv: protectedProcedure
      .input(z.object({
        csvData: z.string(),
      }))
      .mutation(async ({ input }) => {
        // Proper CSV parser that handles multi-line quoted fields
        const parseCSV = (csvText: string): string[][] => {
          const rows: string[][] = [];
          let currentRow: string[] = [];
          let currentField = '';
          let inQuotes = false;
          
          for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];
            
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                // Escaped quote ("")
                currentField += '"';
                i++; // Skip next quote
              } else {
                // Toggle quote state
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              // End of field
              currentRow.push(currentField.trim());
              currentField = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
              // End of row
              if (currentField || currentRow.length > 0) {
                currentRow.push(currentField.trim());
                if (currentRow.some(f => f.length > 0)) {
                  rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
              }
              // Skip \r\n pairs
              if (char === '\r' && nextChar === '\n') {
                i++;
              }
            } else {
              currentField += char;
            }
          }
          
          // Push last field and row
          if (currentField || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            if (currentRow.some(f => f.length > 0)) {
              rows.push(currentRow);
            }
          }
          
          return rows;
        };
        
        const allRows = parseCSV(input.csvData);
        if (allRows.length < 2) {
          throw new Error('CSV file is empty or invalid');
        }
        
        const headers = allRows[0];
        const rows = allRows.slice(1);
        
        const results = {
          imported: 0,
          skipped: 0,
          errors: [] as string[],
        };
        
        for (let i = 0; i < rows.length; i++) {
          try {
            const values = rows[i]; // Already parsed by parseCSV
            const row: Record<string, string> = {};
            headers.forEach((header, idx) => {
              row[header] = values[idx] || '';
            });
            
            // Validate required fields
            let isbn = row['ISBN'] || row['isbn13'] || row['ISBN13'];
            if (!isbn) {
              results.errors.push(`Row ${i + 2}: Missing ISBN`);
              results.skipped++;
              continue;
            }
            
            // Strip leading quotes/apostrophes that Excel adds
            isbn = isbn.replace(/^['"`]+/, '').replace(/['"`]+$/, '').trim();
            
            // Validate ISBN length (should be 13 characters)
            if (isbn.length > 13) {
              results.errors.push(`Row ${i + 2}: ISBN too long (${isbn.length} chars): ${isbn}`);
              results.skipped++;
              continue;
            }
            
            // Parse new fields with NaN handling
            const pagesStr = row['Páginas'] || row['Pages'] || row['pages'] || '';
            const pages = pagesStr && !isNaN(parseInt(pagesStr)) ? parseInt(pagesStr) : undefined;
            
            const editionRaw = row['Edición'] || row['Edition'] || row['edition'] || '';
            const edition = editionRaw && editionRaw.trim() !== '' ? editionRaw.trim() : undefined;
            
            const languageRaw = row['Idioma'] || row['Language'] || row['language'] || '';
            // Ensure language is 2 characters (e.g., "ES", "EN")
            const language = languageRaw && languageRaw.trim() !== '' ? languageRaw.substring(0, 2).toUpperCase() : undefined;
            
            // Use Disponible if present (from exported CSV), otherwise fall back to Cantidad (old format)
            const disponibleStr = row['Disponible'] || row['Available'] || row['available'] || '';
            const cantidadStr = row['Cantidad'] || row['Quantity'] || row['quantity'] || '0';
            
            // Prioritize Disponible to prevent duplication when re-importing exported CSV
            const quantityStr = disponibleStr || cantidadStr;
            const quantity = quantityStr && !isNaN(parseInt(quantityStr)) ? parseInt(quantityStr) : 0;
            
            const locationCode = row['Ubicación'] || row['Ubicacion'] || row['Location'] || row['location'] || undefined;
            
            // Parse price (listingPrice) with proper decimal handling
            const priceStr = row['Precio'] || row['Price'] || row['price'] || row['listingPrice'] || '';
            const listingPrice = priceStr && !isNaN(parseFloat(priceStr)) && parseFloat(priceStr) > 0 ? parseFloat(priceStr) : undefined;
            
            // Parse publication year with NaN handling
            const yearStr = row['Año'] || row['publicationYear'] || row['PublicationYear'] || '';
            const publicationYear = yearStr && !isNaN(parseInt(yearStr)) && parseInt(yearStr) > 0 ? parseInt(yearStr) : undefined;
            
            // Parse other fields with proper null handling
            const title = (row['Titulo'] || row['Título'] || row['Title'] || row['title'] || '').trim() || 'Unknown Title';
            const author = (row['Autor'] || row['Author'] || row['author'] || '').trim() || 'Unknown Author';
            const publisher = (row['Editorial'] || row['Publisher'] || row['publisher'] || '').trim() || undefined;
            const synopsis = (row['Sinopsis'] || row['Synopsis'] || row['synopsis'] || '').trim() || undefined;
            const categoryLevel1 = (row['Categoría'] || row['Category'] || row['categoryLevel1'] || '').trim() || undefined;
            
            // Upsert catalog master - only include defined fields
            const catalogData: any = {
              isbn13: isbn,
              title,
              author,
            };
            
            // Only add optional fields if they have values
            if (publisher !== undefined) catalogData.publisher = publisher;
            if (publicationYear !== undefined) catalogData.publicationYear = publicationYear;
            if (language !== undefined) catalogData.language = language;
            if (pages !== undefined) catalogData.pages = pages;
            if (edition !== undefined) catalogData.edition = edition;
            if (synopsis !== undefined) catalogData.synopsis = synopsis;
            if (categoryLevel1 !== undefined) catalogData.categoryLevel1 = categoryLevel1;
            
            await upsertCatalogMaster(catalogData);
            
            // If quantity is provided, create inventory items
            if (quantity > 0) {
              for (let j = 0; j < quantity; j++) {
                const itemData: any = {
                  isbn13: isbn,
                  conditionGrade: 'BUENO', // Default condition
                  status: 'AVAILABLE',
                };
                if (locationCode) {
                  itemData.locationCode = locationCode;
                }
                if (listingPrice !== undefined) {
                  itemData.listingPrice = listingPrice.toFixed(2);
                }
                await createInventoryItem(itemData);
              }
            }
            
            results.imported++;
          } catch (error: any) {
            results.errors.push(`Row ${i + 2}: ${error.message}`);
            results.skipped++;
          }
        }
        
        return results;
      }),
    
    // Import sales channels from CSV
    importSalesChannelsFromCsv: protectedProcedure
      .input(z.object({
        csvData: z.string(),
      }))
      .mutation(async ({ input }) => {
        const lines = input.csvData.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          throw new Error('CSV file is empty or invalid');
        }
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const rows = lines.slice(1);
        
        const results = {
          updated: 0,
          skipped: 0,
          errors: [] as string[],
        };
        
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        
        for (let i = 0; i < rows.length; i++) {
          try {
            const values = rows[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const row: Record<string, string> = {};
            headers.forEach((header, idx) => {
              row[header] = values[idx] || '';
            });
            
            // Validate required fields
            if (!row['UUID']) {
              results.errors.push(`Row ${i + 2}: Missing UUID`);
              results.skipped++;
              continue;
            }
            
            // Parse sales channels (comma-separated)
            const channelsStr = row['Canales'] || row['Channels'] || '';
            const channels = channelsStr
              .split(';')
              .map(c => c.trim())
              .filter(c => c.length > 0);
            
            // Update inventory item
            await db
              .update(inventoryItems)
              .set({ salesChannels: JSON.stringify(channels) })
              .where(eq(inventoryItems.uuid, row['UUID']));
            
            results.updated++;
          } catch (error: any) {
            results.errors.push(`Row ${i + 2}: ${error.message}`);
            results.skipped++;
          }
        }
        
        return results;
      }),
    
    // Export inventory to CSV (Strict Schema)
    exportToCsv: protectedProcedure
      .input(z.object({
        filters: z.object({
          searchText: z.string().optional(),
          publisher: z.string().optional(),
          author: z.string().optional(),
          yearFrom: z.number().optional(),
          yearTo: z.number().optional(),
          createdFrom: z.date().optional(),
          createdTo: z.date().optional(),
        }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 1. Fetch Data (grouped by ISBN like the UI)
        const { items } = await searchInventory({
          ...input.filters,
          dateFrom: input.filters?.createdFrom,
          dateTo: input.filters?.createdTo,
          limit: 10000, 
        });
        
        // 2. Group items by ISBN and calculate total quantity + available quantity + average price
        const groupedByIsbn = new Map<string, {
          book: typeof items[0]['book'],
          totalQuantity: number,
          availableQuantity: number,
          locations: string[],
          prices: number[]
        }>();
        
        for (const { item, book } of items) {
          const isbn = item.isbn13;
          if (!groupedByIsbn.has(isbn)) {
            groupedByIsbn.set(isbn, {
              book,
              totalQuantity: 0,
              availableQuantity: 0,
              locations: [],
              prices: []
            });
          }
          const group = groupedByIsbn.get(isbn)!;
          group.totalQuantity += 1;
          
          // Count only AVAILABLE items for disponible quantity
          if (item.status === 'AVAILABLE') {
            group.availableQuantity += 1;
          }
          
          if (item.locationCode) {
            group.locations.push(item.locationCode);
          }
          // Safely parse price with validation
          if (item.listingPrice) {
            const priceNum = Number(item.listingPrice);
            if (!isNaN(priceNum) && isFinite(priceNum) && priceNum >= 0) {
              group.prices.push(priceNum);
            }
          }
        }
        
        // 3. Define Exact Headers (Order Matters)
        const headers = [
          'ISBN',
          'Título',
          'Autor',
          'Editorial',
          'Año',
          'Categoría',
          'Sinopsis',
          'Páginas',
          'Edición',
          'Idioma',
          'Cantidad',
          'Disponible',
          'Ubicación',
          'Precio'
        ];

        // 4. Map Data to Rows (one row per ISBN with total quantity, available quantity, and average price)
        const rows = Array.from(groupedByIsbn.entries()).map(([isbn, { book, totalQuantity, availableQuantity, locations, prices }]) => {
          // Sanitize synopsis (remove newlines to prevent broken CSVs)
          const cleanSynopsis = (book?.synopsis || '').replace(/(\r\n|\n|\r)/gm, " ").substring(0, 800);
          
          // Combine all unique locations
          const uniqueLocations = Array.from(new Set(locations)).sort().join('; ');
          
          // Calculate average price with error handling
          let avgPrice = '';
          try {
            if (prices.length > 0) {
              const sum = prices.reduce((acc, p) => acc + p, 0);
              const avg = sum / prices.length;
              if (!isNaN(avg) && isFinite(avg)) {
                avgPrice = avg.toFixed(2);
              }
            }
          } catch (error) {
            // If calculation fails, leave price empty
            avgPrice = '';
          }

          return [
            `'${isbn}`,                     // ISBN (quoted to prevent scientific notation)
            book?.title || 'Sin Título',
            book?.author || 'Desconocido',
            book?.publisher || '',
            book?.publicationYear || '',
            book?.categoryLevel1 || 'OTROS',
            cleanSynopsis,
            book?.pages || '',
            book?.edition || '',
            book?.language || '',
            String(totalQuantity),          // Total quantity (sum of all copies ever cataloged)
            String(availableQuantity),      // Available quantity (only AVAILABLE status)
            uniqueLocations,                // All locations separated by semicolon
            avgPrice                        // Average listing price
          ];
        });
        
        // 5. Generate CSV String
        const csvContent = [
          headers.join(','), 
          ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        // 6. Log export to audit trail
        const withPrice = Array.from(groupedByIsbn.values()).filter(g => g.prices.length > 0).length;
        const withISBN = groupedByIsbn.size;
        
        await logExport({
          platform: 'general',
          itemCount: groupedByIsbn.size,
          withPrice,
          withISBN,
          filters: input.filters,
          status: 'success',
          userId: ctx.user?.id,
          userName: ctx.user?.name || undefined,
        });
        
        return { csv: csvContent };
      }),

    // Export inventory to Iberlibro/AbeBooks TSV format
    exportToIberlibro: protectedProcedure
      .input(z.object({
        filters: z.object({
          searchTerm: z.string().optional(),
          publisher: z.string().optional(),
          author: z.string().optional(),
          locationCode: z.string().optional(),
          yearFrom: z.number().optional(),
          yearTo: z.number().optional(),
          createdFrom: z.date().optional(),
          createdTo: z.date().optional(),
        }).optional(),
        shippingTemplateId: z.string().optional().default('ST-00001'),
      }))
      .mutation(async ({ input, ctx }) => {
        // 1. Fetch inventory items with filters, excluding books already on Iberlibro
        const result = await searchInventory({
          ...input.filters,
          dateFrom: input.filters?.createdFrom,
          dateTo: input.filters?.createdTo,
          limit: 10000,
          excludeSalesChannel: 'Iberlibro',
        });
        const items = result.items;
        
        // Count total available items (for comparison)
        const totalResult = await searchInventory({
          ...input.filters,
          limit: 10000,
        });
        const totalAvailable = totalResult.items.length;
        const excludedCount = totalAvailable - items.length;

        // 2. Helper functions for normalization

        // Condition descriptions for Al Alimón format
        const conditionDescriptions: Record<string, string> = {
          'NUEVO': 'NUEVO. Ejemplar que mantiene el aspecto y funcionalidad de un ejemplar nuevo. Muestra signos mínimos de manipulación externa. Ejemplar apto para quienes buscan la mejor calidad sin pagar precio de nuevo.',
          'COMO_NUEVO': 'COMO NUEVO. Ejemplar que mantiene el aspecto y funcionalidad de un ejemplar nuevo. Muestra signos mínimos de manipulación externa. Ejemplar apto para quienes buscan la mejor calidad sin pagar precio de nuevo.',
          'BUENO': 'BUENO. Presenta el desgaste normal de un libro leído, con posibles marcas ligeras, pero páginas limpias y encuadernación sólida, asegurando una lectura cómoda y satisfactoria.',
          'ACEPTABLE': 'ACEPTABLE. Presenta el desgaste normal de un libro leído, con posibles marcas ligeras, pero páginas limpias y encuadernación sólida, asegurando una lectura cómoda y satisfactoria.',
          'DEFECTUOSO': 'DEFECTUOSO. Presenta señales visibles de uso como subrayados, anotaciones o desperfectos en portada/contraportada, pero sigue siendo completamente legible.'
        };

        // Build description with Al Alimón mission prefix and condition suffix
        const buildDescription = (book: any, condition: string | null): string => {
          const prefix = 'Descripción: Este libro tiene una doble misión: inspirarte a ti y dar una oportunidad a un estudiante. Gracias por cumplirla Al Alimón. SINOPSIS: ';
          const synopsis = book?.synopsis ? book.synopsis.replace(/[\r\n]+/g, ' ').substring(0, 800) : '';
          const statusPrefix = 'Status del libro: ';
          const conditionDesc = conditionDescriptions[condition?.toUpperCase() || 'BUENO'] || conditionDescriptions['BUENO'];
          
          return `${prefix}${synopsis}${statusPrefix}${conditionDesc}`;
        };

        // Normalize language codes to ISO 639-2 (three-letter codes)
        const normalizeLanguage = (lang: string | null): string => {
          if (!lang) return 'SPA'; // Default Spanish
          const langMap: Record<string, string> = {
            'ES': 'SPA', 'SPANISH': 'SPA', 'ESPAÑOL': 'SPA', 'CASTELLANO': 'SPA',
            'EN': 'ENG', 'ENGLISH': 'ENG', 'INGLÉS': 'ENG',
            'FR': 'FRA', 'FRENCH': 'FRA', 'FRANCÉS': 'FRA',
            'DE': 'GER', 'GERMAN': 'GER', 'ALEMÁN': 'GER',
            'IT': 'ITA', 'ITALIAN': 'ITA', 'ITALIANO': 'ITA',
            'PT': 'POR', 'PORTUGUESE': 'POR', 'PORTUGUÉS': 'POR',
            'CA': 'CAT', 'CATALAN': 'CAT', 'CATALÁN': 'CAT',
            'EU': 'BAQ', 'BASQUE': 'BAQ', 'EUSKERA': 'BAQ',
            'GL': 'GLG', 'GALICIAN': 'GLG', 'GALLEGO': 'GLG',
          };
          const normalized = lang.toUpperCase().trim();
          return langMap[normalized] || (normalized.length === 3 ? normalized : 'SPA');
        };

        const normalizeCondition = (condition: string | null): string => {
          if (!condition) return 'Good';
          const c = condition.toUpperCase();
          const map: Record<string, string> = {
            'NUEVO': 'New',
            'COMO_NUEVO': 'As New',
            'BUENO': 'Good',
            'ACEPTABLE': 'Fair',
            'DEFECTUOSO': 'Poor',
          };
          return map[c] || 'Good';
        };

        const normalizeBinding = (binding: string | null): string => {
          if (!binding) return 'Paperback';
          const b = binding.toLowerCase();
          if (b.includes('hardcover') || b.includes('tapa dura') || b.includes('cartoné')) {
            return 'Hardcover';
          }
          return 'Paperback';
        };

        const escapeTSV = (value: any): string => {
          if (value === null || value === undefined) return '';
          let str = String(value);
          // Replace tabs and newlines with spaces to prevent column misalignment
          str = str.replace(/[\t\r\n]+/g, ' ');
          // Escape quotes for TSV format
          if (str.includes('"')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        };

        // 3. Define Iberlibro field headers (English)
        const headers = [
          'listingid', 'title', 'author', 'illustrator', 'price', 'quantity',
          'producttype', 'description', 'bindingtext', 'bookcondition',
          'publishername', 'placepublished', 'yearpublished', 'isbn',
          'sellercatalog1', 'sellercatalog2', 'sellercatalog3', 'abecategory',
          'keywords', 'jacketcondition', 'editiontext', 'printingtext',
          'signedtext', 'volume', 'size', 'imgurl', 'weight', 'weightunit',
          'shippingtemplateid', 'language'
        ];

        // 4. Map items to Iberlibro format (one row per inventory item)
        const rows = items.map(({ item, book }) => {
          const price = item.listingPrice ? parseFloat(item.listingPrice.toString()).toFixed(2) : '0.00';
          const isbn = item.isbn13?.replace(/[-\s]/g, '') || '';
          
          // Build description with Al Alimón format
          const description = buildDescription(book, item.conditionGrade);

          return [
            escapeTSV(item.uuid),                              // listingid (use Alexandria OS UUID)
            escapeTSV(book?.title || 'Sin Título'),            // title
            escapeTSV(book?.author || ''),                     // author
            escapeTSV(''),                                     // illustrator
            escapeTSV(price),                                  // price
            escapeTSV('1'),                                    // quantity (1 per item)
            escapeTSV('Book'),                                 // producttype
            escapeTSV(description),                            // description
            escapeTSV(normalizeBinding(null)), // bindingtext (no binding field in schema)
            escapeTSV(normalizeCondition(item.conditionGrade)),     // bookcondition
            escapeTSV(book?.publisher || ''),                  // publishername
            escapeTSV(''),                                     // placepublished
            escapeTSV(book?.publicationYear || ''),            // yearpublished
            escapeTSV(isbn),                                   // isbn
            escapeTSV(book?.categoryLevel1 || ''),             // sellercatalog1
            escapeTSV(''),                                     // sellercatalog2
            escapeTSV(''),                                     // sellercatalog3
            escapeTSV(''),                                     // abecategory
            escapeTSV(''),                                     // keywords
            escapeTSV(''),                                     // jacketcondition
            escapeTSV(book?.edition || ''),                    // editiontext
            escapeTSV(''),                                     // printingtext
            escapeTSV(''),                                     // signedtext
            escapeTSV(''),                                     // volume
            escapeTSV(''),                                     // size
            escapeTSV(book?.coverImageUrl || ''),              // imgurl
            escapeTSV(''),                                     // weight
            escapeTSV(''),                                     // weightunit
            escapeTSV(input.shippingTemplateId || 'ST-00001'), // shippingtemplateid
            escapeTSV(normalizeLanguage(book?.language || null)), // language
          ];
        });

        // 5. Generate TSV content
        const tsvContent = [
          headers.join('\t'),
          ...rows.map(row => row.join('\t'))
        ].join('\n');

        const stats = {
          totalItems: items.length,
          withPrice: items.filter(({ item }) => item.listingPrice && parseFloat(String(item.listingPrice)) > 0).length,
          withISBN: items.filter(({ item }) => item.isbn13).length,
          excludedCount,
          totalAvailable,
        };

        // 6. Log export to audit trail
        await logExport({
          platform: 'iberlibro',
          itemCount: stats.totalItems,
          withPrice: stats.withPrice,
          withISBN: stats.withISBN,
          filters: input.filters,
          status: 'success',
          userId: ctx.user?.id,
          userName: ctx.user?.name || undefined,
        });

        return { 
          tsv: tsvContent,
          stats,
          message: `Exported ${items.length} books (excluded ${excludedCount} already on Iberlibro)`
        };
      }),

    // Export inventory to Todocolección CSV format
    exportToTodocoleccion: protectedProcedure
      .input(z.object({
        filters: z.object({
          searchTerm: z.string().optional(),
          publisher: z.string().optional(),
          author: z.string().optional(),
          locationCode: z.string().optional(),
          yearFrom: z.number().optional(),
          yearTo: z.number().optional(),
          createdFrom: z.date().optional(),
          createdTo: z.date().optional(),
        }).optional(),
      }))
      .mutation(async ({ input }) => {
        // 1. Fetch inventory items with filters
        const result = await searchInventory({
          ...input.filters,
          dateFrom: input.filters?.createdFrom,
          dateTo: input.filters?.createdTo,
          limit: 10000,
        });
        const items = result.items;

        // 2. Helper functions for Todocolección
        const normalizeConditionToTC = (condition: string | null): string => {
          if (!condition) return '4'; // Default to "Bueno"
          const c = condition.toUpperCase();
          const map: Record<string, string> = {
            'NUEVO': '5',
            'COMO_NUEVO': '5',
            'BUENO': '4',
            'ACEPTABLE': '3',
            'DEFECTUOSO': '1',
          };
          return map[c] || '4';
        };

        const escapeCSV = (value: any): string => {
          if (value === null || value === undefined) return '';
          const str = String(value);
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        };

        // 3. Define Todocolección field headers (Spanish)
        const headers = [
          'referencia',      // Unique reference (UUID)
          'título',          // Title
          'precio',          // Price in euros
          'descripción',     // Description
          'sección',         // Category/Section
          'stock',           // Quantity
          'estado',          // Condition (1-5)
          'autor',           // Author
          'editorial',       // Publisher
          'año',             // Publication year
          'imagen_1',        // Cover image URL
        ];

        // 4. Map items to Todocolección format (one row per inventory item)
        const rows = items.map(({ item, book }) => {
          const price = item.listingPrice ? parseFloat(item.listingPrice.toString()).toFixed(2) : '0.00';
          
          // Build description (max 1000 chars recommended)
          const description = book?.synopsis 
            ? book.synopsis.substring(0, 1000)
            : book?.title || 'Sin descripción';

          // Map category to section (use categoryLevel1 or default to "Libros")
          const section = book?.categoryLevel1 || 'Libros';

          return [
            escapeCSV(item.uuid),                              // referencia (UUID)
            escapeCSV(book?.title || 'Sin Título'),            // título
            escapeCSV(price),                                  // precio
            escapeCSV(description),                            // descripción
            escapeCSV(section),                                // sección
            escapeCSV('1'),                                    // stock (1 per item)
            escapeCSV(normalizeConditionToTC(item.conditionGrade)), // estado (1-5)
            escapeCSV(book?.author || ''),                     // autor
            escapeCSV(book?.publisher || ''),                  // editorial
            escapeCSV(book?.publicationYear || ''),            // año
            escapeCSV(book?.coverImageUrl || ''),              // imagen_1
          ];
        });

        // 5. Generate CSV content
        const csvContent = [
          headers.join(','),
          ...rows.map(row => row.join(','))
        ].join('\n');

        return { 
          csv: csvContent,
          stats: {
            totalItems: items.length,
            withPrice: items.filter(({ item }) => item.listingPrice && parseFloat(String(item.listingPrice)) > 0).length,
            withImages: items.filter(({ book }) => book?.coverImageUrl).length,
          }
        };
      }),

    // ============================================================================
    // CASA DEL LIBRO EXPORT
    // ============================================================================
    exportToCasaDelLibro: protectedProcedure
      .input(z.object({
        filters: z.object({
          searchTerm: z.string().optional(),
          publisher: z.string().optional(),
          author: z.string().optional(),
          locationCode: z.string().optional(),
          yearFrom: z.number().optional(),
          yearTo: z.number().optional(),
          createdFrom: z.date().optional(),
          createdTo: z.date().optional(),
        }).optional(),
      }))
      .mutation(async ({ input }) => {
        // 1. Fetch inventory items with filters
        const result = await searchInventory({
          ...input.filters,
          dateFrom: input.filters?.createdFrom,
          dateTo: input.filters?.createdTo,
          limit: 10000,
        });
        const items = result.items;

        // 2. Load Materia code mappings from JSON
        const materiaData = await import('../shared/materia_mapping.json');
        const materiaMappings = materiaData.mappings as Array<{
          nivel1: string;
          nivel2: string;
          nivel3: string;
          materia: number;
        }>;

        // 3. Build lookup map for fast access
        const materiaMap = new Map<string, number>();
        for (const mapping of materiaMappings) {
          const key = `${mapping.nivel1}|${mapping.nivel2}|${mapping.nivel3}`;
          materiaMap.set(key, mapping.materia);
        }

        // 4. Helper function to lookup Materia code
        const lookupMateriaCode = (book: typeof items[0]['book']): string => {
          if (!book) return '';
          
          const nivel1 = book.categoryLevel1 || '';
          const nivel2 = book.categoryLevel2 || '';
          const nivel3 = book.categoryLevel3 || '';
          
          // Try exact match (nivel1|nivel2|nivel3)
          let key = `${nivel1}|${nivel2}|${nivel3}`;
          let materia = materiaMap.get(key);
          if (materia) return String(materia);
          
          // Try nivel1|nivel2 (empty nivel3)
          if (nivel2) {
            key = `${nivel1}|${nivel2}|`;
            materia = materiaMap.get(key);
            if (materia) return String(materia);
          }
          
          // Try nivel1 only (empty nivel2 and nivel3)
          if (nivel1) {
            key = `${nivel1}||`;
            materia = materiaMap.get(key);
            if (materia) return String(materia);
          }
          
          return ''; // No match found
        };

        // 5. Normalize condition to Casa del Libro scale (5-11)
        const normalizeConditionToCDL = (condition: string | null): string => {
          if (!condition) return '10'; // Default to "Bueno"
          const c = condition.toUpperCase();
          const map: Record<string, string> = {
            'NUEVO': '11',
            'COMO_NUEVO': '11',
            'BUENO': '10',
            'ACEPTABLE': '8',
            'DEFECTUOSO': '5',
          };
          return map[c] || '10';
        };

        // 6. CSV escape function (semicolon separator)
        const escapeCSV = (value: any): string => {
          if (value === null || value === undefined) return '';
          const str = String(value);
          if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        };

        // 7. Define Casa del Libro field headers (English)
        const headers = [
          'Category', 'ean13', 'EAN13', 'IdProductoTienda', 'resumen', 'Resumen',
          'Titulo', 'Año', 'Autor1', 'Editorial', 'sku', 'product-id',
          'product-id-type', 'description', 'internal-description', 'price',
          'price-additional-info', 'quantity', 'min-quantity-alert', 'state',
          'available-start-date', 'available-end-date', 'logistic-class',
          'discount-price', 'discount-start-date', 'discount-end-date', 'update-delete'
        ];

        // 8. Map items to Casa del Libro format (one row per inventory item)
        const rows = items.map(({ item, book }) => {
          const price = item.listingPrice ? parseFloat(item.listingPrice.toString()).toFixed(2) : '0.00';
          const isbn = item.isbn13?.replace(/[-\s]/g, '') || '';
          const description = book?.synopsis 
            ? book.synopsis.substring(0, 1000)
            : book?.title || 'Sin descripción';
          const materiaCode = lookupMateriaCode(book);

          return [
            escapeCSV(materiaCode),                            // Category (numeric Materia code)
            escapeCSV(isbn),                                   // ean13
            escapeCSV(isbn),                                   // EAN13
            escapeCSV(item.uuid),                              // IdProductoTienda
            escapeCSV(description),                            // resumen
            escapeCSV(description),                            // Resumen
            escapeCSV(book?.title || 'Sin Título'),            // Titulo
            escapeCSV(book?.publicationYear || ''),            // Año
            escapeCSV(book?.author || ''),                     // Autor1
            escapeCSV(book?.publisher || ''),                  // Editorial
            escapeCSV(item.uuid),                              // sku
            escapeCSV(item.uuid),                              // product-id
            escapeCSV('SHOP_SKU'),                             // product-id-type
            escapeCSV(description),                            // description
            escapeCSV(item.conditionNotes || ''),              // internal-description
            escapeCSV(price),                                  // price
            escapeCSV('Precio con impuestos incluidos'),       // price-additional-info
            escapeCSV('1'),                                    // quantity (1 per item)
            escapeCSV(''),                                     // min-quantity-alert
            escapeCSV(normalizeConditionToCDL(item.conditionGrade)), // state
            escapeCSV(''),                                     // available-start-date
            escapeCSV(''),                                     // available-end-date
            escapeCSV(''),                                     // logistic-class
            escapeCSV(''),                                     // discount-price
            escapeCSV(''),                                     // discount-start-date
            escapeCSV(''),                                     // discount-end-date
            escapeCSV('ACTUALIZACIÓN'),                        // update-delete
          ];
        });

        // 9. Generate CSV content with semicolon separator
        const csvContent = [
          headers.join(';'),
          ...rows.map(row => row.join(';'))
        ].join('\n');

        // 10. Calculate statistics
        const withMateriaCode = items.filter(({ book }) => lookupMateriaCode(book) !== '').length;

        return { 
          csv: csvContent,
          stats: {
            totalItems: items.length,
            withPrice: items.filter(({ item }) => item.listingPrice && parseFloat(String(item.listingPrice)) > 0).length,
            withISBN: items.filter(({ item }) => item.isbn13).length,
            withMateriaCode: withMateriaCode,
          }
        };
      }),

    // ============================================================================
    // EBAY FILE EXCHANGE EXPORT
    // ============================================================================
    exportToEbay: protectedProcedure
      .input(z.object({
        filters: z.object({
          searchTerm: z.string().optional(),
          publisher: z.string().optional(),
          author: z.string().optional(),
          yearFrom: z.number().optional(),
          yearTo: z.number().optional(),
          createdFrom: z.date().optional(),
          createdTo: z.date().optional(),
        }).optional(),
      }))
      .mutation(async ({ input }) => {
        // 1. Fetch inventory items
        const items = await searchInventory({
          ...input.filters,
          dateFrom: input.filters?.createdFrom,
          dateTo: input.filters?.createdTo,
          limit: 10000,
        });

        // 2. Normalize condition to eBay standards
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

        // 3. Normalize binding/format
        const normalizeFormat = (format: string | null | undefined): string => {
          if (!format) return 'Paperback';
          const f = format.toLowerCase();
          if (f.includes('dura') || f.includes('hard')) return 'Hardcover';
          if (f.includes('blanda') || f.includes('paper')) return 'Paperback';
          return 'Paperback';
        };

        // 4. Truncate title to 80 characters smartly
        const truncateTitle = (title: string, author: string | null | undefined, format: string | null | undefined): string => {
          // Format: "Author - Title - Format" within 80 chars
          const authorPart = author ? `${author.substring(0, 30)} - ` : '';
          const formatPart = format ? ` - ${normalizeFormat(format)}` : '';
          const availableForTitle = 80 - authorPart.length - formatPart.length;
          
          let titlePart = title;
          if (titlePart.length > availableForTitle) {
            titlePart = titlePart.substring(0, availableForTitle - 3) + '...';
          }
          
          return (authorPart + titlePart + formatPart).substring(0, 80);
        };

        // 5. CSV escape function (comma separator)
        const escapeCSV = (value: any): string => {
          if (value === null || value === undefined) return '';
          const str = String(value);
          if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        };

        // 6. Define CSV headers (eBay File Exchange format)
        const headers = [
          'Action',           // Add, Revise, Delete
          'CustomLabel',      // SKU (our UUID)
          'Title',            // 80 char max
          'Description',      // Product description
          'CategoryID',       // 267 for Books
          'Condition',        // Brand New, Like New, Very Good, Good, Acceptable
          'ConditionDescription', // Condition notes
          'Format',           // FixedPrice
          'Duration',         // GTC (Good 'Til Cancelled)
          'StartPrice',       // Buy It Now price
          'Quantity',         // Always 1 for used books
          'C:ISBN',           // ISBN item specific
          'C:Author',         // Author item specific
          'C:Publisher',      // Publisher item specific
          'C:Publication Year', // Year item specific
          'C:Language',       // Language item specific
          'C:Format',         // Hardcover/Paperback item specific
          'C:Number of Pages', // Pages item specific
          'Location',         // Item location (city)
        ];

        // 7. Map inventory items to eBay CSV rows
        const rows = items.items.map(({ item, book }) => {
          // Null safety: provide defaults if book is null
          const bookTitle = book?.title || 'Untitled';
          const bookAuthor = book?.author || null;
          const bookSynopsis = book?.synopsis || null;
          const bookPublisher = book?.publisher || null;
          const bookYear = book?.publicationYear || null;
          const bookLanguage = book?.language || 'ES';
          const bookPages = book?.pages || null;

          const title = truncateTitle(bookTitle, bookAuthor, null);

          const description = bookSynopsis
            ? bookSynopsis.substring(0, 1000) // Limit to 1000 chars for performance
            : `${bookTitle} by ${bookAuthor || 'Unknown Author'}`;

          const condition = normalizeConditionToEbay(item.conditionGrade);
          const conditionNotes = item.conditionNotes || '';
          const price = item.listingPrice ? parseFloat(String(item.listingPrice)).toFixed(2) : '';
          const isbn = item.isbn13 || '';
          const language = bookLanguage === 'ES' ? 'Spanish' : 'English';
          const format = normalizeFormat(null); // Default to Paperback since schema has no binding field
          const pages = bookPages ? String(bookPages) : '';

          return [
            escapeCSV('Add'),                    // Action
            escapeCSV(item.uuid),                // CustomLabel (SKU)
            escapeCSV(title),                    // Title
            escapeCSV(description),              // Description
            escapeCSV('267'),                    // CategoryID (Books)
            escapeCSV(condition),                // Condition
            escapeCSV(conditionNotes),           // ConditionDescription
            escapeCSV('FixedPrice'),             // Format
            escapeCSV('GTC'),                    // Duration
            escapeCSV(price),                    // StartPrice
            escapeCSV('1'),                      // Quantity
            escapeCSV(isbn),                     // C:ISBN
            escapeCSV(bookAuthor || ''),         // C:Author
            escapeCSV(bookPublisher || ''),      // C:Publisher
            escapeCSV(bookYear || ''),           // C:Publication Year
            escapeCSV(language),                 // C:Language
            escapeCSV(format),                   // C:Format
            escapeCSV(pages),                    // C:Number of Pages
            escapeCSV(item.locationCode || ''),  // Location
          ];
        });

        // 8. Generate CSV content
        const csvContent = [
          headers.join(','),
          ...rows.map(row => row.join(','))
        ].join('\n');

        // 9. Calculate statistics
        return { 
          csv: csvContent,
          stats: {
            totalItems: items.items.length,
            withPrice: items.items.filter(({ item }) => item.listingPrice && parseFloat(String(item.listingPrice)) > 0).length,
            withISBN: items.items.filter(({ item }) => item.isbn13).length,
          }
        };
      }),
  }),

  // ============================================================================
  // DASHBOARD & ANALYTICS
  // ============================================================================
  dashboard: router({
    // Get main KPIs
    getKPIs: protectedProcedure.query(async () => {
      return await getDashboardKPIs();
    }),
    
    // Get sales by channel
    getSalesByChannel: protectedProcedure.query(async () => {
      return await getSalesByChannel();
    }),
    
    // Get top performing books
    getTopBooks: protectedProcedure
      .input(z.object({ limit: z.number().default(10) }))
      .query(async ({ input }) => {
        return await getTopPerformingBooks(input.limit);
      }),
    
    // Get sales transactions
    getSalesTransactions: protectedProcedure
      .input(z.object({
        channel: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }))
      .query(async ({ input }) => {
        return await getSalesTransactions(input);
      }),
    
    // Get inventory velocity (items added/sold over time)
    getInventoryVelocity: protectedProcedure
      .input(z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        groupBy: z.enum(['day', 'week', 'month']).default('day'),
      }))
      .query(async ({ input }) => {
        return await getInventoryVelocity(input);
      }),
    
    // Get analytics by author
    getAnalyticsByAuthor: protectedProcedure
      .input(z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        return await getAnalyticsByAuthor(input);
      }),
    
    // Get analytics by publisher
    getAnalyticsByPublisher: protectedProcedure
      .input(z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        return await getAnalyticsByPublisher(input);
      }),
    
    // Get analytics by category
    getAnalyticsByCategory: protectedProcedure
      .input(z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }))
      .query(async ({ input }) => {
        return await getAnalyticsByCategory(input);
      }),
    
    // Get analytics by location
    getAnalyticsByLocation: protectedProcedure
      .input(z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }))
      .query(async ({ input }) => {
        return await getAnalyticsByLocation(input);
      }),
  }),

  // ============================================================================
  // SYSTEM SETTINGS
  // ============================================================================
  settings: router({
    // Get all settings
    getAll: protectedProcedure.query(async () => {
      return await getAllSystemSettings();
    }),
    
    // Get single setting
    get: protectedProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ input }) => {
        return await getSystemSetting(input.key);
      }),
    
    // Update setting
    update: protectedProcedure
      .input(z.object({
        key: z.string(),
        value: z.string(),
      }))
      .mutation(async ({ input }) => {
        await updateSystemSetting(input.key, input.value);
        return { success: true };
      }),
    
    // Validate ISBNDB API key
    validateIsbndbKey: protectedProcedure
      .input(z.object({ apiKey: z.string() }))
      .mutation(async ({ input }) => {
        const { validateISBNDBApiKey } = await import('./isbndbIntegration');
        const isValid = await validateISBNDBApiKey(input.apiKey);
        return { valid: isValid };
      }),
  }),

  // ============================================================================
  // SALES
  // ============================================================================
  sales: router({
    // Record a sale
    recordSale: protectedProcedure
      .input(z.object({
        isbn13: z.string(),
        channel: z.string(),
        salePrice: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        // Find an available item for this ISBN
        const availableItems = await db
          .select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.isbn13, input.isbn13),
              eq(inventoryItems.status, 'AVAILABLE')
            )
          )
          .limit(1);

        if (availableItems.length === 0) {
          throw new Error('No available items found for this ISBN');
        }

        const item = availableItems[0];
        const listingPrice = item.listingPrice ? parseFloat(item.listingPrice.toString()) : 0;
        const costOfGoods = item.costOfGoods ? parseFloat(item.costOfGoods.toString()) : 0;
        
        // Calculate days in inventory
        const daysInInventory = Math.floor(
          (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Calculate platform fees (simplified - you can enhance this)
        const platformFees = input.salePrice * 0.10; // 10% commission
        const shippingCost = 3.00; // Fixed shipping cost
        const grossProfit = input.salePrice - costOfGoods;
        const netProfit = grossProfit - platformFees - shippingCost;

        // Create sales transaction
        await db.insert(salesTransactions).values({
          itemUuid: item.uuid,
          isbn13: input.isbn13,
          channel: input.channel,
          saleDate: new Date(),
          listingPrice: listingPrice.toString(),
          finalSalePrice: input.salePrice.toString(),
          platformCommissionPct: '10.00',
          platformFees: platformFees.toFixed(2),
          shippingCost: shippingCost.toFixed(2),
          grossProfit: grossProfit.toFixed(2),
          netProfit: netProfit.toFixed(2),
          daysInInventory,
          createdBy: ctx.user?.id,
        });

        // Update inventory item status to SOLD
        await db
          .update(inventoryItems)
          .set({
            status: 'SOLD',
            soldAt: new Date(),
            soldChannel: input.channel,
            finalSalePrice: input.salePrice.toString(),
            platformFees: platformFees.toFixed(2),
            netProfit: netProfit.toFixed(2),
          })
          .where(eq(inventoryItems.uuid, item.uuid));

        return {
          success: true,
          transaction: {
            itemUuid: item.uuid,
            salePrice: input.salePrice,
            netProfit,
          },
        };
      }),

    // Get active sales channels from settings
    getActiveChannels: protectedProcedure
      .query(async () => {
        const setting = await getSystemSetting('ACTIVE_SALES_CHANNELS');
        if (!setting) {
          return [];
        }
        try {
          const channels = JSON.parse(setting.settingValue);
          return Array.isArray(channels) ? channels : [];
        } catch {
          return [];
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
