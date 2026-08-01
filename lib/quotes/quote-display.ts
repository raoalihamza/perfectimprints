/**
 * Display rules for the customer-facing quote page (Q-140).
 *
 * PURE + CLIENT-SAFE (no fs, no Sanity, no `server-only`), the same discipline
 * as lib/quotes/quote-totals.ts and lib/quotes/quote-prefill.ts: dates, expiry,
 * line naming, and description truncation are decided HERE and tested, so the
 * page component only lays things out. The future PDF and the future emails
 * import these same helpers rather than re-deriving "is it expired" or "what is
 * this line called" a second time.
 *
 * NOTHING here reads a price. Money lives in lib/quotes/quote-totals.ts.
 *
 * Draft tolerance is the rule, not the exception: every function takes
 * `unknown`-ish input, treats anything missing or malformed as absent, and
 * never throws. A half-filled quote must still render a page.
 */

/**
 * How much of a line description is shown before "Read more". The stored
 * description is already capped at QUOTE_DESCRIPTION_MAX_CHARS (300) by the
 * Studio pre-fill, so this only folds the longest ones; a quote with eight
 * long descriptions is unreadable otherwise.
 */
export const QUOTE_DESCRIPTION_PREVIEW_CHARS = 150;

/** Trimmed non-empty string, or null. The one input guard used everywhere. */
export function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The date part of a Sanity `date` (YYYY-MM-DD) or `datetime` (ISO) value, as
 * the literal calendar day that was stored. Returns null for anything else.
 *
 * Deliberately NOT `new Date(value)`: parsing "2026-08-15" yields UTC midnight,
 * and formatting that in a negative-offset timezone renders the PREVIOUS day.
 * A quote that says it expires a day early is a real customer-facing error, so
 * the string is split rather than parsed. (The site's shared `formatDate` in
 * lib/utils.ts has that timezone behaviour, which is why it is not used here.)
 */
export function quoteDateParts(
  value: unknown,
): { year: number; month: number; day: number } | null {
  const text = cleanText(value);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** "2026-08-15" -> "August 15, 2026". Empty string when unusable. */
export function formatQuoteDate(value: unknown): string {
  const parts = quoteDateParts(value);
  if (!parts) return '';
  return `${MONTHS[parts.month - 1]} ${parts.day}, ${parts.year}`;
}

/** The calendar day of a Date in UTC as YYYY-MM-DD (Vercel runs UTC). */
export function isoDayUtc(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Is this quote past its expiry date? A quote expires at the END of its expiry
 * day, so the expiry day itself is still valid. No expiry date means the quote
 * never expires (there is nothing to compare against, and inventing an expiry
 * for the customer would be worse than showing none).
 *
 * Comparison is a plain string compare of two YYYY-MM-DD values, which is
 * exactly a calendar comparison for that format and cannot drift by timezone.
 */
export function isQuoteExpired(expiryDate: unknown, now: Date): boolean {
  const parts = quoteDateParts(expiryDate);
  if (!parts) return false;
  const expiry = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return expiry < isoDayUtc(now);
}

/**
 * The preview shown before "Read more", cut on a word boundary. `needsToggle`
 * is false for anything short enough to show whole, in which case the caller
 * renders a plain paragraph with no control at all.
 */
export function quoteDescriptionPreview(
  value: unknown,
  max: number = QUOTE_DESCRIPTION_PREVIEW_CHARS,
): { full: string; preview: string; needsToggle: boolean } | null {
  const text = cleanText(value);
  if (!text) return null;
  const full = text.replace(/\s+/g, ' ');
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : QUOTE_DESCRIPTION_PREVIEW_CHARS;
  if (full.length <= limit) return { full, preview: full, needsToggle: false };
  const cut = full.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = (lastSpace > limit * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return { full, preview: `${trimmed}...`, needsToggle: true };
}

// ---------------------------------------------------------------------------
// Line naming
//
// Structural input types (not the QuoteLineItem union from
// lib/sanity/queries/quotes.ts, which is `server-only`) so this module stays
// dependency-free and importable anywhere - the same reason
// lib/products/product-page-pricing.ts uses *Source interfaces.
// ---------------------------------------------------------------------------

export interface QuoteLineNameSource {
  _type?: unknown;
  displayName?: unknown;
  label?: unknown;
  product?: { title?: unknown } | null;
}

/**
 * What this line is CALLED on the customer's quote, in the order the data was
 * designed to be read: the snapshot display name Patrick entered, then the
 * charge label, then the referenced Product Page's own title (own-product
 * lines may leave the override blank), then a neutral fallback so a broken
 * line still reads as something rather than a gap.
 *
 * The Geiger `sku` is deliberately NOT part of the name - see the withheld
 * fields note in components/quote/QuoteDocument.tsx.
 */
export function quoteLineTitle(line: QuoteLineNameSource | null | undefined): string {
  if (!line) return 'Item';
  const explicit = cleanText(line.displayName) ?? cleanText(line.label);
  if (explicit) return explicit;
  const referenced = cleanText(line.product?.title);
  if (referenced) return referenced;
  return line._type === 'quoteChargeLine' ? 'Charge' : 'Item';
}

/** A charge line has no setup, no shipping, and no product identity. */
export function isQuoteChargeLine(line: { _type?: unknown } | null | undefined): boolean {
  return line?._type === 'quoteChargeLine';
}

/**
 * A money value worth PRINTING as its own row. Zero and blank both mean "there
 * is no such charge on this line", so neither gets a row: an empty "Setup: -"
 * column reads as missing information rather than as nothing owed. The line
 * total is always shown regardless.
 */
export function shownAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** A quantity worth printing (the schema requires >= 1, drafts may not have one). */
export function shownQuantity(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
