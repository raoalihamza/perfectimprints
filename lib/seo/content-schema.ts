/**
 * Schema emitters for AI-generated / editorial content types (P2-AI-001).
 * BlogPosting lives here (extracted verbatim from app/blog/[slug]/page.tsx so
 * the blog route and any future consumer emit identical objects).
 *
 * VideoObject (P2-AI-003): the canonical emitter is `videoObjectSchema()` in
 * lib/seo/schema-generators.ts, already emitted by app/videos/[slug]/page.tsx —
 * the AI video tool reuses it as-is (its `description` plain-texts the richer
 * AI description automatically). Do not add a second VideoObject emitter here.
 *
 * Pure module: no node:fs, no Sanity, no server-only — unit-testable anywhere.
 */

import { collectionPageSchema } from './schema-generators';

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
    // SNIP-150: emitted ONLY when the editor recorded an updated date. It used
    // to fall back to `publishDate`, which on the 310 of 652 posts (47.5%)
    // with no updated date told Google "last modified = first published" -
    // an assertion about a date nobody recorded. Google lists `dateModified`
    // as recommended "only if you decide that it's applicable", shows no
    // warning when it is absent, and omitting a value we do not have is the
    // honest choice. The system `_updatedAt` was measured and REJECTED as a
    // source: 621 of the 652 posts carry 2026-07-13, the day a one-time script
    // wrote the CTA body onto every post, so it records a scripted metadata
    // write, not an edit a reader would notice, and would have claimed 621
    // posts were freshened on one day. See CLAUDE.md section 11.
    dateModified: input.updatedDate || undefined,
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

/**
 * The structured data for a blog LISTING page (SNIP-150): `/blog`, its
 * `/page/N` variants, and `/blog/cat/<slug>` (+ pagination). Two blocks, the
 * same pair every category page emits:
 *
 * 1. `CollectionPage` - the page is a collection of articles, exactly as a
 *    `/cat` page is a collection of products. Always emitted, including on a
 *    category with no posts (the page still exists and is still indexable;
 *    the entity describes the page, not the list).
 * 2. `ItemList` of the posts RENDERED ON THIS PAGE, each `ListItem` carrying
 *    `position` and the post's canonical `url` and nothing else. This is the
 *    "summary page" shape from Google's ItemList guidance: each card here
 *    links to a detail page that carries the full BlogPosting entity, so the
 *    list points at those pages rather than restating a weaker copy of each
 *    article. It is deliberately NOT the product serializer (those cards link
 *    off-site, so the list is the only place Google can read the product, which
 *    is why they nest a full Product) and NOT the old 3-field `itemListSchema`
 *    (its per-item `name` + `image` are the extra properties the summary-page
 *    shape says to leave off). Per-page rule as everywhere else: `/page/N`
 *    describes its own posts, positions restarting at 1. Emitted only when at
 *    least one post renders; an empty category page gets no list at all rather
 *    than an empty one (Google's own "at least two ListItem" line is a carousel
 *    rule, and carousels do not cover articles; a one-post page still renders
 *    one post, so it is still a true statement).
 *
 * Pure: the caller passes absolute URLs it already holds.
 */
export interface BlogListingSchemaInput {
  /** The page heading, e.g. "Perfect Imprints Blog" or "Posts in Christmas". */
  name: string;
  /** The page's canonical URL (the clean page-1 URL, as on /cat). */
  url: string;
  description?: string | null;
  /** Absolute canonical URLs of the posts rendered on THIS page, in grid order. */
  postUrls: readonly string[];
}

export function buildBlogListingSchemas(input: BlogListingSchemaInput): Record<string, unknown>[] {
  const collection = collectionPageSchema({
    name: input.name,
    url: input.url,
    description: input.description || undefined,
  });

  const urls = input.postUrls.filter((u) => typeof u === 'string' && u.length > 0);
  if (urls.length === 0) return [collection];

  return [
    collection,
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      numberOfItems: urls.length,
      itemListElement: urls.map((url, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url,
      })),
    },
  ];
}
