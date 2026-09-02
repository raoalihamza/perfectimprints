import { urlForRenderImage } from '@/lib/sanity/client';
import type { ManualStripCardData } from '@/lib/products/strip-cards';

/**
 * The manual title/image/url fallback card a product strip renders for an
 * entry with no catalog match and no reference (SNIP-150). This is the exact
 * markup the blog body, page-builder ProductStrip and video strip each carried
 * inline before the shared resolver landed, moved here once so the three
 * renderers cannot drift. Its data comes pre-decided from
 * `resolveStripCards` (affiliate rewrite, internal/external, title fallback);
 * this component only lays it out.
 */
export function ManualStripCard({ card }: { card: ManualStripCardData }) {
  const { title, image, href, isExternal } = card;
  const imageSrc = image?.asset
    ? urlForRenderImage(image).width(550).height(550).fit('crop').url()
    : null;
  const cardInner = (
    <>
      <div className="relative aspect-square overflow-hidden bg-bg-soft">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={image?.alt || title}
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
    return <div className={cardClassName}>{cardInner}</div>;
  }
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer sponsored' : undefined}
      className={cardClassName}
    >
      {cardInner}
    </a>
  );
}
