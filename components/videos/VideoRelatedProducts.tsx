import { StripCardGrid } from '@/components/products/StripCardGrid';
import { resolveStripCards } from '@/lib/sanity/queries/strip-entries';
import type { GeigerProduct } from '@/lib/product-types';
import type { VideoRelatedProductEntry } from '@/lib/sanity/queries/videos';

/**
 * The related-products strip under a video's description (P2-AI-003). Mirrors
 * the blog body's `blogProducts` renderer (components/blog/BlogBody.tsx):
 * SKU-backed entries render the shared ProductCard from the live catalog data
 * resolved server-side by the page (so pricing/affiliate URLs are never stale
 * in the doc); manual entries (title/image/url, no resolvable SKU) render the
 * same fallback card, with Geiger URLs rewritten through the affiliate host.
 * Dereferenced productPage/customProduct entries (2026-07-11) render
 * ProductCard too - productPage as an INTERNAL /products/<slug> card,
 * customProduct as the usual affiliate/external card; unresolvable refs are
 * dropped, never a broken card. Server component, no data fetching of its own
 * (the refs were dereferenced inside the page's VIDEOS_TAG-cached read) -
 * /videos/[slug] stays SSG.
 *
 * SNIP-150: the entry-by-entry decisions (hidden / replaced / resolved / manual)
 * now come from the shared `resolveStripCards` in
 * lib/sanity/queries/strip-entries.ts, the same resolver the blog body and the
 * page-builder ProductStrip use, instead of a second inline copy. Output is
 * unchanged. This strip does NOT yet emit structured data for its products -
 * that is the video/page/landing strip piece of the Product Snippets series.
 */

interface VideoRelatedProductsProps {
  entries: (VideoRelatedProductEntry | null)[];
  /** SKU → live product, resolved by the page via resolveProductsBySku. */
  skuProducts: Map<string, GeigerProduct>;
  heading?: string;
  /**
   * Site-wide hidden SKUs (HIDE-100). An entry whose SKU is on this set is
   * dropped entirely, INCLUDING its manual title/image/url fallback: the SKU
   * identifies the hidden product, so falling back to a hand-typed card for it
   * would defeat the hide.
   */
  hiddenSkus?: ReadonlySet<string>;
  /**
   * HIDE-110: normalized hidden SKU to the product-page card that replaced it.
   * A replaced entry SWAPS to that card instead of being dropped, so a strip
   * the editor built keeps its length and still shows the product they meant.
   */
  replacementBySku?: ReadonlyMap<string, GeigerProduct>;
}

export function VideoRelatedProducts({
  entries,
  skuProducts,
  heading = 'Featured Custom Promotional Products',
  hiddenSkus,
  replacementBySku,
}: VideoRelatedProductsProps) {
  const cards = resolveStripCards(entries, { skuProducts, hiddenSkus, replacementBySku });

  if (cards.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold text-brand-ink">{heading}</h2>
      <StripCardGrid cards={cards} />
    </section>
  );
}
