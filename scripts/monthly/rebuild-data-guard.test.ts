import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARGINS,
  countFacetUrlsWithProducts,
  evaluateRebuild,
  pageHasResolvableSku,
  productSkuSet,
} from './rebuild-data-guard';

// The real committed baseline as of SCRAPE-910, used so the failure cases
// below are the actual failure modes the guard exists to catch.
const BASELINE = {
  productCount: 7957,
  pagesWithProducts: 14413,
  facetUrlsWithProducts: 13968,
};

describe('evaluateRebuild', () => {
  it('passes when nothing changed', () => {
    const result = evaluateRebuild(BASELINE, { ...BASELINE });
    expect(result.ok).toBe(true);
    expect(result.findings.every((f) => !f.failed)).toBe(true);
  });

  it('passes when the catalog grew', () => {
    const result = evaluateRebuild(BASELINE, {
      productCount: 8185,
      pagesWithProducts: 14500,
      facetUrlsWithProducts: 14100,
    });
    expect(result.ok).toBe(true);
  });

  it('passes normal churn (small drops inside every margin)', () => {
    const result = evaluateRebuild(BASELINE, {
      productCount: 7800, // -1.97%
      pagesWithProducts: 14300, // -0.78%
      facetUrlsWithProducts: 13700, // -1.92%
    });
    expect(result.ok).toBe(true);
  });

  it('FAILS when the global top-up products are missing (the 822-SKU case)', () => {
    const result = evaluateRebuild(BASELINE, {
      ...BASELINE,
      productCount: 7135, // 7957 - 822 = a 10.33% drop, margin is 5%
    });
    expect(result.ok).toBe(false);
    const finding = result.findings.find((f) => f.metric === 'productCount');
    expect(finding?.failed).toBe(true);
    expect(finding?.dropPct).toBeCloseTo(10.33, 1);
    expect(finding?.message).toContain('7957');
    expect(finding?.message).toContain('7135');
    expect(finding?.message).toContain('refusing to open a PR');
  });

  it('FAILS when the Phase C recovery passes are missing (the 3,434-URL case)', () => {
    const result = evaluateRebuild(BASELINE, {
      ...BASELINE,
      facetUrlsWithProducts: 10534, // -24.59%, margin is 5%
    });
    expect(result.ok).toBe(false);
    const finding = result.findings.find((f) => f.metric === 'facetUrlsWithProducts');
    expect(finding?.failed).toBe(true);
    expect(finding?.dropPct).toBeCloseTo(24.59, 1);
  });

  it('FAILS when product-bearing pages collapse past 2%', () => {
    const result = evaluateRebuild(BASELINE, {
      ...BASELINE,
      pagesWithProducts: 14000, // -2.87%
    });
    expect(result.ok).toBe(false);
    expect(result.findings.find((f) => f.metric === 'pagesWithProducts')?.failed).toBe(true);
  });

  it('a drop exactly AT the margin passes; only past it fails', () => {
    const atMargin = evaluateRebuild(
      { productCount: 1000, pagesWithProducts: 1000, facetUrlsWithProducts: 1000 },
      { productCount: 950, pagesWithProducts: 980, facetUrlsWithProducts: 950 }
    );
    expect(atMargin.ok).toBe(true);
    const pastMargin = evaluateRebuild(
      { productCount: 1000, pagesWithProducts: 1000, facetUrlsWithProducts: 1000 },
      { productCount: 949, pagesWithProducts: 1000, facetUrlsWithProducts: 1000 }
    );
    expect(pastMargin.ok).toBe(false);
  });

  it('a missing or zero baseline passes with a note (first-ever run)', () => {
    const result = evaluateRebuild(
      { productCount: null, pagesWithProducts: 0, facetUrlsWithProducts: null },
      { productCount: 100, pagesWithProducts: 50, facetUrlsWithProducts: 40 }
    );
    expect(result.ok).toBe(true);
    for (const f of result.findings) {
      expect(f.dropPct).toBeNull();
      expect(f.message).toContain('no committed baseline');
    }
  });

  it('a total wipe (fresh = 0) fails every metric', () => {
    const result = evaluateRebuild(BASELINE, {
      productCount: 0,
      pagesWithProducts: 0,
      facetUrlsWithProducts: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.findings.filter((f) => f.failed)).toHaveLength(3);
  });

  it('respects custom margins', () => {
    const result = evaluateRebuild(
      { productCount: 100, pagesWithProducts: 100, facetUrlsWithProducts: 100 },
      { productCount: 90, pagesWithProducts: 100, facetUrlsWithProducts: 100 },
      { ...DEFAULT_MARGINS, productDropPct: 15 }
    );
    expect(result.ok).toBe(true);
  });
});

describe('productSkuSet', () => {
  it('dedupes, trims, and skips empty SKUs', () => {
    const set = productSkuSet({
      products: [{ sku: 'A' }, { sku: ' A ' }, { sku: '' }, { sku: '501014 90A' }, {}, { sku: 42 }],
    });
    expect(set).toEqual(new Set(['A', '501014 90A', '42']));
  });

  it('handles a missing products array', () => {
    expect(productSkuSet({})).toEqual(new Set());
    expect(productSkuSet(null)).toEqual(new Set());
  });
});

describe('countFacetUrlsWithProducts', () => {
  it('counts only URLs with a non-empty SKU list', () => {
    expect(
      countFacetUrlsWithProducts({
        memberships: { '/cat/a/x/y': ['S1'], '/cat/b/x/y': [], '/cat/c/x/y': ['S1', 'S2'] },
      })
    ).toBe(2);
  });

  it('handles a missing memberships map', () => {
    expect(countFacetUrlsWithProducts({})).toBe(0);
    expect(countFacetUrlsWithProducts(null)).toBe(0);
  });
});

describe('pageHasResolvableSku', () => {
  const catalog = new Set(['A', '501014 90A']);

  it('true when at least one SKU resolves', () => {
    expect(pageHasResolvableSku({ productSkus: ['dead', 'A'] }, catalog)).toBe(true);
    expect(pageHasResolvableSku({ productSkus: ['501014 90A'] }, catalog)).toBe(true);
  });

  it('false when nothing resolves or the list is missing', () => {
    expect(pageHasResolvableSku({ productSkus: ['dead'] }, catalog)).toBe(false);
    expect(pageHasResolvableSku({ productSkus: [] }, catalog)).toBe(false);
    expect(pageHasResolvableSku({}, catalog)).toBe(false);
  });
});
