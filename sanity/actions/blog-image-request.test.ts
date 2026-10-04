/**
 * AUTO-202: what the two blog Studio buttons send to the image route and
 * what they patch from its answer.
 */
import { describe, expect, it } from 'vitest';
import { capOf, hasHeaderImage, headerImageSignature, imageRequestBody, patchForOutcome } from './blog-image-request';

const asset = { _type: 'image' as const, asset: { _type: 'reference' as const, _ref: 'image-gen-1376x768-jpg' }, alt: 'alt' };

describe('headerImageSignature', () => {
  it('names the asset, else the hot link, else nothing', () => {
    expect(headerImageSignature({ headerImage: { asset: { _ref: 'image-a' } } })).toBe('asset:image-a');
    expect(headerImageSignature({ headerImage: { asset: { _ref: 'image-a' } }, externalHeaderImage: { url: 'https://x' } })).toBe('asset:image-a');
    expect(headerImageSignature({ externalHeaderImage: { url: ' https://imgsirv.geiger.com/a.jpg ' } })).toBe('url:https://imgsirv.geiger.com/a.jpg');
    expect(headerImageSignature({ headerImage: { asset: { _ref: '' } }, externalHeaderImage: { url: '' } })).toBe('');
    expect(headerImageSignature(null)).toBe('');
    expect(hasHeaderImage({ headerImage: { asset: { _ref: 'image-a' } } })).toBe(true);
    expect(hasHeaderImage({})).toBe(false);
  });
});

describe('imageRequestBody', () => {
  const strip = { _type: 'blogProducts', _key: 's', products: [{ _type: 'blogProduct', sku: '501003' }] };
  it('sends the title, the keywords (or the topic the post was generated from), the strip SKUs, the related roots, the slug and the source', () => {
    expect(
      imageRequestBody(
        { title: 'T', slug: { current: 't' }, body: [strip], aiTopicKeywords: ['custom totes'], relatedCategorySlugs: ['tote-bags'], headerImageSource: 'library' },
        'default',
      ),
    ).toEqual({ title: 'T', keywords: ['custom totes'], skus: ['501003'], rootSlugs: ['tote-bags'], slug: 't', source: 'default', postSource: 'library' });
    expect(imageRequestBody({ title: 'T', sourceTopic: { query: 'custom pens' } }, 'ai')).toEqual({ title: 'T', keywords: ['custom pens'], skus: [], rootSlugs: [], slug: '', source: 'ai', postSource: undefined });
  });

  it('an explicit body (the one just patched) wins over the document\'s', () => {
    const fresh = { _type: 'blogProducts', _key: 's2', products: [{ _type: 'blogProduct', sku: '999' }] };
    expect(imageRequestBody({ title: 'T', body: [strip] }, 'default', [fresh]).skus).toEqual(['999']);
  });
});

describe('patchForOutcome', () => {
  it('an asset sets headerImage and clears the hot link; a hot link sets externalHeaderImage and clears the asset; nothing for none', () => {
    expect(patchForOutcome({ kind: 'asset', source: 'ai', image: asset })).toEqual({ set: { headerImage: asset }, unset: ['externalHeaderImage'] });
    expect(patchForOutcome({ kind: 'url', source: 'product', url: 'https://imgsirv.geiger.com/a.jpg', alt: 'Tote' })).toEqual({
      set: { externalHeaderImage: { url: 'https://imgsirv.geiger.com/a.jpg', alt: 'Tote' } },
      unset: ['headerImage'],
    });
    expect(patchForOutcome({ kind: 'none', notes: [] })).toBeNull();
    expect(patchForOutcome(undefined)).toBeNull();
  });

  it('capOf reads the counter when the route reported it', () => {
    expect(capOf({ kind: 'asset', usage: { capUsed: 3, cap: 20 } })).toEqual({ used: 3, cap: 20 });
    expect(capOf({ kind: 'url' })).toBeUndefined();
  });
});
