/**
 * The quote, reduced to exactly what the PDF prints (Q-160).
 *
 * PURE + CLIENT-SAFE (no fs, no Sanity, no `server-only`, no React), the same
 * discipline as lib/quotes/quote-totals.ts, quote-display.ts and
 * quote-response.ts. Every decision the printed document makes - what a line is
 * called, which amounts are worth a column, whether the quote has expired, what
 * the file is called, and which image URL is safe to hand a PDF renderer - is
 * made HERE and unit tested, so the renderer component only lays things out.
 *
 * WHY A SEPARATE MODEL AND NOT THE PAGE COMPONENT'S SHAPE. The PDF is
 * deliberately SIMPLER than the web page: a fixed six-column business table
 * rather than a responsive card list. Two layouts that try to match each other
 * pixel for pixel drift apart the moment either is touched. What they do NOT
 * get to disagree on is the numbers, which is why every amount below comes from
 * the shared `computeQuoteTotals` and nothing is recomputed inline.
 *
 * WHAT IS WITHHELD, and it is the SAME list the page withholds (see the header
 * comment in components/quote/QuoteDocument.tsx): the internal `title`, the
 * `sentAt` date, a Geiger line's supplier `sku`, and any link to
 * /products/<slug> (whose live pricing would contradict the frozen quote
 * price). Nothing internal is modelled here at all, so the renderer cannot
 * print it by accident.
 *
 * The customer's own email, phone and address WERE on that list until Q-200,
 * when Patrick decided the printed quote should carry the full "prepared for"
 * block the way a business quotation normally does. They are modelled below and
 * printed; the rest of the withheld list is unchanged, and the page and the PDF
 * still show exactly the same set of fields.
 */

import {
  cleanText,
  formatQuoteDate,
  isQuoteChargeLine,
  isQuoteExpired,
  quoteAddressLines,
  quoteLineTitle,
  shownAmount,
  shownQuantity,
} from './quote-display';
import { computeQuoteTotals } from './quote-totals';

/**
 * Hard bounds on the two free-text fields, so ONE row can never grow taller
 * than a page.
 *
 * Rows are rendered with `wrap={false}` (a quote line split across a page break
 * is unreadable), and a non-wrapping block taller than the page gets clipped by
 * the renderer - which would silently lose content. The Studio pre-fill already
 * caps a pulled description at 300 characters, so in practice these never bite;
 * they exist for the hand-typed outlier. Cutting is on a word boundary with a
 * trailing ellipsis so it reads as "there is more" rather than as a glitch.
 */
export const QUOTE_PDF_DESCRIPTION_MAX_CHARS = 600;
export const QUOTE_PDF_NOTE_MAX_CHARS = 400;

/** A Sanity image object to an absolute URL. Injected so this module stays pure. */
export type SanityImageResolver = (source: unknown) => string | null;

// ---------------------------------------------------------------------------
// Structural inputs
//
// Deliberately NOT the QuoteLineItem / QuoteDoc union from
// lib/sanity/queries/quotes.ts, which is `server-only`: importing it would make
// this module unimportable from a test or from anywhere client-side, for no
// gain. Same reason lib/products/product-page-pricing.ts uses *Source shapes.
// ---------------------------------------------------------------------------

export interface QuotePdfLineSource {
  _key?: unknown;
  _type?: unknown;
  displayName?: unknown;
  label?: unknown;
  description?: unknown;
  note?: unknown;
  decorationMethod?: unknown;
  quantity?: unknown;
  unitCost?: unknown;
  unitPrice?: unknown;
  setupCharge?: unknown;
  shipping?: unknown;
  /** Snapshot image URL on a Geiger / own-product line. */
  imageUrl?: unknown;
  /** A `quoteCustomLine`'s own uploaded image. */
  image?: unknown;
  /** Display-only deref of a referenced Product Page (never priced from). */
  product?: { title?: unknown; image?: unknown } | null;
}

export interface QuotePdfQuoteSource {
  quoteNumber?: unknown;
  quoteDate?: unknown;
  expiryDate?: unknown;
  customer?: {
    company?: unknown;
    name?: unknown;
    email?: unknown;
    phone?: unknown;
    address?: unknown;
  } | null;
  rep?: { name?: unknown; email?: unknown; phone?: unknown } | null;
  lineItems?: unknown;
  salesTax?: unknown;
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

export interface QuotePdfLine {
  /** Stable React key for the row. */
  key: string;
  title: string;
  isCharge: boolean;
  decoration: string | null;
  description: string | null;
  note: string | null;
  /** Absolute, renderer-safe image URL, or null when this line has no picture. */
  imageUrl: string | null;
  quantity: number | null;
  /** "Unit price" on a product line, "Price each" on a charge. */
  unitLabel: string;
  unitAmount: number | null;
  /** Null on a charge line and on a zero/blank value, exactly as on the page. */
  setup: number | null;
  shipping: number | null;
  total: number;
}

export interface QuotePdfModel {
  quoteNumber: string | null;
  quoteDate: string | null;
  expiryDate: string | null;
  expired: boolean;
  customerCompany: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  /**
   * The address as the lines to print, already split and cleaned. An EMPTY
   * array means print nothing: phone and address are optional on a quote, and
   * an empty line under a heading reads as information that went missing.
   */
  customerAddressLines: string[];
  repName: string | null;
  repEmail: string | null;
  repPhone: string | null;
  lines: QuotePdfLine[];
  /**
   * Whether the Setup / Shipping columns are printed at all. A column no line
   * uses is dropped from the table rather than printed full of blanks: an empty
   * money column reads as information that went missing, which is the same rule
   * the page applies per row.
   */
  showSetupColumn: boolean;
  showShippingColumn: boolean;
  subtotal: number;
  shippingTotal: number;
  salesTax: number;
  grandTotal: number;
}

/**
 * An image URL a PDF renderer can actually use.
 *
 * TWO PROBLEMS, both learned the expensive way in the Q-120 spike:
 *
 *  1. Every `imageUrl` in the Geiger catalog carries `format=webp`, and the
 *     renderer decodes JPEG and PNG only. It works today purely because the CDN
 *     content-negotiates and sends JPEG to a client that did not ask for webp.
 *     That is the CDN's choice, not a guarantee, so the parameter is stripped
 *     here rather than relied on. (The fetch layer then also sends an explicit
 *     Accept header AND verifies the returned bytes are really JPEG or PNG -
 *     see lib/quotes/pdf/quote-pdf-images.ts. Belt, braces, and a check.)
 *  2. Anything that is not plain http(s) - a data: URI, a relative path, junk -
 *     is dropped rather than handed to the renderer to fail on mid-layout.
 */
export function normalizeQuoteImageUrl(raw: unknown): string | null {
  const text = cleanText(raw);
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const format = url.searchParams.get('format');
  if (format && !/^(jpe?g|png)$/i.test(format)) url.searchParams.delete('format');

  return url.toString();
}

/** A free-text field, collapsed and hard-capped on a word boundary. */
export function clampQuoteText(value: unknown, max: number): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const collapsed = text.replace(/[ \t]+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return `${trimmed}...`;
}

/**
 * The picture for one line, in the SAME precedence the page uses (the snapshot
 * captured on the quote wins over the referenced product's own image, exactly
 * as the prices do). Charge lines never have one.
 */
export function quotePdfLineImage(
  line: QuotePdfLineSource,
  resolveSanityImage?: SanityImageResolver,
): string | null {
  if (line._type === 'quoteChargeLine') return null;

  if (line._type === 'quoteGeigerLine' || line._type === 'quoteOwnProductLine') {
    const snapshot = normalizeQuoteImageUrl(line.imageUrl);
    if (snapshot) return snapshot;
  }
  if (!resolveSanityImage) return null;

  if (line._type === 'quoteOwnProductLine') {
    return normalizeQuoteImageUrl(resolveSanityImage(line.product?.image));
  }
  if (line._type === 'quoteCustomLine') {
    return normalizeQuoteImageUrl(resolveSanityImage(line.image));
  }
  return null;
}

/**
 * The whole printable model in one pass. Draft tolerant by construction: every
 * field may be absent, a quote with no line items yields an empty `lines` array
 * (the renderer prints an empty-state note instead of a totals block), and
 * nothing here throws.
 */
export function buildQuotePdfModel(
  quote: QuotePdfQuoteSource,
  now: Date,
  resolveSanityImage?: SanityImageResolver,
): QuotePdfModel {
  const rawLines: QuotePdfLineSource[] = Array.isArray(quote.lineItems)
    ? (quote.lineItems as QuotePdfLineSource[])
    : [];
  const totals = computeQuoteTotals(rawLines, quote.salesTax);

  const lines: QuotePdfLine[] = rawLines.map((line, index) => {
    const isCharge = isQuoteChargeLine(line as { _type?: unknown });
    return {
      key: typeof line?._key === 'string' && line._key ? line._key : `line-${index}`,
      title: quoteLineTitle(line as never),
      isCharge,
      decoration: isCharge ? null : cleanText(line?.decorationMethod),
      description: isCharge ? null : clampQuoteText(line?.description, QUOTE_PDF_DESCRIPTION_MAX_CHARS),
      note: clampQuoteText(line?.note, QUOTE_PDF_NOTE_MAX_CHARS),
      imageUrl: quotePdfLineImage(line ?? {}, resolveSanityImage),
      quantity: shownQuantity(line?.quantity),
      unitLabel: isCharge ? 'Price each' : 'Unit price',
      unitAmount: isCharge ? shownAmount(line?.unitPrice) : shownAmount(line?.unitCost),
      setup: isCharge ? null : shownAmount(line?.setupCharge),
      shipping: isCharge ? null : shownAmount(line?.shipping),
      total: totals.lineTotals[index] ?? 0,
    };
  });

  return {
    quoteNumber: cleanText(quote.quoteNumber),
    quoteDate: formatQuoteDate(quote.quoteDate) || null,
    expiryDate: formatQuoteDate(quote.expiryDate) || null,
    expired: isQuoteExpired(quote.expiryDate, now),
    customerCompany: cleanText(quote.customer?.company),
    customerName: cleanText(quote.customer?.name),
    customerEmail: cleanText(quote.customer?.email),
    customerPhone: cleanText(quote.customer?.phone),
    customerAddressLines: quoteAddressLines(quote.customer?.address),
    repName: cleanText(quote.rep?.name),
    repEmail: cleanText(quote.rep?.email),
    repPhone: cleanText(quote.rep?.phone),
    lines,
    showSetupColumn: lines.some((l) => l.setup !== null),
    showShippingColumn: lines.some((l) => l.shipping !== null),
    subtotal: totals.subtotal,
    shippingTotal: totals.shippingTotal,
    salesTax: totals.salesTax,
    grandTotal: totals.grandTotal,
  };
}

/**
 * The name the file lands under in the customer's Downloads folder. It carries
 * the quote number because that is the one string that makes a saved or
 * forwarded copy identifiable weeks later ("Quote-Q-1007-Perfect-Imprints.pdf").
 *
 * Every character outside [A-Za-z0-9._-] is replaced: a quote number is
 * Patrick's free text, and a quotation mark, a slash or a newline in a
 * Content-Disposition filename is a header-injection hole, not a cosmetic issue.
 */
export function quotePdfFileName(quoteNumber: unknown): string {
  const raw = cleanText(quoteNumber);
  const safe = raw ? raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') : '';
  return safe ? `Quote-${safe}-Perfect-Imprints.pdf` : 'Quote-Perfect-Imprints.pdf';
}
