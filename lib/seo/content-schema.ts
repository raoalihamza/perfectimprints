/**
 * Schema emitters for AI-generated / editorial content types (P2-AI-001).
 * BlogPosting lives here (extracted verbatim from app/blog/[slug]/page.tsx so
 * the blog route and any future consumer emit identical objects).
 *
 * // VideoObject emitter will live here (P2-AI-003) — extend this module, do
 * // not inline a new schema object in a page file.
 *
 * Pure module: no node:fs, no Sanity, no server-only — unit-testable anywhere.
 */

const DEFAULT_SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com'
).replace(/\/$/, '');

export interface BlogPostingSchemaInput {
  title: string;
  /** Absolute canonical URL of the post. */
  canonical: string;
  /** Absolute hero image URL, when the post has one. */
  heroImage?: string | null;
  publishDate: string;
  updatedDate?: string | null;
  authorName?: string | null;
  description?: string | null;
  /** Origin for the publisher logo; defaults to NEXT_PUBLIC_SITE_URL. */
  siteUrl?: string;
}

/** The BlogPosting JSON-LD object emitted on every blog article. */
export function buildBlogPostingSchema(input: BlogPostingSchemaInput) {
  const siteUrl = (input.siteUrl ?? DEFAULT_SITE_URL).replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: input.title,
    image: input.heroImage ? [input.heroImage] : undefined,
    datePublished: input.publishDate,
    dateModified: input.updatedDate || input.publishDate,
    author: input.authorName
      ? { '@type': 'Person', name: input.authorName }
      : { '@type': 'Organization', name: 'Perfect Imprints' },
    publisher: {
      '@type': 'Organization',
      name: 'Perfect Imprints',
      logo: { '@type': 'ImageObject', url: `${siteUrl}/logo.svg` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.canonical },
    description: input.description || undefined,
  };
}
