import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

/**
 * robots.txt (M5-508). Allow all crawlers everywhere except the obfuscated
 * Sanity Studio (`/admin3773752`) and the internal API surface (`/api`), neither
 * of which should be indexed. References the sitemap so Google/Bing discover the
 * full URL set.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin3773752', '/api'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
