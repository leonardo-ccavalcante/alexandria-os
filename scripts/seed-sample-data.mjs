import { drizzle } from 'drizzle-orm/mysql2';
import { catalogMasters, inventoryItems } from '../drizzle/schema.js';
import crypto from 'crypto';

const db = drizzle(process.env.DATABASE_URL);

const sampleBooks = [
  { isbn13: '9780061120084', title: 'To Kill a Mockingbird', author: 'Harper Lee', publisher: 'Harper Perennial', year: 1960, category: 'Fiction' },
  { isbn13: '9780451524935', title: '1984', author: 'George Orwell', publisher: 'Signet Classic', year: 1949, category: 'Fiction' },
  { isbn13: '9780141439518', title: 'Pride and Prejudice', author: 'Jane Austen', publisher: 'Penguin Classics', year: 1813, category: 'Fiction' },
  { isbn13: '9780743273565', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', publisher: 'Scribner', year: 1925, category: 'Fiction' },
  { isbn13: '9780316769174', title: 'The Catcher in the Rye', author: 'J.D. Salinger', publisher: 'Little, Brown', year: 1951, category: 'Fiction' },
  { isbn13: '9780062315007', title: 'The Alchemist', author: 'Paulo Coelho', publisher: 'HarperOne', year: 1988, category: 'Fiction' },
  { isbn13: '9780439023481', title: 'The Hunger Games', author: 'Suzanne Collins', publisher: 'Scholastic', year: 2008, category: 'Young Adult' },
  { isbn13: '9780545010221', title: 'Harry Potter and the Deathly Hallows', author: 'J.K. Rowling', publisher: 'Scholastic', year: 2007, category: 'Fantasy' },
  { isbn13: '9780060935467', title: 'One Hundred Years of Solitude', author: 'Gabriel García Márquez', publisher: 'Harper Perennial', year: 1967, category: 'Fiction' },
  { isbn13: '9780142437230', title: 'The Kite Runner', author: 'Khaled Hosseini', publisher: 'Riverhead Books', year: 2003, category: 'Fiction' },
  { isbn13: '9780307387899', title: 'The Road', author: 'Cormac McCarthy', publisher: 'Vintage', year: 2006, category: 'Fiction' },
  { isbn13: '9780544003415', title: 'The Lord of the Rings', author: 'J.R.R. Tolkien', publisher: 'Mariner Books', year: 1954, category: 'Fantasy' },
  { isbn13: '9780345391803', title: 'The Hitchhiker\'s Guide to the Galaxy', author: 'Douglas Adams', publisher: 'Del Rey', year: 1979, category: 'Science Fiction' },
  { isbn13: '9780385490818', title: 'The Da Vinci Code', author: 'Dan Brown', publisher: 'Doubleday', year: 2003, category: 'Thriller' },
  { isbn13: '9780679783268', title: 'Crime and Punishment', author: 'Fyodor Dostoevsky', publisher: 'Vintage', year: 1866, category: 'Fiction' },
  { isbn13: '9780140283334', title: 'Don Quixote', author: 'Miguel de Cervantes', publisher: 'Penguin Classics', year: 1605, category: 'Fiction' },
  { isbn13: '9780553213119', title: 'A Brief History of Time', author: 'Stephen Hawking', publisher: 'Bantam', year: 1988, category: 'Science' },
  { isbn13: '9780141182605', title: 'Sapiens', author: 'Yuval Noah Harari', publisher: 'Vintage', year: 2011, category: 'Non-Fiction' },
  { isbn13: '9780307277671', title: 'The Girl with the Dragon Tattoo', author: 'Stieg Larsson', publisher: 'Vintage Crime', year: 2005, category: 'Thriller' },
  { isbn13: '9780374533557', title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', publisher: 'Farrar, Straus and Giroux', year: 2011, category: 'Psychology' },
];

const locations = ['01A', '01B', '02A', '02B', '03A', '03B', '04A', '04B', '05A', '05B'];
const statuses = ['available', 'listed', 'sold'];
const conditions = ['COMO_NUEVO', 'BUENO', 'ACEPTABLE'];
const salesChannels = [
  ['Wallapop', 'Vinted'],
  ['Amazon', 'Ebay'],
  ['Todo Colección', 'Iberlibro'],
  ['Wallapop', 'Amazon', 'Vinted'],
  ['Casa del Libro', 'Fnac'],
  null, // Some books without channels
];

async function seedData() {
  console.log('🌱 Starting to seed sample data...');

  try {
    // Insert catalog masters
    console.log('📚 Inserting catalog masters...');
    for (const book of sampleBooks) {
      await db.insert(catalogMasters).values({
        isbn13: book.isbn13,
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        publicationYear: book.year,
        categoryLevel1: book.category,
        synopsis: `A classic work by ${book.author}, published in ${book.year}.`,
        marketMinPrice: '5.00',
        marketMedianPrice: '12.00',
      }).onDuplicateKeyUpdate({ set: { title: book.title } });
    }
    console.log(`✅ Inserted ${sampleBooks.length} catalog masters`);

    // Insert inventory items (2-5 copies per book)
    console.log('📦 Inserting inventory items...');
    let itemCount = 0;
    for (const book of sampleBooks) {
      const copiesCount = Math.floor(Math.random() * 4) + 2; // 2-5 copies
      for (let i = 0; i < copiesCount; i++) {
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const location = locations[Math.floor(Math.random() * locations.length)];
        const condition = conditions[Math.floor(Math.random() * conditions.length)];
        const channels = salesChannels[Math.floor(Math.random() * salesChannels.length)];
        
        await db.insert(inventoryItems).values({
          uuid: crypto.randomUUID(),
          isbn13: book.isbn13,
          status,
          conditionGrade: condition,
          conditionNotes: `${condition} condition`,
          locationCode: status === 'available' ? location : null,
          salesChannels: channels ? JSON.stringify(channels) : null,
          listingPrice: (Math.random() * 15 + 5).toFixed(2),
          costOfGoods: '3.00',
        });
        itemCount++;
      }
    }
    console.log(`✅ Inserted ${itemCount} inventory items`);

    console.log('🎉 Sample data seeded successfully!');
    console.log(`📊 Total: ${sampleBooks.length} books, ${itemCount} inventory items`);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  }
}

seedData()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
