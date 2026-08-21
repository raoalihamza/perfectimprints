import 'server-only';

import fs from 'node:fs';
import path from 'node:path';

import { decodeProductEntities } from './decode-product';
import type { GeigerProduct } from '../product-types';

const PRODUCTS_FILE = path.join(process.cwd(), 'data', 'geiger', 'products.json');

interface ProductsFile {
  scrapedAt: string;
  totalProducts: number;
  products: GeigerProduct[];
}

let _bySku: Map<string, GeigerProduct> | null = null;

function loadIndex(): Map<string, GeigerProduct> {
  if (_bySku) return _bySku;
  const map = new Map<string, GeigerProduct>();
  if (!fs.existsSync(PRODUCTS_FILE)) {
    _bySku = map;
    return map;
  }
  const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as ProductsFile;
  for (const p of parsed.products) {
    // Decoded once here at the loader (name, description, imageUrl, brand) so
    // every consumer of a resolved SKU gets clean text and a working image URL.
    map.set(String(p.sku), decodeProductEntities(p));
  }
  _bySku = map;
  return map;
}

/**
 * Resolves a list of Geiger SKUs against the full products.json catalog.
 * Used by /deals + /new-products to honor the Sanity-controlled
 * `pinnedDealSkus[]` / `pinnedNewProductSkus[]` lists — Patrick can promote
 * any Geiger SKU into either aggregator even if that page's weekly scrape did
 * not include it. Unknown SKUs are silently skipped.
 *
 * Order of the returned array matches the order of the input array, so Patrick
 * controls display order.
 */
export function getGeigerProductsBySkus(skus: string[]): GeigerProduct[] {
  if (!skus || skus.length === 0) return [];
  const idx = loadIndex();
  const out: GeigerProduct[] = [];
  for (const raw of skus) {
    const sku = String(raw).trim();
    if (!sku) continue;
    const p = idx.get(sku);
    if (p) out.push(p);
  }
  return out;
}
