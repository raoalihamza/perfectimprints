import 'server-only';

import { getAllBlogSearchEntries } from '@/lib/sanity/queries/blogs';
import { getAllVideoSearchEntries } from '@/lib/sanity/queries/videos';
import { getCustomCategorySearchEntries } from '@/lib/sanity/queries/custom-categories';
import { getCustomProductSearchEntries } from '@/lib/sanity/queries/custom-products';
import type { SearchItem } from './types';

/** Run a query, swallowing failures so one dead source can't sink the others. */
async function safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

/**
 * Build the LIVE search delta — the Sanity-managed content that turns over
 * between deploys (blogs, videos, custom categories, custom products). Served by
 * `app/api/search-index/route.ts` (cached, 1-week revalidate floor, busted by
 * the publish webhook) and merged with the static Geiger bulk on the client.
 *
 * Server-only: pulls in the Sanity client + `server-only`-guarded query modules.
 * Never import this from a client component — the browser fetches the route.
 */
export async function buildSanitySearchItems(): Promise<SearchItem[]> {
  const [blogs, videos, categories, products] = await Promise.all([
    safe(getAllBlogSearchEntries),
    safe(getAllVideoSearchEntries),
    safe(getCustomCategorySearchEntries),
    safe(getCustomProductSearchEntries),
  ]);

  const items: SearchItem[] = [];

  for (const b of blogs) {
    items.push({ type: 'blog', title: b.title.trim(), url: `/blog/${b.slug}` });
  }
  for (const v of videos) {
    const item: SearchItem = { type: 'video', title: v.title.trim(), url: `/videos/${v.slug}` };
    if (v.category) item.category = v.category.trim();
    items.push(item);
  }
  for (const c of categories) {
    items.push({ type: 'category', title: c.title, url: `/cat/${c.slug}` });
  }
  for (const p of products) {
    const item: SearchItem = { type: 'product', title: p.title, url: p.url };
    if (p.brand) item.brand = p.brand;
    if (p.image) item.image = p.image;
    items.push(item);
  }

  return items;
}
