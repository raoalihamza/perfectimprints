import fs from 'node:fs';
import path from 'node:path';
import { decodeHtmlEntities } from './text-utils';

export { PRODUCTS_PER_PAGE, type GeigerProduct, type ProductBadge } from './product-types';
import { PRODUCTS_PER_PAGE, type GeigerProduct } from './product-types';

const ROOT = process.cwd();
const CATEGORIES_DIR = path.join(ROOT, 'data', 'categories');
const PRODUCTS_FILE = path.join(ROOT, 'data', 'geiger', 'products.json');

export interface CategoryFaq {
  q: string;
  a: string;
}

export type CategoryType = 'root' | 'modifier' | 'facet' | 'compound-facet';

export interface GeneratedCategoryContent {
  url: string;
  type: CategoryType;
  h1: string;
  metaTitle: string;
  metaDescription: string;
  introHtml: string;
  buyingGuideHtml?: string | null;
  buyingGuideH2?: string | null;
  faqs: CategoryFaq[];
  heroAltText: string;
  productSkus: string[];
  generatedAt?: string;
  model?: string;
  promptVersion?: string;
  openingStyle?: string;
  skuFilterMode?: string;
  rawSkuCount?: number;
  filteredSkuCount?: number;
  /**
   * Optional manual override. When `true`, the category page renders the
   * EmptyStateCTA instead of the product grid regardless of SKU count.
   * Edited by hand in the category JSON; never written by the AI pipeline.
   */
  forceCTA?: boolean;
}

/**
 * Returns true when a category page should render the EmptyStateCTA lead-form
 * block in place of the product grid. Rules:
 *   1. No SKUs at all (Tier 3/4 fallback pages).
 *   2. SKU filter fell back to `full-capped-60` — slug-token filter rejected
 *      most candidates, so the remaining grid is likely off-topic
 *      (the Bistro Mugs / Ash Trays / Belt Buckles case Patrick flagged).
 *   3. `forceCTA: true` manual override in the JSON.
 */
export function shouldShowEmptyStateCTA(content: GeneratedCategoryContent): boolean {
  if (content.forceCTA === true) return true;
  if (!content.productSkus || content.productSkus.length === 0) return true;
  if (content.skuFilterMode === 'full-capped-60') return true;
  return false;
}

interface ProductsFile {
  scrapedAt: string;
  totalProducts: number;
  products: GeigerProduct[];
}

let _productsBySku: Map<string, GeigerProduct> | null = null;

function loadProductsIndex(): Map<string, GeigerProduct> {
  if (_productsBySku) return _productsBySku;
  const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as ProductsFile;
  const map = new Map<string, GeigerProduct>();
  for (const p of parsed.products) {
    // Geiger image URLs in products.json carry literal `&amp;` entities (e.g.
    // `?format=webp&amp;w=275`). Decode once here at the data-loading layer so
    // EVERY consumer — product grid, og:image, twitter:image, ItemList image —
    // gets a clean `&` URL. (HTML entity decoding lives only in this file.)
    map.set(p.sku, p.imageUrl ? { ...p, imageUrl: decodeHtmlEntities(p.imageUrl) } : p);
  }
  _productsBySku = map;
  return map;
}

export function getCategoryContent(slug: string): GeneratedCategoryContent | null {
  const filePath = path.join(CATEGORIES_DIR, `${slug}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as GeneratedCategoryContent;
}

export function getAllGeneratedRootSlugs(): string[] {
  if (!fs.existsSync(CATEGORIES_DIR)) return [];
  const files = fs.readdirSync(CATEGORIES_DIR).filter((f) => f.endsWith('.json'));
  const slugs: string[] = [];
  for (const file of files) {
    if (file.includes('__')) continue;
    const raw = fs.readFileSync(path.join(CATEGORIES_DIR, file), 'utf8');
    if (!raw.trim()) continue;
    const data = JSON.parse(raw) as GeneratedCategoryContent;
    if (data.type === 'root') {
      slugs.push(file.replace(/\.json$/, ''));
    }
  }
  return slugs.sort();
}

export interface CategorySlugSummary {
  /** URL-style slug segments (joined with '/'), e.g. 'water-bottles/color/black'. */
  urlSlug: string;
  /** Filename slug (joined with '__'), used as the JSON filename without extension. */
  fileSlug: string;
  type: CategoryType;
  totalProducts: number;
  totalPages: number;
  /**
   * First few SKUs of the category grid — lets app/sitemap.ts resolve one
   * representative image per category URL (Google image sitemap entries,
   * M-SEO5) without a second read of the baked JSON. Empty for CTA-only
   * categories (per the baked-JSON shouldShowEmptyStateCTA rule): a page that
   * renders no grid claims no image.
   */
  imageSkus: string[];
}

/**
 * Returns one entry per generated category JSON file. Used by `generateStaticParams`
 * to enumerate both base URLs and paginated variants (`/page/N`).
 */
export function getAllGeneratedCategorySlugs(): CategorySlugSummary[] {
  if (!fs.existsSync(CATEGORIES_DIR)) return [];
  const files = fs.readdirSync(CATEGORIES_DIR).filter((f) => f.endsWith('.json'));
  const out: CategorySlugSummary[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(CATEGORIES_DIR, file), 'utf8');
    if (!raw.trim()) continue;
    let data: GeneratedCategoryContent;
    try {
      data = JSON.parse(raw) as GeneratedCategoryContent;
    } catch {
      continue;
    }
    if (!data.url) continue;
    const fileSlug = file.replace(/\.json$/, '');
    const urlSlug = fileSlug.split('__').join('/');
    const totalProducts = data.productSkus?.length ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE));
    const imageSkus = shouldShowEmptyStateCTA(data) ? [] : (data.productSkus ?? []).slice(0, 12);
    out.push({ urlSlug, fileSlug, type: data.type, totalProducts, totalPages, imageSkus });
  }
  return out;
}

export function getProductsForCategorySlug(slug: string): GeigerProduct[] {
  const content = getCategoryContent(slug);
  if (!content) return [];
  return resolveProducts(content.productSkus);
}

/**
 * Returns every product in the catalog (deduped by SKU), with names/descriptions
 * HTML-decoded at the loader level per the project convention. Used by the
 * build-time search-index builder (M5-502); not for runtime page rendering.
 */
export function getAllProducts(): GeigerProduct[] {
  const index = loadProductsIndex();
  const out: GeigerProduct[] = [];
  for (const product of index.values()) {
    out.push({
      ...product,
      name: decodeHtmlEntities(product.name),
      description: product.description
        ? decodeHtmlEntities(product.description)
        : product.description,
      imageUrl: product.imageUrl ? decodeHtmlEntities(product.imageUrl) : product.imageUrl,
    });
  }
  return out;
}

export interface CategoryProductsPage {
  products: GeigerProduct[];
  totalProducts: number;
  totalPages: number;
  page: number;
  perPage: number;
}

/**
 * Returns a single page of products (sliced by perPage). Page numbers are 1-indexed.
 */
export function getProductsPageForCategorySlug(
  slug: string,
  page: number,
  perPage: number = PRODUCTS_PER_PAGE
): CategoryProductsPage {
  const content = getCategoryContent(slug);
  const allSkus = content?.productSkus ?? [];
  const totalProducts = allSkus.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / perPage));
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const products = resolveProducts(allSkus.slice(start, end));
  return { products, totalProducts, totalPages, page, perPage };
}

/** Resolve products from an arbitrary SKU list (used after filter+sort). */
export function resolveProductsBySku(skus: string[]): GeigerProduct[] {
  return resolveProducts(skus);
}

/** Slice an already-filtered product list into a page. */
export function paginateProducts(
  products: GeigerProduct[],
  page: number,
  perPage: number = PRODUCTS_PER_PAGE
): CategoryProductsPage {
  const totalProducts = products.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / perPage));
  const start = (page - 1) * perPage;
  const end = start + perPage;
  return {
    products: products.slice(start, end),
    totalProducts,
    totalPages,
    page,
    perPage,
  };
}

function resolveProducts(skus: string[]): GeigerProduct[] {
  const index = loadProductsIndex();
  const out: GeigerProduct[] = [];
  for (const sku of skus) {
    const product = index.get(sku);
    if (product) {
      out.push({
        ...product,
        name: decodeHtmlEntities(product.name),
        description: product.description ? decodeHtmlEntities(product.description) : product.description,
      });
    }
  }
  return out;
}
