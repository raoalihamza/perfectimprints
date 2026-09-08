/**
 * PORT-110: the /portfolio filter model. What the two sidebar groups offer,
 * how a selection travels in the URL both ways, and that the generic facet
 * rule the page binds to `tile.id` still behaves exactly as the deals /
 * catalog binding does for products.
 */
import { describe, expect, it } from 'vitest';

import { applyDealsFilters, applyFacetFilters, type DealsFacetSection } from '../deals-filter';
import type { GeigerProduct } from '../product-types';
import type { PortfolioCategoryRef, PortfolioItemCard } from './gallery';
import {
  PORTFOLIO_CATEGORY_FIELD,
  PORTFOLIO_COLOR_FIELD,
  PORTFOLIO_DECORATION_FIELD,
  PORTFOLIO_INDUSTRY_FIELD,
  PORTFOLIO_PAGE_SIZE,
  PORTFOLIO_URL_PARAM,
  buildPortfolioFacetSections,
  countActivePortfolioFilters,
  portfolioFilterStateFromSearch,
  portfolioSearchFromFilterState,
  shopLinkCategorySlugs,
} from './page-filters';

const caps: PortfolioCategoryRef = { _id: 'c-caps', title: 'Caps and Hats', slug: 'caps-and-hats', displayOrder: 2 };
const shirts: PortfolioCategoryRef = { _id: 'c-shirts', title: 'T-shirts', slug: 't-shirts', displayOrder: 1 };
const bags: PortfolioCategoryRef = { _id: 'c-bags', title: 'Bags', slug: 'bags', displayOrder: 3 };
const hiddenCat: PortfolioCategoryRef = { _id: 'c-hidden', title: 'Hidden', slug: 'hidden', hidden: true };

function item(
  id: string,
  category: PortfolioCategoryRef | null,
  colors: string[] = [],
  extra: Partial<PortfolioItemCard> = {},
): PortfolioItemCard {
  return { _id: id, title: `Item ${id}`, category, colors, ...extra };
}

const items: PortfolioItemCard[] = [
  item('a', caps, ['blue', 'white'], { decorationMethods: ['embroidered'], industry: 'fire-and-ems' }),
  item('b', caps, ['black'], { decorationMethods: ['embroidered', 'screen-printed'], industry: 'churches' }),
  item('c', shirts, ['red', 'navy'], { decorationMethods: ['screen-printed', 'sublimated'], industry: 'fire-and-ems' }),
  item('d', hiddenCat, ['black'], { industry: 'Military' }),
  item('e', null, []),
];

const sections = buildPortfolioFacetSections(items, [caps, shirts, bags, hiddenCat]);

describe('buildPortfolioFacetSections', () => {
  it('offers only categories that a visible item uses, in display order', () => {
    const category = sections.find((s) => s.field === PORTFOLIO_CATEGORY_FIELD)!;
    expect(category.label).toBe('Category');
    // bags has no item, hidden is hidden: neither is a button. shirts (order 1) precedes caps (order 2).
    expect(category.values.map((v) => v.id)).toEqual(['t-shirts', 'caps-and-hats']);
    expect(category.values.map((v) => v.label)).toEqual(['T-shirts', 'Caps and Hats']);
    expect(category.values.find((v) => v.id === 'caps-and-hats')!.skus).toEqual(['a', 'b']);
    expect(category.values.find((v) => v.id === 'caps-and-hats')!.count).toBe(2);
  });

  it('offers only colours a visible item carries, in vocabulary order, ignoring unknown tags', () => {
    const color = sections.find((s) => s.field === PORTFOLIO_COLOR_FIELD)!;
    expect(color.label).toBe('Color');
    expect(color.field).toBe('colors'); // DealsFilterSidebar shows swatches for this field only
    expect(color.values.map((v) => v.id)).toEqual(['black', 'blue', 'red', 'white']);
    // 'navy' is not in the vocabulary and must never become a filter button.
    expect(color.values.some((v) => v.id === 'navy')).toBe(false);
    expect(color.values.find((v) => v.id === 'black')!.skus).toEqual(['b', 'd']);
  });

  it('omits a group with nothing to offer, and every group for no items', () => {
    const noColours = buildPortfolioFacetSections([item('x', caps)], [caps]);
    expect(noColours.map((s) => s.field)).toEqual([PORTFOLIO_CATEGORY_FIELD]);
    expect(buildPortfolioFacetSections([], [caps, shirts])).toEqual([]);
    expect(buildPortfolioFacetSections([item('y', null, ['neon'])], [])).toHaveLength(1);
  });

  // PORT-160: the two further groups, built the same way from the same items.
  it('orders the groups category, decoration method, industry, colour', () => {
    expect(sections.map((s) => s.field)).toEqual([
      PORTFOLIO_CATEGORY_FIELD,
      PORTFOLIO_DECORATION_FIELD,
      PORTFOLIO_INDUSTRY_FIELD,
      PORTFOLIO_COLOR_FIELD,
    ]);
    expect(sections.map((s) => s.label)).toEqual(['Category', 'Decoration method', 'Industry', 'Color']);
  });

  it('offers only decoration methods a visible item carries, in vocabulary order, labelled as words', () => {
    const decoration = sections.find((s) => s.field === PORTFOLIO_DECORATION_FIELD)!;
    expect(decoration.values.map((v) => v.id)).toEqual(['embroidered', 'screen-printed']);
    expect(decoration.values.map((v) => v.label)).toEqual(['Embroidered', 'Screen printed']);
    // 'sublimated' is not in the vocabulary and must never become a button.
    expect(decoration.values.some((v) => v.id === 'sublimated')).toBe(false);
    expect(decoration.values.find((v) => v.id === 'screen-printed')!.skus).toEqual(['b', 'c']);
    expect(decoration.values.find((v) => v.id === 'embroidered')!.count).toBe(2);
  });

  it('offers only industries a visible item names, in vocabulary order, one per item', () => {
    const industry = sections.find((s) => s.field === PORTFOLIO_INDUSTRY_FIELD)!;
    expect(industry.values.map((v) => v.id)).toEqual(['churches', 'fire-and-ems']);
    expect(industry.values.map((v) => v.label)).toEqual(['Churches', 'Fire and EMS']);
    // 'Military' (wrong case, not in the vocabulary) never becomes a button.
    expect(industry.values.some((v) => v.id.toLowerCase() === 'military')).toBe(false);
    expect(industry.values.find((v) => v.id === 'fire-and-ems')!.skus).toEqual(['a', 'c']);
  });

  it('an item with neither field still counts in the other groups and the two new groups can be absent', () => {
    const only = buildPortfolioFacetSections([item('p', caps, ['red'])], [caps]);
    expect(only.map((s) => s.field)).toEqual([PORTFOLIO_CATEGORY_FIELD, PORTFOLIO_COLOR_FIELD]);
  });

  it('labels multi-word colours the way the Studio does', () => {
    const s = buildPortfolioFacetSections([item('m', caps, ['multi-color'])], [caps]);
    expect(s.find((x) => x.field === PORTFOLIO_COLOR_FIELD)!.values[0].label).toBe('Multi-Color');
  });
});

describe('the URL round trip', () => {
  it('writes readable, canonical query strings (group order, then value order)', () => {
    expect(
      portfolioSearchFromFilterState(
        { [PORTFOLIO_COLOR_FIELD]: ['white', 'black'], [PORTFOLIO_CATEGORY_FIELD]: ['caps-and-hats'] },
        sections,
      ),
    ).toBe('category=caps-and-hats&color=black,white');
  });

  it('writes an empty string for no selection and drops unknown values', () => {
    expect(portfolioSearchFromFilterState({}, sections)).toBe('');
    expect(portfolioSearchFromFilterState({ [PORTFOLIO_COLOR_FIELD]: ['navy'] }, sections)).toBe('');
    expect(portfolioSearchFromFilterState({ bogus: ['x'] }, sections)).toBe('');
  });

  it('reads back what it wrote', () => {
    const state = {
      [PORTFOLIO_CATEGORY_FIELD]: ['t-shirts', 'caps-and-hats'],
      [PORTFOLIO_COLOR_FIELD]: ['blue'],
    };
    const qs = portfolioSearchFromFilterState(state, sections);
    expect(qs).toBe('category=t-shirts,caps-and-hats&color=blue');
    expect(portfolioFilterStateFromSearch(`?${qs}`, sections)).toEqual(state);
    expect(portfolioFilterStateFromSearch(qs, sections)).toEqual(state);
  });

  it('is forgiving on read: case, whitespace, repeats, and unknown values', () => {
    expect(
      portfolioFilterStateFromSearch('?color=Black&color=%20white%20,navy&category=CAPS-AND-HATS', sections),
    ).toEqual({ [PORTFOLIO_CATEGORY_FIELD]: ['caps-and-hats'], [PORTFOLIO_COLOR_FIELD]: ['black', 'white'] });
    expect(portfolioFilterStateFromSearch('?color=navy', sections)).toEqual({});
    expect(portfolioFilterStateFromSearch('?utm_source=x', sections)).toEqual({});
    expect(portfolioFilterStateFromSearch('', sections)).toEqual({});
    expect(portfolioFilterStateFromSearch(null, sections)).toEqual({});
  });

  it('round-trips a legacy value that itself contains a comma or a space', () => {
    // The schema now forbids these, but a category published before that rule
    // (or written through the API) must still travel: the whole parameter is
    // matched against the known ids before any splitting.
    const odd: PortfolioCategoryRef = { _id: 'c-odd', title: 'Caps, hats', slug: 'caps, hats' };
    const oddSections = buildPortfolioFacetSections([item('z', odd)], [odd]);
    const state = { [PORTFOLIO_CATEGORY_FIELD]: ['caps, hats'] };
    const qs = portfolioSearchFromFilterState(state, oddSections);
    expect(qs).toBe('category=caps%2C%20hats');
    expect(portfolioFilterStateFromSearch(`?${qs}`, oddSections)).toEqual(state);
  });

  it('names the parameters the way a person would type them', () => {
    expect(PORTFOLIO_URL_PARAM[PORTFOLIO_CATEGORY_FIELD]).toBe('category');
    expect(PORTFOLIO_URL_PARAM[PORTFOLIO_COLOR_FIELD]).toBe('color');
    expect(PORTFOLIO_URL_PARAM[PORTFOLIO_DECORATION_FIELD]).toBe('decoration');
    expect(PORTFOLIO_URL_PARAM[PORTFOLIO_INDUSTRY_FIELD]).toBe('industry');
  });

  // PORT-160: all four groups travel, in sidebar order, and read back.
  it('carries all four groups in one link, in sidebar order, and reads them back', () => {
    const state = {
      [PORTFOLIO_COLOR_FIELD]: ['black'],
      [PORTFOLIO_INDUSTRY_FIELD]: ['fire-and-ems'],
      [PORTFOLIO_CATEGORY_FIELD]: ['caps-and-hats'],
      [PORTFOLIO_DECORATION_FIELD]: ['screen-printed', 'embroidered'],
    };
    const qs = portfolioSearchFromFilterState(state, sections);
    expect(qs).toBe(
      'category=caps-and-hats&decoration=embroidered,screen-printed&industry=fire-and-ems&color=black',
    );
    expect(portfolioFilterStateFromSearch(`?${qs}`, sections)).toEqual({
      [PORTFOLIO_CATEGORY_FIELD]: ['caps-and-hats'],
      [PORTFOLIO_DECORATION_FIELD]: ['embroidered', 'screen-printed'],
      [PORTFOLIO_INDUSTRY_FIELD]: ['fire-and-ems'],
      [PORTFOLIO_COLOR_FIELD]: ['black'],
    });
  });

  it('a PORT-110 two-group link still reads back identically under the new group order', () => {
    expect(portfolioFilterStateFromSearch('?color=black&category=caps-and-hats', sections)).toEqual({
      [PORTFOLIO_CATEGORY_FIELD]: ['caps-and-hats'],
      [PORTFOLIO_COLOR_FIELD]: ['black'],
    });
  });

  it('drops an unknown decoration or industry from a pasted link without complaint', () => {
    expect(portfolioFilterStateFromSearch('?decoration=sublimated&industry=military', sections)).toEqual({});
    expect(portfolioFilterStateFromSearch('?decoration=Embroidered,sublimated', sections)).toEqual({
      [PORTFOLIO_DECORATION_FIELD]: ['embroidered'],
    });
  });

  it('counts active values across groups', () => {
    expect(countActivePortfolioFilters({})).toBe(0);
    expect(countActivePortfolioFilters({ a: ['1', '2'], b: ['3'] })).toBe(3);
  });
});

describe('applyFacetFilters over tiles: OR within a group, AND across groups', () => {
  const tiles = items.map((i) => ({ id: i._id }));
  const filter = (state: Record<string, string[]>) =>
    applyFacetFilters(tiles, sections, state, (t) => t.id).map((t) => t.id);

  it('returns the input list itself with no filter', () => {
    expect(applyFacetFilters(tiles, sections, {}, (t) => t.id)).toBe(tiles);
  });

  it('ORs within the colour group', () => {
    expect(filter({ [PORTFOLIO_COLOR_FIELD]: ['black', 'red'] })).toEqual(['b', 'c', 'd']);
  });

  it('ANDs across category and colour', () => {
    expect(filter({ [PORTFOLIO_CATEGORY_FIELD]: ['caps-and-hats'], [PORTFOLIO_COLOR_FIELD]: ['black'] })).toEqual(['b']);
    expect(filter({ [PORTFOLIO_CATEGORY_FIELD]: ['t-shirts'], [PORTFOLIO_COLOR_FIELD]: ['black'] })).toEqual([]);
  });

  it('keeps the input order', () => {
    expect(filter({ [PORTFOLIO_COLOR_FIELD]: ['white', 'black'] })).toEqual(['a', 'b', 'd']);
  });

  it('ignores a selection for a group the sections do not carry', () => {
    expect(filter({ bogus: ['x'] })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  // PORT-160: the same rule over the two new groups, no parallel path.
  it('ORs within decoration and within industry', () => {
    expect(filter({ [PORTFOLIO_DECORATION_FIELD]: ['embroidered', 'screen-printed'] })).toEqual(['a', 'b', 'c']);
    expect(filter({ [PORTFOLIO_INDUSTRY_FIELD]: ['churches', 'fire-and-ems'] })).toEqual(['a', 'b', 'c']);
  });

  it('ANDs across all four groups', () => {
    expect(
      filter({
        [PORTFOLIO_CATEGORY_FIELD]: ['caps-and-hats'],
        [PORTFOLIO_DECORATION_FIELD]: ['screen-printed'],
        [PORTFOLIO_INDUSTRY_FIELD]: ['churches'],
        [PORTFOLIO_COLOR_FIELD]: ['black'],
      }),
    ).toEqual(['b']);
    expect(filter({ [PORTFOLIO_DECORATION_FIELD]: ['embroidered'], [PORTFOLIO_INDUSTRY_FIELD]: ['fire-and-ems'] })).toEqual(['a']);
    expect(filter({ [PORTFOLIO_CATEGORY_FIELD]: ['t-shirts'], [PORTFOLIO_DECORATION_FIELD]: ['embroidered'] })).toEqual([]);
  });

  it('an item with neither new field is kept by category or colour alone and dropped by any decoration or industry filter', () => {
    expect(filter({ [PORTFOLIO_COLOR_FIELD]: ['black'] })).toContain('d');
    expect(filter({ [PORTFOLIO_DECORATION_FIELD]: ['embroidered'] })).not.toContain('d');
    expect(filter({ [PORTFOLIO_INDUSTRY_FIELD]: ['churches'] })).not.toContain('e');
  });
});

describe('shopLinkCategorySlugs (PORT-160): which shop links sit under the grid', () => {
  const tiles = items.map((i) => ({ category: i.category?.slug ? { slug: i.category.slug } : null }));

  it('the ticked categories, in sidebar order, whatever order they were clicked', () => {
    expect(shopLinkCategorySlugs({ [PORTFOLIO_CATEGORY_FIELD]: ['caps-and-hats', 't-shirts'] }, sections, tiles)).toEqual([
      't-shirts',
      'caps-and-hats',
    ]);
    expect(shopLinkCategorySlugs({ [PORTFOLIO_CATEGORY_FIELD]: ['caps-and-hats'] }, sections, [])).toEqual([
      'caps-and-hats',
    ]);
  });

  it('with no category ticked, the categories of the shown tiles (every offered one on the unfiltered page)', () => {
    expect(shopLinkCategorySlugs({}, sections, tiles)).toEqual(['t-shirts', 'caps-and-hats']);
    expect(shopLinkCategorySlugs({ [PORTFOLIO_COLOR_FIELD]: ['red'] }, sections, [tiles[2]])).toEqual(['t-shirts']);
    // A hidden category is not offered, so it is never a shop link even if a shown tile carries it.
    expect(shopLinkCategorySlugs({}, sections, [tiles[3]])).toEqual([]);
  });

  it('is empty with no tiles shown, and with no category group at all', () => {
    expect(shopLinkCategorySlugs({}, sections, [])).toEqual([]);
    expect(shopLinkCategorySlugs({ [PORTFOLIO_CATEGORY_FIELD]: ['caps-and-hats'] }, [], tiles)).toEqual([]);
  });
});

describe('applyDealsFilters is unchanged for products', () => {
  const facets: DealsFacetSection[] = [
    {
      field: 'colors',
      label: 'Color',
      type: 'list',
      values: [
        { id: 'blue', value: 'Blue', label: 'Blue', count: 2, type: 'value', low: null, high: null, skus: ['501', '502'] },
        { id: 'red', value: 'Red', label: 'Red', count: 1, type: 'value', low: null, high: null, skus: ['503'] },
      ],
    },
    {
      field: 'brand',
      label: 'Brand',
      type: 'list',
      values: [
        { id: 'bic', value: 'BIC', label: 'BIC', count: 2, type: 'value', low: null, high: null, skus: ['501', '503'] },
      ],
    },
  ];
  const product = (sku: string) => ({ sku }) as unknown as GeigerProduct;
  const products = [product('501'), product('502'), product('503'), product('504')];

  it('still keys on sku with the same semantics', () => {
    expect(applyDealsFilters(products, facets, {})).toBe(products);
    expect(applyDealsFilters(products, facets, { colors: ['blue', 'red'] }).map((p) => p.sku)).toEqual(['501', '502', '503']);
    expect(applyDealsFilters(products, facets, { colors: ['blue'], brand: ['bic'] }).map((p) => p.sku)).toEqual(['501']);
    expect(applyDealsFilters(products, facets, { colors: ['red'], brand: ['nope'] })).toEqual([]);
  });
});

describe('page size', () => {
  it('is a multiple of every column count the grid uses (2, 3, 4)', () => {
    expect(PORTFOLIO_PAGE_SIZE % 2).toBe(0);
    expect(PORTFOLIO_PAGE_SIZE % 3).toBe(0);
    expect(PORTFOLIO_PAGE_SIZE % 4).toBe(0);
  });
});
