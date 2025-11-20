import { drizzle } from 'drizzle-orm/mysql2';
import { catalogMasters, inventoryItems } from '../drizzle/schema.ts';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { randomUUID } from 'crypto';

const db = drizzle(process.env.DATABASE_URL);

// ============================================================================
// DATA VALIDATION UTILITIES (NO SYNTHETIC DATA)
// ============================================================================

/**
 * Validate ISBN-13 checksum
 * Returns true if valid, false otherwise
 */
function validateISBN13(isbn) {
  if (!isbn || isbn.length !== 13) return false;
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(isbn[i]);
    if (isNaN(digit)) return false;
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(isbn[12]);
}

/**
 * Validate ISBN-10 checksum
 */
function validateISBN10(isbn) {
  if (!isbn || isbn.length !== 10) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = parseInt(isbn[i]);
    if (isNaN(digit)) return false;
    sum += digit * (10 - i);
  }
  
  const lastChar = isbn[9];
  const checkDigit = lastChar === 'X' ? 10 : parseInt(lastChar);
  if (isNaN(checkDigit) && lastChar !== 'X') return false;
  
  sum += checkDigit;
  return sum % 11 === 0;
}

/**
 * Clean ISBN (remove hyphens, spaces, quotes)
 * Returns cleaned ISBN or null if invalid
 */
function cleanISBN(isbn) {
  if (!isbn) return null;
  const cleaned = isbn.replace(/[-\s'"]/g, '').trim();
  
  // Must be numeric (except ISBN-10 can end with X)
  if (!/^[\dX]+$/i.test(cleaned)) return null;
  
  return cleaned;
}

/**
 * Clean and validate location code
 * Format: 2 digits + 1 letter (e.g., 02A, 15C)
 * Returns cleaned location or null if invalid
 */
function cleanLocation(loc) {
  if (!loc) return null;
  
  // Remove quotes and apostrophes
  const cleaned = loc.replace(/['"]/g, '').trim();
  
  // Extract valid pattern: 2 digits + 1 letter
  const match = cleaned.match(/^'?(\d{2})([A-Z])/i);
  if (match) {
    return `${match[1]}${match[2].toUpperCase()}`;
  }
  
  // Check if already in correct format
  if (/^\d{2}[A-Z]$/i.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  
  return null; // Invalid format
}

/**
 * Normalize author name
 * Handles "Lastname, Firstname" and cleans extra characters
 */
function normalizeAuthor(author) {
  if (!author) return null;
  
  // Remove trailing semicolons, numbers, and extra whitespace
  let cleaned = author.replace(/;[\s\d.]*$/, '').trim();
  
  // Remove quotes
  cleaned = cleaned.replace(/['"]/g, '');
  
  if (cleaned.length === 0) return null;
  
  return cleaned;
}

/**
 * Clean publisher name
 */
function cleanPublisher(publisher) {
  if (!publisher) return null;
  
  let cleaned = publisher.trim();
  
  // Remove quotes
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  
  // Remove trailing commas and dates
  cleaned = cleaned.replace(/,\s*\d{4}.*$/, '');
  
  if (cleaned.length === 0) return null;
  
  return cleaned;
}

/**
 * Validate and parse year
 */
function parseYear(yearStr) {
  if (!yearStr) return null;
  
  // Extract 4-digit year
  const match = yearStr.toString().match(/\d{4}/);
  if (!match) return null;
  
  const year = parseInt(match[0]);
  const currentYear = new Date().getFullYear();
  
  // Reasonable range: 1450 (Gutenberg) to current year + 1
  if (year < 1450 || year > currentYear + 1) return null;
  
  return year;
}

/**
 * Map category from Spanish to Alexandria enum
 */
const CATEGORY_MAP = {
  'Literatura': 'LITERATURA',
  'Literatura española': 'LITERATURA',
  'Narrativa': 'LITERATURA',
  'Narrativa española': 'LITERATURA',
  'Novela': 'LITERATURA',
  'Novela contemporánea': 'LITERATURA',
  'Poesía': 'LITERATURA',
  'Teatro': 'LITERATURA',
  'Historia': 'HISTORIA',
  'Historia de España': 'HISTORIA',
  'Historia contemporánea': 'HISTORIA',
  'Historia contemporánea de España': 'HISTORIA',
  'Historia militar': 'HISTORIA',
  'Historia Económica': 'HISTORIA',
  'Arte': 'ARTE',
  'Historia del Arte': 'ARTE',
  'Ensayos': 'ENSAYO',
  'Ensayo': 'ENSAYO',
  'Filosofía': 'FILOSOFIA',
  'Ciencia': 'CIENCIA',
  'Ciencias': 'CIENCIA',
  'Biografía': 'BIOGRAFIA',
  'Biografías': 'BIOGRAFIA',
  'Infantil': 'INFANTIL',
  'Juvenil': 'JUVENIL',
  'Cómic': 'COMIC',
  'Comics': 'COMIC',
  'Religión': 'RELIGION',
  'Viajes': 'VIAJES',
  'Cocina': 'COCINA',
  'Deportes': 'DEPORTES',
  'Economía': 'ECONOMIA',
  'Derecho': 'DERECHO',
  'Psicología': 'PSICOLOGIA',
  'Medicina': 'MEDICINA',
  'Humanidades': 'OTROS'
};

function mapCategory(catalogo, categoria2, categoria3) {
  const candidates = [catalogo, categoria2, categoria3].filter(Boolean);
  
  for (const cat of candidates) {
    const mapped = CATEGORY_MAP[cat];
    if (mapped) return mapped;
  }
  
  return 'OTROS';
}

/**
 * Map condition from Spanish description to enum
 * Analyzes text to determine grade
 */
function mapCondition(estado) {
  if (!estado) return 'BUENO'; // Default
  
  const lower = estado.toLowerCase();
  
  // COMO_NUEVO: nuevo, perfecto, excelente
  if (lower.includes('nuevo') || lower.includes('perfecto') || lower.includes('excelente')) {
    return 'COMO_NUEVO';
  }
  
  // MALO: malo, deteriorado, dañado, muy usado
  if (lower.includes('malo') || lower.includes('deteriorado') || 
      lower.includes('dañado') || lower.includes('muy usado')) {
    return 'MALO';
  }
  
  // ACEPTABLE: aceptable, usado, señales de uso, marcas
  if (lower.includes('aceptable') || lower.includes('usado') || 
      lower.includes('señales de uso') || lower.includes('marcas')) {
    return 'ACEPTABLE';
  }
  
  // BUENO: buen estado, muy buen estado, limpio
  if (lower.includes('buen') || lower.includes('limpio')) {
    return 'BUENO';
  }
  
  return 'BUENO'; // Default
}

/**
 * Parse date safely
 */
function parseDate(dateStr) {
  if (!dateStr) return new Date();
  
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch (e) {
    // Fall through
  }
  
  return new Date();
}

// ============================================================================
// MIGRATION LOGIC
// ============================================================================

async function migrateData() {
  console.log('🚀 Starting enhanced data migration (no synthetic data)...\n');
  
  const csvPath = '/home/ubuntu/upload/BBDD_CATALOGO_AL_ALIMON-Current_Data(2).csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  
  console.log(`📚 Found ${records.length} records in CSV\n`);
  
  const stats = {
    totalRecords: records.length,
    catalogMastersCreated: 0,
    catalogMastersSkipped: 0,
    inventoryItemsCreated: 0,
    inventoryItemsSkipped: 0,
    validationFailures: {
      noISBN: 0,
      invalidISBN: 0,
      noTitle: 0,
      noAuthor: 0,
      invalidLocation: 0,
      duplicateUUID: 0
    },
    errors: []
  };
  
  const processedISBNs = new Set();
  const usedUUIDs = new Set();
  
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // CSV row number (1-indexed + header)
    
    try {
      // ===== STEP 1: ISBN VALIDATION =====
      const isbn13 = cleanISBN(row.ISBN_13);
      const isbn10 = cleanISBN(row.ISBN_10);
      
      // Skip if no ISBN at all
      if (!isbn13 && !isbn10) {
        stats.catalogMastersSkipped++;
        stats.inventoryItemsSkipped++;
        stats.validationFailures.noISBN++;
        stats.errors.push({
          row: rowNum,
          uuid: row.UUID,
          error: 'No valid ISBN found'
        });
        continue;
      }
      
      // Prefer ISBN-13, validate if available
      let primaryISBN = isbn13;
      if (isbn13) {
        if (!validateISBN13(isbn13)) {
          // ISBN-13 invalid, try ISBN-10
          if (isbn10 && validateISBN10(isbn10)) {
            primaryISBN = isbn10;
          } else {
            stats.catalogMastersSkipped++;
            stats.inventoryItemsSkipped++;
            stats.validationFailures.invalidISBN++;
            stats.errors.push({
              row: rowNum,
              uuid: row.UUID,
              error: `Invalid ISBN checksum: ${isbn13}`
            });
            continue;
          }
        }
      } else {
        // Only ISBN-10 available
        primaryISBN = isbn10;
        if (!validateISBN10(isbn10)) {
          stats.catalogMastersSkipped++;
          stats.inventoryItemsSkipped++;
          stats.validationFailures.invalidISBN++;
          stats.errors.push({
            row: rowNum,
            uuid: row.UUID,
            error: `Invalid ISBN-10 checksum: ${isbn10}`
          });
          continue;
        }
      }
      
      // ===== STEP 2: REQUIRED FIELDS VALIDATION =====
      const title = row.TITULO ? row.TITULO.trim() : null;
      if (!title) {
        stats.catalogMastersSkipped++;
        stats.inventoryItemsSkipped++;
        stats.validationFailures.noTitle++;
        stats.errors.push({
          row: rowNum,
          uuid: row.UUID,
          error: 'Missing title'
        });
        continue;
      }
      
      const author = normalizeAuthor(row.AUTOR);
      if (!author) {
        stats.validationFailures.noAuthor++;
        // Don't skip, just log
      }
      
      // ===== STEP 3: CREATE/UPDATE CATALOG MASTER =====
      if (!processedISBNs.has(primaryISBN)) {
        const category = mapCategory(row.CATALOGO, row.CATEGORIA_2, row.CATEGORIA_3);
        const year = parseYear(row.ANNIO);
        const publisher = cleanPublisher(row.EDITORIAL);
        
        const catalogData = {
          isbn13: primaryISBN,
          title: title,
          author: author || 'Autor desconocido',
          publisher: publisher,
          publicationYear: year,
          language: row.IDIOMA || 'es',
          category: category,
          imageUrl: row.URL_IMAGEN || null,
          synopsis: row.SINOPSIS || null,
          marketMinPrice: '5.00',
          marketMedianPrice: '10.00',
          lastPriceCheck: new Date()
        };
        
        try {
          await db.insert(catalogMasters).values(catalogData).onDuplicateKeyUpdate({
            set: {
              title: catalogData.title,
              author: catalogData.author,
              publisher: catalogData.publisher,
              publicationYear: catalogData.publicationYear,
              imageUrl: catalogData.imageUrl,
              synopsis: catalogData.synopsis
            }
          });
          
          stats.catalogMastersCreated++;
          processedISBNs.add(primaryISBN);
        } catch (error) {
          stats.catalogMastersSkipped++;
          stats.errors.push({
            row: rowNum,
            uuid: row.UUID,
            error: `Catalog error: ${error.message}`
          });
          continue;
        }
      }
      
      // ===== STEP 4: CREATE INVENTORY ITEM =====
      const locationCode = cleanLocation(row.LOCALIZACION);
      if (row.LOCALIZACION && !locationCode) {
        stats.validationFailures.invalidLocation++;
      }
      
      const condition = mapCondition(row.ESTADO_DEL_LIBRO);
      const createdAt = parseDate(row.FECHA_CATALOGACION);
      
      // Generate UUID if original is invalid or duplicate
      let itemUuid = row.UUID && row.UUID.length > 10 ? row.UUID : randomUUID();
      if (usedUUIDs.has(itemUuid)) {
        itemUuid = randomUUID();
        stats.validationFailures.duplicateUUID++;
      }
      usedUUIDs.add(itemUuid);
      
      const inventoryData = {
        uuid: itemUuid,
        isbn13: primaryISBN,
        status: 'AVAILABLE',
        conditionGrade: condition,
        conditionNotes: row.ESTADO_DEL_LIBRO || null,
        locationCode: locationCode,
        listingPrice: '10.00',
        costOfGoods: '0.00',
        createdBy: 1,
        createdAt: createdAt
      };
      
      try {
        await db.insert(inventoryItems).values(inventoryData);
        stats.inventoryItemsCreated++;
      } catch (error) {
        stats.inventoryItemsSkipped++;
        stats.errors.push({
          row: rowNum,
          uuid: row.UUID,
          error: `Inventory error: ${error.message}`
        });
      }
      
      // Progress indicator
      if ((i + 1) % 100 === 0) {
        console.log(`📊 Progress: ${i + 1}/${records.length} (${Math.round((i + 1) / records.length * 100)}%)`);
      }
      
    } catch (error) {
      stats.errors.push({
        row: rowNum,
        uuid: row.UUID,
        error: `Unexpected: ${error.message}`
      });
    }
  }
  
  // ===== FINAL REPORT =====
  console.log('\n' + '='.repeat(70));
  console.log('📋 MIGRATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total records: ${stats.totalRecords}`);
  console.log(`\n📚 Catalog Masters:`);
  console.log(`  ✅ Created/Updated: ${stats.catalogMastersCreated}`);
  console.log(`  ⏭️  Skipped: ${stats.catalogMastersSkipped}`);
  console.log(`\n📦 Inventory Items:`);
  console.log(`  ✅ Created: ${stats.inventoryItemsCreated}`);
  console.log(`  ⏭️  Skipped: ${stats.inventoryItemsSkipped}`);
  console.log(`\n⚠️  Validation Issues:`);
  console.log(`  • No ISBN: ${stats.validationFailures.noISBN}`);
  console.log(`  • Invalid ISBN checksum: ${stats.validationFailures.invalidISBN}`);
  console.log(`  • No title: ${stats.validationFailures.noTitle}`);
  console.log(`  • No author: ${stats.validationFailures.noAuthor}`);
  console.log(`  • Invalid location: ${stats.validationFailures.invalidLocation}`);
  console.log(`  • Duplicate UUID: ${stats.validationFailures.duplicateUUID}`);
  console.log(`\n❌ Total errors: ${stats.errors.length}`);
  
  if (stats.errors.length > 0) {
    console.log('\n⚠️  Sample errors (first 20):');
    stats.errors.slice(0, 20).forEach(err => {
      console.log(`  Row ${err.row}: ${err.error}`);
    });
    
    const errorLogPath = '/home/ubuntu/alexandria-os/migration-errors-detailed.json';
    fs.writeFileSync(errorLogPath, JSON.stringify(stats.errors, null, 2));
    console.log(`\n📄 Full error log: ${errorLogPath}`);
  }
  
  // Success rate
  const successRate = ((stats.inventoryItemsCreated / stats.totalRecords) * 100).toFixed(1);
  console.log(`\n✨ Success rate: ${successRate}%`);
  console.log('='.repeat(70) + '\n');
}

migrateData().catch(error => {
  console.error('💥 Migration failed:', error);
  process.exit(1);
});
