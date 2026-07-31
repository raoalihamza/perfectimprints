/**
 * Quote totals math for the Quick Quote module (Q-110). PURE + CLIENT-SAFE:
 * no fs, no Sanity, no `server-only` - the Studio totals preview, the future
 * customer-facing /quote/<token> page, the future PDF, and the future emails
 * all import THESE functions, so a quote can never show two different grand
 * totals on two surfaces. This is the same "one source of truth" rule that
 * keeps the product page and its quote modal in agreement today
 * (lib/products/quote-estimate.ts).
 *
 * TOTALS ARE NEVER STORED ON THE QUOTE DOCUMENT. Every surface that needs a
 * total calls this module against the quote's line items. The only stored
 * money inputs are the per-line values Patrick entered (unit cost, setup,
 * shipping, charge price) plus the quote-level sales tax - see the snapshot
 * comment in sanity/schemas/objects/quote-line-items.ts.
 *
 * Draft tolerance: any missing, negative, or non-finite input is treated as
 * ZERO, and nothing here ever throws - a half-filled draft in Studio must
 * still render a (partial) total, never crash the form.
 */

import { effectiveSetupCharge, formatUsd } from '../products/quote-estimate';

/** The three product-shaped line types (they share the commercial fields). */
export const QUOTE_PRODUCT_LINE_TYPES = [
  'quoteGeigerLine',
  'quoteOwnProductLine',
  'quoteCustomLine',
] as const;

export const QUOTE_CHARGE_LINE_TYPE = 'quoteChargeLine';

export type QuoteProductLineType = (typeof QUOTE_PRODUCT_LINE_TYPES)[number];

/** Commercial fields shared by the three product-shaped line types. */
export interface QuoteProductLineInput {
  _type: QuoteProductLineType;
  quantity?: number | null;
  /** Patrick-entered unit cost in USD (a stored snapshot, never live). */
  unitCost?: number | null;
  /** Patrick-entered one-time setup charge for this line, USD. */
  setupCharge?: number | null;
  /** Patrick-entered shipping for this line, USD. */
  shipping?: number | null;
}

/** A charge line: label + quantity x unit price (art fee, rush charge, ...). */
export interface QuoteChargeLineInput {
  _type: typeof QUOTE_CHARGE_LINE_TYPE;
  quantity?: number | null;
  unitPrice?: number | null;
}

export type QuoteLineInput = QuoteProductLineInput | QuoteChargeLineInput;

export interface QuoteTotals {
  /**
   * Per-line totals in input order, each rounded to cents. A product line's
   * total INCLUDES that line's shipping (quantity x unit cost + setup +
   * shipping); a charge line's total is quantity x unit price. Unrecognized
   * entries contribute 0 (kept in the array so indexes line up with the doc).
   */
  lineTotals: number[];
  /**
   * Merchandise subtotal: every product line's (quantity x unit cost + setup)
   * plus every charge line total - shipping EXCLUDED (it has its own row), so
   * subtotal + shippingTotal always equals the sum of the line totals.
   */
  subtotal: number;
  /** Sum of every line's shipping. */
  shippingTotal: number;
  /** The sales tax exactly as entered on the quote (sanitized, not computed). */
  salesTax: number;
  /** subtotal + shippingTotal + salesTax, rounded to cents. */
  grandTotal: number;
}

/** Money-safe rounding to whole cents (half-up; float-noise tolerant). */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** A usable money amount: finite and 0 or more, else 0. */
function moneyOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** A usable quantity: finite and above 0, else 0 (a draft with no qty prices at 0 units). */
function quantityOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProductLine(line: Record<string, unknown>): boolean {
  return (QUOTE_PRODUCT_LINE_TYPES as readonly string[]).includes(String(line._type));
}

/**
 * A product line's stored setup charge, sanitized through the SAME resolution
 * helper the /products configurator uses (`effectiveSetupCharge`, Q-100) so
 * the "finite and 0 or more, else treated as not set" semantics can never
 * drift between the estimate and the quote. With no decoration options and no
 * method, the helper reduces to exactly that sanitization of the flat value.
 */
function lineSetupCharge(line: Record<string, unknown>): number {
  const raw = line.setupCharge;
  return effectiveSetupCharge([], null, typeof raw === 'number' ? raw : null);
}

/**
 * The total of ONE line item, rounded to cents:
 *  - product-shaped line (Geiger / own product / custom item):
 *    quantity x unit cost + setup charge + shipping
 *  - charge line: quantity x unit price
 *  - anything unrecognized (or not an object): 0
 */
export function quoteLineTotal(line: unknown): number {
  if (!isRecord(line)) return 0;
  if (line._type === QUOTE_CHARGE_LINE_TYPE) {
    return roundCents(quantityOrZero(line.quantity) * moneyOrZero(line.unitPrice));
  }
  if (isProductLine(line)) {
    return roundCents(
      quantityOrZero(line.quantity) * moneyOrZero(line.unitCost) +
        lineSetupCharge(line) +
        moneyOrZero(line.shipping),
    );
  }
  return 0;
}

/**
 * All quote totals in one pass. `lineItems` may be anything a half-filled
 * Studio draft can contain (undefined, junk entries, partial objects);
 * `salesTax` is the number Patrick TYPED on the quote - it is never computed
 * from the lines, only sanitized and added to the grand total.
 */
export function computeQuoteTotals(lineItems: unknown, salesTax?: unknown): QuoteTotals {
  const lines: unknown[] = Array.isArray(lineItems) ? lineItems : [];
  const lineTotals: number[] = [];
  let merchandise = 0;
  let shipping = 0;

  for (const line of lines) {
    lineTotals.push(quoteLineTotal(line));
    if (!isRecord(line)) continue;
    if (line._type === QUOTE_CHARGE_LINE_TYPE) {
      merchandise += roundCents(quantityOrZero(line.quantity) * moneyOrZero(line.unitPrice));
    } else if (isProductLine(line)) {
      merchandise += roundCents(
        quantityOrZero(line.quantity) * moneyOrZero(line.unitCost) + lineSetupCharge(line),
      );
      shipping += roundCents(moneyOrZero(line.shipping));
    }
  }

  const subtotal = roundCents(merchandise);
  const shippingTotal = roundCents(shipping);
  const tax = roundCents(moneyOrZero(salesTax));
  return {
    lineTotals,
    subtotal,
    shippingTotal,
    salesTax: tax,
    grandTotal: roundCents(subtotal + shippingTotal + tax),
  };
}

/**
 * Currency formatting, re-exported from the estimate module (the deterministic
 * en-US formatter every price surface already uses) so quote consumers import
 * ONE module. Do not add a second formatter here.
 */
export { formatUsd };
