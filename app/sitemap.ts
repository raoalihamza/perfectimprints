import type { MetadataRoute } from 'next';
import fs from 'node:fs';
import path from 'node:path';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  ''
);

interface CategoryUrlsFile {
  urls: { url: string }[];
}

interface BlogUrlsFile {
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
  '/blog',
  '/brands',
  '/videos',
  '/search',
];

function readCategoryUrls(): string[] {
  const file = path.join(process.cwd(), 'data', 'pi-urls', 'category-urls.json');
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as CategoryUrlsFile;
  return parsed.urls.map((u) => u.url);
}

function readBlogUrls(): string[] {
  const file = path.join(process.cwd(), 'data', 'pi-urls', 'blog-urls.json');
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as BlogUrlsFile;
  return parsed.urls.map((u) => u.url);
}

function readBrandSlugs(): string[] {
  const file = path.join(process.cwd(), 'data', 'geiger', 'brands.json');
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as BrandsJsonFile;
  return parsed.brands.map((b) => b.slug).filter(Boolean);
}

export default function sitemap(): MetadataRoute.Sitemap {
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

  for (const url of readBlogUrls()) {
    entries.push({
      url: `${SITE_URL}${url}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
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
