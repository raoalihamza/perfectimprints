import { resolveProductsBySku } from '@/lib/categories';
import { getHiddenProductContext } from '@/lib/products/site-wide-hidden';
import { buildSkuSet, isHiddenSku, normalizeSku } from '@/lib/products/hidden-skus';
import { urlForImage } from '@/lib/sanity/client';
import { affiliateUrl } from '@/lib/affiliate-url';
import { ProductCard } from '@/components/category/ProductCard';
import { SectionShell } from './SectionShell';
import { isStripRefEntry } from '@/lib/sanity/strip-product-entries';
import { stripRefToGeigerProduct } from '@/lib/sanity/queries/strip-entries';
import type { ProductStripSection } from '@/lib/sanity/queries/pages';

/**
 * Live product strip page section (P2-AI-004). Mirrors the video page's
 * VideoRelatedProducts (which itself mirrors the blog body's `blogProducts`
 * renderer): SKU-backed entries resolve against the on-disk Geiger catalog
 * (`resolveProductsBySku` reads products.json synchronously — no fetch, no
 * searchParams) and render the shared ProductCard, so pricing / affiliate URLs
 * are never stale in the doc; manual entries (title/image/url, no resolvable
 * SKU) render the same fallback card, with Geiger URLs rewritten through the
 * affiliate host. Dereferenced productPage/customProduct entries (2026-07-11)
 * render ProductCard too — productPage as an INTERNAL /products/<slug> card,
 * customProduct as the usual affiliate/external card; unresolvable refs
 * (dangling, or missing slug/externalUrl) are dropped, never a broken card.
 * Server component with no network I/O of its own (the refs were dereferenced
 * inside the page's existing tagged Sanity read) — /services/[slug],
 * app/[...slug], and the footer/legal pages stay SSG.
 */

const GEIGER_HOST_PATTERN = /^https?:\/\/(www\.)?geiger\.com\//i;
const AFFILIATE_HOST_PATTERN = /^https?:\/\/[^/]*\.geiger\.com\//i;

function isGeigerUrl(url: string): boolean {
  return GEIGER_HOST_PATTERN.test(url) || AFFILIATE_HOST_PATTERN.test(url);
}

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

  // De-dup referenced docs within the strip (a productPage attached twice —
  // or once directly and once via a customProduct — renders once).
  const seenRefSkus = new Set<string>();

  const cards = entries
    .map((entry, idx) => {
      if (!entry) return null; // dangling reference — target deleted/unpublished
      if (isStripRefEntry(entry)) {
        const product = stripRefToGeigerProduct(entry);
        if (!product || seenRefSkus.has(product.sku)) return null;
        seenRefSkus.add(product.sku);
        return <ProductCard key={`ref-${entry._id}-${idx}`} product={product} />;
      }
      const sku = entry.sku?.trim();
      // Drop the whole entry, not just the resolved card: the manual
      // title/image/url fallback below would otherwise resurrect a hidden
      // product as a hand-typed card. HIDE-110: if one of Patrick's pages has
      // replaced it, swap in that card instead of leaving a gap.
      if (isHiddenSku(sku, hidden)) {
        const replacement = context.replacementBySku.get(normalizeSku(sku));
        if (!replacement || seenRefSkus.has(replacement.sku)) return null;
        seenRefSkus.add(replacement.sku);
        return <ProductCard key={`rep-${replacement.sku}-${idx}`} product={replacement} />;
      }
      const resolved = sku ? skuProducts.get(sku) : undefined;
      if (resolved) {
        return <ProductCard key={entry._key || `sku-${sku}-${idx}`} product={resolved} />;
      }
      // Manual fallback card — skip entries with nothing to show (e.g. a SKU
      // that dropped out of the catalog between monthly rebuilds and no manual
      // fields), matching the blog/video strip behavior.
      if (!entry.title && !entry.image && !entry.url) return null;
      const title = entry.title || sku || 'Product';
      const imageSrc = entry.image?.asset
        ? urlForImage(entry.image).width(550).height(550).fit('crop').url()
        : null;
      const rawUrl = entry.url?.trim() || null;
      const href = rawUrl ? (isGeigerUrl(rawUrl) ? affiliateUrl(rawUrl) : rawUrl) : null;
      const isExternal = !href || !href.startsWith('/');
      const cardInner = (
        <>
          <div className="relative aspect-square overflow-hidden bg-bg-soft">
            {imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageSrc}
                alt={entry.image?.alt || title}
                loading="lazy"
                className="h-full w-full object-contain p-3 transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">
                No image
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2 p-4">
            <h3 className="line-clamp-2 min-h-[2.6em] text-sm font-medium leading-snug text-text-primary group-hover:text-brand-red">
              {title}
            </h3>
          </div>
        </>
      );
      const cardClassName =
        'group flex flex-col overflow-hidden rounded border border-border bg-brand-white transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2';
      if (!href) {
        return (
          <div key={entry._key || `manual-${idx}`} className={cardClassName}>
            {cardInner}
          </div>
        );
      }
      return (
        <a
          key={entry._key || `manual-${idx}`}
          href={href}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer sponsored' : undefined}
          className={cardClassName}
        >
          {cardInner}
        </a>
      );
    })
    .filter(Boolean);

  if (cards.length === 0) return null;
  return (
    <SectionShell>
      {section.heading && (
        <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{section.heading}</h2>
      )}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
        {cards}
      </div>
    </SectionShell>
  );
}
