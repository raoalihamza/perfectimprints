/**
 * Catalog page-image fetcher (P2-CAT-004 part 2 — a throwaway editorial tool,
 * NOT a pipeline).
 *
 *   pnpm fetch-catalog-images usa-made            # one catalog
 *   pnpm fetch-catalog-images --all               # every catalog with images
 *   pnpm fetch-catalog-images usa-made --limit 20 # first N pages only
 *
 * Downloads a catalog's page rasters (`<pdf.baseUrl>/Leaf_N.jpg`, 1-indexed to
 * `pdf.pages` — captured by the Phase I scraper into data/geiger/catalogs.json)
 * into `tmp/catalog-images/<slug>/` (GITIGNORED — never commit these JPEGs) so
 * Patrick can flip through them, pick the good pages, and upload his choices
 * through the normal Sanity image fields (the catalogPage hero image, or
 * inline images in the landing body). It deliberately does NOT auto-insert
 * anything into a doc and does NOT bulk-upload to Sanity — photo choice is
 * editorial.
 *
 * Caveats:
 *  - The CloudFront `Leaf_N.jpg` URLs are UNDOCUMENTED yupub/Geiger internals
 *    (same caveat as the Phase I scraper): they can change shape or vanish
 *    with a new catalog edition. Failures skip + warn per page/catalog —
 *    never crash the batch. If a catalog 404s wholesale, re-run
 *    `pnpm scrape-catalogs` to refresh the tids/baseUrls first.
 *  - Retail Collective + Trend Talk are EXTERNAL flipbooks with no fetchable
 *    page images (`pdf: null`) — skipped with a message; Patrick supplies
 *    those by screenshotting the flipbook.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '../..');
const CATALOGS_FILE = join(PROJECT_ROOT, 'data', 'geiger', 'catalogs.json');
const OUT_ROOT = join(PROJECT_ROOT, 'tmp', 'catalog-images');
/** Polite delay between page downloads (vendor CDN, be a good citizen). */
const DELAY_MS = 300;

interface CatalogEntry {
  slug: string;
  title: string;
  pdf: { baseUrl?: string | null; pages?: number | null } | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(): { slugs: string[] | 'all'; limit: number | null } {
  const args = process.argv.slice(2).filter(Boolean);
  let limit: number | null = null;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx >= 0) {
    limit = Number.parseInt(args[limitIdx + 1] ?? '', 10) || null;
    args.splice(limitIdx, 2);
  }
  if (args.includes('--all')) return { slugs: 'all', limit };
  const slugs = args.filter((a) => !a.startsWith('--'));
  if (slugs.length === 0) {
    console.error(
      'Usage: pnpm fetch-catalog-images <catalog-slug> [--limit N]   or   --all\n' +
        'Slugs come from data/geiger/catalogs.json (e.g. usa-made, green-guide, ideas).',
    );
    process.exit(1);
  }
  return { slugs, limit };
}

async function fetchCatalog(entry: CatalogEntry, limit: number | null): Promise<void> {
  const baseUrl = entry.pdf?.baseUrl?.replace(/\/$/, '');
  const pages = entry.pdf?.pages ?? 0;

  if (!baseUrl || pages <= 0) {
    console.log(
      `\n— ${entry.title} (${entry.slug}): no fetchable page images (external flipbook). ` +
        'Patrick supplies these by screenshotting the catalog viewer.',
    );
    return;
  }

  const total = limit ? Math.min(limit, pages) : pages;
  const outDir = join(OUT_ROOT, entry.slug);
  mkdirSync(outDir, { recursive: true });
  console.log(`\n— ${entry.title} (${entry.slug}): ${total} of ${pages} pages → ${outDir}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (let n = 1; n <= total; n += 1) {
    const outFile = join(outDir, `page-${String(n).padStart(3, '0')}.jpg`);
    if (existsSync(outFile)) {
      skipped += 1;
      continue; // idempotent resume — already downloaded
    }
    const url = `${baseUrl}/Leaf_${n}.jpg`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        failed += 1;
        console.warn(`  ! page ${n}: HTTP ${res.status} (${url}) — skipped`);
      } else {
        writeFileSync(outFile, Buffer.from(await res.arrayBuffer()));
        ok += 1;
        if (ok % 10 === 0) console.log(`  … ${ok}/${total} downloaded`);
      }
    } catch (err) {
      failed += 1;
      console.warn(`  ! page ${n}: ${err instanceof Error ? err.message : err} — skipped`);
    }
    await sleep(DELAY_MS);
  }
  console.log(
    `  done: ${ok} downloaded, ${skipped} already present, ${failed} failed. ` +
      `Pick the good pages and upload them via the catalogPage image fields in Studio.`,
  );
  if (failed > 0 && ok === 0 && skipped === 0) {
    console.warn(
      '  every page failed — the CloudFront baseUrl may be stale (new catalog edition). ' +
        'Re-run `pnpm scrape-catalogs` to refresh catalogs.json, then retry.',
    );
  }
}

async function main(): Promise<void> {
  if (!existsSync(CATALOGS_FILE)) {
    console.error(`Missing ${CATALOGS_FILE} — run \`pnpm scrape-catalogs\` first.`);
    process.exit(1);
  }
  const { catalogs } = JSON.parse(readFileSync(CATALOGS_FILE, 'utf8')) as {
    catalogs: CatalogEntry[];
  };
  const { slugs, limit } = parseArgs();

  const wanted =
    slugs === 'all' ? catalogs : catalogs.filter((c) => slugs.includes(c.slug));
  if (slugs !== 'all') {
    for (const s of slugs) {
      if (!catalogs.some((c) => c.slug === s)) {
        console.warn(`Unknown catalog slug "${s}" — known: ${catalogs.map((c) => c.slug).join(', ')}`);
      }
    }
  }
  if (wanted.length === 0) {
    console.error('Nothing to fetch.');
    process.exit(1);
  }

  for (const entry of wanted) {
    // Per-catalog isolation: one bad catalog never crashes the batch.
    try {
      await fetchCatalog(entry, limit);
    } catch (err) {
      console.warn(`— ${entry.slug}: failed (${err instanceof Error ? err.message : err}) — skipped`);
    }
  }
  console.log(`\nAll done. Images live under ${OUT_ROOT} (gitignored — do not commit).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
