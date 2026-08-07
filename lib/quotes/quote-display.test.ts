import { describe, expect, it } from 'vitest';

import {
  QUOTE_ADDRESS_MAX_LINES,
  QUOTE_DESCRIPTION_PREVIEW_CHARS,
  cleanText,
  formatQuoteDate,
  isQuoteChargeLine,
  isQuoteExpired,
  isoDayUtc,
  quoteAddressLines,
  quoteDateParts,
  quoteDescriptionPreview,
  quoteLineTitle,
  shownAmount,
  shownQuantity,
} from './quote-display';

describe('cleanText', () => {
  it('returns trimmed strings and null for everything else', () => {
    expect(cleanText('  hello  ')).toBe('hello');
    expect(cleanText('')).toBeNull();
    expect(cleanText('   ')).toBeNull();
    expect(cleanText(undefined)).toBeNull();
    expect(cleanText(null)).toBeNull();
    expect(cleanText(42)).toBeNull();
    expect(cleanText({})).toBeNull();
  });
});

describe('quoteDateParts / formatQuoteDate', () => {
  it('reads a Sanity date value as the literal calendar day', () => {
    expect(quoteDateParts('2026-08-15')).toEqual({ year: 2026, month: 8, day: 15 });
    expect(formatQuoteDate('2026-08-15')).toBe('August 15, 2026');
  });

  it('reads the date part of a datetime value', () => {
    expect(formatQuoteDate('2026-01-02T23:45:00.000Z')).toBe('January 2, 2026');
  });

  it('does NOT shift the day in a negative-offset timezone (the bug being avoided)', () => {
    // new Date('2026-08-15').toLocaleDateString('en-US') in UTC-5 renders
    // "August 14" - the string parse below can never do that.
    expect(formatQuoteDate('2026-08-15')).toBe('August 15, 2026');
    expect(formatQuoteDate('2026-01-01')).toBe('January 1, 2026');
    expect(formatQuoteDate('2026-12-31')).toBe('December 31, 2026');
  });

  it('returns nothing usable for junk instead of throwing', () => {
    expect(formatQuoteDate('not a date')).toBe('');
    expect(formatQuoteDate('')).toBe('');
    expect(formatQuoteDate(undefined)).toBe('');
    expect(formatQuoteDate(null)).toBe('');
    expect(formatQuoteDate(20260815)).toBe('');
    expect(quoteDateParts('2026-13-01')).toBeNull();
    expect(quoteDateParts('2026-00-10')).toBeNull();
    expect(quoteDateParts('2026-08-00')).toBeNull();
  });
});

describe('isoDayUtc', () => {
  it('formats a Date as its UTC calendar day, zero padded', () => {
    expect(isoDayUtc(new Date('2026-08-05T00:00:00.000Z'))).toBe('2026-08-05');
    expect(isoDayUtc(new Date('2026-08-05T23:59:59.000Z'))).toBe('2026-08-05');
    expect(isoDayUtc(new Date('2026-01-09T12:00:00.000Z'))).toBe('2026-01-09');
  });
});

describe('isQuoteExpired', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');

  it('is not expired on the expiry day itself', () => {
    expect(isQuoteExpired('2026-08-15', now)).toBe(false);
  });

  it('is not expired before the expiry day', () => {
    expect(isQuoteExpired('2026-08-16', now)).toBe(false);
    expect(isQuoteExpired('2027-01-01', now)).toBe(false);
  });

  it('is expired the day after', () => {
    expect(isQuoteExpired('2026-08-14', now)).toBe(true);
    expect(isQuoteExpired('2025-12-31', now)).toBe(true);
  });

  it('treats a missing or unreadable expiry as never expiring', () => {
    expect(isQuoteExpired(undefined, now)).toBe(false);
    expect(isQuoteExpired(null, now)).toBe(false);
    expect(isQuoteExpired('', now)).toBe(false);
    expect(isQuoteExpired('soon', now)).toBe(false);
    expect(isQuoteExpired(42, now)).toBe(false);
  });

  it('compares across year and month boundaries correctly', () => {
    expect(isQuoteExpired('2026-12-31', new Date('2027-01-01T00:00:00.000Z'))).toBe(true);
    expect(isQuoteExpired('2026-09-01', new Date('2026-08-31T23:00:00.000Z'))).toBe(false);
  });
});

describe('quoteDescriptionPreview', () => {
  it('returns null for a missing description', () => {
    expect(quoteDescriptionPreview(undefined)).toBeNull();
    expect(quoteDescriptionPreview('   ')).toBeNull();
    expect(quoteDescriptionPreview(null)).toBeNull();
    expect(quoteDescriptionPreview(7)).toBeNull();
  });

  it('needs no toggle when the text already fits', () => {
    const result = quoteDescriptionPreview('A short line.');
    expect(result).toEqual({ full: 'A short line.', preview: 'A short line.', needsToggle: false });
  });

  it('collapses whitespace', () => {
    expect(quoteDescriptionPreview('one   two\n\nthree')?.full).toBe('one two three');
  });

  it('cuts long text on a word boundary and marks it as needing a toggle', () => {
    const long = `${'word '.repeat(60)}end`;
    const result = quoteDescriptionPreview(long);
    expect(result?.needsToggle).toBe(true);
    expect(result?.preview.endsWith('...')).toBe(true);
    expect(result?.preview.length).toBeLessThanOrEqual(QUOTE_DESCRIPTION_PREVIEW_CHARS + 3);
    // The word boundary must not chop a word in half.
    expect(result?.preview.replace(/\.\.\.$/, '').endsWith('word')).toBe(true);
    // The full text is preserved in full for the expanded view.
    expect(result?.full).toBe(long.replace(/\s+/g, ' '));
  });

  it('falls back to a hard cut when there is no usable space', () => {
    const noSpaces = 'x'.repeat(400);
    const result = quoteDescriptionPreview(noSpaces, 20);
    expect(result?.preview).toBe(`${'x'.repeat(20)}...`);
    expect(result?.needsToggle).toBe(true);
  });

  it('honours a custom limit and ignores a nonsense one', () => {
    expect(quoteDescriptionPreview('a'.repeat(30), 10)?.needsToggle).toBe(true);
    expect(quoteDescriptionPreview('a'.repeat(30), 0)?.needsToggle).toBe(false);
    expect(quoteDescriptionPreview('a'.repeat(30), Number.NaN)?.needsToggle).toBe(false);
  });
});

describe('quoteLineTitle', () => {
  it('prefers the snapshot display name', () => {
    expect(
      quoteLineTitle({
        _type: 'quoteOwnProductLine',
        displayName: 'Snapshot Name',
        product: { title: 'Live Product Title' },
      }),
    ).toBe('Snapshot Name');
  });

  it('uses the charge label for a charge line', () => {
    expect(quoteLineTitle({ _type: 'quoteChargeLine', label: 'Art fee' })).toBe('Art fee');
  });

  it('falls back to the referenced product title when the override is blank', () => {
    expect(
      quoteLineTitle({
        _type: 'quoteOwnProductLine',
        displayName: '   ',
        product: { title: 'Live Product Title' },
      }),
    ).toBe('Live Product Title');
  });

  it('never renders an empty name', () => {
    expect(quoteLineTitle({ _type: 'quoteGeigerLine' })).toBe('Item');
    expect(quoteLineTitle({ _type: 'quoteChargeLine' })).toBe('Charge');
    expect(quoteLineTitle({ _type: 'quoteOwnProductLine', product: null })).toBe('Item');
    expect(quoteLineTitle(null)).toBe('Item');
    expect(quoteLineTitle(undefined)).toBe('Item');
  });
});

describe('isQuoteChargeLine', () => {
  it('identifies charge lines only', () => {
    expect(isQuoteChargeLine({ _type: 'quoteChargeLine' })).toBe(true);
    expect(isQuoteChargeLine({ _type: 'quoteGeigerLine' })).toBe(false);
    expect(isQuoteChargeLine(null)).toBe(false);
    expect(isQuoteChargeLine(undefined)).toBe(false);
  });
});

describe('shownAmount / shownQuantity', () => {
  it('shows only positive finite numbers', () => {
    expect(shownAmount(12.5)).toBe(12.5);
    expect(shownAmount(0)).toBeNull();
    expect(shownAmount(-5)).toBeNull();
    expect(shownAmount(Number.NaN)).toBeNull();
    expect(shownAmount(Number.POSITIVE_INFINITY)).toBeNull();
    expect(shownAmount(undefined)).toBeNull();
    expect(shownAmount('25')).toBeNull();
  });

  it('shows only usable quantities', () => {
    expect(shownQuantity(250)).toBe(250);
    expect(shownQuantity(0)).toBeNull();
    expect(shownQuantity(undefined)).toBeNull();
    expect(shownQuantity('250')).toBeNull();
  });
});

describe('quoteAddressLines', () => {
  it('splits a stored address into the lines it should print', () => {
    expect(quoteAddressLines('913 Beal Pkwy NW\nSte A153\nFort Walton Beach, FL 32547')).toEqual([
      '913 Beal Pkwy NW',
      'Ste A153',
      'Fort Walton Beach, FL 32547',
    ]);
  });

  it('handles Windows line endings and trims each line', () => {
    expect(quoteAddressLines('  12 Main St \r\n  Suite 4  \r\nAustin, TX 78701 ')).toEqual([
      '12 Main St',
      'Suite 4',
      'Austin, TX 78701',
    ]);
  });

  it('drops blank lines so the block never opens a gap in the middle', () => {
    expect(quoteAddressLines('12 Main St\n\n\nAustin, TX 78701')).toEqual([
      '12 Main St',
      'Austin, TX 78701',
    ]);
  });

  it('collapses runs of spaces and tabs inside a line', () => {
    expect(quoteAddressLines('12   Main\tSt')).toEqual(['12 Main St']);
  });

  it('returns an EMPTY array for every absent value, so callers render nothing', () => {
    expect(quoteAddressLines(undefined)).toEqual([]);
    expect(quoteAddressLines(null)).toEqual([]);
    expect(quoteAddressLines('')).toEqual([]);
    expect(quoteAddressLines('   ')).toEqual([]);
    expect(quoteAddressLines('\n\n \n')).toEqual([]);
    expect(quoteAddressLines(42)).toEqual([]);
    expect(quoteAddressLines({})).toEqual([]);
  });

  it('caps a pasted block so one bad value cannot push the page around', () => {
    const many = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n');
    const lines = quoteAddressLines(many);
    expect(lines).toHaveLength(QUOTE_ADDRESS_MAX_LINES);
    expect(lines[0]).toBe('line 1');
  });

  it('leaves a real one-line address alone', () => {
    expect(quoteAddressLines('913 Beal Pkwy NW, Ste A153, Fort Walton Beach, FL 32547')).toEqual([
      '913 Beal Pkwy NW, Ste A153, Fort Walton Beach, FL 32547',
    ]);
  });
});
