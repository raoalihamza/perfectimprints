/**
 * AUTO-204 Part 3: the "Related Blogs About ..." row on a root category page
 * shows a generated post's hot-linked header instead of a placeholder.
 *
 * The change is two lines, made with Ali's explicit word because it touches a
 * `/cat` query: `externalHeaderImage{ url, alt }` in `getRelatedBlogs`'
 * projection, and the fallback in this component. What must NOT change is
 * pinned here as well: the row is still ONE tag-cached read with
 * `revalidate: false` (that is what keeps every `/cat` page static, CLAUDE.md
 * Section 13), the component is still a server component that reads nothing
 * from the request, and the image is still a plain `<img>` from a host the
 * site already serves images from.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRelatedBlogs: vi.fn() }));

vi.mock('@/lib/sanity/queries/related-blogs', () => ({ getRelatedBlogs: mocks.getRelatedBlogs }));
// The Sanity URL builder needs the project config; a stand-in with the same contract (null without an asset).
vi.mock('@/lib/sanity/client', () => ({
  buildImageUrl: (source: { asset?: { _ref?: string } } | null | undefined) =>
    source?.asset?._ref ? `https://cdn.sanity.io/images/p/production/${source.asset._ref}.jpg?w=600&h=338&fit=crop` : null,
}));

// eslint-disable-next-line import/first
import { RelatedBlogsSection } from './RelatedBlogsSection';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const GEIGER = 'https://imgsirv.geiger.com/master/106415/web/106415_91A_1.jpg?format=webp&thumbnail=275&w=275&h=275';
const card = (id: string, extra: Record<string, unknown>) => ({
  _id: id,
  title: `Post ${id}`,
  slug: { current: `post-${id}` },
  publishDate: '2026-10-01T00:00:00Z',
  excerpt: 'An excerpt.',
  ...extra,
});
const asset = { _type: 'image', asset: { _type: 'reference', _ref: 'image-abc-1376x768-jpg' } };

async function render(cards: unknown[]): Promise<string> {
  mocks.getRelatedBlogs.mockResolvedValue(cards);
  const el = await RelatedBlogsSection({ categorySlug: 'measuring-cups', categoryTitle: 'Measuring Cups' });
  return el ? renderToStaticMarkup(el) : '';
}
/** The one card's markup. */
const imgSrc = (html: string) => /<img[^>]+src="([^"]+)"/.exec(html)?.[1].replace(/&amp;/g, '&') ?? null;

beforeEach(() => mocks.getRelatedBlogs.mockReset());

describe('the card image', () => {
  it('a post with a header asset shows the asset, exactly as before', async () => {
    const html = await render([card('a', { headerImage: asset })]);
    expect(imgSrc(html)).toBe('https://cdn.sanity.io/images/p/production/image-abc-1376x768-jpg.jpg?w=600&h=338&fit=crop');
    expect(html).not.toContain('imgsirv.geiger.com');
  });

  it('a post whose header is a hot link shows the Geiger photo at 600, not the placeholder (the fix)', async () => {
    const html = await render([card('h', { externalHeaderImage: { url: GEIGER, alt: "Cook's Choice One-Cup Measuring Cup" } })]);
    expect(imgSrc(html)).toBe('https://imgsirv.geiger.com/master/106415/web/106415_91A_1.jpg?format=webp&thumbnail=600&w=600&h=600');
    // The card is still labelled with the post's title, lazily loaded, and has no placeholder.
    expect(html).toContain('alt="Post h"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('>Perfect Imprints<');
  });

  it('the asset wins when a post carries both', async () => {
    const html = await render([card('b', { headerImage: asset, externalHeaderImage: { url: GEIGER } })]);
    expect(imgSrc(html)).toContain('cdn.sanity.io');
  });

  it('a post with neither still shows the placeholder', async () => {
    const html = await render([card('n', {})]);
    expect(imgSrc(html)).toBeNull();
    expect(html).toContain('>Perfect Imprints<');
  });

  it('only an https Geiger image URL is ever rendered from the hot link: anything else is the placeholder', async () => {
    for (const url of [
      'http://imgsirv.geiger.com/master/1/web/1.jpg',
      'https://imgsirv.geiger.com.evil.test/master/1/web/1.jpg',
      'https://example.com/a.jpg?host=imgsirv.geiger.com',
      'javascript:alert(1)',
      '   ',
    ]) {
      const html = await render([card('x', { externalHeaderImage: { url } })]);
      expect(imgSrc(html), url).toBeNull();
      expect(html, url).toContain('>Perfect Imprints<');
    }
  });

  it('no related posts renders nothing, and the row asks for its own root slug once', async () => {
    expect(await render([])).toBe('');
    expect(mocks.getRelatedBlogs).toHaveBeenCalledTimes(1);
    expect(mocks.getRelatedBlogs).toHaveBeenCalledWith('measuring-cups');
  });
});

describe('what did NOT change: the row is one cached read and the route stays static', () => {
  const query = read('lib/sanity/queries/related-blogs.ts');
  const component = read('components/category/RelatedBlogsSection.tsx');

  it('the projection gained exactly one field', () => {
    const projection = query.slice(query.indexOf('| order(publishDate desc) [0...8] {'), query.indexOf('{ slug: rootSlug }'));
    expect(projection.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('|') && l !== '}`,')).toEqual([
      '_id,',
      'title,',
      'slug,',
      'headerImage,',
      'externalHeaderImage{ url, alt },',
      'publishDate,',
      '"excerpt": coalesce(excerpt, pt::text(body)[0...120])',
    ]);
  });

  it('the filter, the order and the limit are what they were', () => {
    expect(query).toContain('*[_type == "blogPost"');
    expect(query).toContain('&& !(_id in path("drafts.**"))');
    expect(query).toContain('&& $slug in relatedCategorySlugs]');
    expect(query).toContain('| order(publishDate desc) [0...8] {');
  });

  it('it is still ONE fetch, through the non-CDN cached client, tagged, never revalidated on a timer and never uncached', () => {
    expect(query.match(/\.fetch</g)).toHaveLength(1);
    expect(query).toContain('await cachedClient.fetch<RelatedBlogCard[]>(');
    expect(query).toContain('{ next: { tags: [RELATED_BLOGS_TAG], revalidate: false } },');
    expect(query).not.toContain('no-store');
    // Its only runtime imports are the cached client and the tag; the rest are types.
    expect(query.match(/^import (?!type).*$/gm)).toEqual([
      "import { cachedClient } from '@/lib/sanity/client';",
      "import { RELATED_BLOGS_TAG } from '@/lib/sanity/cache-tags';",
    ]);
  });

  it('the component is still a server component that reads nothing from the request and makes no second read', () => {
    expect(component).not.toMatch(/['"]use client['"]/);
    for (const banned of ['searchParams', 'useSearchParams', 'cookies(', 'headers(', 'no-store', 'useEffect', 'useState', 'fetch(']) {
      expect(component, banned).not.toContain(banned);
    }
    expect(component.match(/^import .*$/gm)).toEqual([
      "import Link from 'next/link';",
      "import { buildImageUrl } from '@/lib/sanity/client';",
      "import { getRelatedBlogs } from '@/lib/sanity/queries/related-blogs';",
      "import { externalHeaderImageUrl } from '@/lib/blog/header-image';",
    ]);
    expect(component.match(/await getRelatedBlogs\(/g)).toHaveLength(1);
  });

  it('the hot link helper is pure: the row pulls no Sanity or server module in through it', () => {
    expect(read('lib/blog/header-image.ts').match(/^import .*$/gm)).toBeNull();
  });

  it("the category route's static settings are untouched, and it still mounts the row on root pages only", () => {
    const page = read('app/cat/[...slug]/page.tsx');
    expect(page).toContain('export const dynamicParams = true;');
    expect(page).toContain('export const revalidate = false;');
    expect(page).toContain('<RelatedBlogsSection categorySlug={rootSlug} categoryTitle={title} />');
    expect(page).not.toContain('externalHeaderImage');
  });
});

describe("Ali's condition: the Geiger image host was already allowed on this route", () => {
  const config = read('next.config.ts');

  it('the row renders a plain <img>, as the product grid on the same page does: no image optimiser is involved', () => {
    expect(read('components/category/RelatedBlogsSection.tsx')).toContain('<img');
    expect(read('components/category/RelatedBlogsSection.tsx')).not.toContain('next/image');
    expect(read('components/category/ProductImage.tsx')).toContain('<img');
  });

  it('the host is in images.remotePatterns already; AUTO-204 added nothing to next.config', () => {
    expect(config).toMatch(/remotePatterns:\s*\[\s*\{\s*protocol: 'https',\s*hostname: 'imgsirv\.geiger\.com',\s*pathname: '\/\*\*',/);
  });

  it('no Content-Security-Policy is set. If one is ever added, img-src must name imgsirv.geiger.com and cdn.sanity.io, or these cards and the whole product grid go blank', () => {
    expect(config).not.toMatch(/Content-Security-Policy/i);
  });
});
