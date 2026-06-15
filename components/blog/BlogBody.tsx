import Link from 'next/link';
import { PortableText, type PortableTextComponents } from '@portabletext/react';
import type { PortableTextBlock } from '@portabletext/react';
import { urlForImage } from '@/lib/sanity/client';
import type { SanityImage } from '@/lib/sanity/types';

interface BlogBodyProps {
  body: PortableTextBlock[];
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

const components: PortableTextComponents = {
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
    h2: ({ children }) => (
      <h2 className="mt-10 text-2xl font-bold leading-tight text-brand-ink md:text-3xl">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-8 text-xl font-semibold leading-tight text-brand-ink md:text-2xl">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="mt-6 text-lg font-semibold leading-tight text-brand-ink">{children}</h4>
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

export function BlogBody({ body }: BlogBodyProps) {
  const normalized = normalizeBody(body);
  return (
    <div className="blog-body">
      <PortableText value={normalized} components={components} />
    </div>
  );
}
