import { describe, expect, it, vi } from "vitest";
import { searchByTitleAuthor } from "./_core/externalBookApi";

// Mock fetch globally
global.fetch = vi.fn();

describe("searchByTitleAuthor", () => {
  it("should find book using title+author from Google Books", async () => {
    // Mock Google Books API response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalItems: 1,
        items: [
          {
            volumeInfo: {
              title: "Don Quijote de la Mancha",
              authors: ["Miguel de Cervantes"],
              publisher: "Editorial Castalia",
              publishedDate: "1605",
              description: "La historia del ingenioso hidalgo...",
              pageCount: 863,
              language: "es",
              categories: ["Fiction"],
              imageLinks: {
                thumbnail: "http://books.google.com/cover.jpg",
              },
            },
          },
        ],
      }),
    });

    const result = await searchByTitleAuthor("Don Quijote de la Mancha", "Miguel de Cervantes");

    expect(result.found).toBe(true);
    expect(result.title).toBe("Don Quijote de la Mancha");
    expect(result.author).toBe("Miguel de Cervantes");
    expect(result.publisher).toBe("Editorial Castalia");
    expect(result.publishedDate).toBe("1605");
    expect(result.pageCount).toBe(863);
    expect(result.language).toBe("ES");
  });

  it("should find book using only title (no author)", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalItems: 1,
        items: [
          {
            volumeInfo: {
              title: "La Celestina",
              authors: ["Fernando de Rojas"],
              publisher: "Cátedra",
              publishedDate: "1499",
              description: "Tragicomedia de Calisto y Melibea",
              pageCount: 345,
              language: "es",
            },
          },
        ],
      }),
    });

    const result = await searchByTitleAuthor("La Celestina");

    expect(result.found).toBe(true);
    expect(result.title).toBe("La Celestina");
    expect(result.author).toBe("Fernando de Rojas");
  });

  it("should return not found when no results from Google Books", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalItems: 0,
        items: [],
      }),
    });

    // Mock ISBNDB to also fail (no API key)
    process.env.ISBNDB_API_KEY = "";

    const result = await searchByTitleAuthor("Nonexistent Book Title", "Unknown Author");

    expect(result.found).toBe(false);
  });

  it("should handle empty title", async () => {
    const result = await searchByTitleAuthor("");

    expect(result.found).toBe(false);
  });

  it("should handle special characters in title and author", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalItems: 1,
        items: [
          {
            volumeInfo: {
              title: "España 1808-1939",
              authors: ["Raymond Carr"],
              publisher: "Ariel",
              publishedDate: "1970",
              pageCount: 720,
              language: "es",
            },
          },
        ],
      }),
    });

    const result = await searchByTitleAuthor("España 1808-1939", "Raymond Carr");

    expect(result.found).toBe(true);
    expect(result.title).toBe("España 1808-1939");
  });
});
