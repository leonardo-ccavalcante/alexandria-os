/**
 * ISBN Utility Functions
 * Handles validation and conversion between ISBN-10 and ISBN-13 formats
 */

export function isValidISBN10(isbn: string): boolean {
  const cleaned = isbn.replace(/[-\s]/g, '');
  if (cleaned.length !== 10) return false;
  if (!/^\d{9}[\dX]$/.test(cleaned)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned[i]) * (10 - i);
  }
  const checkDigit = cleaned[9] === 'X' ? 10 : parseInt(cleaned[9]);
  sum += checkDigit;
  
  return sum % 11 === 0;
}

export function isValidISBN13(isbn: string): boolean {
  const cleaned = isbn.replace(/[-\s]/g, '');
  if (cleaned.length !== 13) return false;
  if (!/^\d{13}$/.test(cleaned)) return false;
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(cleaned[12]);
}

export function isValidISBN(isbn: string): boolean {
  return isValidISBN10(isbn) || isValidISBN13(isbn);
}

export function convertISBN10toISBN13(isbn10: string): string {
  const cleaned = isbn10.replace(/[-\s]/g, '');
  if (!isValidISBN10(cleaned)) {
    throw new Error('Invalid ISBN-10 format');
  }
  
  const isbn13Base = '978' + cleaned.substring(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(isbn13Base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return isbn13Base + checkDigit;
}

export function normalizeISBN(isbn: string): string {
  const cleaned = isbn.replace(/[-\s]/g, '');
  
  if (isValidISBN13(cleaned)) {
    return cleaned;
  }
  
  if (isValidISBN10(cleaned)) {
    return convertISBN10toISBN13(cleaned);
  }
  
  throw new Error('Invalid ISBN format. Must be valid ISBN-10 or ISBN-13.');
}

export function getISBNType(isbn: string): '10' | '13' | 'invalid' {
  const cleaned = isbn.replace(/[-\s]/g, '');
  if (isValidISBN10(cleaned)) return '10';
  if (isValidISBN13(cleaned)) return '13';
  return 'invalid';
}
