/**
 * PORT-100: the gallery resolver's rules, pinned. Every future surface
 * (the /portfolio page, the four PORT-120 placements) renders what this
 * function returns, so a rule change here is a rule change everywhere.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GALLERY_LIMIT,
  MAX_GALLERY_LIMIT,
  PORTFOLIO_GALLERY_PROJECTION,
  PORTFOLIO_ITEM_PROJECTION,
  dedupePortfolioItems,
  effectiveGalleryLimit,
  filterPortfolioItems,
  isSanityReferenceStub,
  isVisiblePortfolioItem,
  portfolioGalleryCategoryRefId,
  portfolioGalleryItemRefIds,
  portfolioItemColors,
  resolvePortfolioGalleryItems,
  sortPortfolioCategories,
  sortPortfolioItems,
  type PortfolioCategoryRef,
  type PortfolioItemCard,
} from './gallery';

const caps: PortfolioCategoryRef = { _id: 'cat-caps', title: 'Caps and Hats', slug: 'caps-and-hats' };
const tees: PortfolioCategoryRef = { _id: 'cat-tees', title: 'T-shirts', slug: 't-shirts' };

function item(id: string, over: Partial<PortfolioItemCard> = {}): PortfolioItemCard {
  return {
    _id: id,
    _createdAt: '2026-08-01T00:00:00Z',
    title: `Item ${id}`,
    category: caps,
    colors: ['black'],
    ...over,
  };
}

describe('effectiveGalleryLimit', () => {
  it('defaults when unset, zero, negative or not a number, and clamps the top', () => {
    expect(effectiveGalleryLimit(undefined)).toBe(DEFAULT_GALLERY_LIMIT);
    expect(effectiveGalleryLimit(null)).toBe(DEFAULT_GALLERY_LIMIT);
    expect(effectiveGalleryLimit(0)).toBe(DEFAULT_GALLERY_LIMIT);
    expect(effectiveGalleryLimit(-3)).toBe(DEFAULT_GALLERY_LIMIT);
    expect(effectiveGalleryLimit(Number.NaN)).toBe(DEFAULT_GALLERY_LIMIT);
    expect(effectiveGalleryLimit(5.9)).toBe(5);
    expect(effectiveGalleryLimit(1000)).toBe(MAX_GALLERY_LIMIT);
  });
});

describe('visibility and order', () => {
  it('a hidden or titleless or dangling item is not visible', () => {
    expect(isVisiblePortfolioItem(null)).toBe(false);
    expect(isVisiblePortfolioItem(item('a', { hidden: true }))).toBe(false);
    expect(isVisiblePortfolioItem(item('a', { title: '' }))).toBe(false);
    expect(isVisiblePortfolioItem(item('a'))).toBe(true);
  });

  it('sorts featured first, then displayOrder ascending with unset last, then newest first', () => {
    const list = [
      item('old-unordered', { _createdAt: '2026-01-01T00:00:00Z' }),
      item('new-unordered', { _createdAt: '2026-08-01T00:00:00Z' }),
      item('order-2', { displayOrder: 2 }),
      item('featured-late', { featured: true, displayOrder: 9 }),
      item('order-1', { displayOrder: 1 }),
      item('featured-first', { featured: true, displayOrder: 1 }),
    ];
    expect(sortPortfolioItems(list).map((i) => i._id)).toEqual([
      'featured-first',
      'featured-late',
      'order-1',
      'order-2',
      'new-unordered',
      'old-unordered',
    ]);
  });

  it('sorts categories by displayOrder then title', () => {
    const list = [
      { ...tees },
      { ...caps, displayOrder: 2 },
      { _id: 'c', title: 'Bags', slug: 'bags', displayOrder: 1 },
      { _id: 'd', title: 'Other', slug: 'other' },
    ];
    expect(sortPortfolioCategories(list).map((c) => c.slug)).toEqual([
      'bags',
      'caps-and-hats',
      'other',
      't-shirts',
    ]);
  });

  it('dedupes by id keeping the first occurrence', () => {
    expect(dedupePortfolioItems([item('a'), item('b'), item('a')]).map((i) => i._id)).toEqual(['a', 'b']);
  });
});

describe('hand-picked galleries', () => {
  it('keeps the editor order, drops nulls and hidden items, shows a twice-picked item once', () => {
    const items = resolvePortfolioGalleryItems({
      mode: 'manual',
      items: [item('z'), null, item('a', { hidden: true }), item('m'), item('z')],
    });
    expect(items.map((i) => i._id)).toEqual(['z', 'm']);
  });

  it('does not re-sort a hand-picked list by featured or displayOrder', () => {
    const items = resolvePortfolioGalleryItems({
      mode: 'manual',
      items: [item('plain', { displayOrder: 9 }), item('star', { featured: true, displayOrder: 1 })],
    });
    expect(items.map((i) => i._id)).toEqual(['plain', 'star']);
  });

  it('treats an unset mode as hand picked and applies the limit', () => {
    const items = resolvePortfolioGalleryItems({
      items: Array.from({ length: 12 }, (_, i) => item(`i${i}`)),
      limit: 3,
    });
    expect(items).toHaveLength(3);
    expect(resolvePortfolioGalleryItems({ items: [item('a')] })).toHaveLength(1);
  });

  it('a hidden gallery renders nothing regardless of its items', () => {
    expect(resolvePortfolioGalleryItems({ mode: 'manual', hidden: true, items: [item('a')] })).toEqual([]);
    expect(resolvePortfolioGalleryItems(null)).toEqual([]);
  });
});

describe('category galleries', () => {
  const pool = [
    item('tee-1', { category: tees }),
    item('cap-plain', { displayOrder: 5 }),
    item('cap-hidden', { hidden: true, featured: true }),
    item('cap-star', { featured: true }),
    item('cap-first', { displayOrder: 1 }),
    item('cap-plain'),
  ];

  it('takes only the visible items of that category, in site order, deduped', () => {
    const items = resolvePortfolioGalleryItems({ mode: 'category', category: caps }, pool);
    expect(items.map((i) => i._id)).toEqual(['cap-star', 'cap-first', 'cap-plain']);
  });

  it('applies the limit after sorting so the featured item is never cut', () => {
    const items = resolvePortfolioGalleryItems({ mode: 'category', category: caps, limit: 1 }, pool);
    expect(items.map((i) => i._id)).toEqual(['cap-star']);
  });

  it('resolves to nothing when the category is unset, hidden or gone', () => {
    expect(resolvePortfolioGalleryItems({ mode: 'category' }, pool)).toEqual([]);
    expect(resolvePortfolioGalleryItems({ mode: 'category', category: null }, pool)).toEqual([]);
    expect(
      resolvePortfolioGalleryItems({ mode: 'category', category: { ...caps, hidden: true } }, pool),
    ).toEqual([]);
  });

  it('ignores hand-picked items when in category mode', () => {
    const items = resolvePortfolioGalleryItems(
      { mode: 'category', category: tees, items: [item('cap-star')] },
      pool,
    );
    expect(items.map((i) => i._id)).toEqual(['tee-1']);
  });
});

describe('filters for the /portfolio page', () => {
  const list = [
    item('a', { colors: ['black', 'red'] }),
    item('b', { category: tees, colors: ['red'] }),
    item('c', { colors: ['navy'] }),
  ];

  it('filters by category, by colour, by both, and passes everything through unset', () => {
    expect(filterPortfolioItems(list, {}).map((i) => i._id)).toEqual(['a', 'b', 'c']);
    expect(filterPortfolioItems(list, { category: 't-shirts' }).map((i) => i._id)).toEqual(['b']);
    expect(filterPortfolioItems(list, { color: 'red' }).map((i) => i._id)).toEqual(['a', 'b']);
    expect(filterPortfolioItems(list, { category: 'caps-and-hats', color: 'red' }).map((i) => i._id)).toEqual(['a']);
  });

  it('an unknown colour on an item never matches a filter and never appears as a colour', () => {
    expect(portfolioItemColors(list[2])).toEqual([]);
    expect(filterPortfolioItems(list, { color: 'navy' })).toEqual([]);
  });
});

describe('projections', () => {
  it('dereference the category and the items so the resolver gets cards, not references', () => {
    expect(PORTFOLIO_ITEM_PROJECTION).toContain('"category": category->');
    expect(PORTFOLIO_GALLERY_PROJECTION).toContain('"items": items[]->');
    expect(PORTFOLIO_GALLERY_PROJECTION).toContain('"category": category->');
    expect(PORTFOLIO_GALLERY_PROJECTION).toContain('hidden');
  });
});

describe('the stored block shape (PORT-120): references in, ids out', () => {
  const ref = (id: string, key = id) => ({ _ref: id, _key: key, _type: 'reference' });

  it('recognises a reference stub and nothing else', () => {
    expect(isSanityReferenceStub(ref('item-1'))).toBe(true);
    expect(isSanityReferenceStub({ _ref: '' })).toBe(false);
    expect(isSanityReferenceStub(item('item-1'))).toBe(false);
    expect(isSanityReferenceStub(null)).toBe(false);
    expect(isSanityReferenceStub('item-1')).toBe(false);
  });

  it('lists the referenced item ids in the editor order, once each, skipping nulls and cards', () => {
    expect(
      portfolioGalleryItemRefIds({
        items: [ref('b'), null, ref('a'), ref('b', 'again'), item('c')],
      }),
    ).toEqual(['b', 'a']);
    expect(portfolioGalleryItemRefIds({ items: null })).toEqual([]);
    expect(portfolioGalleryItemRefIds(undefined)).toEqual([]);
  });

  it('gives the category reference id, or null when unset or already projected', () => {
    expect(portfolioGalleryCategoryRefId({ mode: 'category', category: ref('cat-caps') })).toBe('cat-caps');
    expect(portfolioGalleryCategoryRefId({ mode: 'category', category: caps })).toBeNull();
    expect(portfolioGalleryCategoryRefId({ mode: 'category', category: null })).toBeNull();
    expect(portfolioGalleryCategoryRefId(null)).toBeNull();
  });

  it('a stub that was never resolved is not a visible item, so an unresolved reference renders nothing', () => {
    // The server binding replaces stubs with cards or null; if one ever
    // reached the pure resolver unresolved it must fall out, not crash.
    const stub = ref('item-1') as unknown as PortfolioItemCard;
    expect(resolvePortfolioGalleryItems({ items: [stub, item('ok')] }).map((i) => i._id)).toEqual(['ok']);
  });

  it('a deleted or hidden category, or one whose items are all hidden, resolves to nothing', () => {
    expect(resolvePortfolioGalleryItems({ mode: 'category', category: null }, [item('a')])).toEqual([]);
    expect(
      resolvePortfolioGalleryItems({ mode: 'category', category: { ...caps, hidden: true } }, [item('a')]),
    ).toEqual([]);
    expect(
      resolvePortfolioGalleryItems({ mode: 'category', category: caps }, [item('a', { hidden: true })]),
    ).toEqual([]);
  });
});
