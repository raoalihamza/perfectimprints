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
      <p className="mt-5 text-base leading-relaxed text-text-primary md:text-[17px]">{children}</p>
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
      <blockquote className="mt-6 border-l-4 border-brand-red bg-bg-soft px-5 py-4 italic text-text-primary">
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
 * are guaranteed to share one wrapper list. Some blogs come through with
 * mismatched `level` values, which causes @portabletext/react to render each
 * `<li>` inside its own `<ol>` (each starting at 1) instead of one `<ol>`
 * counting up. Normalising all list items to level 1 lets the default grouping
 * work and renders 1, 2, 3 as expected.
 */
function normalizeLists(body: PortableTextBlock[]): PortableTextBlock[] {
  const out: PortableTextBlock[] = [];
  for (const b of body) {
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
  const normalized = normalizeLists(body);
  return (
    <div className="blog-body">
      <PortableText value={normalized} components={components} />
    </div>
  );
}
