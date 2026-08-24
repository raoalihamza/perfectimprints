/**
 * Full-product ItemList JSON-LD for product listing pages (SNIP-100).
 *
 * This is the shared serializer the SNIP diagnostic called for: one pure
 * function turning the `GeigerProduct` objects a listing page already holds at
 * render time into an ItemList whose entries are nested `Product` entities
 * (name, url, image, brand, sku, offer) instead of the thin 3-field ListItem
 * the retired `itemListSchema()` used to emit. It reads nothing: no fs, no
 * Sanity, no network. Nothing here can make a route dynamic.
 *
 * WHO CALLS IT. The brand pages (`app/brands/[...slug]/page.tsx`, SNIP-100),
 * the category pages (`app/cat/[...slug]/page.tsx` +
 * `components/category/CustomCategoryView.tsx`, SNIP-110), and the three
 * aggregator pages `/deals`, `/new-products` and `/rush-products` via
 * `aggregatorItemListSchema` at the bottom of this file (SNIP-120), and the
 * server-paginated `/promotional-products` (`app/promotional-products/page.tsx`,
 * SNIP-140), which passes `result.products`, the exact server-side slice its
 * grid renders, straight to `productItemListSchema`, and the blog post page
 * (`app/blog/[slug]/page.tsx`, SNIP-150), which passes the products its
 * in-body product strips render, gathered by the shared strip resolver
 * (`collectBlogStripProducts` in lib/sanity/queries/strip-entries.ts) so the
 * list and the cards are one resolution. Any further product listing surface
 * (video/page/landing strips, home rails, shop-by-theme) must reuse this
 * function rather than growing a second serializer; the guards below are
 * written for the full catalog.
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
 * - `gtin` / `mpn` / `priceValidUntil`: not in the data.
 * - `aggregateRating` / `review`: Google warns about both, and both stay
 *   unfixed ON PURPOSE. The site collects no customer reviews, so there is
 *   nothing to report; inventing ratings to silence a validator would be
 *   dishonest. Those two warnings are expected to persist forever.
 *
 * WHAT WAS ADDED LATER: `offers.offerCount` (SNIP-130), the one warning of
 * the three that COULD be answered from real data. See `knownOfferCount`
 * for how the number is derived and why it is true per product.
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
import { decodeHtmlEntities } from '../text-utils';
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
 * The number of offers an AggregateOffer over this record covers (SNIP-130).
 *
 * WHY THIS NUMBER IS TRUE. `offerCount` is documented as "the number of offers
 * for the product", and the honest answer is bounded by what the source
 * publishes. A single read-only call to Searchspring confirms the upstream feed
 * carries exactly four price fields per product - `low_price`, `high_price`,
 * `msrp` (a byte-for-byte alias of `high_price`) and `price` (an alias of
 * `low_price`) - and no tier count, variant count or offer count of any kind.
 * The scraper therefore drops nothing: there is no offer count to lose.
 *
 * So the only number that is both derivable and defensible is the count of
 * DISTINCT PRICES this record actually publishes, which is exactly what the
 * AggregateOffer beside it states and exactly what the visible card prints:
 *
 *   low !== high  ->  2   the card reads "$3.15 - $3.78", two known prices
 *   low === high  ->  1   the card reads "$4.00", one known price
 *
 * It is computed PER PRODUCT, never written as a constant. Today every one of
 * the 9,602 scraped Geiger records has low < high, so they all resolve to 2;
 * but a `customProduct` with only a low price, or a `productPage` with a single
 * pricing tier, normalizes to low === high and correctly gets 1. Hard-coding 2
 * would be false for those the moment Patrick creates one.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM. A promotional product usually has more
 * quantity breaks than two, and Geiger may well sell this item at five prices.
 * We do not know that number and will not invent it, so this understates rather
 * than overstates. Understating is safe: the two figures we publish are
 * demonstrably real offers, so the count is never a fabrication, only a floor.
 * If a future feed ever exposes a real tier count, that is what should replace
 * this - not a guess.
 */
function knownOfferCount(low: number, high: number): number {
  return high > low ? 2 : 1;
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
    offerCount: knownOfferCount(low, high),
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
 * The ~1200px structured-data image (M-SEO5), same variant as og:image, with
 * HTML entities decoded first.
 *
 * The decode is now a DEFENSIVE no-op, kept deliberately. It was load-bearing
 * when SNIP-120 shipped, because four loaders (lib/deals.ts, lib/new-products.ts,
 * lib/rush-products.ts, lib/catalogs.ts) never decoded `imageUrl` and their raw
 * `&amp;` reached this serializer. IMG-100 fixed all four at the loader, which
 * is where entity decoding belongs (CLAUDE.md section 17), so every product
 * source feeding this function now arrives decoded and this call changes
 * nothing for any of them.
 *
 * It stays because the failure modes are not symmetric. An undecoded URL that
 * reaches a rendered `<img>` fails LOUDLY: the image host returns HTTP 400 and
 * ProductCard swaps in its placeholder, so someone sees it. The same URL in
 * JSON-LD fails SILENTLY: the markup validates, and only a crawler fetching the
 * image ever discovers it is a 400. This is the boundary where a future
 * un-decoded source would do the most damage and be noticed last, so the guard
 * is worth its one function call. Removing it would be safe today and unsafe
 * the first time a new product source is added without a decode.
 */
function schemaImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  return largeSocialImage(decodeHtmlEntities(imageUrl));
}

/**
 * One ListItem carrying a full Product entity, or null for a product with no
 * usable name (a nameless Product is noise; the caller renumbers positions).
 * Every field beyond the name is conditional on the data actually being there.
 */
export function productListItem(
  p: GeigerProduct,
  position: number,
): Record<string, unknown> | null {
  const name = (p.name ?? '').trim();
  if (!name) return null;

  const product: Record<string, unknown> = {
    '@type': 'Product',
    name,
  };

  const url = productDestinationUrl(p);
  if (url) product.url = url;

  const image = schemaImageUrl(p.imageUrl);
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

/**
 * The ItemList for a CLIENT-PAGINATED aggregator page: Deals, New Products and
 * Rush Products (SNIP-120).
 *
 * Those three differ from `/cat` and `/brands` in one way that matters here.
 * They have exactly ONE URL each - there is no `/page/N` route, the URL never
 * changes, and paging is React state inside `DealsClient` /
 * `NewProductsClient` / `RushProductsClient`, which slice the full list down to
 * `PRODUCTS_PER_PAGE` before handing it to `ProductGrid`. So the rendered HTML
 * of `/deals` contains the first page of cards and nothing else, and describing
 * the whole list would claim products that are not on the page. This helper
 * takes the FULL post-hide, post-pin list the page holds and applies exactly
 * the slice the client applies on first render, so the markup states only what
 * the document actually renders - the same rule `/cat/<slug>/page/N` follows,
 * expressed for a surface whose pages are not separate URLs.
 *
 * It exists so that rule lives in ONE place rather than being retyped at three
 * call sites. `productItemListSchema` is unchanged and every existing surface
 * (brands, /cat, customCategory) is byte-for-byte unaffected.
 *
 * Returns null for an empty grid, so a caller emits no block at all rather than
 * an empty list.
 */
export function aggregatorItemListSchema(
  allProducts: GeigerProduct[],
  perPage: number,
): Record<string, unknown> | null {
  const rendered = allProducts.slice(0, Math.max(0, perPage));
  if (rendered.length === 0) return null;
  return productItemListSchema(rendered);
}
