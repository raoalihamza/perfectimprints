/**
 * Self-verify the re-scrape + re-import and write data/blogs/.rescrape-report.md.
 *
 *   pnpm tsx scripts/migrations/write-rescrape-report.ts
 *
 * Reads data/blogs/raw/ + Sanity and reports:
 *   - total scraped, succeeded, failed (from scrape-errors.log)
 *   - how many bodies grew vs the old archived copy (if archive is available)
 *   - 5 spot-check results (paramedic-..., premium-..., christmas-ornaments + 2 more)
 *   - blogs with suspiciously short bodies (< 1000 chars) for manual review
 *
 * Does NOT modify Sanity or raw JSONs.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@sanity/client';

const PROJECT_ROOT = resolve(__dirname, '../..');
const RAW_DIR = resolve(PROJECT_ROOT, 'data/blogs/raw');
const ARCHIVE_RAW_DIR = resolve(
  PROJECT_ROOT,
  '../../Documents/perfectimprints-archive/blogs-snapshot-2026-06-10/raw',
);
const ERROR_LOG = resolve(PROJECT_ROOT, 'data/blogs/.scrape-errors.log');
const REPORT_PATH = resolve(PROJECT_ROOT, 'data/blogs/.rescrape-report.md');

function loadDotEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

interface RawBlog {
  slug: string;
  title?: string;
  bodyHtml?: string;
  contentBlockCount?: number;
  strippedGridCount?: number;
}

interface FailureRow {
  url: string;
  status: string;
  message: string;
}

function readRaw(slug: string, dir = RAW_DIR): RawBlog | null {
  const p = resolve(dir, `${slug}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as RawBlog;
  } catch {
    return null;
  }
}

function readErrors(): FailureRow[] {
  if (!existsSync(ERROR_LOG)) return [];
  const out: FailureRow[] = [];
  for (const line of readFileSync(ERROR_LOG, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 4) continue;
    out.push({ url: parts[1], status: parts[2], message: parts[3] });
  }
  return out;
}

function countHeadings(html: string, tag: string): number {
  const matches = html.match(new RegExp(`<${tag}\\b`, 'gi'));
  return matches ? matches.length : 0;
}

async function main(): Promise<void> {
  // 1. Raw scrape stats
  const rawFiles = existsSync(RAW_DIR)
    ? readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'))
    : [];
  const total = rawFiles.length;

  let suspiciousShort = 0;
  const shortSlugs: string[] = [];
  let withImages = 0;
  let withEmbeds = 0;
  let avgBodyChars = 0;
  let totalBodyChars = 0;
  let withGridsStripped = 0;
  let totalStrippedGrids = 0;

  for (const f of rawFiles) {
    const d = readRaw(f.replace(/\.json$/, ''));
    if (!d) continue;
    const bodyLen = (d.bodyHtml || '').length;
    totalBodyChars += bodyLen;
    if (bodyLen < 1000) {
      suspiciousShort += 1;
      if (shortSlugs.length < 30) shortSlugs.push(d.slug);
    }
    if ((d as { images?: unknown[] }).images?.length) withImages += 1;
    if ((d as { embeds?: unknown[] }).embeds?.length) withEmbeds += 1;
    if (d.strippedGridCount && d.strippedGridCount > 0) {
      withGridsStripped += 1;
      totalStrippedGrids += d.strippedGridCount;
    }
  }
  avgBodyChars = total > 0 ? Math.round(totalBodyChars / total) : 0;

  // 2. Failures
  const failures = readErrors();
  const failureSlugs = failures
    .map((f) => {
      const m = f.url.match(/\/blog\/([^/\s]+)$/);
      return m ? m[1] : null;
    })
    .filter(Boolean) as string[];

  // 3. Size growth vs archive (if archive is available)
  let archivedComparable = 0;
  let bodiesGrew = 0;
  let bodiesShrank = 0;
  let totalGrowthChars = 0;
  if (existsSync(ARCHIVE_RAW_DIR)) {
    for (const f of rawFiles) {
      const slug = f.replace(/\.json$/, '');
      const cur = readRaw(slug);
      const old = readRaw(slug, ARCHIVE_RAW_DIR);
      if (!cur || !old) continue;
      archivedComparable += 1;
      const curLen = (cur.bodyHtml || '').length;
      const oldLen = (old.bodyHtml || '').length;
      const diff = curLen - oldLen;
      totalGrowthChars += diff;
      if (diff > 0) bodiesGrew += 1;
      else if (diff < 0) bodiesShrank += 1;
    }
  }

  // 4. Spot-check 5 slugs (3 from the spec + 2 more for coverage)
  const SPOT_CHECK_SLUGS = [
    'paramedic-shares-ems-appreciation-gifts-ems-week',
    'premium-promotional-gifts-for-national-doctors-day',
    'top-15-recommended-custom-christmas-ornaments',
    'top-10-promotional-products-trends',
    'what-are-thunder-sticks-and-what-are-they-for',
  ];
  const spotChecks: {
    slug: string;
    rawExists: boolean;
    h2: number;
    h3: number;
    h4: number;
    bodyChars: number;
    strippedGrids: number;
    contentBlocks: number;
    pass: boolean;
    notes: string[];
  }[] = [];

  for (const slug of SPOT_CHECK_SLUGS) {
    const d = readRaw(slug);
    if (!d) {
      spotChecks.push({
        slug,
        rawExists: false,
        h2: 0,
        h3: 0,
        h4: 0,
        bodyChars: 0,
        strippedGrids: 0,
        contentBlocks: 0,
        pass: false,
        notes: ['raw JSON missing — likely deleted or scrape failed'],
      });
      continue;
    }
    const body = d.bodyHtml || '';
    const h2 = countHeadings(body, 'h2');
    const h3 = countHeadings(body, 'h3');
    const h4 = countHeadings(body, 'h4');
    const totalHeadings = h2 + h3 + h4;
    const notes: string[] = [];
    if (totalHeadings <= 3) notes.push(`only ${totalHeadings} headings — possibly truncated`);
    if (body.length < 2000) notes.push(`body only ${body.length} chars — possibly thin`);
    spotChecks.push({
      slug,
      rawExists: true,
      h2,
      h3,
      h4,
      bodyChars: body.length,
      strippedGrids: d.strippedGridCount ?? 0,
      contentBlocks: d.contentBlockCount ?? 0,
      pass: totalHeadings > 3 && body.length > 1500,
      notes,
    });
  }

  // 5. Sanity stats (if reachable)
  let sanityCount = -1;
  let sanityPublished = -1;
  let sanityDrafts = -1;
  try {
    const c = createClient({
      projectId:
        process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID || '',
      dataset:
        process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production',
      apiVersion: '2024-10-01',
      useCdn: false,
      token: process.env.SANITY_API_TOKEN,
    });
    sanityCount = (await c.fetch('count(*[_type=="blogPost"])')) ?? 0;
    sanityPublished =
      (await c.fetch(
        'count(*[_type=="blogPost" && !(_id in path("drafts.**"))])',
      )) ?? 0;
    sanityDrafts =
      (await c.fetch(
        'count(*[_type=="blogPost" && _id in path("drafts.**"))])',
      )) ?? 0;
  } catch {
    // ignore — report still useful without Sanity
  }

  // 6. Write the report
  const lines: string[] = [];
  lines.push(`# Re-scrape report — ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## Scrape totals');
  lines.push('');
  lines.push(`- Total raw JSONs: **${total}**`);
  lines.push(`- Failures logged: **${failures.length}**`);
  lines.push(`- Avg body chars: ${avgBodyChars.toLocaleString()}`);
  lines.push(`- Bodies with images: ${withImages}`);
  lines.push(`- Bodies with video embeds: ${withEmbeds}`);
  lines.push(`- Bodies with grids stripped: ${withGridsStripped} (total ${totalStrippedGrids} grids removed)`);
  lines.push('');

  if (archivedComparable > 0) {
    lines.push('## Growth vs archived copy');
    lines.push('');
    lines.push(`- Comparable pairs (slug in both new + archive): ${archivedComparable}`);
    lines.push(`- Bodies **grew**: ${bodiesGrew}`);
    lines.push(`- Bodies shrank: ${bodiesShrank}`);
    lines.push(`- Net growth: ${totalGrowthChars > 0 ? '+' : ''}${totalGrowthChars.toLocaleString()} chars`);
    lines.push('');
  }

  lines.push('## Spot-checks');
  lines.push('');
  lines.push('| Slug | Raw | Body chars | h2 | h3 | h4 | Grids stripped | Content blocks | Pass | Notes |');
  lines.push('|------|-----|------------|----|----|----|----------------|----------------|------|-------|');
  for (const s of spotChecks) {
    lines.push(
      `| \`${s.slug}\` | ${s.rawExists ? '✓' : '✗'} | ${s.bodyChars} | ${s.h2} | ${s.h3} | ${s.h4} | ${s.strippedGrids} | ${s.contentBlocks} | ${s.pass ? '✅' : '❌'} | ${s.notes.join('; ')} |`,
    );
  }
  lines.push('');

  if (suspiciousShort > 0) {
    lines.push('## Suspiciously short bodies (< 1000 chars)');
    lines.push('');
    lines.push(`Total: ${suspiciousShort}. Sample of first ${shortSlugs.length}:`);
    lines.push('');
    for (const s of shortSlugs) lines.push(`- \`${s}\``);
    lines.push('');
  }

  if (failures.length > 0) {
    lines.push('## Failed slugs');
    lines.push('');
    lines.push(`Total: ${failures.length}.`);
    lines.push('');
    for (const slug of failureSlugs.slice(0, 100)) lines.push(`- \`${slug}\``);
    if (failureSlugs.length > 100) lines.push(`- … ${failureSlugs.length - 100} more`);
    lines.push('');
  }

  if (sanityCount >= 0) {
    lines.push('## Sanity state');
    lines.push('');
    lines.push(`- Total blogPost docs: ${sanityCount}`);
    lines.push(`- Published: ${sanityPublished}`);
    lines.push(`- Drafts: ${sanityDrafts}`);
    lines.push('');
  }

  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log(`Wrote ${REPORT_PATH}`);
  // also stream to stdout for review
  console.log('\n' + lines.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
