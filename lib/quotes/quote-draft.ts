/**
 * Building a DRAFT quote from a customer's "Get a Quote" submission (Q-150
 * part 6).
 *
 * PURE + CLIENT-SAFE (no fs, no Sanity, no `server-only`, no node:crypto): the
 * caller supplies the already-resolved product and the freshly generated token,
 * and gets back the document body to create. That keeps every rule below under
 * vitest.
 *
 * THE THREE RULES THIS MODULE EXISTS TO ENFORCE
 *
 * 1. A DRAFT, NEVER PUBLISHED. The caller writes it at a `drafts.` id. A quote
 *    nobody has reviewed must never be reachable at a live customer link, and
 *    the customer page reads through a `perspective: 'published'` client, so a
 *    draft's token simply 404s until Patrick publishes it.
 *
 * 2. PRICES ARE RECOMPUTED FROM THE PRODUCT, NEVER TAKEN FROM THE BROWSER. The
 *    form posts `estimatedTotal` as a DISPLAY STRING ("$1,234.00") and the
 *    decoration as an annotated label ("Pad Print (+$0.50/unit)"), so there is
 *    no numeric price on the wire to trust even if we wanted to. Everything
 *    commercial comes from `buildOwnProductPrefill`, which runs the SAME tier
 *    and setup-charge helpers the live configurator uses.
 *
 * 3. NO QUOTE NUMBER. Numbers come from Patrick's deliberate "Assign quote
 *    number" button (lib/quotes/numbering.ts). If a submission burned a number,
 *    every abandoned or spam enquiry would leave a permanent hole in a sequence
 *    that appears on customer-facing documents.
 */

import { buildOwnProductPrefill, type OwnProductSource } from './quote-prefill';

/** How many days a generated draft is valid for, matching the schema default. */
export const DRAFT_QUOTE_VALID_DAYS = 30;

/** Trimmed non-empty string, or null. */
function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The decoration name WITHOUT the per-unit annotation the quote form appends.
 *
 * The form deliberately posts "Pad Print (+$0.50/unit)" so the lead email shows
 * the upcharge, but a quote line stores the method itself and has to match one
 * of the product's own decoration methods for the per-method setup charge to
 * resolve. Stripping here is preferred over adding a second hidden field
 * because it needs no change to the live form and cannot desynchronise from it.
 */
export function stripDecorationAnnotation(value: unknown): string | null {
  const text = clean(value);
  if (!text) return null;
  return clean(text.replace(/\s*\((?:\+|-)?\$[^)]*\)\s*$/, ''));
}

/** ISO calendar day (YYYY-MM-DD) offset from a reference date, in UTC. */
export function isoDayFrom(now: Date, dayOffset = 0): string {
  const d = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** A positive integer quantity from the posted string, else null. */
export function parseQuantity(value: unknown): number | null {
  const text = clean(value);
  if (!text) return null;
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface DraftQuoteSubmission {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  quantityNeeded?: string;
  dateNeeded?: string;
  selectedColor?: string;
  selectedSize?: string;
  /** The ANNOTATED decoration string the form posts. */
  selectedDecoration?: string;
  comments?: string;
  shippingZip?: string;
  sourceUrl?: string;
}

export interface DraftQuoteProduct extends OwnProductSource {
  /** The productPage document id, for the line's reference. */
  _id: string;
}

export interface BuildDraftQuoteInput {
  submission: DraftQuoteSubmission;
  product: DraftQuoteProduct;
  /** A freshly generated 32-lowercase-hex token (lib/quotes/token.ts). */
  token: string;
  /** The address the lead notification actually went to. */
  repEmail?: string | null;
  now: Date;
}

export interface DraftQuoteResult {
  /** The document body to create at a `drafts.` id. Never includes quoteNumber. */
  doc: Record<string, unknown>;
  /** Things Patrick should know, surfaced in the lead email. */
  warnings: string[];
}

/**
 * The customer-supplied context that belongs on the line rather than in a
 * customer field: what they picked and anything they typed. Kept as the line
 * NOTE (which the customer's quote page renders) rather than invented into
 * pricing.
 */
function buildLineNote(submission: DraftQuoteSubmission): string | null {
  const parts: string[] = [];
  const color = clean(submission.selectedColor);
  const size = clean(submission.selectedSize);
  const date = clean(submission.dateNeeded);
  const zip = clean(submission.shippingZip);
  const comments = clean(submission.comments);
  if (color) parts.push(`Color: ${color}`);
  if (size) parts.push(`Size: ${size}`);
  if (date) parts.push(`Needed by: ${date}`);
  if (zip) parts.push(`Ship to zip: ${zip}`);
  const head = parts.join(' | ');
  if (head && comments) return `${head}\n\nCustomer note: ${comments}`;
  if (head) return head;
  return comments ? `Customer note: ${comments}` : null;
}

/**
 * Assembles the draft. Every field is optional-tolerant: a submission missing
 * a company, a colour, or a usable quantity still produces a usable draft with
 * a warning attached, because a half-filled draft Patrick can finish is far
 * better than no draft at all.
 */
export function buildDraftQuote(input: BuildDraftQuoteInput): DraftQuoteResult {
  const { submission, product, token, now } = input;
  const warnings: string[] = [];

  const quantity = parseQuantity(submission.quantityNeeded);
  if (quantity === null) {
    warnings.push('The submission had no usable quantity, so the draft line has none. Set it before you send.');
  }

  const decorationMethod = stripDecorationAnnotation(submission.selectedDecoration);

  // Prices come from the PRODUCT, through the same helpers the live page uses.
  const prefill = buildOwnProductPrefill(product, {
    quantity: quantity ?? undefined,
    decorationMethod,
  });
  warnings.push(...prefill.warnings);

  const contactName = [clean(submission.firstName), clean(submission.lastName)]
    .filter(Boolean)
    .join(' ');

  const line: Record<string, unknown> = {
    _type: 'quoteOwnProductLine',
    _key: 'line-1',
    product: { _type: 'reference', _ref: product._id },
  };
  if (prefill.displayName) line.displayName = prefill.displayName;
  if (prefill.imageUrl) line.imageUrl = prefill.imageUrl;
  if (prefill.description) line.description = prefill.description;
  if (quantity !== null) line.quantity = quantity;
  if (decorationMethod) line.decorationMethod = decorationMethod;
  // A resolved 0 setup charge is a real answer ("this method has no setup
  // fee"), so it is written; null means nothing was knowable and the field is
  // left for Patrick.
  if (prefill.unitCost !== null) line.unitCost = prefill.unitCost;
  if (prefill.setupCharge !== null) line.setupCharge = prefill.setupCharge;
  const note = buildLineNote(submission);
  if (note) line.note = note;

  const doc: Record<string, unknown> = {
    _type: 'quote',
    // NO quoteNumber on purpose - see rule 3 in the file comment.
    slug: { _type: 'slug', current: token },
    title: `Website request${contactName ? ` from ${contactName}` : ''}${clean(submission.company) ? ` (${clean(submission.company)})` : ''}`.slice(0, 200),
    quoteDate: isoDayFrom(now, 0),
    expiryDate: isoDayFrom(now, DRAFT_QUOTE_VALID_DAYS),
    lineItems: [line],
  };

  const company = clean(submission.company);
  const email = clean(submission.email);
  const phone = clean(submission.phone);
  if (company) doc.customerCompany = company;
  if (contactName) doc.customerName = contactName;
  if (email) doc.customerEmail = email;
  if (phone) doc.customerPhone = phone;

  // The rep block: only the address the lead actually went to, because that is
  // a fact. Name and phone are left blank rather than guessed - the Studio's
  // own defaults only apply to quotes created there.
  const repEmail = clean(input.repEmail);
  if (repEmail) doc.repEmail = repEmail;

  return { doc, warnings };
}
