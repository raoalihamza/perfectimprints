import type { MetadataRoute } from 'next';
import { isIndexableSiteUrl } from '@/lib/seo/indexing-policy';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

const STUDIO_AND_API = ['/admin3773752', '/api'];

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
 *
 * STAGING (FIX-890): dev.perfectimprints.com was fully indexed (1,386 pages
 * with impressions on 2026-09-24). The same reasoning applies to the whole
 * host, so staging's robots.txt DELIBERATELY DOES NOT CARRY `Disallow: /`.
 * A Disallow stops Google crawling, and a page it cannot crawl is a page
 * whose `noindex` it never reads: the already-indexed pages would FREEZE in
 * the index as bare URLs without a description, for months, instead of
 * leaving it. The removal signal is the `noindex, nofollow` every staging
 * page now emits (app/layout.tsx metadata + the X-Robots-Tag header in
 * next.config.ts), and for that to work Google must keep fetching the pages.
 * So staging keeps the SAME allow rule as production and only stops
 * advertising the sitemap (empty on staging, app/sitemap.ts) and the host.
 * Do not add a blanket Disallow here until the staging host shows zero
 * indexed pages in Search Console; the runbook is in
 * docs/seo/FIX-890-staging-deindex.md. The decision itself lives in
 * lib/seo/indexing-policy.ts and fails towards indexing.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexableSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)) {
    // Crawling stays allowed on purpose (see above). No `sitemap`, no `host`.
    return {
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: STUDIO_AND_API,
      },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: STUDIO_AND_API,
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
