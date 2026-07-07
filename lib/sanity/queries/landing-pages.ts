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
  /** Hero button label (P2-AI-005 part 2). Blank → "Request a Quote". */
  heroCtaLabel?: string;
  localIntro?: PortableTextBlock[];
  optionsIdeas?: PortableTextBlock[];
  whyUs?: PortableTextBlock[];
  relatedProducts?: LandingProductEntry[];
  faqs?: LandingFaq[];
  /** Quote-form heading (part 2). Blank → "Request a Quote in {City}, {State}". */
  leadFormHeading?: string;
  /** Where this page's lead emails go (part 2) — resolved server-side by slug. */
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
  heroCtaLabel,
  localIntro,
  optionsIdeas,
  whyUs,
  relatedProducts,
  faqs,
  leadFormHeading,
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

/**
 * The stored lead-routing fields the /api/leads route needs (P2-AI-005 part 2).
 * Same shape as `LandingLeadInfo` in lib/leads/landing-lead.ts.
 */
export interface LandingLeadLookup {
  leadRecipient?: string | null;
  product?: string | null;
  title?: string | null;
}

/**
 * Lightweight SERVER-SIDE lookup for the lead route: maps a client-submitted
 * landing slug to the doc's stored `leadRecipient` (+ product/title for the
 * confirmation copy). The client never sends a recipient — only this slug —
 * so the stored value is the only possible destination (no open relay).
 * Returns null when the slug is not a real landing page or the read fails; the
 * route then treats the submission as non-landing (default recipient, no
 * confirmation). Cache-tagged like every landing read, so editing
 * `leadRecipient` in Studio re-routes within seconds of the webhook firing.
 */
export async function getLandingLeadInfo(slug: string): Promise<LandingLeadLookup | null> {
  if (!slug) return null;
  try {
    return await cachedClient.fetch<LandingLeadLookup | null>(
      `*[_type == "landingPage" && slug.current == $slug][0]{ leadRecipient, product, title }`,
      { slug },
      { next: { tags: [LANDING_TAG, landingTag(slug)].filter(Boolean), revalidate: false } },
    );
  } catch {
    return null;
  }
}
