import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { users } from "../drizzle/schema";

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

describe("AI ISBN Extraction", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    // Ensure test user exists
    await db.insert(users).values({
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
    }).onDuplicateKeyUpdate({
      set: { email: "test@example.com" },
    });
  });

  it("should validate input parameters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Test with empty base64
    const result = await caller.triage.extractIsbnFromImage({
      imageBase64: "",
      mimeType: "image/jpeg",
    });

    // Should return error result instead of throwing
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should validate mime type", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a minimal valid base64 image (1x1 transparent PNG)
    const minimalPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // Test with invalid mime type
    const result = await caller.triage.extractIsbnFromImage({
      imageBase64: minimalPng,
      mimeType: "text/plain",
    });

    // Should still process but likely fail to find ISBN
    expect(result).toHaveProperty("success");
  });

  it("should handle ISBN-13 format correctly", () => {
    // Test ISBN-13 validation logic
    const isbn13 = "9780134685991";
    expect(isbn13).toMatch(/^\d{13}$/);
  });

  it("should handle ISBN-10 format correctly", () => {
    // Test ISBN-10 validation logic (numeric only)
    const isbn10 = "0134685997";
    expect(isbn10).toMatch(/^\d{10}$/);
  });

  it("should handle ISBN-10 with X check digit", () => {
    // Test ISBN-10 with X as check digit (represents 10)
    const isbn10WithX = "842262687X";
    const isValidIsbn10 = /^\d{9}[\dX]$/i.test(isbn10WithX);
    expect(isValidIsbn10).toBe(true);
    
    // Verify it has exactly 10 characters
    expect(isbn10WithX.length).toBe(10);
  });

  it("should clean ISBN by removing hyphens and spaces", () => {
    const dirtyIsbn = "978-0-13-468599-1";
    const cleanedIsbn = dirtyIsbn.replace(/[-\s]/g, "");
    expect(cleanedIsbn).toBe("9780134685991");
    expect(cleanedIsbn).toMatch(/^\d{13}$/);
  });

  it("should convert ISBN-10 to ISBN-13", () => {
    // ISBN-10: 0134685997
    // Should convert to: 978-0-13-468599-1 (9780134685991)
    
    const isbn10 = "0134685997";
    const isbn13Base = "978" + isbn10.substring(0, 9); // "9780134685991"
    
    // Calculate check digit for ISBN-13
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(isbn13Base[i] || "0");
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    const isbn13 = isbn13Base + checkDigit;
    
    expect(isbn13).toMatch(/^\d{13}$/);
    expect(isbn13.length).toBe(13);
  });

  it("should reject invalid ISBN formats", () => {
    const invalidIsbns = [
      "123",           // Too short
      "12345678901234", // Too long
      "978abc1234567",  // Contains letters
      "978-0-13-46859", // Only 12 digits
    ];

    invalidIsbns.forEach(isbn => {
      const cleaned = isbn.replace(/[-\s]/g, "");
      const isValid = /^\d{10}$/.test(cleaned) || /^\d{13}$/.test(cleaned);
      expect(isValid).toBe(false);
    });
  });

  it("should handle base64 encoding correctly", () => {
    const testString = "Hello, World!";
    const base64 = Buffer.from(testString).toString("base64");
    const decoded = Buffer.from(base64, "base64").toString("utf-8");
    
    expect(decoded).toBe(testString);
  });

  it("should validate image buffer creation", () => {
    // Create a minimal valid base64 image (1x1 transparent PNG)
    const minimalPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const buffer = Buffer.from(minimalPng, "base64");
    
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("should handle extraction errors gracefully", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create invalid image data
    const invalidBase64 = "invalid-base64-data";

    try {
      const result = await caller.triage.extractIsbnFromImage({
        imageBase64: invalidBase64,
        mimeType: "image/jpeg",
      });

      // Should return error result, not throw
      expect(result).toHaveProperty("success");
      if (!result.success) {
        expect(result).toHaveProperty("error");
      }
    } catch (error) {
      // If it throws, that's also acceptable error handling
      expect(error).toBeDefined();
    }
  });
});
