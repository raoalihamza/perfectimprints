import Link from 'next/link';
import {
  PortableText,
  type PortableTextBlock,
  type PortableTextComponents,
} from '@portabletext/react';
import { affiliateUrl } from '@/lib/affiliate-url';

/**
 * Shared renderer for the short rich-text fields introduced in Task B — FAQ
 * answers (library + category-page) and video descriptions. Supports normal
 * paragraphs, bold/italic, and the standard link annotation only (no images,
 * headings, or product blocks — these are short answers).
 *
 * Link behavior mirrors the blog / page-section renderers: internal app paths
 * use `next/link`; external + `#hash` / `mailto:` / `tel:` links render as a
 * plain `<a>`; any Geiger URL is rewritten through `lib/affiliate-url.ts`;
 * external `http(s)` links open in a new tab.
 */

const GEIGER_HOST_PATTERN = /^https?:\/\/(www\.)?geiger\.com\//i;
const AFFILIATE_HOST_PATTERN = /^https?:\/\/[^/]*\.geiger\.com\//i;

function isGeigerUrl(url: string): boolean {
  return GEIGER_HOST_PATTERN.test(url) || AFFILIATE_HOST_PATTERN.test(url);
}

const LINK_CLASS = 'text-brand-red underline hover:no-underline';

export const richAnswerComponents: PortableTextComponents = {
  block: {
    normal: ({ children }) => <p className="leading-relaxed [&:not(:first-child)]:mt-3">{children}</p>,
  },
  marks: {
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    link: ({ value, children }) => {
      const raw = (value?.href as string) || '#';
      const href = isGeigerUrl(raw) ? affiliateUrl(raw) : raw;
      // Internal app path → client-side nav.
      if (href.startsWith('/')) {
        return (
          <Link href={href} className={LINK_CLASS}>
            {children}
          </Link>
        );
      }
      // Everything else (http(s), #hash, mailto:, tel:) renders as a plain <a>.
      // Only true http(s) links open in a new tab.
      const isHttp = /^https?:\/\//i.test(href);
      const rel = isHttp
        ? isGeigerUrl(raw)
          ? 'noopener noreferrer sponsored'
          : 'noopener noreferrer'
        : undefined;
      return (
        <a href={href} target={isHttp ? '_blank' : undefined} rel={rel} className={LINK_CLASS}>
          {children}
        </a>
      );
    },
  },
};

interface RichAnswerProps {
  value?: PortableTextBlock[] | string | null;
  className?: string;
}

/**
 * Renders a rich-text answer/description. Returns null for empty content.
 * Tolerates a legacy plain string (renders it as a paragraph) so a doc that
 * somehow slipped past the migration never crashes the render.
 */
export function RichAnswer({ value, className }: RichAnswerProps) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;

  if (typeof value === 'string') {
    return <p className={className ? `whitespace-pre-line leading-relaxed ${className}` : 'whitespace-pre-line leading-relaxed'}>{value}</p>;
  }

  const content = <PortableText value={value} components={richAnswerComponents} />;
  return className ? <div className={className}>{content}</div> : content;
}
