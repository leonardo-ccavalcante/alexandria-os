import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
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
        
        return {
          found: true,
          decision,
          projectedProfit,
          marketPrice,
          estimatedFees: fees,
          reason,
          color,
          bookData,
        };
      }),
    
    // Fetch book data from external API (Google Books)
    fetchBookData: protectedProcedure
      .input(z.object({ isbn: z.string() }))
      .mutation(async ({ input }) => {
        const cleanedIsbn = input.isbn.replace(/[-\s]/g, '');
        
        // Call Google Books API
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanedIsbn}`);
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
          throw new Error('Libro no encontrado en Google Books');
        }
        
        const book = data.items[0].volumeInfo;
        
        // For MVP, use mock price data
        // In production, implement real price scraping
        const mockMinPrice = 10.00 + Math.random() * 10;
        const mockMedianPrice = mockMinPrice + 5;
        
        // Save to catalog
        const catalogData = {
          isbn13: cleanedIsbn,
          title: book.title || 'Unknown Title',
          author: book.authors?.join(', ') || 'Autor Desconocido',
          publisher: book.publisher || null,
          publicationYear: book.publishedDate ? parseInt(book.publishedDate.substring(0, 4)) : null,
          language: book.language || 'es',
          synopsis: book.description || null,
          category: 'OTROS' as const,
          coverImageUrl: book.imageLinks?.thumbnail || null,
          marketMinPrice: mockMinPrice.toFixed(2),
          marketMedianPrice: mockMedianPrice.toFixed(2),
          lastPriceCheck: new Date(),
        };
        
        await upsertCatalogMaster(catalogData);
        
        return {
          success: true,
          bookData: await getCatalogMasterByIsbn(cleanedIsbn),
        };
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
        return await getInventoryItemByUuid(input.uuid);
      }),
    
    // Update item location
    updateLocation: protectedProcedure
      .input(z.object({
        uuid: z.string(),
        locationCode: z.string().regex(/^[0-9]{2}[A-Z]$/),
      }))
      .mutation(async ({ input }) => {
        await updateInventoryItem(input.uuid, {
          locationCode: input.locationCode,
        });
        return { success: true };
      }),
    
    // Update item price
    updatePrice: protectedProcedure
      .input(z.object({
        uuid: z.string(),
        listingPrice: z.string(),
      }))
      .mutation(async ({ input }) => {
        await updateInventoryItem(input.uuid, {
          listingPrice: input.listingPrice,
        });
        return { success: true };
      }),
    
    // Update item status
    updateStatus: protectedProcedure
      .input(z.object({
        uuid: z.string(),
        status: z.enum(['INGESTION', 'AVAILABLE', 'LISTED', 'RESERVED', 'SOLD', 'REJECTED', 'DONATED', 'MISSING']),
      }))
      .mutation(async ({ input }) => {
        await updateInventoryItem(input.uuid, {
          status: input.status,
        });
        return { success: true };
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
    
    // Export inventory to CSV
    exportToCsv: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        condition: z.string().optional(),
        location: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }))
      .query(async ({ input }) => {
        const { items } = await searchInventory({
          ...input,
          limit: 10000, // Export all matching items
        });
        
        return { items };
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
  }),
});

export type AppRouter = typeof appRouter;
