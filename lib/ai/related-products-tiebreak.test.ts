/**
 * AUTO-205 Part 6: inside one score Patrick's own product ranks before a
 * Geiger one. Measured on FIX-911's 107 strips before shipping: no verdict
 * changed, 13 strips changed, his placements 3 to 23. The two other roads the
 * diagnostic measured (ordering, two passes) are recorded in CLAUDE.md and
 * must not come back; the structural half below says so.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { GeigerProduct } from '../product-types';

const product = (sku: string, name: string, detailUrl?: string): GeigerProduct =>
  ({ sku, name, brand: null, lowPrice: 1, highPrice: 2, msrp: 2, minQty: 50, imageUrl: null, geigerUrl: 'https://www.geiger.com/p/x', description: '', categoryPaths: [], badges: [], isNewItem: false, isOnSale: false, productTypeUnigram: null, detailUrl } as unknown as GeigerProduct);

// The category branch is the one list that mixes his cards with Geiger's.
vi.mock('../sanity/queries/effective-category-products', () => ({
  getEffectiveCategoryProducts: async () => [
    product('500001', 'Ornament'),
    product('500002', 'Metal Ornament'),
    product('custom-abc', 'Custom Shape Acrylic Holiday Ornaments - up to 6 sq. inches', '/products/acrylic-ornaments'),
    product('500003', 'Glass Ornament Set'),
    product('custom-def', 'Snow Globe Custom Christmas Ornaments', '/products/snow-globe-ornaments'),
  ],
}));

// eslint-disable-next-line import/first
import { matchRelatedProducts } from './related-products';

const root = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('the tie-break', () => {
  it('at one shared word his two pages come first, however long their names; the Geiger products follow by name length', async () => {
    const got = await matchRelatedProducts({ categorySlug: 'ornaments', keywords: ['ornaments'], limit: 5, includeCustom: false });
    expect(got.map((p) => p.sku)).toEqual(['custom-def', 'custom-abc', '500001', '500002', '500003']);
  });

  it('a higher score still wins over ownership: "metal ornaments" puts the metal ornament first', async () => {
    const got = await matchRelatedProducts({ categorySlug: 'ornaments', keywords: ['metal ornaments'], limit: 3, includeCustom: false });
    expect(got[0].sku).toBe('500002');
    expect(got[1].sku).toBe('custom-def');
  });
});

describe('what does not ship', () => {
  const matcher = read('lib/ai/related-products.ts');
  const gen = read('lib/blog-automation/generate-blog-post.ts');

  it('the tie-break is the one line after the score, and the ranking is otherwise what it was', () => {
    expect(matcher).toContain('if (b.score !== a.score) return b.score - a.score;\n      const ownA = isOwnProduct(a.p) ? 0 : 1;');
    expect(matcher).toContain('if (a.p.name.length !== b.p.name.length) return a.p.name.length - b.p.name.length;');
  });

  it('ideas are matched in the order the model wrote them (no "most specific first" ordering), and once (no two-pass matcher)', () => {
    const loop = gen.slice(gen.indexOf("if (template === 'list') {", gen.indexOf('// 2) Related products')), gen.indexOf('} else {', gen.indexOf('// 2) Related products')));
    expect(loop).toContain('for (const s of sections) {');
    expect(loop).not.toMatch(/\.sort\(/);
    expect(loop.match(/await matchIdeaStrip\(/g)).toHaveLength(1);
  });
});
