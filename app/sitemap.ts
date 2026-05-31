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

const STATIC_PATHS: string[] = [
  '/',
  '/about',
  '/contact',
  '/faqs',
  '/privacy',
  '/terms',
  '/rush-promotional-products',
  '/blog',
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

  return entries;
}
