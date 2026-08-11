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
 * a freshly scraped catalog reaches these seven pages. It now runs as a step of
 * that job (monthly-rebuild.yml, straight after the prune) so it can no longer
 * be forgotten.
 *
 * ── SIBLING PATHS (`alsoInclude`) ────────────────────────────────────────────
 * A slug may pull in ONE extra Geiger path that is a sibling rather than a
 * descendant of its mapping. Only `pens` uses this today, for Geiger's
 * "Name Brand Writing" shelf (Patrick asked for it by name). That shelf is a
 * BRAND shelf, not a product type: alongside real pens it carries Sharpie
 * markers, a Post-it highlighter and a uni-ball pencil, none of which belong on
 * a page titled Pens. `isNotAPen` filters those out - see its comment.
 *
 * The filter applies ONLY to products arriving via the sibling path. Anything
 * under the slug's own mapped path is taken unconditionally, so this can never
 * remove a product the page already showed.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const PRODUCTS_FILE = path.join(ROOT, 'data', 'geiger', 'products.json');
const MAPPING_FILE = path.join(ROOT, 'data', 'mappings', 'pi-to-geiger.json');
const CATEGORIES_DIR = path.join(ROOT, 'data', 'categories');

interface SiblingPath {
  /** A Geiger path that is NOT under the slug's own mapping. */
  path: string;
  why: string;
  /** Return true to keep a product OUT of the category. */
  exclude: (product: GeigerProductLite) => boolean;
}

/** Geiger paths that mean "this is not a pen", however the item is named. */
const NOT_A_PEN_PATHS = [
  'Home > Writing Instruments > Highlighters & Markers',
  'Home > Writing Instruments > Pencils',
];

/** Product-type words that mean the same thing when Geiger cross-lists nothing. */
const NOT_A_PEN_WORDS = /\b(highlighter|marker|pencil)s?\b/i;

/**
 * Two rules, because the offenders split cleanly into two kinds and neither rule
 * catches the other's cases:
 *
 *   1. Cross-listed elsewhere in Writing Instruments. Catches the four Sharpies
 *      (`Fine Point`, `Mini`, `Metallic`, `Twin Tip` - none of which say "marker"
 *      in the name) and the `uni-ball Chroma Pencil`. Geiger's own filing is the
 *      strongest signal available, so it is checked first.
 *   2. The name or product type says highlighter / marker / pencil. Catches the
 *      `Post-It Flag+ Highlighter`, which Geiger cross-lists nowhere.
 *
 * Deliberately does NOT read the description: a pen's copy can mention a marker
 * in passing, and that would drop a real pen.
 */
function isNotAPen(product: GeigerProductLite): boolean {
  const paths = product.category_paths ?? [];
  const crossListed = paths.some((cp) =>
    NOT_A_PEN_PATHS.some((bad) => cp === bad || cp.startsWith(`${bad} >`)),
  );
  if (crossListed) return true;
  return NOT_A_PEN_WORDS.test(`${product.name ?? ''} ${product.product_type_unigram ?? ''}`);
}

/**
 * The only slugs this script may touch. Each entry records WHY it is safe —
 * the Geiger path is the category's own product type, not a parent department.
 * Do not add a slug here without re-running the mapping audit for it.
 */
const SAFE_SLUGS: Array<{ slug: string; why: string; alsoInclude?: SiblingPath }> = [
  {
    slug: 'pens',
    why: 'Writing Instruments > Pens - its own product type',
    alsoInclude: {
      path: 'Home > Writing Instruments > Name Brand Writing',
      why: "Geiger's name-brand pen shelf sits beside Pens, not under it",
      exclude: isNotAPen,
    },
  },
  { slug: 'calendars', why: 'Office & Technology > Calendars & Planners — its own type' },
  { slug: 'workwear', why: 'Apparel > Workwear — its own type' },
  { slug: 'medical-healthcare-items', why: 'Shop By > Healthcare — its own type' },
  { slug: 'office', why: 'Office & Technology — the PI slug IS this department' },
  { slug: 'bags', why: 'Bags & Totes — the PI slug IS this department' },
  { slug: 'health', why: 'Health & Wellness — the PI slug IS this department' },
];

interface GeigerProductLite {
  sku?: string;
  name?: string;
  product_type_unigram?: string;
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

function inSubtree(product: GeigerProductLite, categoryPath: string): boolean {
  const prefix = `${categoryPath} >`;
  return (product.category_paths ?? []).some(
    (cp) => typeof cp === 'string' && (cp === categoryPath || cp.startsWith(prefix)),
  );
}

/**
 * Every SKU under a Geiger category path, including its descendants — the
 * pipeline's `full` tier - plus, optionally, the filtered contents of one
 * sibling path. Catalog order is preserved so the grid ordering stays
 * deterministic across runs.
 *
 * The mapped path is taken UNCONDITIONALLY and is tested first, so a sibling's
 * exclude rule can never drop a product the page already carried.
 */
function skusForCategory(
  products: GeigerProductLite[],
  categoryPath: string,
  sibling?: SiblingPath,
): { skus: string[]; siblingAdded: number; siblingRejected: string[] } {
  const skus: string[] = [];
  const seen = new Set<string>();
  const siblingRejected: string[] = [];
  let siblingAdded = 0;

  for (const p of products) {
    const sku = String(p.sku ?? '').trim();
    if (!sku || seen.has(sku)) continue;

    let viaSibling = false;
    if (!inSubtree(p, categoryPath)) {
      if (!sibling || !inSubtree(p, sibling.path)) continue;
      if (sibling.exclude(p)) {
        siblingRejected.push(`${sku} ${p.name ?? ''}`.trim());
        continue;
      }
      viaSibling = true;
    }

    seen.add(sku);
    skus.push(sku);
    if (viaSibling) siblingAdded += 1;
  }

  return { skus, siblingAdded, siblingRejected };
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const products = readJson<{ products: GeigerProductLite[] }>(PRODUCTS_FILE).products ?? [];
  const mappings = readJson<{ mappings: Record<string, MappingEntry> }>(MAPPING_FILE).mappings ?? {};

  console.log(`${dryRun ? 'DRY RUN — ' : ''}catalog: ${products.length} products\n`);

  const verbose = process.argv.includes('--verbose');
  let changed = 0;
  for (const { slug, why, alsoInclude } of SAFE_SLUGS) {
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

    const { skus, siblingAdded, siblingRejected } = skusForCategory(
      products,
      categoryPath,
      alsoInclude,
    );
    if (skus.length === 0) {
      console.warn(`  SKIP ${slug} — resolved 0 SKUs for "${categoryPath}"`);
      continue;
    }
    if (alsoInclude) {
      console.log(
        `  + ${slug}: ${siblingAdded} from "${alsoInclude.path}" ` +
          `(${siblingRejected.length} filtered out - ${alsoInclude.why})`,
      );
      if (verbose) siblingRejected.forEach((r) => console.log(`      filtered: ${r}`));
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
