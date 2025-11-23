import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import mysql from 'mysql2/promise';
import { catalogMasters, inventoryItems, InsertCatalogMaster } from "../drizzle/schema";
import { getDb } from "./db";
import { extractIsbnFromImage } from "./aiIsbnExtractor";
import { fetchExternalBookMetadata } from "./_core/externalBookApi";
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
        // Clean ISBN (remove hyphens and spaces)
        const cleanedIsbn = input.isbn.replace(/[-\s]/g, '');
        
        // Validate ISBN format
        if (!/^\d{13}$/.test(cleanedIsbn)) {
          throw new Error('ISBN inválido. Debe tener 13 dígitos numéricos.');
        }
        
        // Check if book exists in catalog
        let bookData = await getCatalogMasterByIsbn(cleanedIsbn);
        
        // If book exists, check if price data is stale (>7 days)
        if (bookData) {
          const daysSinceCheck = bookData.lastPriceCheck 
            ? Math.floor((Date.now() - bookData.lastPriceCheck.getTime()) / (1000 * 60 * 60 * 24))
            : 999;
          
          // For MVP, we'll use cached data even if stale
          // In production, implement price refresh here
        }
        
        // If book doesn't exist, return error (frontend should call fetchBookData)
        if (!bookData) {
          return {
            found: false,
            isbn: cleanedIsbn,
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
        const marketplacePrices = await getLatestMarketplacePrices(cleanedIsbn);
        
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
        };
      }),
    
    // Fetch book data from external API (Google Books)
    fetchBookData: protectedProcedure
      .input(z.object({ isbn: z.string() }))
      .mutation(async ({ input }) => {
        // 1. Fetch Extended Metadata using centralized service
        const metadata = await fetchExternalBookMetadata(input.isbn);
        
        if (!metadata.found) {
          return { 
            success: false, 
            message: "Libro no encontrado en bases de datos externas." 
          };
        }
        
        // 2. Prepare Catalog Master Object
        const isbn13 = input.isbn.replace(/[^0-9X]/gi, '');
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
    
    // Extract ISBN from book cover image using AI vision
    extractIsbnFromImage: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input }) => {
        // Convert base64 to buffer
        const buffer = Buffer.from(input.imageBase64, 'base64');
        
        // Extract ISBN using AI vision
        const result = await extractIsbnFromImage({
          buffer,
          mimeType: input.mimeType,
        });
        
        return result;
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
      }))
      .mutation(async ({ input, ctx }) => {
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
    
    // Enrich catalog master with missing metadata from external APIs
    enrichMetadata: protectedProcedure
      .input(z.object({ isbn13: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        // Get current book data
        const existing = await getCatalogMasterByIsbn(input.isbn13);
        if (!existing) throw new Error("Book not found in catalog");
        
        // Check if enrichment is needed (pages can be 0 or null)
        const needsEnrichment = !existing.publisher || !existing.pages || existing.pages === 0;
        if (!needsEnrichment) {
          return { success: true, enriched: false, message: "Book already has complete metadata" };
        }
        
        // Fetch metadata from external APIs
        const metadata = await fetchExternalBookMetadata(input.isbn13);
        if (!metadata.found) {
          return { success: false, enriched: false, message: "Metadata not found in external APIs" };
        }
        
        // Update only missing fields
        const updateData: Partial<InsertCatalogMaster> = {};
        if (!existing.publisher && metadata.publisher) updateData.publisher = metadata.publisher;
        if ((!existing.pages || existing.pages === 0) && metadata.pageCount) updateData.pages = metadata.pageCount;
        if (!existing.edition && metadata.edition) updateData.edition = metadata.edition;
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
    
    // Update catalog master (book metadata)
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
        yearFrom: z.number().optional(),
        yearTo: z.number().optional(),
        includeZeroInventory: z.boolean().default(false),
        hideWithoutLocation: z.boolean().default(false),
        hideWithoutQuantity: z.boolean().default(false),
        limit: z.number().default(50),
        offset: z.number().default(0),
        // NEW: Sort Parameters
        sortField: z.enum(['title', 'author', 'publisher', 'isbn13', 'publicationYear', 'total', 'available', 'location']).default('title'),
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
            GROUP_CONCAT(DISTINCT CASE WHEN ii.status = 'AVAILABLE' AND ii.salesChannels IS NOT NULL THEN ii.salesChannels END SEPARATOR '|') as salesChannelsRaw
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
        const lines = input.csvData.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          throw new Error('CSV file is empty or invalid');
        }
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const rows = lines.slice(1);
        
        const results = {
          imported: 0,
          skipped: 0,
          errors: [] as string[],
        };
        
        for (let i = 0; i < rows.length; i++) {
          try {
            const values = rows[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const row: Record<string, string> = {};
            headers.forEach((header, idx) => {
              row[header] = values[idx] || '';
            });
            
            // Validate required fields
            const isbn = row['ISBN'] || row['isbn13'] || row['ISBN13'];
            if (!isbn) {
              results.errors.push(`Row ${i + 2}: Missing ISBN`);
              results.skipped++;
              continue;
            }
            
            // Parse new fields
            const pagesStr = row['Páginas'] || row['Pages'] || row['pages'];
            const pages = pagesStr ? parseInt(pagesStr) : undefined;
            const edition = row['Edición'] || row['Edition'] || row['edition'] || undefined;
            const languageRaw = row['Idioma'] || row['Language'] || row['language'];
            // Ensure language is 2 characters (e.g., "ES", "EN")
            const language = languageRaw ? languageRaw.substring(0, 2).toUpperCase() : undefined;
            const quantityStr = row['Cantidad'] || row['Quantity'] || row['quantity'];
            const quantity = quantityStr ? parseInt(quantityStr) : 0;
            const locationCode = row['Ubicación'] || row['Ubicacion'] || row['Location'] || row['location'] || undefined;
            
            // Upsert catalog master
            await upsertCatalogMaster({
              isbn13: isbn,
              title: row['Título'] || row['Title'] || row['title'] || 'Unknown Title',
              author: row['Autor'] || row['Author'] || row['author'] || 'Unknown Author',
              publisher: row['Editorial'] || row['Publisher'] || row['publisher'] || undefined,
              publicationYear: row['Año'] || row['publicationYear'] ? parseInt(row['Año'] || row['publicationYear']) : undefined,
              language,
              pages,
              edition,
              synopsis: row['Sinopsis'] || row['Synopsis'] || row['synopsis'] || undefined,
              categoryLevel1: row['Categoría'] || row['Category'] || row['categoryLevel1'] || undefined,
            });
            
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
        }).optional(),
      }))
      .mutation(async ({ input }) => {
        // 1. Fetch Data
        const { items } = await searchInventory({
          ...input.filters,
          limit: 10000, 
        });
        
        // 2. Define Exact Headers (Order Matters)
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
          'Ubicación'
        ];

        // 3. Map Data to Rows
        const rows = items.map(({ item, book }) => {
          // Sanitize synopsis (remove newlines to prevent broken CSVs)
          const cleanSynopsis = (book?.synopsis || '').replace(/(\r\n|\n|\r)/gm, " ").substring(0, 800);

          return [
            `'${item.isbn13}`,             // ISBN (quoted to prevent scientific notation)
            book?.title || 'Sin Título',
            book?.author || 'Desconocido',
            book?.publisher || '',
            book?.publicationYear || '',
            book?.categoryLevel1 || 'OTROS',
            cleanSynopsis,
            book?.pages || '',
            book?.edition || '',
            book?.language || '',
            "1",                            // Quantity is always 1 for unique items
            item.locationCode || ''
          ];
        });
        
        // 4. Generate CSV String
        const csvContent = [
          headers.join(','), 
          ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        return { csv: csvContent };
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
});

export type AppRouter = typeof appRouter;
