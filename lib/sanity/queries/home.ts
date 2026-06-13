import type { PortableTextBlock } from '@portabletext/react';
import { client, urlForImage } from '@/lib/sanity/client';
import type { SanityImage } from '@/lib/sanity/types';

export interface HomeHero {
  imageUrl: string | null;
  imageAlt: string | null;
  headline: string | null;
  subheadline: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

export interface HomeFeaturedBlock {
  title: string;
  href: string;
  imageUrl: string | null;
  imageAlt: string;
}

export interface HomeValueProp {
  title: string;
  body: string;
}

export interface HomeTestimonial {
  text: string;
  attribution: string;
  company: string | null;
}

export interface HomePageData {
  hero: HomeHero | null;
  featuredBlocks: HomeFeaturedBlock[];
  valueProps: HomeValueProp[];
  newProductsHeading: string;
  blogPreviewHeading: string;
  testimonials: HomeTestimonial[];
  textContent: PortableTextBlock[];
  brandsHeading: string;
  brandsSubheading: string | null;
}

export interface HomeCtaBannerCopy {
  title: string | null;
  body: string | null;
  buttonLabel: string | null;
  buttonHref: string | null;
}

const CTA_QUERY = `*[_type == "globalSettings"][0].ctaBanner{
  title, body, buttonLabel, buttonHref
}`;

export async function getHomeCtaBanner(): Promise<HomeCtaBannerCopy> {
  try {
    const result = await client.fetch<HomeCtaBannerCopy | null>(CTA_QUERY);
    return result ?? { title: null, body: null, buttonLabel: null, buttonHref: null };
  } catch {
    return { title: null, body: null, buttonLabel: null, buttonHref: null };
  }
}

interface RawHomeDoc {
  heroBanner?: {
    image?: SanityImage & { alt?: string };
    headline?: string;
    subheadline?: string;
    ctaLabel?: string;
    ctaHref?: string;
  };
  featuredBlocks?: Array<{
    title?: string;
    href?: string;
    image?: SanityImage & { alt?: string };
  }>;
  valueProps?: Array<{ title?: string; body?: string }>;
  newProductsHeading?: string;
  blogPreviewHeading?: string;
  testimonials?: Array<{ text?: string; attribution?: string; company?: string }>;
  textContent?: PortableTextBlock[];
  brandsGridHeading?: string;
  brandsGridSubheading?: string;
}

const HOME_QUERY = `*[_type == "homePage"][0]{
  heroBanner,
  featuredBlocks,
  valueProps,
  newProductsHeading,
  blogPreviewHeading,
  testimonials,
  textContent,
  brandsGridHeading,
  brandsGridSubheading
}`;

const DEFAULT_NEW_PRODUCTS_HEADING = 'New and Trending Promotional Products';
const DEFAULT_BLOG_HEADING = 'From the Blog';
const DEFAULT_BRANDS_HEADING = 'Brands We Carry';
const DEFAULT_BRANDS_SUBHEADING =
  'Custom imprint and embroidery on the brands buyers already trust.';

// Hard-coded fallbacks for the two structural sections that would otherwise
// leave gaping holes if the Sanity homePage doc isn't populated yet. Once
// Patrick saves the singleton in Studio, Sanity wins.
const FALLBACK_VALUE_PROPS: HomeValueProp[] = [
  {
    title: 'Bulk Pricing on 22,000+ Products',
    body: 'Custom apparel, drinkware, bags, tech, writing, and giveaways — wholesale pricing scaled to your order size.',
  },
  {
    title: 'Rush Production Available',
    body: 'Promotional products with 1–5 day production for trade shows, hires, and on-site events that can’t wait.',
  },
  {
    title: 'Dedicated Reps, Free Art Proofs',
    body: 'Real account managers — not AI chat. Free art proofs before production so your branded items land right the first time.',
  },
];

const FALLBACK_FEATURED_BLOCKS: HomeFeaturedBlock[] = [
  { title: 'Custom Drinkware', href: '/cat/drinkware', imageUrl: null, imageAlt: 'Custom drinkware' },
  { title: 'Branded Apparel', href: '/cat/apparel', imageUrl: null, imageAlt: 'Branded apparel' },
  { title: 'Tote Bags & Backpacks', href: '/cat/bags', imageUrl: null, imageAlt: 'Custom tote bags and backpacks' },
  { title: 'Tech & Accessories', href: '/cat/office', imageUrl: null, imageAlt: 'Tech and office accessories' },
  { title: 'Writing Instruments', href: '/cat/writing-instruments', imageUrl: null, imageAlt: 'Custom pens and writing instruments' },
  { title: 'Outdoor & Lifestyle', href: '/cat/outdoor', imageUrl: null, imageAlt: 'Outdoor and lifestyle giveaways' },
];

function resolveImage(image: (SanityImage & { alt?: string }) | undefined, width: number, height?: number): { url: string | null; alt: string } {
  if (!image?.asset?._ref) return { url: null, alt: image?.alt ?? '' };
  try {
    let builder = urlForImage(image).width(width).fit('crop');
    if (height) builder = builder.height(height);
    return { url: builder.url(), alt: image.alt ?? '' };
  } catch {
    return { url: null, alt: image.alt ?? '' };
  }
}

export async function getHomePage(): Promise<HomePageData> {
  let doc: RawHomeDoc | null = null;
  try {
    doc = await client.fetch<RawHomeDoc | null>(HOME_QUERY);
  } catch {
    doc = null;
  }

  const hero: HomeHero | null = doc?.heroBanner
    ? (() => {
        const { url, alt } = resolveImage(doc.heroBanner!.image, 1600, 900);
        return {
          imageUrl: url,
          imageAlt: alt || doc.heroBanner!.headline || 'Perfect Imprints',
          headline: doc.heroBanner!.headline ?? null,
          subheadline: doc.heroBanner!.subheadline ?? null,
          ctaLabel: doc.heroBanner!.ctaLabel ?? null,
          ctaHref: doc.heroBanner!.ctaHref ?? null,
        };
      })()
    : null;

  const sanityFeaturedBlocks: HomeFeaturedBlock[] = (doc?.featuredBlocks ?? [])
    .filter((b) => b.title && b.href)
    .map((b) => {
      const { url, alt } = resolveImage(b.image, 800, 600);
      return {
        title: b.title!,
        href: b.href!,
        imageUrl: url,
        imageAlt: alt || b.title!,
      };
    });
  const featuredBlocks =
    sanityFeaturedBlocks.length > 0 ? sanityFeaturedBlocks : FALLBACK_FEATURED_BLOCKS;

  const sanityValueProps: HomeValueProp[] = (doc?.valueProps ?? [])
    .filter((v) => v.title)
    .map((v) => ({ title: v.title!, body: v.body ?? '' }));
  const valueProps = sanityValueProps.length > 0 ? sanityValueProps : FALLBACK_VALUE_PROPS;

  const testimonials: HomeTestimonial[] = (doc?.testimonials ?? [])
    .filter((t) => t.text && t.attribution)
    .map((t) => ({
      text: t.text!,
      attribution: t.attribution!,
      company: t.company?.trim() ? t.company.trim() : null,
    }));

  return {
    hero,
    featuredBlocks,
    valueProps,
    newProductsHeading: doc?.newProductsHeading?.trim() || DEFAULT_NEW_PRODUCTS_HEADING,
    blogPreviewHeading: doc?.blogPreviewHeading?.trim() || DEFAULT_BLOG_HEADING,
    testimonials,
    textContent: doc?.textContent ?? [],
    brandsHeading: doc?.brandsGridHeading?.trim() || DEFAULT_BRANDS_HEADING,
    brandsSubheading: doc?.brandsGridSubheading?.trim() || DEFAULT_BRANDS_SUBHEADING,
  };
}
