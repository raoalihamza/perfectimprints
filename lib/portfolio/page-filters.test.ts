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
  PORTFOLIO_PAGE_SIZE,
  PORTFOLIO_URL_PARAM,
  buildPortfolioFacetSections,
  countActivePortfolioFilters,
  portfolioFilterStateFromSearch,
  portfolioSearchFromFilterState,
} from './page-filters';

const caps: PortfolioCategoryRef = { _id: 'c-caps', title: 'Caps and Hats', slug: 'caps-and-hats', displayOrder: 2 };
const shirts: PortfolioCategoryRef = { _id: 'c-shirts', title: 'T-shirts', slug: 't-shirts', displayOrder: 1 };
const bags: PortfolioCategoryRef = { _id: 'c-bags', title: 'Bags', slug: 'bags', displayOrder: 3 };
const hiddenCat: PortfolioCategoryRef = { _id: 'c-hidden', title: 'Hidden', slug: 'hidden', hidden: true };

function item(id: string, category: PortfolioCategoryRef | null, colors: string[] = []): PortfolioItemCard {
  return { _id: id, title: `Item ${id}`, category, colors };
}

const items: PortfolioItemCard[] = [
  item('a', caps, ['blue', 'white']),
  item('b', caps, ['black']),
  item('c', shirts, ['red', 'navy']),
  item('d', hiddenCat, ['black']),
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

  it('omits a group with nothing to offer, and both groups for no items', () => {
    const noColours = buildPortfolioFacetSections([item('x', caps)], [caps]);
    expect(noColours.map((s) => s.field)).toEqual([PORTFOLIO_CATEGORY_FIELD]);
    expect(buildPortfolioFacetSections([], [caps, shirts])).toEqual([]);
    expect(buildPortfolioFacetSections([item('y', null, ['neon'])], [])).toHaveLength(1);
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
