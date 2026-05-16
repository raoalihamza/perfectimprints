// TODO: M5-508 - Schema.org JSON-LD generators for Organization, BreadcrumbList,
// BlogPosting, FAQPage, Product, VideoObject.

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

// TODO M5-508 - blogPostingSchema, faqPageSchema, productSchema, videoObjectSchema
