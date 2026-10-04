// Gemini generate-blog-image route (AUTO-202): the header image for ONE blog
// post, for the Studio buttons. The tenth generate-* route, and the second
// that uses Gemini (after generate-portfolio, PORT-170). It runs the same
// header image chain the server-side draft creator runs for a topic
// (lib/blog-automation/resolve-header-image.ts: ai -> library -> product ->
// none, starting where the source says), uploads the generated picture as a
// Sanity image asset, and RETURNS the value for the Studio action to patch
// onto the draft. It writes NO content document itself: which field is set,
// and whether an image Patrick uploaded is kept, is decided in the browser by
// the action, the PORT-170 / AUTO-116 rule, and tested there.
//
// POST { title, keywords?: string[], skus?: string[], rootSlugs?: string[],
//        slug?: string, source: 'ai' | 'default', postSource?: string }
//   → { ok: true, outcome, summary }
//
//   source 'ai'      the "Generate header image" button: the chain starts at
//                    the AI regardless of any setting (Patrick pressed it);
//   source 'default' Generate / Regenerate Blog with AI: the chain starts at
//                    the post's own setting, else the site setting.
//
// The browser sends the post's TITLE, its topic keywords, the SKUs of its
// product strips and its related category slugs, and nothing else matters:
// a SKU only picks a reference photo out of the catalog on disk (no
// client-supplied URL is ever fetched), a root slug only picks a library
// picture, and the picture goes nowhere but Patrick's own dataset. It is
// sent rather than read from the draft because the action calls this right
// after patching a freshly generated body, before Sanity has necessarily
// stored it; what the action has in hand is the truth of that moment.
//
// Order of operations, each of which stops the request before the next:
//   1. FIX-850 nonce guard (first-party Studio session only), before the body
//      is read and before any key is checked.
//   2. Body validation.
//   3. For source 'ai' only: GOOGLE_GEMINI_API_KEY and the write client (a
//      clear 500 for Ali, no call made). For 'default' the chain itself
//      notes a missing key and falls to the next source, as the creator does.
//   4. The chain, with the daily cap reserved inside it BEFORE anything is
//      sent to Google (lib/blog-automation/header-image-usage.ts, a counter in
//      Sanity, never process memory).
//
// `maxDuration` 90: the chain's own budget is 70 s (HEADER_IMAGE_BUDGET_MS),
// the settings read and the catalog read are under a second.

import { NextResponse } from 'next/server';
import { verifyStudioNonce, serverSanityClient } from '@/lib/sanity/studio-nonce-auth';
import { GENERATE_AUTH_DOC_ID, GENERATE_NONCE_HEADER } from '@/lib/sanity/generate-auth';
import { getSiteSettings } from '@/lib/sanity/queries/global-settings';
import { resolveProductsBySku } from '@/lib/categories';
import { resolveCategoryForKeywords } from '@/lib/ai/related-products';
import { siteWideHiddenSkus } from '@/lib/products/site-wide-hidden';
import { normalizeSku } from '@/lib/products/hidden-skus';
import { isCleanRelatedCategorySlug } from '@/lib/blog/related-category-slugs';
import { effectiveHeaderImageSource, headerImageSummary, type HeaderImageSource } from '@/lib/blog-automation/header-image';
import { defaultHeaderImageDeps, noClientHeaderImageDeps, resolveHeaderImage } from '@/lib/blog-automation/resolve-header-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

interface GenBody {
  title?: unknown;
  keywords?: unknown;
  skus?: unknown;
  rootSlugs?: unknown;
  slug?: unknown;
  source?: unknown;
  postSource?: unknown;
}

const MAX_LIST = 40;

function strings(value: unknown, maxLen: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen)
        .map((v) => v.trim())
        .slice(0, MAX_LIST)
    : [];
}

export async function POST(request: Request) {
  // FIX-850: first-party Studio session only (the Site Refresh / Bulk Upload
  // nonce scheme). Rejects before any body parsing, key check or Gemini call.
  const auth = await verifyStudioNonce(request, {
    authDocId: GENERATE_AUTH_DOC_ID,
    headerName: GENERATE_NONCE_HEADER,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized.' }, { status: auth.status });
  }

  let body: GenBody;
  try {
    body = (await request.json()) as GenBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'Add a title first: the image is made from the title and the product photos.' }, { status: 400 });
  }
  const requested: 'ai' | 'default' = body.source === 'ai' ? 'ai' : 'default';
  const keywords = strings(body.keywords, 200);
  const skus = strings(body.skus, 40);
  const rootSlugs = strings(body.rootSlugs, 120).filter((s) => isCleanRelatedCategorySlug(s));
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';

  if (requested === 'ai' && !process.env.GOOGLE_GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error:
          'The AI image service is not set up on this site yet (GOOGLE_GEMINI_API_KEY is missing on the server). Ask Ali to add it. You can upload a header image yourself meanwhile.',
      },
      { status: 500 },
    );
  }
  const sanity = serverSanityClient();
  if (requested === 'ai' && !sanity) {
    return NextResponse.json(
      { error: 'Server is missing SANITY_API_TOKEN / Sanity project config, so the daily limit cannot be counted and the picture could not be saved.' },
      { status: 500 },
    );
  }

  try {
    const settings = (await getSiteSettings()).blogAutomation;
    const source: HeaderImageSource = requested === 'ai' ? 'ai' : effectiveHeaderImageSource(body.postSource, settings.headerImageSource);
    // The site-wide hide list (HIDE-100 / HIDE-110): a product Patrick has
    // hidden everywhere must not become a reference photo or the header.
    const hiddenSet = new Set((await siteWideHiddenSkus()).map(normalizeSku));
    const products = resolveProductsBySku(skus)
      .filter((p) => !hiddenSet.has(normalizeSku(p.sku)))
      .map((p) => ({ sku: p.sku, name: p.name, imageUrl: p.imageUrl ?? null }));
    const topic = keywords[0] ?? title;
    const libraryRoots = [...rootSlugs];
    const resolved = resolveCategoryForKeywords(keywords.length > 0 ? keywords.join(' ') : title);
    if (resolved && !libraryRoots.includes(resolved)) libraryRoots.push(resolved);

    const outcome = await resolveHeaderImage(
      {
        source,
        title,
        topic,
        products,
        rootSlugs: libraryRoots,
        library: settings.headerImageLibrary ?? [],
        slug: slug || title,
        clientMissing: !sanity,
        log: (line) => console.info(`[generate-blog-image] ${line}`),
      },
      sanity ? defaultHeaderImageDeps(sanity) : noClientHeaderImageDeps(),
    );
    return NextResponse.json({ ok: true, source, outcome, summary: headerImageSummary(outcome) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The header image could not be made.';
    console.error(`[generate-blog-image] failed: ${message}`);
    return NextResponse.json({ error: `${message} Nothing on the post was changed.` }, { status: 502 });
  }
}
