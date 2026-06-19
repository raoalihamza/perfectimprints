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
 */
export function resultTarget(item: SearchItem): ResultTarget {
  if (item.type === 'product') {
    return { href: affiliateUrl(item.url), external: true };
  }
  return { href: item.url, external: false };
}
