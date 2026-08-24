import { resolveProductsBySku } from '@/lib/categories';
import { getHiddenProductContext } from '@/lib/products/site-wide-hidden';
import { buildSkuSet } from '@/lib/products/hidden-skus';
import { StripCardGrid } from '@/components/products/StripCardGrid';
import { SectionShell } from './SectionShell';
import { isStripRefEntry } from '@/lib/sanity/strip-product-entries';
import { resolveStripCards } from '@/lib/sanity/queries/strip-entries';
import type { ProductStripSection } from '@/lib/sanity/queries/pages';

/**
 * Live product strip page section (P2-AI-004). Mirrors the video page's
 * VideoRelatedProducts (which itself mirrors the blog body's `blogProducts`
 * renderer): SKU-backed entries resolve against the on-disk Geiger catalog
 * (`resolveProductsBySku` reads products.json synchronously - no fetch, no
 * searchParams) and render the shared ProductCard, so pricing / affiliate URLs
 * are never stale in the doc; manual entries (title/image/url, no resolvable
 * SKU) render the same fallback card, with Geiger URLs rewritten through the
 * affiliate host. Dereferenced productPage/customProduct entries (2026-07-11)
 * render ProductCard too - productPage as an INTERNAL /products/<slug> card,
 * customProduct as the usual affiliate/external card; unresolvable refs
 * (dangling, or missing slug/externalUrl) are dropped, never a broken card.
 * Server component with no network I/O of its own (the refs were dereferenced
 * inside the page's existing tagged Sanity read) - /services/[slug],
 * app/[...slug], and the footer/legal pages stay SSG.
 *
 * SNIP-150: the entry-by-entry decisions (hidden / replaced / resolved / manual)
 * now come from the shared `resolveStripCards` in
 * lib/sanity/queries/strip-entries.ts, the same resolver the blog body and the
 * video strip use, instead of a third inline copy. Output is unchanged. This
 * strip does NOT yet emit structured data for its products - that is the
 * video/page/landing strip piece of the Product Snippets series; when it lands
 * it is `productItemListSchema(stripCardProducts(cards))` on the list below.
 */

// Async server component (HIDE-100). It reads `getSiteSettings()` itself rather
// than taking a prop, because SectionRenderer is used by four different page
// routes and threading a prop through all of them would be far more invasive.
// The read is the layout's already-deduped, SETTINGS_TAG-cached one, so this
// costs no extra Sanity fetch and every embedding route stays static.
export async function ProductStrip({ section }: { section: ProductStripSection }) {
  const entries = section.products ?? [];
  if (entries.length === 0) return null;

  const context = await getHiddenProductContext();
  const hidden = buildSkuSet(context.hiddenSkus);

  const skus = entries
    .map((e) => (e && !isStripRefEntry(e) ? e.sku?.trim() : undefined))
    .filter((s): s is string => Boolean(s));
  const skuProducts = new Map(resolveProductsBySku(skus).map((p) => [p.sku, p]));

  const cards = resolveStripCards(entries, {
    skuProducts,
    hiddenSkus: hidden,
    replacementBySku: context.replacementBySku,
  });

  if (cards.length === 0) return null;
  return (
    <SectionShell>
      {section.heading && (
        <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{section.heading}</h2>
      )}
      <StripCardGrid cards={cards} />
    </SectionShell>
  );
}
