import 'server-only';

import { cachedClient } from '@/lib/sanity/client';
import {
  PORTFOLIO_TAG,
  portfolioCategoryTag,
  portfolioItemTag,
} from '@/lib/sanity/cache-tags';
import {
  PORTFOLIO_CATEGORY_PROJECTION,
  PORTFOLIO_GALLERY_TYPE,
  PORTFOLIO_ITEM_PROJECTION,
  isSanityReferenceStub,
  isVisiblePortfolioCategory,
  isVisiblePortfolioItem,
  portfolioGalleryCategoryRefId,
  portfolioGalleryItemRefIds,
  resolvePortfolioGalleryItems,
  sortPortfolioCategories,
  sortPortfolioItems,
  type PortfolioCategoryRef,
  type PortfolioGalleryBlockValue,
  type PortfolioGalleryInput,
  type PortfolioGalleryValue,
  type PortfolioItemCard,
} from '@/lib/portfolio/gallery';
import { embeddedTileSizes, type PortfolioEmbedHost } from '@/lib/portfolio/image-sizes';
import { toPortfolioTiles, type PortfolioTile } from '@/lib/portfolio/tile-data';

// ---------------------------------------------------------------------------
// Portfolio Gallery reads (PORT-100). The data layer behind the /portfolio
// page (PORT-110) and the gallery block on blog posts, product pages, video
// pages, landing pages and ordinary pages (PORT-120; the block's binding is
// `resolvePortfolioGallery` at the bottom).
//
// Freshness, the standing rule: EVERY read here is a non-CDN `cachedClient`
// fetch carrying a cache tag with `revalidate: false`, never `no-store`, so a
// route that renders from these stays statically prerenderable while the
// webhook (app/api/sanity/revalidate) busts the tags on publish in seconds.
//  - PORTFOLIO_TAG rides every read: any portfolioItem or portfolioCategory
//    publish busts it, which refreshes every list without the webhook having
//    to know which lists changed (a category rename changes every card that
//    shows the category title; a hidden toggle changes every list).
//  - portfolioCategoryTag(slug) additionally rides the category-scoped read,
//    and portfolioItemTag(slug) is defined for a future per-item page.
// Every tag value passes through sanitizeTagValue() inside the builders.
// ---------------------------------------------------------------------------

export type {
  PortfolioCategoryRef,
  PortfolioGalleryBlockValue,
  PortfolioGalleryInput,
  PortfolioGalleryValue,
  PortfolioItemCard,
};

const PUBLISHED_ITEM = '_type == "portfolioItem" && !(_id in path("drafts.**"))';
const PUBLISHED_CATEGORY = '_type == "portfolioCategory" && !(_id in path("drafts.**"))';

function opts(...tags: string[]) {
  return { next: { tags: [PORTFOLIO_TAG, ...tags].filter(Boolean), revalidate: false as const } };
}

/**
 * Every published category that should appear in the filters, in button
 * order. THROWS on a failed read: this is the /portfolio page's own read
 * (PORT-110), and that page decides `noindex` + "leave out of the sitemap"
 * from an EMPTY result, so a swallowed outage would bake a noindex empty
 * state into a `revalidate: false` route until the next portfolio publish.
 * Letting it throw fails the build loudly, or, on a webhook regeneration,
 * keeps the previous static copy serving. Embedders (a gallery block on a
 * blog post) use the forgiving variant below, where "render nothing" is the
 * right answer to a failure.
 */
export async function getAllPortfolioCategoriesOrThrow(): Promise<PortfolioCategoryRef[]> {
  const docs = await cachedClient.fetch<PortfolioCategoryRef[]>(
    `*[${PUBLISHED_CATEGORY}]${PORTFOLIO_CATEGORY_PROJECTION}`,
    {},
    opts(),
  );
  return sortPortfolioCategories((docs ?? []).filter(isVisiblePortfolioCategory));
}

/** Forgiving form of `getAllPortfolioCategoriesOrThrow`: a failed read is an empty list. */
export async function getAllPortfolioCategories(): Promise<PortfolioCategoryRef[]> {
  try {
    return await getAllPortfolioCategoriesOrThrow();
  } catch {
    return [];
  }
}

/**
 * One published category by document id, hidden or not. Feeds a
 * category-mode gallery block, which stores the category as a REFERENCE
 * (PORT-120): the id is what the host document holds, so this is the read
 * that turns it into the category's slug and title. Tagged PORTFOLIO_TAG
 * only: the slug is not known until the read returns, and the collection
 * tag is what the webhook busts on any category publish anyway.
 */
export async function getPortfolioCategoryById(id: string): Promise<PortfolioCategoryRef | null> {
  if (!id) return null;
  try {
    const doc = await cachedClient.fetch<PortfolioCategoryRef | null>(
      `*[${PUBLISHED_CATEGORY} && _id == $id][0]${PORTFOLIO_CATEGORY_PROJECTION}`,
      { id },
      opts(),
    );
    return doc?.slug ? doc : null;
  } catch {
    return null;
  }
}

/** One published category by slug, hidden or not (the caller decides what a hidden one means). */
export async function getPortfolioCategoryBySlug(slug: string): Promise<PortfolioCategoryRef | null> {
  if (!slug) return null;
  try {
    const doc = await cachedClient.fetch<PortfolioCategoryRef | null>(
      `*[${PUBLISHED_CATEGORY} && slug.current == $slug][0]${PORTFOLIO_CATEGORY_PROJECTION}`,
      { slug },
      opts(portfolioCategoryTag(slug)),
    );
    return doc?.slug ? doc : null;
  } catch {
    return null;
  }
}

/**
 * Every visible published item, in site order (featured first, then display
 * order, then newest). The /portfolio page's unfiltered list; its filtered
 * views are `filterPortfolioItems` over this same list, so a shareable
 * filtered link and the full page can never disagree about an item.
 */
export async function getAllPortfolioItems(): Promise<PortfolioItemCard[]> {
  try {
    return await getAllPortfolioItemsOrThrow();
  } catch {
    return [];
  }
}

/**
 * `getAllPortfolioItems` that THROWS on a failed read, for the /portfolio
 * page (see `getAllPortfolioCategoriesOrThrow` for why: an empty result
 * means noindex there, and an outage must not be mistaken for emptiness).
 */
export async function getAllPortfolioItemsOrThrow(): Promise<PortfolioItemCard[]> {
  const docs = await cachedClient.fetch<PortfolioItemCard[]>(
    `*[${PUBLISHED_ITEM} && hidden != true]${PORTFOLIO_ITEM_PROJECTION}`,
    {},
    opts(),
  );
  return sortPortfolioItems((docs ?? []).filter(isVisiblePortfolioItem));
}

/** The visible items of one category, in site order. Feeds category-mode galleries. */
export async function getPortfolioItemsByCategory(categorySlug: string): Promise<PortfolioItemCard[]> {
  if (!categorySlug) return [];
  try {
    const docs = await cachedClient.fetch<PortfolioItemCard[]>(
      `*[${PUBLISHED_ITEM} && hidden != true && category->slug.current == $slug]${PORTFOLIO_ITEM_PROJECTION}`,
      { slug: categorySlug },
      opts(portfolioCategoryTag(categorySlug)),
    );
    return sortPortfolioItems((docs ?? []).filter(isVisiblePortfolioItem));
  } catch {
    return [];
  }
}

/**
 * Items by document id, in the order the ids were given (the
 * getVideoSummariesBySlugs pattern). Hidden or unpublished ids are simply
 * absent from the result. Feeds a hand-picked gallery whose embedder stored
 * references but did not dereference them.
 */
export async function getPortfolioItemsByIds(ids: readonly string[]): Promise<PortfolioItemCard[]> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return [];
  try {
    const docs =
      (await cachedClient.fetch<PortfolioItemCard[]>(
        `*[${PUBLISHED_ITEM} && _id in $ids]${PORTFOLIO_ITEM_PROJECTION}`,
        { ids: wanted },
        opts(),
      )) ?? [];
    const byId = new Map(docs.map((d) => [d._id, d]));
    return wanted.map((id) => byId.get(id)).filter(isVisiblePortfolioItem);
  } catch {
    return [];
  }
}

/** One published item by slug (for a future per-item page; no route uses it yet). */
export async function getPortfolioItemBySlug(slug: string): Promise<PortfolioItemCard | null> {
  if (!slug) return null;
  try {
    const doc = await cachedClient.fetch<PortfolioItemCard | null>(
      `*[${PUBLISHED_ITEM} && slug.current == $slug][0]${PORTFOLIO_ITEM_PROJECTION}`,
      { slug },
      opts(portfolioItemTag(slug)),
    );
    return isVisiblePortfolioItem(doc) ? doc : null;
  } catch {
    return null;
  }
}

/**
 * The server binding of the ONE gallery resolver. Takes a `portfolioGallery`
 * value in EITHER shape: as stored on the host document (`items[]` and
 * `category` are references, which is what every PORT-120 embedder passes,
 * straight off a bare `{...}` spread of the host's own read) or already
 * dereferenced (PORTFOLIO_GALLERY_PROJECTION). References are resolved HERE,
 * through the tagged portfolio reads above, which is the whole point:
 * the host page's cached render then carries PORTFOLIO_TAG, so a portfolio
 * publish of ANY kind (an item edited or hidden, a category renamed, an item
 * added to a category the block fills from) invalidates the host page
 * without the webhook having to know which host embeds what. The
 * `findEmbeddingContentDocs` lookup in the webhook is the belt on top.
 *
 *   - Hand picked: the referenced ids, in the editor's order, read with
 *     `getPortfolioItemsByIds` (published only; a deleted, unpublished or
 *     hidden item is simply absent) and then handed to the pure resolver for
 *     the dedupe + limit rules.
 *   - From a category: the referenced category by id (a deleted or hidden
 *     one resolves to nothing, never to every item on the site), then that
 *     category's visible items, then the pure resolver's order + limit.
 *
 * An empty result means "render nothing" (the StripCardGrid contract). This
 * function never throws: every read it makes degrades to null / [].
 */
export async function resolvePortfolioGallery(
  gallery: PortfolioGalleryInput | null | undefined,
): Promise<PortfolioItemCard[]> {
  if (!gallery || gallery.hidden === true) return [];

  if (gallery.mode === 'category') {
    const refId = portfolioGalleryCategoryRefId(gallery);
    const category = refId
      ? await getPortfolioCategoryById(refId)
      : isSanityReferenceStub(gallery.category)
        ? null
        : (gallery.category as PortfolioCategoryRef | null | undefined);
    if (!isVisiblePortfolioCategory(category)) return [];
    const categoryItems = await getPortfolioItemsByCategory(category.slug);
    return resolvePortfolioGalleryItems({ ...gallery, category, items: [] }, categoryItems);
  }

  // Hand picked: references become cards through the tagged read; entries
  // that already are cards (a dereferenced value) pass through as they are.
  const refIds = portfolioGalleryItemRefIds(gallery);
  const fetched = refIds.length > 0 ? await getPortfolioItemsByIds(refIds) : [];
  const byId = new Map(fetched.map((item) => [item._id, item]));
  const items: (PortfolioItemCard | null)[] = (gallery.items ?? []).map((entry) => {
    if (isSanityReferenceStub(entry)) return byId.get(entry._ref) ?? null;
    return entry ?? null;
  });
  return resolvePortfolioGalleryItems({ ...gallery, items, category: null });
}

/**
 * The ONE call every PORT-120 surface makes: a stored gallery block to the
 * plain tiles the shared client renderer (components/portfolio/
 * PortfolioGalleryBlock.tsx) draws, sized for the host's content column.
 * `[]` means render nothing; the renderer honours that, so a block whose
 * category was deleted, whose items are all hidden, or whose images were
 * never uploaded leaves no heading and no box behind.
 */
export async function resolvePortfolioGalleryTiles(
  gallery: PortfolioGalleryInput | null | undefined,
  host: PortfolioEmbedHost,
): Promise<PortfolioTile[]> {
  const items = await resolvePortfolioGallery(gallery);
  return toPortfolioTiles(items, { sizes: embeddedTileSizes(host) });
}

/**
 * Blog posts place the block ANYWHERE in the body (PORT-120), but the body
 * renders through a synchronous PortableText component, so the blog page
 * resolves every gallery block up front, exactly as it resolves the SKUs of
 * its `blogProducts` strips, and hands BlogBody a map keyed by block `_key`.
 * Blocks are resolved in parallel; a block with no `_key` cannot be matched
 * back and is skipped (Studio always writes one).
 */
export async function collectPortfolioGalleryTiles(
  body: readonly unknown[] | null | undefined,
  host: PortfolioEmbedHost,
): Promise<Map<string, PortfolioTile[]>> {
  const blocks: PortfolioGalleryBlockValue[] = [];
  for (const block of body ?? []) {
    const value = block as PortfolioGalleryBlockValue | null;
    if (value && value._type === PORTFOLIO_GALLERY_TYPE && value._key) blocks.push(value);
  }
  const resolved = await Promise.all(blocks.map((b) => resolvePortfolioGalleryTiles(b, host)));
  const out = new Map<string, PortfolioTile[]>();
  blocks.forEach((block, i) => out.set(block._key as string, resolved[i]));
  return out;
}
