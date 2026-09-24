/**
 * FIX-890: which deployment may be indexed by search engines.
 *
 * The staging site (dev.perfectimprints.com) is a byte-for-byte duplicate of
 * production, and on 2026-09-24 Google had 1,386 of its pages with
 * impressions. This module is the ONE place the site decides "am I the
 * production deployment?". It is consumed by:
 *
 *   - app/layout.tsx      (site-wide `robots` metadata: noindex, nofollow on staging)
 *   - app/robots.ts       (staging keeps crawling ALLOWED and advertises no sitemap)
 *   - app/sitemap.ts      (staging serves an empty urlset)
 *   - next.config.ts      (staging adds an `X-Robots-Tag: noindex, nofollow` header)
 *
 * THE SIGNAL is the host of NEXT_PUBLIC_SITE_URL, which every emitted URL
 * already derives from (CLAUDE.md Section 4): production sets it to
 * https://www.perfectimprints.com, staging to https://dev.perfectimprints.com,
 * and the live canonicals prove the two deployments resolve it differently.
 *
 * VERCEL_ENV is deliberately NOT the signal. Staging is its OWN Vercel project
 * (its own repo, pbnj53/staging-perfectimprints, deploying its own main
 * branch), so its deployments are that project's production deployments and
 * VERCEL_ENV reads `production` on BOTH hosts. It would pass every check and
 * fail silently. The feeds site uses it only as a second clause, and that
 * clause would be a no-op here.
 *
 * THE RULE FAILS TOWARDS INDEXING. A page is noindexed ONLY when the resolved
 * host is one of the hosts listed as non-production. Everything else, and
 * that includes a missing variable, an empty one, an unparseable one, and a
 * host this file has never heard of, stays indexable. This is the opposite
 * of "anything that is not production is noindex", and it is chosen on
 * purpose: under that rule a typo in the production project's variable
 * (`www.perfectimprint.com`) would take the real site out of Google, and that
 * fault would be invisible for days. Under this rule the same typo leaves
 * production indexable (with wrong canonicals, which is today's class of
 * survivable bug). A new staging host that is not yet listed stays indexable
 * until it is added, which is exactly the situation this ticket fixes, and it
 * is survivable.
 *
 * Hosts are compared, never whole strings: a scheme, a port, a trailing
 * slash, surrounding whitespace or upper case can never turn production into
 * "not production".
 *
 * Pure and dependency-free on purpose: next.config.ts imports it by relative
 * path through Next's own TypeScript require hook, and the Studio bundle could
 * import it too.
 */

/** The one true production host. Spelled here and nowhere else in source. */
export const PRODUCTION_HOST = 'www.perfectimprints.com';

/**
 * Hosts that serve this codebase and must NEVER be indexed. A host is added
 * here, not compared against PRODUCTION_HOST, because the rule fails towards
 * indexing (see the module comment). Lower case, no scheme, no port.
 */
export const NON_PRODUCTION_HOSTS: readonly string[] = ['dev.perfectimprints.com'];

export type IndexingDecision =
  | { indexable: true; reason: 'production-host' | 'unset' | 'unparseable' | 'unlisted-host'; host: string | null }
  | { indexable: false; reason: 'non-production-host'; host: string };

/**
 * The host name of a site URL as an operator would type it into an env var:
 * trims whitespace, tolerates a missing scheme, an `http://` scheme, a port
 * and a trailing slash, and lower-cases the result. Returns null when the
 * value is missing, blank, or cannot be read as a host at all.
 */
export function siteUrlHost(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const hostname = new URL(withScheme).hostname.toLowerCase();
    return hostname || null;
  } catch {
    return null;
  }
}

/** The full decision, with the reason, for logging and tests. */
export function indexingPolicy(raw: string | undefined | null): IndexingDecision {
  if (typeof raw !== 'string' || !raw.trim()) return { indexable: true, reason: 'unset', host: null };
  const host = siteUrlHost(raw);
  if (!host) return { indexable: true, reason: 'unparseable', host: null };
  if (NON_PRODUCTION_HOSTS.includes(host)) return { indexable: false, reason: 'non-production-host', host };
  if (host === PRODUCTION_HOST) return { indexable: true, reason: 'production-host', host };
  return { indexable: true, reason: 'unlisted-host', host };
}

/** True unless the site URL's host is a listed non-production host. */
export function isIndexableSiteUrl(raw: string | undefined | null): boolean {
  return indexingPolicy(raw).indexable;
}

/**
 * The root layout's `robots` metadata. On an indexable deployment this is
 * BYTE-IDENTICAL to what the layout emitted before FIX-890 (the M-SEO5
 * large-image-preview hint and nothing else, so no robots restriction is
 * emitted). On a non-production host it is `noindex, nofollow`, which Next
 * renders as `<meta name="robots" content="noindex, nofollow">`. Every page
 * that defines its own `robots` today is already a noindex page, so the
 * staging value reaches every route; the HTTP header from
 * `nonProductionRobotsHeader` covers the rest regardless.
 */
export function siteRobotsMetadata(
  raw: string | undefined | null,
): { googleBot: { 'max-image-preview': 'large' } } | { index: false; follow: false } {
  if (isIndexableSiteUrl(raw)) {
    return { googleBot: { 'max-image-preview': 'large' } };
  }
  return { index: false, follow: false };
}

/**
 * The HTTP-level instruction for next.config.ts `headers()`. Null on an
 * indexable deployment, so production's header set is unchanged; on staging
 * one `X-Robots-Tag: noindex, nofollow` header for every path, so a crawler
 * that never parses the HTML (or a route that never renders any) still gets
 * the instruction.
 */
export function nonProductionRobotsHeader(
  raw: string | undefined | null,
): { key: 'X-Robots-Tag'; value: 'noindex, nofollow' } | null {
  if (isIndexableSiteUrl(raw)) return null;
  return { key: 'X-Robots-Tag', value: 'noindex, nofollow' };
}
