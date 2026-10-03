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

import { catalogTopUpFloor, matchRelatedProducts } from './related-products';
import { NON_SIGNIFICANT_MATCH_WORDS } from './brand-voice';
import type { GeigerProduct } from '../product-types';

const root = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** The matcher's own token rule, mirrored for the assertions only. */
function significant(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !NON_SIGNIFICANT_MATCH_WORDS.has(t));
}
function shared(phrase: string, p: GeigerProduct): number {
  const pt = new Set(significant(`${p.name} ${p.brand ?? ''}`));
  let n = 0;
  for (const t of new Set(significant(phrase))) {
    if (pt.has(t) || (t.endsWith('s') && pt.has(t.slice(0, -1))) || pt.has(`${t}s`)) n++;
  }
  return n;
}

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

describe('the blog route states the dial once and passes it everywhere', () => {
  const route = read('app/api/sanity/generate-blog/route.ts');

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
      'app/api/sanity/generate-page/route.ts',
      'app/api/sanity/generate-video/route.ts',
      'app/api/sanity/generate-landing/route.ts',
      'lib/ai/generate-landing-content.ts',
    ];
    for (const rel of others) expect(read(rel), rel).not.toMatch(/STRIP_CATALOG_MIN_SCORE/);
  });
});
