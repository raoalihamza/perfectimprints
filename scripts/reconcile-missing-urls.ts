/* eslint-disable no-console */
/**
 * Reconciliation dry-run (M5-504 part 1, Part D).
 *
 * Reads Patrick's confirmed-complete old category URL list
 * (scripts/url-import/Category_Pages.xlsx), normalises every `/cat/...` URL to a
 * slug, and diffs against the generated category JSONs in data/categories/.
 *
 * Reports which spreadsheet URLs are MISSING on the new site, a sample, and a
 * root-vs-facet breakdown. Writes docs/missing-url-reconciliation.md. Builds
 * nothing.
 *
 * Run: pnpm reconcile:missing-urls
 */
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const ROOT = process.cwd();
const XLSX_FILE = path.join(ROOT, 'scripts', 'url-import', 'Category_Pages.xlsx');
const CATEGORIES_DIR = path.join(ROOT, 'data', 'categories');
const REPORT_PATH = path.join(ROOT, 'docs', 'missing-url-reconciliation.md');

type UrlKind = 'root' | 'modifier' | 'facet' | 'compound-facet';

function readAllCells(filePath: string): string[] {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
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
      if (trimmed) cells.push(trimmed);
    }
  }
  return cells;
}

/** Strip host/query/fragment/trailing-slash → a clean path, or null if not a path. */
function extractPath(value: string): string | null {
  let v = value.trim().replace(/^https?:\/\/[^/]+/i, '');
  if (!v.startsWith('/')) return null;
  v = v.split('?')[0].split('#')[0];
  if (v.length > 1 && v.endsWith('/')) v = v.replace(/\/+$/, '');
  return v;
}

/** Return the `/cat/...` slug (after `/cat/`) for a category path, else null. */
function catSlug(p: string): string | null {
  if (!p.startsWith('/cat/')) return null;
  if (p.includes('/blog/')) return null;
  const segments = p.split('/').filter(Boolean);
  if (segments[0] !== 'cat' || segments.length < 2) return null;
  const rest = segments.slice(1);
  // 4-segment URLs are malformed per the importer; ignore.
  if (rest.length === 4) return null;
  if (rest.length > 5) return null;
  return rest.join('/');
}

function kindOf(slug: string): UrlKind {
  const n = slug.split('/').length;
  if (n === 1) return 'root';
  if (n === 2) return 'modifier';
  if (n === 3) return 'facet';
  return 'compound-facet';
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function main(): void {
  if (!fs.existsSync(XLSX_FILE)) {
    console.error(`Spreadsheet not found: ${XLSX_FILE}`);
    process.exit(1);
  }

  // 1. Spreadsheet slugs.
  const cells = readAllCells(XLSX_FILE);
  const sheetSlugs = new Set<string>();
  for (const cell of cells) {
    const p = extractPath(cell);
    if (!p) continue;
    const slug = catSlug(p);
    if (slug) sheetSlugs.add(slug);
  }

  // 2. Generated slugs (fileSlug → urlSlug).
  const generated = new Set<string>();
  for (const file of fs.readdirSync(CATEGORIES_DIR)) {
    if (!file.endsWith('.json')) continue;
    generated.add(file.replace(/\.json$/, '').split('__').join('/'));
  }

  // 3. Diff.
  const missing = [...sheetSlugs].filter((s) => !generated.has(s)).sort();

  const byKind: Record<UrlKind, number> = {
    root: 0,
    modifier: 0,
    facet: 0,
    'compound-facet': 0,
  };
  const missingRoots: string[] = [];
  for (const slug of missing) {
    const kind = kindOf(slug);
    byKind[kind] += 1;
    if (kind === 'root') missingRoots.push(slug);
  }

  const lines: string[] = [];
  lines.push('# Missing URL Reconciliation (dry-run)');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Spreadsheet: \`scripts/url-import/Category_Pages.xlsx\``);
  lines.push(`Distinct \`/cat/\` slugs in spreadsheet: **${fmt(sheetSlugs.size)}**`);
  lines.push(`Generated category JSONs: **${fmt(generated.size)}**`);
  lines.push(`**Missing on the new site: ${fmt(missing.length)}**`);
  lines.push('');
  lines.push('> Dry-run only. No pages were built.');
  lines.push('');

  lines.push('## Missing breakdown by URL shape');
  lines.push('');
  lines.push('| Shape | Missing |');
  lines.push('| --- | ---: |');
  for (const k of ['root', 'modifier', 'facet', 'compound-facet'] as UrlKind[]) {
    lines.push(`| ${k} | ${fmt(byKind[k])} |`);
  }
  lines.push('');

  if (missingRoots.length > 0) {
    lines.push('## Missing root categories');
    lines.push('');
    for (const slug of missingRoots) lines.push(`- \`/cat/${slug}\``);
    lines.push('');
  }

  if (missing.length > 0) {
    lines.push('## Sample of missing URLs (first 50)');
    lines.push('');
    for (const slug of missing.slice(0, 50)) {
      lines.push(`- \`/cat/${slug}\` (${kindOf(slug)})`);
    }
    lines.push('');
  } else {
    lines.push('All spreadsheet category URLs resolve to a generated page. Nothing to build.');
    lines.push('');
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');

  console.log('Reconciliation dry-run complete.');
  console.log(`  Spreadsheet slugs: ${fmt(sheetSlugs.size)}`);
  console.log(`  Generated:         ${fmt(generated.size)}`);
  console.log(`  Missing:           ${fmt(missing.length)}`);
  console.log(`    roots ${byKind.root}  modifiers ${byKind.modifier}  facets ${byKind.facet}  compound ${byKind['compound-facet']}`);
  console.log(`  Report:            ${path.relative(ROOT, REPORT_PATH)}`);
}

main();
