/**
 * Related-products matcher (P2-AI-001). Given a category and/or keyword list,
 * returns a ranked, deduped set of products to embed in AI-generated content
 * (blog product strips, video related products, landing pages).
 *
 * Match order (per docs/phase-2-ai-engine.md): CATEGORY FIRST — start from the
 * baked category's curated SKU list and rank it by keyword-token overlap — then
 * fall back to (or top up from) the full catalog scored the same way. Custom
 * (non-Geiger) products are merged in when their read is available. Manual
 * add/remove always happens on top of these suggestions in Studio.
 *
 * SERVER-ONLY: reads products.json / data/categories from disk via
 * lib/categories. Never import from Studio bundle code — the fully assembled
 * result travels to the Studio action through the generate API route.
 *
 * Relative imports (not `@/`) so the offline verifier script can exercise this
 * module under tsx exactly as Next consumes it.
 */

import { getAllProducts, getProductsForCategorySlug } from '../categories';
import type { GeigerProduct } from '../product-types';

export interface MatchRelatedProductsOptions {
  /** URL-style category slug (path after /cat/), e.g. 'water-bottles'. */
  categorySlug?: string;
  keywords: string[];
  limit: number;
  /** Merge Sanity customProduct docs into the ranking (default true). */
  includeCustom?: boolean;
}

/** Lowercase alphanumeric tokens, length ≥ 3 (drops "a", "of", "12"-noise less aggressively than stopwords). */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function keywordTokenSet(keywords: string[]): Set<string> {
  const set = new Set<string>();
  for (const kw of keywords) for (const t of tokenize(kw)) set.add(t);
  return set;
}

/**
 * Score = shared-token count between the keyword set and the product's
 * name + brand (the same token-overlap idea as the Python pipeline's
 * `apply_sku_filter` slug scoring). Naive plural handling: "bottles" matches
 * "bottle" and vice versa.
 */
function scoreProduct(product: GeigerProduct, tokens: Set<string>): number {
  const productTokens = new Set(tokenize(`${product.name} ${product.brand ?? ''}`));
  let score = 0;
  for (const t of tokens) {
    if (productTokens.has(t)) {
      score += 1;
      continue;
    }
    // singular/plural cross-match
    if (t.endsWith('s') && productTokens.has(t.slice(0, -1))) score += 1;
    else if (productTokens.has(`${t}s`)) score += 1;
  }
  return score;
}

/** Stable, deterministic ordering: score desc → shorter name → sku asc. */
function rank(products: GeigerProduct[], tokens: Set<string>): GeigerProduct[] {
  return products
    .map((p) => ({ p, score: scoreProduct(p, tokens) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.p.name.length !== b.p.name.length) return a.p.name.length - b.p.name.length;
      return a.p.sku < b.p.sku ? -1 : a.p.sku > b.p.sku ? 1 : 0;
    })
    .map((e) => e.p);
}

export async function matchRelatedProducts(
  opts: MatchRelatedProductsOptions,
): Promise<GeigerProduct[]> {
  const limit = Math.max(0, opts.limit);
  if (limit === 0) return [];
  const tokens = keywordTokenSet(opts.keywords);

  const picked: GeigerProduct[] = [];
  const seen = new Set<string>();
  const push = (p: GeigerProduct) => {
    if (picked.length >= limit || seen.has(p.sku)) return;
    seen.add(p.sku);
    picked.push(p);
  };

  // 1) Category first: rank the baked category's curated SKUs by keyword overlap.
  if (opts.categorySlug) {
    const fileSlug = opts.categorySlug.split('/').join('__');
    const categoryProducts = getProductsForCategorySlug(fileSlug);
    for (const p of rank(categoryProducts, tokens)) push(p);
  }

  // 2) Custom (non-Geiger) products, scored the same way. Loaded lazily and
  //    guarded: the Sanity read lives behind `server-only` and needs network,
  //    so a failure (offline verifier, Sanity down) degrades to Geiger-only
  //    instead of breaking generation.
  if (opts.includeCustom !== false) {
    try {
      const { getAllCustomProducts, customProductToGeigerProduct } = await import(
        '../sanity/queries/custom-products'
      );
      const custom = (await getAllCustomProducts()).map(customProductToGeigerProduct);
      for (const p of rank(custom, tokens)) {
        if (scoreProduct(p, tokens) > 0) push(p);
      }
    } catch {
      // Geiger-only fallback — suggestions stay useful without custom products.
    }
  }

  // 3) Top up from the full catalog (also the no-category path). Only products
  //    that actually overlap the keywords — never pad with random SKUs.
  if (picked.length < limit) {
    for (const p of rank(getAllProducts(), tokens)) {
      if (picked.length >= limit) break;
      if (scoreProduct(p, tokens) === 0) break; // ranked: first zero means the rest are zero
      push(p);
    }
  }

  return picked;
}
