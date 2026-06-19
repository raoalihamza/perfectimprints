/**
 * Shared search-index shapes (M5-502). Zero runtime dependencies so this module
 * is safe to import from the build-time index builder, server components, and
 * client components alike.
 */

export type SearchItemType = 'category' | 'product' | 'brand' | 'blog' | 'faq';

/**
 * One entry in the prebuilt Fuse index. Kept deliberately minimal — see
 * `scripts/search-index/build-index.ts` and CLAUDE.md M5-502. Products carry
 * ONLY name + brand + the raw Geiger URL (rewritten to the affiliate host at
 * click time via `lib/affiliate-url.ts`); never a description, SKU, or image.
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
   * Only set for products — thumbnail URL (already HTML-entity-decoded) for the
   * autocomplete overlay. Not a Fuse key; display only.
   */
  image?: string;
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
  faq: 'FAQ',
};
