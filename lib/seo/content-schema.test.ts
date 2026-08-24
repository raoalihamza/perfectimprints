import { describe, expect, it } from 'vitest';

import { buildBlogListingSchemas, buildBlogPostingSchema } from './content-schema';

const SITE = 'https://www.perfectimprints.com';

describe('buildBlogPostingSchema dateModified (SNIP-150)', () => {
  const base = {
    title: 'Buying Guide for Stadium Seat Cushions',
    canonical: `${SITE}/blog/buying-guide-for-stadium-seat-cushions`,
    publishDate: '2016-08-25T00:00:00.000Z',
    siteUrl: SITE,
  };

  it('emits dateModified when the editor recorded an updated date', () => {
    const schema = buildBlogPostingSchema({ ...base, updatedDate: '2025-04-22T00:00:00.000Z' });
    expect(schema.datePublished).toBe('2016-08-25T00:00:00.000Z');
    expect(schema.dateModified).toBe('2025-04-22T00:00:00.000Z');
    expect(JSON.stringify(schema)).toContain('"dateModified":"2025-04-22T00:00:00.000Z"');
  });

  /**
   * The old fallback served dateModified = publishDate on every post with no
   * recorded update (310 of 652 live posts at the time of the change). That
   * is a date nobody recorded; Google lists dateModified as recommended only
   * where applicable and shows no warning for its absence, so the honest
   * output is no key at all. JSON.stringify drops the undefined.
   */
  it('omits dateModified entirely when no updated date was ever recorded', () => {
    for (const updatedDate of [undefined, null, '']) {
      const schema = buildBlogPostingSchema({ ...base, updatedDate });
      expect(schema.dateModified).toBeUndefined();
      const json = JSON.stringify(schema);
      expect(json).not.toContain('dateModified');
      expect(json).toContain('"datePublished":"2016-08-25T00:00:00.000Z"');
    }
  });

  it('never invents a modification date from anything else on the input', () => {
    const schema = buildBlogPostingSchema({ ...base });
    expect(Object.keys(schema)).not.toContain('dateModifiedFallback');
    expect(schema.dateModified).toBeUndefined();
  });

  it('leaves every other BlogPosting field exactly as before', () => {
    const schema = buildBlogPostingSchema({
      ...base,
      heroImage: `${SITE}/hero.jpg`,
      authorName: 'Patrick Black',
      description: 'A guide.',
    });
    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: base.title,
      image: [`${SITE}/hero.jpg`],
      datePublished: base.publishDate,
      author: { '@type': 'Person', name: 'Patrick Black' },
      publisher: {
        '@type': 'Organization',
        name: 'Perfect Imprints',
        logo: { '@type': 'ImageObject', url: `${SITE}/logo.svg` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': base.canonical },
      description: 'A guide.',
    });
  });
});

describe('buildBlogListingSchemas (SNIP-150)', () => {
  it('emits CollectionPage + a summary-page ItemList with position and url only', () => {
    const schemas = buildBlogListingSchemas({
      name: 'Perfect Imprints Blog',
      url: `${SITE}/blog`,
      description: 'Ideas and tips.',
      postUrls: [`${SITE}/blog/a`, `${SITE}/blog/b`, `${SITE}/blog/c`],
    });
    expect(schemas).toHaveLength(2);
    expect(schemas[0]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Perfect Imprints Blog',
      url: `${SITE}/blog`,
      description: 'Ideas and tips.',
    });
    expect(schemas[1]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      numberOfItems: 3,
      itemListElement: [
        { '@type': 'ListItem', position: 1, url: `${SITE}/blog/a` },
        { '@type': 'ListItem', position: 2, url: `${SITE}/blog/b` },
        { '@type': 'ListItem', position: 3, url: `${SITE}/blog/c` },
      ],
    });
    // Summary-page shape: no name / image / nested item per ListItem, and no
    // Product anywhere (this is not the product serializer).
    const json = JSON.stringify(schemas);
    expect(json).not.toContain('"name":"a"');
    expect(json).not.toContain('"image"');
    expect(json).not.toContain('"item"');
    expect(json).not.toContain('Product');
  });

  it('positions restart at 1 for whatever page is passed (per-page rule)', () => {
    const page2 = buildBlogListingSchemas({
      name: 'Perfect Imprints Blog - Page 2',
      url: `${SITE}/blog`,
      postUrls: [`${SITE}/blog/m`, `${SITE}/blog/n`],
    });
    const list = page2[1] as { itemListElement: { position: number }[] };
    expect(list.itemListElement.map((e) => e.position)).toEqual([1, 2]);
  });

  it('emits the CollectionPage alone, and NO ItemList, for a category with no posts', () => {
    const schemas = buildBlogListingSchemas({
      name: 'Posts in Custom Drinkware',
      url: `${SITE}/blog/cat/custom-drinkware`,
      postUrls: [],
    });
    expect(schemas).toHaveLength(1);
    expect(schemas[0]['@type']).toBe('CollectionPage');
    expect(JSON.stringify(schemas)).not.toContain('ItemList');
  });

  it('omits description when blank and ignores empty url strings', () => {
    const schemas = buildBlogListingSchemas({
      name: 'Posts in Uncategorized',
      url: `${SITE}/blog/cat/uncategorized`,
      description: '',
      postUrls: ['', `${SITE}/blog/only`],
    });
    expect(schemas[0]).not.toHaveProperty('description');
    expect((schemas[1] as { numberOfItems: number }).numberOfItems).toBe(1);
  });
});
