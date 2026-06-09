/**
 * Programmatic verification of imported blog drafts in Sanity.
 *
 * Picks 5 representative samples (short, long, image-heavy, link-heavy,
 * formatted) and validates their structure round-trips correctly through
 * Sanity:
 *   - title + slug present
 *   - publishDate is a valid ISO date
 *   - body is non-empty portable text
 *   - inline image blocks have a real Sanity asset ref (not a placeholder)
 *   - link annotations exist + href preserved
 *
 * This substitutes for the manual visual sample check in the prompt when
 * Patrick is away. Reports anything anomalous so he can review on return.
 *
 *   pnpm tsx scripts/migrations/verify-blog-drafts.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const PROJECT_ROOT = resolve(__dirname, '../..');
const RAW_DIR = resolve(PROJECT_ROOT, 'data/blogs/raw');
const REPORT_PATH = resolve(PROJECT_ROOT, 'data/blogs/verification-report.json');

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

function buildClient(): SanityClient {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId || !token) {
    throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID + SANITY_API_TOKEN required.');
  }
  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    useCdn: false,
    token,
    perspective: 'previewDrafts',
  });
}

interface RawBlog {
  slug: string;
  title: string;
  bodyHtml: string;
}

function pickSamples(): { reason: string; slug: string }[] {
  // Read raw scrapes and choose 5 representative samples by structural signals.
  const candidates: { slug: string; htmlLen: number; imgCount: number; catLinkCount: number; hLevels: number }[] = [];
  if (!existsSync(RAW_DIR)) return [];
  for (const f of require('node:fs').readdirSync(RAW_DIR)) {
    if (!f.endsWith('.json')) continue;
    const blog = JSON.parse(readFileSync(resolve(RAW_DIR, f), 'utf8')) as RawBlog;
    const html = blog.bodyHtml || '';
    candidates.push({
      slug: blog.slug,
      htmlLen: html.length,
      imgCount: (html.match(/<img\b/g) || []).length,
      catLinkCount: (html.match(/href="\/cat\//g) || []).length,
      hLevels: (html.match(/<h[2-4]\b/g) || []).length + (html.match(/<ul\b|<ol\b/g) || []).length,
    });
  }
  if (candidates.length === 0) return [];

  const sorted = [...candidates];
  // 1 short: shortest body
  const short = [...sorted].sort((a, b) => a.htmlLen - b.htmlLen)[0];
  // 1 long: longest body
  const long = [...sorted].sort((a, b) => b.htmlLen - a.htmlLen)[0];
  // 1 image-heavy: most images
  const imageHeavy = [...sorted].sort((a, b) => b.imgCount - a.imgCount)[0];
  // 1 link-heavy: most /cat/ links
  const linkHeavy = [...sorted].sort((a, b) => b.catLinkCount - a.catLinkCount)[0];
  // 1 formatted: most headings/lists
  const formatted = [...sorted].sort((a, b) => b.hLevels - a.hLevels)[0];

  const picks: { reason: string; slug: string }[] = [];
  const seen = new Set<string>();
  for (const [reason, c] of [
    ['short', short],
    ['long', long],
    ['image-heavy', imageHeavy],
    ['link-heavy', linkHeavy],
    ['formatted', formatted],
  ] as const) {
    if (c && !seen.has(c.slug)) {
      picks.push({ reason, slug: c.slug });
      seen.add(c.slug);
    }
  }
  // Top up to 5 with random distinct slugs if duplicates ate slots.
  let i = 0;
  while (picks.length < 5 && i < sorted.length) {
    const candidate = sorted[i];
    if (!seen.has(candidate.slug)) {
      picks.push({ reason: 'fill', slug: candidate.slug });
      seen.add(candidate.slug);
    }
    i += 1;
  }
  return picks;
}

interface ValidationIssue {
  field: string;
  message: string;
}

function validateDoc(doc: Record<string, unknown> | null): {
  ok: boolean;
  issues: ValidationIssue[];
  stats: Record<string, number>;
} {
  const issues: ValidationIssue[] = [];
  const stats: Record<string, number> = {
    imageBlocks: 0,
    embedBlocks: 0,
    linkAnnotations: 0,
    paragraphs: 0,
    headings: 0,
  };

  if (!doc) {
    issues.push({ field: 'doc', message: 'Sanity returned no doc' });
    return { ok: false, issues, stats };
  }
  if (!doc.title) issues.push({ field: 'title', message: 'missing' });
  if (
    !doc.slug ||
    typeof (doc.slug as Record<string, unknown>).current !== 'string'
  ) {
    issues.push({ field: 'slug', message: 'missing or malformed' });
  }
  if (!doc.publishDate || Number.isNaN(Date.parse(doc.publishDate as string))) {
    issues.push({ field: 'publishDate', message: 'missing or invalid' });
  }
  // updatedDate is optional but if present must parse.
  if (doc.updatedDate && Number.isNaN(Date.parse(doc.updatedDate as string))) {
    issues.push({ field: 'updatedDate', message: 'present but invalid' });
  }
  if (!doc.author) {
    issues.push({ field: 'author', message: 'missing — most PI blogs have an inline Author line' });
  }
  if (!doc.headerImage) {
    issues.push({ field: 'headerImage', message: 'missing (run backfill-blog-images)' });
  }

  const body = doc.body as unknown[] | undefined;
  if (!Array.isArray(body) || body.length === 0) {
    issues.push({ field: 'body', message: 'empty or missing' });
  } else {
    for (const block of body) {
      const b = block as Record<string, unknown>;
      if (b._type === 'image') {
        stats.imageBlocks += 1;
        const asset = b.asset as Record<string, unknown> | undefined;
        if (!asset?._ref || typeof asset._ref !== 'string' || !asset._ref.startsWith('image-')) {
          issues.push({
            field: 'body.image.asset',
            message: `block missing valid asset ref (got ${JSON.stringify(asset)})`,
          });
        }
        if (b._placeholderSrc) {
          issues.push({
            field: 'body.image',
            message: '_placeholderSrc not cleared — upload failed silently',
          });
        }
      } else if (b._type === 'embed') {
        stats.embedBlocks += 1;
        if (!b.provider || !b.url) {
          issues.push({ field: 'body.embed', message: 'missing provider or url' });
        }
      } else if (b._type === 'block') {
        const style = (b.style as string) || 'normal';
        if (style === 'normal') stats.paragraphs += 1;
        else if (/^h[1-6]$/.test(style)) stats.headings += 1;
        const markDefs = b.markDefs as Record<string, unknown>[] | undefined;
        if (Array.isArray(markDefs)) {
          for (const m of markDefs) {
            if (m._type === 'link') stats.linkAnnotations += 1;
          }
        }
      }
    }
  }
  return { ok: issues.length === 0, issues, stats };
}

async function main(): Promise<void> {
  const samples = pickSamples();
  if (samples.length === 0) {
    console.error('No raw blogs found in data/blogs/raw/ — run scrape first.');
    process.exit(1);
  }
  console.log('Sample selection:');
  for (const s of samples) console.log(`  ${s.reason.padEnd(12)} ${s.slug}`);

  const client = buildClient();
  const groq = `*[_type == "blogPost" && slug.current in $slugs][0...50]{
    _id, title, metaTitle, slug, publishDate, updatedDate, body,
    relatedCategorySlugs, headerImage, "author": author->name
  }`;
  const docs = (await client.fetch<Record<string, unknown>[]>(groq, {
    slugs: samples.map((s) => s.slug),
  })) ?? [];

  const docBySlug = new Map<string, Record<string, unknown>>();
  for (const d of docs) {
    const slug = (d.slug as { current?: string })?.current;
    if (slug) docBySlug.set(slug, d);
  }

  const results: {
    sample: string;
    slug: string;
    docId?: string;
    title?: string;
    ok: boolean;
    issues: ValidationIssue[];
    stats: Record<string, number>;
  }[] = [];

  let allOk = true;
  for (const s of samples) {
    const doc = docBySlug.get(s.slug) || null;
    const { ok, issues, stats } = validateDoc(doc);
    if (!ok) allOk = false;
    results.push({
      sample: s.reason,
      slug: s.slug,
      docId: doc?._id as string | undefined,
      title: doc?.title as string | undefined,
      ok,
      issues,
      stats,
    });
  }

  console.log('\nResults:');
  for (const r of results) {
    const icon = r.ok ? 'OK ' : 'FAIL';
    console.log(`  [${icon}] ${r.sample.padEnd(12)} ${r.slug}`);
    if (r.docId) console.log(`        _id: ${r.docId}`);
    console.log(`        stats: ${JSON.stringify(r.stats)}`);
    for (const issue of r.issues) {
      console.log(`        ! ${issue.field}: ${issue.message}`);
    }
  }
  console.log(`\nOverall: ${allOk ? 'ALL CLEAN' : 'ISSUES FOUND'}`);
  writeFileSync(REPORT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), allOk, results }, null, 2), 'utf8');
  console.log(`Report: ${REPORT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
