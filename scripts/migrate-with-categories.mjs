import fs from 'fs';
import { parse } from 'csv-parse/sync';
import mysql from 'mysql2/promise';
import { invokeLLM } from '../server/_core/llm.ts';

const BATCH_SIZE = 50; // Process books in batches for LLM categorization

/**
 * Load category taxonomy
 */
function loadTaxonomy() {
  const taxonomyData = JSON.parse(fs.readFileSync('/home/ubuntu/alexandria-os/category-taxonomy.json', 'utf-8'));
  const categoryMapping = JSON.parse(fs.readFileSync('/home/ubuntu/alexandria-os/category-mapping.json', 'utf-8'));
  return { taxonomy: taxonomyData, mapping: categoryMapping };
}

/**
 * Use LLM to intelligently categorize a batch of books
 */
async function categorizeBatch(books, taxonomy) {
  const nivel1Options = Object.keys(taxonomy.tree);
  
  const prompt = `You are a professional librarian. Categorize these books into the correct 3-level taxonomy.

Available Level 1 categories: ${nivel1Options.join(', ')}

Books to categorize (JSON array):
${JSON.stringify(books.map(b => ({
    title: b.title,
    author: b.author,
    publisher: b.publisher,
    year: b.year,
    synopsis: b.synopsis,
    oldCategory: b.oldCategory
  })), null, 2)}

For each book, return the most appropriate category levels. Return a JSON array with this exact structure:
[
  {
    "index": 0,
    "categoryLevel1": "exact_level1_name",
    "categoryLevel2": "level2_name_or_null",
    "categoryLevel3": "level3_name_or_null"
  },
  ...
]

Rules:
- Use EXACT category names from the available options
- Level1 is required, Level2 and Level3 can be null
- Match based on title, author, synopsis, and old category
- Be precise and consistent`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: 'system', content: 'You are an expert librarian. Return only valid JSON arrays.' },
        { role: 'user', content: prompt }
      ]
    });
    
    let content = response.choices[0].message.content;
    // Remove markdown code blocks if present
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(content);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('LLM categorization error:', error.message);
    // Fallback: use simple mapping
    return books.map((book, index) => ({
      index,
      categoryLevel1: 'Libro antiguo y de ocasión',
      categoryLevel2: null,
      categoryLevel3: null
    }));
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting migration with intelligent categorization...\n');
  
  // Load taxonomy
  const { taxonomy, mapping } = loadTaxonomy();
  console.log(`✅ Loaded taxonomy: ${Object.keys(taxonomy.tree).length} Level 1 categories\n`);
  
  // Load CSV
  const csvPath = '/home/ubuntu/upload/BBDD_CATALOGO_AL_ALIMON-Current_Data(2).csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  
  console.log(`📚 Found ${records.length} records in CSV\n`);
  
  // Connect to database
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Clear existing data
  console.log('🗑️  Clearing existing data...');
  await connection.execute('DELETE FROM inventory_items');
  await connection.execute('DELETE FROM catalog_masters');
  console.log('✅ Database cleared\n');
  
  let successCount = 0;
  let skipCount = 0;
  const errors = [];
  
  // Process in batches
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(records.length / BATCH_SIZE)} (rows ${i + 1}-${Math.min(i + BATCH_SIZE, records.length)})...`);
    
    // Prepare books for categorization
    const booksForLLM = batch.map(row => ({
      title: row['TITULO'] || '',
      author: row['AUTOR'] || '',
      publisher: row['EDITORIAL'] || '',
      year: row['AÑO DE PUBLICACION'],
      synopsis: row['SINOPSIS'] || '',
      oldCategory: row['CATEGORIA']
    }));
    
    // Get categories from LLM
    console.log('🤖 Categorizing with LLM...');
    const categories = await categorizeBatch(booksForLLM, taxonomy);
    
    // Process each record in batch
    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const rowNum = i + j + 2; // +2 for header and 0-index
      
      try {
        // Validate ISBN
        const isbn13 = row['ISBN-13']?.replace(/[^0-9]/g, '');
        const isbn10 = row['ISBN-10']?.replace(/[^0-9X]/gi, '');
        
        if (!isbn13 || isbn13.length !== 13) {
          skipCount++;
          continue;
        }
        
        // Get category from LLM result
        const category = categories[j] || {
          categoryLevel1: mapping[row['CATEGORIA']] || 'Libro antiguo y de ocasión',
          categoryLevel2: null,
          categoryLevel3: null
        };
        
        // Insert catalog master
        await connection.execute(`
          INSERT INTO catalog_masters (
            isbn13, title, author, publisher, publicationYear, language, synopsis,
            categoryLevel1, categoryLevel2, categoryLevel3, materia,
            marketMinPrice, marketMedianPrice, lastPriceCheck
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            author = VALUES(author),
            publisher = VALUES(publisher),
            publicationYear = VALUES(publicationYear),
            synopsis = VALUES(synopsis),
            categoryLevel1 = VALUES(categoryLevel1),
            categoryLevel2 = VALUES(categoryLevel2),
            categoryLevel3 = VALUES(categoryLevel3)
        `, [
          isbn13,
          row['TITULO'] || 'Sin título',
          row['AUTOR'] || 'Autor desconocido',
          row['EDITORIAL'] || null,
          row['AÑO DE PUBLICACION'] ? parseInt(row['AÑO DE PUBLICACION']) : null,
          row['IDIOMA'] || 'es',
          row['SINOPSIS'] || null,
          category.categoryLevel1,
          category.categoryLevel2,
          category.categoryLevel3,
          null, // materia - will be added in future enhancement
          5.00,
          10.00,
          new Date()
        ]);
        
        // Insert inventory item
        const uuid = row['UUID'] || crypto.randomUUID();
        const location = row['UBICACION']?.replace(/^'/, '') || null;
        
        await connection.execute(`
          INSERT INTO inventory_items (
            uuid, isbn13, status, condition, location, costPrice, listingPrice, notes, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuid,
          isbn13,
          'AVAILABLE',
          'BUENO',
          location,
          null,
          null,
          null,
          new Date()
        ]);
        
        successCount++;
        
      } catch (error) {
        skipCount++;
        errors.push({
          row: rowNum,
          error: error.message
        });
      }
    }
    
    console.log(`✅ Batch complete: ${successCount} total imported, ${skipCount} total skipped`);
  }
  
  await connection.end();
  
  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('📋 MIGRATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total records: ${records.length}`);
  console.log(`✅ Successfully imported: ${successCount}`);
  console.log(`⏭️  Skipped: ${skipCount}`);
  console.log(`✨ Success rate: ${(successCount / records.length * 100).toFixed(1)}%`);
  console.log('='.repeat(70));
  
  // Save error log
  if (errors.length > 0) {
    fs.writeFileSync('/home/ubuntu/alexandria-os/migration-errors-categorized.json', JSON.stringify(errors, null, 2));
    console.log(`\n📄 Error log: migration-errors-categorized.json`);
  }
}

migrate().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
