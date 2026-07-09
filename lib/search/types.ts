/**
 * Shared search-index shapes (M5-502). Zero runtime dependencies so this module
 * is safe to import from the build-time index builder, server components, and
 * client components alike.
 */

export type SearchItemType = 'category' | 'product' | 'brand' | 'blog' | 'video' | 'faq';

/**
 * One entry in the prebuilt Fuse index. Kept deliberately minimal — see
 * `scripts/search-index/build-index.ts` and CLAUDE.md M5-502. Products carry
 * name + brand + the raw Geiger URL (rewritten to the affiliate host at click
 * time via `lib/affiliate-url.ts`), a thumbnail for the overlay (M5-502b), and
 * the item number / SKU as a search key (P2 batch 2 — Patrick's request);
 * never a description.
 */
export interface SearchItem {
  type: SearchItemType;
  /** Product name, category H1, brand name, or blog title. Primary Fuse key. */
  title: string;
  /**
   * For category/brand/blog/faq this is the internal route (`/cat/...`,
   * `/brands/...`, `/blog/...`). For products this is the RAW Geiger URL
   * (often a relative `/p/...` path) — route it through `affiliateUrl()` at
   * render time so it respects `NEXT_PUBLIC_GEIGER_HOST`.
   */
  url: string;
  /** Only set for products — secondary Fuse key. */
  brand?: string;
  /**
   * Only set for products with a REAL, user-facing item number — the Geiger
   * catalog SKU (may contain a space, e.g. "529664 90A") or a productPage's
   * manually-entered item number. Secondary Fuse key so searching an item
   * number finds the product. Synthetic `custom-<id>` SKUs are deliberately
   * NEVER indexed (internal ids, pure noise).
   */
  sku?: string;
  /**
   * Only set for videos — the video's category title. Secondary Fuse key so a
   * video is findable by its category (e.g. "trade shows"); also shown as the
   * muted label on the result row.
   */
  category?: string;
  /**
   * Only set for products — thumbnail URL (already HTML-entity-decoded) for the
   * autocomplete overlay. Not a Fuse key; display only.
   */
  image?: string;
  /**
   * Only set for `product` entries whose `url` is an INTERNAL route — Sanity
   * productPage detail pages at `/products/<slug>` (P2-CP-001). `resultTarget`
   * routes these like any internal page (same tab, prefetchable) instead of
   * rewriting through the affiliate host. Absent for Geiger/customProduct
   * entries, which keep the affiliate behavior.
   */
  internal?: boolean;
}

export interface SearchIndexFile {
  generatedAt: string;
  items: SearchItem[];
}

/** Human-readable badge label per result type. */
export const SEARCH_TYPE_LABELS: Record<SearchItemType, string> = {
  category: 'Category',
  product: 'Product',
  brand: 'Brand',
  blog: 'Blog',
  video: 'Video',
  faq: 'FAQ',
};
