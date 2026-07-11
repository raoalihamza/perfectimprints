import 'server-only';

import type { GeigerProduct } from '@/lib/product-types';
import { customProductToGeigerProduct } from './custom-products';
import { productPageToGeigerProduct } from './product-pages';
import type { StripProductRefEntry } from '@/lib/sanity/strip-product-entries';

/**
 * Normalize a dereferenced strip reference (productPage / customProduct) into
 * the GeigerProduct contract so the strip renderers (blog body, page
 * productStrip, landing, video) hand it to the shared ProductCard:
 *   - productPage → internal card (`detailUrl` = /products/<slug>, same tab);
 *   - customProduct → affiliate/external card (its externalUrl, new tab).
 *
 * Returns null for anything that can't render a working card — a productPage
 * missing its slug (the detail link would 404) or a customProduct missing its
 * externalUrl (ProductCard would link to the bare affiliate homepage). Callers
 * DROP null results rather than rendering a broken card.
 *
 * Server-only: the converters live in server-only query modules — fine, since
 * every strip renderer is a server component.
 */
export function stripRefToGeigerProduct(entry: StripProductRefEntry): GeigerProduct | null {
  if (entry._type === 'productPage') {
    if (!entry._id || !entry.title || !entry.slug) return null;
    return productPageToGeigerProduct(entry);
  }
  if (!entry._id || !entry.title || !entry.externalUrl) return null;
  return customProductToGeigerProduct({
    ...entry,
    title: entry.title,
    externalUrl: entry.externalUrl,
  });
}
