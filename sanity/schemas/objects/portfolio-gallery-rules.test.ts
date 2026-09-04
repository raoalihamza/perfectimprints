import { describe, expect, it } from 'vitest';
import {
  PORTFOLIO_GALLERY_CATEGORY_MESSAGE,
  PORTFOLIO_GALLERY_ITEMS_MESSAGE,
  galleryIsStarted,
  portfolioGalleryCategoryProblem,
  portfolioGalleryItemsProblem,
  portfolioGalleryProblems,
} from './portfolio-gallery-rules';

/**
 * FIX-861: the two halves of the rule. An untouched block is invisible to
 * validation; a started block must be completed or emptied. The shapes below
 * are the ones Sanity actually stores: a document FIELD after the editor
 * clears it (`{_type}`), an array member the moment it is inserted into a
 * blog body or a page's sections (`{_type, _key}`), and the exact object the
 * PORT-120 initial values wrote into three live drafts.
 */
const item = (id: string) => ({ _type: 'reference', _key: id, _ref: id });
const category = { _type: 'reference', _ref: 'cat-fire-departments' };

/** The object PORT-120's initial values wrote; three live drafts hold it verbatim (FIX-860). */
const PRE_FIX_DEFAULTS = { _type: 'portfolioGallery', mode: 'manual', limit: 8, hidden: false };

describe('an untouched gallery block is invisible to validation', () => {
  const untouched: Array<[string, unknown]> = [
    ['absent', undefined],
    ['null', null],
    ['an empty object', {}],
    ['a cleared document field', { _type: 'portfolioGallery' }],
    ['a freshly inserted section or body block', { _type: 'portfolioGallery', _key: 'k1' }],
    ['the pre-fix default object the three drafts hold', PRE_FIX_DEFAULTS],
    ['hand picked chosen and nothing else', { mode: 'manual' }],
    ['a limit and nothing else', { limit: 12 }],
    ['hidden switched on and nothing else', { hidden: true }],
    ['hidden switched on then off', { hidden: false }],
    ['a heading of only spaces', { heading: '   ' }],
    ['an empty items list', { items: [] }],
  ];
  for (const [label, value] of untouched) {
    it(`${label} passes both rules and is not started`, () => {
      expect(galleryIsStarted(value)).toBe(false);
      expect(portfolioGalleryItemsProblem(value)).toBe(true);
      expect(portfolioGalleryCategoryProblem(value)).toBe(true);
      expect(portfolioGalleryProblems(value)).toEqual([]);
    });
  }
});

describe('a started gallery block must be completed', () => {
  it('a heading with no photos fails the items rule, and the message names clearing the heading', () => {
    const value = { heading: 'Recent work' };
    expect(galleryIsStarted(value)).toBe(true);
    expect(portfolioGalleryItemsProblem(value)).toBe(PORTFOLIO_GALLERY_ITEMS_MESSAGE);
    expect(PORTFOLIO_GALLERY_ITEMS_MESSAGE).toMatch(/clear the heading/);
    expect(portfolioGalleryProblems(value)).toEqual([PORTFOLIO_GALLERY_ITEMS_MESSAGE]);
  });

  it('a heading with hand picked chosen, or with an empty list, still fails', () => {
    expect(portfolioGalleryItemsProblem({ heading: 'Caps', mode: 'manual' })).toBe(PORTFOLIO_GALLERY_ITEMS_MESSAGE);
    expect(portfolioGalleryItemsProblem({ heading: 'Caps', items: [] })).toBe(PORTFOLIO_GALLERY_ITEMS_MESSAGE);
    expect(portfolioGalleryItemsProblem({ ...PRE_FIX_DEFAULTS, heading: 'Caps' })).toBe(
      PORTFOLIO_GALLERY_ITEMS_MESSAGE,
    );
  });

  it('category mode with no category fails the category rule, and the message names switching back', () => {
    const value = { mode: 'category' };
    expect(galleryIsStarted(value)).toBe(true);
    expect(portfolioGalleryCategoryProblem(value)).toBe(PORTFOLIO_GALLERY_CATEGORY_MESSAGE);
    expect(PORTFOLIO_GALLERY_CATEGORY_MESSAGE).toMatch(/switch back to "Hand picked"/);
    expect(portfolioGalleryProblems(value)).toEqual([PORTFOLIO_GALLERY_CATEGORY_MESSAGE]);
  });

  it('category mode with a heading or with leftover items still needs a category, and only that', () => {
    expect(portfolioGalleryProblems({ mode: 'category', heading: 'Caps' })).toEqual([
      PORTFOLIO_GALLERY_CATEGORY_MESSAGE,
    ]);
    expect(portfolioGalleryProblems({ mode: 'category', items: [item('a')] })).toEqual([
      PORTFOLIO_GALLERY_CATEGORY_MESSAGE,
    ]);
  });

  it('a reference with no _ref does not count as a category', () => {
    expect(portfolioGalleryCategoryProblem({ mode: 'category', category: { _type: 'reference' } })).toBe(
      PORTFOLIO_GALLERY_CATEGORY_MESSAGE,
    );
    expect(portfolioGalleryCategoryProblem({ mode: 'category', category: null })).toBe(
      PORTFOLIO_GALLERY_CATEGORY_MESSAGE,
    );
  });
});

describe('a completed gallery block passes', () => {
  it('hand picked items, with or without a mode or heading', () => {
    expect(portfolioGalleryProblems({ items: [item('a')] })).toEqual([]);
    expect(portfolioGalleryProblems({ mode: 'manual', items: [item('a'), item('b')] })).toEqual([]);
    expect(portfolioGalleryProblems({ heading: 'Caps', items: [item('a')], limit: 4, hidden: true })).toEqual([]);
  });

  it('category mode with a category, with or without a heading', () => {
    expect(portfolioGalleryProblems({ mode: 'category', category })).toEqual([]);
    expect(portfolioGalleryProblems({ mode: 'category', category, heading: 'Fire departments' })).toEqual([]);
  });
});

describe('leftovers the Studio hides are ignored, as the resolver ignores them', () => {
  it('a category left behind after switching back to hand picked never blocks, and is not started', () => {
    const value = { mode: 'manual', category };
    expect(galleryIsStarted(value)).toBe(false);
    expect(portfolioGalleryProblems(value)).toEqual([]);
  });

  it('a non-object value is treated as untouched rather than throwing', () => {
    expect(portfolioGalleryProblems('gallery')).toEqual([]);
    expect(portfolioGalleryProblems(42)).toEqual([]);
  });
});
