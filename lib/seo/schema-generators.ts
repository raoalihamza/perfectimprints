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
}) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    url: input.url,
  };
  if (input.description) schema.description = input.description;
  return schema;
}

export interface ItemListProduct {
  name: string;
  /** Product/affiliate URL (already affiliate-rewritten by the caller). */
  url: string;
  image?: string | null;
}

/**
 * ItemList JSON-LD listing the products shown on a category page (M-SEO3 Part 2).
 * Callers must omit this entirely for CTA-only categories (no products) rather
 * than emitting an empty list.
 */
export function itemListSchema(products: ItemListProduct[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.name,
      url: p.url,
      ...(p.image ? { image: p.image } : {}),
    })),
  };
}

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
  /** One or more thumbnail URLs. Recommended by Google for rich results. */
  thumbnailUrl?: string | string[];
  /** ISO date — maps to the video's publishDate. */
  uploadDate?: string;
  /** Player embed URL (iframe src). */
  embedUrl?: string;
  /** Canonical source/watch URL. */
  contentUrl?: string;
}

/**
 * VideoObject JSON-LD for the video detail page (M5-507). Undefined fields are
 * dropped by JSON.stringify, so callers can pass only what they have.
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
    contentUrl: input.contentUrl,
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

