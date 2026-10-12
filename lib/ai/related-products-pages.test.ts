/**
 * AUTO-204: the blog's list idea strips also scan Patrick's own published
 * Product Pages, at the CATALOGUE floor and under the product-noun rule.
 *
 * FIX-911 measured both forms on its 107 stored strips. At one shared word
 * (the general floor) the scan put santa hats under every hat idea and glow
 * sticks under "sunscreen sticks": 19 drifted strips against 11. At the
 * catalogue floor with the noun rule no verdict changed and one strip gained
 * his own pages ("mini foam footballs"). AUTO-204 re-ran the 107 with the
 * shipped code: 67 right, 4 mixed, 7 wrong, 29 empty, before and after.
 *
 * The product-page read sits behind `server-only` and Sanity, so it is mocked
 * here with a handful of pages; the catalogue is the real products.json and
 * the category branch is the baked list (no Sanity under vitest).
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGES = [
  { _id: 'foam', title: '7" Foam Mini Footballs', slug: 'foam-mini-footballs' },
  { _id: 'plastic', title: '6" Plastic Mini Footballs', slug: 'plastic-mini-footballs' },
  { _id: 'santa', title: 'Plush Santa Hats', slug: 'plush-santa-hats' },
  { _id: 'glow', title: 'Glow In The Dark Wristbands', slug: 'glow-wristbands' },
  { _id: 'koozie', title: 'Embroidered Koozies With Pocket', slug: 'embroidered-koozies' },
];

vi.mock('../sanity/queries/product-pages', () => ({
  getAllProductPageCards: async () => PAGES,
  productPageToGeigerProduct: (card: { _id: string; title: string; slug: string }) => ({
    sku: `custom-${card._id}`,
    name: card.title,
    brand: '',
    detailUrl: `/products/${card.slug}`,
  }),
}));

// eslint-disable-next-line import/first
import { catalogTopUpFloor, matchRelatedProducts, productNounOf } from './related-products';

const root = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');
const own = (sku: string) => sku.startsWith('custom-');

/** What matchIdeaStrip passes for an idea, without a category. */
function ideaOptions(phrase: string) {
  return {
    keywords: [phrase],
    limit: 4,
    minScore: 1,
    catalogMinScore: catalogTopUpFloor([phrase], 2),
    scanMustCarry: productNounOf(phrase),
    includeCustom: false as const,
    includeProductPages: true,
  };
}

describe('the product-page scan in a list idea strip', () => {
  it("offers his own pages that share the phrase's words and carry its noun, AHEAD of the Geiger catalogue", async () => {
    const got = await matchRelatedProducts(ideaOptions('mini foam footballs'));
    expect(got.slice(0, 2).map((p) => p.name)).toEqual(['7" Foam Mini Footballs', '6" Plastic Mini Footballs']);
    expect(got.slice(0, 2).every((p) => p.detailUrl?.startsWith('/products/'))).toBe(true);
    // The rest of the strip is the Geiger catalogue, as before, each product a football.
    const geiger = got.filter((p) => !own(p.sku));
    expect(geiger.length).toBeGreaterThan(0);
    for (const p of geiger) expect(p.name).toMatch(/football/i);
  });

  it('one shared word is not enough: santa hats do not go under a trucker hat idea (the 19-drifted form FIX-911 measured)', async () => {
    const got = await matchRelatedProducts(ideaOptions('recycled trucker hats'));
    expect(got.some((p) => own(p.sku))).toBe(false);
    // The same call at the general floor is the form that was rejected: it lets the santa hats in.
    const loose = await matchRelatedProducts({ ...ideaOptions('recycled trucker hats'), catalogMinScore: 1 });
    expect(loose.map((p) => p.name)).toContain('Plush Santa Hats');
  });

  it('two shared modifiers are not the product: glow wristbands do not go under a football idea', async () => {
    const got = await matchRelatedProducts(ideaOptions('glow in the dark footballs'));
    expect(got.map((p) => p.name)).not.toContain('Glow In The Dark Wristbands');
    // Without the noun rule the two shared words ("glow", "dark") would have been enough.
    const noNoun = await matchRelatedProducts({ ...ideaOptions('glow in the dark footballs'), scanMustCarry: null });
    expect(noNoun.map((p) => p.name)).toContain('Glow In The Dark Wristbands');
  });

  it('is opt-in: a caller that does not ask gets no product page', async () => {
    const { includeProductPages: _on, ...off } = ideaOptions('mini foam footballs');
    void _on;
    expect((await matchRelatedProducts(off)).some((p) => own(p.sku))).toBe(false);
  });

  it('a caller that passes no catalogue floor (the /products related carousel) scans pages at the general floor, as it always did', async () => {
    const got = await matchRelatedProducts({ keywords: ['trucker hats'], limit: 8, includeCustom: false, includeProductPages: true });
    expect(got.map((p) => p.name)).toContain('Plush Santa Hats');
  });

  it('THE ORDER, as it is: the idea\'s own category first, then his pages, then the catalogue', async () => {
    const phrase = 'embroidered koozies';
    // The baked koozies list stands in for the category under vitest. It fills a four-product strip by itself.
    const four = await matchRelatedProducts({ ...ideaOptions(phrase), categorySlug: 'koozies' });
    expect(four).toHaveLength(4);
    expect(four.some((p) => own(p.sku))).toBe(false);
    // With room left over, his page comes after every category product and before any catalogue one.
    const wide = await matchRelatedProducts({ ...ideaOptions(phrase), categorySlug: 'koozies', limit: 200 });
    const at = wide.findIndex((p) => p.name === 'Embroidered Koozies With Pocket');
    expect(at).toBeGreaterThan(3);
    const category = new Set((await matchRelatedProducts({ ...ideaOptions(phrase), categorySlug: 'koozies', limit: 200, includeProductPages: false, catalogMinScore: 99 })).map((p) => p.sku));
    expect(wide.slice(0, at).every((p) => category.has(p.sku))).toBe(true);
    expect(wide.slice(at + 1).every((p) => !category.has(p.sku))).toBe(true);
  });
});

describe('the wiring', () => {
  const matcher = read('lib/ai/related-products.ts');
  const generator = read('lib/blog-automation/generate-blog-post.ts');

  it('the page scan is at the catalogue floor and under the noun rule; custom products and the category stay at the general floor', () => {
    expect(matcher).toContain('for (const p of rankEligible(pages.filter(scannable), tokens, catalogFloor)) push(p);');
    expect(matcher).toContain('for (const p of rankEligible(custom.filter(scannable), tokens, minScore)) push(p);');
    expect(matcher).toContain('for (const p of rankEligible(categoryProducts, tokens, minScore)) push(p);');
    // The floor is computed before the scan that uses it.
    expect(matcher.indexOf('const catalogFloor = Math.max(minScore, opts.catalogMinScore ?? minScore);')).toBeLessThan(matcher.indexOf('if (opts.includeProductPages === true) {'));
  });

  it('both calls of a list idea strip ask for product pages, each with the catalogue floor and the noun; the single strip does not', () => {
    const idea = generator.slice(generator.indexOf('export async function matchIdeaStrip('), generator.indexOf('export async function generateBlogPost('));
    const calls = idea.split('matchRelatedProducts({').slice(1).map((c) => c.slice(0, c.indexOf('});')));
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call).toContain('includeProductPages: true,');
      expect(call).toContain('catalogMinScore,');
      expect(call).toContain('scanMustCarry,');
    }
    // The single-template strip has no product noun to hold a page to, and was not measured: it stays as it was.
    const rest = generator.slice(generator.indexOf('export async function generateBlogPost('));
    expect(rest).not.toContain('includeProductPages');
  });

  it('only published pages can be offered: the read is the published perspective', () => {
    const pages = read('lib/sanity/queries/product-pages.ts');
    const fn = pages.slice(pages.indexOf('export async function getAllProductPageCards('));
    expect(fn.slice(0, fn.indexOf('\n}'))).toContain('cachedClient.fetch');
  });
});
