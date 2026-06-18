import Link from 'next/link';
import { type PortableTextComponents } from '@portabletext/react';

/**
 * Shared PortableText renderer config for page-builder rich text
 * (richText + imageText sections). Headings, paragraphs, lists, and links
 * styled to match the site's body typography.
 */
export const pagePortableComponents: PortableTextComponents = {
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
      // External (affiliate/outbound) and same-page hash links render as plain
      // <a>; only internal app paths use next/link.
      const external = /^https?:\/\//i.test(href);
      if (external || href.startsWith('#')) {
        return (
          <a href={href} className={cls}>
            {children}
          </a>
        );
      }
      return (
        <Link href={href} className={cls}>
          {children}
        </Link>
      );
    },
  },
};
