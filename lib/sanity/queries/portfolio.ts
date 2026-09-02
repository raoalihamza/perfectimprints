import 'server-only';

import { cachedClient } from '@/lib/sanity/client';
import {
  PORTFOLIO_TAG,
  portfolioCategoryTag,
  portfolioItemTag,
} from '@/lib/sanity/cache-tags';
import {
  PORTFOLIO_CATEGORY_PROJECTION,
  PORTFOLIO_ITEM_PROJECTION,
  isVisiblePortfolioCategory,
  isVisiblePortfolioItem,
  resolvePortfolioGalleryItems,
  sortPortfolioCategories,
  sortPortfolioItems,
  type PortfolioCategoryRef,
  type PortfolioGalleryValue,
  type PortfolioItemCard,
} from '@/lib/portfolio/gallery';

// ---------------------------------------------------------------------------
// Portfolio Gallery reads (PORT-100). The data layer behind the /portfolio
// page (PORT-110) and the gallery block on blog / product / video / landing
// pages (PORT-120). Nothing renders from here yet; the page ticket should
// have no data work left.
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

export type { PortfolioCategoryRef, PortfolioGalleryValue, PortfolioItemCard };

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
 * The server binding of the ONE gallery resolver: takes a projected
 * `portfolioGallery` value (spread PORTFOLIO_GALLERY_PROJECTION in the
 * embedder's read so `items[]` and `category` arrive dereferenced), fetches
 * the category's items when the mode needs them, and returns the ordered
 * cards to render. Every future surface calls this and nothing else; an empty
 * result means "render nothing" (the StripCardGrid contract).
 */
export async function resolvePortfolioGallery(
  gallery: PortfolioGalleryValue | null | undefined,
): Promise<PortfolioItemCard[]> {
  if (!gallery || gallery.hidden === true) return [];
  if (gallery.mode === 'category') {
    if (!isVisiblePortfolioCategory(gallery.category)) return [];
    const categoryItems = await getPortfolioItemsByCategory(gallery.category.slug);
    return resolvePortfolioGalleryItems(gallery, categoryItems);
  }
  return resolvePortfolioGalleryItems(gallery);
}
