/**
 * Monthly rebuild (M6-606) — compute the change summary for the PR + email.
 *
 *   pnpm tsx scripts/monthly/compute-summary.ts
 *
 * Diffs the freshly-scraped data files (working tree) against the versions
 * committed at HEAD, and writes:
 *   - scripts/monthly/.artifacts/summary.json   (machine-readable)
 *   - scripts/monthly/.artifacts/pr-body.md     (PR description + email body)
 *
 * Reports: products added / removed / price-changed, new brands + brand-logo
 * changes, and newly-generated category pages. Run AFTER the AI content step
 * and prune step so the git working tree reflects every change.
 *
 * Emits `changed=<true|false>` to $GITHUB_OUTPUT when run in CI so later steps
 * can gate the PR + email. "changed" means any tracked data file or category
 * JSON differs from HEAD.
 *
 * SCRAPE-910: also reads the geiger.com fallback status files that Phase A
 * (data/geiger/taxonomy-fetch-status.json) and Phase E
 * (data/geiger/brand-index-fetch-status.json) write on every run, plus the
 * data-loss guard's report (scripts/monthly/.artifacts/guard-report.json).
 * When a fetch fell back to committed data, that is the FIRST thing the PR
 * body says, and a `fallback=true` output is emitted so the email step fires
 * even on a no-change run. A silent fallback that quietly ships stale
 * taxonomy would be its own kind of failure.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const ARTIFACTS_DIR = path.join(__dirname, '.artifacts');

interface Product {
  sku?: string;
  name?: string;
  brand?: string | null;
  low_price?: number | null;
  high_price?: number | null;
}

interface Brand {
  name?: string;
  slug?: string;
}

/** Read a file as it exists at HEAD; returns null if it doesn't exist there. */
function gitShowHead(relPath: string): string | null {
  try {
    return execSync(`git show HEAD:${relPath}`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function parseProducts(json: string | null): Map<string, Product> {
  const map = new Map<string, Product>();
  if (!json) return map;
  try {
    const parsed = JSON.parse(json) as { products?: Product[] };
    for (const p of parsed.products ?? []) {
      const sku = String(p.sku ?? '').trim();
      if (sku) map.set(sku, p);
    }
  } catch {
    /* leave empty */
  }
  return map;
}

function parseBrands(json: string | null): Map<string, Brand> {
  const map = new Map<string, Brand>();
  if (!json) return map;
  try {
    const parsed = JSON.parse(json) as { brands?: Brand[] };
    for (const b of parsed.brands ?? []) {
      const slug = String(b.slug ?? b.name ?? '').trim();
      if (slug) map.set(slug, b);
    }
  } catch {
    /* leave empty */
  }
  return map;
}

/** Names of files under a path that are added/modified vs HEAD. */
function gitStatusNames(relDir: string): { added: string[]; modified: string[] } {
  let out = '';
  try {
    out = execSync(`git status --porcelain -- ${relDir}`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return { added: [], modified: [] };
  }
  const added: string[] = [];
  const modified: string[] = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2);
    const file = line.slice(3).trim();
    if (status.includes('?') || status.includes('A')) added.push(file);
    else if (status.includes('M') || status.includes('R')) modified.push(file);
  }
  return { added, modified };
}

function anyDataChanged(): boolean {
  try {
    const out = execSync(
      `git status --porcelain -- data/geiger data/categories data/mappings public/brand-logos`,
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

interface FetchStatus {
  phase?: string;
  mode?: string;
  at?: string;
  error?: string;
  keptScrapedAt?: string;
}

interface GuardReport {
  ok?: boolean;
  findings?: { label?: string; baseline?: number | null; fresh?: number; dropPct?: number | null; allowedPct?: number }[];
}

/** Read one of the SCRAPE-910 status/report JSONs; null when absent/invalid. */
function readJsonIfExists<T>(absPath: string): T | null {
  try {
    if (!fs.existsSync(absPath)) return null;
    return JSON.parse(fs.readFileSync(absPath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function fallbackLine(label: string, status: FetchStatus | null, consequence: string): string | null {
  if (!status || status.mode !== 'fallback-committed') return null;
  const kept = status.keptScrapedAt ? ` (kept data last scraped ${status.keptScrapedAt})` : '';
  return `${label} could not be fetched from www.geiger.com, so this rebuild kept the committed copy${kept}. ${consequence}`;
}

function priceLabel(p: Product | undefined): string {
  if (!p) return '—';
  const lo = p.low_price ?? null;
  const hi = p.high_price ?? null;
  if (lo == null && hi == null) return '—';
  if (lo != null && hi != null && lo !== hi) return `$${lo}–$${hi}`;
  return `$${lo ?? hi}`;
}

function main(): void {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  // ---- Products ----------------------------------------------------------
  const oldProducts = parseProducts(gitShowHead('data/geiger/products.json'));
  const newProductsRaw = fs.existsSync(path.join(ROOT, 'data/geiger/products.json'))
    ? fs.readFileSync(path.join(ROOT, 'data/geiger/products.json'), 'utf8')
    : null;
  const newProducts = parseProducts(newProductsRaw);

  const addedSkus: string[] = [];
  const removedSkus: string[] = [];
  const priceChanges: { sku: string; name: string; was: string; now: string }[] = [];

  for (const sku of newProducts.keys()) {
    if (!oldProducts.has(sku)) addedSkus.push(sku);
  }
  for (const sku of oldProducts.keys()) {
    if (!newProducts.has(sku)) removedSkus.push(sku);
  }
  for (const [sku, np] of newProducts) {
    const op = oldProducts.get(sku);
    if (!op) continue;
    if ((op.low_price ?? null) !== (np.low_price ?? null) ||
        (op.high_price ?? null) !== (np.high_price ?? null)) {
      priceChanges.push({
        sku,
        name: String(np.name ?? sku),
        was: priceLabel(op),
        now: priceLabel(np),
      });
    }
  }

  // ---- Brands ------------------------------------------------------------
  const oldBrands = parseBrands(gitShowHead('data/geiger/brands.json'));
  const newBrandsRaw = fs.existsSync(path.join(ROOT, 'data/geiger/brands.json'))
    ? fs.readFileSync(path.join(ROOT, 'data/geiger/brands.json'), 'utf8')
    : null;
  const newBrands = parseBrands(newBrandsRaw);
  const addedBrands: string[] = [];
  const removedBrands: string[] = [];
  for (const [slug, b] of newBrands) if (!oldBrands.has(slug)) addedBrands.push(String(b.name ?? slug));
  for (const [slug, b] of oldBrands) if (!newBrands.has(slug)) removedBrands.push(String(b.name ?? slug));
  const logoChanges = gitStatusNames('public/brand-logos');

  // ---- New category pages (newly-generated JSON) -------------------------
  const catStatus = gitStatusNames('data/categories');

  const changed = anyDataChanged();

  // ---- SCRAPE-910: geiger.com fallback statuses + data-loss guard --------
  const taxonomyStatus = readJsonIfExists<FetchStatus>(
    path.join(ROOT, 'data/geiger/taxonomy-fetch-status.json')
  );
  const brandStatus = readJsonIfExists<FetchStatus>(
    path.join(ROOT, 'data/geiger/brand-index-fetch-status.json')
  );
  const guardReport = readJsonIfExists<GuardReport>(path.join(ARTIFACTS_DIR, 'guard-report.json'));
  const fallbackNotices = [
    fallbackLine(
      'The Geiger category tree (taxonomy)',
      taxonomyStatus,
      'New Geiger categories are missed until a rebuild from an unblocked machine succeeds; existing pages are unaffected.'
    ),
    fallbackLine(
      'The Geiger brand index',
      brandStatus,
      'Brands new to Geiger are missed until a rebuild from an unblocked machine succeeds; existing brands and logos are unchanged.'
    ),
  ].filter((line): line is string => line != null);
  const anyFallback = fallbackNotices.length > 0;

  const summary = {
    generatedAt: new Date().toISOString(),
    changed,
    fallbacks: {
      any: anyFallback,
      notices: fallbackNotices,
      taxonomy: taxonomyStatus,
      brandIndex: brandStatus,
    },
    guard: guardReport,
    products: {
      oldCount: oldProducts.size,
      newCount: newProducts.size,
      added: addedSkus.length,
      removed: removedSkus.length,
      priceChanged: priceChanges.length,
    },
    brands: {
      oldCount: oldBrands.size,
      newCount: newBrands.size,
      added: addedBrands,
      removed: removedBrands,
      logosAddedOrChanged: logoChanges.added.length + logoChanges.modified.length,
    },
    categories: {
      newPages: catStatus.added.length,
      updatedPages: catStatus.modified.length,
    },
    samples: {
      addedSkus: addedSkus.slice(0, 15),
      removedSkus: removedSkus.slice(0, 15),
      priceChanges: priceChanges.slice(0, 15),
    },
  };

  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  // ---- Markdown body -----------------------------------------------------
  const lines: string[] = [];
  lines.push('## Monthly catalog rebuild');
  lines.push('');
  // SCRAPE-910: a fallback is the FIRST thing the PR body and email say.
  if (anyFallback) {
    lines.push('> [!WARNING]');
    lines.push('> **Incomplete refresh: www.geiger.com was unreachable from the runner, so parts of this rebuild fell back to the committed data.**');
    for (const notice of fallbackNotices) lines.push(`> - ${notice}`);
    lines.push('');
  }
  lines.push('Automated refresh of the Geiger data (Phases A/B/C/E) plus AI content for any new categories and a prune of removed products. **Review the data-file diffs before merging.**');
  lines.push('');
  lines.push('### Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Products (was → now) | ${oldProducts.size} → ${newProducts.size} |`);
  lines.push(`| Products added | ${addedSkus.length} |`);
  lines.push(`| Products removed | ${removedSkus.length} |`);
  lines.push(`| Price changes | ${priceChanges.length} |`);
  lines.push(`| Brands (was → now) | ${oldBrands.size} → ${newBrands.size} |`);
  lines.push(`| Brands added | ${addedBrands.length}${addedBrands.length ? ` (${addedBrands.slice(0, 8).join(', ')}${addedBrands.length > 8 ? '…' : ''})` : ''} |`);
  lines.push(`| Brand logos added/changed | ${logoChanges.added.length + logoChanges.modified.length} |`);
  lines.push(`| New category pages | ${catStatus.added.length} |`);
  lines.push(`| Updated category pages | ${catStatus.modified.length} |`);
  lines.push('');
  // SCRAPE-910: fold the data-loss guard's numbers into the PR body so the
  // "nothing was lost" evidence is part of the record Patrick reviews.
  if (guardReport?.findings?.length) {
    lines.push(`### Data-loss guard: ${guardReport.ok ? 'passed' : 'FAILED'}`);
    lines.push('');
    lines.push('| Check | Committed | Fresh | Drop | Allowed |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const f of guardReport.findings) {
      lines.push(
        `| ${f.label ?? ''} | ${f.baseline ?? 'n/a'} | ${f.fresh ?? 'n/a'} | ${
          f.dropPct == null ? 'n/a' : `${f.dropPct}%`
        } | ${f.allowedPct ?? 'n/a'}% |`
      );
    }
    lines.push('');
  }
  if (priceChanges.length) {
    lines.push('### Sample price changes');
    lines.push('');
    lines.push('| SKU | Product | Was | Now |');
    lines.push('| --- | --- | --- | --- |');
    for (const c of priceChanges.slice(0, 15)) {
      lines.push(`| ${c.sku} | ${c.name.replace(/\|/g, '\\|').slice(0, 60)} | ${c.was} | ${c.now} |`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('Removed products are also dropped from category pages automatically at render time (`resolveProducts` skips SKUs missing from the catalog); the prune step keeps the baked `productSkus[]` arrays accurate so this diff is explicit.');
  lines.push('');
  lines.push('On merge, Vercel rebuilds production and `post-deploy-warmup.yml` fires on the successful `deployment_status` to re-warm the on-demand-SSG facet pages.');
  lines.push('');
  lines.push('🤖 Generated by `.github/workflows/monthly-rebuild.yml` (M6-606)');

  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'pr-body.md'), lines.join('\n'), 'utf8');

  // ---- CI output ---------------------------------------------------------
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed ? 'true' : 'false'}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `fallback=${anyFallback ? 'true' : 'false'}\n`);
  }

  console.log(
    `Summary: +${addedSkus.length}/-${removedSkus.length} products, ` +
      `${priceChanges.length} price changes, ${addedBrands.length} new brands, ` +
      `${catStatus.added.length} new category pages. changed=${changed} fallback=${anyFallback}`
  );
  if (anyFallback) {
    for (const notice of fallbackNotices) console.log(`FALLBACK: ${notice}`);
  }
}

main();
