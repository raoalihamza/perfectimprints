/**
 * The "shop this kind of work" link on a portfolio category (PORT-160).
 *
 * A visitor looking at embroidered caps should be able to go straight to the
 * caps Patrick actually sells, and the link gives Google a path from the
 * portfolio into the commercial `/cat` pages. The target lives on
 * `portfolioCategory.shopCategorySlug`, NOT on the item: there are a handful
 * of categories and there will be hundreds of items, so on the category it
 * is one entry each, filled once, and every item inherits it.
 *
 * WHAT IS STORED AND WHAT IS CHECKED. The field holds the category page's
 * SLUG, the path after `/cat/` (`caps`, or a facet such as
 * `caps/color/blue`), never a full URL. The Studio input is the searchable
 * `CategorySlugInput` over the real 22,180-slug list plus the live
 * customCategory slugs, so a picked value exists on the site; the schema then
 * refuses to publish anything that is not that shape; and THIS module checks
 * the shape once more at render, so a value that bypassed both (an API
 * write) produces no link rather than a broken one. Existence is NOT checked
 * at render: proving a slug exists means loading the category list into the
 * portfolio route, which is exactly the read this page avoids. A slug that
 * validates but points at a page that was later removed is Patrick's to
 * notice, and the guide says so.
 *
 * Pure on purpose: no fs, no Sanity, no React, so the client browser (which
 * renders the link under a filtered grid) and the server (which renders it
 * under a category-mode gallery block) share it and it is tested directly.
 */

/** A slug of one or more segments, each lowercase letters, digits and single dashes. */
export const SHOP_CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/;

export const SHOP_CATEGORY_SLUG_MAX_LENGTH = 200;

/**
 * Why a value cannot be a shop category slug, in the Studio's own words, or
 * null when it can. Blank is fine (the field is optional). The same rule the
 * schema's `Rule.custom` applies, so the Studio message and the render-time
 * guard cannot disagree.
 */
export function shopCategorySlugProblem(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'Must be a category slug, e.g. caps.';
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || v.includes('perfectimprints.com')) {
    return 'Just the slug, not the whole address: the part after /cat/, e.g. caps or caps/color/blue.';
  }
  if (v.startsWith('/') || v.endsWith('/')) return 'No leading or trailing slash.';
  if (v.startsWith('cat/')) return 'Drop the leading "cat/" and keep only the slug after it.';
  if (v !== v.toLowerCase()) return 'Lowercase only.';
  if (v.length > SHOP_CATEGORY_SLUG_MAX_LENGTH) return 'Too long to be a category slug.';
  if (!SHOP_CATEGORY_SLUG_PATTERN.test(v)) {
    return 'Letters, numbers and single dashes only, with a slash between the parts of a facet slug, e.g. caps or caps/color/blue.';
  }
  return null;
}

/** The trimmed slug when it passes the shape rule, else null. */
export function normalizeShopCategorySlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || shopCategorySlugProblem(v)) return null;
  return v;
}

export interface PortfolioShopLink {
  /** The portfolio category's own slug, the key a filter selection names. */
  categorySlug: string;
  /** The portfolio category's title as typed, e.g. "Caps and Hats" (the short form in a list of links). */
  title: string;
  /** Site-relative, e.g. `/cat/caps`. */
  href: string;
  /** The full sentence form, e.g. "Shop all custom caps and hats". */
  label: string;
}

/**
 * The label wording. The category title is sentence-cased into the phrase:
 * "Caps and Hats" reads "Shop all custom caps and hats". A word that carries
 * an upper-case letter past its first ("T-Shirts", "EMS", "USA") is left as
 * typed, because lower-casing it would produce "t-shirts" and "ems", which
 * are not how those words are written. Patrick controls the rest through the
 * category title itself.
 */
export function shopLinkLabel(title: string): string {
  const phrase = title
    .trim()
    .split(/\s+/)
    .map((word) => (/^[A-Z][a-z]*$/.test(word) ? word.toLowerCase() : word))
    .join(' ');
  return phrase ? `Shop all custom ${phrase}` : 'Shop all custom products';
}

/**
 * The link for one category, or null when it has no valid slug. Never throws
 * and never emits a malformed href: the slug has passed the shape rule, so
 * the result is always `/cat/` followed by one or more clean segments.
 */
export function portfolioShopLink(
  category:
    | { slug?: string | null; title?: string | null; shopCategorySlug?: string | null }
    | null
    | undefined,
): PortfolioShopLink | null {
  const slug = normalizeShopCategorySlug(category?.shopCategorySlug);
  if (!slug) return null;
  const title = category?.title?.trim() || '';
  return {
    categorySlug: category?.slug?.trim() || '',
    title,
    href: `/cat/${slug}`,
    label: shopLinkLabel(title),
  };
}

/**
 * Every category's link, keyed by the category's own slug, skipping
 * categories with no valid shop slug. The /portfolio page builds this once
 * on the server from the categories it already read and hands it to the
 * client browser as a plain prop, so the browser never sees a category
 * document; it looks a ticked category's slug up here.
 */
export function buildPortfolioShopLinks(
  categories: readonly {
    slug?: string | null;
    title?: string | null;
    shopCategorySlug?: string | null;
    hidden?: boolean | null;
  }[],
): Record<string, PortfolioShopLink> {
  const out: Record<string, PortfolioShopLink> = {};
  for (const category of categories) {
    if (category.hidden === true || !category.slug) continue;
    const link = portfolioShopLink(category);
    if (link && !(link.categorySlug in out)) out[link.categorySlug] = link;
  }
  return out;
}
