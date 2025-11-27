import { describe, expect, it } from 'vitest';
import {
  isValidISBN10,
  isValidISBN13,
  isValidISBN,
  convertISBN10toISBN13,
  normalizeISBN,
  getISBNType,
} from '../shared/isbn-utils';

describe('ISBN-10 Validation', () => {
  it('validates correct ISBN-10', () => {
    expect(isValidISBN10('8486015812')).toBe(true);
    expect(isValidISBN10('0306406152')).toBe(true);
  });

  it('validates ISBN-10 with X check digit', () => {
    expect(isValidISBN10('043942089X')).toBe(true);
  });

  it('rejects invalid ISBN-10', () => {
    expect(isValidISBN10('1234567890')).toBe(false);
  });
});

describe('ISBN-13 Validation', () => {
  it('validates correct ISBN-13', () => {
    expect(isValidISBN13('9788486015817')).toBe(true);
  });

  it('rejects invalid ISBN-13', () => {
    expect(isValidISBN13('9781234567890')).toBe(false);
  });
});

describe('ISBN-10 to ISBN-13 Conversion', () => {
  it('converts ISBN-10 to ISBN-13 correctly', () => {
    expect(convertISBN10toISBN13('8486015812')).toBe('9788486015817');
  });

  it('throws error for invalid ISBN-10', () => {
    expect(() => convertISBN10toISBN13('1234567890')).toThrow('Invalid ISBN-10 format');
  });
});

describe('ISBN Normalization', () => {
  it('normalizes ISBN-10 to ISBN-13', () => {
    expect(normalizeISBN('8486015812')).toBe('9788486015817');
  });

  it('keeps ISBN-13 as-is', () => {
    expect(normalizeISBN('9788486015817')).toBe('9788486015817');
  });

  it('throws error for invalid ISBN', () => {
    expect(() => normalizeISBN('1234567890')).toThrow('Invalid ISBN format');
  });
});
