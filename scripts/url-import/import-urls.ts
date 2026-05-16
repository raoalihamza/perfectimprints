/**
 * One-shot Excel -> JSON converter for the GA4 URL exports.
 *
 * Reads:
 *   scripts/url-import/Category_Pages.xlsx  (~22,213 raw rows)
 *   scripts/url-import/Blog_Links.xlsx      (~823 raw rows)
 *
 * Writes:
 *   data/pi-urls/category-urls.json  (target: 22,181 valid /cat/ URLs)
 *   data/pi-urls/blog-urls.json      (target: 731 real blog articles)
 *
 * Run from project root: `pnpm import-urls`
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';

interface RootCategoryEntry {
  url: string;
  type: 'root';
  rootSlug: string;
}

interface ModifierCategoryEntry {
  url: string;
  type: 'modifier';
  rootSlug: string;
  modifier: string;
}

interface FacetCategoryEntry {
  url: string;
  type: 'facet';
  rootSlug: string;
  facetType: string;
  facetValue: string;
}

interface CompoundFacetCategoryEntry {
  url: string;
  type: 'compound-facet';
  rootSlug: string;
  facets: Array<{ type: string; value: string }>;
}

type CategoryUrlEntry =
  | RootCategoryEntry
  | ModifierCategoryEntry
  | FacetCategoryEntry
  | CompoundFacetCategoryEntry;

type ClassifyResult =
  | { kind: 'entry'; entry: CategoryUrlEntry }
  | { kind: 'malformed'; url: string }
  | { kind: 'ignore' };

interface BlogUrlEntry {
  url: string;
  slug: string;
}

const REPO_ROOT = resolve(__dirname, '..', '..');
const CATEGORY_XLSX = resolve(__dirname, 'Category_Pages.xlsx');
const BLOG_XLSX = resolve(__dirname, 'Blog_Links.xlsx');
const CATEGORY_OUT = resolve(REPO_ROOT, 'data', 'pi-urls', 'category-urls.json');
const BLOG_OUT = resolve(REPO_ROOT, 'data', 'pi-urls', 'blog-urls.json');

function readAllRows(filePath: string): string[] {
  if (!existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }
  const wb = XLSX.read(readFileSync(filePath), { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });

  const cells: string[] = [];
  for (const row of matrix) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (cell == null) continue;
      const trimmed = String(cell).trim();
      if (trimmed.length > 0) cells.push(trimmed);
    }
  }
  return cells;
}

function extractPath(value: string): string | null {
  if (!value) return null;
  let v = value.trim();

  // Strip protocol+host if present.
  v = v.replace(/^https?:\/\/[^/]+/i, '');

  if (!v.startsWith('/')) return null;

  // Drop query strings and fragments.
  v = v.split('?')[0];
  v = v.split('#')[0];

  // Normalize trailing slash (but keep root "/").
  if (v.length > 1 && v.endsWith('/')) v = v.replace(/\/+$/, '');

  return v;
}

function classifyCategory(path: string): ClassifyResult {
  if (!path.startsWith('/cat/')) return { kind: 'ignore' };
  if (path.includes('/blog/')) return { kind: 'ignore' };

  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== 'cat') return { kind: 'ignore' };

  const rest = segments.slice(1);

  switch (rest.length) {
    case 1:
      return {
        kind: 'entry',
        entry: { url: path, type: 'root', rootSlug: rest[0] },
      };

    case 2:
      return {
        kind: 'entry',
        entry: {
          url: path,
          type: 'modifier',
          rootSlug: rest[0],
          modifier: rest[1],
        },
      };

    case 3:
      return {
        kind: 'entry',
        entry: {
          url: path,
          type: 'facet',
          rootSlug: rest[0],
          facetType: rest[1],
          facetValue: rest[2],
        },
      };

    case 4:
      return { kind: 'malformed', url: path };

    case 5:
      return {
        kind: 'entry',
        entry: {
          url: path,
          type: 'compound-facet',
          rootSlug: rest[0],
          facets: [
            { type: rest[1], value: rest[2] },
            { type: rest[3], value: rest[4] },
          ],
        },
      };

    default:
      return { kind: 'ignore' };
  }
}

function classifyBlog(path: string): BlogUrlEntry | null {
  if (!path.startsWith('/blog/')) return null;
  if (path === '/blog' || path === '/blog/') return null;
  if (path.includes('/blog/cat/')) return null;
  if (/\/blog\/page\/\d+/.test(path)) return null;
  if (path.includes('/blog/tag/')) return null;
  if (path.includes('/blog/author/')) return null;
  if (path.includes('/blog/feed')) return null;

  const segments = path.split('/').filter(Boolean);
  if (segments.length !== 2) return null; // /blog/<slug> only

  return {
    url: path,
    slug: segments[1],
  };
}

function dedupeByUrl<T extends { url: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
  }
  return out;
}

function importCategories(): void {
  console.log(`\nReading: ${CATEGORY_XLSX}`);
  const cells = readAllRows(CATEGORY_XLSX);
  console.log(`  Raw non-empty cells: ${cells.length}`);

  const candidates = cells
    .map(extractPath)
    .filter((p): p is string => p != null);
  console.log(`  Path-like rows:       ${candidates.length}`);

  const entries: CategoryUrlEntry[] = [];
  const malformed: string[] = [];
  for (const p of candidates) {
    const result = classifyCategory(p);
    if (result.kind === 'entry') entries.push(result.entry);
    else if (result.kind === 'malformed') malformed.push(result.url);
  }
  console.log(`  Valid /cat/ rows:     ${entries.length}`);
  if (malformed.length > 0) {
    console.log(`  Skipped malformed:    ${malformed.length}`);
    for (const u of malformed) console.log(`    - ${u}`);
  }

  const unique = dedupeByUrl(entries);
  console.log(`  After dedupe:         ${unique.length}`);

  const rootCount = unique.filter((u) => u.type === 'root').length;
  const modifierCount = unique.filter((u) => u.type === 'modifier').length;
  const facetCount = unique.filter((u) => u.type === 'facet').length;
  const compoundFacetCount = unique.filter((u) => u.type === 'compound-facet').length;

  const payload = {
    totalCount: unique.length,
    rootCount,
    modifierCount,
    facetCount,
    compoundFacetCount,
    skippedMalformedCount: malformed.length,
    urls: unique,
  };

  writeFileSync(CATEGORY_OUT, JSON.stringify(payload, null, 2));
  console.log(`  Wrote: ${CATEGORY_OUT}`);
  console.log(
    `  Roots: ${rootCount}    Modifiers: ${modifierCount}    Facets: ${facetCount}    Compound: ${compoundFacetCount}    Total: ${unique.length}`,
  );

  const expectedTotal = 22180;
  const delta = unique.length - expectedTotal;
  if (Math.abs(delta) > 50) {
    console.log(
      `  WARN: total (${unique.length}) differs from expected ${expectedTotal} by ${delta}. Review filters.`,
    );
  }
}

function importBlogs(): void {
  console.log(`\nReading: ${BLOG_XLSX}`);
  const cells = readAllRows(BLOG_XLSX);
  console.log(`  Raw non-empty cells: ${cells.length}`);

  const candidates = cells
    .map(extractPath)
    .filter((p): p is string => p != null);
  console.log(`  Path-like rows:       ${candidates.length}`);

  const classified = candidates
    .map(classifyBlog)
    .filter((e): e is BlogUrlEntry => e != null);
  console.log(`  Valid /blog/ rows:    ${classified.length}`);

  const unique = dedupeByUrl(classified);
  console.log(`  After dedupe:         ${unique.length}`);

  const payload = {
    totalCount: unique.length,
    urls: unique,
  };

  writeFileSync(BLOG_OUT, JSON.stringify(payload, null, 2));
  console.log(`  Wrote: ${BLOG_OUT}`);

  const expectedTotal = 731;
  const delta = unique.length - expectedTotal;
  if (Math.abs(delta) > 25) {
    console.log(
      `  WARN: total (${unique.length}) differs from expected ${expectedTotal} by ${delta}. Review filters.`,
    );
  }
}

function main(): void {
  console.log('Perfect Imprints URL import');
  console.log('---------------------------');
  importCategories();
  importBlogs();
  console.log('\nDone.');
}

main();
