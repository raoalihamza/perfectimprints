import fs from 'node:fs';
import path from 'node:path';

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
}

export interface ProductBadge {
  tag: string;
  value: string;
}

export interface GeigerProduct {
  sku: string;
  name: string;
  brand: string | null;
  low_price: number | null;
  high_price: number | null;
  msrp: number | null;
  min_qty: number | null;
  imageUrl: string | null;
  description: string | null;
  category_paths: string[];
  badges: ProductBadge[];
  is_new_item: boolean;
  is_on_sale: boolean;
  product_type_unigram: string | null;
  geiger_url: string | null;
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
    map.set(p.sku, p);
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
    const data = JSON.parse(raw) as GeneratedCategoryContent;
    if (data.type === 'root') {
      slugs.push(file.replace(/\.json$/, ''));
    }
  }
  return slugs.sort();
}

export function getProductsForCategorySlug(slug: string): GeigerProduct[] {
  const content = getCategoryContent(slug);
  if (!content) return [];
  const index = loadProductsIndex();
  const out: GeigerProduct[] = [];
  for (const sku of content.productSkus) {
    const product = index.get(sku);
    if (product) out.push(product);
  }
  return out;
}
