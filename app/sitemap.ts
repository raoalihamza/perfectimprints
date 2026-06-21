import type { MetadataRoute } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import { getBlogPostSlugs, getAllBlogCategories } from '@/lib/sanity/queries/blogs';
import { getVideoSlugs } from '@/lib/sanity/queries/videos';

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
  '/faqs',
  '/privacy',
  '/terms',
  '/rush-promotional-products',
  '/rush-products',
  '/blog',
  '/brands',
  '/deals',
  '/new-products',
  '/videos',
  '/search',
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

function readBrandSlugs(): string[] {
  const file = path.join(process.cwd(), 'data', 'geiger', 'brands.json');
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as BrandsJsonFile;
  return parsed.brands.map((b) => b.slug).filter(Boolean);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const p of STATIC_PATHS) {
    entries.push({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: 'weekly' });
  }

  // Category page-1 URLs only. Paginated variants (/page/N) are intentionally excluded:
  // page 2+ carries noindex,follow and canonicalizes to page 1, so they should not be
  // surfaced in the sitemap. They remain discoverable via the Pagination follow links.
  for (const url of readCategoryUrls()) {
    entries.push({
      url: `${SITE_URL}${url}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

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

  // Published video detail pages. The /videos index itself is in STATIC_PATHS.
  for (const url of await readVideoUrlsFromSanity()) {
    entries.push({
      url: `${SITE_URL}${url}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  // Per-brand pages. Paginated /brands/<slug>/page/N variants are intentionally
  // excluded, matching the noindex convention used for category pagination.
  for (const slug of readBrandSlugs()) {
    entries.push({
      url: `${SITE_URL}/brands/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  return entries;
}
