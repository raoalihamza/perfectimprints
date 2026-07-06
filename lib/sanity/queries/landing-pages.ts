import 'server-only';

import type { PortableTextBlock } from '@portabletext/react';
import { cachedClient } from '@/lib/sanity/client';
import { LANDING_TAG, landingTag } from '@/lib/sanity/cache-tags';
import type { SanityImage } from '@/lib/sanity/types';

// ---------------------------------------------------------------------------
// Local/topic `landingPage` documents (P2-AI-005 part 1). Rendered at /<slug>
// by the root catch-all app/[...slug]/page.tsx, resolved BEFORE `page` docs.
// Mirrors lib/sanity/queries/pages.ts: every read is a non-CDN cache-tagged
// fetch (never no-store) so the route stays statically prerenderable while the
// webhook revalidates a publish in seconds.
// ---------------------------------------------------------------------------

/** One FAQ item (plain-text answer, same shape as the page faqAccordion items). */
export interface LandingFaq {
  _key?: string;
  question?: string;
  answer?: string;
}

/**
 * One related-products entry — the shared `blogProduct` object: SKU-backed
 * (resolved live from products.json at render time) or manual (title/image/url).
 * Structurally identical to ProductStripEntry / VideoRelatedProductEntry.
 */
export interface LandingProductEntry {
  _key?: string;
  sku?: string;
  title?: string;
  image?: (SanityImage & { alt?: string }) | undefined;
  url?: string;
}

export interface LandingPageDoc {
  _id: string;
  title: string;
  slug: string;
  city?: string;
  state?: string;
  product?: string;
  heroHeading?: string;
  heroSubheading?: string;
  localIntro?: PortableTextBlock[];
  optionsIdeas?: PortableTextBlock[];
  whyUs?: PortableTextBlock[];
  relatedProducts?: LandingProductEntry[];
  faqs?: LandingFaq[];
  /** Stored now; consumed by the landing-specific lead form in part 2. */
  leadRecipient?: string;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    ogImage?: SanityImage;
  };
}

const LANDING_PROJECTION = `{
  _id,
  title,
  "slug": slug.current,
  city,
  state,
  product,
  heroHeading,
  heroSubheading,
  localIntro,
  optionsIdeas,
  whyUs,
  relatedProducts,
  faqs,
  leadRecipient,
  seo
}`;

export async function getLandingPageBySlug(slug: string): Promise<LandingPageDoc | null> {
  try {
    return await cachedClient.fetch<LandingPageDoc | null>(
      `*[_type == "landingPage" && slug.current == $slug][0]${LANDING_PROJECTION}`,
      { slug },
      { next: { tags: [LANDING_TAG, landingTag(slug)].filter(Boolean), revalidate: false } },
    );
  } catch {
    return null;
  }
}

export async function getAllLandingPageSlugs(): Promise<string[]> {
  try {
    const slugs = await cachedClient.fetch<string[]>(
      `*[_type == "landingPage" && defined(slug.current)].slug.current`,
      {},
      { next: { tags: [LANDING_TAG], revalidate: false } },
    );
    return slugs ?? [];
  } catch {
    return [];
  }
}
