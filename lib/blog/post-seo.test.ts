/**
 * AUTO-220 Part 8b: the "SEO (extra)" fields on a blog post are true
 * overrides. Empty means the main title, description and header image, exactly
 * as before; filled means the field wins. And the social image is always
 * something a card can show.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blogPostSeo, type BlogSeoPost } from './post-seo';
import { socialImageNeedsJpeg } from './header-image';

const deps = {
  imageUrl: (image: { asset?: { _ref?: string | null } | null } | null | undefined, jpeg: boolean) => (image?.asset?._ref ? `cdn/${image.asset._ref}?w=1200${jpeg ? '&fm=jpg' : ''}` : null),
  externalUrl: (post: BlogSeoPost & { externalHeaderImage?: { url?: string } }) => post.externalHeaderImage?.url ?? null,
};
const JPG = { asset: { _ref: 'image-aaa-1661x947-jpg' } };
const AVIF = { asset: { _ref: 'image-bbb-1774x887-avif' } };
const PNG = { asset: { _ref: 'image-ccc-1536x864-png' } };

describe('empty: exactly what the page did before', () => {
  it('the title is the Meta Title, else the post title with the site name; the description is the Meta Description, else the excerpt', () => {
    expect(blogPostSeo({ title: 'Custom Pens', excerpt: 'About pens.', headerImage: JPG }, deps)).toEqual({
      title: 'Custom Pens | Perfect Imprints',
      socialTitle: 'Custom Pens',
      description: 'About pens.',
      image: 'cdn/image-aaa-1661x947-jpg?w=1200',
    });
    expect(blogPostSeo({ title: 'Custom Pens', metaTitle: 'Pens for Business', metaDescription: 'Meta.', excerpt: 'About pens.' }, deps)).toMatchObject({
      title: 'Pens for Business',
      socialTitle: 'Pens for Business',
      description: 'Meta.',
    });
  });

  it('an empty SEO (extra) object, blank strings and an image with no asset are all "empty"', () => {
    const plain = blogPostSeo({ title: 'T', metaTitle: 'M', metaDescription: 'D', headerImage: JPG }, deps);
    for (const seo of [null, undefined, {}, { metaTitle: '', metaDescription: '   ', ogImage: null }, { ogImage: {} }, { ogImage: { asset: null } }]) {
      expect(blogPostSeo({ title: 'T', metaTitle: 'M', metaDescription: 'D', headerImage: JPG, seo }, deps)).toEqual(plain);
    }
  });

  it('a JPEG header is requested exactly as before, so its address does not change', () => {
    expect(blogPostSeo({ title: 'T', headerImage: JPG }, deps).image).toBe('cdn/image-aaa-1661x947-jpg?w=1200');
  });

  it('no header asset: the hot-linked product photo, else nothing (the branded card)', () => {
    expect(blogPostSeo({ title: 'T', externalHeaderImage: { url: 'https://imgsirv.geiger.com/x.jpg' } } as never, deps).image).toBe('https://imgsirv.geiger.com/x.jpg');
    expect(blogPostSeo({ title: 'T' }, deps).image).toBeNull();
  });
});

describe('filled: the SEO (extra) field wins', () => {
  it('each of the three overrides its own main field and nothing else', () => {
    const post = { title: 'Custom Pens', metaTitle: 'Main Title', metaDescription: 'Main description.', excerpt: 'Excerpt.', headerImage: JPG };
    expect(blogPostSeo({ ...post, seo: { metaTitle: 'SEO Title' } }, deps)).toEqual({
      title: 'SEO Title',
      socialTitle: 'SEO Title',
      description: 'Main description.',
      image: 'cdn/image-aaa-1661x947-jpg?w=1200',
    });
    expect(blogPostSeo({ ...post, seo: { metaDescription: 'SEO description.' } }, deps)).toMatchObject({ title: 'Main Title', description: 'SEO description.' });
    expect(blogPostSeo({ ...post, seo: { ogImage: AVIF } }, deps)).toMatchObject({ title: 'Main Title', description: 'Main description.', image: 'cdn/image-bbb-1774x887-avif?w=1200&fm=jpg' });
  });

  it('an AVIF or PNG Open Graph Image is asked for as a JPEG (X does not show an AVIF card image)', () => {
    for (const og of [AVIF, PNG]) {
      expect(blogPostSeo({ title: 'T', headerImage: JPG, seo: { ogImage: og } }, deps).image).toMatch(/&fm=jpg$/);
    }
  });

  it('THE 40 LIVE POSTS whose Open Graph Image is the same JPEG asset as their header: the social image address does not change by one character', () => {
    const before = blogPostSeo({ title: 'T', headerImage: JPG }, deps).image;
    const after = blogPostSeo({ title: 'T', headerImage: JPG, seo: { ogImage: JPG } }, deps).image;
    expect(after).toBe(before);
    expect(after).toBe('cdn/image-aaa-1661x947-jpg?w=1200');
  });
});

describe('the header image as the social image', () => {
  it('anything that is not already a JPEG is asked for as one: the generated PNG, an AVIF or WebP upload', () => {
    expect(socialImageNeedsJpeg('image-ccc-1536x864-png')).toBe(true);
    expect(socialImageNeedsJpeg('image-ccc-1376x768-png')).toBe(true);
    expect(socialImageNeedsJpeg('image-bbb-1774x887-avif')).toBe(true);
    expect(socialImageNeedsJpeg('image-bbb-1774x887-webp')).toBe(true);
    expect(socialImageNeedsJpeg('image-aaa-1661x947-jpg')).toBe(false);
    expect(socialImageNeedsJpeg('image-aaa-1661x947-jpeg')).toBe(false);
    for (const none of [undefined, null, '', 12]) expect(socialImageNeedsJpeg(none)).toBe(false);
    expect(blogPostSeo({ title: 'T', headerImage: PNG }, deps).image).toBe('cdn/image-ccc-1536x864-png?w=1200&fm=jpg');
    expect(blogPostSeo({ title: 'T', headerImage: AVIF }, deps).image).toBe('cdn/image-bbb-1774x887-avif?w=1200&fm=jpg');
  });
});

describe('structure: the page uses the rule and reads the three fields', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('the blog post page builds its metadata from blogPostSeo and no longer tests for -png$', () => {
    const page = read('app/blog/[slug]/page.tsx');
    expect(page).toContain("import { blogPostSeo } from '@/lib/blog/post-seo';");
    expect(page).toContain('const seo = blogPostSeo(post, {');
    expect(page).not.toContain('-png$');
    expect(page).toContain("b.width(1200).format('jpg')");
    // The route keeps its rendering mode: no searchParams, static with on-demand params.
    expect(page).toContain('export const revalidate = false;');
    expect(page).not.toMatch(/searchParams|no-store/);
  });

  it('the post is read once, tagged, with the three SEO (extra) fields projected', () => {
    const q = read('lib/sanity/queries/blogs.ts');
    expect(q).toContain('seo{ metaTitle, metaDescription, ogImage },');
    expect(q).toContain('{ next: { tags: [blogPostTag(slug)].filter(Boolean), revalidate: false } }');
  });

  it('the rule is pure: one import, the JPEG test beside it', () => {
    expect(read('lib/blog/post-seo.ts').match(/^import .*$/gm)).toEqual(["import { socialImageNeedsJpeg } from './header-image';"]);
  });
});
