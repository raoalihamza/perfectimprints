/**
 * FIX-920: the product row of a single-topic post (a guide, a question, a
 * how-to) whose topic has NO category is matched keyword by keyword.
 *
 * The first question post the scheduler would write, "imprinted promotional
 * products" (822 impressions, third in the queue, no category), asked for
 * water bottles, tote bags, notebooks and tumblers. The row was ONE match
 * over the five keywords pooled, and the best score went to the products
 * that carried words of several keywords at once: five wine bottle tote bags
 * in a row of seven. Replayed through `matchKeywordRow` from the same
 * keywords: one of Patrick's own water bottle pages, a water bottle, two tote
 * bags, two notebooks and a tumbler. 775 of the 2,121 usable topics resolve
 * to no category.
 *
 * Structural, because the generator cannot be imported under vitest (its
 * matcher reads Sanity behind `server-only`); the row itself was replayed
 * with the measuring harness.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const gen = readFileSync(join(__dirname, 'generate-blog-post.ts'), 'utf8').replace(/\r\n/g, '\n');
const body = (name: string) => {
  const start = gen.indexOf(`export async function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return gen.slice(start, gen.indexOf('\n}\n', start));
};

describe('matchKeywordRow', () => {
  const fn = body('matchKeywordRow');

  it('matches every keyword on its own, through the list idea matcher, with one used-product set for the row', () => {
    expect(fn).toContain('for (const keyword of keywords) {');
    expect(fn).toContain('await matchIdeaStrip({ productType: keyword, heading: keyword, usedSkus: used })');
    expect(fn).toContain('for (const p of strip) used.add(p.sku);');
    // Never the pooled matcher: that is what returned the wine totes.
    expect(fn).not.toContain('matchRelatedProducts(');
  });

  it('takes two from each keyword in the order given, then the rest, and never more than the limit', () => {
    expect(gen).toContain('const KEYWORD_ROW_PER_KEYWORD = 2;');
    expect(fn).toContain('for (const [from, to] of [[0, KEYWORD_ROW_PER_KEYWORD], [KEYWORD_ROW_PER_KEYWORD, LIST_STRIP_LIMIT]]) {');
    expect(fn).toContain('if (row.length < limit) row.push(p);');
    expect(gen).toContain('limit: number = SINGLE_STRIP_LIMIT');
  });
});

describe('the single-topic product row', () => {
  it('keeps the pooled match INSIDE a category, and uses the keyword row only when the topic has none', () => {
    expect(gen).toContain('const stripCategory = categorySlug ?? depth.category ?? undefined;');
    const row = gen.slice(gen.indexOf('const stripCategory = '), gen.indexOf('if (products.length >= MIN_STRIP_PRODUCTS) {', gen.indexOf('const stripCategory = ')));
    expect(row).toContain('const products = stripCategory\n      ? await matchRelatedProducts({');
    expect(row).toContain('categorySlug: stripCategory,');
    expect(row).toContain(': await matchKeywordRow(singleKeywords);');
    // The floors are the ones the row had before (FIX-900), unchanged.
    expect(row).toContain('minScore: STRIP_MIN_SCORE,');
    expect(row).toContain('catalogMinScore: catalogTopUpFloor(singleKeywords, STRIP_CATALOG_MIN_SCORE),');
  });

  it('a row of fewer than two products is still skipped, and the dials are spelled once', () => {
    expect(gen).toContain('if (products.length >= MIN_STRIP_PRODUCTS) {');
    expect(gen.match(/const STRIP_MIN_SCORE = \d+;/g)).toEqual(['const STRIP_MIN_SCORE = 1;']);
    expect(gen.match(/const STRIP_CATALOG_MIN_SCORE = \d+;/g)).toEqual(['const STRIP_CATALOG_MIN_SCORE = 2;']);
    expect(gen.match(/const MIN_STRIP_PRODUCTS = \d+;/g)).toEqual(['const MIN_STRIP_PRODUCTS = 2;']);
  });
});
