// Bulk Product Page import (P2-CP-003). Powers the Studio "Bulk Upload" panel:
//
//   POST /api/sanity/bulk-import  multipart/form-data
//     action=preview  file=<csv|xlsx>
//       → dry-run plan: per-row CREATE / UPDATE / ERROR + diagnostics. NO writes,
//         NO image fetching (URL shape is validated by the parser only).
//     action=apply    file=<csv|xlsx>  rows=<comma-separated spreadsheet row numbers>
//       → for each selected valid row: fetch its image URLs, upload each as a
//         Sanity image asset, and CREATE or UPDATE the DRAFT productPage
//         (upsert by slug — published or draft — so re-imports never duplicate).
//         Only columns with a value are written; blanks never erase anything.
//         Best-effort per row: a bad image URL drops that image (warning), a bad
//         row fails alone. The panel applies in small batches so one request
//         stays fast; re-running an already-applied batch is idempotent.
//
// AUTH: the cookie-session nonce handshake shared with the Site Refresh panel
// (lib/sanity/studio-nonce-auth.ts) — only a logged-in Studio user can call
// this; the SANITY_API_TOKEN write client stays server-only.
//
// Everything is written as a DRAFT (`drafts.<id>`), so nothing goes live until
// Patrick reviews + publishes — no /cat, /products, or webhook/freshness change
// at import time (publishing later fires the existing productPage webhook case).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import type { SanityClient } from '@sanity/client';
import { serverSanityClient, verifyStudioNonce } from '@/lib/sanity/studio-nonce-auth';
import { parseProductSheet, type ParsedRow } from '@/lib/bulk-import/parse';
import { buildProductPageSetFields, collectRowImageUrls } from '@/lib/bulk-import/build-doc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Image fetch + asset upload for a batch of rows can legitimately take a while.
export const maxDuration = 300;

// Handshake doc id + header — must match the Studio bulk-import tool.
const AUTH_DOC_ID = 'drafts.bulkImportAuth';
const NONCE_HEADER = 'x-import-nonce';

const MAX_FILE_BYTES = 4 * 1024 * 1024; // stay under the platform request-body cap
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const IMAGE_CONCURRENCY = 4;

// ── Category slug validation (warnings only — never blocks a row) ────────────

let bakedCategorySlugs: Set<string> | null = null;

function loadBakedCategorySlugs(): Set<string> {
  if (bakedCategorySlugs) return bakedCategorySlugs;
  const slugs = new Set<string>();
  try {
    const file = path.join(process.cwd(), 'data', 'pi-urls', 'category-urls.json');
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { urls?: Array<{ url?: string }> };
    for (const entry of parsed.urls ?? []) {
      const url = entry.url ?? '';
      if (url.startsWith('/cat/')) slugs.add(url.slice('/cat/'.length));
    }
  } catch {
    // Missing/unreadable list → skip validation rather than fail the import.
  }
  bakedCategorySlugs = slugs;
  return slugs;
}

async function loadKnownCategorySlugs(client: SanityClient): Promise<Set<string>> {
  const known = new Set(loadBakedCategorySlugs());
  try {
    const custom = await client.fetch<string[]>(
      `*[_type == "customCategory" && defined(slug.current)].slug.current`,
    );
    for (const s of custom) if (s) known.add(s);
  } catch {
    // Sanity hiccup → validate against the baked list only.
  }
  return known;
}

/** Unknown category slugs are warnings (Patrick may create the category later). */
function addCategorySlugWarnings(row: ParsedRow, known: Set<string>): void {
  if (known.size === 0) return; // no list available — don't emit false warnings
  const related = row.fields.relatedCategorySlug;
  if (related && !known.has(related)) {
    row.warnings.push(`Related Category "${related}" is not an existing category page.`);
  }
  for (const slug of row.fields.addToCategories ?? []) {
    if (!known.has(slug)) {
      row.warnings.push(`Add To Categories: "${slug}" is not an existing category page.`);
    }
  }
}

// ── Existing-doc lookup (upsert by slug) ──────────────────────────────────────

interface ExistingDocs {
  draftId?: string;
  publishedId?: string;
}

async function lookupExistingBySlug(
  client: SanityClient,
  slugs: string[],
): Promise<Map<string, ExistingDocs>> {
  const map = new Map<string, ExistingDocs>();
  if (slugs.length === 0) return map;
  // raw perspective (set on the client) returns drafts AND published docs.
  const docs = await client.fetch<Array<{ _id: string; slug: string }>>(
    `*[_type == "productPage" && slug.current in $slugs]{ _id, "slug": slug.current }`,
    { slugs },
  );
  for (const doc of docs) {
    const entry = map.get(doc.slug) ?? {};
    if (doc._id.startsWith('drafts.')) entry.draftId = doc._id;
    else entry.publishedId = doc._id;
    map.set(doc.slug, entry);
  }
  return map;
}

// ── Image fetch + upload ──────────────────────────────────────────────────────

/** SSRF guard: never fetch localhost / private-network hosts. */
function isBlockedImageHost(raw: string): boolean {
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (host === '::1' || host === '[::1]' || host.startsWith('fd') || host.startsWith('fe80')) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function filenameFromUrl(url: string): string {
  try {
    const base = new URL(url).pathname.split('/').filter(Boolean).pop() || 'image';
    return base.slice(0, 120);
  } catch {
    return 'image';
  }
}

interface ImageUploadOutcome {
  assetIds: Map<string, string>;
  warnings: string[];
}

async function fetchAndUploadImages(
  client: SanityClient,
  urls: string[],
  cache: Map<string, string>,
): Promise<ImageUploadOutcome> {
  const assetIds = new Map<string, string>();
  const warnings: string[] = [];
  const pending = [...new Set(urls)];

  const uploadOne = async (url: string): Promise<void> => {
    const cached = cache.get(url);
    if (cached) {
      assetIds.set(url, cached);
      return;
    }
    if (isBlockedImageHost(url)) {
      warnings.push(`Image "${url}": that address is not allowed — skipped.`);
      return;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PerfectImprintsImport/1.0)' },
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        warnings.push(`Image "${url}" could not be downloaded (HTTP ${res.status}) — skipped.`);
        return;
      }
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
        warnings.push(`Image "${url}" is not an image (${contentType.split(';')[0]}) — skipped.`);
        return;
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0) {
        warnings.push(`Image "${url}" was empty — skipped.`);
        return;
      }
      if (bytes.length > MAX_IMAGE_BYTES) {
        warnings.push(`Image "${url}" is larger than 10 MB — skipped.`);
        return;
      }
      // Sanity dedupes asset uploads by content hash, so re-imports of the same
      // URL never pile up duplicate assets.
      const asset = await client.assets.upload('image', bytes, { filename: filenameFromUrl(url) });
      assetIds.set(url, asset._id);
      cache.set(url, asset._id);
    } catch (e) {
      const reason = e instanceof Error && e.name === 'AbortError' ? 'timed out' : 'failed to download';
      warnings.push(`Image "${url}" ${reason} — skipped.`);
    }
  };

  // Bounded concurrency so one slow host can't stall the whole request.
  let cursor = 0;
  const workers = Array.from({ length: Math.min(IMAGE_CONCURRENCY, pending.length) }, async () => {
    while (cursor < pending.length) {
      const url = pending[cursor];
      cursor += 1;
      await uploadOne(url);
    }
  });
  await Promise.all(workers);

  return { assetIds, warnings };
}

// ── Upsert ────────────────────────────────────────────────────────────────────

type SanityDocShape = Record<string, unknown> & { _id: string; _type: string };

async function upsertDraft(
  client: SanityClient,
  row: ParsedRow,
  existing: ExistingDocs | undefined,
  setFields: Record<string, unknown>,
): Promise<'created' | 'updated'> {
  const baseId = existing?.publishedId ?? existing?.draftId?.replace(/^drafts\./, '') ?? `productPage-${row.slug}`;
  const draftId = `drafts.${baseId}`;
  const isNew = !existing?.publishedId && !existing?.draftId;

  if (!existing?.draftId) {
    if (existing?.publishedId) {
      // Published but no draft yet → start the draft as a copy of the published
      // doc, so the update only changes the imported columns.
      const published = (await client.getDocument(existing.publishedId)) as SanityDocShape | undefined;
      if (published) {
        const { _rev: _r, _createdAt: _c, _updatedAt: _u, ...body } = published as SanityDocShape & {
          _rev?: string;
          _createdAt?: string;
          _updatedAt?: string;
        };
        await client.createIfNotExists({ ...body, _id: draftId, _type: 'productPage' });
      } else {
        await client.createIfNotExists({
          _id: draftId,
          _type: 'productPage',
          slug: { _type: 'slug', current: row.slug },
        });
      }
    } else {
      await client.createIfNotExists({
        _id: draftId,
        _type: 'productPage',
        slug: { _type: 'slug', current: row.slug },
      });
    }
  }

  await client.patch(draftId).set(setFields).commit();
  return isNew ? 'created' : 'updated';
}

// ── Request plumbing ──────────────────────────────────────────────────────────

interface PreviewRow {
  row: number;
  title: string;
  slug: string;
  plan: 'create' | 'update' | 'error';
  errors: string[];
  warnings: string[];
}

interface ApplyResult {
  row: number;
  title: string;
  slug: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  messages: string[];
}

async function readUpload(form: FormData): Promise<{ bytes: Uint8Array } | { error: string }> {
  const file = form.get('file');
  if (!(file instanceof File)) return { error: 'No file was uploaded.' };
  if (file.size > MAX_FILE_BYTES) {
    return { error: 'The file is larger than 4 MB. Remove unused rows/columns and try again.' };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) return { error: 'The uploaded file is empty.' };
  return { bytes };
}

export async function POST(request: Request) {
  const auth = await verifyStudioNonce(request, { authDocId: AUTH_DOC_ID, headerName: NONCE_HEADER });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized.' }, { status: auth.status });
  }
  const client = serverSanityClient();
  if (!client) {
    return NextResponse.json(
      { error: 'Server is missing SANITY_API_TOKEN / Sanity project config.' },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a file upload (multipart form).' }, { status: 400 });
  }

  const action = String(form.get('action') || '');
  if (action !== 'preview' && action !== 'apply') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const upload = await readUpload(form);
  if ('error' in upload) return NextResponse.json({ error: upload.error }, { status: 400 });

  const parsed = parseProductSheet(upload.bytes);
  if (!parsed.ok) {
    return NextResponse.json({
      ok: false,
      fileErrors: parsed.fileErrors,
      unknownColumns: parsed.unknownColumns,
      rows: [],
    });
  }

  const knownCategorySlugs = await loadKnownCategorySlugs(client);
  for (const row of parsed.rows) addCategorySlugWarnings(row, knownCategorySlugs);

  const validSlugs = parsed.rows.filter((r) => r.errors.length === 0 && r.slug).map((r) => r.slug);
  const existingBySlug = await lookupExistingBySlug(client, validSlugs);

  // ── Preview ─────────────────────────────────────────────────────────────────
  if (action === 'preview') {
    const rows: PreviewRow[] = parsed.rows.map((row) => ({
      row: row.rowNumber,
      title: row.title,
      slug: row.slug,
      plan: row.errors.length > 0 ? 'error' : existingBySlug.has(row.slug) ? 'update' : 'create',
      errors: row.errors,
      warnings: row.warnings,
    }));
    const counts = {
      create: rows.filter((r) => r.plan === 'create').length,
      update: rows.filter((r) => r.plan === 'update').length,
      error: rows.filter((r) => r.plan === 'error').length,
    };
    return NextResponse.json({
      ok: true,
      fileErrors: [],
      unknownColumns: parsed.unknownColumns,
      rows,
      counts,
    });
  }

  // ── Apply ───────────────────────────────────────────────────────────────────
  // The panel sends the spreadsheet row numbers to apply in this batch (it
  // chunks the import so each request stays comfortably fast).
  const rowFilterRaw = String(form.get('rows') || '');
  const rowFilter = new Set(
    rowFilterRaw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
  const selected = rowFilter.size > 0 ? parsed.rows.filter((r) => rowFilter.has(r.rowNumber)) : parsed.rows;

  const results: ApplyResult[] = [];
  const assetCache = new Map<string, string>(); // URL → asset id, shared across the batch

  for (const row of selected) {
    if (row.errors.length > 0 || !row.slug) {
      results.push({
        row: row.rowNumber,
        title: row.title,
        slug: row.slug,
        status: 'skipped',
        messages: row.errors.length > 0 ? row.errors : ['No usable web address (slug).'],
      });
      continue;
    }
    try {
      const imageUrls = collectRowImageUrls(row);
      const { assetIds, warnings: imageWarnings } = await fetchAndUploadImages(client, imageUrls, assetCache);
      const setFields = buildProductPageSetFields(row, assetIds);
      const status = await upsertDraft(client, row, existingBySlug.get(row.slug), setFields);
      results.push({
        row: row.rowNumber,
        title: row.title,
        slug: row.slug,
        status,
        messages: [...row.warnings, ...imageWarnings],
      });
    } catch (e) {
      results.push({
        row: row.rowNumber,
        title: row.title,
        slug: row.slug,
        status: 'failed',
        messages: [e instanceof Error ? e.message : 'Unexpected error while saving this row.'],
      });
    }
  }

  const summary = {
    created: results.filter((r) => r.status === 'created').length,
    updated: results.filter((r) => r.status === 'updated').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };
  return NextResponse.json({ ok: true, results, summary });
}
