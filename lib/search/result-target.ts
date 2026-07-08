import { affiliateUrl } from '@/lib/affiliate-url';
import type { SearchItem } from './types';

export interface ResultTarget {
  href: string;
  /** Products link to the Geiger affiliate host and open in a new tab. */
  external: boolean;
}

/**
 * Resolve where a search result navigates. Products route STRAIGHT to the
 * Geiger affiliate URL (rewritten via `lib/affiliate-url.ts`, new tab) — never
 * to a category page. Everything else is an internal route.
 *
 * Exception (P2-CP-001): `product` entries flagged `internal` are Sanity
 * productPage docs whose url is the site's own `/products/<slug>` detail page
 * — those navigate internally (same tab), NOT through the affiliate host
 * (`affiliateUrl` would wrongly prefix the relative path with the Geiger host).
 */
export function resultTarget(item: SearchItem): ResultTarget {
  if (item.type === 'product' && !item.internal) {
    return { href: affiliateUrl(item.url), external: true };
  }
  return { href: item.url, external: false };
}
