// Schema.org JSON-LD generators. Organization + WebSite (global, root layout) +
// BreadcrumbList live here; BlogPosting/FAQPage/Product are emitted inline at
// their call sites for now. VideoObject (M5-507) below.

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

/**
 * Sitewide Organization JSON-LD (root layout). `sameAs` (socials) and a postal
 * `address` are intentionally omitted — Patrick's real social URLs / mailing
 * address aren't confirmed yet (the footer links are placeholders), and emitting
 * fabricated values would be worse than omitting them. Add `sameAs`/`address`
 * here once confirmed.
 */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Perfect Imprints',
    url: SITE_URL,
    logo: `${SITE_URL}/logo.svg`,
    telephone: '+1-800-773-9472',
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+1-800-773-9472',
      email: 'cs@perfectimprints.com',
      contactType: 'customer service',
      areaServed: 'US',
      availableLanguage: 'English',
    },
  };
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

// TODO M5-508 - blogPostingSchema, productSchema
