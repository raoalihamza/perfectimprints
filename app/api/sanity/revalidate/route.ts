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
import { cachedClient } from '@/lib/sanity/client';
import { SEARCH_INDEX_ROUTE } from '@/lib/search/constants';
import {
  BLOG_LIST_TAG,
  BRANDS_TAG,
  CATALOG_PAGES_TAG,
  CATEGORY_CONTROL_TAG,
  CUSTOM_CATEGORIES_TAG,
  CUSTOM_PRODUCTS_TAG,
  FAQS_TAG,
  HOME_TAG,
  FORMS_TAG,
  LANDING_TAG,
  MEGA_MENU_TAG,
  PAGES_TAG,
  PORTFOLIO_TAG,
  PRODUCT_PAGES_TAG,
  QUOTES_TAG,
  RELATED_BLOGS_TAG,
  SETTINGS_TAG,
  VIDEOS_TAG,
  blogPostTag,
  catalogPageTag,
  categoryTag,
  customSchemaTag,
  formTag,
  landingTag,
  pageTag,
  portfolioCategoryTag,
  portfolioItemTag,
  productPageTag,
  quoteTag,
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

/**
 * Category slugs of every `categoryOverride` whose `addedProducts` references
 * the published doc (P2-CP-004 batch 3 — productPage/customProduct attached to
 * category grids). Needed because the embedding `/cat/<slug>` read is tagged
 * `cat:<slug>` (via getCategoryOverride), NOT by the product's own tags — so an
 * edit to the ATTACHED product would otherwise stay stale on the category page
 * until some unrelated event busted it.
 *
 * Lookup order: `references($id)` when the webhook projection includes `_id`
 * (robust — matches even a dangling ref after delete/unpublish); else a
 * slug-deref fallback (`$slug in addedProducts[]->slug.current`, works for
 * productPage on the CURRENT projection, which has no `_id`). Uncached read
 * (`no-store`) so it always sees the live reference graph. Best-effort: a
 * failed lookup returns [] and the rest of the revalidation proceeds.
 */
async function findEmbeddingCategorySlugs(
  id: string | undefined,
  slug: string | undefined,
): Promise<string[]> {
  try {
    let slugs: (string | null)[] | null = null;
    if (id) {
      slugs = await cachedClient.fetch<(string | null)[]>(
        `*[_type == "categoryOverride" && references($id)].categorySlug`,
        { id },
        { cache: 'no-store' },
      );
    } else if (slug) {
      slugs = await cachedClient.fetch<(string | null)[]>(
        `*[_type == "categoryOverride" && $slug in addedProducts[]->slug.current].categorySlug`,
        { slug },
        { cache: 'no-store' },
      );
    }
    return [...new Set((slugs ?? []).filter((s): s is string => Boolean(s)))];
  } catch {
    return [];
  }
}

/** Bust + revalidate every /cat/<slug> that embeds the doc via an override. */
function bustEmbeddingCategories(slugs: string[]): string[] {
  const paths: string[] = [];
  for (const s of slugs) {
    bustTag(categoryTag(s));
    const path = `/cat/${s}`;
    revalidatePath(path);
    paths.push(path);
  }
  return paths;
}

/**
 * Content docs whose PRODUCT STRIP embeds the published productPage /
 * customProduct (2026-07-11 — the strips on blog posts, page-builder pages,
 * landing pages, and videos accept doc references alongside SKU entries; the
 * P2-CAT-001 catalogPage's `addedProducts` gated-grid references count too). The
 * referenced doc's card data is dereferenced INSIDE each embedder's own read
 * (blog: the CDN read behind /blog/<slug>; page: PAGES_TAG/page:<slug>;
 * landing: LANDING_TAG/landing:<slug>; video: VIDEOS_TAG), none of which the
 * product's own tags cover — so an edit to the referenced product would
 * otherwise stay stale on those pages forever (they are `revalidate:false`).
 *
 * Lookup order mirrors findEmbeddingCategorySlugs: `references($id)` when the
 * webhook projection includes `_id` (robust, matches dangling refs after a
 * delete); else a slug-deref fallback over the three strip field shapes
 * (works for productPage, which has a slug — customProduct needs `_id`).
 * Uncached read; best-effort (failure returns [] and the rest proceeds).
 */
async function findEmbeddingContentDocs(
  id: string | undefined,
  slug: string | undefined,
): Promise<{ _type: string; slug: string }[]> {
  try {
    let docs: { _type?: string; slug?: string | null }[] | null = null;
    // PORT-100: `productPage` joined the embedder list because the Portfolio
    // Gallery block (PORT-120) will sit on product pages too, and a
    // portfolioItem / portfolioCategory publish must reach them. For the
    // existing productPage / customProduct callers this adds product pages
    // whose Related Products reference the edited doc, which their own
    // PRODUCT_PAGES_TAG bust already covers, so it is redundant there and
    // harmless (one extra tag bust + path revalidation per embedder).
    if (id) {
      docs = await cachedClient.fetch<{ _type?: string; slug?: string | null }[]>(
        `*[_type in ["blogPost", "page", "landingPage", "video", "catalogPage", "productPage"] && references($id)]{ _type, "slug": slug.current }`,
        { id },
        { cache: 'no-store' },
      );
    } else if (slug) {
      docs = await cachedClient.fetch<{ _type?: string; slug?: string | null }[]>(
        `*[_type in ["blogPost", "page", "landingPage", "video", "catalogPage", "productPage"] && (
            $slug in body[].products[]->slug.current ||
            $slug in sections[].products[]->slug.current ||
            $slug in relatedProducts[]->slug.current ||
            $slug in addedProducts[]->slug.current
          )]{ _type, "slug": slug.current }`,
        { slug },
        { cache: 'no-store' },
      );
    }
    const out: { _type: string; slug: string }[] = [];
    const seen = new Set<string>();
    for (const d of docs ?? []) {
      if (!d._type || !d.slug) continue;
      const key = `${d._type}:${d.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ _type: d._type, slug: d.slug });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Bust + revalidate every blog post / page / landing page / video whose
 * product strip embeds the published doc. Each type uses ITS OWN freshness
 * mechanism: blog = path-only (the detail read is the CDN client, same model
 * as a blogPost publish itself); video = VIDEOS_TAG (+ paths); page/landing =
 * their per-slug tags (+ both candidate paths for `page`, which can render at
 * /services/<slug> or /<slug> — revalidating a non-existent one is a no-op).
 */
function bustEmbeddingContentDocs(docs: { _type: string; slug: string }[]): string[] {
  const paths = new Set<string>();
  for (const d of docs) {
    switch (d._type) {
      case 'blogPost':
        paths.add(`/blog/${d.slug}`);
        break;
      case 'video':
        revalidateTag(VIDEOS_TAG, 'max');
        paths.add('/videos');
        paths.add(`/videos/${d.slug}`);
        break;
      case 'landingPage':
        bustTag(landingTag(d.slug));
        paths.add(`/${d.slug}`);
        break;
      case 'page':
        bustTag(pageTag(d.slug));
        paths.add(`/services/${d.slug}`);
        paths.add(`/${d.slug}`);
        break;
      // A catalogPage derefs the referenced product inside its own
      // catalog-page:<slug>-tagged read (`addedProducts`, P2-CAT-001) — bust
      // it + both routes (the landing page and the gated catalog grid).
      case 'catalogPage':
        bustTag(catalogPageTag(d.slug));
        paths.add(`/shop-by-theme/${d.slug}`);
        paths.add(`/shop-by-theme/${d.slug}/catalog`);
        break;
      // A productPage embedding a Portfolio Gallery (PORT-120) or a Related
      // Products reference reads it inside its own productPage:<slug>-tagged
      // fetch; bust that tag + its route (PORT-100).
      case 'productPage':
        bustTag(productPageTag(d.slug));
        paths.add(`/products/${d.slug}`);
        break;
    }
  }
  const unique = [...paths];
  for (const p of unique) revalidatePath(p);
  return unique;
}

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
    _id?: string;
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
    if (type === 'globalSettings') {
      revalidateTag(SETTINGS_TAG, 'max');
      // Q-170 improvement 2: globalSettings now carries the site-search hide
      // list, which is served to the browser by the live search-delta route.
      // That route is ISR with a ONE WEEK floor, and this branch used to return
      // without touching it, so hiding a SKU would have looked like it did
      // nothing in the search box for up to a week. `SETTINGS_TAG` alone does
      // not cover it: the tag busts the settings FETCH, not the cached response
      // of a route that happens to call it.
      revalidatePath(SEARCH_INDEX_ROUTE);
    }
    if (type === 'megaMenu') revalidateTag(MEGA_MENU_TAG, 'max');
    revalidatePath('/', 'layout');
    return NextResponse.json({ revalidated: true, scope: 'layout', type });
  }

  // Home page singleton only affects "/". Q-175: bust HOME_TAG too. `/` is
  // `force-static` with no `revalidate`, so it never self-refreshes and this
  // path revalidation was rebuilding it straight from a stale CDN read that
  // then froze - the blog-detail bug on the page Patrick edits most. The read is
  // now non-CDN + tagged, and without this bust the rebuild would just reuse the
  // tag-cached copy and the edit would still never appear.
  if (type === 'homePage') {
    revalidateTag(HOME_TAG, 'max');
    revalidatePath('/');
    return NextResponse.json({ revalidated: true, scope: '/', type });
  }

  // Blog categories (Q-175). Previously handled NOWHERE: `blogCategory` was in
  // no branch and in no type set, so `/blog/cat/<slug>` (which is
  // `revalidate = false`) was frozen from generation until the next deploy no
  // matter what anyone published. Busting BLOG_LIST_TAG reaches every page that
  // read a blog list - the category page, its `/page/N` variants which are not
  // prebuilt and which no path revalidation ever named, the blog index, the
  // home preview, the sitemap and the search delta - without the webhook having
  // to enumerate paths it cannot know.
  // NOTE: `blogCategory` must be in the Sanity webhook Filter `_type` list or
  // this never fires. See docs/sanity-webhook-setup.md.
  if (type === 'blogCategory') {
    revalidateTag(BLOG_LIST_TAG, 'max');
    const slug = payload.slug?.current;
    const paths = ['/blog', '/sitemap.xml'];
    if (slug) paths.push(`/blog/cat/${slug}`);
    for (const p of paths) revalidatePath(p);
    return NextResponse.json({ revalidated: true, scope: '/blog/cat', type });
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
    // Q-175: the Sanity-authored category LIST that feeds the search delta.
    // Its own tag, deliberately not CATEGORY_CONTROL_TAG (which every /cat page
    // reads) - widening what busts that would be a real cost on 22,180 pages.
    if (type === 'customCategory' || type === 'curatedCategory') {
      revalidateTag(CUSTOM_CATEGORIES_TAG, 'max');
    }
    // Blog relatedness on root category pages is a cached read — refresh it.
    // The post's OWN content is a per-slug tagged read (2026-08-05): without
    // this bust, `revalidatePath('/blog/<slug>')` above would rebuild the page
    // from the tag-cached copy and the edit would never appear. `/blog/<slug>`
    // is `revalidate = false`, so a miss here is permanent, not merely slow.
    if (type === 'blogPost') {
      revalidateTag(RELATED_BLOGS_TAG, 'max');
      if (slug) bustTag(blogPostTag(slug));
      // Q-175: every LIST-level blog read. This is what finally refreshes the
      // blog CATEGORY pages, which the path list above does not name and cannot
      // - a post can move between categories and the webhook payload carries
      // only its slug, never its categories. It also covers `/blog/page/N` and
      // `/blog/cat/<slug>/page/N`, neither of which was ever revalidated.
      revalidateTag(BLOG_LIST_TAG, 'max');
    }
    // FAQ answers are read through a non-CDN tagged fetch (see getAnsweredFaqs)
    // — bust the tag so /faq + the search delta pick up the edit deterministically.
    if (type === 'faq') revalidateTag(FAQS_TAG, 'max');
    // Videos are read through a non-CDN tagged fetch (see lib/sanity/queries/videos)
    // — bust the tag so /videos + /videos/<slug> + the search delta refresh deterministically.
    if (type === 'video') revalidateTag(VIDEOS_TAG, 'max');
    // A productPage can reference a customProduct in its Related Products list
    // (dereferenced inside the PRODUCT_PAGES_TAG-cached read, P2-CP-001) — bust
    // the tag so /products/<slug> carousels pick up the edit/delete instead of
    // serving the stale card forever (the route has revalidate=false).
    if (type === 'customProduct') {
      revalidateTag(PRODUCT_PAGES_TAG, 'max');
      // Q-175: the customProduct reads themselves (the three aggregator
      // placement lists + the search-delta entries). The three paths were
      // already revalidated above; without this the rebuild would read the
      // tag-cached copy, and before Q-175 it read a stale CDN copy that then
      // sat for the aggregators' full one-week revalidate.
      revalidateTag(CUSTOM_PRODUCTS_TAG, 'max');
      // A customProduct attached to category grids via categoryOverride
      // .addedProducts is dereferenced inside the cat:<slug>-tagged read —
      // bust each embedding category so the edit shows there too (P2-CP-004
      // batch 3; needs `_id` in the webhook projection — customProduct has no
      // slug, so the slug-deref fallback can't cover it).
      paths.push(...bustEmbeddingCategories(await findEmbeddingCategorySlugs(payload._id, undefined)));
      // A customProduct referenced by a PRODUCT STRIP (blog body, page
      // productStrip, landing relatedProducts, video relatedProducts —
      // 2026-07-11) is dereferenced inside each embedder's own read — bust
      // those too (also needs `_id`; customProduct has no slug fallback).
      paths.push(...bustEmbeddingContentDocs(await findEmbeddingContentDocs(payload._id, undefined)));
    }
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

  // Custom product detail pages (P2-CP-001) render at /products/<slug>. All
  // productPage reads are cache-tagged (PRODUCT_PAGES_TAG list-level +
  // productPage:<slug> content-level), so bust both tags plus every surface
  // the doc renders on: its own page, /new-products (it sits at the top of the
  // grid), the live search delta (the ISR route that carries it), and the
  // sitemap (a new/removed slug changes its listing).
  // ⚠️ `productPage` must be in the Sanity webhook Filter `_type` list (it is a
  // NEW type — added to neither webhook automatically) or this never fires —
  // see docs/sanity-webhook-setup.md.
  if (type === 'productPage') {
    revalidateTag(PRODUCT_PAGES_TAG, 'max');
    const slug = payload.slug?.current;
    const paths = [SEARCH_INDEX_ROUTE, '/new-products', '/sitemap.xml'];
    if (slug) {
      bustTag(productPageTag(slug));
      paths.push(`/products/${slug}`);
    }
    for (const p of paths) revalidatePath(p);
    // Categories that RENDER this productPage — both attach directions:
    //   (a) category-side (batch 3): categoryOverride.addedProducts references
    //       → found via the references($id) lookup;
    //   (b) product-side (batch 4): the doc's own addToCategories → in the
    //       payload. With the recommended before()∪after() Projection this
    //       covers attach, DETACH (the removed slug is still in before()), and
    //       content edits; on the plain-field projection it is the current
    //       (after) set only — a detached category then stays stale until its
    //       tag is next busted (documented in docs/sanity-webhook-setup.md).
    // Both read the doc inside the cat:<slug>-tagged fetches, which the
    // productPage tags busted above do NOT cover — so bust each category tag.
    const placedSlugs = (payload.addToCategories ?? []).filter(
      (s): s is string => typeof s === 'string' && s.length > 0,
    );
    const embeddingSlugs = await findEmbeddingCategorySlugs(payload._id, slug);
    paths.push(...bustEmbeddingCategories([...new Set([...placedSlugs, ...embeddingSlugs])]));
    // Blog posts / pages / landing pages / videos whose PRODUCT STRIP
    // references this productPage (2026-07-11) dereference its card data
    // inside their own reads — bust each embedder so a title/price/image edit
    // shows there in seconds (slug-deref fallback works here until the
    // Projection carries `_id`).
    paths.push(...bustEmbeddingContentDocs(await findEmbeddingContentDocs(payload._id, slug)));
    // A placement set change alters which slugs are "edited" — refresh the
    // shared control sets so newly-placed categories start running the
    // per-slug fetches (same as categoryOverride/productPlacement publishes).
    if (placedSlugs.length > 0) revalidateTag(CATEGORY_CONTROL_TAG, 'max');
    return NextResponse.json({ revalidated: true, paths, type });
  }

  // Local/topic landing pages (P2-AI-005) render at /<slug> via app/[...slug]
  // (resolved BEFORE `page` docs). All landingPage reads are cache-tagged
  // (LANDING_TAG list-level + landing:<slug> content-level), so bust both tags
  // plus the page path + the sitemap (a new/removed slug changes its listing).
  // ⚠️ `landingPage` must be in the Sanity webhook Filter `_type` list (it is a
  // NEW type — added to neither webhook automatically) or this never fires —
  // see docs/sanity-webhook-setup.md.
  if (type === 'landingPage') {
    revalidateTag(LANDING_TAG, 'max');
    const slug = payload.slug?.current;
    if (slug) {
      bustTag(landingTag(slug));
      const paths = [`/${slug}`, '/sitemap.xml'];
      for (const p of paths) revalidatePath(p);
      return NextResponse.json({ revalidated: true, paths, type });
    }
    revalidatePath('/sitemap.xml');
    return NextResponse.json({ revalidated: false, reason: 'landingPage missing slug', type });
  }

  // Catalog lead pages (P2-CAT-001) render TWO routes per doc — the public
  // landing page /shop-by-theme/<slug> and the gated (noindex)
  // /shop-by-theme/<slug>/catalog. Both read the same doc through the
  // cache-tagged fetch (CATALOG_PAGES_TAG list-level + catalog-page:<slug>
  // content-level), so bust both tags plus both paths + the sitemap (only the
  // landing page is listed; a new/removed slug changes it). The related
  // blogs/videos strips ride RELATED_BLOGS_TAG / VIDEOS_TAG (already busted on
  // those types' publishes), and edits to a referenced productPage /
  // customProduct reach here via findEmbeddingContentDocs above — no extra
  // handling needed in either direction.
  // ⚠️ `catalogPage` must be in the Sanity webhook Filter `_type` list (it is a
  // NEW type — added to neither webhook automatically) or this never fires —
  // see docs/sanity-webhook-setup.md.
  if (type === 'catalogPage') {
    revalidateTag(CATALOG_PAGES_TAG, 'max');
    const slug = payload.slug?.current;
    if (slug) {
      bustTag(catalogPageTag(slug));
      const paths = [`/shop-by-theme/${slug}`, `/shop-by-theme/${slug}/catalog`, '/sitemap.xml'];
      for (const p of paths) revalidatePath(p);
      return NextResponse.json({ revalidated: true, paths, type });
    }
    revalidatePath('/sitemap.xml');
    return NextResponse.json({ revalidated: false, reason: 'catalogPage missing slug', type });
  }

  // Reusable form-builder `form` documents (P2-FB-001) render wherever a page
  // CTA opens them — the four /services pages at minimum, plus any page whose
  // ctaBlock / hero CTA carries a formSlug. Every form read is cache-tagged
  // (FORMS_TAG list-level + form:<slug> content-level), and tag invalidation
  // reaches EVERY route whose render used the tagged fetch — so arbitrary
  // embedders refresh without being enumerable here. The four service paths
  // are also revalidated explicitly (the known primary embedders).
  // ⚠️ `form` must be in the Sanity webhook Filter `_type` list (it is a NEW
  // type — added to neither webhook automatically) or this never fires — see
  // docs/sanity-webhook-setup.md.
  if (type === 'form') {
    revalidateTag(FORMS_TAG, 'max');
    const slug = payload.slug?.current;
    if (slug) bustTag(formTag(slug));
    const paths = [
      '/services/kitting',
      '/services/company-stores',
      '/services/popup-stores',
      '/services/custom-products',
    ];
    for (const p of paths) revalidatePath(p);
    return NextResponse.json({ revalidated: true, paths, type });
  }

  // Quick Quote `quote` documents (Q-110). The token IS the document slug, so
  // the existing projection needs no change. Bust the collection tag + the
  // per-quote tag and revalidate the future customer path /quote/<token> -
  // the route does not exist yet, and revalidatePath on a nonexistent route is
  // a harmless no-op, so this case is safely forward-wired for the next
  // prompt. The quote is deliberately NOT in the sitemap and never will be.
  // ⚠️ `quote` must be in the Sanity webhook Filter `_type` list (it is a NEW
  // type - added to neither webhook automatically) or this never fires - see
  // docs/sanity-webhook-setup.md.
  //
  // `quoteResponse` is DELIBERATELY NOT in the webhook Filter and has no case
  // here: responses are written ONLY by a future server route, which will
  // revalidate the affected quote tag directly after the write. Routing them
  // through the webhook would add pointless deliveries plus one more manual
  // Filter step that can be forgotten - the exact silent-failure class this
  // project has been bitten by before (faq, brand).
  if (type === 'quote') {
    revalidateTag(QUOTES_TAG, 'max');
    const token = payload.slug?.current;
    if (token) {
      bustTag(quoteTag(token));
      revalidatePath(`/quote/${token}`);
      // Never echo a full token (this JSON lands in the webhook delivery log).
      return NextResponse.json({
        revalidated: true,
        scope: `/quote/${token.slice(0, 6)}[redacted]`,
        type,
      });
    }
    return NextResponse.json({ revalidated: false, reason: 'quote missing slug', type });
  }

  // Portfolio Gallery (PORT-100): `portfolioItem` + `portfolioCategory`.
  // Every portfolio read carries PORTFOLIO_TAG (collection-level, the
  // BLOG_LIST_TAG reasoning: an item's category is an unresolved reference in
  // the payload, so the webhook cannot name the lists a publish changed, and
  // busting the one collection tag reaches all of them), plus the per-slug tag
  // for the doc itself. Paths: /portfolio is the PORT-110 page (static,
  // `revalidate = false`, so this revalidatePath is what refreshes it), and
  // the embedders are the blog posts / pages /
  // landing pages / videos / product pages whose Portfolio Gallery block
  // (PORT-120) references this item or category, found with the SAME
  // findEmbeddingContentDocs lookup the product strips use. That lookup needs
  // `_id` in the webhook Projection (recommended since P2-CP-004 batch 3); the
  // slug-deref fallback covers product strips only, so without `_id` an
  // embedded gallery stays stale until its host page is next busted.
  // ⚠️ `portfolioItem` and `portfolioCategory` must be in the Sanity webhook
  // Filter `_type` list on BOTH environments (new types, added to neither
  // webhook automatically) or this never fires. See docs/sanity-webhook-setup.md.
  if (type === 'portfolioItem' || type === 'portfolioCategory') {
    revalidateTag(PORTFOLIO_TAG, 'max');
    const slug = payload.slug?.current;
    if (slug) bustTag(type === 'portfolioItem' ? portfolioItemTag(slug) : portfolioCategoryTag(slug));
    // /sitemap.xml too (PORT-110): the sitemap lists /portfolio, with one image
    // per item, ONLY while the page has items, so the first publish must add
    // the entry and the last unpublish must remove it without a deploy.
    const paths = ['/portfolio', '/sitemap.xml'];
    for (const p of paths) revalidatePath(p);
    paths.push(...bustEmbeddingContentDocs(await findEmbeddingContentDocs(payload._id, undefined)));
    return NextResponse.json({ revalidated: true, paths, type });
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
