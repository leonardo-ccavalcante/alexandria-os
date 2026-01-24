/**
 * Bulk Metadata Enrichment Script
 * 
 * This script finds all books in catalog_masters with missing publisher or pages
 * and enriches them using Google Books API and ISBNDB API.
 * 
 * Usage: node --loader ts-node/esm server/scripts/bulkEnrichMetadata.ts
 */

import { getDb } from "../db";
import { catalogMasters } from "../../drizzle/schema";
import { sql, or, isNull, eq } from "drizzle-orm";
import { fetchExternalBookMetadata } from "../_core/externalBookApi";

async function enrichAllBooks() {
  console.log("🔍 Starting bulk metadata enrichment...\n");
  
  const db = await getDb();
  if (!db) {
    console.error("❌ Database not available");
    process.exit(1);
  }

  // Find all books with missing metadata or "Autor Desconocido"
  const booksNeedingEnrichment = await db.select()
    .from(catalogMasters)
    .where(
      or(
        isNull(catalogMasters.author),
        eq(catalogMasters.author, ""),
        eq(catalogMasters.author, "Autor Desconocido"),
        isNull(catalogMasters.publisher),
        eq(catalogMasters.publisher, ""),
        isNull(catalogMasters.pages),
        eq(catalogMasters.pages, 0),
        isNull(catalogMasters.edition),
        eq(catalogMasters.edition, ""),
        isNull(catalogMasters.language),
        eq(catalogMasters.language, ""),
        isNull(catalogMasters.synopsis),
        eq(catalogMasters.synopsis, "")
      )
    );

  console.log(`📚 Found ${booksNeedingEnrichment.length} books needing enrichment\n`);

  if (booksNeedingEnrichment.length === 0) {
    console.log("✅ All books already have complete metadata!");
    return;
  }

  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < booksNeedingEnrichment.length; i++) {
    const book = booksNeedingEnrichment[i];
    const progress = `[${i + 1}/${booksNeedingEnrichment.length}]`;
    
    console.log(`${progress} Processing: ${book.title || "Unknown"} (ISBN: ${book.isbn13})`);

    try {
      // Fetch metadata from external APIs
      const metadata = await fetchExternalBookMetadata(book.isbn13);
      
      if (!metadata.found) {
        console.log(`  ⚠️  No metadata found in external APIs`);
        failed++;
        continue;
      }

      // Prepare update data (only update missing fields)
      const updateData: any = {};
      let fieldsUpdated: string[] = [];

      if ((!book.author || book.author === "Autor Desconocido") && metadata.author) {
        updateData.author = metadata.author;
        fieldsUpdated.push("author");
      }
      if (!book.publisher && metadata.publisher) {
        updateData.publisher = metadata.publisher;
        fieldsUpdated.push("publisher");
      }
      if (!book.pages && metadata.pageCount) {
        updateData.pages = metadata.pageCount;
        fieldsUpdated.push("pages");
      }
      if (!book.edition && metadata.edition) {
        updateData.edition = metadata.edition;
        fieldsUpdated.push("edition");
      }
      if (!book.language && metadata.language) {
        updateData.language = metadata.language;
        fieldsUpdated.push("language");
      }
      if (!book.synopsis && metadata.description) {
        // Store full synopsis - TEXT type supports up to 65,535 bytes
        // Frontend can truncate for display if needed
        updateData.synopsis = metadata.description;
        fieldsUpdated.push("synopsis");
      }
      if (!book.coverImageUrl && metadata.coverImageUrl) {
        updateData.coverImageUrl = metadata.coverImageUrl;
        fieldsUpdated.push("coverImageUrl");
      }

      if (fieldsUpdated.length === 0) {
        console.log(`  ℹ️  No new metadata available`);
        skipped++;
        continue;
      }

      // Update database
      await db.update(catalogMasters)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(catalogMasters.isbn13, book.isbn13));

      console.log(`  ✅ Updated: ${fieldsUpdated.join(", ")}`);
      enriched++;

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Bulk Enrichment Summary");
  console.log("=".repeat(50));
  console.log(`✅ Successfully enriched: ${enriched}`);
  console.log(`⚠️  Skipped (no new data): ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📚 Total processed: ${booksNeedingEnrichment.length}`);
  console.log("=".repeat(50) + "\n");
}

// Run the script
enrichAllBooks()
  .then(() => {
    console.log("✅ Bulk enrichment completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
