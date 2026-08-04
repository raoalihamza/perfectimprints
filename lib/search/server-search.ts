import 'server-only';

import Fuse, { type IFuseOptions } from 'fuse.js';
import { getAllProducts } from '@/lib/categories';
import { isSearchHiddenSku } from '@/lib/search/hidden-skus';
import type { GeigerProduct } from '@/lib/product-types';

/**
 * Server-side product search for the /search results page (M5-502b).
 *
 * The lightweight client index (`/search-index.json`) only carries product
 * name + brand, which is enough for the autocomplete overlay but NOT enough to
 * render product cards or build facets. The results page instead searches the
 * full catalog (`products.json`, via `getAllProducts()`) server-side and returns
 * complete `GeigerProduct` objects — never shipping the 9 MB catalog to the
 * client. Pure baked data; no Searchspring/runtime API (CLAUDE.md §18).
 *
 * The Fuse instance is built once per server process and reused across requests.
 */

const FUSE_OPTIONS: IFuseOptions<GeigerProduct> = {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'brand', weight: 0.2 },
    { name: 'product_type_unigram', weight: 0.1 },
    // Item number / SKU (P2 batch 2) — same rationale + weight as the overlay
    // index (lib/search/load-index.ts): strong for numeric queries, inert for
    // word queries.
    { name: 'sku', weight: 0.5 },
  ],
  threshold: 0.32,
  ignoreLocation: true,
};

let _fuse: Fuse<GeigerProduct> | null = null;

function getFuse(): Fuse<GeigerProduct> {
  if (!_fuse) {
    _fuse = new Fuse(getAllProducts(), FUSE_OPTIONS);
  }
  return _fuse;
}

/**
 * Ranked product matches for a query (full product objects).
 *
 * `hiddenSkus` (Q-170 improvement 2) is Patrick's search hide list, read from
 * Sanity by the caller. It is applied AFTER ranking rather than by rebuilding
 * the Fuse index: the index is a per-process singleton over ~7,957 products and
 * the list is normally empty, so rebuilding it per request to remove a handful
 * of items would cost far more than it saves. Facets are derived from the value
 * this returns, so a hidden product also leaves no trace in the facet counts.
 */
export function searchProducts(
  query: string,
  limit = 300,
  hiddenSkus?: ReadonlySet<string>,
): GeigerProduct[] {
  const q = query.trim();
  if (!q) return [];
  const ranked = getFuse()
    .search(q, { limit })
    .map((r) => r.item);
  if (!hiddenSkus || hiddenSkus.size === 0) return ranked;
  return ranked.filter((p) => !isSearchHiddenSku(p.sku, hiddenSkus));
}
