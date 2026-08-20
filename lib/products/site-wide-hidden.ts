import { cache } from 'react';
import type { GeigerProduct } from '@/lib/product-types';
import type { CategoryOverrideAddedProduct } from '@/lib/sanity/queries/category-overrides';
import { getSiteSettings } from '@/lib/sanity/queries/global-settings';
import { getProductReplacements } from '@/lib/sanity/queries/product-replacements';

/**
 * THE single answer to "which Geiger products must not appear, and what goes in
 * their place". Every surface on the site asks this one function.
 *
 * There are two ways a Geiger product becomes hidden, and they are deliberately
 * different tools rather than two spellings of the same one:
 *
 *   1. `globalSettings.hiddenProducts.skus` (HIDE-100) - gone, with nothing in
 *      its place. For a Geiger product Patrick simply does not want on the site.
 *   2. `productPage.replacesGeigerSkus` (HIDE-110) - gone, AND his own product
 *      page takes its place. This is his stated main case: he builds a better
 *      page for the same item and does not want the plain Geiger card competing
 *      with it.
 *
 * Both feed the SAME removal mechanism, the one HIDE-100 built and verified.
 * Only (2) carries a replacement card, so only (2) can substitute.
 *
 * WHY BOTH SURVIVE. Dropping (1) was considered, since Patrick's stated use case
 * always involves a replacement. It is kept because removing it would leave no
 * way to take a Geiger product off the site without first inventing a whole
 * product page for something he does not want to sell, and because it is already
 * built and verified. They cannot be confused for each other in Studio: they
 * live in different documents, and each one's wording names the other. If
 * Patrick later finds he never uses (1), deleting it is a small, safe change.
 *
 * COST: two tag-cached reads, both React-`cache()`d for per-request dedup.
 * `getSiteSettings()` is the one the layout Footer already performs on every
 * page, so it is free. `getProductReplacements()` is genuinely new work on the
 * surfaces that did not read product pages before, but it is a single tagged
 * fetch per render whose projection is limited to pages that claim a SKU (zero
 * documents today), and `revalidate: false` means it is not re-fetched until the
 * webhook busts `PRODUCT_PAGES_TAG`. Nothing here reads `searchParams`, sets
 * `no-store`, or is uncached, so every static route stays static.
 */
export interface HiddenProductContext {
  /**
   * Every Geiger SKU that must not appear anywhere: the global hide list plus
   * every SKU claimed by a published product page.
   */
  hiddenSkus: string[];
  /**
   * Normalized Geiger SKU to the product-page card that replaces it. Only
   * consulted by the surfaces where substitution is correct (see the HIDE-110
   * notes in CLAUDE.md); the rest use `hiddenSkus` alone and simply remove.
   */
  replacementBySku: Map<string, GeigerProduct>;
  /**
   * Replacement pages in the override-added shape, for `buildAddedAttrOverlay`,
   * so a substituted card survives a filter click instead of dropping out of
   * filtered results.
   */
  replacementOverlayDocs: CategoryOverrideAddedProduct[];
}

const EMPTY: HiddenProductContext = {
  hiddenSkus: [],
  replacementBySku: new Map(),
  replacementOverlayDocs: [],
};

export const getHiddenProductContext = cache(async (): Promise<HiddenProductContext> => {
  try {
    const [settings, replacements] = await Promise.all([
      getSiteSettings(),
      getProductReplacements(),
    ]);
    return {
      hiddenSkus: [...settings.hiddenEverywhereSkus, ...replacements.claimedSkus],
      replacementBySku: replacements.bySku,
      replacementOverlayDocs: replacements.overlayDocs,
    };
  } catch {
    // Hiding nothing is the safe failure: the site renders exactly as it did
    // before either feature existed, rather than blanking slots because a read
    // failed.
    return EMPTY;
  }
});

/**
 * Hidden SKUs only, for callers with no use for the replacement cards.
 *
 * Used by the AI generate routes so a hidden product is never PERSISTED into a
 * newly generated product strip in the first place. That matters beyond
 * display: a generated strip is stored on the document, so without this a
 * hidden product would be written into a blog, page, video or landing page and
 * would reappear the moment it was later un-hidden, in a strip nobody chose it
 * for.
 */
export async function siteWideHiddenSkus(): Promise<string[]> {
  return (await getHiddenProductContext()).hiddenSkus;
}

/**
 * What SITE SEARCH hides: everything hidden site-wide, plus the search-only
 * list. One definition, shared by all three search read paths so they cannot
 * drift. Degrades to hiding nothing if a read fails.
 */
export async function searchHiddenSkus(): Promise<string[]> {
  try {
    const [settings, context] = await Promise.all([getSiteSettings(), getHiddenProductContext()]);
    return [...settings.searchHiddenSkus, ...context.hiddenSkus];
  } catch {
    return [];
  }
}
