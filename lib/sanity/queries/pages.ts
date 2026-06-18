import 'server-only';

import type { PortableTextBlock } from '@portabletext/react';
import { client } from '@/lib/sanity/client';
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
  | FaqAccordionSection;

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

const PAGE_PROJECTION = `{
  _id,
  title,
  "slug": slug.current,
  seo,
  sections[]{ ... }
}`;

export async function getPageBySlug(slug: string): Promise<PageDoc | null> {
  try {
    return await client.fetch<PageDoc | null>(
      `*[_type == "page" && slug.current == $slug][0]${PAGE_PROJECTION}`,
      { slug },
    );
  } catch {
    return null;
  }
}

export async function getAllPageSlugs(): Promise<string[]> {
  try {
    const slugs = await client.fetch<string[]>(
      `*[_type == "page" && defined(slug.current)].slug.current`,
    );
    return slugs ?? [];
  } catch {
    return [];
  }
}
