import 'server-only';

import { cachedClient } from '@/lib/sanity/client';
import { QUOTES_TAG, quoteTag } from '@/lib/sanity/cache-tags';
import { isQuoteToken } from '@/lib/quotes/token';
import type {
  QuoteChargeLineInput,
  QuoteProductLineInput,
} from '@/lib/quotes/quote-totals';
import type { SanityImage } from '@/lib/sanity/types';

// ---------------------------------------------------------------------------
// Quick Quote `quote` documents (Q-110 - data foundation). Nothing renders a
// quote yet; the future /quote/[token] customer page (next prompt) consumes
// `getQuoteByToken`. Mirrors lib/sanity/queries/product-pages.ts: every read
// is a non-CDN cache-tagged fetch (never no-store) so the future route stays
// statically prerenderable while the webhook revalidates a publish in
// seconds. The token IS the document slug - see lib/quotes/token.ts.
//
// PRICING IS READ FROM THE STORED LINE FIELDS ONLY. The own-product line's
// reference is dereferenced for DISPLAY data (title, slug, an image) - never
// for prices. A quote must show the same numbers next week even if Patrick
// edits the referenced product; the stored snapshot is the contract (see the
// comment in sanity/schemas/objects/quote-line-items.ts).
// ---------------------------------------------------------------------------

export interface QuoteCustomerBlock {
  company?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface QuoteRepBlock {
  name?: string;
  email?: string;
  phone?: string;
}

/** Shared display/commercial fields as stored on a line (all optional on drafts). */
interface QuoteLineBase {
  _key?: string;
  decorationMethod?: string;
  note?: string;
}

export type QuoteGeigerLine = QuoteProductLineInput &
  QuoteLineBase & {
    _type: 'quoteGeigerLine';
    sku?: string;
    displayName?: string;
    imageUrl?: string;
    description?: string;
  };

export type QuoteOwnProductLine = QuoteProductLineInput &
  QuoteLineBase & {
    _type: 'quoteOwnProductLine';
    displayName?: string;
    /**
     * Snapshot copies written by the Q-130 "Pull details from this product"
     * button. Blank means fall back to the referenced product below - which is
     * why the deref exists at all. (These were added to the schema in Q-130 and
     * always arrived through the projection's `...` spread; the type simply had
     * not caught up, so a consumer could not read them - Q-140.)
     */
    imageUrl?: string;
    description?: string;
    /** Display-only deref of the referenced productPage (never priced from). */
    product?: {
      _id: string;
      title?: string;
      slug?: string;
      image?: SanityImage & { alt?: string };
    } | null;
  };

export type QuoteCustomLine = QuoteProductLineInput &
  QuoteLineBase & {
    _type: 'quoteCustomLine';
    displayName?: string;
    image?: (SanityImage & { alt?: string }) | null;
    description?: string;
  };

export type QuoteChargeLine = QuoteChargeLineInput &
  QuoteLineBase & {
    _type: 'quoteChargeLine';
    label?: string;
  };

export type QuoteLineItem =
  | QuoteGeigerLine
  | QuoteOwnProductLine
  | QuoteCustomLine
  | QuoteChargeLine;

/**
 * A deliberate customer action, as carried on the quote for display (Q-150).
 * Views are excluded by the projection: telling a customer "you opened this
 * page" is noise, and the page only needs to show what they DID.
 */
export interface QuoteResponseSummary {
  kind?: string;
  createdAt?: string;
  comment?: string;
}

export interface QuoteDoc {
  _id: string;
  quoteNumber?: string;
  /** The private token (= slug.current). Never log it. */
  token?: string;
  title?: string;
  customer?: QuoteCustomerBlock;
  rep?: QuoteRepBlock;
  quoteDate?: string;
  expiryDate?: string;
  lineItems?: QuoteLineItem[];
  salesTax?: number;
  sentAt?: string;
  /**
   * This quote's accept / request-a-change records, newest first (Q-150). Rides
   * the SAME tag-cached fetch as the quote itself, so the response route's
   * `quoteTag(token)` bust refreshes both in one go and the page still makes
   * exactly ONE Sanity read.
   */
  responses?: QuoteResponseSummary[];
}

const QUOTE_PROJECTION = /* groq */ `{
  _id,
  quoteNumber,
  "token": slug.current,
  title,
  "customer": {
    "company": customerCompany,
    "name": customerName,
    "email": customerEmail,
    "phone": customerPhone,
    "address": customerAddress
  },
  "rep": {
    "name": repName,
    "email": repEmail,
    "phone": repPhone
  },
  quoteDate,
  expiryDate,
  lineItems[]{
    ...,
    _type == "quoteOwnProductLine" => {
      "product": product->{
        _id,
        title,
        "slug": slug.current,
        "image": coalesce(colorVariants[0].images[0], defaultImages[0])
      }
    }
  },
  salesTax,
  sentAt,
  "responses": *[
    _type == "quoteResponse" &&
    quote._ref == ^._id &&
    kind in ["accepted", "revisionRequested"]
  ] | order(createdAt desc)[0...5]{ kind, createdAt, comment }
}`;

/**
 * Fetch one published quote by its private token. Returns null for an
 * unknown, malformed, or unpublished token - never throws (the future
 * customer route turns null into a 404). The malformed-token early return
 * also keeps junk out of the cache-tag space: only 32-lowercase-hex values
 * ever build a `quote:<token>` tag.
 */
export async function getQuoteByToken(token: string): Promise<QuoteDoc | null> {
  if (!isQuoteToken(token)) return null;
  try {
    // Param named `slug` (not `token`) - `token` is a reserved option name in
    // the Sanity client's QueryParams type.
    const doc = await cachedClient.fetch<QuoteDoc | null>(
      `*[_type == "quote" && slug.current == $slug][0]${QUOTE_PROJECTION}`,
      { slug: token },
      { next: { tags: [QUOTES_TAG, quoteTag(token)].filter(Boolean), revalidate: false } },
    );
    return doc ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reads for the response WRITE route (Q-150)
//
// Deliberately UNCACHED (`cache: 'no-store'`), unlike everything above. These
// run inside a force-dynamic API route, never on a render path, so they cannot
// affect the staticness of any page - and they must see the truth right now.
// Deciding whether a quote has expired, or whether a view was already recorded
// two minutes ago, from a cached copy would be the one place a stale read does
// real damage. The client is still the `perspective: 'published'` cachedClient,
// so an unreviewed DRAFT quote is invisible here exactly as it is to the page.
// ---------------------------------------------------------------------------

export interface QuoteForResponse {
  _id: string;
  quoteNumber?: string;
  expiryDate?: string;
  sentAt?: string;
  customerCompany?: string;
  customerName?: string;
  customerEmail?: string;
  repEmail?: string;
  /** Line items, so the notification email can state the quote's total. */
  lineItems?: unknown;
  salesTax?: number;
  /** `createdAt` of the newest existing `viewed` response, for the debounce. */
  lastViewedAt?: string | null;
}

/**
 * The minimum a response needs about its quote: who it is for, whether it has
 * expired, whether it was ever sent, and enough to price it in the email.
 * Returns null for an unknown, malformed, unpublished or deleted token, which
 * the route turns into the same 404 shape the page uses.
 */
export async function getQuoteForResponse(token: string): Promise<QuoteForResponse | null> {
  if (!isQuoteToken(token)) return null;
  try {
    const doc = await cachedClient.fetch<QuoteForResponse | null>(
      `*[_type == "quote" && slug.current == $slug][0]{
        _id,
        quoteNumber,
        expiryDate,
        sentAt,
        customerCompany,
        customerName,
        customerEmail,
        repEmail,
        lineItems,
        salesTax,
        "lastViewedAt": *[
          _type == "quoteResponse" && quote._ref == ^._id && kind == "viewed"
        ] | order(createdAt desc)[0].createdAt
      }`,
      { slug: token },
      { cache: 'no-store' },
    );
    return doc ?? null;
  } catch {
    return null;
  }
}
