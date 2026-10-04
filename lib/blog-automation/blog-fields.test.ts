/**
 * AUTO-202: the related category slugs come from the RANKING PAGE and pass
 * FIX-900's rule; the author has an obvious default; nothing here guesses
 * from a title.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authorIdToUse, DEFAULT_BLOG_AUTHOR_ID, relatedCategorySlugsFor, rootSlugFromRankingPage, uniqueIds } from './blog-fields';
import { relatedCategorySlugProblem } from '../blog/related-category-slugs';

const ROOT = join(__dirname, '..', '..');

/** Every generated root slug, the way lib/categories.ts reads them (type 'root', no `__` in the filename). */
function generatedRoots(): string[] {
  const dir = join(ROOT, 'data', 'categories');
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f.includes('__')) continue;
    const raw = readFileSync(join(dir, f), 'utf8');
    if (!raw.trim()) continue;
    if ((JSON.parse(raw) as { type?: string }).type === 'root') out.push(f.replace(/\.json$/, ''));
  }
  return out.sort();
}

describe('rootSlugFromRankingPage', () => {
  it('reads the root out of a /cat/ URL or path, facets and queries included', () => {
    expect(rootSlugFromRankingPage('https://www.perfectimprints.com/cat/sports-balls/size/mini')).toBe('sports-balls');
    expect(rootSlugFromRankingPage('/cat/calendars/industry/contractor')).toBe('calendars');
    expect(rootSlugFromRankingPage('/cat/pens')).toBe('pens');
    expect(rootSlugFromRankingPage('/cat/pens?page=2')).toBe('pens');
    expect(rootSlugFromRankingPage('/cat/pom-poms/search/')).toBe('pom-poms');
    expect(rootSlugFromRankingPage('HTTPS://WWW.PERFECTIMPRINTS.COM/CAT/Caps')).toBe('caps');
  });

  it('gives nothing for anything that is not a category page', () => {
    for (const page of ['/videos/custom-logo-pens', '/products/gc142-gpromomart', '/', '/blog', '/rush-products', '/industry/government', '/brands/koozie', '/cat/', '/cat', '/categories/pens', '', null, undefined, 42]) {
      expect(rootSlugFromRankingPage(page), String(page)).toBeNull();
    }
  });
});

describe('relatedCategorySlugsFor', () => {
  const known = new Set(['pens', 'sports-balls', 'caps']);

  it('the ranking page first, then the merged spellings\' pages, each once, known roots only', () => {
    expect(relatedCategorySlugsFor({ page: '/cat/pens' }, known)).toEqual(['pens']);
    expect(
      relatedCategorySlugsFor(
        { page: '/videos/x', spacingGroups: [{ page: '/cat/sports-balls/activity/football' }, { page: '/cat/sports-balls' }, { page: '/cat/caps' }] },
        known,
      ),
    ).toEqual(['sports-balls', 'caps']);
    expect(relatedCategorySlugsFor({ page: '/cat/ponchos' }, known)).toEqual([]);
    expect(relatedCategorySlugsFor({ page: '/videos/x' }, known)).toEqual([]);
    expect(relatedCategorySlugsFor({}, known)).toEqual([]);
  });

  it('every value it can ever write passes FIX-900\'s rule, for all 465 generated roots', () => {
    const roots = generatedRoots();
    expect(roots.length).toBe(465);
    const knownRoots = new Set(roots);
    for (const root of roots) {
      const slugs = relatedCategorySlugsFor({ page: `https://www.perfectimprints.com/cat/${root}/color/blue` }, knownRoots);
      expect(slugs, root).toEqual([root]);
      expect(relatedCategorySlugProblem(slugs[0]), root).toBeNull();
    }
  });

  it('never writes a value the rule would refuse, even from a strange page', () => {
    const weird = new Set(['pens']);
    for (const page of ['/cat/Pens', '/cat/pens ', '/cat/pens/', 'https://www.perfectimprints.com/cat/pens?price-min=10']) {
      for (const slug of relatedCategorySlugsFor({ page }, weird)) expect(relatedCategorySlugProblem(slug), page).toBeNull();
    }
  });
});

describe('the author default', () => {
  it('is Patrick Black\'s author document, used only when the setting names none', () => {
    expect(DEFAULT_BLOG_AUTHOR_ID).toBe('author-patrick-black');
    expect(authorIdToUse(null)).toBe('author-patrick-black');
    expect(authorIdToUse('  ')).toBe('author-patrick-black');
    expect(authorIdToUse('author-sarah-garcia')).toBe('author-sarah-garcia');
  });

  it('uniqueIds trims, drops blanks and repeats, keeps order', () => {
    expect(uniqueIds([' a ', '', 'b', 'a', null, 3, 'c'])).toEqual(['a', 'b', 'c']);
    expect(uniqueIds(undefined)).toEqual([]);
  });
});

describe('structure: no guess from the title', () => {
  it('blog-fields.ts imports only the FIX-900 rule, never the product matcher or a title resolver', () => {
    const src = readFileSync(join(ROOT, 'lib/blog-automation/blog-fields.ts'), 'utf8');
    const imports = src.match(/^import .*$/gm) ?? [];
    expect(imports).toEqual(["import { relatedCategorySlugProblem } from '../blog/related-category-slugs';"]);
    // The CODE (comments stripped) never reads a title or calls the matcher.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('resolveCategoryForKeywords');
    expect(code).not.toMatch(/\btitle\b/);
  });

  it('the field resolver widens only the LIBRARY lookup with the title resolver, never the stored slugs', () => {
    const src = readFileSync(join(ROOT, 'lib/blog-automation/resolve-draft-fields.ts'), 'utf8').replace(/\r\n/g, '\n');
    const relatedAt = src.indexOf('relatedCategorySlugs = relatedCategorySlugsFor(');
    const resolvedAt = src.indexOf('await deps.categoryForTopic(');
    expect(relatedAt).toBeGreaterThan(-1);
    expect(resolvedAt).toBeGreaterThan(relatedAt);
    // The resolved category joins `libraryRoots`, and nothing after it assigns to relatedCategorySlugs.
    expect(src.slice(resolvedAt)).not.toMatch(/relatedCategorySlugs\s*=/);
    expect(src.slice(resolvedAt)).toContain('libraryRoots.push(resolved)');
  });
});
