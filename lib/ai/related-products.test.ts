/**
 * FIX-900: the catalog top-up has its own relevance floor.
 *
 * Pinned here: `catalogTopUpFloor` (the pure rule the route states the dial
 * through), the matcher's `catalogMinScore` option against the real
 * products.json (a one-shared-token catalog match is excluded at floor 2, the
 * default is byte-identical to before, and the catalog floor can never fall
 * below the general one), and the route's wiring: the dial is spelled once,
 * every `matchRelatedProducts` call in the blog route passes the floor, and
 * the empty-strip rule (`MIN_STRIP_PRODUCTS`) still gates both templates.
 *
 * The matcher reads products.json from `process.cwd()`, which vitest runs at
 * the repo root; the category branch is skipped (no `categorySlug`) and the
 * custom-product read is switched off, so these cases touch disk only.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { catalogTopUpFloor, matchRelatedProducts, productNounOf } from './related-products';
import { carriesToken, significantTokens } from './match-tokens';
import type { GeigerProduct } from '../product-types';

const root = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** Shared significant words, by the matcher's own token rule (lib/ai/match-tokens.ts since FIX-911). */
function shared(phrase: string, p: GeigerProduct): number {
  const pt = new Set(significantTokens(`${p.name} ${p.brand ?? ''}`));
  let n = 0;
  for (const t of new Set(significantTokens(phrase))) if (carriesToken(pt, t)) n++;
  return n;
}
const carries = (p: GeigerProduct, word: string) => carriesToken(new Set(significantTokens(`${p.name} ${p.brand ?? ''}`)), word);

describe('catalogTopUpFloor', () => {
  it('asks for the cap when the phrase has that many significant tokens', () => {
    expect(catalogTopUpFloor(['sunscreen sticks'], 2)).toBe(2);
    expect(catalogTopUpFloor(['rabbit-style corkscrews'], 2)).toBe(2);
    expect(catalogTopUpFloor(['stainless steel water bottles'], 2)).toBe(2);
    expect(catalogTopUpFloor(['stainless steel water bottles'], 3)).toBe(3);
  });

  it('lowers the cap to the tokens the phrase actually has, never below one', () => {
    expect(catalogTopUpFloor(['koozies'], 2)).toBe(1);
    expect(catalogTopUpFloor(['custom koozies'], 2)).toBe(1);
    expect(catalogTopUpFloor(['custom items'], 2)).toBe(1);
    expect(catalogTopUpFloor([], 2)).toBe(1);
    expect(catalogTopUpFloor([''], 2)).toBe(1);
  });

  it('counts tokens across several phrases and ignores a nonsense cap', () => {
    expect(catalogTopUpFloor(['custom tumblers', 'water bottles'], 2)).toBe(2);
    expect(catalogTopUpFloor(['sunscreen sticks'], 0)).toBe(1);
    expect(catalogTopUpFloor(['sunscreen sticks'], -3)).toBe(1);
    expect(catalogTopUpFloor(['sunscreen sticks'], 2.9)).toBe(2);
  });
});

describe('matchRelatedProducts catalogMinScore (real products.json, catalog branch only)', () => {
  const base = { limit: 4, minScore: 1, includeCustom: false as const };

  it('at the old floor a two-word phrase is matched on one incidental word', async () => {
    const got = await matchRelatedProducts({ ...base, keywords: ['rabbit corkscrews'] });
    expect(got.length).toBeGreaterThan(0);
    expect(got.some((p) => shared('rabbit corkscrews', p) === 1)).toBe(true);
  });

  it('at catalog floor 2 every returned product shares two words, or nothing is returned', async () => {
    for (const phrase of ['rabbit corkscrews', 'sunscreen sticks', 'wine opener keychains', 'laptop sleeves']) {
      const got = await matchRelatedProducts({ ...base, keywords: [phrase], catalogMinScore: 2 });
      for (const p of got) expect(shared(phrase, p), `${phrase}: ${p.name}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('a one-word phrase still matches on its one word through catalogTopUpFloor', async () => {
    const floor = catalogTopUpFloor(['koozies'], 2);
    expect(floor).toBe(1);
    const got = await matchRelatedProducts({ ...base, keywords: ['koozies'], catalogMinScore: floor });
    expect(got.length).toBeGreaterThan(0);
    for (const p of got) expect(shared('koozies', p)).toBe(1);
  });

  it('the default is byte-identical to the old behaviour', async () => {
    for (const phrase of ['rabbit corkscrews', 'glass soda bottles', 'retro sunglasses']) {
      const before = await matchRelatedProducts({ ...base, keywords: [phrase] });
      const same = await matchRelatedProducts({ ...base, keywords: [phrase], catalogMinScore: 1 });
      expect(same.map((p) => p.sku)).toEqual(before.map((p) => p.sku));
    }
  });

  it('a catalog floor below the general floor is raised to it', async () => {
    const strict = await matchRelatedProducts({ ...base, keywords: ['rabbit corkscrews'], minScore: 2 });
    const lowered = await matchRelatedProducts({
      ...base,
      keywords: ['rabbit corkscrews'],
      minScore: 2,
      catalogMinScore: 1,
    });
    expect(lowered.map((p) => p.sku)).toEqual(strict.map((p) => p.sku));
  });
});

describe('the blog generator states the dial once and passes it everywhere', () => {
  // AUTO-201 moved the route's body into lib/blog-automation/generate-blog-post.ts.
  const route = read('lib/blog-automation/generate-blog-post.ts');

  it('spells STRIP_CATALOG_MIN_SCORE = 2 exactly once and imports the floor helper', () => {
    expect(route.match(/const STRIP_CATALOG_MIN_SCORE = \d+;/g)).toEqual(['const STRIP_CATALOG_MIN_SCORE = 2;']);
    expect(route).toContain('catalogTopUpFloor,');
  });

  it('every matchRelatedProducts call carries catalogMinScore', () => {
    const calls = route.split('matchRelatedProducts({').slice(1);
    expect(calls.length).toBe(3);
    for (const call of calls) {
      const body = call.slice(0, call.indexOf('});'));
      expect(body).toMatch(/catalogMinScore/);
    }
  });

  it('a strip below MIN_STRIP_PRODUCTS is skipped in both templates, never padded', () => {
    expect(route).toContain('const MIN_STRIP_PRODUCTS = 2;');
    expect(route).toContain('products.length >= MIN_STRIP_PRODUCTS ? products : []');
    expect(route).toContain('if (products.length >= MIN_STRIP_PRODUCTS) {');
  });

  it('no other source file spells the dial', () => {
    const others = [
      'lib/ai/related-products.ts',
      'app/api/sanity/generate-blog/route.ts',
      'app/api/sanity/generate-page/route.ts',
      'app/api/sanity/generate-video/route.ts',
      'app/api/sanity/generate-landing/route.ts',
      'lib/ai/generate-landing-content.ts',
    ];
    for (const rel of others) expect(read(rel), rel).not.toMatch(/STRIP_CATALOG_MIN_SCORE/);
  });
});

describe('FIX-911: "can" is a product word when products are matched', () => {
  const base = { limit: 6, minScore: 1, includeCustom: false as const };

  it('"can coolers" is two words, so the catalogue floor asks for both', () => {
    // With "can" stripped as filler the phrase was one word and any cooler cleared the floor.
    expect(catalogTopUpFloor(['can coolers'], 2)).toBe(2);
    expect(catalogTopUpFloor(['coolers'], 2)).toBe(1);
  });

  it('at floor 2 every catalogue product for "can coolers" is a can cooler by name', async () => {
    const got = await matchRelatedProducts({ ...base, keywords: ['can coolers'], catalogMinScore: 2 });
    expect(got.length).toBeGreaterThan(0);
    for (const p of got) {
      expect(carries(p, 'can'), p.name).toBe(true);
      expect(carries(p, 'coolers'), p.name).toBe(true);
    }
  });
});

describe('FIX-911: scanMustCarry, the product noun on the whole-collection scans', () => {
  const base = { limit: 6, minScore: 1, includeCustom: false as const };

  it('productNounOf is the last product word', () => {
    expect(productNounOf('glow in the dark footballs')).toBe('footballs');
    expect(productNounOf('collapsible can coolers')).toBe('coolers');
    expect(productNounOf('sunscreen with carabiner')).toBe('sunscreen');
    expect(productNounOf('custom')).toBeNull();
  });

  it('two shared modifiers are not the product: the FIX-900 floor alone lets them through', async () => {
    const phrase = 'glow in the dark footballs';
    const floored = await matchRelatedProducts({ ...base, keywords: [phrase], catalogMinScore: 2 });
    // "glow" + "dark" are two shared words; none of these is a football.
    expect(floored.some((p) => !carries(p, 'footballs'))).toBe(true);
    const nouned = await matchRelatedProducts({ ...base, keywords: [phrase], catalogMinScore: 2, scanMustCarry: productNounOf(phrase) });
    for (const p of nouned) expect(carries(p, 'footballs'), p.name).toBe(true);
    expect(nouned.length).toBeLessThan(floored.length);
  });

  it('every scanned product carries the word, and it still has to clear the floor', async () => {
    for (const phrase of ['mini foam footballs', 'sunscreen sticks', 'recycled trucker hats', 'glass soda bottles']) {
      const noun = productNounOf(phrase)!;
      const got = await matchRelatedProducts({ ...base, keywords: [phrase], catalogMinScore: 2, scanMustCarry: noun });
      for (const p of got) {
        expect(carries(p, noun), `${phrase}: ${p.name}`).toBe(true);
        expect(shared(phrase, p), `${phrase}: ${p.name}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('unset, null or blank, the scans are byte-identical to before', async () => {
    for (const phrase of ['rabbit corkscrews', 'glow in the dark footballs', 'retro sunglasses']) {
      const before = await matchRelatedProducts({ ...base, keywords: [phrase], catalogMinScore: 2 });
      for (const scanMustCarry of [undefined, null, '', '  ']) {
        const same = await matchRelatedProducts({ ...base, keywords: [phrase], catalogMinScore: 2, scanMustCarry });
        expect(same.map((p) => p.sku)).toEqual(before.map((p) => p.sku));
      }
    }
  });

  it('never filters the category branch: a category product needs no noun in its name', () => {
    const matcher = read('lib/ai/related-products.ts');
    expect(matcher).toContain('for (const p of rankEligible(categoryProducts, tokens, minScore)) push(p);');
    expect(matcher.match(/\.filter\(scannable\)/g)).toHaveLength(3);
  });
});

describe('REJECTED ROAD 2: the strip floor inside a category stays at one shared word', () => {
  // FIX-900 measured raising it (variant D): 72 strips to 37, the correct
  // koozie strips gone, because "embroidered koozies" shares only the word
  // koozie with every product in the koozies root. FIX-910 measured the same
  // shape again. If STRIP_MIN_SCORE is raised, or the category branch is
  // moved onto the catalogue floor, these fail.
  const route = read('lib/blog-automation/generate-blog-post.ts');

  it('STRIP_MIN_SCORE is 1, spelled once, and both idea calls pass it', () => {
    expect(route.match(/const STRIP_MIN_SCORE = \d+;/g)).toEqual(['const STRIP_MIN_SCORE = 1;']);
    const idea = route.slice(route.indexOf('export async function matchIdeaStrip('), route.indexOf('export async function generateBlogPost('));
    expect(idea.match(/minScore: STRIP_MIN_SCORE,/g)).toHaveLength(2);
    expect(idea.match(/scanMustCarry,/g)).toHaveLength(2);
    expect(idea).toContain('const scanMustCarry = productType ? productNounOf(productType) : null;');
  });

  it('the category branch scores at minScore, not at the catalogue floor', () => {
    const matcher = read('lib/ai/related-products.ts');
    expect(matcher).toContain('rankEligible(categoryProducts, tokens, minScore)');
    expect(matcher).toContain('rankEligible(getAllProducts().filter(scannable), tokens, catalogFloor)');
  });

  it('at one shared word a koozie idea gets its koozies; at two it gets nothing from the category', async () => {
    // The baked koozies list stands in for the category under vitest (no Sanity).
    const phrase = 'embroidered koozies';
    const opts = { categorySlug: 'koozies', keywords: [phrase], limit: 4, includeCustom: false as const, catalogMinScore: 99 };
    const one = await matchRelatedProducts({ ...opts, minScore: 1 });
    expect(one.length).toBe(4);
    for (const p of one) expect(carries(p, 'koozies'), p.name).toBe(true);
    const two = await matchRelatedProducts({ ...opts, minScore: 2 });
    expect(two.length).toBeLessThan(one.length);
  });
});
