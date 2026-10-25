/**
 * VID-100: the "Related Videos About ..." row on a root category page, the
 * twin of RelatedBlogsSection, mounted directly under it.
 *
 * The behaviour is small (cards for the linked videos, nothing for a root
 * with none). What this file mostly pins is what must NOT be true, because
 * `app/cat/[...slug]/page.tsx` is the most protected file in the codebase:
 * the row is ONE tag-cached read with `revalidate: false` (what keeps every
 * `/cat` page static, CLAUDE.md Section 13); its tag is its OWN, read by one
 * query and busted by one webhook branch, so the only event that reaches the
 * root pages through it is a video publish; the blogs row, its query and the
 * video page's own queries are byte-for-byte untouched; and the field a video
 * carries is the blog post's field under the blog post's picker and rule.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRelatedVideosForCategory: vi.fn() }));

vi.mock('@/lib/sanity/queries/related-videos', () => ({
  getRelatedVideosForCategory: mocks.getRelatedVideosForCategory,
  RELATED_VIDEOS_PER_ROOT: 4,
}));
// The Sanity URL builder needs the project config; stand-ins with the same
// contract (null without an asset). `cachedClient` is imported by the videos
// query module that the card builder pulls in for `videoCategoriesOf`; it is
// never called here.
vi.mock('@/lib/sanity/client', () => ({
  buildRenderImageUrl: (source: { asset?: { _ref?: string } } | null | undefined) =>
    source?.asset?._ref ? `https://cdn.sanity.io/images/p/production/${source.asset._ref}.jpg?w=800&h=450&fit=crop&auto=format` : null,
  buildImageUrl: () => null,
  cachedClient: {},
}));

// eslint-disable-next-line import/first
import { RelatedVideosSection } from './RelatedVideosSection';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
// Built from the code point so this file does not itself carry the character it bans.
const EM_DASH = String.fromCharCode(0x2014);

function filesUnder(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full.slice(ROOT.length + 1).replace(/\\/g, '/'));
    }
  };
  walk(join(ROOT, rel));
  return out;
}

const video = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  title: `Video ${id}`,
  slug: { current: `video-${id}` },
  embedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  publishDate: '2026-10-01T00:00:00Z',
  description: [{ _type: 'block', _key: 'k', children: [{ _type: 'span', _key: 's', text: 'A teaser.' }] }],
  categories: [{ title: 'Case Studies', slug: 'case-studies' }],
  ...extra,
});

async function render(videos: unknown[]): Promise<string> {
  mocks.getRelatedVideosForCategory.mockResolvedValue(videos);
  const el = await RelatedVideosSection({ categorySlug: 'pens', categoryTitle: 'Custom Pens' });
  return el ? renderToStaticMarkup(el) : '';
}

beforeEach(() => mocks.getRelatedVideosForCategory.mockReset());

describe('the row', () => {
  it('lists the linked videos as the existing VideoCard, newest first as returned, under its own heading', async () => {
    const html = await render([video('a'), video('b')]);
    expect(html).toContain('Related Videos About Custom Pens');
    expect(html.indexOf('Video a')).toBeLessThan(html.indexOf('Video b'));
    // The YouTube auto thumbnail, the play overlay and the internal link are the card's own.
    expect(html).toContain('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(html).toContain('href="/videos/video-a"');
    expect(html).toContain('Watch Video');
    expect(html).toContain('Case Studies');
    expect(html).toContain('loading="lazy"');
  });

  it('a custom thumbnail wins over the auto one, and a video with neither still renders a card', async () => {
    const asset = { _type: 'image', asset: { _type: 'reference', _ref: 'image-abc-1600x900-jpg' } };
    const html = await render([video('t', { thumbnail: asset }), video('v', { embedUrl: 'https://vimeo.com/123456789' })]);
    expect(html).toContain('cdn.sanity.io/images/p/production/image-abc-1600x900-jpg.jpg');
    expect(html).toContain('>Perfect Imprints<');
    expect(html).toContain('href="/videos/video-v"');
  });

  it('a root with no linked videos renders NOTHING, and the row asks for its own root slug once', async () => {
    expect(await render([])).toBe('');
    expect(mocks.getRelatedVideosForCategory).toHaveBeenCalledTimes(1);
    expect(mocks.getRelatedVideosForCategory).toHaveBeenCalledWith('pens');
  });
});

describe('the read: one cached fetch, its own tag, and the route stays static', () => {
  const query = read('lib/sanity/queries/related-videos.ts');
  const component = read('components/category/RelatedVideosSection.tsx');

  it('is ONE fetch, through the non-CDN cached client, tagged RELATED_VIDEOS_TAG, never on a timer and never uncached', () => {
    expect(query.match(/\.fetch</g)).toHaveLength(1);
    expect(query).toContain('await cachedClient.fetch<VideoSummary[]>(');
    expect(query).toContain('{ next: { tags: [RELATED_VIDEOS_TAG], revalidate: false } },');
    expect(query).not.toContain('no-store');
    // Its own tag only: with RELATED_VIDEOS_TAG removed, no VIDEOS_TAG remains.
    expect(query.replace(/RELATED_VIDEOS_TAG/g, '')).not.toContain('VIDEOS_TAG');
    expect(query.match(/^import (?!type).*$/gm)).toEqual([
      "import { cachedClient } from '@/lib/sanity/client';",
      "import { RELATED_VIDEOS_TAG } from '@/lib/sanity/cache-tags';",
    ]);
  });

  it('matches the bare root slug against the field, published videos with a link only, newest first, four at most', () => {
    expect(query).toContain('*[_type == "video"');
    expect(query).toContain('&& !(_id in path("drafts.**"))');
    expect(query).toContain('&& defined(embedUrl)');
    expect(query).toContain('&& $slug in relatedCategorySlugs]');
    expect(query).toContain('| order(publishDate desc, _createdAt desc) [0...${RELATED_VIDEOS_PER_ROOT}] {');
    expect(query).toContain('export const RELATED_VIDEOS_PER_ROOT = 4;');
    // Only what the card reads: never the strip, the SEO object, the gallery block or the AI inputs.
    for (const heavy of ['relatedProducts', 'seo', 'Gallery', 'aiScript']) expect(query, heavy).not.toContain(heavy);
  });

  it('the component is a server component that reads nothing from the request and makes no second read', () => {
    expect(component).not.toMatch(/['"]use client['"]/);
    for (const banned of ['searchParams', 'useSearchParams', 'cookies(', 'headers(', 'no-store', 'useEffect', 'useState', 'fetch(']) {
      expect(component, banned).not.toContain(banned);
    }
    expect(component.match(/^import .*$/gm)).toEqual([
      "import { VideoCard } from '@/components/videos/VideoCard';",
      "import { getRelatedVideosForCategory } from '@/lib/sanity/queries/related-videos';",
      "import { toVideoCardData } from '@/lib/video/card-data';",
    ]);
    expect(component.match(/await getRelatedVideosForCategory\(/g)).toHaveLength(1);
  });

  it('the tag is spelled once, read by exactly one query module, and busted in exactly one place: the webhook video branch', () => {
    expect(read('lib/sanity/cache-tags.ts')).toContain("export const RELATED_VIDEOS_TAG = 'related-videos';");
    const readers = [...filesUnder('lib'), ...filesUnder('components'), ...filesUnder('app')]
      .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx') && f !== 'lib/sanity/cache-tags.ts')
      .filter((f) => read(f).includes('RELATED_VIDEOS_TAG'));
    expect(readers.sort()).toEqual(['app/api/sanity/revalidate/route.ts', 'lib/sanity/queries/related-videos.ts']);
    const webhook = read('app/api/sanity/revalidate/route.ts');
    expect(webhook.match(/revalidateTag\(RELATED_VIDEOS_TAG, 'max'\)/g)).toHaveLength(1);
    const branch = webhook.slice(webhook.indexOf("if (type === 'video') {"));
    expect(branch.slice(0, branch.indexOf('}'))).toContain("revalidateTag(RELATED_VIDEOS_TAG, 'max');");
    // The same branch still busts VIDEOS_TAG exactly as before.
    expect(branch.slice(0, branch.indexOf('}'))).toContain("revalidateTag(VIDEOS_TAG, 'max');");
  });

  it("the category route's static settings are untouched; both rows mount on root pages only, videos under blogs", () => {
    const page = read('app/cat/[...slug]/page.tsx');
    expect(page).toContain('export const dynamicParams = true;');
    expect(page).toContain('export const revalidate = false;');
    const blogs = '<RelatedBlogsSection categorySlug={rootSlug} categoryTitle={title} />';
    const videos = '<RelatedVideosSection categorySlug={rootSlug} categoryTitle={title} />';
    expect(page.match(new RegExp(blogs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
    expect(page.match(new RegExp(videos.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
    expect(page.indexOf(blogs)).toBeLessThan(page.indexOf(videos));
    expect(page.indexOf(videos)).toBeLessThan(page.indexOf('<CTABanner categoryTitle={title} />'));
    // Both sit inside an `isRoot &&` block.
    const videoBlock = page.slice(page.lastIndexOf('{isRoot && (', page.indexOf(videos)), page.indexOf(videos));
    expect(videoBlock).not.toContain('</Container>');
    // No new import came in beyond the one component (the route's own comments
    // mention searchParams, so a word ban is the wrong test here; the imports are).
    const imports: string[] = page.match(/^import .*$/gm) ?? [];
    expect(imports).toContain("import { RelatedVideosSection } from '@/components/category/RelatedVideosSection';");
    expect(imports.filter((l) => l.includes('RelatedVideos'))).toHaveLength(1);
  });
});

describe('what did NOT change', () => {
  it("the blogs row and its query do not know the videos row exists", () => {
    expect(read('components/category/RelatedBlogsSection.tsx')).not.toContain('Video');
    expect(read('lib/sanity/queries/related-blogs.ts')).not.toContain('video');
  });

  it("the video page's own queries do not read the new field: a video with no category link renders exactly as before", () => {
    expect(read('lib/sanity/queries/videos.ts')).not.toContain('relatedCategorySlugs');
    expect(read('app/videos/[slug]/page.tsx')).not.toContain('relatedCategorySlugs');
    expect(read('app/videos/[slug]/page.tsx')).not.toContain('RELATED_VIDEOS');
  });

  it('the /products, catalog and /videos routes do not read the new tag or the new component', () => {
    for (const dir of ['app/products', 'app/shop-by-theme', 'app/videos', 'components/catalogs', 'components/products', 'components/videos']) {
      for (const file of filesUnder(dir)) {
        expect(read(file), file).not.toContain('RelatedVideosSection');
        expect(read(file), file).not.toContain('RELATED_VIDEOS_TAG');
      }
    }
  });
});

describe('the field on a video is the blog post field, under the blog post picker and rule', () => {
  const schema = read('sanity/schemas/documents/video.ts');
  const field = schema.slice(schema.indexOf("name: 'relatedCategorySlugs'"), schema.indexOf("name: 'category',"));

  it('is a string array picked with RootCategoryPicker and validated item by item as an ERROR by relatedCategorySlugProblem', () => {
    expect(schema).toContain("import { RootCategoryPicker } from '../../components/CategoryPicker';");
    expect(schema).toContain("import { relatedCategorySlugProblem } from '../../../lib/blog/related-category-slugs';");
    expect(field).toContain("type: 'array',");
    expect(field).toContain("type: 'string',");
    expect(field).toContain('Rule.custom((value?: string) => relatedCategorySlugProblem(value) ?? true)');
    expect(field).not.toContain('.warning()');
    expect(field).toContain('components: { input: RootCategoryPicker },');
    expect(field).toContain('Rule.unique()');
    expect(field).not.toContain('initialValue');
  });

  it('the blog post keeps the same field, picker and rule (FIX-900), so the two documents cannot drift', () => {
    const blog = read('sanity/schemas/documents/blog-post.ts');
    expect(blog).toContain("name: 'relatedCategorySlugs',");
    expect(blog).toContain('components: { input: RootCategoryPicker },');
    expect(blog).toContain('Rule.custom((value?: string) => relatedCategorySlugProblem(value) ?? true)');
  });

  it('no em dash in the files this ticket created', () => {
    for (const file of [
      'components/category/RelatedVideosSection.tsx',
      'components/category/RelatedVideosSection.test.tsx',
      'lib/sanity/queries/related-videos.ts',
      'scripts/videos/propose-video-category-links.ts',
      'scripts/videos/apply-video-category-links.ts',
    ]) {
      expect(read(file).includes(EM_DASH), file).toBe(false);
    }
  });
});
