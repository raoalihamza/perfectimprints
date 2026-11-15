// generate-blog-image route (AUTO-202; the engine behind it is AUTO-220's):
// the header image for ONE blog post, for the Studio buttons. The tenth
// generate-* route. It runs the same header image chain the server-side draft
// creator runs for a topic (lib/blog-automation/resolve-header-image.ts: ai ->
// library -> product -> none, starting where the source says), uploads the
// generated picture as a Sanity image asset, and RETURNS the value for the
// Studio action to patch onto the draft. It writes NO content document
// itself: which field is set, and whether an image Patrick uploaded is kept,
// is decided in the browser by the action, the PORT-170 / AUTO-116 rule, and
// tested there.
//
// POST { title, keywords?: string[], skus?: string[], rootSlugs?: string[],
//        slug?: string, source, postSource?: string, previousRung?: number,
//        instruction?: string, currentRef?: string, unmarkedRef?: string,
//        editCount?: number }
//   → { ok: true, outcome, summary, what, why }
//
//   source 'ai'           the "Generate header image" button: the chain
//                         starts at the AI regardless of any setting (Patrick
//                         pressed it), on the rung of the ladder AFTER the one
//                         the post's picture was drawn on (`previousRung`);
//   source 'default'      Generate / Regenerate Blog with AI: the chain starts
//                         at the post's own setting, else the site setting;
//   source 'instruction'  AUTO-220, "Make a new picture my way": a new
//                         picture from Patrick's own words (`instruction`) in
//                         place of the ladder's block, with the same product
//                         photos; the AI or nothing;
//   source 'edit'         AUTO-220, "Change this picture": the post's current
//                         generated picture (its copy without the P! mark,
//                         `unmarkedRef`) is sent back with his words. BOTH
//                         that copy and the picture on the post (`currentRef`)
//                         must carry the site's own upload marker
//                         (lib/blog-automation/header-edit-base.ts), so a
//                         picture Patrick uploaded is never changed and never
//                         replaced, whatever the browser sent.
//
// The title gate, the brand read-back, the P! mark and the daily cap run on
// every one of the four; his instruction does not switch a guard off.
//
// The browser sends the post's TITLE, its topic keywords, the SKUs of its
// product strips and its related category slugs, and nothing else matters:
// a SKU only picks a reference photo out of the catalog on disk (no
// client-supplied URL is ever fetched), a root slug only picks a library
// picture, an asset id only names a picture already in Patrick's dataset, and
// the picture goes nowhere but that dataset. It is sent rather than read from
// the draft because the action calls this right after patching a freshly
// generated body, before Sanity has necessarily stored it; what the action
// has in hand is the truth of that moment.
//
// Order of operations, each of which stops the request before the next:
//   1. FIX-850 nonce guard (first-party Studio session only), before the body
//      is read and before any key is checked.
//   2. Body validation.
//   3. For every source but 'default': the keys and the write client (a clear
//      500 for Ali, no call made). For 'default' the chain itself notes a
//      missing key and falls to the next source, as the creator does.
//   4. The chain, with the daily cap reserved inside it BEFORE anything is
//      sent to the image service (a counter in Sanity, never process memory).
//
// `maxDuration` 120: the chain's own budget is 100 s
// (HEADER_IMAGE_BUDGET_MS; the arithmetic is on that constant), the settings
// read, the catalog read and the category resolve are a few seconds.

import { NextResponse } from 'next/server';
import { verifyStudioNonce, serverSanityClient } from '@/lib/sanity/studio-nonce-auth';
import { GENERATE_AUTH_DOC_ID, GENERATE_NONCE_HEADER } from '@/lib/sanity/generate-auth';
import { getSiteSettings } from '@/lib/sanity/queries/global-settings';
import { resolveProductsBySku } from '@/lib/categories';
import { resolveCategoryForKeywords } from '@/lib/ai/related-products';
import { siteWideHiddenSkus } from '@/lib/products/site-wide-hidden';
import { normalizeSku } from '@/lib/products/hidden-skus';
import { isCleanRelatedCategorySlug } from '@/lib/blog/related-category-slugs';
import { effectiveHeaderImageSource, headerImageSummary, headerImageWhat, headerImageWhy, type HeaderImageSource } from '@/lib/blog-automation/header-image';
import { defaultHeaderImageDeps, noClientHeaderImageDeps, resolveHeaderImage, type HeaderImageMode, type PictureInput } from '@/lib/blog-automation/resolve-header-image';
import { cleanInstruction } from '@/lib/blog-automation/header-brief';
import { loadHeaderEditBase } from '@/lib/blog-automation/header-edit-base';
import { openAiImageConfigured } from '@/lib/ai/openai-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface GenBody {
  title?: unknown;
  keywords?: unknown;
  skus?: unknown;
  rootSlugs?: unknown;
  slug?: unknown;
  source?: unknown;
  postSource?: unknown;
  /** AUTO-220: the rung of the ladder the post's current picture was drawn on, so this one takes the next. */
  previousRung?: unknown;
  /** AUTO-220, sources 'instruction' and 'edit': Patrick's own words. */
  instruction?: unknown;
  /** AUTO-220, source 'edit': the asset on the post now, and its copy without the P! mark. */
  currentRef?: unknown;
  unmarkedRef?: unknown;
  /** AUTO-220, source 'edit': how many changes in a row the current picture carries. */
  editCount?: unknown;
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

type Requested = 'ai' | 'default' | 'instruction' | 'edit';

export async function POST(request: Request) {
  // FIX-850: first-party Studio session only (the Site Refresh / Bulk Upload
  // nonce scheme). Rejects before any body parsing, key check or model call.
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
  // AUTO-220: the "Redraw title on header image" button is gone (the image
  // model draws the title, so a changed title means a new picture). A Studio
  // tab left open from before the deploy can still send its request; it is
  // refused here rather than read as anything else, so an old button can
  // never make or replace a picture.
  if (body.source === 'retitle') {
    return NextResponse.json(
      { error: 'This button has been retired: the title is now part of the picture. Reload the Studio and press Generate another header image for a picture with the current title. Nothing on the post was changed.' },
      { status: 400 },
    );
  }
  const keywords = strings(body.keywords, 200);
  const requested: Requested = body.source === 'ai' || body.source === 'instruction' || body.source === 'edit' ? body.source : 'default';
  const skus = strings(body.skus, 40);
  const rootSlugs = strings(body.rootSlugs, 120).filter((s) => isCleanRelatedCategorySlug(s));
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const instruction = cleanInstruction(body.instruction);

  if ((requested === 'instruction' || requested === 'edit') && !instruction) {
    return NextResponse.json({ error: 'Type your instruction in the box first. Nothing on the post was changed.' }, { status: 400 });
  }
  if (requested !== 'default' && !process.env.GOOGLE_GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error:
          'The picture checker is not set up on this site yet (GOOGLE_GEMINI_API_KEY is missing on the server), and no picture is used unread. Ask Ali to add it. You can upload a header image yourself meanwhile.',
      },
      { status: 500 },
    );
  }
  if ((requested === 'instruction' || requested === 'edit') && !openAiImageConfigured()) {
    return NextResponse.json(
      {
        error:
          'The AI image service is not set up on this site yet (OPENAI_API_KEY is missing on the server). Ask Ali to add it. You can upload a header image yourself meanwhile.',
      },
      { status: 500 },
    );
  }
  const sanity = serverSanityClient();
  if (requested !== 'default' && !sanity) {
    return NextResponse.json(
      { error: 'Server is missing SANITY_API_TOKEN / Sanity project config, so the daily limit cannot be counted and the picture could not be saved.' },
      { status: 500 },
    );
  }

  try {
    // "Change this picture": the copy of the post's generated picture without
    // the mark, and only when the picture on the post is one the site made.
    let editBase: PictureInput | null = null;
    if (requested === 'edit') {
      const base = await loadHeaderEditBase(sanity!, { currentRef: body.currentRef, unmarkedRef: body.unmarkedRef });
      if (base.ok === false) {
        return NextResponse.json({ error: `${base.reason.charAt(0).toUpperCase()}${base.reason.slice(1)}. Nothing on the post was changed.` }, { status: 409 });
      }
      editBase = base.picture;
    }

    const settings = (await getSiteSettings()).blogAutomation;
    const source: HeaderImageSource = requested === 'default' ? effectiveHeaderImageSource(body.postSource, settings.headerImageSource) : 'ai';
    const mode: HeaderImageMode = requested === 'instruction' ? 'instruction' : requested === 'edit' ? 'edit' : 'ladder';
    // The site-wide hide list (HIDE-100 / HIDE-110): a product Patrick has
    // hidden everywhere must not become a reference photo or the header.
    const hiddenSet = new Set((await siteWideHiddenSkus()).map(normalizeSku));
    const products = resolveProductsBySku(skus)
      .filter((p) => !hiddenSet.has(normalizeSku(p.sku)))
      .map((p) => ({ sku: p.sku, name: p.name, imageUrl: p.imageUrl ?? null, brand: p.brand ?? null }));
    const topic = keywords[0] ?? title;
    const libraryRoots = [...rootSlugs];
    const resolved = await resolveCategoryForKeywords(keywords.length > 0 ? keywords.join(' ') : title);
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
        previousRung: body.previousRung,
        mode,
        instruction,
        editBase,
        editCount: body.editCount,
      },
      sanity ? defaultHeaderImageDeps(sanity) : noClientHeaderImageDeps(),
    );
    // `summary` is the whole line; `what` and `why` are its two halves, so a
    // dialog that words the first half itself can print the reasons once.
    return NextResponse.json({ ok: true, source, mode, outcome, summary: headerImageSummary(outcome), what: headerImageWhat(outcome), why: headerImageWhy(outcome) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The header image could not be made.';
    console.error(`[generate-blog-image] failed: ${message}`);
    return NextResponse.json({ error: `${message} Nothing on the post was changed.` }, { status: 502 });
  }
}
