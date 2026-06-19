/**
 * Build-time site-search index (M5-502).
 *
 *   pnpm build:search-index
 *
 * Writes `public/search-index.json` as `{ generatedAt, items: [...] }` covering:
 *   - every generated category page (title = H1/metaTitle, url = internal route)
 *   - every Geiger product (name + brand + raw geiger_url ONLY)
 *   - every brand (name, /brands/<slug>)
 *   - every published blog post (title, /blog/<slug>)
 *   - FAQs are DEFERRED until a real /faqs destination exists (M5-506) — see note.
 *
 * Runs as a `prebuild` step before `next build` (see package.json). On Vercel the
 * Sanity env vars come from the project settings; locally they come from
 * `.env.local`. The blog fetch is best-effort: if Sanity is unreachable the index
 * still builds (without blogs) rather than failing the whole build.
 *
 * Size discipline: prints raw + gzipped bytes. If gzipped exceeds the budget the
 * script warns loudly so we can shard by type (see README) rather than ship a
 * bloated single file.
 */

// MUST be first: populates process.env from .env.local before the Sanity client
// module (pulled in transitively below) reads its env vars at evaluation time.
import './load-env';

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import {
  getAllGeneratedCategorySlugs,
  getCategoryContent,
  getAllProducts,
} from '../../lib/categories';
import { getAllBlogSearchEntries } from '../../lib/sanity/queries/blogs';
import type { SearchItem, SearchIndexFile } from '../../lib/search/types';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'public', 'search-index.json');
const BRANDS_JSON = path.join(PROJECT_ROOT, 'data', 'geiger', 'brands.json');

/** Warn (don't fail) once the gzipped index crosses this. See README / CLAUDE.md. */
const GZIP_WARN_BYTES = 2 * 1024 * 1024;

function collectCategories(): SearchItem[] {
  const items: SearchItem[] = [];
  for (const summary of getAllGeneratedCategorySlugs()) {
    const content = getCategoryContent(summary.fileSlug);
    if (!content?.url) continue;
    const title = (content.h1 || content.metaTitle || summary.urlSlug).trim();
    if (!title) continue;
    items.push({ type: 'category', title, url: content.url });
  }
  return items;
}

function collectProducts(): SearchItem[] {
  const items: SearchItem[] = [];
  for (const product of getAllProducts()) {
    const title = product.name?.trim();
    // Skip nameless rows and the (zero today) products with no Geiger link —
    // a result that can't link anywhere is useless.
    if (!title || !product.geiger_url) continue;
    const item: SearchItem = { type: 'product', title, url: product.geiger_url };
    if (product.brand) item.brand = product.brand.trim();
    // Thumbnail for the autocomplete overlay (already entity-decoded by getAllProducts).
    if (product.imageUrl) item.image = product.imageUrl;
    items.push(item);
  }
  return items;
}

interface BrandJsonEntry {
  name: string;
  slug: string;
}
interface BrandsJsonFile {
  brands: BrandJsonEntry[];
}

/**
 * Read brands.json directly rather than `getAllBrands()` — that loader is marked
 * `import 'server-only'`, which throws outside an RSC bundle. brands.json holds
 * the full ~205 catalog brands (name + slug), which is all the index needs.
 */
function collectBrands(): SearchItem[] {
  if (!fs.existsSync(BRANDS_JSON)) return [];
  const parsed = JSON.parse(fs.readFileSync(BRANDS_JSON, 'utf8')) as BrandsJsonFile;
  const items: SearchItem[] = [];
  for (const brand of parsed.brands ?? []) {
    const title = brand.name?.trim();
    if (!title || !brand.slug) continue;
    items.push({ type: 'brand', title, url: `/brands/${brand.slug}` });
  }
  return items;
}

async function collectBlogs(): Promise<SearchItem[]> {
  try {
    const entries = await getAllBlogSearchEntries();
    return entries.map((e) => ({
      type: 'blog' as const,
      title: e.title.trim(),
      url: `/blog/${e.slug}`,
    }));
  } catch (err) {
    console.warn(
      `  ! Blog fetch from Sanity failed — index built WITHOUT blogs. ${(err as Error).message}`,
    );
    return [];
  }
}

// FAQs are intentionally NOT indexed yet: the /faqs library page (M5-506) does
// not exist, so there is no real destination. Emitting them now would 404. Wire
// them in here once /faqs (or per-FAQ anchors) lands. See CLAUDE.md M5-502.
function collectFaqs(): SearchItem[] {
  return [];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main(): Promise<void> {
  console.log('Building search index…');

  const categories = collectCategories();
  console.log(`  • categories: ${categories.length}`);
  const products = collectProducts();
  console.log(`  • products:   ${products.length}`);
  const brands = collectBrands();
  console.log(`  • brands:     ${brands.length}`);
  const blogs = await collectBlogs();
  console.log(`  • blogs:      ${blogs.length}`);
  const faqs = collectFaqs();
  if (faqs.length) console.log(`  • faqs:       ${faqs.length}`);

  const items: SearchItem[] = [...categories, ...products, ...brands, ...blogs, ...faqs];

  const payload: SearchIndexFile = {
    generatedAt: new Date().toISOString(),
    items,
  };

  const json = JSON.stringify(payload);
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, json, 'utf8');

  const rawBytes = Buffer.byteLength(json, 'utf8');
  const gzipBytes = zlib.gzipSync(json).length;

  console.log(`\nWrote ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`);
  console.log(`  total items: ${items.length}`);
  console.log(`  raw size:    ${formatBytes(rawBytes)} (${rawBytes} bytes)`);
  console.log(`  gzipped:     ${formatBytes(gzipBytes)} (${gzipBytes} bytes)`);

  if (gzipBytes > GZIP_WARN_BYTES) {
    console.warn(
      `\n  ! Gzipped index exceeds ${formatBytes(GZIP_WARN_BYTES)} — consider sharding by type (see scripts/search-index/README.md).`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
