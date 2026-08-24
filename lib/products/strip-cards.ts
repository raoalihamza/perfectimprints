/**
 * The ONE resolver behind every product strip (SNIP-150).
 *
 * Four surfaces render an editor-built list of product entries as a row of
 * cards: the blog body's `blogProducts` block, the page-builder `productStrip`
 * section (which the landing-page template also uses), and the video page's
 * `relatedProducts`. Until SNIP-150 each of the three renderers carried its own
 * copy of the same twelve-step decision - reference or SKU, hidden or replaced,
 * resolved or manual, de-duplicated or not - and the blog post's structured
 * data had no way to ask "which products is this strip actually showing?"
 * without re-implementing those decisions a fourth time and then drifting.
 *
 * This module is that decision, written once. It turns the raw projected
 * entries into an ordered list of CARDS, each either a `GeigerProduct` (which
 * the renderer hands to the shared ProductCard and the schema hands to the
 * shared product serializer) or a manual title/image/url card. Because render
 * and schema read the SAME list, the JSON-LD on a blog post structurally cannot
 * describe a product the reader does not see: a hidden SKU (HIDE-100) is
 * dropped before either side looks, and a replaced SKU (HIDE-110) is swapped
 * for the replacing product page's card before either side looks.
 *
 * Pure on purpose: no fs, no Sanity, no server-only import, so it is unit
 * tested directly and cannot make a route dynamic. The one thing it cannot do
 * itself is normalize a dereferenced productPage/customProduct reference (those
 * converters live in server-only query modules), so the caller injects that as
 * `resolveRef`; the server-side binding is `resolveStripCards` in
 * lib/sanity/queries/strip-entries.ts, which is what every renderer and the
 * blog schema actually call.
 *
 * BEHAVIOUR IS THE RENDERERS' PRE-EXISTING BEHAVIOUR, VERBATIM:
 *   - a null entry (dangling reference, target deleted/unpublished) is dropped;
 *   - a productPage / customProduct reference normalizes to a card, or is
 *     dropped when it cannot render a working one (no slug / no externalUrl);
 *     the same referenced product twice IN ONE STRIP renders once;
 *   - a SKU entry on the hidden set is dropped ENTIRELY, including its manual
 *     title/image/url fallback (the SKU identifies the hidden product, so a
 *     hand-typed card for it would defeat the hide), unless a published product
 *     page has claimed it, in which case that page's card takes the slot;
 *   - a SKU entry that resolved against the catalog renders the live product
 *     (two identical SKU entries in one strip render twice - the editor's
 *     list, not ours to de-duplicate);
 *   - anything left with a title, image or url renders the manual card, with a
 *     Geiger URL rewritten through the affiliate host;
 *   - an entry with nothing to show is dropped.
 */

import { affiliateUrl } from '../affiliate-url';
import type { GeigerProduct } from '../product-types';
import type { SanityImage } from '../sanity/types';
import type {
  StripProductEntry,
  StripProductRefEntry,
} from '../sanity/strip-product-entries';
import { isStripRefEntry } from '../sanity/strip-product-entries';
import { isHiddenSku, normalizeSku } from './hidden-skus';

/** A card backed by a GeigerProduct: catalog SKU, productPage, customProduct, or a HIDE-110 replacement. */
export interface ProductStripCard {
  kind: 'product';
  key: string;
  product: GeigerProduct;
}

/** The manual title/image/url fallback card (no catalog match, no reference). */
export interface ManualStripCardData {
  kind: 'manual';
  key: string;
  title: string;
  image?: SanityImage & { alt?: string };
  /** Affiliate-rewritten when the editor pasted a Geiger URL; null when there is no link. */
  href: string | null;
  /** True for anything that is not a site-relative path (and for no link at all). */
  isExternal: boolean;
}

export type StripCard = ProductStripCard | ManualStripCardData;

export interface StripCardContext {
  /** Catalog SKU -> live product, resolved by the page via resolveProductsBySku. */
  skuProducts: ReadonlyMap<string, GeigerProduct>;
  /** Site-wide hidden SKUs (HIDE-100), normalized via buildSkuSet. */
  hiddenSkus?: ReadonlySet<string>;
  /** HIDE-110: normalized hidden SKU -> the product-page card that replaced it. */
  replacementBySku?: ReadonlyMap<string, GeigerProduct>;
  /** Normalizes a dereferenced reference; null = cannot render a working card. */
  resolveRef: (entry: StripProductRefEntry) => GeigerProduct | null;
}

const GEIGER_HOST_PATTERN = /^https?:\/\/(www\.)?geiger\.com\//i;
const AFFILIATE_HOST_PATTERN = /^https?:\/\/[^/]*\.geiger\.com\//i;

export function isGeigerUrl(url: string): boolean {
  return GEIGER_HOST_PATTERN.test(url) || AFFILIATE_HOST_PATTERN.test(url);
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Resolve one strip's entries into the ordered cards it renders. See the
 * module comment for the rules; they are the three renderers' former inline
 * logic, unchanged.
 */
export function resolveStripCards(
  entries: readonly (StripProductEntry | null)[],
  ctx: StripCardContext,
): StripCard[] {
  const hidden = ctx.hiddenSkus ?? EMPTY_SET;
  // De-dup referenced docs within the strip (a productPage attached twice, or
  // once directly and once via a customProduct / a replacement, renders once).
  const seenRefSkus = new Set<string>();
  const cards: StripCard[] = [];

  entries.forEach((entry, idx) => {
    if (!entry) return; // dangling reference: target deleted/unpublished
    if (isStripRefEntry(entry)) {
      const product = ctx.resolveRef(entry);
      if (!product || seenRefSkus.has(product.sku)) return;
      seenRefSkus.add(product.sku);
      cards.push({ kind: 'product', key: `ref-${entry._id}-${idx}`, product });
      return;
    }
    const sku = entry.sku?.trim();
    if (isHiddenSku(sku, hidden)) {
      const replacement = ctx.replacementBySku?.get(normalizeSku(sku));
      if (!replacement || seenRefSkus.has(replacement.sku)) return;
      seenRefSkus.add(replacement.sku);
      cards.push({ kind: 'product', key: `rep-${replacement.sku}-${idx}`, product: replacement });
      return;
    }
    const resolved = sku ? ctx.skuProducts.get(sku) : undefined;
    if (resolved) {
      cards.push({ kind: 'product', key: entry._key || `sku-${sku}-${idx}`, product: resolved });
      return;
    }
    if (!entry.title && !entry.image && !entry.url) return;
    const rawUrl = entry.url?.trim() || null;
    const href = rawUrl ? (isGeigerUrl(rawUrl) ? affiliateUrl(rawUrl) : rawUrl) : null;
    cards.push({
      kind: 'manual',
      key: entry._key || `manual-${idx}`,
      title: entry.title || sku || 'Product',
      image: entry.image,
      href,
      isExternal: !href || !href.startsWith('/'),
    });
  });

  return cards;
}

/**
 * The GeigerProducts a list of cards renders, in order. Manual cards are NOT
 * included: they carry no SKU, no price and often no destination, and a
 * Product entity with none of those is one Google reports as invalid rather
 * than useful. (Live count at SNIP-150: 0 manual entries across all 79 strips.)
 */
export function stripCardProducts(cards: readonly StripCard[]): GeigerProduct[] {
  const out: GeigerProduct[] = [];
  for (const card of cards) if (card.kind === 'product') out.push(card.product);
  return out;
}

/**
 * Each product once, first occurrence wins, keyed by normalized SKU. A post
 * can carry many strips and the same product can appear in two of them (it
 * does, on one live post); the page's ItemList names each product the reader
 * sees once rather than repeating the entity per card.
 */
export function dedupeProductsBySku(products: readonly GeigerProduct[]): GeigerProduct[] {
  const seen = new Set<string>();
  const out: GeigerProduct[] = [];
  for (const p of products) {
    const key = normalizeSku(p.sku) || p.sku;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
