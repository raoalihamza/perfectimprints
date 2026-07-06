import 'server-only';

import type { PortableTextBlock } from '@portabletext/react';
import { cachedClient } from '@/lib/sanity/client';
import { PAGES_TAG, pageTag } from '@/lib/sanity/cache-tags';
import type { SanityImage } from '@/lib/sanity/types';

// ---------------------------------------------------------------------------
// Generic section-based `page` document (M5-506b). One type powers Services
// now and About/Privacy/Terms/Contact later. Queried by slug.
// ---------------------------------------------------------------------------

export type PageImage = SanityImage & { alt?: string };

interface BaseSection {
  _key: string;
  _type: string;
  hidden?: boolean;
  /** When set, the section wrapper gets this `id` so it can be an in-page jump target (#anchorId). */
  anchorId?: string;
}

export interface HeroBannerSection extends BaseSection {
  _type: 'heroBanner';
  image?: PageImage;
  imageUrl?: string;
  heading?: string;
  subheading?: string;
  overlayText?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
}

export interface RichTextSection extends BaseSection {
  _type: 'richText';
  heading?: string;
  body?: PortableTextBlock[];
}

export interface ImageTextSection extends BaseSection {
  _type: 'imageText';
  image?: PageImage;
  imageUrl?: string;
  heading?: string;
  body?: PortableTextBlock[];
}

export interface InfographicSection extends BaseSection {
  _type: 'infographic';
  image?: PageImage;
  imageUrl?: string;
  heading?: string;
  caption?: string;
}

export interface IconFeature {
  _key?: string;
  icon?: PageImage;
  imageUrl?: string;
  heading?: string;
  text?: string;
}

export interface IconFeaturesSection extends BaseSection {
  _type: 'iconFeatures';
  heading?: string;
  columns?: number;
  features?: IconFeature[];
}

export interface StatBannerSection extends BaseSection {
  _type: 'statBanner';
  background?: 'red' | 'ink' | 'green' | 'soft';
  statText?: string;
  subtext?: string;
}

export interface CardGridCard {
  _key?: string;
  title?: string;
  text?: string;
  image?: PageImage;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export interface CardGridSection extends BaseSection {
  _type: 'cardGrid';
  heading?: string;
  columns?: number;
  cards?: CardGridCard[];
}

export interface CtaButton {
  _key?: string;
  label?: string;
  href?: string;
}

export interface CtaBlockSection extends BaseSection {
  _type: 'ctaBlock';
  heading?: string;
  subheading?: string;
  buttons?: CtaButton[];
}

export interface EventItem {
  _key?: string;
  city?: string;
  venue?: string;
  date?: string;
  time?: string;
}

export interface EventListSection extends BaseSection {
  _type: 'eventList';
  heading?: string;
  events?: EventItem[];
}

export interface FaqItem {
  _key?: string;
  question?: string;
  answer?: string;
}

export interface FaqAccordionSection extends BaseSection {
  _type: 'faqAccordion';
  heading?: string;
  items?: FaqItem[];
}

export interface VideoEmbedSection extends BaseSection {
  _type: 'videoEmbed';
  heading?: string;
  /** Pasted YouTube / Vimeo / Instagram / Facebook URL (provider auto-detected). */
  url?: string;
  caption?: string;
}

/**
 * One `productStrip` entry — the shared `blogProduct` object (P2-AI-004):
 * SKU-backed (resolved live from products.json at render time) or manual
 * (title/image/url), same shape as blog body strips and video.relatedProducts.
 */
export interface ProductStripEntry {
  _key?: string;
  sku?: string;
  title?: string;
  image?: PageImage;
  url?: string;
}

export interface ProductStripSection extends BaseSection {
  _type: 'productStrip';
  heading?: string;
  products?: ProductStripEntry[];
}

export type PageSection =
  | HeroBannerSection
  | RichTextSection
  | ImageTextSection
  | InfographicSection
  | IconFeaturesSection
  | StatBannerSection
  | CardGridSection
  | CtaBlockSection
  | EventListSection
  | VideoEmbedSection
  | FaqAccordionSection
  | ProductStripSection;

export interface PageDoc {
  _id: string;
  title: string;
  slug: string;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    ogImage?: SanityImage;
  };
  sections: PageSection[];
}

// `sections[]{ ... }` spreads every field of every section object, including
// nested arrays (productStrip.products[], faqAccordion.items[], …), so new
// section types need no projection change — only a TS interface above.
const PAGE_PROJECTION = `{
  _id,
  title,
  "slug": slug.current,
  seo,
  sections[]{ ... }
}`;

export async function getPageBySlug(slug: string): Promise<PageDoc | null> {
  try {
    return await cachedClient.fetch<PageDoc | null>(
      `*[_type == "page" && slug.current == $slug][0]${PAGE_PROJECTION}`,
      { slug },
      { next: { tags: [PAGES_TAG, pageTag(slug)].filter(Boolean), revalidate: false } },
    );
  } catch {
    return null;
  }
}

export async function getAllPageSlugs(): Promise<string[]> {
  try {
    const slugs = await cachedClient.fetch<string[]>(
      `*[_type == "page" && defined(slug.current)].slug.current`,
      {},
      { next: { tags: [PAGES_TAG], revalidate: false } },
    );
    return slugs ?? [];
  } catch {
    return [];
  }
}
