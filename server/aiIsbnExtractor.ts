import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";

/**
 * Extract ISBN from book cover image using AI vision
 * Supports both printed ISBN text and barcodes
 */
export async function extractIsbnFromImage(imageData: {
  buffer: Buffer;
  mimeType: string;
}): Promise<{
  success: boolean;
  isbn?: string;
  confidence?: string;
  error?: string;
}> {
  try {
    // Upload image to S3 to get a public URL for the AI
    const randomSuffix = Math.random().toString(36).substring(7);
    const fileKey = `isbn-extraction/${Date.now()}-${randomSuffix}.jpg`;
    const { url: imageUrl } = await storagePut(
      fileKey,
      imageData.buffer,
      imageData.mimeType
    );

    // Use AI vision to extract ISBN from the image
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an ISBN extraction expert. Your task is to find and extract the ISBN number from book cover images.

Instructions:
1. Look for ISBN-13 (13 digits) or ISBN-10 (10 digits) on the book cover
2. The ISBN may appear as:
   - Printed text (e.g., "ISBN 978-0-123-45678-9" or "ISBN: 9780123456789")
   - Barcode number below or above the barcode
   - On the back cover, spine, or copyright page
3. Extract ONLY the numeric digits (remove "ISBN", hyphens, spaces)
4. If you find multiple ISBNs, return the ISBN-13 (13 digits) if available
5. Return ONLY valid ISBNs (10 or 13 digits)

Response format (JSON):
{
  "found": true/false,
  "isbn": "extracted ISBN digits only",
  "confidence": "high/medium/low",
  "location": "where you found it (e.g., 'back cover barcode', 'copyright page text')"
}

If no ISBN is found, return: {"found": false, "confidence": "none"}`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please extract the ISBN from this book cover image.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "isbn_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              found: {
                type: "boolean",
                description: "Whether an ISBN was found in the image",
              },
              isbn: {
                type: "string",
                description: "The extracted ISBN digits (10 or 13 digits, no hyphens)",
              },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low", "none"],
                description: "Confidence level of the extraction",
              },
              location: {
                type: "string",
                description: "Where the ISBN was found (e.g., 'back cover', 'barcode')",
              },
            },
            required: ["found", "confidence"],
            additionalProperties: false,
          },
        },
      },
    });

    const messageContent = response.choices[0]?.message?.content;
    const contentString = typeof messageContent === 'string' ? messageContent : JSON.stringify(messageContent);
    const result = JSON.parse(contentString || "{}");

    if (!result.found || !result.isbn) {
      return {
        success: false,
        error: "No se pudo encontrar un ISBN en la imagen. Intenta con una foto más clara del código de barras o la información del libro.",
      };
    }

    // Clean and validate the extracted ISBN
    const cleanedIsbn = result.isbn.replace(/[-\s]/g, "");

    // Validate ISBN format (must be 10 or 13 digits)
    // ISBN-10 can end with 'X' (represents check digit 10)
    const isValidIsbn10 = /^\d{9}[\dX]$/i.test(cleanedIsbn);
    const isValidIsbn13 = /^\d{13}$/.test(cleanedIsbn);
    
    if (!isValidIsbn10 && !isValidIsbn13) {
      return {
        success: false,
        error: `ISBN extraído inválido: ${result.isbn}. Debe tener 10 o 13 dígitos (ISBN-10 puede terminar en X).`,
      };
    }

    // Convert ISBN-10 to ISBN-13 if needed
    let finalIsbn = cleanedIsbn;
    if (cleanedIsbn.length === 10) {
      // Convert ISBN-10 to ISBN-13 by adding 978 prefix and recalculating check digit
      // Take only first 9 digits (ignore the ISBN-10 check digit, including X)
      const isbn13Base = "978" + cleanedIsbn.substring(0, 9);
      const checkDigit = calculateIsbn13CheckDigit(isbn13Base);
      finalIsbn = isbn13Base + checkDigit;
    }

    return {
      success: true,
      isbn: finalIsbn,
      confidence: result.confidence,
    };
  } catch (error) {
    console.error("[AI ISBN Extraction] Error:", error);
    return {
      success: false,
      error: `Error al procesar la imagen: ${error instanceof Error ? error.message : "Error desconocido"}`,
    };
  }
}

/**
 * Calculate ISBN-13 check digit
 */
function calculateIsbn13CheckDigit(isbn12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(isbn12[i] || "0");
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit.toString();
}
