import type { Metadata } from 'next';

/**
 * Shared Open Graph + Twitter card builder (M-SEO3 Part 3).
 *
 * Next.js merges metadata shallowly per top-level key, so a page that sets its
 * own `openGraph` REPLACES the root-layout default entirely (losing siteName,
 * type, etc). This helper guarantees every page emits a COMPLETE OG set —
 * og:title, og:description, og:image, og:url, og:type, og:site_name,
 * og:image:alt — plus a summary_large_image Twitter card, so each page that
 * spreads `socialMeta(...)` into its metadata stays complete on its own.
 *
 * og:image falls back to the Perfect Imprints logo when no page-specific image
 * is available; og:image:alt falls back to the title.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);
const SITE_NAME = 'Perfect Imprints';

/** Logo fallback for og:image when a page has no better image (e.g. CTA-only). */
export const LOGO_OG_IMAGE = `${SITE_URL}/logo.svg`;

export interface SocialMetaInput {
  /** og:title (the descriptive page title, brand suffix optional). */
  title: string;
  description?: string;
  /** Page path ("/cat/x") or an absolute URL — becomes og:url (the canonical). */
  url: string;
  /** og:image. Null/undefined falls back to the PI logo. */
  image?: string | null;
  /** og:image:alt. Falls back to the title. */
  imageAlt?: string;
  /** og:type. "website" for listing/home, "article" for blog posts. */
  type?: 'website' | 'article';
  /** Article only — ISO publish date. */
  publishedTime?: string;
  /** Article only — ISO modified date. */
  modifiedTime?: string;
}

export function socialMeta(input: SocialMetaInput): Pick<Metadata, 'openGraph' | 'twitter'> {
  const url = /^https?:\/\//i.test(input.url) ? input.url : `${SITE_URL}${input.url}`;
  const image = input.image || LOGO_OG_IMAGE;
  const imageAlt = input.imageAlt || input.title;
  const description = input.description;
  const isArticle = input.type === 'article';

  return {
    openGraph: {
      type: input.type ?? 'website',
      siteName: SITE_NAME,
      title: input.title,
      ...(description ? { description } : {}),
      url,
      images: [{ url: image, alt: imageAlt }],
      ...(isArticle && input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(isArticle && input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      ...(description ? { description } : {}),
      images: [image],
    },
  };
}
