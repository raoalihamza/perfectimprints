/**
 * The /portfolio page's filter model (PORT-110, four groups since PORT-160).
 *
 * Four filter groups, category, decoration method, industry and colour,
 * rendered by the SAME sidebar the deals, catalog and search pages use
 * (components/deals/DealsFilterSidebar) and applied by the SAME OR-within /
 * AND-across rule (`applyFacetFilters` in lib/deals-filter.ts). This module
 * only decides what those groups CONTAIN and how the selection travels in
 * the URL, because the URL is the shareable artefact: Patrick filters to,
 * say, embroidered caps for fire departments, copies the address and sends
 * it to a customer, who opens exactly that view.
 *
 * Rules:
 *   - a group offers ONLY values that at least one visible item actually
 *     uses (an empty filter button is a dead end); categories keep Patrick's
 *     displayOrder, the other three keep their vocabulary order
 *     (lib/portfolio/colors, decoration-methods, industries);
 *   - the URL carries readable values, never ids: `?category=caps-and-hats`,
 *     `?decoration=embroidered,screen-printed`, `?industry=fire-and-ems` and
 *     `?color=black,red` (a category's slug, otherwise the vocabulary value),
 *     comma-joined inside one parameter, repeated parameters accepted too;
 *   - reading is forgiving (case, whitespace, unknown values dropped) and
 *     writing is canonical (groups in sidebar order, values in group order),
 *     so two people selecting the same set produce the same link;
 *   - an unknown or renamed value in a pasted link simply does not filter,
 *     so an old link never shows an error or an empty page for a bad reason.
 *
 * GROUP ORDER (PORT-160): category, decoration method, industry, colour. The
 * three "what, how, for whom" groups come first because they are the ones a
 * buyer decides by; colour is the visual refinement and, with up to twenty
 * values, the longest list, so it sits last where its "More Options" fold
 * pushes nothing below it. A link written under the PORT-110 two-group order
 * (`?category=...&color=...`) still reads back identically, because reading
 * is order-independent; only the canonical order it is rewritten to changed.
 *
 * Pure on purpose: no fs, no Sanity, no React, no server-only import, so the
 * client browser and the server page share it and it is tested directly.
 */

import type { DealsFacetSection, DealsFacetValue, DealsFilterState } from '../deals-filter';
import { PORTFOLIO_COLORS, portfolioColorLabel } from './colors';
import { PORTFOLIO_DECORATION_METHODS, portfolioDecorationMethodLabel } from './decoration-methods';
import {
  isVisiblePortfolioCategory,
  portfolioItemColors,
  portfolioItemDecorationMethods,
  portfolioItemIndustry,
  sortPortfolioCategories,
  type PortfolioCategoryRef,
  type PortfolioItemCard,
} from './gallery';
import { PORTFOLIO_INDUSTRIES, portfolioIndustryLabel } from './industries';

/** Sidebar field name for the category group. */
export const PORTFOLIO_CATEGORY_FIELD = 'category';

/**
 * Sidebar field name for the colour group. Plural `colors` on purpose:
 * DealsFilterSidebar renders its colour swatch only for a section whose field
 * is `colors` (the Searchspring field name the deals feed uses). The URL
 * parameter is the singular `color`, see PORTFOLIO_URL_PARAM.
 */
export const PORTFOLIO_COLOR_FIELD = 'colors';

/** Sidebar field name for the decoration-method group (PORT-160). */
export const PORTFOLIO_DECORATION_FIELD = 'decorationMethods';

/** Sidebar field name for the industry group (PORT-160). */
export const PORTFOLIO_INDUSTRY_FIELD = 'industry';

/** Sidebar field -> the readable query parameter it travels in. */
export const PORTFOLIO_URL_PARAM: Readonly<Record<string, string>> = {
  [PORTFOLIO_CATEGORY_FIELD]: 'category',
  [PORTFOLIO_DECORATION_FIELD]: 'decoration',
  [PORTFOLIO_INDUSTRY_FIELD]: 'industry',
  [PORTFOLIO_COLOR_FIELD]: 'color',
};

/**
 * Tiles per page on /portfolio. 48 is divisible by every column count the
 * grid uses (2, 3 and 4), so a full page always ends on a complete row, and
 * the pagination control renders nothing at all until there are more than 48
 * items (ClientPagination returns null for a single page). Images below the
 * first row are lazy, so a page of 48 costs DOM, not bandwidth.
 */
export const PORTFOLIO_PAGE_SIZE = 48;

/** The item fields the facet builder reads. Satisfied by a projected portfolioItem. */
export type PortfolioFacetSource = Pick<
  PortfolioItemCard,
  '_id' | 'category' | 'colors' | 'decorationMethods' | 'industry'
>;

function facetValue(id: string, label: string, ids: readonly string[]): DealsFacetValue {
  return {
    id,
    value: id,
    label,
    count: ids.length,
    type: 'value',
    low: null,
    high: null,
    skus: [...ids],
  };
}

function add(map: Map<string, string[]>, key: string, id: string): void {
  const list = map.get(key) ?? [];
  list.push(id);
  map.set(key, list);
}

/**
 * A vocabulary group: the vocabulary's values in ITS order, only those a
 * visible item carries. Returns null when no item carries any, so the group
 * is omitted (the sidebar shows no empty group).
 */
function vocabularySection(
  field: string,
  label: string,
  vocabulary: readonly string[],
  labelOf: (value: string) => string,
  byValue: ReadonlyMap<string, string[]>,
): DealsFacetSection | null {
  const values = vocabulary
    .filter((v) => byValue.has(v))
    .map((v) => facetValue(v, labelOf(v), byValue.get(v) ?? []));
  return values.length > 0 ? { field, label, type: 'list', values } : null;
}

/**
 * Build the sidebar groups from the items the page actually renders and the
 * published categories, in sidebar order. A group with no usable value is
 * omitted, so a portfolio whose items carry no industry tags shows no
 * industry group, and the sidebar shows nothing for an empty portfolio (the
 * page does not mount it then anyway).
 */
export function buildPortfolioFacetSections(
  items: readonly PortfolioFacetSource[],
  categories: readonly PortfolioCategoryRef[],
): DealsFacetSection[] {
  const byCategory = new Map<string, string[]>();
  const byColor = new Map<string, string[]>();
  const byDecoration = new Map<string, string[]>();
  const byIndustry = new Map<string, string[]>();
  for (const item of items) {
    const slug = item.category?.slug;
    if (slug) add(byCategory, slug, item._id);
    for (const color of portfolioItemColors(item)) add(byColor, color, item._id);
    for (const method of portfolioItemDecorationMethods(item)) add(byDecoration, method, item._id);
    const industry = portfolioItemIndustry(item);
    if (industry) add(byIndustry, industry, item._id);
  }

  const sections: DealsFacetSection[] = [];

  // Categories in Patrick's button order, only those a visible item uses. A
  // category that is hidden or unpublished is not offered, and the items filed
  // under it still show in the unfiltered grid.
  const categoryValues = sortPortfolioCategories(categories.filter(isVisiblePortfolioCategory))
    .filter((c) => byCategory.has(c.slug))
    .map((c) => facetValue(c.slug, c.title, byCategory.get(c.slug) ?? []));
  if (categoryValues.length > 0) {
    sections.push({
      field: PORTFOLIO_CATEGORY_FIELD,
      label: 'Category',
      type: 'list',
      values: categoryValues,
    });
  }

  // The three vocabulary groups, each in its vocabulary order.
  const decoration = vocabularySection(
    PORTFOLIO_DECORATION_FIELD,
    'Decoration method',
    PORTFOLIO_DECORATION_METHODS,
    portfolioDecorationMethodLabel,
    byDecoration,
  );
  if (decoration) sections.push(decoration);

  const industry = vocabularySection(
    PORTFOLIO_INDUSTRY_FIELD,
    'Industry',
    PORTFOLIO_INDUSTRIES,
    portfolioIndustryLabel,
    byIndustry,
  );
  if (industry) sections.push(industry);

  const color = vocabularySection(
    PORTFOLIO_COLOR_FIELD,
    'Color',
    PORTFOLIO_COLORS,
    portfolioColorLabel,
    byColor,
  );
  if (color) sections.push(color);

  return sections;
}

/** Number of selected values across every group. */
export function countActivePortfolioFilters(state: DealsFilterState): number {
  return Object.values(state).reduce((n, values) => n + (values?.length ?? 0), 0);
}

/**
 * The categories whose "Shop all custom ..." links belong under the grid
 * (PORT-160), as category slugs in sidebar order. With one or more categories
 * ticked, those categories; with none ticked, every category that at least
 * one of the SHOWN tiles belongs to, so an industry- or colour-only view
 * still points at the shops for the work on screen, and the unfiltered page
 * (the static HTML Google reads) carries a link into every category's shop.
 */
export function shopLinkCategorySlugs(
  state: DealsFilterState,
  sections: readonly DealsFacetSection[],
  shownTiles: readonly { category: { slug: string } | null }[],
): string[] {
  const section = sections.find((s) => s.field === PORTFOLIO_CATEGORY_FIELD);
  if (!section) return [];
  const ticked = new Set(state[PORTFOLIO_CATEGORY_FIELD] ?? []);
  if (ticked.size > 0) return section.values.map((v) => v.id).filter((id) => ticked.has(id));
  const shown = new Set<string>();
  for (const tile of shownTiles) if (tile.category?.slug) shown.add(tile.category.slug);
  return section.values.map((v) => v.id).filter((id) => shown.has(id));
}

/**
 * Read a filter selection out of a query string (with or without the leading
 * `?`). Only values the sections actually offer survive, in section order,
 * each once; everything else is ignored. Never throws.
 */
export function portfolioFilterStateFromSearch(
  search: string | null | undefined,
  sections: readonly DealsFacetSection[],
): DealsFilterState {
  const state: DealsFilterState = {};
  if (!search) return state;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.replace(/^\?/, ''));
  } catch {
    return state;
  }
  for (const section of sections) {
    const param = PORTFOLIO_URL_PARAM[section.field];
    if (!param) continue;
    const ids = new Set(section.values.map((v) => v.id));
    const wanted = new Set<string>();
    for (const raw of params.getAll(param)) {
      // A whole parameter that is itself a known value wins before any
      // splitting, so a legacy slug carrying a comma still round-trips.
      const whole = raw.trim().toLowerCase();
      if (ids.has(whole)) {
        wanted.add(whole);
        continue;
      }
      for (const part of raw.split(',')) {
        const v = part.trim().toLowerCase();
        if (v) wanted.add(v);
      }
    }
    if (wanted.size === 0) continue;
    const known = section.values.filter((v) => wanted.has(v.id)).map((v) => v.id);
    if (known.length > 0) state[section.field] = known;
  }
  return state;
}

/**
 * Write a filter selection as the canonical query string (no leading `?`;
 * empty string when nothing is selected). Groups appear in sidebar order and
 * values in group order regardless of the order they were clicked, so the
 * same selection always yields the same link. Values are slugs and vocabulary
 * words (lowercase letters, digits and dashes), so the result is readable as
 * typed and needs no decoding by the person it is sent to.
 */
export function portfolioSearchFromFilterState(
  state: DealsFilterState,
  sections: readonly DealsFacetSection[],
): string {
  const parts: string[] = [];
  for (const section of sections) {
    const param = PORTFOLIO_URL_PARAM[section.field];
    if (!param) continue;
    const selected = new Set(state[section.field] ?? []);
    if (selected.size === 0) continue;
    const ordered = section.values.filter((v) => selected.has(v.id)).map((v) => v.id);
    if (ordered.length === 0) continue;
    parts.push(`${param}=${ordered.map(encodeURIComponent).join(',')}`);
  }
  return parts.join('&');
}
