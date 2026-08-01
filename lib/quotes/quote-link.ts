/**
 * The customer's private quote link (Q-130).
 *
 * PURE + CLIENT-SAFE (no fs, no Sanity, no `server-only`): the Studio's token
 * field builds the link with this so Patrick can copy it, and the future send
 * email / customer route will build it with the SAME function so the address
 * in the inbox and the address in the Studio can never differ.
 *
 * The route /quote/<token> does NOT exist yet - it arrives with the customer
 * page in a later update. The link is still worth showing now: it is the exact
 * address that will work, and Patrick can see that the token is a real
 * unguessable value rather than an editable field.
 *
 * SCHEME IS NORMALIZED, NOT TRUSTED. The origin comes from
 * NEXT_PUBLIC_SITE_URL, and a mis-set value (a bare host with no scheme, or an
 * http:// value) must never produce an http link for a customer. Same lesson as
 * `gatedCatalogUrl` in lib/leads/catalog-lead.ts (P2-CAT-005), kept as its own
 * three lines here rather than importing the lead-email module into the Studio
 * bundle. The HOST is left untouched, so staging stays dev.perfectimprints.com
 * and production stays www.perfectimprints.com.
 */

const FALLBACK_ORIGIN = 'https://www.perfectimprints.com';

/** Force an https origin from whatever the site-URL value holds. */
export function httpsSiteOrigin(siteUrl: string | null | undefined): string {
  const base = (siteUrl ?? '').trim().replace(/\/+$/, '');
  if (!base) return FALLBACK_ORIGIN;
  return `https://${base.replace(/^https?:\/\//i, '')}`;
}

/**
 * The full customer-facing URL for a quote token, e.g.
 * https://www.perfectimprints.com/quote/2f9c...  Returns null when there is no
 * token yet, so callers show nothing rather than a broken link.
 */
export function quoteCustomerUrl(
  siteUrl: string | null | undefined,
  token: string | null | undefined,
): string | null {
  const value = (token ?? '').trim();
  if (!value) return null;
  return `${httpsSiteOrigin(siteUrl)}/quote/${value}`;
}
