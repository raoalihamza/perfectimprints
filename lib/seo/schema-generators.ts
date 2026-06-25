// Schema.org JSON-LD generators. Organization + BreadcrumbList live here today;
// BlogPosting/FAQPage/Product are emitted inline at their call sites for now.
// VideoObject (M5-507) below. Remaining consolidation tracked in M5-508.

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Perfect Imprints',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://perfectimprints.com',
    logo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://perfectimprints.com'}/logo.svg`,
    telephone: '+1-800-773-9472',
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
