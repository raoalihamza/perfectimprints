import 'server-only';

import { getAllBlogSearchEntries } from '@/lib/sanity/queries/blogs';
import { getAllVideoSearchEntries } from '@/lib/sanity/queries/videos';
import { getCustomCategorySearchEntries } from '@/lib/sanity/queries/custom-categories';
import { getCustomProductSearchEntries } from '@/lib/sanity/queries/custom-products';
import { getProductPageSearchEntries } from '@/lib/sanity/queries/product-pages';
import { getAllFaqSearchEntries } from '@/lib/sanity/queries/faqs';
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
  const [blogs, videos, categories, products, productPages, faqs] = await Promise.all([
    safe(getAllBlogSearchEntries),
    safe(getAllVideoSearchEntries),
    safe(getCustomCategorySearchEntries),
    safe(getCustomProductSearchEntries),
    safe(getProductPageSearchEntries),
    safe(getAllFaqSearchEntries),
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
  // Product Pages (P2-CP-001): same `product` result group, but the url is the
  // site's own /products/<slug> detail page — `internal: true` makes
  // resultTarget navigate there instead of the affiliate host. The real item
  // number (when Patrick entered one) is a search key; customProduct entries
  // above carry NO sku on purpose — their only SKU is the synthetic
  // custom-<id> internal id, which would be pure noise in search.
  for (const p of productPages) {
    const item: SearchItem = { type: 'product', title: p.title, url: p.url, internal: true };
    if (p.brand) item.brand = p.brand;
    if (p.image) item.image = p.image;
    if (p.sku) item.sku = p.sku;
    items.push(item);
  }
  // Answered FAQs only (the query already filters) — link to the FAQ's section
  // anchor on /faq so the result lands on the question, never a blank answer.
  for (const f of faqs) {
    const url = f.faqCategory ? `/faq#${f.faqCategory}` : '/faq';
    items.push({ type: 'faq', title: f.question.trim(), url });
  }

  return items;
}
