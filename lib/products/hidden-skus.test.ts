import { describe, it, expect } from 'vitest';
import {
  normalizeSku,
  buildSkuSet,
  isHiddenSku,
  filterHiddenSkuItems,
  filterHiddenSkuList,
} from './hidden-skus';

describe('normalizeSku', () => {
  it('trims and upper-cases', () => {
    expect(normalizeSku('  505998 60p  ')).toBe('505998 60P');
  });

  it('PRESERVES the internal space of a real item number', () => {
    // Regression guard: "501014 90A" is one SKU, not two. Collapsing the space
    // would make it stop matching the catalog entirely.
    expect(normalizeSku('501014 90A')).toBe('501014 90A');
  });

  it('returns empty string for non-strings and blanks', () => {
    expect(normalizeSku(null)).toBe('');
    expect(normalizeSku(undefined)).toBe('');
    expect(normalizeSku('   ')).toBe('');
  });
});

describe('buildSkuSet', () => {
  it('drops blanks and de-dupes case-insensitively', () => {
    expect(buildSkuSet(['519423', '  ', '519423', '519423 ', null, undefined]).size).toBe(1);
  });

  it('is empty for a missing list', () => {
    expect(buildSkuSet(undefined).size).toBe(0);
    expect(buildSkuSet(null).size).toBe(0);
  });
});

describe('isHiddenSku', () => {
  const hidden = buildSkuSet(['519423', '505998 60P']);

  it('matches regardless of case or surrounding whitespace', () => {
    expect(isHiddenSku(' 505998 60p ', hidden)).toBe(true);
    expect(isHiddenSku('519423', hidden)).toBe(true);
  });

  it('does not match a different SKU', () => {
    expect(isHiddenSku('519425', hidden)).toBe(false);
  });

  it('never matches a blank or missing sku, even against a non-empty set', () => {
    expect(isHiddenSku('', hidden)).toBe(false);
    expect(isHiddenSku(null, hidden)).toBe(false);
    expect(isHiddenSku(undefined, hidden)).toBe(false);
  });

  it('is false for everything when nothing is hidden', () => {
    expect(isHiddenSku('519423', buildSkuSet([]))).toBe(false);
  });
});

describe('filterHiddenSkuItems', () => {
  const hidden = buildSkuSet(['519423']);

  it('removes only the hidden entry', () => {
    const items = [{ sku: '519423' }, { sku: '521794' }];
    expect(filterHiddenSkuItems(items, hidden)).toEqual([{ sku: '521794' }]);
  });

  it('keeps entries that carry no sku (categories, brands, blogs, videos, FAQs)', () => {
    const items = [{ sku: null }, {}, { sku: '519423' }];
    expect(filterHiddenSkuItems(items, hidden)).toHaveLength(2);
  });

  it("never removes Patrick's own products, whose ids are synthetic", () => {
    // A customProduct / productPage id is `custom-<sanity id>` and is not
    // pickable in the SKU picker, so the site-wide list can never contain one.
    const items = [{ sku: 'custom-abc123' }];
    expect(filterHiddenSkuItems(items, hidden)).toHaveLength(1);
  });

  it('returns the same array reference when nothing is hidden', () => {
    const items = [{ sku: '519423' }];
    expect(filterHiddenSkuItems(items, buildSkuSet([]))).toBe(items);
  });
});

describe('filterHiddenSkuList', () => {
  it('drops hidden SKUs and preserves order', () => {
    const hidden = buildSkuSet(['b']);
    expect(filterHiddenSkuList(['a', 'b', 'c'], hidden)).toEqual(['a', 'c']);
  });

  it('returns the same array reference when nothing is hidden', () => {
    const list = ['a'];
    expect(filterHiddenSkuList(list, buildSkuSet([]))).toBe(list);
  });
});
