import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { invokeLLM } from '../server/_core/llm.ts';

/**
 * Parse the category taxonomy CSV and create a structured mapping
 */
async function parseCategories() {
  console.log('📚 Parsing category taxonomy...\n');
  
  const csvPath = '/home/ubuntu/upload/Categorias_AlAlimon-Hoja1.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true
  });
  
  console.log(`Found ${records.length} category entries\n`);
  
  // Build category tree
  const categoryTree = {};
  const allCategories = [];
  
  for (const row of records) {
    const nivel1 = row['Nivel 1'];
    const nivel2 = row['Nivel 2'];
    const nivel3 = row['Nivel 3'];
    const materia = row['Materia'];
    
    if (!categoryTree[nivel1]) {
      categoryTree[nivel1] = {};
    }
    
    if (nivel2 && nivel2 !== '---') {
      if (!categoryTree[nivel1][nivel2]) {
        categoryTree[nivel1][nivel2] = [];
      }
      
      if (nivel3 && nivel3 !== nivel2) {
        categoryTree[nivel1][nivel2].push({
          nivel3,
          materia: materia || null
        });
      }
    }
    
    allCategories.push({
      nivel1,
      nivel2: nivel2 === '---' ? null : nivel2,
      nivel3,
      materia: materia || null
    });
  }
  
  // Save structured data
  const outputPath = '/home/ubuntu/alexandria-os/category-taxonomy.json';
  fs.writeFileSync(outputPath, JSON.stringify({
    tree: categoryTree,
    flat: allCategories
  }, null, 2));
  
  console.log(`✅ Saved category taxonomy to ${outputPath}\n`);
  
  // Generate summary
  const nivel1Count = Object.keys(categoryTree).length;
  console.log(`📊 Summary:`);
  console.log(`  - Level 1 categories: ${nivel1Count}`);
  console.log(`  - Total entries: ${allCategories.length}\n`);
  
  // Print level 1 categories
  console.log('📁 Level 1 Categories:');
  Object.keys(categoryTree).forEach(cat => {
    const nivel2Count = Object.keys(categoryTree[cat]).length;
    console.log(`  - ${cat} (${nivel2Count} subcategories)`);
  });
  
  // Now use LLM to create intelligent mapping from old categories
  console.log('\n🤖 Creating intelligent category mapping using LLM...\n');
  
  const oldCategories = [
    'Literatura', 'Historia', 'Arte', 'Ensayo', 'Filosofia', 'Ciencia',
    'Biografia', 'Infantil', 'Juvenil', 'Comic', 'Religion', 'Viajes',
    'Cocina', 'Deportes', 'Economia', 'Derecho', 'Psicologia', 'Medicina', 'Otros'
  ];
  
  const prompt = `Given this list of old simple categories from a book inventory system:
${oldCategories.join(', ')}

And this new 3-level category taxonomy (Level 1 categories):
${Object.keys(categoryTree).join(', ')}

Create a JSON mapping from each old category to the most appropriate new Level 1 category.
Return ONLY a JSON object with this format:
{
  "Literatura": "appropriate_level1_category",
  "Historia": "appropriate_level1_category",
  ...
}

Rules:
- Map each old category to exactly ONE new Level 1 category
- Use exact category names from the new taxonomy
- Be logical and consistent
- "Otros" should map to the most general category`;

  const response = await invokeLLM({
    messages: [
      { role: 'system', content: 'You are a librarian expert in book categorization. Return only valid JSON.' },
      { role: 'user', content: prompt }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'category_mapping',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: { type: 'string' }
        }
      }
    }
  });
  
  const mapping = JSON.parse(response.choices[0].message.content);
  
  console.log('✅ Category mapping created:\n');
  console.log(JSON.stringify(mapping, null, 2));
  
  // Save mapping
  const mappingPath = '/home/ubuntu/alexandria-os/category-mapping.json';
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
  console.log(`\n✅ Saved mapping to ${mappingPath}\n`);
}

parseCategories().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
