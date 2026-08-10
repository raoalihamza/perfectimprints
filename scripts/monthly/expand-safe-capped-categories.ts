/**
 * Restore the full product grid on the handful of root categories whose
 * slug-token filter misfired (2026-08-10, Patrick's `/cat/pens` report).
 *
 *   pnpm tsx scripts/monthly/expand-safe-capped-categories.ts --dry-run
 *   pnpm tsx scripts/monthly/expand-safe-capped-categories.ts
 *
 * ── THE BUG ──────────────────────────────────────────────────────────────────
 * `/cat/pens` rendered the lead-form CTA instead of a product grid even though
 * its JSON carried 60 SKUs. `shouldShowEmptyStateCTA` (lib/categories.ts) hides
 * the grid whenever `skuFilterMode === 'full-capped-60'`, and pens landed in
 * that mode because the AI pipeline's slug-token filter scores a candidate by
 * asking "does the product NAME contain the category slug?". Real pens are
 * called `Bic® Clic Stic®`, `Javalina®`, `Sharpie®` — none contain "pen" — so
 * almost everything scored zero, fewer than 30 survived, and the pipeline fell
 * back to an arbitrary top-60 that the CTA rule then (correctly, given what it
 * knew) treated as untrustworthy.
 *
 * ── WHY THIS IS AN ALLOWLIST AND NOT A RULE CHANGE ───────────────────────────
 * Relaxing the `full-capped-60` rule globally would be actively harmful. 66 root
 * categories sit in that mode and an audit of their Geiger mappings showed 58 of
 * them are mapped to a BROAD PARENT DEPARTMENT, not to their own product type:
 *
 *   desk-organizers, laser-pointers, letter-openers, memo-boards, notepads,
 *   staple-removers, stock-shaped-notepads  →  ALL "Home > Office & Technology"
 *
 * Seven different pages, one department of 1,738 items. Drop the rule and all
 * seven render the same 60 unrelated office products — which is precisely the
 * off-topic-grid complaint the rule was added to fix. Those 58 have a MAPPING
 * problem, not a filter problem, and are deliberately untouched here.
 *
 * The 7 slugs below are the ones whose Geiger path genuinely IS their product
 * type (or, for the three department-level PI slugs, genuinely is that
 * department), so the full subtree is exactly what the page should show.
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────────
 * For each allowlisted slug: re-derives the complete SKU list from the CURRENT
 * `data/geiger/products.json` (every product whose category_paths includes the
 * mapped Geiger path or a descendant of it), writes it to `productSkus`, and
 * sets `skuFilterMode` to `full` so the CTA rule stops firing. This reproduces
 * the pipeline's own `full` tier — the derivation was validated against every
 * target's recorded `rawSkuCount` and matched exactly (365/87/29/362/1738/1015/617).
 *
 * Idempotent: a slug already on `full` is skipped, so a second run is a no-op.
 * Safe to re-run after a Full Catalog Rebuild — that job's own steps never touch
 * these files (generate_content.py runs with --skip-existing, and
 * prune-removed-skus.ts only ever REMOVES dead SKUs), so re-running this is how
 * a freshly scraped catalog reaches these seven pages.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const PRODUCTS_FILE = path.join(ROOT, 'data', 'geiger', 'products.json');
const MAPPING_FILE = path.join(ROOT, 'data', 'mappings', 'pi-to-geiger.json');
const CATEGORIES_DIR = path.join(ROOT, 'data', 'categories');

/**
 * The only slugs this script may touch. Each entry records WHY it is safe —
 * the Geiger path is the category's own product type, not a parent department.
 * Do not add a slug here without re-running the mapping audit for it.
 */
const SAFE_SLUGS: Array<{ slug: string; why: string }> = [
  { slug: 'pens', why: 'Writing Instruments > Pens — its own product type' },
  { slug: 'calendars', why: 'Office & Technology > Calendars & Planners — its own type' },
  { slug: 'workwear', why: 'Apparel > Workwear — its own type' },
  { slug: 'medical-healthcare-items', why: 'Shop By > Healthcare — its own type' },
  { slug: 'office', why: 'Office & Technology — the PI slug IS this department' },
  { slug: 'bags', why: 'Bags & Totes — the PI slug IS this department' },
  { slug: 'health', why: 'Health & Wellness — the PI slug IS this department' },
];

interface GeigerProductLite {
  sku?: string;
  category_paths?: string[];
}

interface CategoryDoc {
  productSkus?: string[];
  skuFilterMode?: string;
  rawSkuCount?: number;
  filteredSkuCount?: number;
  [key: string]: unknown;
}

interface MappingEntry {
  geigerCategoryPath?: string;
}

function readJson<T>(file: string): T {
  if (!fs.existsSync(file)) {
    console.error(`Required file not found: ${file}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/**
 * Every SKU under a Geiger category path, including its descendants — the
 * pipeline's `full` tier. Catalog order is preserved so the grid ordering stays
 * deterministic across runs.
 */
function skusUnderPath(products: GeigerProductLite[], categoryPath: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const prefix = `${categoryPath} >`;
  for (const p of products) {
    const sku = String(p.sku ?? '').trim();
    if (!sku || seen.has(sku)) continue;
    const paths = p.category_paths ?? [];
    const inSubtree = paths.some(
      (cp) => typeof cp === 'string' && (cp === categoryPath || cp.startsWith(prefix)),
    );
    if (!inSubtree) continue;
    seen.add(sku);
    out.push(sku);
  }
  return out;
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const products = readJson<{ products: GeigerProductLite[] }>(PRODUCTS_FILE).products ?? [];
  const mappings = readJson<{ mappings: Record<string, MappingEntry> }>(MAPPING_FILE).mappings ?? {};

  console.log(`${dryRun ? 'DRY RUN — ' : ''}catalog: ${products.length} products\n`);

  let changed = 0;
  for (const { slug, why } of SAFE_SLUGS) {
    const file = path.join(CATEGORIES_DIR, `${slug}.json`);
    if (!fs.existsSync(file)) {
      console.warn(`  SKIP ${slug} — no category JSON`);
      continue;
    }
    const categoryPath = mappings[slug]?.geigerCategoryPath;
    if (!categoryPath) {
      console.warn(`  SKIP ${slug} — no Geiger mapping`);
      continue;
    }

    const rawText = fs.readFileSync(file, 'utf8');
    const doc = JSON.parse(rawText) as CategoryDoc;
    const before = doc.productSkus?.length ?? 0;

    const skus = skusUnderPath(products, categoryPath);
    if (skus.length === 0) {
      console.warn(`  SKIP ${slug} — resolved 0 SKUs for "${categoryPath}"`);
      continue;
    }

    // Re-derive every run rather than bailing once the mode is already 'full'.
    // That guard would have made the "re-run after a Full Catalog Rebuild" path
    // a silent no-op — exactly when a freshly scraped catalog has new products
    // for these pages to pick up. Same input still produces the same output, so
    // re-running on unchanged data is a reported no-op, not a rewrite.
    const unchanged =
      doc.skuFilterMode === 'full' &&
      before === skus.length &&
      (doc.productSkus ?? []).every((s, i) => s === skus[i]);
    if (unchanged) {
      console.log(`  no change  ${slug} — already ${before} SKUs`);
      continue;
    }

    doc.productSkus = skus;
    doc.skuFilterMode = 'full';
    doc.filteredSkuCount = skus.length;
    doc.rawSkuCount = skus.length;

    console.log(`  ${dryRun ? 'WOULD FIX' : 'FIXED'} ${slug}: ${before} → ${skus.length} SKUs   (${why})`);
    changed += 1;

    if (dryRun) continue;
    // Preserve the file's existing line endings so the diff shows only the
    // fields that actually changed (these files are CRLF on disk).
    const body = JSON.stringify(doc, null, 2);
    fs.writeFileSync(file, rawText.includes('\r\n') ? body.replace(/\n/g, '\r\n') : body, 'utf8');
  }

  console.log(
    `\n${dryRun ? 'Would update' : 'Updated'} ${changed}/${SAFE_SLUGS.length} categories. ` +
      `The other 58 'full-capped-60' roots are deliberately untouched (bad mapping, not a filter bug).`,
  );
}

main();
