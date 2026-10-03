/**
 * FIX-900: `blogPost.relatedCategorySlugs` stores bare ROOT slugs, and a value
 * that is anything else is caught at the field and repaired in the data.
 *
 * Pinned here: (1) the normaliser reads the root out of every shape Patrick
 * actually typed (the eleven real stored values of 2026-10-04) and invents
 * nothing from a title; (2) every one of the generated root slugs passes the
 * rule (re-derived from data/categories on every run, the colors.test.ts
 * precedent, so a real root can never be refused); (3) the messages name the
 * slug to type and say why the typed value fails; (4) the repair plan
 * collapses duplicates, never writes a list it cannot fully read, and is a
 * no-op on a clean list; (5) the wiring: the schema validates every item
 * through this module as an ERROR and renders the root-only picker, the
 * query still matches the bare slug (the read side was deliberately not made
 * tolerant), the repair script plans through this module, and the picker
 * exports the roots-only variant.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  isCleanRelatedCategorySlug,
  normalizeRelatedCategorySlug,
  planRelatedCategorySlugsRepair,
  relatedCategorySlugProblem,
  ROOT_CATEGORY_SLUG_PATTERN,
} from './related-category-slugs';

const root = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** The eleven stored values AUTO-200 found, read from the production dataset on 2026-10-04. */
const STORED_PATHS: [string, string][] = [
  ['/cat/ornaments/theme/christmas', 'ornaments'],
  ['/cat/ornaments', 'ornaments'],
  ['/cat/headwear/theme/christmas', 'headwear'],
  ['/cat/speakers/feature/bluetooth', 'speakers'],
  ['/cat/portfolios/material/leather', 'portfolios'],
  ['/cat/bags/theme/halloween', 'bags'],
  ['/cat/adhesive-notepads', 'adhesive-notepads'],
  ['/cat/apparel/decoration/sublimation', 'apparel'],
  ['/cat/candy?price-min=10', 'candy'],
];

const generatedRoots = readdirSync(resolve(root, 'data', 'categories'))
  .filter((f) => f.endsWith('.json') && !f.includes('__'))
  .map((f) => f.replace(/\.json$/, ''));

describe('normalizeRelatedCategorySlug', () => {
  it('reads the root out of every shape the eleven posts stored', () => {
    for (const [stored, expected] of STORED_PATHS) {
      expect(normalizeRelatedCategorySlug(stored), stored).toBe(expected);
    }
  });

  it('strips an address, a bare host, a cat/ prefix, case and surrounding space', () => {
    expect(normalizeRelatedCategorySlug('https://www.perfectimprints.com/cat/water-bottles')).toBe('water-bottles');
    expect(normalizeRelatedCategorySlug('http://perfectimprints.com/cat/water-bottles/color/blue')).toBe('water-bottles');
    expect(normalizeRelatedCategorySlug('www.perfectimprints.com/cat/pens')).toBe('pens');
    expect(normalizeRelatedCategorySlug('cat/pens')).toBe('pens');
    expect(normalizeRelatedCategorySlug('  Pens  ')).toBe('pens');
    expect(normalizeRelatedCategorySlug('pens#top')).toBe('pens');
    expect(normalizeRelatedCategorySlug('pens/')).toBe('pens');
  });

  it('leaves a bare root slug exactly as it is', () => {
    expect(normalizeRelatedCategorySlug('water-bottles')).toBe('water-bottles');
    expect(normalizeRelatedCategorySlug('ornaments')).toBe('ornaments');
  });

  it('invents nothing: a title, a blank, a non-string or an over-long value is null', () => {
    expect(normalizeRelatedCategorySlug('Water Bottles')).toBeNull();
    expect(normalizeRelatedCategorySlug('')).toBeNull();
    expect(normalizeRelatedCategorySlug('   ')).toBeNull();
    expect(normalizeRelatedCategorySlug('/cat/')).toBeNull();
    expect(normalizeRelatedCategorySlug('/cat/?x=1')).toBeNull();
    expect(normalizeRelatedCategorySlug(42)).toBeNull();
    expect(normalizeRelatedCategorySlug(null)).toBeNull();
    expect(normalizeRelatedCategorySlug({ current: 'pens' })).toBeNull();
    expect(normalizeRelatedCategorySlug('a'.repeat(200))).toBeNull();
  });
});

describe('every generated root category passes the rule', () => {
  it('has the 465 roots to test against', () => {
    expect(generatedRoots.length).toBeGreaterThanOrEqual(465);
  });

  it('accepts each root unchanged and reports no problem', () => {
    for (const slug of generatedRoots) {
      expect(ROOT_CATEGORY_SLUG_PATTERN.test(slug), slug).toBe(true);
      expect(isCleanRelatedCategorySlug(slug), slug).toBe(true);
      expect(relatedCategorySlugProblem(slug), slug).toBeNull();
      expect(normalizeRelatedCategorySlug(slug), slug).toBe(slug);
    }
  });
});

describe('relatedCategorySlugProblem', () => {
  it('is silent on a bare root slug and on an unset item', () => {
    expect(relatedCategorySlugProblem('ornaments')).toBeNull();
    expect(relatedCategorySlugProblem('adhesive-notepads')).toBeNull();
    expect(relatedCategorySlugProblem(undefined)).toBeNull();
    expect(relatedCategorySlugProblem(null)).toBeNull();
  });

  it('names the slug to type and says why for each of the eleven stored shapes', () => {
    for (const [stored, expected] of STORED_PATHS) {
      const msg = relatedCategorySlugProblem(stored);
      expect(msg, stored).not.toBeNull();
      expect(msg, stored).toContain(`Type ${expected} instead`);
      expect(msg, stored).toContain('would never show this post anywhere');
    }
  });

  it('tells a /cat/ prefix from a facet path from a whole address', () => {
    expect(relatedCategorySlugProblem('/cat/ornaments')).toContain('Without /cat/');
    expect(relatedCategorySlugProblem('/cat/ornaments/theme/christmas')).toContain(
      'root category page only (/cat/ornaments)',
    );
    expect(relatedCategorySlugProblem('bags/theme/halloween')).toContain('Type bags instead');
    expect(relatedCategorySlugProblem('bags/theme/halloween')).toContain('not a facet, a filter or a path');
    expect(relatedCategorySlugProblem('/cat/candy?price-min=10')).toContain('Type candy instead');
    const url = relatedCategorySlugProblem('https://www.perfectimprints.com/cat/pens');
    expect(url).toContain('Type pens instead');
    expect(url).toContain('Just the slug, not the whole address');
  });

  it('refuses a title, a space, an empty entry and a non-string, pointing at the picker', () => {
    const title = relatedCategorySlugProblem('Water Bottles');
    expect(title).toContain('Lowercase letters, numbers and dashes only');
    expect(title).toContain('Pick the category from the search');
    expect(title).not.toContain('Type water-bottles instead');
    expect(relatedCategorySlugProblem('ornaments ')).toContain('Remove the space');
    expect(relatedCategorySlugProblem(' ornaments')).toContain('Remove the space');
    expect(relatedCategorySlugProblem('')).toContain('Empty entry');
    expect(relatedCategorySlugProblem(7)).toContain('Must be a category slug');
    expect(relatedCategorySlugProblem('x'.repeat(130))).toContain('Too long');
  });

  it('repeats back at most sixty characters of a long stray value, while still naming the root', () => {
    const msg = relatedCategorySlugProblem(`/cat/pens/theme/${'a'.repeat(100)}`) ?? '';
    expect(msg).toContain('Type pens instead');
    expect(msg).toContain('...');
    expect(msg).not.toContain('a'.repeat(100));
  });
});

describe('planRelatedCategorySlugsRepair', () => {
  const known = new Set(generatedRoots);

  it('turns each of the eleven stored lists into its roots', () => {
    const lists: [string[], string[]][] = [
      [['/cat/ornaments/theme/christmas'], ['ornaments']],
      [['/cat/speakers/feature/bluetooth', '/cat/portfolios/material/leather'], ['speakers', 'portfolios']],
      [['/cat/ornaments', '/cat/candy?price-min=10'], ['ornaments', 'candy']],
      [['/cat/bags/theme/halloween'], ['bags']],
    ];
    for (const [stored, expected] of lists) {
      const plan = planRelatedCategorySlugsRepair(stored, known);
      expect(plan.next, stored.join(',')).toEqual(expected);
      expect(plan.changed).toBe(true);
      expect(plan.unresolved).toEqual([]);
      expect(plan.unknownRoots).toEqual([]);
    }
  });

  it('collapses duplicates after normalising, first position kept', () => {
    const plan = planRelatedCategorySlugsRepair(['/cat/ornaments', 'pens', 'ornaments', '/cat/pens/type/gel']);
    expect(plan.next).toEqual(['ornaments', 'pens']);
    expect(plan.changed).toBe(true);
  });

  it('is a no-op on a clean list', () => {
    const plan = planRelatedCategorySlugsRepair(['ornaments', 'pens'], known);
    expect(plan.next).toEqual(['ornaments', 'pens']);
    expect(plan.changed).toBe(false);
  });

  it('reports a value it cannot read, and a root that is not a generated category, instead of guessing', () => {
    const plan = planRelatedCategorySlugsRepair(['/cat/ornaments', 'Water Bottles', '/cat/no-such-root-zz'], known);
    expect(plan.unresolved).toEqual(['Water Bottles']);
    expect(plan.unknownRoots).toEqual(['no-such-root-zz']);
    expect(plan.mapping).toEqual([
      { from: '/cat/ornaments', to: 'ornaments' },
      { from: 'Water Bottles', to: null },
      { from: '/cat/no-such-root-zz', to: 'no-such-root-zz' },
    ]);
  });

  it('treats a missing or non-array value as an empty, unchanged list', () => {
    expect(planRelatedCategorySlugsRepair(undefined)).toMatchObject({ next: [], changed: false });
    expect(planRelatedCategorySlugsRepair('ornaments')).toMatchObject({ next: [], changed: false });
  });
});

describe('wiring', () => {
  const schema = read('sanity/schemas/documents/blog-post.ts');
  const query = read('lib/sanity/queries/related-blogs.ts');
  const script = read('scripts/migrations/repair-related-category-slugs.ts');
  const picker = read('sanity/components/CategoryPicker.tsx');
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

  it('the schema validates every item through this module as an ERROR and renders the root-only picker', () => {
    const field = schema.slice(schema.indexOf("name: 'relatedCategorySlugs'"), schema.indexOf("name: 'relatedBlogs'"));
    expect(schema).toContain("import { relatedCategorySlugProblem } from '../../../lib/blog/related-category-slugs'");
    expect(field).toContain('relatedCategorySlugProblem(value) ?? true');
    expect(field).not.toContain('.warning()');
    expect(field).toContain('components: { input: RootCategoryPicker }');
    expect(field).not.toContain("layout: 'tags'");
  });

  it('the query still matches the bare slug exactly: the read side was not made tolerant', () => {
    expect(query).toContain('$slug in relatedCategorySlugs');
    expect(query).not.toMatch(/startsWith|\/cat\//);
  });

  it('the repair script plans through this module, is dry run by default and refuses what it cannot read', () => {
    expect(script).toContain("from '../../lib/blog/related-category-slugs'");
    expect(script).toContain('planRelatedCategorySlugsRepair(');
    expect(script).toContain("a === '--commit'");
    expect(script).toContain('ifRevisionId(row._rev)');
    expect(script).toContain('SKIPPED, nothing written');
    expect(script).toMatch(/perspective: 'raw'/);
    expect(pkg.scripts['repair-related-category-slugs']).toBe('tsx scripts/migrations/repair-related-category-slugs.ts');
  });

  it('the picker exports a roots-only variant with create-new switched off', () => {
    expect(picker).toMatch(/export function RootCategoryPicker\(/);
    expect(picker).toContain('<CategoryPicker {...props} rootsOnly allowCreate={false} />');
    expect(picker).toContain("!c.slug.includes('/') && staticSlugs.has(c.slug)");
  });

  it('this module imports nothing, so the Studio bundle can take it', () => {
    const src = read('lib/blog/related-category-slugs.ts');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/require\(/);
  });
});
