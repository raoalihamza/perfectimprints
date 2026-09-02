import type { PortableTextBlock } from '@portabletext/react';
import { cachedClient, urlForRenderImage } from '@/lib/sanity/client';
import { HOME_TAG, SETTINGS_TAG } from '@/lib/sanity/cache-tags';
import type { SanityImage } from '@/lib/sanity/types';

// Q-175. Both reads below moved off the CDN `client` onto the non-CDN
// `cachedClient` with a cache tag. `/` is `force-static` with no `revalidate`,
// so it is generated once and only the webhook rebuilds it - which made every
// publish the same race the blog detail page lost: rebuild fires within a
// second, the Sanity CDN is still serving its pre-publish copy, and that stale
// copy is then frozen. `useCdn: false` removes the race; the tag is what keeps
// the read CACHED so `/` stays static instead of flipping dynamic.
const HOME_FETCH_OPTS = { next: { tags: [HOME_TAG], revalidate: false as const } };
// The CTA banner copy lives on `globalSettings`, NOT `homePage`, so it carries
// the settings tag the webhook already busts - not HOME_TAG.
const CTA_FETCH_OPTS = { next: { tags: [SETTINGS_TAG], revalidate: false as const } };

export interface HomeHero {
  eyebrow: string | null;
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

export interface HomeBanner {
  imageUrl: string;
  alt: string;
  link: string | null;
  /** Intrinsic dimensions (parsed from the Sanity asset ref) so the banner row
   *  reserves exact space and contributes zero CLS. Null when unparseable. */
  width: number | null;
  height: number | null;
}

/**
 * Sanity image asset refs encode their intrinsic size, e.g.
 * `image-abc123-1200x800-webp`. Parse it so we can set explicit width/height on
 * the rendered <img> (CLS) without an extra GROQ dereference of metadata.
 */
function parseSanityImageDimensions(
  ref: string | undefined,
): { width: number; height: number } | null {
  if (!ref) return null;
  const m = ref.match(/-(\d+)x(\d+)-/);
  if (!m) return null;
  const width = Number.parseInt(m[1], 10);
  const height = Number.parseInt(m[2], 10);
  if (!width || !height) return null;
  return { width, height };
}

export interface HomeValueProp {
  title: string;
  /** Portable text so pillar copy can contain links (rendered in brand red). */
  body: PortableTextBlock[];
}

export interface HomeTestimonial {
  text: string;
  attribution: string;
  company: string | null;
}

export interface HomePageData {
  hero: HomeHero | null;
  bannerRowHeading: string | null;
  bannerRowSubheading: string | null;
  bannerRow: HomeBanner[];
  featuredBlocks: HomeFeaturedBlock[];
  valueProps: HomeValueProp[];
  newProductsHeading: string;
  rushProductsHeading: string;
  blogPreviewHeading: string;
  testimonialsHeading: string;
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
    const result = await cachedClient.fetch<HomeCtaBannerCopy | null>(
      CTA_QUERY,
      {},
      CTA_FETCH_OPTS,
    );
    return result ?? { title: null, body: null, buttonLabel: null, buttonHref: null };
  } catch {
    return { title: null, body: null, buttonLabel: null, buttonHref: null };
  }
}

interface RawHomeDoc {
  heroText?: {
    eyebrow?: string;
    headline?: string;
    subheadline?: string;
  };
  heroBanner?: {
    image?: SanityImage & { alt?: string };
    headline?: string;
    subheadline?: string;
    ctaLabel?: string;
    ctaHref?: string;
  };
  bannerRowHeading?: string;
  bannerRowSubheading?: string;
  bannerRow?: Array<{
    image?: SanityImage & { alt?: string };
    link?: string;
    alt?: string;
  }>;
  featuredBlocks?: Array<{
    title?: string;
    href?: string;
    image?: SanityImage & { alt?: string };
  }>;
  valueProps?: Array<{ title?: string; body?: string | PortableTextBlock[] }>;
  newProductsHeading?: string;
  rushProductsHeading?: string;
  blogPreviewHeading?: string;
  testimonialsHeading?: string;
  testimonials?: Array<{ text?: string; attribution?: string; company?: string }>;
  textContent?: PortableTextBlock[];
  brandsGridHeading?: string;
  brandsGridSubheading?: string;
}

const HOME_QUERY = `*[_type == "homePage"][0]{
  heroText,
  heroBanner,
  bannerRowHeading,
  bannerRowSubheading,
  bannerRow,
  featuredBlocks,
  valueProps,
  newProductsHeading,
  rushProductsHeading,
  blogPreviewHeading,
  testimonialsHeading,
  testimonials,
  textContent,
  brandsGridHeading,
  brandsGridSubheading
}`;

const DEFAULT_NEW_PRODUCTS_HEADING = 'New and Trending Promotional Products';
const DEFAULT_RUSH_PRODUCTS_HEADING = 'Rush Production Promotional Products';
const DEFAULT_TESTIMONIALS_HEADING = 'What Our Customers are Saying';
const DEFAULT_BLOG_HEADING = 'From the Blog';
const DEFAULT_BRANDS_HEADING = 'Brands We Carry';
const DEFAULT_BRANDS_SUBHEADING =
  'Custom imprint and embroidery on the brands buyers already trust.';

/**
 * Wrap a plain string in a single portable-text paragraph block. Used to keep
 * the value-pillar `body` a stable `PortableTextBlock[]` whether the Sanity doc
 * still holds a legacy string or the new rich-text array (back-compat migration).
 */
function stringToBlocks(text: string): PortableTextBlock[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return [
    {
      _type: 'block',
      _key: 'legacy',
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: 'legacy0', text: trimmed, marks: [] }],
    } as unknown as PortableTextBlock,
  ];
}

/** Normalize a value-pillar body to portable text regardless of stored shape. */
function normalizePillarBody(body: string | PortableTextBlock[] | undefined): PortableTextBlock[] {
  if (!body) return [];
  if (typeof body === 'string') return stringToBlocks(body);
  return body;
}

// Hard-coded fallbacks for the two structural sections that would otherwise
// leave gaping holes if the Sanity homePage doc isn't populated yet. Once
// Patrick saves the singleton in Studio, Sanity wins.
const FALLBACK_VALUE_PROPS: HomeValueProp[] = [
  {
    title: 'Bulk Pricing on 22,000+ Products',
    body: stringToBlocks(
      'Custom apparel, drinkware, bags, tech, writing, and giveaways — wholesale pricing scaled to your order size.',
    ),
  },
  {
    title: 'Rush Production Available',
    body: stringToBlocks(
      'Promotional products with 1–5 day production for trade shows, hires, and on-site events that can’t wait.',
    ),
  },
  {
    title: 'Dedicated Reps, Free Art Proofs',
    body: stringToBlocks(
      'Real account managers — not AI chat. Free art proofs before production so your branded items land right the first time.',
    ),
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
    let builder = urlForRenderImage(image).width(width).fit('crop');
    if (height) builder = builder.height(height);
    return { url: builder.url(), alt: image.alt ?? '' };
  } catch {
    return { url: null, alt: image.alt ?? '' };
  }
}

export async function getHomePage(): Promise<HomePageData> {
  let doc: RawHomeDoc | null = null;
  try {
    doc = await cachedClient.fetch<RawHomeDoc | null>(HOME_QUERY, {}, HOME_FETCH_OPTS);
  } catch {
    doc = null;
  }

  // Hero text is now driven by the dedicated `heroText` group; the legacy
  // `heroBanner` headline/subheadline are kept only as a back-compat fallback.
  const heroText = doc?.heroText;
  const heroBanner = doc?.heroBanner;
  const heroHeadline = heroText?.headline?.trim() || heroBanner?.headline?.trim() || null;
  const heroSub = heroText?.subheadline?.trim() || heroBanner?.subheadline?.trim() || null;
  const heroEyebrow = heroText?.eyebrow?.trim() || null;
  const hasHero = Boolean(heroEyebrow || heroHeadline || heroSub || heroBanner);
  const hero: HomeHero | null = hasHero
    ? (() => {
        const { url, alt } = resolveImage(heroBanner?.image, 1600, 900);
        return {
          eyebrow: heroEyebrow,
          imageUrl: url,
          imageAlt: alt || heroHeadline || 'Perfect Imprints',
          headline: heroHeadline,
          subheadline: heroSub,
          ctaLabel: heroBanner?.ctaLabel ?? null,
          ctaHref: heroBanner?.ctaHref ?? null,
        };
      })()
    : null;

  // Banner row: only banners with an actual image render; an empty/imageless
  // list yields [] so the section disappears (BannerRow returns null).
  const bannerRow: HomeBanner[] = (doc?.bannerRow ?? [])
    .map((b) => {
      const { url } = resolveImage(b.image, 1200);
      const dims = parseSanityImageDimensions(b.image?.asset?._ref);
      return {
        imageUrl: url,
        alt: b.alt ?? '',
        link: b.link?.trim() || null,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      };
    })
    .filter((b): b is HomeBanner => Boolean(b.imageUrl));

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
    .map((v) => ({ title: v.title!, body: normalizePillarBody(v.body) }));
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
    bannerRowHeading: doc?.bannerRowHeading?.trim() || null,
    bannerRowSubheading: doc?.bannerRowSubheading?.trim() || null,
    bannerRow,
    featuredBlocks,
    valueProps,
    newProductsHeading: doc?.newProductsHeading?.trim() || DEFAULT_NEW_PRODUCTS_HEADING,
    rushProductsHeading: doc?.rushProductsHeading?.trim() || DEFAULT_RUSH_PRODUCTS_HEADING,
    blogPreviewHeading: doc?.blogPreviewHeading?.trim() || DEFAULT_BLOG_HEADING,
    testimonialsHeading: doc?.testimonialsHeading?.trim() || DEFAULT_TESTIMONIALS_HEADING,
    testimonials,
    textContent: doc?.textContent ?? [],
    brandsHeading: doc?.brandsGridHeading?.trim() || DEFAULT_BRANDS_HEADING,
    brandsSubheading: doc?.brandsGridSubheading?.trim() || DEFAULT_BRANDS_SUBHEADING,
  };
}
