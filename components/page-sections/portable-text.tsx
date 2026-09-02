import Link from 'next/link';
import { type PortableTextComponents } from '@portabletext/react';
import { urlForRenderImage } from '@/lib/sanity/client';
import {
  inlineImageAssetWidth,
  inlineImageSizingClasses,
} from '@/lib/portable-text/inline-image-size';

/** Shape of an inline `image` block dropped into rich-text body. */
type InlineImageValue = { asset?: { _ref?: string }; alt?: string; size?: string; align?: string };

/**
 * Shared PortableText renderer config for page-builder rich text
 * (richText + imageText sections). Headings, paragraphs, lists, links, and
 * INLINE images styled to match the site's body typography.
 */
export const pagePortableComponents: PortableTextComponents = {
  types: {
    // Inline image dropped between paragraphs in a rich-text body. Renders only
    // when it has an uploaded asset; degrades to nothing otherwise (no broken
    // image icon). Plain <img> with lazy loading, matching SectionImage.
    image: ({ value }) => {
      const v = value as InlineImageValue;
      if (!v?.asset?._ref) return null;
      let src: string | null = null;
      try {
        // Asset width matched to the editor-chosen size (full/unset = 1200,
        // exactly as before) so a quarter-width image doesn't fetch 1200px.
        src = urlForRenderImage(v).width(inlineImageAssetWidth(v)).fit('max').url();
      } catch {
        return null;
      }
      if (!src) return null;
      // size/align (optional Studio fields) append a responsive max-width cap
      // + auto-margin alignment; unset/full returns '' → today's full width.
      const sizing = inlineImageSizingClasses(v);
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={v.alt || ''}
          loading="lazy"
          className={sizing ? `my-6 w-full rounded-md ${sizing}` : 'my-6 w-full rounded-md'}
        />
      );
    },
  },
  block: {
    h2: ({ children }) => (
      <h2 className="mt-8 text-2xl font-bold text-brand-ink md:text-3xl">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-6 text-xl font-semibold text-brand-ink">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="mt-5 text-lg font-semibold text-brand-ink">{children}</h4>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mt-5 border-l-4 border-brand-red pl-4 italic text-text-primary">
        {children}
      </blockquote>
    ),
    normal: ({ children }) => (
      <p className="mt-4 text-base leading-relaxed text-text-primary md:text-lg">{children}</p>
    ),
  },
  list: {
    bullet: ({ children }) => (
      <ul className="mt-4 list-disc space-y-2 pl-6 text-base text-text-primary md:text-lg">
        {children}
      </ul>
    ),
    number: ({ children }) => (
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-base text-text-primary md:text-lg">
        {children}
      </ol>
    ),
  },
  marks: {
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    link: ({ value, children }) => {
      const href = (value?.href as string) || '#';
      const cls = 'text-brand-red underline hover:no-underline';
      // "Open in new tab" toggle on the shared page-builder link annotation
      // (page/landing/productPage bodies). AI-placed links default it ON.
      const newTab = value?.openInNewTab === true;
      const newTabProps = newTab
        ? ({ target: '_blank', rel: 'noopener noreferrer' } as const)
        : {};
      // External (affiliate/outbound) and same-page hash links render as plain
      // <a>; only internal app paths use next/link.
      const external = /^https?:\/\//i.test(href);
      if (external || href.startsWith('#')) {
        return (
          <a href={href} className={cls} {...newTabProps}>
            {children}
          </a>
        );
      }
      return (
        <Link href={href} className={cls} {...newTabProps}>
          {children}
        </Link>
      );
    },
  },
};
