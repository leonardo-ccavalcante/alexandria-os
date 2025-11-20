import { drizzle } from 'drizzle-orm/mysql2';
import { catalogMasters, inventoryItems } from '../drizzle/schema.ts';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { randomUUID } from 'crypto';

const db = drizzle(process.env.DATABASE_URL);

// Category mapping from old system to Alexandria categories
const CATEGORY_MAP = {
  'Literatura': 'LITERATURA',
  'Literatura española': 'LITERATURA',
  'Narrativa': 'LITERATURA',
  'Narrativa española': 'LITERATURA',
  'Novela': 'LITERATURA',
  'Poesía': 'LITERATURA',
  'Teatro': 'LITERATURA',
  'Historia': 'HISTORIA',
  'Historia de España': 'HISTORIA',
  'Historia contemporánea': 'HISTORIA',
  'Historia militar': 'HISTORIA',
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

// Condition mapping from descriptive text to enum
function mapCondition(estado) {
  if (!estado) return 'BUENO';
  
  const lower = estado.toLowerCase();
  
  if (lower.includes('nuevo') || lower.includes('perfecto') || lower.includes('excelente')) {
    return 'COMO_NUEVO';
  } else if (lower.includes('muy buen') || lower.includes('buen estado') || lower.includes('limpio')) {
    return 'BUENO';
  } else if (lower.includes('aceptable') || lower.includes('usado') || lower.includes('señales de uso')) {
    return 'ACEPTABLE';
  } else if (lower.includes('malo') || lower.includes('deteriorado') || lower.includes('dañado')) {
    return 'MALO';
  }
  
  return 'BUENO'; // Default
}

// Clean ISBN (remove hyphens, spaces, quotes)
function cleanISBN(isbn) {
  if (!isbn) return null;
  return isbn.replace(/[-\s'"]/g, '').trim();
}

// Clean location code (remove apostrophes and extra characters)
function cleanLocation(loc) {
  if (!loc) return null;
  const cleaned = loc.replace(/['"]/g, '').trim();
  
  // Validate format (should be like 02A, 15C, etc.)
  if (/^\d{2}[A-Z]$/i.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  
  // Try to extract valid pattern
  const match = cleaned.match(/(\d{2})([A-Z])/i);
  if (match) {
    return `${match[1]}${match[2].toUpperCase()}`;
  }
  
  return null;
}

// Map category
function mapCategory(catalogo, categoria2, categoria3) {
  const candidates = [catalogo, categoria2, categoria3].filter(Boolean);
  
  for (const cat of candidates) {
    const mapped = CATEGORY_MAP[cat];
    if (mapped) return mapped;
  }
  
  return 'OTROS';
}

// Parse year
function parseYear(annio) {
  if (!annio) return null;
  const year = parseInt(annio);
  if (isNaN(year) || year < 1000 || year > new Date().getFullYear()) {
    return null;
  }
  return year;
}

async function migrateData() {
  console.log('🚀 Starting data migration...\n');
  
  // Read CSV file
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
    errors: []
  };
  
  const processedISBNs = new Set();
  
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    
    try {
      // Clean ISBN
      const isbn13 = cleanISBN(row.ISBN_13);
      const isbn10 = cleanISBN(row.ISBN_10);
      
      // Skip if no ISBN at all
      if (!isbn13 && !isbn10) {
        stats.catalogMastersSkipped++;
        stats.inventoryItemsSkipped++;
        stats.errors.push({
          row: i + 2,
          uuid: row.UUID,
          error: 'Missing both ISBN-13 and ISBN-10'
        });
        continue;
      }
      
      // Use ISBN-13 if available, otherwise ISBN-10
      const primaryISBN = isbn13 || isbn10;
      
      // Skip if title is missing
      if (!row.TITULO || row.TITULO.trim() === '') {
        stats.catalogMastersSkipped++;
        stats.inventoryItemsSkipped++;
        stats.errors.push({
          row: i + 2,
          uuid: row.UUID,
          error: 'Missing title'
        });
        continue;
      }
      
      // Create or update catalog master (only once per ISBN)
      if (!processedISBNs.has(primaryISBN)) {
        const category = mapCategory(row.CATALOGO, row.CATEGORIA_2, row.CATEGORIA_3);
        const year = parseYear(row.ANNIO);
        
        const catalogData = {
          isbn13: primaryISBN,
          title: row.TITULO.trim(),
          author: row.AUTOR ? row.AUTOR.trim() : 'Autor desconocido',
          publisher: row.EDITORIAL ? row.EDITORIAL.trim() : null,
          publicationYear: year,
          language: row.IDIOMA || 'es',
          category: category,
          imageUrl: row.URL_IMAGEN || null,
          synopsis: row.SINOPSIS || null,
          // Set default market prices (will be updated by triage later)
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
            row: i + 2,
            uuid: row.UUID,
            error: `Catalog master error: ${error.message}`
          });
          continue;
        }
      }
      
      // Create inventory item
      const locationCode = cleanLocation(row.LOCALIZACION);
      const condition = mapCondition(row.ESTADO_DEL_LIBRO);
      
      // Use original UUID if valid, otherwise generate new one
      let itemUuid = row.UUID && row.UUID.length > 10 ? row.UUID : randomUUID();
      
      // Parse date safely
      let createdAt = new Date();
      if (row.FECHA_CATALOGACION) {
        try {
          const parsedDate = new Date(row.FECHA_CATALOGACION);
          if (!isNaN(parsedDate.getTime())) {
            createdAt = parsedDate;
          }
        } catch (e) {
          // Use current date if parsing fails
        }
      }
      
      const inventoryData = {
        uuid: itemUuid,
        isbn13: primaryISBN,
        status: 'AVAILABLE', // Default status
        conditionGrade: condition,
        conditionNotes: row.ESTADO_DEL_LIBRO || null,
        locationCode: locationCode,
        // Set default prices (will be updated later)
        listingPrice: '10.00',
        costOfGoods: '0.00',
        createdBy: 1, // System user
        createdAt: createdAt
      };
      
      try {
        await db.insert(inventoryItems).values(inventoryData);
        stats.inventoryItemsCreated++;
      } catch (error) {
        // If UUID collision, try with new UUID
        if (error.message.includes('Duplicate')) {
          inventoryData.uuid = randomUUID();
          try {
            await db.insert(inventoryItems).values(inventoryData);
            stats.inventoryItemsCreated++;
          } catch (retryError) {
            stats.inventoryItemsSkipped++;
            stats.errors.push({
              row: i + 2,
              uuid: row.UUID,
              error: `Inventory item error: ${retryError.message}`
            });
          }
        } else {
          stats.inventoryItemsSkipped++;
          stats.errors.push({
            row: i + 2,
            uuid: row.UUID,
            error: `Inventory item error: ${error.message}`
          });
        }
      }
      
      // Progress indicator
      if ((i + 1) % 100 === 0) {
        console.log(`📊 Progress: ${i + 1}/${records.length} records processed...`);
      }
      
    } catch (error) {
      stats.errors.push({
        row: i + 2,
        uuid: row.UUID,
        error: `Unexpected error: ${error.message}`
      });
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total records processed: ${stats.totalRecords}`);
  console.log(`\n📚 Catalog Masters:`);
  console.log(`  ✅ Created/Updated: ${stats.catalogMastersCreated}`);
  console.log(`  ⏭️  Skipped: ${stats.catalogMastersSkipped}`);
  console.log(`\n📦 Inventory Items:`);
  console.log(`  ✅ Created: ${stats.inventoryItemsCreated}`);
  console.log(`  ⏭️  Skipped: ${stats.inventoryItemsSkipped}`);
  console.log(`\n❌ Errors: ${stats.errors.length}`);
  
  if (stats.errors.length > 0) {
    console.log('\n⚠️  First 10 errors:');
    stats.errors.slice(0, 10).forEach(err => {
      console.log(`  Row ${err.row} (UUID: ${err.uuid}): ${err.error}`);
    });
    
    // Save full error log
    const errorLogPath = '/home/ubuntu/alexandria-os/migration-errors.json';
    fs.writeFileSync(errorLogPath, JSON.stringify(stats.errors, null, 2));
    console.log(`\n📄 Full error log saved to: ${errorLogPath}`);
  }
  
  console.log('\n✨ Migration complete!\n');
}

// Run migration
migrateData().catch(error => {
  console.error('💥 Migration failed:', error);
  process.exit(1);
});
