// Sanity webhook handler — revalidates affected routes on publish.
//
// Handles: layout singletons (mega menu / global settings), the home page,
// section `page` docs (/services/<slug>), and all search-affecting content
// (blogs, videos, custom categories, custom products) — the latter both bust
// the live search-delta cache tag and revalidate the pages they render on.
// Any other type is a no-op.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { SEARCH_INDEX_ROUTE } from '@/lib/search/constants';
import {
  BRANDS_TAG,
  CATEGORY_CONTROL_TAG,
  FAQS_TAG,
  MEGA_MENU_TAG,
  PAGES_TAG,
  RELATED_BLOGS_TAG,
  SETTINGS_TAG,
  VIDEOS_TAG,
  categoryTag,
  customSchemaTag,
  pageTag,
} from '@/lib/sanity/cache-tags';

/**
 * `revalidateTag` that skips an empty tag. The slug/path tag builders
 * (`categoryTag`/`pageTag`/`customSchemaTag`) sanitize their input and return ''
 * for an empty/all-invalid value, so guard against `revalidateTag('')`. Constant
 * tags (SETTINGS_TAG, …) are always non-empty and don't need this.
 */
function bustTag(tag: string): void {
  if (tag) revalidateTag(tag, 'max');
}

// Types whose content is rendered inside the shared root layout (Header / Footer
// / global CTA). A change to any of them must refresh every page's chrome.
const LAYOUT_TYPES = new Set(['megaMenu', 'globalSettings']);

// Types that feed the LIVE search delta (app/api/search-index). Publishing any
// of them must bust the search cache tag so the new/edited item is searchable
// within seconds (the route otherwise self-refreshes weekly).
const SEARCH_TYPES = new Set([
  'blogPost',
  'video',
  'customProduct',
  'customCategory',
  'curatedCategory',
  'faq',
]);

/** Page routes to revalidate for a given search-affecting type. */
function searchTypePaths(type: string, slug: string | undefined): string[] {
  switch (type) {
    case 'video':
      return slug ? ['/videos', `/videos/${slug}`] : ['/videos'];
    case 'blogPost':
      return slug ? ['/blog', `/blog/${slug}`] : ['/blog'];
    // Custom products are merged into all three aggregators (which are ISR), so
    // refresh each. The parent-category page can't be resolved from the webhook
    // payload (it's an unresolved reference) — it revalidates on its next visit.
    case 'customProduct':
      return ['/deals', '/new-products', '/rush-products'];
    case 'customCategory':
    case 'curatedCategory':
      return slug ? [`/cat/${slug}`] : [];
    // FAQs render on the single /faq library page (no per-FAQ route).
    case 'faq':
      return ['/faq'];
    default:
      return [];
  }
}

/**
 * Verifies a Sanity webhook signature.
 * Header format: `t=<timestamp>,v1=<base64url HMAC-SHA256 of "<timestamp>.<body>">`.
 */
function isValidSignature(body: string, header: string, secret: string): boolean {
  const parts = new Map<string, string>();
  for (const segment of header.split(',')) {
    const i = segment.indexOf('=');
    if (i > 0) parts.set(segment.slice(0, i).trim(), segment.slice(i + 1).trim());
  }
  const timestamp = parts.get('t');
  const signature = parts.get('v1');
  if (!timestamp || !signature) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.SANITY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 500 });
  }

  const signature = request.headers.get('sanity-webhook-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 401 });
  }

  // Raw body is required for signature verification — read text() before JSON.
  const body = await request.text();
  if (!isValidSignature(body, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let payload: {
    _type?: string;
    slug?: { current?: string };
    categorySlug?: string;
    pageUrl?: string;
    addToCategories?: string[];
    removeFromCategories?: string[];
  } = {};
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const type = payload._type;

  // Layout-level singletons (mega menu, global settings) → revalidate the whole
  // layout so the header/footer refresh across every page. Both reads go through
  // the non-CDN `cachedClient` with a cache tag, so ALSO bust the matching tag:
  // `revalidatePath('/', 'layout')` alone did NOT deterministically refresh these
  // (the old CDN/untagged read stayed stale — e.g. a removed footer link kept
  // rendering). The tag bust is what makes the edit go live in seconds.
  if (type && LAYOUT_TYPES.has(type)) {
    if (type === 'globalSettings') revalidateTag(SETTINGS_TAG, 'max');
    if (type === 'megaMenu') revalidateTag(MEGA_MENU_TAG, 'max');
    revalidatePath('/', 'layout');
    return NextResponse.json({ revalidated: true, scope: 'layout', type });
  }

  // Home page singleton only affects "/".
  if (type === 'homePage') {
    revalidatePath('/');
    return NextResponse.json({ revalidated: true, scope: '/', type });
  }

  // Brands are read through a non-CDN tagged fetch (see lib/brands.ts). A
  // publish/delete (e.g. a `featured` toggle) must bust the tag so the Featured
  // Brands strip + A–Z grid on /brands refresh deterministically, and the
  // affected /brands/<slug> page picks up description/logo edits.
  // NOTE: `brand` must be in the Sanity webhook Filter `_type` list (it was
  // originally excluded) or this never fires — see docs/sanity-webhook-setup.md.
  if (type === 'brand') {
    revalidateTag(BRANDS_TAG, 'max');
    revalidatePath('/brands');
    const slug = payload.slug?.current;
    if (slug) revalidatePath(`/brands/${slug}`);
    return NextResponse.json({ revalidated: true, scope: '/brands', type });
  }

  // Search-affecting Sanity content (blogs, videos, custom categories, custom
  // products) — refresh the live search-delta route AND revalidate the pages
  // those docs render on (videos detail/index, blog detail/index, the three
  // ISR aggregators, category pages). See app/api/search-index/route.ts.
  if (type && SEARCH_TYPES.has(type)) {
    const slug = payload.slug?.current;
    const paths = [SEARCH_INDEX_ROUTE, ...searchTypePaths(type, slug)];
    for (const p of paths) revalidatePath(p);
    // A customCategory publish/unpublish changes which slugs Sanity OWNS — bust
    // its per-slug content tag AND the shared control-set tag so the page flips
    // JSON↔Sanity in seconds (the page path is also revalidated above).
    if (type === 'customCategory') {
      revalidateTag(CATEGORY_CONTROL_TAG, 'max');
      if (slug) bustTag(categoryTag(slug));
    }
    // Blog relatedness on root category pages is a cached read — refresh it.
    if (type === 'blogPost') revalidateTag(RELATED_BLOGS_TAG, 'max');
    // FAQ answers are read through a non-CDN tagged fetch (see getAnsweredFaqs)
    // — bust the tag so /faq + the search delta pick up the edit deterministically.
    if (type === 'faq') revalidateTag(FAQS_TAG, 'max');
    // Videos are read through a non-CDN tagged fetch (see lib/sanity/queries/videos)
    // — bust the tag so /videos + /videos/<slug> + the search delta refresh deterministically.
    if (type === 'video') revalidateTag(VIDEOS_TAG, 'max');
    return NextResponse.json({ revalidated: true, paths, type });
  }

  // Per-category curation override (M5-504 part 1) keyed by the /cat/... slug.
  // The slug may contain slashes (facet overrides), so revalidate /cat/<slug>
  // directly from the categorySlug field.
  if (type === 'categoryOverride') {
    // A new/removed override changes the "edited" set AND that slug's content.
    revalidateTag(CATEGORY_CONTROL_TAG, 'max');
    const categorySlug = payload.categorySlug ?? payload.slug?.current;
    if (categorySlug) {
      bustTag(categoryTag(categorySlug));
      const path = `/cat/${categorySlug}`;
      revalidatePath(path);
      return NextResponse.json({ revalidated: true, scope: path, type });
    }
    return NextResponse.json({ revalidated: false, reason: 'override missing slug', type });
  }

  // Product-side placement (M5-504 Part 2) attaches/detaches a SKU to one or
  // many categories. Revalidate every category it touches so both edit
  // directions go live. (Webhook GROQ projection must include addToCategories
  // and removeFromCategories.)
  if (type === 'productPlacement') {
    // A new/changed placement changes the "edited" set AND each touched slug.
    revalidateTag(CATEGORY_CONTROL_TAG, 'max');
    const slugs = [
      ...(payload.addToCategories ?? []),
      ...(payload.removeFromCategories ?? []),
    ].filter((s): s is string => typeof s === 'string' && s.length > 0);
    const unique = [...new Set(slugs)];
    for (const s of unique) {
      bustTag(categoryTag(s));
      revalidatePath(`/cat/${s}`);
    }
    return NextResponse.json({ revalidated: unique.length > 0, paths: unique.map((s) => `/cat/${s}`), type });
  }

  // Custom structured data (Task C) keyed by an exact page path. On publish or
  // delete, bust that path's customSchema tag and revalidate the page so the
  // injected JSON-LD goes live (or disappears) within seconds. (Webhook GROQ
  // projection must include `pageUrl`.)
  if (type === 'customSchema') {
    const pageUrl = payload.pageUrl;
    if (pageUrl) {
      bustTag(customSchemaTag(pageUrl));
      revalidatePath(pageUrl);
      return NextResponse.json({ revalidated: true, scope: pageUrl, type });
    }
    return NextResponse.json({ revalidated: false, reason: 'customSchema missing pageUrl', type });
  }

  // Generic section-based `page` documents power the Services routes
  // (/services/<slug>, M5-506b), the top-level footer/legal pages (/about,
  // /contact, /sample-policy, …; M5-506), AND arbitrary custom top-level pages
  // (/<slug> via app/[slug], Issue 2). All `page` reads are cache-tagged
  // (PAGES_TAG list-level + page:<slug> content-level), so bust both tags plus
  // the candidate paths + the sitemap (a new/removed slug changes its listing).
  // The payload can't tell Services from top-level, so revalidate both candidate
  // paths — revalidatePath on a route that doesn't exist is a harmless no-op.
  if (type === 'page') {
    revalidateTag(PAGES_TAG, 'max');
    const slug = payload.slug?.current;
    if (slug) {
      bustTag(pageTag(slug));
      const paths = [`/services/${slug}`, `/${slug}`, '/sitemap.xml'];
      for (const p of paths) revalidatePath(p);
      return NextResponse.json({ revalidated: true, paths, type });
    }
    revalidatePath('/sitemap.xml');
    return NextResponse.json({ revalidated: false, reason: 'page missing slug', type });
  }

  // Page-level document revalidation (blog/category/etc.) is tracked in M1-104.
  return NextResponse.json({ revalidated: false, type: type ?? null });
}
