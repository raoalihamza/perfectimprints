/**
 * AUTO-202: the reader side of the blog header image (the asset wins, the
 * hot link is Geiger-only and sized), the one Geiger size rewrite shared with
 * the social image, and the strip SKU collector moved out of the post page.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { externalHeaderImageAlt, externalHeaderImageUrl, geigerImageVariant, hasHeaderAsset } from './header-image';
import { collectBlogProductSkus } from './collect-strip-skus';
import { largeSocialImage } from '../seo/open-graph';

const ROOT = join(__dirname, '..', '..');
const geiger = 'https://imgsirv.geiger.com/master/101003/web/101003_1.jpg?format=webp&thumbnail=275&w=275&h=275';

describe('externalHeaderImageUrl', () => {
  it('is null when the post has a header asset: the upload or the generated picture always wins', () => {
    expect(externalHeaderImageUrl({ headerImage: { asset: { _ref: 'image-x' } }, externalHeaderImage: { url: geiger, alt: 'a' } }, 800)).toBeNull();
    expect(hasHeaderAsset({ headerImage: { asset: { _ref: 'image-x' } } })).toBe(true);
    expect(hasHeaderAsset({ headerImage: { asset: { _ref: '' } } })).toBe(false);
    expect(hasHeaderAsset({ headerImage: null })).toBe(false);
  });

  it('serves the Geiger hot link at the asked width, and nothing from any other host', () => {
    expect(externalHeaderImageUrl({ externalHeaderImage: { url: geiger } }, 800)).toBe(
      'https://imgsirv.geiger.com/master/101003/web/101003_1.jpg?format=webp&thumbnail=800&w=800&h=800',
    );
    expect(externalHeaderImageUrl({ externalHeaderImage: { url: 'https://cdn.sanity.io/images/x/production/a.jpg' } }, 800)).toBeNull();
    expect(externalHeaderImageUrl({ externalHeaderImage: { url: 'http://imgsirv.geiger.com/a.jpg' } }, 800)).toBeNull();
    expect(externalHeaderImageUrl({ externalHeaderImage: { url: 'https://imgsirv.geiger.com.evil.test/a.jpg' } }, 800)).toBeNull();
    expect(externalHeaderImageUrl({ externalHeaderImage: { url: '  ' } }, 800)).toBeNull();
    expect(externalHeaderImageUrl({}, 800)).toBeNull();
    expect(externalHeaderImageUrl(null, 800)).toBeNull();
  });

  it('the alt is the stored alt, or null', () => {
    expect(externalHeaderImageAlt({ externalHeaderImage: { url: geiger, alt: ' Canvas Tote ' } })).toBe('Canvas Tote');
    expect(externalHeaderImageAlt({ externalHeaderImage: { url: geiger } })).toBeNull();
  });
});

describe('geigerImageVariant is the one Geiger size rewrite', () => {
  it('rewrites thumbnail, w and h and leaves other hosts alone', () => {
    expect(geigerImageVariant(geiger, 1200)).toBe('https://imgsirv.geiger.com/master/101003/web/101003_1.jpg?format=webp&thumbnail=1200&w=1200&h=1200');
    expect(geigerImageVariant('https://cdn.sanity.io/images/x/production/a.jpg?w=400', 1200)).toBe('https://cdn.sanity.io/images/x/production/a.jpg?w=400');
  });

  it('the social image helper uses it, so the two cannot drift', () => {
    expect(largeSocialImage(geiger)).toBe(geigerImageVariant(geiger, 1200));
    const src = readFileSync(join(ROOT, 'lib/seo/open-graph.ts'), 'utf8');
    expect(src).toContain("import { geigerImageVariant } from '@/lib/blog/header-image';");
    expect(src).toContain('return geigerImageVariant(url, SOCIAL_IMAGE_PX);');
    expect(src.match(/\\b\(thumbnail\|w\|h\)=/g) ?? []).toHaveLength(0);
  });
});

describe('collectBlogProductSkus', () => {
  it('collects the SKU entries of every strip in order, each once, skipping references and blanks', () => {
    const body = [
      { _type: 'block', _key: 'b' },
      { _type: 'blogProducts', _key: 's1', products: [{ _type: 'blogProduct', sku: ' 501003 ' }, { _type: 'relatedProductRef', _ref: 'x' }, null, { _type: 'blogProduct', sku: '' }] },
      { _type: 'blogProducts', _key: 's2', products: [{ _type: 'blogProduct', sku: '501003' }, { _type: 'blogProduct', sku: '501014 90A' }] },
      null,
    ];
    expect(collectBlogProductSkus(body)).toEqual(['501003', '501014 90A']);
    expect(collectBlogProductSkus(undefined)).toEqual([]);
    expect(collectBlogProductSkus([])).toEqual([]);
  });

  it('the post page imports it rather than carrying its own copy', () => {
    const page = readFileSync(join(ROOT, 'app/blog/[slug]/page.tsx'), 'utf8');
    expect(page).toContain("import { collectBlogProductSkus } from '@/lib/blog/collect-strip-skus';");
    expect(page).not.toMatch(/function collectBlogProductSkus\(/);
    expect(page).toContain("import { externalHeaderImageUrl } from '@/lib/blog/header-image';");
  });

  it('every blog card reader falls back to the hot link after the asset', () => {
    for (const file of ['components/blog/BlogCard.tsx', 'components/blog/RelatedBlogsForPost.tsx', 'app/blog/[slug]/page.tsx']) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      expect(src, file).toMatch(/\?\?\s*externalHeaderImageUrl\(post, \d+\)/);
    }
    expect(readFileSync(join(ROOT, 'lib/sanity/queries/blogs.ts'), 'utf8')).toContain('externalHeaderImage{ url, alt },');
  });
});
