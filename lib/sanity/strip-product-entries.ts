import type { SanityImage } from '@/lib/sanity/types';
import type { CustomProductDoc } from '@/lib/sanity/queries/custom-products';
import type { ProductPageCard } from '@/lib/sanity/queries/product-pages';

// ---------------------------------------------------------------------------
// Shared product-strip entry contract (Patrick feedback, 2026-07-11).
//
// Every product strip — the blog body's `blogProducts` block, the page-builder
// `productStrip` section, `landingPage.relatedProducts`, and
// `video.relatedProducts` — accepts the same three entry kinds:
//   1. `blogProduct` (unchanged legacy shape): a Geiger SKU resolved live from
//      products.json, or a fully manual title/image/url card.
//   2. A reference to a `productPage` → rendered as an INTERNAL card linking
//      to /products/<slug> via productPageToGeigerProduct()'s `detailUrl`.
//   3. A reference to a `customProduct` → rendered as the usual affiliate/
//      external card via customProductToGeigerProduct().
//
// This module is deliberately PURE (types + a GROQ fragment + a type guard,
// no runtime imports) so the non-server-only query modules (blogs.ts,
// videos.ts) can import the projection without inheriting a `server-only`
// poison. The ref→GeigerProduct normalizer lives in
// lib/sanity/queries/strip-entries.ts (server-only — it needs the converters).
// ---------------------------------------------------------------------------

/** The legacy `blogProduct` entry — SKU-backed or manual. Unchanged shape. */
export interface StripSkuOrManualEntry {
  _type?: 'blogProduct';
  _key?: string;
  sku?: string;
  title?: string;
  image?: SanityImage & { alt?: string };
  url?: string;
}

/** A dereferenced `productPage` reference (carries the card-field subset). */
export type StripProductPageRefEntry = { _type: 'productPage' } & ProductPageCard;

/** A dereferenced `customProduct` reference (carries the card fields). */
export type StripCustomProductRefEntry = {
  _type: 'customProduct';
  _id: string;
  title?: string;
} & Partial<Omit<CustomProductDoc, '_id' | 'title'>>;

export type StripProductRefEntry = StripProductPageRefEntry | StripCustomProductRefEntry;

/**
 * One projected strip entry. A DANGLING reference (target deleted/unpublished)
 * dereferences to `null` in the projected array, so consumers must null-guard
 * each item before touching its fields.
 */
export type StripProductEntry = StripSkuOrManualEntry | StripProductRefEntry;

export function isStripRefEntry(entry: StripProductEntry): entry is StripProductRefEntry {
  return entry._type === 'productPage' || entry._type === 'customProduct';
}

/**
 * GROQ projection for a strip's entries array — append after `products[]` /
 * `relatedProducts[]` (it includes its own braces). Mirrors the proven
 * `productPage.relatedProducts` deref in lib/sanity/queries/product-pages.ts:
 * `blogProduct` objects come through verbatim; references are dereferenced in
 * place, carrying the card fields for BOTH target types (fields the other type
 * lacks come back null and are ignored by the normalizer).
 *
 * NOTE (the P2-CP-001 gotcha): the reference member is NAMED
 * (`relatedProductRef` in the schemas), and Sanity stores a named array
 * member's `_type` as the member name — NOT 'reference' — so the deref
 * condition MUST key on `defined(_ref)` (true for any reference item, named or
 * not, and never for blogProduct objects). `_type == 'reference'` would
 * silently never match.
 *
 * `sku` is deliberately NOT projected off a dereferenced productPage (it may
 * carry a REAL Geiger item number) — the SKU-collection passes on the embedding
 * pages must never mistake a referenced product for a SKU-backed entry.
 */
export const STRIP_PRODUCT_ENTRIES_PROJECTION = `{
  _type == 'blogProduct' => { _type, _key, sku, title, image, url },
  defined(_ref) => @->{
    _type,
    _id,
    title,
    "slug": slug.current,
    brand,
    description,
    externalUrl,
    image,
    lowPrice,
    highPrice,
    msrp,
    minQty,
    productionTime,
    badges,
    placements,
    colors,
    material,
    features,
    types,
    madeInUsa,
    ecoFriendly,
    closeout,
    colorVariants,
    defaultImages,
    pricingTiers,
    onSale,
    showInNewProducts
  }
}`;
