import Link from 'next/link';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import type { PortableTextBlock } from '@portabletext/react';
import { urlForRenderImage } from '@/lib/sanity/client';
import {
  inlineImageAssetWidth,
  inlineImageSizingClasses,
} from '@/lib/portable-text/inline-image-size';
import type { SanityImage } from '@/lib/sanity/types';
import type { GeigerProduct } from '@/lib/product-types';
import { StripCardGrid } from '@/components/products/StripCardGrid';
import { PortfolioGalleryBlock } from '@/components/portfolio/PortfolioGalleryBlock';
import type { PortfolioTile } from '@/lib/portfolio/tile-data';
import type { PortfolioGalleryBlockValue } from '@/lib/portfolio/gallery';
import {
  resolveStripCards,
  type BlogProductsBlock,
  type StripResolveContext,
} from '@/lib/sanity/queries/strip-entries';

interface BlogBodyProps {
  body: PortableTextBlock[];
  skuProducts?: Map<string, GeigerProduct>;
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
  /**
   * PORT-120: the tiles of every `portfolioGallery` block in the body, keyed
   * by the block's `_key`, resolved up front by the blog page through the ONE
   * gallery resolver (`collectPortfolioGalleryTiles`), because this renderer
   * is synchronous and cannot read Sanity itself. A block with no entry, or
   * an empty one, renders nothing.
   */
  portfolioGalleries?: ReadonlyMap<string, readonly PortfolioTile[]>;
}

interface EmbedValue {
  provider?: 'youtube' | 'vimeo' | 'iframe';
  url?: string;
  videoId?: string;
  caption?: string;
}

interface ListBlock {
  _type: 'block';
  _key?: string;
  listItem?: string;
  level?: number;
  children?: { _key?: string; text?: string }[];
  markDefs?: unknown[];
  style?: string;
}

function buildComponents(
  stripCtx: StripResolveContext,
  portfolioGalleries: ReadonlyMap<string, readonly PortfolioTile[]>,
): PortableTextComponents {
  return {
  types: {
    // PORT-120: the shared Portfolio Gallery renderer, fed the tiles the page
    // resolved for this block. Empty renders null (no heading, no spacing).
    portfolioGallery: ({ value }) => {
      const v = value as PortfolioGalleryBlockValue;
      if (!v?._key || v.hidden === true) return null;
      const tiles = portfolioGalleries.get(v._key) ?? [];
      if (tiles.length === 0) return null;
      return <PortfolioGalleryBlock heading={v.heading} tiles={tiles} className="my-8" />;
    },
    image: ({ value }) => {
      const v = value as SanityImage & { alt?: string; size?: string; align?: string };
      if (!v?.asset) return null;
      // Asset width matched to the editor-chosen size (full/unset = 1200,
      // exactly as before) so a quarter-width image doesn't fetch 1200px.
      const src = urlForRenderImage(v).width(inlineImageAssetWidth(v)).fit('max').url();
      // size/align (optional Studio fields) cap + align the FIGURE so the
      // caption follows the image; unset/full returns '' → today's full width.
      const sizing = inlineImageSizingClasses(v);
      return (
        <figure className={sizing ? `my-6 ${sizing}` : 'my-6'}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={v.alt || ''}
            loading="lazy"
            className="h-auto w-full rounded-md"
          />
          {v.alt && (
            <figcaption className="mt-2 text-center text-sm text-text-muted">{v.alt}</figcaption>
          )}
        </figure>
      );
    },
    embed: ({ value }) => {
      const v = value as EmbedValue;
      if (!v?.url) return null;
      let src = v.url;
      if (v.provider === 'youtube' && v.videoId) {
        src = `https://www.youtube.com/embed/${v.videoId}`;
      } else if (v.provider === 'vimeo' && v.videoId) {
        src = `https://player.vimeo.com/video/${v.videoId}`;
      }
      return (
        <figure className="my-8">
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={src}
              title={v.caption || 'Embedded video'}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full rounded-md"
            />
          </div>
          {v.caption && (
            <figcaption className="mt-2 text-center text-sm text-text-muted">{v.caption}</figcaption>
          )}
        </figure>
      );
    },
    blogProducts: ({ value }) => {
      const v = value as BlogProductsBlock;
      // SNIP-150: the SAME shared resolver (and the same inputs) the blog post
      // page uses to build its product ItemList, so the cards rendered here
      // and the products described to Google cannot disagree: a hidden SKU is
      // dropped and a replaced SKU swapped for its product page on both sides.
      const cards = resolveStripCards(v?.products ?? [], stripCtx);
      if (cards.length === 0) return null;
      return (
        <section className="my-8">
          {v.heading && (
            <h2 className="mt-6 text-2xl font-bold leading-tight text-brand-ink md:text-3xl">
              {v.heading}
            </h2>
          )}
          <StripCardGrid cards={cards} />
        </section>
      );
    },
  },
  marks: {
    link: ({ value, children }) => {
      const href = (value?.href as string) || '#';
      const openInNewTab = !!value?.openInNewTab;
      const isInternal = href.startsWith('/');
      if (isInternal && !openInNewTab) {
        return (
          <Link href={href} className="text-brand-red underline-offset-2 hover:underline">
            {children}
          </Link>
        );
      }
      return (
        <a
          href={href}
          target={openInNewTab ? '_blank' : undefined}
          rel={openInNewTab ? 'noopener noreferrer' : undefined}
          className="text-brand-red underline-offset-2 hover:underline"
        >
          {children}
        </a>
      );
    },
  },
  block: {
    normal: ({ children }) => (
      <p className="mt-3 text-base leading-relaxed text-text-primary md:text-[17px]">{children}</p>
    ),
    // h1/h5/h6 are allowed by the body schema (default block styles) but had no
    // renderer — Tailwind's preflight strips heading styles, so they rendered
    // as plain text. Minimal coverage pass (P2-AI-002); h2-h4 untouched.
    h1: ({ children }) => (
      <h1 className="mt-10 text-3xl font-bold leading-tight text-brand-ink md:text-4xl">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-10 text-2xl font-bold leading-tight text-brand-ink md:text-3xl">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-8 text-xl font-semibold leading-tight text-brand-ink md:text-2xl">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="mt-6 text-lg font-semibold leading-tight text-brand-ink">{children}</h4>
    ),
    h5: ({ children }) => (
      <h5 className="mt-6 text-base font-semibold leading-tight text-brand-ink">{children}</h5>
    ),
    h6: ({ children }) => (
      <h6 className="mt-6 text-sm font-semibold uppercase tracking-wide text-brand-ink">{children}</h6>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mt-4 border-l-4 border-brand-red bg-bg-soft px-5 py-4 italic text-text-primary">
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet: ({ children }) => (
      <ul className="mt-5 list-disc space-y-2 pl-6 text-text-primary marker:text-brand-red">
        {children}
      </ul>
    ),
    number: ({ children }) => (
      <ol className="mt-5 list-decimal space-y-2 pl-6 text-text-primary marker:text-brand-red">
        {children}
      </ol>
    ),
  },
  listItem: {
    bullet: ({ children }) => <li className="leading-relaxed">{children}</li>,
    number: ({ children }) => <li className="leading-relaxed">{children}</li>,
  },
  };
}

const EMPTY_SKU_MAP: Map<string, GeigerProduct> = new Map();
const EMPTY_GALLERY_MAP: ReadonlyMap<string, readonly PortfolioTile[]> = new Map();

/**
 * Pre-process portable text so consecutive list items at the same level + type
 * share one wrapper list (some blocks come through with mismatched `level`
 * values which would otherwise render each `<li>` in its own `<ol>`), and
 * drop empty paragraph blocks. PI's Froala editor inserts `<p><br></p>`
 * spacers between every heading / image / paragraph — rendering them as
 * `<p class="mt-5">` creates huge vertical gaps not present in the original
 * PI rendering. Stripping the empty blocks restores the tighter spacing.
 */
function isEmptyBlock(b: PortableTextBlock): boolean {
  const block = b as ListBlock;
  if (block._type !== 'block' || block.listItem) return false;
  const children = block.children || [];
  if (children.length === 0) return true;
  for (const c of children) {
    const text = (c.text || '').replace(/\s|​/g, '');
    if (text.length > 0) return false;
  }
  return true;
}

function normalizeBody(body: PortableTextBlock[]): PortableTextBlock[] {
  const out: PortableTextBlock[] = [];
  for (const b of body) {
    if (isEmptyBlock(b)) continue;
    const block = b as ListBlock;
    if (block._type === 'block' && block.listItem) {
      out.push({ ...(b as object), level: 1 } as PortableTextBlock);
    } else {
      out.push(b);
    }
  }
  return out;
}

export function BlogBody({
  body,
  skuProducts,
  hiddenSkus,
  replacementBySku,
  portfolioGalleries,
}: BlogBodyProps) {
  const normalized = normalizeBody(body);
  const components = buildComponents(
    {
      skuProducts: skuProducts ?? EMPTY_SKU_MAP,
      hiddenSkus,
      replacementBySku,
    },
    portfolioGalleries ?? EMPTY_GALLERY_MAP,
  );
  return (
    <div className="blog-body">
      <PortableText value={normalized} components={components} />
    </div>
  );
}
