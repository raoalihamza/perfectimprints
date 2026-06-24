/**
 * Build-time product list for the Studio ProductSkuPicker (M5-504).
 *
 *   pnpm build:product-list   (also runs in `prebuild`)
 *
 * Emits a lightweight sku+name+brand list the searchable product picker fetches
 * and filters client-side, so Patrick can search the ~7,957 Geiger catalog by
 * name/SKU/brand and pick a SKU (instead of typing the number from memory).
 *
 * Written to BOTH `public/` (served by the embedded Studio at /admin) and
 * `sanity/static/` (served by the standalone `sanity dev` Studio). Studio-only;
 * never loaded by the live site.
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodeHtmlEntities } from '../lib/text-utils';

const ROOT = path.resolve(__dirname, '..');
const PRODUCTS_FILE = path.join(ROOT, 'data', 'geiger', 'products.json');
const OUT_PUBLIC = path.join(ROOT, 'public', 'product-list.json');
const OUT_STATIC = path.join(ROOT, 'sanity', 'static', 'product-list.json');

interface RawProduct {
  sku?: string;
  name?: string;
  brand?: string | null;
}

function main(): void {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    console.error(`Products file not found: ${PRODUCTS_FILE}`);
    process.exit(1);
  }
  const parsed = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')) as { products: RawProduct[] };

  const seen = new Set<string>();
  const products: { sku: string; name: string; brand: string | null }[] = [];
  for (const p of parsed.products ?? []) {
    const sku = String(p.sku ?? '').trim();
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    products.push({
      sku,
      name: decodeHtmlEntities(p.name ?? '').trim() || sku,
      brand: p.brand ? decodeHtmlEntities(p.brand).trim() : null,
    });
  }
  products.sort((a, b) => a.name.localeCompare(b.name));

  const payload = JSON.stringify({ generatedAt: new Date().toISOString(), products });
  for (const out of [OUT_PUBLIC, OUT_STATIC]) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, payload, 'utf8');
  }
  const kb = (Buffer.byteLength(payload, 'utf8') / 1024).toFixed(0);
  console.log(`Wrote product-list.json (public + sanity/static) — ${products.length} products (${kb} KB)`);
}

main();
