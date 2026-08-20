import { describe, it, expect } from 'vitest';
import { buildSkuSet } from './hidden-skus';
import { planProductSlots, type ProductSlot } from './substitution';

interface Card {
  sku: string;
}
const card = (sku: string): Card => ({ sku });
const identify = (c: Card) => c.sku;
const NONE = new Set<string>();

function plan(
  skus: string[],
  opts: {
    perCategoryRemove?: string[];
    hidden?: string[];
    replacements?: Record<string, Card>;
  } = {},
): ProductSlot<Card>[] {
  return planProductSlots<Card>({
    skus,
    perCategoryRemove: new Set(opts.perCategoryRemove ?? []),
    hiddenEverywhere: buildSkuSet(opts.hidden ?? []),
    replacementBySku: new Map(Object.entries(opts.replacements ?? {})),
    identify,
  });
}

const shape = (slots: ProductSlot<Card>[]) =>
  slots.map((s) => (s.kind === 'sku' ? s.sku : `[${s.product.sku}]`));

describe('planProductSlots', () => {
  it('passes everything through when nothing is hidden', () => {
    expect(shape(plan(['a', 'b', 'c']))).toEqual(['a', 'b', 'c']);
  });

  it('substitutes IN PLACE, keeping the position and the length', () => {
    const slots = plan(['a', 'b', 'c'], { hidden: ['b'], replacements: { B: card('custom-1') } });
    expect(shape(slots)).toEqual(['a', '[custom-1]', 'c']);
  });

  it('matches the replacement case-insensitively, like every other hide rule', () => {
    const slots = plan(['505998 60P'], {
      hidden: ['  505998 60p  '],
      replacements: { '505998 60P': card('custom-1') },
    });
    expect(shape(slots)).toEqual(['[custom-1]']);
  });

  it('drops a hidden SKU that has no replacement', () => {
    expect(shape(plan(['a', 'b'], { hidden: ['b'] }))).toEqual(['a']);
  });

  it('a PER-CATEGORY removal never substitutes', () => {
    // The product was removed from this category because it does not belong
    // here; Patrick's version of the same product does not belong here either.
    const slots = plan(['a', 'b'], {
      perCategoryRemove: ['b'],
      hidden: ['b'],
      replacements: { B: card('custom-1') },
    });
    expect(shape(slots)).toEqual(['a']);
  });

  it('per-category removal wins even when the SKU is not hidden site-wide', () => {
    expect(shape(plan(['a', 'b'], { perCategoryRemove: ['b'] }))).toEqual(['a']);
  });

  it('renders one page ONCE when it replaces several SKUs in the same grid', () => {
    const both = card('custom-1');
    const slots = plan(['a', 'b', 'c', 'd'], {
      hidden: ['b', 'c'],
      replacements: { B: both, C: both },
    });
    // Shown at the FIRST position it was claimed for, and the grid is honestly
    // one shorter rather than showing the same page twice.
    expect(shape(slots)).toEqual(['a', '[custom-1]', 'd']);
  });

  it('keeps two different replacements separate', () => {
    const slots = plan(['a', 'b'], {
      hidden: ['a', 'b'],
      replacements: { A: card('custom-1'), B: card('custom-2') },
    });
    expect(shape(slots)).toEqual(['[custom-1]', '[custom-2]']);
  });

  it('de-dupes a repeated SKU at its first position, as before', () => {
    expect(shape(plan(['a', 'b', 'a']))).toEqual(['a', 'b']);
  });

  it('a repeated hidden SKU does not produce two replacement cards', () => {
    const slots = plan(['b', 'b'], { hidden: ['b'], replacements: { B: card('custom-1') } });
    expect(shape(slots)).toEqual(['[custom-1]']);
  });

  it('is a no-op with no rules at all', () => {
    const slots = planProductSlots<Card>({
      skus: ['a', 'b'],
      perCategoryRemove: NONE,
      hiddenEverywhere: NONE,
      identify,
    });
    expect(shape(slots)).toEqual(['a', 'b']);
  });

  it('hides without substituting when the map has no entry for that SKU', () => {
    const slots = plan(['a', 'b'], { hidden: ['a'], replacements: { B: card('custom-2') } });
    expect(shape(slots)).toEqual(['b']);
  });

  it('preserves the order of a longer grid with several substitutions', () => {
    const slots = plan(['s1', 's2', 's3', 's4', 's5'], {
      hidden: ['s2', 's4'],
      replacements: { S2: card('custom-a'), S4: card('custom-b') },
    });
    expect(shape(slots)).toEqual(['s1', '[custom-a]', 's3', '[custom-b]', 's5']);
  });
});
