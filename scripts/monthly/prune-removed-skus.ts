/**
 * Monthly rebuild (M6-606) — drop removed Geiger products from category JSONs.
 *
 *   pnpm tsx scripts/monthly/prune-removed-skus.ts
 *
 * After a fresh Phase B scrape overwrites `data/geiger/products.json`, some SKUs
 * Geiger no longer returns disappear from the catalog. The render path already
 * skips missing SKUs (`resolveProducts` in lib/categories.ts silently drops a
 * SKU with no catalog entry), so pages are visually correct either way — but the
 * baked `productSkus[]` arrays in `data/categories/*.json` would still list dead
 * SKUs. This prunes those arrays so the committed data stays accurate and the
 * monthly PR carries an explicit, reviewable "removed N products" diff.
 *
 * Only REMOVES SKUs that are no longer in the catalog. It never adds new SKUs
 * (adding new products to a baked root page is a full-regeneration concern, out
 * of scope for the monthly refresh). Idempotent: a second run is a no-op.
 *
 * Writes a small report to scripts/monthly/.artifacts/prune-report.json.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const PRODUCTS_FILE = path.join(ROOT, 'data', 'geiger', 'products.json');
const CATEGORIES_DIR = path.join(ROOT, 'data', 'categories');
const ARTIFACTS_DIR = path.join(__dirname, '.artifacts');

interface CategoryDoc {
  productSkus?: string[];
  filteredSkuCount?: number;
  [key: string]: unknown;
}

function loadCatalogSkus(): Set<string> {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    console.error(`Products file not found: ${PRODUCTS_FILE}`);
    process.exit(1);
  }
  const parsed = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')) as {
    products: { sku?: string }[];
  };
  const set = new Set<string>();
  for (const p of parsed.products ?? []) {
    const sku = String(p.sku ?? '').trim();
    if (sku) set.add(sku);
  }
  return set;
}

function main(): void {
  const catalog = loadCatalogSkus();
  console.log(`Catalog SKUs in products.json: ${catalog.size}`);

  if (!fs.existsSync(CATEGORIES_DIR)) {
    console.error(`Categories dir not found: ${CATEGORIES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(CATEGORIES_DIR).filter((f) => f.endsWith('.json'));
  let filesChanged = 0;
  let skusRemoved = 0;
  const removedSkuSet = new Set<string>();

  for (const file of files) {
    const full = path.join(CATEGORIES_DIR, file);
    let doc: CategoryDoc;
    try {
      doc = JSON.parse(fs.readFileSync(full, 'utf8')) as CategoryDoc;
    } catch (err) {
      console.warn(`  skip (unparseable): ${file} — ${(err as Error).message}`);
      continue;
    }
    const skus = doc.productSkus;
    if (!Array.isArray(skus) || skus.length === 0) continue;

    const kept = skus.filter((sku) => catalog.has(sku));
    if (kept.length === skus.length) continue; // nothing removed

    for (const sku of skus) {
      if (!catalog.has(sku)) {
        removedSkuSet.add(sku);
        skusRemoved += 1;
      }
    }
    doc.productSkus = kept;
    if (typeof doc.filteredSkuCount === 'number') {
      doc.filteredSkuCount = kept.length;
    }
    // Match the orjson OPT_INDENT_2 format the Python writer uses (2-space, no
    // trailing newline) so pruned files show a minimal, content-only diff.
    fs.writeFileSync(full, JSON.stringify(doc, null, 2), 'utf8');
    filesChanged += 1;
  }

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    catalogSkus: catalog.size,
    categoryFilesScanned: files.length,
    categoryFilesChanged: filesChanged,
    skuReferencesRemoved: skusRemoved,
    distinctSkusRemoved: removedSkuSet.size,
  };
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'prune-report.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log(
    `Pruned ${skusRemoved} dead SKU references (${removedSkuSet.size} distinct) ` +
      `across ${filesChanged}/${files.length} category files.`
  );
}

main();
