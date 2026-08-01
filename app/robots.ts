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
 *
 * `/quote` is deliberately NOT disallowed here (Q-140), even though private
 * customer quotes live under it. Disallowing a path stops Google FETCHING it,
 * which means Google never reads the `noindex` on the page - and a disallowed
 * URL that leaks (a customer pastes the link somewhere public) can still be
 * listed as a bare URL in results. Letting the page be fetched so its noindex
 * is actually read is the stronger guarantee, and it is the same choice the
 * gated catalog pages already make. A `Disallow: /quote` line would also do
 * nothing for security: the protection is a 128-bit unguessable token, not a
 * secret path prefix. Belt and braces at the HTTP level instead: an
 * `X-Robots-Tag: noindex` header on `/quote/:token*` in next.config.ts.
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
