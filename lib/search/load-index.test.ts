import { describe, expect, it } from 'vitest';
import { mergeEnsuredResults, type SearchResult } from './load-index';

const r = (type: SearchResult['type'], url: string, score = 0.2): SearchResult => ({
  type,
  title: url,
  url,
  refIndex: 0,
  score,
});

describe('mergeEnsuredResults (Q-180 priority-group guarantee)', () => {
  it('appends type matches the global list missed', () => {
    const results = [r('category', '/cat/custom-mints'), r('product', 'https://x/p/1')];
    const extras = [r('video', '/videos/custom-mini-footballs'), r('video', '/videos/two')];
    const out = mergeEnsuredResults(results, extras, 'video');
    expect(out.map((x) => x.url)).toEqual([
      '/cat/custom-mints',
      'https://x/p/1',
      '/videos/custom-mini-footballs',
      '/videos/two',
    ]);
  });

  it('never duplicates a video the global list already carries', () => {
    const results = [r('video', '/videos/already-there'), r('category', '/cat/a')];
    const extras = [r('video', '/videos/already-there'), r('video', '/videos/new-one')];
    const out = mergeEnsuredResults(results, extras, 'video');
    expect(out.filter((x) => x.url === '/videos/already-there')).toHaveLength(1);
    expect(out.map((x) => x.url)).toContain('/videos/new-one');
  });

  it('returns the input list untouched when nothing is missing', () => {
    const results = [r('video', '/videos/a'), r('category', '/cat/a')];
    const extras = [r('video', '/videos/a')];
    expect(mergeEnsuredResults(results, extras, 'video')).toBe(results);
  });

  it('returns the input list untouched when the type has no matches at all', () => {
    const results = [r('category', '/cat/a')];
    expect(mergeEnsuredResults(results, [], 'video')).toBe(results);
  });

  it('ignores extras of the wrong type and never reorders the global results', () => {
    const results = [r('category', '/cat/a'), r('product', 'https://x/p/1')];
    const extras = [r('blog', '/blog/x'), r('video', '/videos/v')];
    const out = mergeEnsuredResults(results, extras, 'video');
    expect(out.slice(0, 2)).toEqual(results);
    expect(out.map((x) => x.url)).toEqual(['/cat/a', 'https://x/p/1', '/videos/v']);
  });
});
