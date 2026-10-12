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
 * FIX-911 (from FIX-910's measurement: 51 of 107 generated strips drifted):
 *   - The resolver reads PRODUCT NAMES as well as slugs. Its rules live in
 *     lib/ai/category-resolver.ts; the names it reads, Patrick's curation
 *     included, are loaded by lib/ai/category-evidence.ts.
 *   - "can" counts as a word here (lib/ai/match-tokens.ts): it is a product
 *     noun in 111 names, and stripping it scored "can coolers" as "coolers".
 *   - `scanMustCarry`: a product scanned from a whole collection (custom
 *     products, product pages, the catalogue) must carry the idea's product
 *     noun. Two shared modifiers are not the product.
 *   Two roads were measured and are closed. Product names as a GATE (a root
 *   must hold products naming the whole phrase): 28 of 56 right strips lost.
 *   A higher `minScore` inside the category branch: 72 strips to 37. In a
 *   category one shared word is evidence; in the catalogue it is not, and
 *   that is the whole difference between the two floors.
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
import { loadCategoryIndex } from './category-evidence';
import { resolveCategoryFromIndex } from './category-resolver';
import { carriesToken, productPhraseTokens, significantTokens } from './match-tokens';
import { buildSkuSet, isHiddenSku } from '../products/hidden-skus';
import { memoizedRead } from './read-memo';

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
   * A HIGHER floor for the catalog top-up (FIX-900, 2026-10-04) and, since
   * AUTO-204, for the product-page scan when a caller asks for one
   * (`includeProductPages`). The category branch and the custom products
   * keep `minScore`; the two whole-collection scans must clear this instead.
   * Defaults to `minScore`, so every caller that does not pass it is
   * byte-identical to before. Never lower than `minScore`.
   *
   * Why the two sources need two floors: a category's products share the
   * phrase's main word by construction ("Koozie Can Cooler" against
   * "koozies"), so one shared token there is real evidence. The whole
   * catalog does not: at one shared token, "sunscreen sticks" pulled two
   * hockey sticks and a lint stick, "rabbit-style corkscrews" pulled infant
   * Rabbit Skins bodysuits, and "wine opener keychains" pulled jar openers
   * (AUTO-200 4.3, measured on the five topic-generated drafts). Those are
   * exactly the one-incidental-word matches a second shared token excludes.
   * Use `catalogTopUpFloor()` to compute it from the phrase, so a one-word
   * phrase is not asked for a second word it does not have.
   */
  catalogMinScore?: number;
  /**
   * A word every product from a WHOLE-COLLECTION scan must carry in its name
   * (FIX-911): the custom products, the product pages and the full catalogue.
   * The category branch is never filtered by it.
   *
   * The blog generator passes the idea's product noun (`productNounOf`):
   * "glow in the dark footballs" may only be topped up with products named
   * football. FIX-900's floor asks a scanned product for two shared words,
   * and "glow" + "dark" are two: glow-in-the-dark tattoos, a glow koozie and
   * a badge reel cleared it under a football idea (FIX-910). Two modifiers
   * are still not the product. Measured on FIX-910's 107 strips with the new
   * resolver in place: off-topic scan products 19 -> 6, drifted strips 16 ->
   * 11, right strips 65 -> 67, none lost. Unset (every other caller), the
   * scans behave exactly as before.
   */
  scanMustCarry?: string | null;
  /**
   * Also surface Sanity `productPage` docs (P2-CP-001), returned with
   * `detailUrl` set so their cards link to /products/<slug>. OPT-IN (default
   * false). Until FIX-871 (2026-09-09) the AI generate routes persisted every
   * result as a SKU-only blogProduct entry, where a synthetic `custom-<id>`
   * SKU resolved to nothing at render; they now store such a result as the
   * `relatedProductRef` reference the strips render
   * (lib/products/strip-entry-write.ts), so enabling this for a generated
   * strip is safe. It stays opt-in because the category branch already
   * surfaces the product pages Patrick placed in the matched category (via
   * getEffectiveCategoryProducts, HIDE-100). Two callers enable it: the
   * /products/<slug> related carousel, and since AUTO-204 the blog's list
   * idea strips (`matchIdeaStrip`), which pass `catalogMinScore` and
   * `scanMustCarry` so a page must share the phrase's words and carry its
   * product noun. Published pages only (the read is the published
   * perspective). Reads are cache-tagged (PRODUCT_PAGES_TAG), so enabling it
   * inside a static render path is safe.
   *
   * ORDER, which this does not change: category, custom products, product
   * pages, catalogue. So a product page comes BEFORE any Geiger product from
   * the catalogue top-up, and AFTER the Geiger products of the idea's own
   * category; inside the category branch his pages rank by score like any
   * other member.
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
   * callers pass it. The AI generate routes do not; that was because a
   * generated strip was persisted as SKU entries and a synthetic `custom-<id>`
   * id could not resolve at render, which FIX-871 removed (such a result is
   * now stored as a reference). Whether a generated strip should carry
   * HIDE-110 substitutions is a separate decision, not made here.
   */
  replacementBySku?: ReadonlyMap<string, GeigerProduct>;
}

// The token rules (the split, the non-significant words, the plural fold)
// live in lib/ai/match-tokens.ts since FIX-911, shared with the category
// resolver so the two cannot disagree about what a word is.

function keywordTokenSet(keywords: string[]): Set<string> {
  const set = new Set<string>();
  for (const kw of keywords) for (const t of significantTokens(kw)) set.add(t);
  return set;
}

/**
 * The catalog top-up floor for a phrase (FIX-900): `cap` shared significant
 * tokens, lowered to the number of significant tokens the phrase actually
 * has, and never below 1. So "sunscreen sticks" (two tokens) needs both,
 * "koozies" (one token) still needs its one, and a phrase made only of
 * generic promo words ("custom items", zero tokens) still needs one, which
 * nothing can share, so it matches nothing rather than everything. Pure, so
 * the route can state the dial and this can be tested without disk.
 */
export function catalogTopUpFloor(keywords: string[], cap: number): number {
  return Math.max(1, Math.min(Math.max(1, Math.floor(cap)), keywordTokenSet(keywords).size));
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
  for (const t of tokens) if (carriesToken(productTokens, t)) score += 1;
  return score;
}

/** Whether a product's name (or brand) carries a word, plural folded. */
function productCarries(product: GeigerProduct, word: string): boolean {
  return carriesToken(new Set(significantTokens(`${product.name} ${product.brand ?? ''}`)), word);
}

/**
 * The product noun of a phrase (FIX-911): its last product word, after a
 * trailing "with ..." / "for ..." is cut ("glow in the dark footballs" ->
 * "footballs", "wine openers with flashlights" -> "openers"). Null when the
 * phrase has no product word. The blog generator passes it as
 * `scanMustCarry`.
 */
export function productNounOf(phrase: string): string | null {
  const tokens = productPhraseTokens(phrase);
  return tokens.length > 0 ? tokens[tokens.length - 1] : null;
}

/** Patrick's own card (a productPage or customProduct normalised to the catalogue shape) carries a synthetic id; a Geiger product never does. */
function isOwnProduct(p: GeigerProduct): boolean {
  return p.sku.startsWith('custom-');
}

/**
 * Stable, deterministic ranking of the products clearing `minScore`:
 * score desc, then Patrick's own product before a Geiger one (AUTO-205), then
 * shorter name, then sku asc.
 *
 * THE TIE-BREAK (AUTO-205 Part 6). AUTO-204 found that inside a category his
 * pages ranked by score like any other member and sat second to fourth
 * because his names are long ("Custom Shape Acrylic Holiday Ornaments - up
 * to 6 sq. inches"). The AUTO-205 diagnostic measured the one-line change on
 * FIX-911's 107 strips: no verdict changed, 12 strips changed, his placements
 * went from 5 to 23. It ships alone. Two other roads were measured there and
 * do NOT ship: matching a post's most specific idea first ("ordering") moved
 * strips without fixing one, and a two-pass matcher (his pages at a higher
 * floor first, then everything) created new faults by taking a page away
 * from the idea it fitted best. The numbers are in CLAUDE.md Section 23
 * (AUTO-205); do not try either again without re-reading them.
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
      const ownA = isOwnProduct(a.p) ? 0 : 1;
      const ownB = isOwnProduct(b.p) ? 0 : 1;
      if (ownA !== ownB) return ownA - ownB;
      if (a.p.name.length !== b.p.name.length) return a.p.name.length - b.p.name.length;
      return a.p.sku < b.p.sku ? -1 : a.p.sku > b.p.sku ? 1 : 0;
    })
    .map((e) => e.p);
}

/**
 * Resolve a concrete product phrase ("power banks", "collapsible can
 * coolers") to the root category it belongs to, or null when the catalogue
 * gives no honest answer. Generic promo words are stripped first, so "custom
 * power banks" and "power banks" resolve identically.
 *
 * The rules are lib/ai/category-resolver.ts (FIX-911): a slug that carries
 * the whole phrase, else the longest tail of the phrase that product NAMES
 * evidence, else a root the phrase names outright, verified by its own
 * product names. Until FIX-911 this read slugs only, and it was synchronous;
 * it is async because the evidence includes Patrick's curation of each root
 * (one Sanity read, memoised; the baked lists alone when Sanity is away).
 *
 */
export async function resolveCategoryForKeywords(phrase: string): Promise<string | null> {
  if (productPhraseTokens(phrase).length === 0) return null;
  return resolveCategoryFromIndex(phrase, await loadCategoryIndex());
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

  // The three sources below scan a whole collection, not a category, so they
  // answer to `scanMustCarry` when the caller names the product noun.
  const mustCarry = (opts.scanMustCarry ?? '').trim().toLowerCase() || null;
  const scannable = (p: GeigerProduct) => !mustCarry || productCarries(p, mustCarry);

  // 2) Custom (non-Geiger) products, scored the same way. Loaded lazily and
  //    guarded: the Sanity read lives behind `server-only` and needs network,
  //    so a failure (offline verifier, Sanity down) degrades to Geiger-only
  //    instead of breaking generation.
  if (opts.includeCustom !== false) {
    try {
      const { getAllCustomProducts, customProductToGeigerProduct } = await import(
        '../sanity/queries/custom-products'
      );
      // AUTO-205: read once per generation (lib/ai/read-memo.ts), not once per idea.
      const custom = (await memoizedRead('all-custom-products', () => getAllCustomProducts())).map(customProductToGeigerProduct);
      for (const p of rankEligible(custom.filter(scannable), tokens, minScore)) push(p);
    } catch {
      // Geiger-only fallback — suggestions stay useful without custom products.
    }
  }

  // The floor for the two scans that read a whole uncurated collection: the
  // product pages (2b) and the catalogue (3). Never below the general one;
  // equal to it for every caller that passes no `catalogMinScore`.
  const catalogFloor = Math.max(minScore, opts.catalogMinScore ?? minScore);

  // 2b) Sanity productPage docs (opt-in — see the option docstring), scored the
  //     same way and carrying detailUrl so their cards link internally. Guarded
  //     like the custom-products read: a failure degrades to Geiger-only.
  //     At the CATALOGUE floor (AUTO-204): all of Patrick's product pages is a
  //     whole collection, not a category, and at one shared word it put santa
  //     hats under every hat idea and glow sticks under "sunscreen sticks"
  //     (FIX-911: 19 drifted strips of 107, against 11).
  if (opts.includeProductPages === true) {
    try {
      const { getAllProductPageCards, productPageToGeigerProduct } = await import(
        '../sanity/queries/product-pages'
      );
      const pages = (await memoizedRead('all-product-page-cards', () => getAllProductPageCards())).map(productPageToGeigerProduct);
      for (const p of rankEligible(pages.filter(scannable), tokens, catalogFloor)) push(p);
    } catch {
      // Geiger-only fallback.
    }
  }

  // 3) Top up from the full catalog (also the no-category path). ONLY products
  //    clearing the relevance floor — never pad a short strip with
  //    sub-threshold catalog bestsellers; fewer (or zero) beats wrong ones.
  //    The catalog has its OWN floor (FIX-900), never below the general one:
  //    here one shared token is one incidental word in 8,000 product names,
  //    not evidence (see the `catalogMinScore` docstring).
  if (picked.length < limit) {
    for (const p of rankEligible(getAllProducts().filter(scannable), tokens, catalogFloor)) {
      if (picked.length >= limit) break;
      push(p);
    }
  }

  return picked;
}
