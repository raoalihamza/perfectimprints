/**
 * Full-product ItemList JSON-LD for product listing pages (SNIP-100).
 *
 * This is the shared serializer the SNIP diagnostic called for: one pure
 * function turning the `GeigerProduct` objects a listing page already holds at
 * render time into an ItemList whose entries are nested `Product` entities
 * (name, url, image, brand, sku, offer) instead of the thin 3-field ListItem
 * `itemListSchema()` emits. It reads nothing: no fs, no Sanity, no network.
 * Nothing here can make a route dynamic.
 *
 * WHO CALLS IT. As of SNIP-100 only the brand pages
 * (`app/brands/[...slug]/page.tsx`). `/cat` is the next piece and must reuse
 * this function rather than growing a second serializer; the guards below are
 * written for the full catalog, not just the brand subset.
 *
 * PAGINATION SEMANTICS. Callers pass the products RENDERED ON THIS PAGE, so a
 * `/page/N` document describes its own grid only, with positions restarting at
 * 1. That matches Google's carousel/ItemList guidance ("contains all the items
 * that are listed on the page") and keeps every page's markup a true statement
 * about that page. Callers must skip emission entirely for empty grids rather
 * than emitting an empty list.
 *
 * WHAT IS DELIBERATELY OMITTED (SNIP-000 measurements, do not "complete" these):
 * - `description`: it alone tripled the block in the measurement.
 * - `availability`: no stock field exists anywhere in the scraped data;
 *   inventing InStock for third-party catalog items would be fabrication.
 * - a single `price` / `msrp`-as-list-price: `msrp` is a byte-for-byte alias of
 *   `high_price` on all 7,957 records; the only honest price is the range.
 * - `gtin` / `mpn` / ratings / reviews / `priceValidUntil`: not in the data.
 *
 * THE OFFER URL. The Product `url` is the affiliate destination
 * (patrickblack.geiger.com), the same URL the visible card links to; products
 * with an internal detail page (`detailUrl`) point there instead, mirroring
 * ProductCard. `offers.url` is not emitted: it would duplicate the Product url
 * byte for byte. A product with no real destination gets NO url at all, never
 * the bare affiliate homepage (the SNIP-000 fallback bug).
 */

import { affiliateUrl } from '../affiliate-url';
import type { GeigerProduct } from '../product-types';
import { largeSocialImage } from './open-graph';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

/** UN/CEFACT code for "one / each", matching lib/products/product-schema.ts. */
const UNIT_EACH = 'C62';

/**
 * The destination this product's entity should claim, or null when there is no
 * honest one. Internal detail pages win over the affiliate URL (same precedence
 * as ProductCard); a product with neither emits no url rather than falling back
 * to the bare affiliate homepage.
 */
function productDestinationUrl(p: GeigerProduct): string | null {
  if (p.detailUrl) {
    return /^https?:\/\//i.test(p.detailUrl) ? p.detailUrl : `${SITE_URL}${p.detailUrl}`;
  }
  if (p.geiger_url) return affiliateUrl(p.geiger_url);
  return null;
}

/**
 * A SKU worth telling Google about: the real Geiger item number (spaces and all,
 * e.g. "501014 90A"). Synthesized `custom-<sanity-id>` SKUs are internal ids,
 * not catalog numbers, and are suppressed exactly like ProductCard's Item #.
 */
function realSku(sku: string | null | undefined): string | null {
  const s = (sku ?? '').trim();
  if (!s || s.startsWith('custom-')) return null;
  return s;
}

/**
 * AggregateOffer for the catalog's genuine price range, qualified with the
 * minimum order quantity so the low price cannot be read as a single-unit
 * consumer price (the FIX-830 rule). Returns null when there is no usable
 * price; the caller then emits the Product without offers rather than a guess.
 */
function offerFor(p: GeigerProduct): Record<string, unknown> | null {
  const low = p.low_price;
  if (typeof low !== 'number' || !Number.isFinite(low) || low <= 0) return null;
  const high =
    typeof p.high_price === 'number' && Number.isFinite(p.high_price) && p.high_price >= low
      ? p.high_price
      : low;

  const offer: Record<string, unknown> = {
    '@type': 'AggregateOffer',
    priceCurrency: 'USD',
    lowPrice: low,
    highPrice: high,
  };

  const minQty = p.min_qty;
  if (typeof minQty === 'number' && Number.isFinite(minQty) && minQty > 0) {
    offer.eligibleQuantity = {
      '@type': 'QuantitativeValue',
      value: minQty,
      unitCode: UNIT_EACH,
    };
  }

  return offer;
}

/**
 * One ListItem carrying a full Product entity, or null for a product with no
 * usable name (a nameless Product is noise; the caller renumbers positions).
 * Every field beyond the name is conditional on the data actually being there.
 */
export function productListItem(p: GeigerProduct, position: number): Record<string, unknown> | null {
  const name = (p.name ?? '').trim();
  if (!name) return null;

  const product: Record<string, unknown> = {
    '@type': 'Product',
    name,
  };

  const url = productDestinationUrl(p);
  if (url) product.url = url;

  // Structured-data image gets the ~1200px social variant (M-SEO5), same as
  // og:image; the rendered grid keeps requesting its own thumbnails.
  const image = p.imageUrl ? largeSocialImage(p.imageUrl) : null;
  if (image) product.image = image;

  const brand = (p.brand ?? '').trim();
  if (brand) product.brand = { '@type': 'Brand', name: brand };

  const sku = realSku(p.sku);
  if (sku) product.sku = sku;

  const offers = offerFor(p);
  if (offers) product.offers = offers;

  return {
    '@type': 'ListItem',
    position,
    item: product,
  };
}

/**
 * The ItemList for one page of a product listing. Positions are sequential and
 * 1-based over the items actually emitted (a skipped nameless product does not
 * leave a hole). Callers must not call this with an empty grid; if every entry
 * is skipped the result still degrades to a valid empty list, but the intended
 * contract is "products are rendering, describe them".
 */
export function productItemListSchema(products: GeigerProduct[]): Record<string, unknown> {
  const itemListElement: Record<string, unknown>[] = [];
  for (const p of products) {
    const entry = productListItem(p, itemListElement.length + 1);
    if (entry) itemListElement.push(entry);
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: itemListElement.length,
    itemListElement,
  };
}
