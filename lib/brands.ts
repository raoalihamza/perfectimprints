import 'server-only';

import { cache } from 'react';
import fs from 'node:fs';
import path from 'node:path';

import { cachedClient, urlForImage } from './sanity/client';
import { BRANDS_TAG } from './sanity/cache-tags';
import type { SanityImage } from './sanity/types';
import { decodeHtmlEntities } from './text-utils';
import type { GeigerProduct } from './categories';

// Tagged, non-CDN fetch options for every brand read. Reading off api.sanity.io
// (not the CDN) means a publish-triggered revalidation always sees fresh data;
// the tag lets the webhook bust /brands + /brands/<slug> in seconds when a brand
// is published/deleted (e.g. a `featured` toggle). The page stays static/ISR
// (tagged, not no-store).
const BRANDS_FETCH_OPTS = { next: { tags: [BRANDS_TAG], revalidate: false as const } };

const ROOT = process.cwd();
const BRANDS_JSON_PATH = path.join(ROOT, 'data', 'geiger', 'brands.json');
const PRODUCTS_FILE = path.join(ROOT, 'data', 'geiger', 'products.json');

export interface Brand {
  name: string;
  slug: string;
  /** First letter of the brand name, uppercased. Used for A-Z grouping on /brands. */
  letter: string;
  /** Resolved logo URL — Sanity asset URL or `/brand-logos/<slug>.<ext>` static. */
  logoUrl: string | null;
  logoAlt: string;
  /** Source Geiger URL (always linked via `lib/affiliate-url.ts` rewriter). */
  geigerUrl: string | null;
  description: string | null;
  productCount: number;
  featured: boolean;
  source: 'sanity' | 'json';
}

interface BrandJsonEntry {
  name: string;
  slug: string;
  letter: string;
  geigerUrl: string;
  logoPath: string | null;
  logoUrl: string | null;
  logoAlt?: string;
  productCount: number;
  description: string | null;
}

interface BrandsJsonFile {
  brands: BrandJsonEntry[];
}

interface SanityBrandDoc {
  _id: string;
  name: string;
  slug: string | null;
  description: string | null;
  geigerUrl: string | null;
  productCount: number | null;
  featured: boolean | null;
  logo?: SanityImage;
}

function loadJsonBrands(): Brand[] {
  if (!fs.existsSync(BRANDS_JSON_PATH)) return [];
  const raw = fs.readFileSync(BRANDS_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw) as BrandsJsonFile;
  return parsed.brands.map<Brand>((b) => ({
    name: b.name,
    slug: b.slug,
    letter: (b.letter || b.name[0] || '#').toUpperCase(),
    logoUrl: b.logoUrl || null,
    logoAlt: b.logoAlt || b.name,
    geigerUrl: b.geigerUrl || null,
    description: b.description || null,
    productCount: b.productCount || 0,
    featured: false,
    source: 'json',
  }));
}

function normalizeSanity(doc: SanityBrandDoc): Brand {
  const slug = doc.slug ?? '';
  let logoUrl: string | null = null;
  if (doc.logo?.asset?._ref) {
    try {
      logoUrl = urlForImage(doc.logo).width(400).fit('max').url();
    } catch {
      logoUrl = null;
    }
  }
  const name = doc.name ?? slug;
  return {
    name,
    slug,
    letter: (name[0] || '#').toUpperCase(),
    logoUrl,
    logoAlt: doc.logo?.alt ?? name,
    geigerUrl: doc.geigerUrl ?? null,
    description: doc.description ?? null,
    productCount: doc.productCount ?? 0,
    featured: doc.featured === true,
    source: 'sanity',
  };
}

async function fetchSanityBrands(): Promise<Brand[]> {
  try {
    const docs = await cachedClient.fetch<SanityBrandDoc[]>(
      `*[_type == "brand"]{
        _id, name, "slug": slug.current,
        description, geigerUrl, productCount, featured, logo
      }`,
      {},
      BRANDS_FETCH_OPTS,
    );
    return docs.map(normalizeSanity).filter((b) => b.slug.length > 0);
  } catch {
    return [];
  }
}

/**
 * Sanity-first, brands.json fallback. Sanity wins per slug when both exist
 * (Patrick can override description/logo/featured in Studio).
 *
 * Wrapped in React `cache()` for per-request dedup ONLY — no cross-request
 * module memo, so a webhook `revalidateTag(BRANDS_TAG)` actually re-runs the
 * tagged fetch and the `featured` toggle goes live deterministically.
 */
export const getAllBrands = cache(async (): Promise<Brand[]> => {
  const jsonBrands = loadJsonBrands();
  const sanityBrands = await fetchSanityBrands();

  // Merge: Sanity overrides JSON entry of the same slug; JSON entries not in
  // Sanity stay (for the rare brand someone deleted in Studio but still has
  // products in our catalog).
  const bySlug = new Map<string, Brand>();
  for (const b of jsonBrands) bySlug.set(b.slug, b);
  for (const b of sanityBrands) {
    const existing = bySlug.get(b.slug);
    bySlug.set(b.slug, {
      ...existing,
      ...b,
      // Sanity productCount is sometimes stale (set at migration time);
      // prefer the live JSON count when both exist.
      productCount: existing?.productCount ?? b.productCount,
      logoUrl: b.logoUrl || existing?.logoUrl || null,
    });
  }

  return Array.from(bySlug.values()).sort((a, b) => {
    if (a.letter !== b.letter) return a.letter.localeCompare(b.letter);
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
});

export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  const all = await getAllBrands();
  return all.find((b) => b.slug === slug) ?? null;
}

/**
 * Featured brands (Patrick's `featured` toggle in Studio), ordered by name —
 * rendered as the highlighted strip at the top of /brands. Returns [] when none
 * are featured so the strip can render nothing.
 */
export async function getFeaturedBrands(): Promise<Brand[]> {
  const all = await getAllBrands();
  return all
    .filter((b) => b.featured)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function getAllBrandSlugs(): Promise<string[]> {
  const all = await getAllBrands();
  return all.map((b) => b.slug);
}

export interface BrandsByLetter {
  letter: string;
  brands: Brand[];
}

export async function getBrandsGroupedByLetter(): Promise<BrandsByLetter[]> {
  const all = await getAllBrands();
  const groups = new Map<string, Brand[]>();
  for (const b of all) {
    const letter = b.letter || '#';
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(b);
  }
  return Array.from(groups.entries())
    .map(([letter, brands]) => ({ letter, brands }))
    .sort((a, b) => a.letter.localeCompare(b.letter));
}

// ------- Per-brand product lookup -------

interface ProductsFile {
  scrapedAt: string;
  totalProducts: number;
  products: GeigerProduct[];
}

let _productsByBrandSlug: Map<string, GeigerProduct[]> | null = null;

function slugifyBrandName(raw: string): string {
  if (!raw) return '';
  const decoded = decodeHtmlEntities(raw);
  // NFKD strip diacritics + drop punctuation + collapse to hyphens
  const normalized = decoded.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const lowered = normalized.toLowerCase();
  const cleaned = lowered.replace(/[&'"’]/g, '');
  return cleaned.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function loadProductsByBrandSlug(): Map<string, GeigerProduct[]> {
  if (_productsByBrandSlug) return _productsByBrandSlug;
  const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as ProductsFile;
  const out = new Map<string, GeigerProduct[]>();
  for (const p of parsed.products) {
    if (!p.brand) continue;
    const slug = slugifyBrandName(p.brand);
    if (!slug) continue;
    const list = out.get(slug) ?? [];
    list.push({
      ...p,
      name: decodeHtmlEntities(p.name),
      description: p.description ? decodeHtmlEntities(p.description) : p.description,
      // Geiger image URLs carry literal `&amp;` entities — decode for clean URLs.
      imageUrl: p.imageUrl ? decodeHtmlEntities(p.imageUrl) : p.imageUrl,
    });
    out.set(slug, list);
  }
  _productsByBrandSlug = out;
  return out;
}

export function getProductsForBrandSlug(slug: string): GeigerProduct[] {
  return loadProductsByBrandSlug().get(slug) ?? [];
}

/**
 * Generic fallback paragraph used when a brand has no Sanity description.
 * Keep the wording in sync with the spec in CLAUDE.md M4-405.
 */
export function buildBrandIntroFallback(brandName: string): string {
  return `Discover the full range of custom ${brandName} products at Perfect Imprints. From corporate gifts to event giveaways, ${brandName} delivers quality and reliability.`;
}
