import { describe, expect, it } from 'vitest';
import {
  effectiveVideoCategories,
  rankRelatedVideos,
  type RelatedVideoCandidate,
} from './video-categories';

const cat = (slug: string) => ({ title: slug.toUpperCase(), slug });

describe('effectiveVideoCategories', () => {
  it('prefers the new list when it has entries', () => {
    const out = effectiveVideoCategories({
      categories: [cat('drinkware'), cat('bags')],
      legacyCategory: cat('old'),
    });
    expect(out.map((c) => c.slug)).toEqual(['drinkware', 'bags']);
  });

  it('falls back to the legacy single category when the list is empty or absent', () => {
    expect(effectiveVideoCategories({ legacyCategory: cat('old') }).map((c) => c.slug)).toEqual([
      'old',
    ]);
    expect(
      effectiveVideoCategories({ categories: [], legacyCategory: cat('old') }).map((c) => c.slug),
    ).toEqual(['old']);
    expect(
      effectiveVideoCategories({ categories: null, legacyCategory: cat('old') }).map((c) => c.slug),
    ).toEqual(['old']);
  });

  it('returns empty when neither field is set', () => {
    expect(effectiveVideoCategories({})).toEqual([]);
  });

  it('drops null (dangling reference) entries; falls back if ALL entries dangle', () => {
    expect(
      effectiveVideoCategories({ categories: [null, cat('bags'), null] }).map((c) => c.slug),
    ).toEqual(['bags']);
    expect(
      effectiveVideoCategories({ categories: [null], legacyCategory: cat('old') }).map(
        (c) => c.slug,
      ),
    ).toEqual(['old']);
  });

  it('drops entries missing a slug or title, and de-duplicates by slug', () => {
    const out = effectiveVideoCategories({
      categories: [
        { title: '', slug: 'x' },
        { title: 'Bags', slug: '' },
        cat('bags'),
        cat('bags'),
      ],
    });
    expect(out.map((c) => c.slug)).toEqual(['bags']);
  });
});

describe('rankRelatedVideos', () => {
  const mk = (slug: string, cats: string[]): RelatedVideoCandidate<string> => ({
    item: slug,
    slug,
    categorySlugs: cats,
  });

  it('matches on ANY shared category', () => {
    const out = rankRelatedVideos(
      [mk('a', ['drinkware']), mk('b', ['bags']), mk('c', ['pens'])],
      'self',
      ['drinkware', 'bags'],
      6,
    );
    expect(out).toEqual(['a', 'b']);
  });

  it('ranks more shared categories higher', () => {
    const out = rankRelatedVideos(
      [mk('one-shared', ['drinkware']), mk('two-shared', ['drinkware', 'bags'])],
      'self',
      ['drinkware', 'bags'],
      6,
    );
    expect(out).toEqual(['two-shared', 'one-shared']);
  });

  it('keeps input (newest-first) order within a shared-count band', () => {
    const out = rankRelatedVideos(
      [mk('newer', ['bags']), mk('older', ['bags'])],
      'self',
      ['bags'],
      6,
    );
    expect(out).toEqual(['newer', 'older']);
  });

  it('excludes the video itself and respects the limit', () => {
    const out = rankRelatedVideos(
      [mk('self', ['bags']), mk('a', ['bags']), mk('b', ['bags']), mk('c', ['bags'])],
      'self',
      ['bags'],
      2,
    );
    expect(out).toEqual(['a', 'b']);
  });

  it('returns empty when the video has no categories', () => {
    expect(rankRelatedVideos([mk('a', ['bags'])], 'self', [], 6)).toEqual([]);
  });

  it('does not double-count a duplicated category slug on a candidate', () => {
    const out = rankRelatedVideos(
      [mk('dup', ['bags', 'bags']), mk('two', ['bags', 'drinkware'])],
      'self',
      ['bags', 'drinkware'],
      6,
    );
    expect(out).toEqual(['two', 'dup']);
  });

  it('reduces to the old single-category rule when everything has one category', () => {
    const out = rankRelatedVideos(
      [mk('same', ['bags']), mk('other', ['pens'])],
      'self',
      ['bags'],
      6,
    );
    expect(out).toEqual(['same']);
  });
});
