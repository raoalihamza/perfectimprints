/**
 * Related-products matcher (P2-AI-001, tightened in P2-AI-002b). Given a
 * category and/or keyword list, returns a ranked, deduped set of products to
 * embed in AI-generated content (blog product strips, video related products,
 * landing pages).
 *
 * Match order (per docs/phase-2-ai-engine.md): CATEGORY FIRST — start from the
 * baked category's curated SKU list and rank it by keyword-token overlap — then
 * fall back to (or top up from) the full catalog scored the same way. Custom
 * (non-Geiger) products are merged in when their read is available. Manual
 * add/remove always happens on top of these suggestions in Studio.
 *
 * Relevance rules (P2-AI-002b, from Patrick's first real generation where a
 * visor/tee/shoe-caddy strip repeated under power-bank, water-bottle, AND
 * tote-bag ideas):
 *   - Generic promotional words (custom, branded, logo, …) are STRIPPED from
 *     both sides before scoring — they match everything, so they prove nothing.
 *   - `minScore` (default 1): a product must share at least that many
 *     significant tokens with the keywords to be eligible AT ALL — from the
 *     category source, the custom products, or the catalog top-up. Fewer
 *     relevant products (or none) beats a strip padded with bestsellers.
 *   - `exclude`: SKUs already used elsewhere (e.g. earlier strips in the same
 *     post) are never returned again — cross-strip dedup.
 *   - `resolveCategoryForKeywords()` maps a concrete product phrase ("power
 *     banks") to its best root category so each list-post idea pulls from its
 *     OWN product type instead of one shared category.
 *
 * SERVER-ONLY: reads products.json / data/categories from disk via
 * lib/categories. Never import from Studio bundle code — the fully assembled
 * result travels to the Studio action through the generate API route.
 *
 * Relative imports (not `@/`) so the offline verifier script can exercise this
 * module under tsx exactly as Next consumes it.
 */

import { getAllGeneratedRootSlugs, getAllProducts, getProductsForCategorySlug } from '../categories';
import type { GeigerProduct } from '../product-types';
import { GENERIC_PROMO_WORDS } from './brand-voice';
import { buildSkuSet, isHiddenSku } from '../products/hidden-skus';

export interface MatchRelatedProductsOptions {
  /** URL-style category slug (path after /cat/), e.g. 'water-bottles'. */
  categorySlug?: string;
  keywords: string[];
  limit: number;
  /** Merge Sanity customProduct docs into the ranking (default true). */
  includeCustom?: boolean;
  /**
   * Minimum shared significant tokens for a product to be eligible (default 1).
   * Products below the floor are dropped, never padded back in.
   */
  minScore?: number;
  /** SKUs to never return (already used elsewhere in the same post). */
  exclude?: Set<string>;
  /**
   * Also surface Sanity `productPage` docs (P2-CP-001), returned with
   * `detailUrl` set so their cards link to /products/<slug>. OPT-IN (default
   * false): the AI generation routes persist strips as SKU-only blogProduct
   * entries resolved against products.json at render time, where a
   * productPage's synthetic `custom-<id>` SKU would silently resolve to
   * nothing. Only consumers that render the returned GeigerProduct objects
   * directly (the /products/<slug> related carousel) should enable this.
   * Reads are cache-tagged (PRODUCT_PAGES_TAG), so enabling it inside a
   * static render path is safe.
   */
  includeProductPages?: boolean;
  /**
   * Site-wide hidden SKUs (HIDE-100), i.e. `globalSettings.hiddenProducts.skus`.
   * Applied to EVERY source below, so a hidden Geiger product can never be
   * suggested by any generated strip or carousel. Callers on a render path pass
   * `settings.hiddenEverywhereSkus`; the AI generate routes pass it too, so a
   * hidden product is never persisted into a new strip in the first place.
   */
  hiddenSkus?: string[];
  /**
   * Normalized Geiger SKU to the product-page card that REPLACES it (HIDE-110).
   * Passed through to the category source so a replaced Geiger product leaves
   * the strip carrying Patrick's own card rather than a gap. Only render-path
   * callers pass it; the AI generate routes deliberately do not, because a
   * generated strip is PERSISTED as SKU entries and a synthetic `custom-<id>`
   * id would not resolve when that strip is later rendered.
   */
  replacementBySku?: ReadonlyMap<string, GeigerProduct>;
}

/**
 * Words with no matching signal: generic promo modifiers (see brand-voice.ts)
 * plus common filler that survives the length-3 token filter.
 */
const NON_SIGNIFICANT = new Set<string>([
  ...GENERIC_PROMO_WORDS,
  'the',
  'and',
  'for',
  'with',
  'your',
  'our',
  'from',
  'that',
  'this',
  'are',
  'can',
  'will',
  'how',
  'why',
  'what',
  'best',
  'top',
  'ideas',
  'idea',
]);

/** Lowercase alphanumeric tokens, length ≥ 3. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/** Tokens that actually carry relevance signal (generic promo words stripped). */
function significantTokens(text: string): string[] {
  return tokenize(text).filter((t) => !NON_SIGNIFICANT.has(t));
}

function keywordTokenSet(keywords: string[]): Set<string> {
  const set = new Set<string>();
  for (const kw of keywords) for (const t of significantTokens(kw)) set.add(t);
  return set;
}

/**
 * Score = shared significant-token count between the keyword set and the
 * product's name + brand (the same token-overlap idea as the Python pipeline's
 * `apply_sku_filter` slug scoring). Naive plural handling: "bottles" matches
 * "bottle" and vice versa. Generic promo words are stripped from both sides.
 */
function scoreProduct(product: GeigerProduct, tokens: Set<string>): number {
  const productTokens = new Set(significantTokens(`${product.name} ${product.brand ?? ''}`));
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

/**
 * Stable, deterministic ranking of the products clearing `minScore`:
 * score desc → shorter name → sku asc.
 */
function rankEligible(
  products: GeigerProduct[],
  tokens: Set<string>,
  minScore: number,
): GeigerProduct[] {
  return products
    .map((p) => ({ p, score: scoreProduct(p, tokens) }))
    .filter((e) => e.score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.p.name.length !== b.p.name.length) return a.p.name.length - b.p.name.length;
      return a.p.sku < b.p.sku ? -1 : a.p.sku > b.p.sku ? 1 : 0;
    })
    .map((e) => e.p);
}

/**
 * Resolve a concrete product phrase (e.g. "power banks", "stainless steel
 * water bottles") to the best-matching generated ROOT category slug, or null
 * when nothing overlaps. Generic promo words are stripped first, so
 * "custom power banks" and "power banks" resolve identically
 * (→ power-banks-chargers). Deterministic: score desc → shorter slug → asc.
 */
export function resolveCategoryForKeywords(phrase: string): string | null {
  const tokens = keywordTokenSet([phrase]);
  if (tokens.size === 0) return null;
  let best: { slug: string; score: number } | null = null;
  for (const slug of getAllGeneratedRootSlugs()) {
    const slugTokens = new Set(significantTokens(slug.split('-').join(' ')));
    let score = 0;
    for (const t of tokens) {
      if (
        slugTokens.has(t) ||
        (t.endsWith('s') && slugTokens.has(t.slice(0, -1))) ||
        slugTokens.has(`${t}s`)
      ) {
        score += 1;
      }
    }
    if (score <= 0) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        (slug.length < best.slug.length || (slug.length === best.slug.length && slug < best.slug)))
    ) {
      best = { slug, score };
    }
  }
  return best?.slug ?? null;
}

export async function matchRelatedProducts(
  opts: MatchRelatedProductsOptions,
): Promise<GeigerProduct[]> {
  const limit = Math.max(0, opts.limit);
  if (limit === 0) return [];
  const minScore = opts.minScore ?? 1;
  const tokens = keywordTokenSet(opts.keywords);

  const picked: GeigerProduct[] = [];
  const seen = new Set<string>(opts.exclude ?? []);
  // One gate for every source (category, custom products, productPages, catalog
  // top-up), so a site-wide hidden SKU cannot slip in through whichever branch
  // happens to reach it first.
  const hidden = buildSkuSet(opts.hiddenSkus);
  const push = (p: GeigerProduct) => {
    if (picked.length >= limit || seen.has(p.sku)) return;
    if (isHiddenSku(p.sku, hidden)) return;
    seen.add(p.sku);
    picked.push(p);
  };

  // 1) Category first: the baked category's curated SKUs, ranked by keyword
  //    overlap. The relevance floor applies here too — a category page can
  //    carry off-topic SKUs (that is exactly the full-capped-60 failure mode),
  //    so category membership alone is not proof of relevance.
  if (opts.categorySlug) {
    // HIDE-000: this used to read the BAKED category JSON off disk, so a strip
    // drawn from one of Patrick's curated categories ignored his curation of it
    // and re-suggested products he had hidden there. Resolve the category the
    // same way the category page does instead. All reads are tag-cached, so a
    // static caller such as /products/<slug> stays static. A failure (offline
    // verifier, Sanity down) degrades to the baked list rather than to nothing,
    // which is the pre-existing behaviour.
    let categoryProducts: GeigerProduct[];
    try {
      const { getEffectiveCategoryProducts } = await import(
        '../sanity/queries/effective-category-products'
      );
      categoryProducts = await getEffectiveCategoryProducts(
        opts.categorySlug,
        opts.hiddenSkus,
        {
          // Removal only: the curation fix must not ALSO start pulling custom
          // products in through this branch. Callers that want them say so via
          // `includeCustom`, which has its own source below. A HIDE-110
          // substitution is exempt, because it stands in for a Geiger product
          // the caller already had rather than adding a new one.
          geigerOnly: opts.includeCustom === false,
        },
        opts.replacementBySku,
      );
    } catch {
      categoryProducts = getProductsForCategorySlug(opts.categorySlug.split('/').join('__'));
    }
    for (const p of rankEligible(categoryProducts, tokens, minScore)) push(p);
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
      for (const p of rankEligible(custom, tokens, minScore)) push(p);
    } catch {
      // Geiger-only fallback — suggestions stay useful without custom products.
    }
  }

  // 2b) Sanity productPage docs (opt-in — see the option docstring), scored the
  //     same way and carrying detailUrl so their cards link internally. Guarded
  //     like the custom-products read: a failure degrades to Geiger-only.
  if (opts.includeProductPages === true) {
    try {
      const { getAllProductPageCards, productPageToGeigerProduct } = await import(
        '../sanity/queries/product-pages'
      );
      const pages = (await getAllProductPageCards()).map(productPageToGeigerProduct);
      for (const p of rankEligible(pages, tokens, minScore)) push(p);
    } catch {
      // Geiger-only fallback.
    }
  }

  // 3) Top up from the full catalog (also the no-category path). ONLY products
  //    clearing the relevance floor — never pad a short strip with
  //    sub-threshold catalog bestsellers; fewer (or zero) beats wrong ones.
  if (picked.length < limit) {
    for (const p of rankEligible(getAllProducts(), tokens, minScore)) {
      if (picked.length >= limit) break;
      push(p);
    }
  }

  return picked;
}
