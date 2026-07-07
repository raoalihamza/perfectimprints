import type { MetadataRoute } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import { getBlogPostSlugs, getAllBlogCategories } from '@/lib/sanity/queries/blogs';
import { getVideoSlugs } from '@/lib/sanity/queries/videos';
import { getAllPageSlugs } from '@/lib/sanity/queries/pages';
import { getAllLandingPageSlugs } from '@/lib/sanity/queries/landing-pages';
import { getAllGeneratedCategorySlugs, resolveProductsBySku } from '@/lib/categories';
import { largeSocialImage } from '@/lib/seo/open-graph';
import { RESERVED_SLUG_SET } from '@/lib/reserved-slugs';
import { SIMPLE_NAV } from '@/lib/nav-data';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  ''
);

interface CategoryUrlsFile {
  urls: { url: string }[];
}

interface BrandsJsonFile {
  brands: { slug: string }[];
}

const STATIC_PATHS: string[] = [
  '/',
  '/about',
  '/contact',
  '/faq',
  '/sample-policy',
  '/shipping-policy',
  '/returns',
  '/privacy-security',
  '/company-core-values',
  '/terms',
  '/promotional-products',
  '/rush-promotional-products',
  '/rush-products',
  '/blog',
  '/brands',
  '/deals',
  '/new-products',
  '/videos',
  // NOTE: /search is intentionally excluded — it is noindex (see app/search/page.tsx).
  '/services/kitting',
  '/services/company-stores',
  '/services/popup-stores',
  '/services/custom-products',
];

function readCategoryUrls(): string[] {
  const file = path.join(process.cwd(), 'data', 'pi-urls', 'category-urls.json');
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as CategoryUrlsFile;
  return parsed.urls.map((u) => u.url);
}

// Sanity is the source of truth for blog URLs after the M4-402 migration.
// Drafts are excluded (the queries use the published perspective).
async function readBlogUrlsFromSanity(): Promise<{ posts: string[]; categories: string[] }> {
  try {
    const [postSlugs, categories] = await Promise.all([
      getBlogPostSlugs(),
      getAllBlogCategories(),
    ]);
    return {
      posts: postSlugs.map((s) => `/blog/${s}`),
      categories: categories.map((c) => `/blog/cat/${c.slug.current}`),
    };
  } catch {
    // During build, before Sanity is populated, Sanity may error out. Fall back
    // to nothing so the sitemap still builds — blog URLs surface once Sanity
    // has data.
    return { posts: [], categories: [] };
  }
}

// Published video detail pages (M5-507). Best-effort from Sanity — if it errors
// (e.g. before the dataset is populated) the sitemap still builds without them.
async function readVideoUrlsFromSanity(): Promise<string[]> {
  try {
    const slugs = await getVideoSlugs();
    return slugs.map((s) => `/videos/${s}`);
  } catch {
    return [];
  }
}

// Arbitrary custom top-level `page` docs (Issue 2), served at /<slug> by
// app/[...slug] (multi-segment slugs like industry/hvac render at their full
// path). Exclude reserved slugs and the Services page slugs (which render
// under /services/<slug> and are already in STATIC_PATHS) so nothing is listed
// twice. The eight footer/legal slugs are reserved, so they're excluded here too
// and remain covered by STATIC_PATHS.
const SERVICE_SLUGS = new Set(
  (SIMPLE_NAV.find((n) => n.label === 'Services')?.children ?? [])
    .map((c) => c.href)
    .filter((h) => h.startsWith('/services/'))
    .map((h) => h.replace('/services/', '')),
);

async function readDynamicPageUrls(): Promise<string[]> {
  try {
    const slugs = await getAllPageSlugs();
    return slugs
      .filter((s) => s && !RESERVED_SLUG_SET.has(s) && !SERVICE_SLUGS.has(s))
      .map((s) => `/${s}`);
  } catch {
    return [];
  }
}

// Local/topic landing pages (P2-AI-005), served at /<slug> by app/[...slug]
// (resolved BEFORE `page` docs). Indexable, self-canonical, one entry each.
// Same exclusions as the route's ROUTE_RESERVED (reserved + Services slugs) so
// the sitemap never lists a URL the route would 404.
async function readLandingPageUrls(): Promise<string[]> {
  try {
    const slugs = await getAllLandingPageSlugs();
    return slugs
      .filter((s) => s && !RESERVED_SLUG_SET.has(s) && !SERVICE_SLUGS.has(s))
      .map((s) => `/${s}`);
  } catch {
    return [];
  }
}

function readBrandSlugs(): string[] {
  const file = path.join(process.cwd(), 'data', 'geiger', 'brands.json');
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as BrandsJsonFile;
  return parsed.brands.map((b) => b.slug).filter(Boolean);
}

// One representative image per category URL for the sitemap's <image:image>
// entries (M-SEO5) — strengthens image-to-page association for Google Images /
// SERP thumbnails. Mirrors the categoryOgImage logic: first resolvable SKU with
// an image, upsized to the ~1200px variant. Costs one extra pass over the baked
// category JSONs (the same read generateStaticParams already does each build)
// plus lookups against the memoized products index — no network, build-time
// only. CTA-only categories have no imageSkus (no grid → no image claim).
function buildCategoryImageMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of getAllGeneratedCategorySlugs()) {
    if (s.imageSkus.length === 0) continue;
    const withImage = resolveProductsBySku(s.imageSkus).find((p) => p.imageUrl);
    const image = largeSocialImage(withImage?.imageUrl);
    if (image) map.set(`/cat/${s.urlSlug}`, image);
  }
  return map;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  // Per-section tallies for the build log so coverage is verifiable at a glance.
  const counts = { static: 0, category: 0, categoryImages: 0, blogPosts: 0, blogCats: 0, videos: 0, brands: 0, pages: 0, landingPages: 0 };

  for (const p of STATIC_PATHS) {
    entries.push({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: 'weekly' });
  }
  counts.static = STATIC_PATHS.length;

  // Category page-1 URLs only. Paginated variants (/page/N) are intentionally excluded:
  // page 2+ carries noindex,follow and canonicalizes to page 1, so they should not be
  // surfaced in the sitemap. They remain discoverable via the Pagination follow links.
  const categoryUrls = readCategoryUrls();
  const categoryImages = buildCategoryImageMap();
  for (const url of categoryUrls) {
    const image = categoryImages.get(url);
    if (image) counts.categoryImages += 1;
    entries.push({
      url: `${SITE_URL}${url}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
      ...(image ? { images: [image] } : {}),
    });
  }
  counts.category = categoryUrls.length;

  // Published blog posts + blog category index pages. Pulled from Sanity (the
  // source of truth post-M4-402); paginated /page/N variants intentionally
  // excluded (page 1 only).
  const { posts, categories } = await readBlogUrlsFromSanity();
  for (const url of posts) {
    entries.push({
      url: `${SITE_URL}${url}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }
  for (const url of categories) {
    entries.push({
      url: `${SITE_URL}${url}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }
  counts.blogPosts = posts.length;
  counts.blogCats = categories.length;

  // Published video detail pages. The /videos index itself is in STATIC_PATHS.
  const videoUrls = await readVideoUrlsFromSanity();
  for (const url of videoUrls) {
    entries.push({
      url: `${SITE_URL}${url}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }
  counts.videos = videoUrls.length;

  // Per-brand pages. Paginated /brands/<slug>/page/N variants are intentionally
  // excluded, matching the noindex convention used for category pagination.
  const brandSlugs = readBrandSlugs();
  for (const slug of brandSlugs) {
    entries.push({
      url: `${SITE_URL}/brands/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }
  counts.brands = brandSlugs.length;

  // Local/topic landing pages (P2-AI-005) first, then arbitrary custom
  // top-level pages — both live at /<slug> via app/[...slug]. A slug used by
  // BOTH types renders the landing page (route precedence), so dedupe with the
  // landing set winning to avoid listing the same URL twice.
  const landingPageUrls = await readLandingPageUrls();
  for (const url of landingPageUrls) {
    entries.push({
      url: `${SITE_URL}${url}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }
  counts.landingPages = landingPageUrls.length;

  // Arbitrary custom top-level pages (/<slug> via app/[...slug]). Indexable, one
  // entry each, deduped against services/static above + the landing pages.
  const landingUrlSet = new Set(landingPageUrls);
  const dynamicPageUrls = (await readDynamicPageUrls()).filter((u) => !landingUrlSet.has(u));
  for (const url of dynamicPageUrls) {
    entries.push({
      url: `${SITE_URL}${url}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }
  counts.pages = dynamicPageUrls.length;

  // Google caps a single sitemap at 50,000 URLs / 50 MB. We're at ~23k, so a
  // single sitemap.xml is spec-valid and Next emits one file. If the catalog ever
  // grows past 50k, switch to generateSitemaps() to split into an index — see
  // CLAUDE.md §11 / docs.
  console.log(
    `[sitemap] ${entries.length} URLs — static:${counts.static} category:${counts.category} ` +
      `(with images:${counts.categoryImages}) blogPosts:${counts.blogPosts} blogCats:${counts.blogCats} ` +
      `videos:${counts.videos} brands:${counts.brands} pages:${counts.pages} landingPages:${counts.landingPages}`,
  );

  return entries;
}
