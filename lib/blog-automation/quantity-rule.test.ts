/**
 * AUTO-208 Part 5: a generated post states no order quantity. The rule, the
 * sentences it must catch (FIX-920's and Ali's), the sentences it must leave
 * alone, and the structural guard that the generator enforces it beside the
 * price rule and the prompt carries it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { containsQuantityClaim, firstQuantityClaim, QUANTITY_RULE } from './quantity-rule';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('containsQuantityClaim', () => {
  it('catches the sentences that were found live', () => {
    const found = [
      'Most suppliers set minimum order quantities, usually starting at 25 to 50 units.',
      'Expect a minimum of 50 pieces per design.',
      'Most vendors require orders of 100 or more.',
      'You can order as few as 12 for a small team.',
      'A 24-piece minimum applies to printed styles.',
      'They ship in packs of 24.',
      'MOQ of 250.',
      'Orders start at 100 units.',
      'Quantities of 500 or more unlock the best pricing tiers.',
      'runs of 1,000 are common for trade shows',
      'at least 100 pieces',
      '500+ pcs',
      'cases of 12 bottles',
    ];
    for (const s of found) expect(containsQuantityClaim(s), s).toBe(true);
  });

  it('leaves a number that is plainly not an order quantity alone', () => {
    const clean = [
      'Production takes at least 7 business days, and rush service can cut that to 24 hours.',
      'Choose from at least 3 colors and 2 sizes.',
      'These 10 ideas cover trade shows and employee gifts.',
      'The 16 oz tumbler holds a full pour; the 20 oz version suits a long shift.',
      'Minimums vary by product and are shown on each item.',
      'Orders placed in the fall land in time for the holidays.',
      'A 2-inch button and a 3 x 5 card fit the same mailer.',
      'Founded in 1998, the company serves 50 states.',
      'Ships in 2 to 3 business days.',
      'At least 90% of attendees keep a useful giveaway.',
      'Order early: at least 4 weeks before the event.',
      'Plan ahead and order at least 3-4 weeks before your race day to avoid last-minute stress.',
      'Lead times run at least 2 to 3 weeks after artwork approval.',
      'Nine ideas for a tight budget.',
    ];
    for (const s of clean) expect(containsQuantityClaim(s), s).toBe(false);
  });

  it('names the sentence for the error message', () => {
    expect(firstQuantityClaim('Great for teams. Minimum order quantities usually start at 25 units. Ask us.')).toBe('Minimum order quantities usually start at 25 units.');
    expect(firstQuantityClaim('No figures here.')).toBeNull();
  });
});

describe('the generator enforces it', () => {
  const generator = read('lib/blog-automation/generate-blog-post.ts');

  it('the prompt carries the rule, spelled once in quantity-rule.ts', () => {
    expect(generator).toContain("import { containsQuantityClaim, QUANTITY_RULE } from './quantity-rule';");
    expect(generator).toContain('- ${QUANTITY_RULE}');
    expect(QUANTITY_RULE).toMatch(/^NO order quantities/);
    expect(QUANTITY_RULE).toContain('minimums vary by product');
  });

  it('a quantity claim rejects the post beside the price check, before the title is judged', () => {
    const price = generator.indexOf('textParts(gen).find(containsPrice)');
    const quantity = generator.indexOf('textParts(gen).find(containsQuantityClaim)');
    const title = generator.indexOf('await fitTitle({');
    expect(price).toBeGreaterThan(0);
    expect(quantity).toBeGreaterThan(price);
    expect(title).toBeGreaterThan(quantity);
    expect(generator).toContain('The AI stated an order quantity in the post');
  });

  it('the rule module is pure', () => {
    expect(read('lib/blog-automation/quantity-rule.ts')).not.toMatch(/^import /m);
  });
});
