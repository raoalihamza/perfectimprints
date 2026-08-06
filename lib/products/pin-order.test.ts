import { describe, expect, it } from 'vitest';
import { applyPinnedOrder } from './pin-order';

const p = (sku: string) => ({ sku, name: `Product ${sku}` });

describe('applyPinnedOrder', () => {
  it('moves pinned products to the front in pin order', () => {
    const list = [p('A'), p('B'), p('C'), p('D')];
    const out = applyPinnedOrder(list, ['C', 'A']);
    expect(out.map((x) => x.sku)).toEqual(['C', 'A', 'B', 'D']);
  });

  it('keeps the relative order of everything that is not pinned', () => {
    const list = [p('A'), p('B'), p('C'), p('D'), p('E')];
    const out = applyPinnedOrder(list, ['D']);
    expect(out.map((x) => x.sku)).toEqual(['D', 'A', 'B', 'C', 'E']);
  });

  it('never adds a pinned SKU that is not in the list (reorder only)', () => {
    const list = [p('A'), p('B')];
    const out = applyPinnedOrder(list, ['ZZZ', 'B']);
    expect(out.map((x) => x.sku)).toEqual(['B', 'A']);
    expect(out).toHaveLength(2);
  });

  it('returns the input array untouched when there are no pins', () => {
    const list = [p('A'), p('B')];
    expect(applyPinnedOrder(list, [])).toBe(list);
    expect(applyPinnedOrder(list, undefined)).toBe(list);
    expect(applyPinnedOrder(list, null)).toBe(list);
  });

  it('returns the input array untouched when no pin matches', () => {
    const list = [p('A'), p('B')];
    expect(applyPinnedOrder(list, ['X', 'Y'])).toBe(list);
  });

  it('ignores blank entries and keeps the first position of a duplicate pin', () => {
    const list = [p('A'), p('B'), p('C')];
    const out = applyPinnedOrder(list, ['', '  ', 'B', 'C', 'B']);
    expect(out.map((x) => x.sku)).toEqual(['B', 'C', 'A']);
  });

  it('trims pin entries so a padded picker value still matches', () => {
    const list = [p('A'), p('B')];
    const out = applyPinnedOrder(list, ['  B  ']);
    expect(out.map((x) => x.sku)).toEqual(['B', 'A']);
  });

  it('preserves membership: same SKUs before and after, just reordered', () => {
    const list = [p('A'), p('B'), p('C'), p('D')];
    const out = applyPinnedOrder(list, ['D', 'B']);
    expect([...out.map((x) => x.sku)].sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('handles a SKU with an internal space (real Geiger item numbers)', () => {
    const list = [p('501014 90A'), p('B')];
    const out = applyPinnedOrder(list, ['501014 90A']);
    expect(out.map((x) => x.sku)).toEqual(['501014 90A', 'B']);
  });

  it('pins ahead of everything, including earlier custom-product entries', () => {
    // mergeCategoryProducts puts custom/added products first; a pin outranks them.
    const list = [p('custom-abc123'), p('A'), p('B')];
    const out = applyPinnedOrder(list, ['B']);
    expect(out.map((x) => x.sku)).toEqual(['B', 'custom-abc123', 'A']);
  });

  it('handles an empty product list', () => {
    expect(applyPinnedOrder([], ['A'])).toEqual([]);
  });
});
