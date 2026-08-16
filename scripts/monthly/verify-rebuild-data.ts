/**
 * Monthly rebuild (SCRAPE-910) - the data-loss guard.
 *
 *   pnpm tsx scripts/monthly/verify-rebuild-data.ts
 *
 * Runs in the assemble job AFTER the fresh scrape artifacts are downloaded
 * over the committed copies and BEFORE the prune step (so data/categories on
 * disk is still the HEAD baseline). Compares the fresh data against the
 * versions committed at HEAD and EXITS 1 - failing the run before any PR is
 * opened - when the catalog shrank past the margins in rebuild-data-guard.ts:
 * total products -5%, product-bearing category pages -2%, facet URLs with
 * products -5%.
 *
 * Why it exists: the committed catalog was partly built by hand-run passes
 * (the Phase B global top-up and the Phase C brand/search recoveries) that
 * were never wired into the workflow, so a "successful" rebuild used to be
 * able to silently delete 822 products and ~3,434 facet URLs' filter data.
 * Those passes are now wired in; this guard is the backstop that makes the
 * failure mode impossible to ship, whatever breaks next. It is the reason
 * the Full Catalog Rebuild button can be pressed unattended.
 *
 * The pass/fail rules live in rebuild-data-guard.ts (pure, vitest-covered);
 * this file only gathers the numbers. Writes a machine-readable report to
 * scripts/monthly/.artifacts/guard-report.json which compute-summary.ts
 * folds into the PR body and Patrick's email. Also appends a table to
 * $GITHUB_STEP_SUMMARY when run in CI.
 *
 * A metric with no committed baseline (first-ever run) passes with a note.
 * Fresh files that are missing or unparseable FAIL the guard: a rebuild that
 * produced garbage must not reach the PR step either.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_MARGINS,
  countFacetUrlsWithProducts,
  evaluateRebuild,
  pageHasResolvableSku,
  productSkuSet,
} from './rebuild-data-guard';

const ROOT = path.resolve(__dirname, '..', '..');
const ARTIFACTS_DIR = path.join(__dirname, '.artifacts');
const PRODUCTS_REL = 'data/geiger/products.json';
const MEMBERSHIPS_REL = 'data/geiger/facet-memberships.json';
const CATEGORIES_DIR = path.join(ROOT, 'data', 'categories');

/** Read a file as it exists at HEAD; null if it does not exist there. */
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

function parseJson(raw: string | null, label: string): unknown | null {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Could not parse ${label}: ${(e as Error).message}`);
    return null;
  }
}

function readFresh(relPath: string): string | null {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

function main(): void {
  console.log('Data-loss guard: comparing fresh rebuild output against HEAD...');

  // ---- Fresh files must exist and parse; garbage must not ship. ----------
  const freshProductsRaw = readFresh(PRODUCTS_REL);
  const freshProducts = parseJson(freshProductsRaw, `fresh ${PRODUCTS_REL}`);
  if (freshProductsRaw == null || freshProducts == null) {
    console.error(`GUARD FAILED: fresh ${PRODUCTS_REL} is missing or unparseable. Refusing to open a PR.`);
    process.exit(1);
  }
  const freshMembershipsRaw = readFresh(MEMBERSHIPS_REL);
  const freshMemberships = parseJson(freshMembershipsRaw, `fresh ${MEMBERSHIPS_REL}`);
  if (freshMembershipsRaw == null || freshMemberships == null) {
    console.error(`GUARD FAILED: fresh ${MEMBERSHIPS_REL} is missing or unparseable. Refusing to open a PR.`);
    process.exit(1);
  }

  const baselineProducts = parseJson(gitShowHead(PRODUCTS_REL), `HEAD ${PRODUCTS_REL}`);
  const baselineMemberships = parseJson(gitShowHead(MEMBERSHIPS_REL), `HEAD ${MEMBERSHIPS_REL}`);

  const freshSkus = productSkuSet(freshProducts);
  const baselineSkus = baselineProducts == null ? null : productSkuSet(baselineProducts);

  // ---- Pages metric: one pass over the baked category JSONs (HEAD state -
  // this runs before the prune step), resolving each page's productSkus
  // against BOTH catalogs. -------------------------------------------------
  let baselinePages: number | null = baselineSkus == null ? null : 0;
  let freshPages = 0;
  let scanned = 0;
  let unparseable = 0;
  if (fs.existsSync(CATEGORIES_DIR)) {
    for (const file of fs.readdirSync(CATEGORIES_DIR)) {
      if (!file.endsWith('.json')) continue;
      let doc: { productSkus?: unknown[] };
      try {
        doc = JSON.parse(fs.readFileSync(path.join(CATEGORIES_DIR, file), 'utf8'));
      } catch {
        unparseable += 1;
        continue;
      }
      scanned += 1;
      if (baselineSkus != null && pageHasResolvableSku(doc, baselineSkus)) {
        baselinePages = (baselinePages ?? 0) + 1;
      }
      if (pageHasResolvableSku(doc, freshSkus)) freshPages += 1;
    }
  }
  if (unparseable > 0) {
    console.warn(`Warning: ${unparseable} category JSON(s) did not parse and were skipped.`);
  }
  console.log(`Scanned ${scanned} baked category pages.`);

  const baseline = {
    productCount: baselineSkus == null ? null : baselineSkus.size,
    pagesWithProducts: baselinePages,
    facetUrlsWithProducts:
      baselineMemberships == null ? null : countFacetUrlsWithProducts(baselineMemberships),
  };
  const fresh = {
    productCount: freshSkus.size,
    pagesWithProducts: freshPages,
    facetUrlsWithProducts: countFacetUrlsWithProducts(freshMemberships),
  };

  const result = evaluateRebuild(baseline, fresh, DEFAULT_MARGINS);

  for (const f of result.findings) {
    console.log(`${f.failed ? 'FAIL' : 'ok  '}  ${f.message}`);
  }

  // ---- Report for compute-summary.ts + the Actions run summary. ----------
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'guard-report.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), ok: result.ok, margins: DEFAULT_MARGINS, findings: result.findings },
      null,
      2
    ),
    'utf8'
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      `### Data-loss guard: ${result.ok ? 'passed' : 'FAILED'}`,
      '',
      '| Metric | Committed | Fresh | Drop | Allowed |',
      '| --- | --- | --- | --- | --- |',
      ...result.findings.map(
        (f) =>
          `| ${f.label} | ${f.baseline ?? 'n/a'} | ${f.fresh} | ${
            f.dropPct == null ? 'n/a' : `${f.dropPct}%`
          } | ${f.allowedPct}% |`
      ),
      '',
    ];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  }

  if (!result.ok) {
    const failed = result.findings.filter((f) => f.failed);
    console.error('');
    console.error('GUARD FAILED: the fresh rebuild lost data versus what is committed:');
    for (const f of failed) console.error(`  - ${f.message}`);
    console.error('');
    console.error(
      'No PR will be opened and main is untouched. Likely causes: a scrape phase ' +
        'silently degraded (check the taxonomy/brand fallback warnings in the ' +
        'scrape jobs), the global top-up or Phase C recovery passes did not run, ' +
        'or Geiger genuinely restructured their catalog (in which case rerun from ' +
        'an unblocked machine and review the diff by hand).'
    );
    process.exit(1);
  }
  console.log('Data-loss guard passed.');
}

main();
