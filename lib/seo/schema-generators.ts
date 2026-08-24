// Schema.org JSON-LD generators. Organization + WebSite (global, root layout) +
// BreadcrumbList live here; BlogPosting/FAQPage/Product are emitted inline at
// their call sites for now. VideoObject (M5-507) below.

// Type-only import (erased at build) so this module stays free of any runtime
// Sanity dependency — it's also imported by client components (e.g.
// CustomCategoryView), which must not bundle @sanity/client.
import type { SiteSettings } from '@/lib/sanity/queries/global-settings';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

const DEFAULT_PHONE = '800-773-9472';
const DEFAULT_EMAIL = 'cs@perfectimprints.com';

/** Format a US-style number for schema.org telephone (e.g. +1-800-773-9472). */
function formatTelephone(phone: string): string {
  if (phone.startsWith('+')) return phone;
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `+1-${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `+1-${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return phone;
}

/**
 * Sitewide Organization JSON-LD (root layout). All contact + social values come
 * from the `globalSettings` singleton via `getSiteSettings()` (passed in from the
 * async <OrganizationJsonLd /> server component). `sameAs` lists the URLs of the
 * ENABLED social links only — disabled socials never appear. `telephone`,
 * `email`, and the PostalAddress come from `globalSettings.contact`. When a value
 * is missing we fall back to PI's known phone/email rather than emitting nothing.
 */
export function organizationSchema(settings?: SiteSettings) {
  const primaryPhone = settings?.contact.phones[0] || DEFAULT_PHONE;
  const telephone = formatTelephone(primaryPhone);
  const email = settings?.contact.email || DEFAULT_EMAIL;
  const sameAs = (settings?.socialLinks ?? []).map((s) => s.url).filter(Boolean);
  const address = settings?.contact.address;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Perfect Imprints',
    url: SITE_URL,
    logo: `${SITE_URL}/logo.svg`,
    telephone,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone,
      email,
      contactType: 'customer service',
      areaServed: 'US',
      availableLanguage: 'English',
    },
  };

  if (sameAs.length > 0) schema.sameAs = sameAs;

  if (address && (address.street || address.city)) {
    schema.address = {
      '@type': 'PostalAddress',
      ...(address.street ? { streetAddress: address.street } : {}),
      ...(address.city ? { addressLocality: address.city } : {}),
      ...(address.region ? { addressRegion: address.region } : {}),
      ...(address.postalCode ? { postalCode: address.postalCode } : {}),
      ...(address.country ? { addressCountry: address.country } : {}),
    };
  }

  return schema;
}

/**
 * Sitewide WebSite JSON-LD with a SearchAction (root layout). The SearchAction
 * tells Google the site has an internal search box at /search?q=… so a sitelinks
 * search box can surface in results.
 */
export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Perfect Imprints',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * CollectionPage JSON-LD for a category page (M-SEO3 Part 2). The page represents
 * a curated product collection. Emitted on every category page (including
 * CTA-only ones); the product list itself rides on a separate ItemList.
 */
export function collectionPageSchema(input: {
  name: string;
  url: string;
  description?: string;
  /**
   * Primary/representative image for the collection (M-SEO5) — e.g. the first
   * product image upsized via largeSocialImage(), matching og:image. Omitted
   * for CTA-only categories (no grid → no image claim).
   */
  image?: string;
}) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    url: input.url,
  };
  if (input.description) schema.description = input.description;
  if (input.image) schema.image = input.image;
  return schema;
}

// The thin 3-field `itemListSchema()` (M-SEO3 Part 2: ListItem name + url +
// image) that used to live here was retired in SNIP-150. Every product surface
// moved to the full-product `productItemListSchema()` in
// lib/seo/product-list-schema.ts (SNIP-100..140), and the blog listings it was
// kept for use the summary-page `buildBlogListingSchemas()` in
// lib/seo/content-schema.ts instead (position + url per item), so it reached
// zero callers with no caller in waiting. Do not reintroduce a per-surface list
// serializer; use one of those two.

export function breadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export interface VideoObjectInput {
  name: string;
  description?: string;
  /** One or more thumbnail URLs. Required by Google for video rich results. */
  thumbnailUrl?: string | string[];
  /** ISO date — maps to the video's publishDate. */
  uploadDate?: string;
  /** Player embed URL (iframe src). */
  embedUrl?: string;
  /**
   * The pasted source URL. Emitted as `contentUrl` ONLY when it points at an
   * actual media file - see `isDirectMediaUrl` below.
   */
  contentUrl?: string;
  /** Canonical URL of the page the video lives on (FIX-830 task 2). */
  url?: string;
}

/**
 * Is this a link to a video FILE, as opposed to a page a player is embedded in?
 *
 * Google's video structured-data reference is explicit about `contentUrl`: "A
 * URL pointing to the actual video media file... Don't link to the page that
 * the video is embedded in; provide the video file URL directly." Every video
 * on this site is a pasted YouTube link, so the URL we hold is a watch/Shorts
 * page, not a file - and until FIX-830 it was being emitted as `contentUrl` on
 * all 71 video pages. Google fetches `contentUrl` to verify the video; handing
 * it an HTML page is the one documented spec violation these pages carried.
 *
 * The test is deliberately narrow: a recognised media extension, optionally
 * followed by a query string. Anything else (including every YouTube, Vimeo,
 * Instagram and Facebook URL) is treated as a page and the field is omitted.
 * `embedUrl` alone is a complete and correct answer for third-party-hosted
 * video, so nothing is lost.
 */
export function isDirectMediaUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\/[^\s]+\.(mp4|m4v|mov|webm|ogv|ogg|mpd|m3u8)(\?[^\s]*)?$/i.test(url.trim());
}

/**
 * VideoObject JSON-LD for the video detail page (M5-507). Undefined fields are
 * dropped by JSON.stringify, so callers can pass only what they have.
 *
 * Google requires name, description, thumbnailUrl and uploadDate; all four come
 * from the `video` document and none is ever fabricated here - a video missing
 * one simply emits without it rather than being given a made-up value.
 * `duration` is recommended by Google and is deliberately NOT emitted: nothing
 * in Sanity records it, and inventing one would be worse than omitting it.
 */
export function videoObjectSchema(input: VideoObjectInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: input.name,
    description: input.description,
    thumbnailUrl: input.thumbnailUrl,
    uploadDate: input.uploadDate,
    embedUrl: input.embedUrl,
    contentUrl: isDirectMediaUrl(input.contentUrl) ? input.contentUrl : undefined,
    url: input.url,
  };
}

/**
 * Service JSON-LD for a local/topic landing page (P2-AI-005) — ties the page's
 * product/service to the city it targets, honestly and generically (no
 * fabricated ratings/reviews/geo coordinates; Perfect Imprints is the provider,
 * the city is the area served). Emitted only when both product and city exist.
 */
export function landingServiceSchema(input: {
  /** The product/service the page centers on, e.g. "Custom Beach Towels". */
  product: string;
  city: string;
  state?: string;
  /** Absolute canonical URL of the landing page. */
  url: string;
  description?: string;
}) {
  const place = [input.city, input.state].filter(Boolean).join(', ');
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${input.product} in ${place}`,
    serviceType: input.product,
    areaServed: {
      '@type': 'City',
      name: input.city,
      ...(input.state ? { containedInPlace: { '@type': 'State', name: input.state } } : {}),
    },
    provider: {
      '@type': 'Organization',
      name: 'Perfect Imprints',
      url: SITE_URL,
    },
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
  };
}

/**
 * FAQPage JSON-LD for the /faq library (M5-506). Pass only answered FAQs —
 * Google flags FAQPage entries with empty answers.
 */
export function faqPageSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

