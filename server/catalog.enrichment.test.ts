import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as externalBookApi from "./_core/externalBookApi";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("catalog.enrichMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should enrich book with missing publisher and pages", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const enrichedBook = {
      isbn13: "9780134685991",
      title: "Effective Java",
      author: "Joshua Bloch",
      publisher: "Addison-Wesley Professional",
      pages: 416,
      publicationYear: 2018,
      language: "EN",
      edition: "3rd Edition",
      synopsis: "The Definitive Guide to Java Platform Best Practices",
      categoryLevel1: "Ciencias",
      categoryLevel2: null,
      categoryLevel3: null,
      materia: null,
      coverImageUrl: "https://example.com/cover.jpg",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Mock database operations
    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([enrichedBook]),
          }),
        }),
      }),
    };

    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as any);

    // Mock getBookByIsbn to return book with missing metadata
    vi.spyOn(db, "getCatalogMasterByIsbn").mockResolvedValue({
      isbn13: "9780134685991",
      title: "Effective Java",
      author: "Joshua Bloch",
      publisher: null,
      pages: null,
      publicationYear: 2018,
      language: "EN",
      edition: null,
      synopsis: null,
      categoryLevel1: "Ciencias",
      categoryLevel2: null,
      categoryLevel3: null,
      materia: null,
      coverImageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // Mock fetchExternalBookMetadata to return complete metadata
    vi.spyOn(externalBookApi, "fetchExternalBookMetadata").mockResolvedValue({
      found: true,
      title: "Effective Java",
      author: "Joshua Bloch",
      publisher: "Addison-Wesley Professional",
      publishedDate: "2018",
      description: "The Definitive Guide to Java Platform Best Practices",
      pageCount: 416,
      language: "EN",
      coverImageUrl: "https://example.com/cover.jpg",
      edition: "3rd Edition",
    });

    const result = await caller.catalog.enrichMetadata({
      isbn13: "9780134685991",
    });

    expect(result.enriched).toBe(true);
    expect(result.book).toBeDefined();
    expect(result.book?.publisher).toBe("Addison-Wesley Professional");
    expect(result.book?.pages).toBe(416);
    expect(result.fieldsUpdated).toContain("publisher");
    expect(result.fieldsUpdated).toContain("pages");
  });

  it("should not enrich book when all metadata is complete", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Mock getBookByIsbn to return book with complete metadata
    vi.spyOn(db, "getCatalogMasterByIsbn").mockResolvedValue({
      isbn13: "9781098156152",
      title: "Prompt Engineering for LLMs",
      author: "John Doe",
      publisher: "O'Reilly Media",
      pages: 250,
      publicationYear: 2024,
      language: "EN",
      edition: "1st Edition",
      synopsis: "Complete guide to prompt engineering",
      categoryLevel1: "Ciencias",
      categoryLevel2: null,
      categoryLevel3: null,
      materia: null,
      coverImageUrl: "https://example.com/cover.jpg",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await caller.catalog.enrichMetadata({
      isbn13: "9781098156152",
    });

    expect(result.enriched).toBe(false);
    expect(result.message).toBe("Book already has complete metadata");
  });

  it("should return error when book not found in database", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Mock getBookByIsbn to return null
    vi.spyOn(db, "getCatalogMasterByIsbn").mockResolvedValue(null);

    await expect(
      caller.catalog.enrichMetadata({ isbn13: "9999999999999" })
    ).rejects.toThrow("Book not found in catalog");
  });

  it("should handle external API failure gracefully", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Mock getBookByIsbn to return book with missing metadata
    vi.spyOn(db, "getCatalogMasterByIsbn").mockResolvedValue({
      isbn13: "9780000000000",
      title: "Unknown Book",
      author: "Unknown Author",
      publisher: null,
      pages: null,
      publicationYear: 2020,
      language: "EN",
      edition: null,
      synopsis: null,
      categoryLevel1: "Otros",
      categoryLevel2: null,
      categoryLevel3: null,
      materia: null,
      coverImageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // Mock fetchExternalBookMetadata to return not found
    vi.spyOn(externalBookApi, "fetchExternalBookMetadata").mockResolvedValue({
      found: false,
      source: null,
    });

    const result = await caller.catalog.enrichMetadata({
      isbn13: "9780000000000",
    });

    expect(result.enriched).toBe(false);
    expect(result.message).toBe("Metadata not found in external APIs");
  });

  it("should enrich only missing fields and preserve existing data", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Mock getBookByIsbn to return book with partial metadata
    vi.spyOn(db, "getCatalogMasterByIsbn").mockResolvedValue({
      isbn13: "9788418733420",
      title: "Hermanito",
      author: "Ibrahima Balde",
      publisher: "Editorial Planeta",
      pages: null, // Missing pages
      publicationYear: 2021,
      language: "ES",
      edition: null, // Missing edition
      synopsis: "Una historia conmovedora",
      categoryLevel1: "Literatura",
      categoryLevel2: null,
      categoryLevel3: null,
      materia: null,
      coverImageUrl: "https://example.com/cover.jpg",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // Mock fetchExternalBookMetadata
    vi.spyOn(externalBookApi, "fetchExternalBookMetadata").mockResolvedValue({
      found: true,
      source: "google",
      title: "Hermanito",
      authors: ["Ibrahima Balde"],
      publisher: "Editorial Planeta", // Same as existing
      publishedDate: "2021-09-01",
      description: "Una historia conmovedora",
      pageCount: 192,
      language: "es",
      coverImageUrl: "https://example.com/cover.jpg",
      edition: "1ª edición",
    });

    const result = await caller.catalog.enrichMetadata({
      isbn13: "9788418733420",
    });

    expect(result.enriched).toBe(true);
    expect(result.fieldsUpdated).toContain("pages");
    expect(result.fieldsUpdated).toContain("edition");
    expect(result.fieldsUpdated).not.toContain("publisher"); // Already exists
  });

  it("should handle language normalization during enrichment", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    vi.spyOn(db, "getCatalogMasterByIsbn").mockResolvedValue({
      isbn13: "9780134680000",
      title: "Test Book",
      author: "Test Author",
      publisher: null,
      pages: null,
      publicationYear: 2020,
      language: null,
      edition: null,
      synopsis: null,
      categoryLevel1: "Ciencias",
      categoryLevel2: null,
      categoryLevel3: null,
      materia: null,
      coverImageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.spyOn(externalBookApi, "fetchExternalBookMetadata").mockResolvedValue({
      found: true,
      source: "google",
      title: "Test Book",
      authors: ["Test Author"],
      publisher: "Test Publisher",
      publishedDate: "2020-01-01",
      description: "Test description",
      pageCount: 300,
      language: "en", // Lowercase
      coverImageUrl: null,
      edition: null,
    });

    const result = await caller.catalog.enrichMetadata({
      isbn13: "9780134680000",
    });

    expect(result.enriched).toBe(true);
    expect(result.fieldsUpdated).toContain("language");
  });
});
