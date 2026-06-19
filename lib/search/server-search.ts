import 'server-only';

import Fuse, { type IFuseOptions } from 'fuse.js';
import { getAllProducts } from '@/lib/categories';
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

/** Ranked product matches for a query (full product objects). */
export function searchProducts(query: string, limit = 300): GeigerProduct[] {
  const q = query.trim();
  if (!q) return [];
  return getFuse()
    .search(q, { limit })
    .map((r) => r.item);
}
