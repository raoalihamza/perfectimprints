import { describe, expect, it } from 'vitest';
import {
  buildHiddenSkuSet,
  filterHiddenSkuItems,
  isSearchHiddenSku,
  normalizeSearchSku,
} from './hidden-skus';

describe('normalizeSearchSku', () => {
  it('trims and upper-cases', () => {
    expect(normalizeSearchSku('  501014  ')).toBe('501014');
    expect(normalizeSearchSku('501014 90a')).toBe('501014 90A');
  });

  it('preserves the space inside a real Geiger item number', () => {
    // "501014 90A" is one SKU, not two. Collapsing the space would stop it
    // matching the catalog value and silently fail to hide the product.
    expect(normalizeSearchSku('501014 90A')).toBe('501014 90A');
  });

  it('returns empty for missing or non-string input', () => {
    expect(normalizeSearchSku(undefined)).toBe('');
    expect(normalizeSearchSku(null)).toBe('');
    expect(normalizeSearchSku('   ')).toBe('');
  });
});

describe('buildHiddenSkuSet', () => {
  it('drops blanks and de-duplicates case-insensitively', () => {
    const set = buildHiddenSkuSet(['501014', ' 501014 ', '', '   ', null, undefined, '529664 90a']);
    expect(set.size).toBe(2);
    expect(set.has('501014')).toBe(true);
    expect(set.has('529664 90A')).toBe(true);
  });

  it('returns an empty set for null or undefined', () => {
    expect(buildHiddenSkuSet(null).size).toBe(0);
    expect(buildHiddenSkuSet(undefined).size).toBe(0);
    expect(buildHiddenSkuSet([]).size).toBe(0);
  });
});

describe('isSearchHiddenSku', () => {
  const hidden = buildHiddenSkuSet(['501014', '529664 90A']);

  it('matches regardless of the case or padding Patrick pasted', () => {
    expect(isSearchHiddenSku('501014', hidden)).toBe(true);
    expect(isSearchHiddenSku(' 501014 ', hidden)).toBe(true);
    expect(isSearchHiddenSku('529664 90a', hidden)).toBe(true);
  });

  it('does not match a different SKU, or a prefix of one', () => {
    expect(isSearchHiddenSku('501015', hidden)).toBe(false);
    expect(isSearchHiddenSku('50101', hidden)).toBe(false);
    expect(isSearchHiddenSku('529664', hidden)).toBe(false);
  });

  it('is false for missing input and for an empty list', () => {
    expect(isSearchHiddenSku(undefined, hidden)).toBe(false);
    expect(isSearchHiddenSku('', hidden)).toBe(false);
    expect(isSearchHiddenSku('501014', new Set())).toBe(false);
  });
});

describe('filterHiddenSkuItems', () => {
  const items = [
    { type: 'product', title: 'Hidden Bottle', sku: '501014' },
    { type: 'product', title: 'Visible Bottle', sku: '501015' },
    { type: 'product', title: 'Hidden Suffix', sku: '529664 90a' },
    { type: 'category', title: 'Water Bottles' },
    { type: 'brand', title: 'Vineyard Vines' },
    { type: 'blog', title: 'Bottle buying guide' },
    { type: 'product', title: 'Custom product with no item number' },
  ];

  it('removes only the listed SKUs', () => {
    const out = filterHiddenSkuItems(items, buildHiddenSkuSet(['501014', '529664 90A']));
    expect(out.map((i) => i.title)).toEqual([
      'Visible Bottle',
      'Water Bottles',
      'Vineyard Vines',
      'Bottle buying guide',
      'Custom product with no item number',
    ]);
  });

  it('keeps every entry that carries no SKU, whatever its type', () => {
    // Categories, brands, blogs, videos, FAQs and customProduct entries have no
    // item number to hide by. The filter must never be able to touch them.
    const out = filterHiddenSkuItems(items, buildHiddenSkuSet(['501014']));
    expect(out.filter((i) => !i.sku)).toHaveLength(4);
  });

  it('is a no-op when nothing is hidden, and returns the same list', () => {
    const out = filterHiddenSkuItems(items, new Set());
    expect(out).toBe(items);
  });

  it('removing a SKU from the list brings the item back', () => {
    const gone = filterHiddenSkuItems(items, buildHiddenSkuSet(['501014']));
    expect(gone.some((i) => i.title === 'Hidden Bottle')).toBe(false);
    const back = filterHiddenSkuItems(items, buildHiddenSkuSet([]));
    expect(back.some((i) => i.title === 'Hidden Bottle')).toBe(true);
  });
});
