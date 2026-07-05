import Link from 'next/link';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import type { PortableTextBlock } from '@portabletext/react';
import { urlForImage } from '@/lib/sanity/client';
import type { SanityImage } from '@/lib/sanity/types';
import type { GeigerProduct } from '@/lib/product-types';
import { ProductCard } from '@/components/category/ProductCard';
import { affiliateUrl } from '@/lib/affiliate-url';

interface BlogProductEntry {
  _key?: string;
  sku?: string;
  title?: string;
  image?: SanityImage & { alt?: string };
  url?: string;
}

interface BlogProductsValue {
  _key?: string;
  heading?: string;
  products?: BlogProductEntry[];
}

interface BlogBodyProps {
  body: PortableTextBlock[];
  skuProducts?: Map<string, GeigerProduct>;
}

const GEIGER_HOST_PATTERN = /^https?:\/\/(www\.)?geiger\.com\//i;
const AFFILIATE_HOST_PATTERN = /^https?:\/\/[^/]*\.geiger\.com\//i;

function isGeigerUrl(url: string): boolean {
  return GEIGER_HOST_PATTERN.test(url) || AFFILIATE_HOST_PATTERN.test(url);
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
  skuProducts: Map<string, GeigerProduct>,
): PortableTextComponents {
  return {
  types: {
    image: ({ value }) => {
      const v = value as SanityImage & { alt?: string };
      if (!v?.asset) return null;
      const src = urlForImage(v).width(1200).fit('max').url();
      return (
        <figure className="my-6">
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
      const v = value as BlogProductsValue;
      const entries = v?.products ?? [];
      const cards = entries
        .map((entry, idx) => {
          const sku = entry.sku?.trim();
          const resolved = sku ? skuProducts.get(sku) : undefined;
          if (resolved) {
            return (
              <ProductCard
                key={entry._key || `sku-${sku}-${idx}`}
                product={resolved}
              />
            );
          }
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
        <section className="my-8">
          {v.heading && (
            <h2 className="mt-6 text-2xl font-bold leading-tight text-brand-ink md:text-3xl">
              {v.heading}
            </h2>
          )}
          <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {cards}
          </div>
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

export function BlogBody({ body, skuProducts }: BlogBodyProps) {
  const normalized = normalizeBody(body);
  const components = buildComponents(skuProducts ?? EMPTY_SKU_MAP);
  return (
    <div className="blog-body">
      <PortableText value={normalized} components={components} />
    </div>
  );
}
