/**
 * The ONE resolver behind every Portfolio Gallery (PORT-100).
 *
 * A `portfolioGallery` block will be placeable on blog posts, product pages,
 * video pages and landing pages (PORT-120), and the /portfolio page (PORT-110)
 * lists the same items with filters. Every one of those surfaces asks THIS
 * module which items to show, in which order, and how many. It is the
 * `resolveStripCards` pattern from lib/products/strip-cards.ts applied to
 * portfolio items: one decision written once, so four placements cannot drift,
 * and the "empty renders null" contract from components/products/StripCardGrid
 * (the renderer returns nothing for an empty list; callers keep their own
 * "no items, no section" guard).
 *
 * Pure on purpose: no fs, no Sanity, no server-only import, so it is unit
 * tested directly and cannot make a route dynamic. The one thing it cannot
 * do itself is READ the items of a category, so the server binding
 * (`resolvePortfolioGallery` in lib/sanity/queries/portfolio.ts) fetches those
 * and hands them in.
 *
 * THE RULES:
 *   - a hidden gallery resolves to nothing;
 *   - "Hand picked" keeps the editor's order (that order IS the hand-picking),
 *     drops dangling references (item deleted or unpublished), drops hidden
 *     items, and shows each item once even if it was picked twice;
 *   - "From a category" takes the category's visible items ordered by
 *     featured first, then displayOrder ascending (unset last), then newest;
 *   - a category-mode gallery with no category resolves to nothing rather
 *     than to every item on the site;
 *   - `limit` caps the result; unset, zero, negative or non-numeric falls back
 *     to DEFAULT_GALLERY_LIMIT, and it is clamped to MAX_GALLERY_LIMIT.
 */

import { normalizePortfolioColors, type PortfolioColor } from './colors';

export const DEFAULT_GALLERY_LIMIT = 8;
export const MAX_GALLERY_LIMIT = 48;

export type PortfolioGalleryMode = 'manual' | 'category';

/** The `portfolioCategory` fields any surface needs. */
export interface PortfolioCategoryRef {
  _id: string;
  title: string;
  slug: string;
  displayOrder?: number | null;
  hidden?: boolean | null;
}

/** A projected Sanity image with its alt text (the shape the card renders). */
export interface PortfolioImage {
  _type?: 'image';
  asset?: { _ref: string; _type: 'reference' };
  alt?: string;
  hotspot?: { x: number; y: number; height: number; width: number };
  crop?: { top: number; bottom: number; left: number; right: number };
}

/** A projected `portfolioItem`, the card every surface renders. */
export interface PortfolioItemCard {
  _id: string;
  _createdAt?: string;
  title: string;
  slug?: string | null;
  image?: PortfolioImage | null;
  category?: PortfolioCategoryRef | null;
  colors?: string[] | null;
  description?: string | null;
  clientName?: string | null;
  featured?: boolean | null;
  displayOrder?: number | null;
  hidden?: boolean | null;
}

/** A projected `portfolioGallery` block value, references dereferenced. */
export interface PortfolioGalleryValue {
  _key?: string;
  heading?: string | null;
  mode?: PortfolioGalleryMode | string | null;
  /** Dereferenced `items[]`; a dangling reference projects to null. */
  items?: (PortfolioItemCard | null)[] | null;
  /** Dereferenced `category`; null when unset or the target is gone. */
  category?: PortfolioCategoryRef | null;
  limit?: number | null;
  hidden?: boolean | null;
}

// ---------------------------------------------------------------------------
// GROQ fragments (pure strings, so any query module can spread them)
// ---------------------------------------------------------------------------

/** Projection for one portfolioCategory reference. Includes its own braces. */
export const PORTFOLIO_CATEGORY_PROJECTION =
  '{ _id, title, "slug": slug.current, displayOrder, hidden }';

/** Projection for one portfolioItem document. Includes its own braces. */
export const PORTFOLIO_ITEM_PROJECTION =
  '{ _id, _createdAt, title, "slug": slug.current, image, ' +
  `"category": category->${PORTFOLIO_CATEGORY_PROJECTION}, ` +
  'colors, description, clientName, featured, displayOrder, hidden }';

/**
 * Projection for a `portfolioGallery` block embedded in another document
 * (PORT-120 will spread this inside blog / product / video / landing reads).
 * Includes its own braces.
 */
export const PORTFOLIO_GALLERY_PROJECTION =
  '{ _key, heading, mode, ' +
  `"items": items[]->${PORTFOLIO_ITEM_PROJECTION}, ` +
  `"category": category->${PORTFOLIO_CATEGORY_PROJECTION}, ` +
  'limit, hidden }';

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** The limit a gallery actually applies (see the module comment). */
export function effectiveGalleryLimit(limit: number | null | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_GALLERY_LIMIT;
  }
  return Math.min(MAX_GALLERY_LIMIT, Math.floor(limit));
}

/** True for an item that should render anywhere: present, not hidden, and with a title. */
export function isVisiblePortfolioItem(
  item: PortfolioItemCard | null | undefined,
): item is PortfolioItemCard {
  return Boolean(item && item._id && item.title && item.hidden !== true);
}

/** True for a category the filters should offer: present, not hidden, with a slug. */
export function isVisiblePortfolioCategory(
  category: PortfolioCategoryRef | null | undefined,
): category is PortfolioCategoryRef {
  return Boolean(category && category.slug && category.hidden !== true);
}

function orderKey(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function createdKey(value: string | null | undefined): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * The site-wide item order: featured first, then displayOrder ascending with
 * unset last, then newest first. Stable, so two items that tie keep the order
 * they arrived in. Used by category-mode galleries and by the /portfolio page.
 */
export function sortPortfolioItems<T extends PortfolioItemCard>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const fa = a.featured === true ? 0 : 1;
    const fb = b.featured === true ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const oa = orderKey(a.displayOrder);
    const ob = orderKey(b.displayOrder);
    if (oa !== ob) return oa - ob;
    return createdKey(b._createdAt) - createdKey(a._createdAt);
  });
}

/** Categories in filter-button order: displayOrder ascending (unset last), then title. */
export function sortPortfolioCategories<T extends PortfolioCategoryRef>(
  categories: readonly T[],
): T[] {
  return [...categories].sort((a, b) => {
    const oa = orderKey(a.displayOrder);
    const ob = orderKey(b.displayOrder);
    if (oa !== ob) return oa - ob;
    return a.title.localeCompare(b.title);
  });
}

/** Each item once, first occurrence wins, keyed by `_id`. */
export function dedupePortfolioItems<T extends PortfolioItemCard>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item._id)) continue;
    seen.add(item._id);
    out.push(item);
  }
  return out;
}

/** The colours an item carries, validated against the vocabulary. */
export function portfolioItemColors(item: Pick<PortfolioItemCard, 'colors'>): PortfolioColor[] {
  return normalizePortfolioColors(item.colors);
}

/**
 * Filter a visible, sorted item list by category slug and/or colour (the
 * /portfolio page's shareable filtered view). An unset filter matches all; a
 * colour filter matches items carrying that colour. Order is preserved.
 */
export function filterPortfolioItems<T extends PortfolioItemCard>(
  items: readonly T[],
  filter: { category?: string | null; color?: string | null },
): T[] {
  const category = filter.category?.trim() || null;
  const color = filter.color?.trim() || null;
  return items.filter((item) => {
    if (category && item.category?.slug !== category) return false;
    if (color && !(portfolioItemColors(item) as string[]).includes(color)) return false;
    return true;
  });
}

/**
 * Resolve one gallery block into the ordered items it renders. See the module
 * comment for the rules. `categoryItems` is the category's item list, fetched
 * by the server binding; it is only consulted in category mode and may be
 * passed unsorted (this function sorts it).
 */
export function resolvePortfolioGalleryItems(
  gallery: PortfolioGalleryValue | null | undefined,
  categoryItems: readonly PortfolioItemCard[] = [],
): PortfolioItemCard[] {
  if (!gallery || gallery.hidden === true) return [];
  const limit = effectiveGalleryLimit(gallery.limit);

  if (gallery.mode === 'category') {
    if (!isVisiblePortfolioCategory(gallery.category)) return [];
    const slug = gallery.category.slug;
    const inCategory = categoryItems.filter(
      (item) => isVisiblePortfolioItem(item) && item.category?.slug === slug,
    );
    return sortPortfolioItems(dedupePortfolioItems(inCategory)).slice(0, limit);
  }

  // Hand picked (the default): the editor's order, cleaned.
  const picked = (gallery.items ?? []).filter(isVisiblePortfolioItem);
  return dedupePortfolioItems(picked).slice(0, limit);
}
