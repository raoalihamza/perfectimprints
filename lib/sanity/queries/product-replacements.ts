import { cache } from 'react';
import { cachedClient } from '@/lib/sanity/client';
import { PRODUCT_PAGES_TAG } from '@/lib/sanity/cache-tags';
import type { GeigerProduct } from '@/lib/product-types';
import type { CategoryOverrideAddedProduct } from '@/lib/sanity/queries/category-overrides';
import { normalizeSku } from '@/lib/products/hidden-skus';
import {
  PRODUCT_PAGE_CARD_FIELDS,
  productPageToGeigerProduct,
  type ProductPageCard,
} from '@/lib/sanity/queries/product-pages';

/**
 * Geiger products that one of Patrick's own product pages has SUPERSEDED
 * (HIDE-110).
 *
 * The one field `productPage.replacesGeigerSkus` does two jobs, which is the
 * whole point of the design: naming a Geiger SKU there hides that Geiger
 * product across the site AND puts this product page's card where it used to
 * appear. Patrick fills in one thing, not a hide list plus a link.
 *
 * WHY A DEDICATED INDEX RATHER THAN A SECOND HIDE LIST: HIDE-100 established
 * that two places saying the same thing eventually disagree. So the claimed
 * SKUs are read from the product pages themselves and fed INTO the removal
 * mechanism HIDE-100 already built and verified. There is exactly one removal
 * path on this site; this adds an input to it, not a rival to it.
 *
 * PUBLISHED ONLY, and that is a safety rule, not a detail. A DRAFT product page
 * claiming a SKU must not hide the Geiger product, or Patrick would blank a
 * category slot while still deciding what to put in it. Nothing happens until
 * he publishes, and unpublishing gives the Geiger product straight back.
 *
 * COST: one tag-cached, non-CDN fetch, wrapped in React `cache()` so every
 * surface in a single render shares it. The projection is restricted to pages
 * that actually claim a SKU, so today it returns zero documents and costs
 * almost nothing; it grows only as Patrick fills the field in.
 *
 * FRESHNESS: tagged `PRODUCT_PAGES_TAG`, which the webhook's existing
 * `productPage` branch already busts on every publish and unpublish. A
 * `replacesGeigerSkus` edit therefore reaches every surface within seconds with
 * NO webhook Filter or Projection change, because the field lives on a document
 * type the webhook already carries.
 */
export interface ProductReplacementIndex {
  /**
   * Every Geiger SKU claimed by a published product page, raw as stored.
   * Fed into the HIDE-100 removal mechanism alongside the global hide list.
   */
  claimedSkus: string[];
  /**
   * Normalized Geiger SKU to the replacing product page's card, already
   * normalized to the `GeigerProduct` shape with `detailUrl` set, so a
   * substituted card renders through the ordinary `ProductCard` as an internal
   * link to `/products/<slug>` and looks like every other card around it.
   */
  bySku: Map<string, GeigerProduct>;
  /**
   * The same pages in the override-added union shape, for `buildAddedAttrOverlay`.
   *
   * Without this a substituted card would vanish the moment a visitor clicked
   * any filter: it is not in the category's scraped facet memberships, so the
   * filter would have nothing to match it on. Feeding its own tags (colors from
   * the variants, material, features, types, made-in-USA / eco / closeout) into
   * the overlay keeps it in filtered results exactly like the Geiger product it
   * replaced.
   */
  overlayDocs: CategoryOverrideAddedProduct[];
}

const EMPTY: ProductReplacementIndex = { claimedSkus: [], bySku: new Map(), overlayDocs: [] };

interface ReplacementDoc extends ProductPageCard {
  replacesGeigerSkus?: string[];
}

// Only pages that actually claim a SKU. `_createdAt asc` makes a duplicate
// claim resolve deterministically to the page that claimed it FIRST rather than
// to an arbitrary document; publish-time validation blocks the duplicate in
// Studio, so this is the backstop for anything created before that guard or
// written through the API.
const QUERY = `*[
  _type == "productPage"
  && !(_id in path("drafts.**"))
  && defined(slug.current)
  && count(replacesGeigerSkus[@ != ""]) > 0
] | order(_createdAt asc) {
  ${PRODUCT_PAGE_CARD_FIELDS},
  replacesGeigerSkus
}`;

const FETCH_OPTS = { next: { tags: [PRODUCT_PAGES_TAG], revalidate: false as const } };

export const getProductReplacements = cache(async (): Promise<ProductReplacementIndex> => {
  let docs: ReplacementDoc[];
  try {
    docs = (await cachedClient.fetch<ReplacementDoc[] | null>(QUERY, {}, FETCH_OPTS)) ?? [];
  } catch {
    // A failed read must never hide a product: degrading to "nothing is
    // replaced" leaves the Geiger originals visible, which is the safe side of
    // this failure. The alternative (hiding without substituting) would blank
    // slots across the site because of a transient Sanity error.
    return EMPTY;
  }
  if (docs.length === 0) return EMPTY;

  const claimedSkus: string[] = [];
  const bySku = new Map<string, GeigerProduct>();
  const overlayDocs: CategoryOverrideAddedProduct[] = [];
  for (const doc of docs) {
    if (!doc?.slug) continue;
    const card = productPageToGeigerProduct(doc);
    overlayDocs.push({ ...doc, _type: 'productPage' } as CategoryOverrideAddedProduct);
    for (const raw of doc.replacesGeigerSkus ?? []) {
      const normalized = normalizeSku(raw);
      // First claim wins (see the ordering note above), so a duplicate can
      // never silently flip which page a visitor lands on between renders.
      if (!normalized || bySku.has(normalized)) continue;
      bySku.set(normalized, card);
      claimedSkus.push(String(raw).trim());
    }
  }
  return { claimedSkus, bySku, overlayDocs };
});
