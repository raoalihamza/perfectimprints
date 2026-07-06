import { urlForImage } from '@/lib/sanity/client';
import { affiliateUrl } from '@/lib/affiliate-url';
import { ProductCard } from '@/components/category/ProductCard';
import type { GeigerProduct } from '@/lib/product-types';
import type { VideoRelatedProductEntry } from '@/lib/sanity/queries/videos';

/**
 * The related-products strip under a video's description (P2-AI-003). Mirrors
 * the blog body's `blogProducts` renderer (components/blog/BlogBody.tsx):
 * SKU-backed entries render the shared ProductCard from the live catalog data
 * resolved server-side by the page (so pricing/affiliate URLs are never stale
 * in the doc); manual entries (title/image/url, no resolvable SKU) render the
 * same fallback card, with Geiger URLs rewritten through the affiliate host.
 * Server component, no data fetching of its own — /videos/[slug] stays SSG.
 */

interface VideoRelatedProductsProps {
  entries: VideoRelatedProductEntry[];
  /** SKU → live product, resolved by the page via resolveProductsBySku. */
  skuProducts: Map<string, GeigerProduct>;
  heading?: string;
}

const GEIGER_HOST_PATTERN = /^https?:\/\/(www\.)?geiger\.com\//i;
const AFFILIATE_HOST_PATTERN = /^https?:\/\/[^/]*\.geiger\.com\//i;

function isGeigerUrl(url: string): boolean {
  return GEIGER_HOST_PATTERN.test(url) || AFFILIATE_HOST_PATTERN.test(url);
}

export function VideoRelatedProducts({
  entries,
  skuProducts,
  heading = 'Featured Custom Promotional Products',
}: VideoRelatedProductsProps) {
  const cards = entries
    .map((entry, idx) => {
      const sku = entry.sku?.trim();
      const resolved = sku ? skuProducts.get(sku) : undefined;
      if (resolved) {
        return <ProductCard key={entry._key || `sku-${sku}-${idx}`} product={resolved} />;
      }
      // Manual fallback card — same behavior as the blog strip: skip entries
      // with nothing to show (e.g. a SKU that dropped out of the catalog
      // between monthly rebuilds and no manual fields).
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
    <section className="mt-10">
      <h2 className="text-2xl font-bold text-brand-ink">{heading}</h2>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
        {cards}
      </div>
    </section>
  );
}
