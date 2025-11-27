/**
 * Utility functions for handling Depósito Legal numbers for pre-1970 books
 */

/**
 * Generate a synthetic ISBN-13 from a Depósito Legal number
 * Format: 00000 + 8-digit hash of the depositoLegal string
 * Example: "M-1234-1965" → "0000012345678"
 * 
 * This allows pre-1970 books without ISBN to fit into the existing schema
 * while maintaining the actual Depósito Legal number in a separate field.
 */
export function generateSyntheticIsbn(depositoLegal: string): string {
  // Clean the depositoLegal string (remove spaces, convert to uppercase)
  const cleaned = depositoLegal.trim().toUpperCase().replace(/\s+/g, '');
  
  // Generate a simple numeric hash from the string
  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to positive number and pad to 8 digits
  const positiveHash = Math.abs(hash);
  const hashStr = String(positiveHash).padStart(8, '0').slice(0, 8);
  
  // Return ISBN starting with 5 zeros
  return `00000${hashStr}`;
}

/**
 * Check if an ISBN is a synthetic one generated from Depósito Legal
 */
export function isSyntheticIsbn(isbn: string): boolean {
  return isbn.startsWith('00000') && isbn.length === 13;
}

/**
 * Validate Depósito Legal format
 * Common formats:
 * - M-1234-1965 (Madrid)
 * - B-5678-1968 (Barcelona)
 * - Province letter + number + year
 */
export function isValidDepositoLegal(depositoLegal: string): boolean {
  if (!depositoLegal || depositoLegal.trim().length === 0) {
    return false;
  }
  
  // Basic validation: should contain at least one letter and one number
  const hasLetter = /[A-Za-z]/.test(depositoLegal);
  const hasNumber = /\d/.test(depositoLegal);
  
  return hasLetter && hasNumber && depositoLegal.length >= 5;
}

/**
 * Clean and normalize Depósito Legal format
 */
export function normalizeDepositoLegal(depositoLegal: string): string {
  return depositoLegal.trim().toUpperCase().replace(/\s+/g, '-');
}
