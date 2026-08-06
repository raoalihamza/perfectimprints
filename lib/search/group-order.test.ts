import { describe, expect, it } from 'vitest';
import { SEARCH_GROUP_ORDER, orderedSearchGroups } from './group-order';

describe('orderedSearchGroups', () => {
  it('returns the default order unchanged when no priority is set (the header box)', () => {
    expect(orderedSearchGroups()).toBe(SEARCH_GROUP_ORDER);
    expect(orderedSearchGroups().map((g) => g.type)).toEqual([
      'category',
      'product',
      'brand',
      'blog',
      'video',
      'faq',
    ]);
  });

  it('puts blogs first on the blog index, everything else in its existing order', () => {
    expect(orderedSearchGroups('blog').map((g) => g.type)).toEqual([
      'blog',
      'category',
      'product',
      'brand',
      'video',
      'faq',
    ]);
  });

  it('puts videos first on the video index, everything else in its existing order', () => {
    expect(orderedSearchGroups('video').map((g) => g.type)).toEqual([
      'video',
      'category',
      'product',
      'brand',
      'blog',
      'faq',
    ]);
  });

  it('never changes the per-group caps or headings (presentation reorder only)', () => {
    const byType = new Map(SEARCH_GROUP_ORDER.map((g) => [g.type, g]));
    for (const g of orderedSearchGroups('blog')) {
      expect(g).toBe(byType.get(g.type));
    }
    expect(orderedSearchGroups('video')).toHaveLength(SEARCH_GROUP_ORDER.length);
  });
});
