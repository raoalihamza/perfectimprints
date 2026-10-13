/**
 * How much catalogue a blog topic has behind it (AUTO-205 Part 2), measured
 * BEFORE the post's shape is chosen, so that depth sets how many ideas a list
 * carries rather than letting a thin topic become a list of twelve ideas with
 * seven empty strips.
 *
 * THE NUMBER. `depth` is the larger of two counts:
 *   - `supply`: what the SHIPPED matcher returns for the whole topic phrase at
 *     `DEPTH_SUPPLY_LIMIT`, with the exact dials an idea strip uses (the
 *     FIX-900 catalogue floor, the FIX-911 product noun, Patrick's product
 *     pages included), so it is what the strips could draw on; and
 *   - `categorySize`: the number of products the topic's resolved root
 *     category actually shows (`getEffectiveCategoryProducts`, Patrick's
 *     curation applied). The diagnostic found 77 topics with a supply of 0
 *     beside a real category, because the products are named differently
 *     from the topic ("promotional matches" against 13 products named
 *     "matchbook"); the ideas the model writes name the products the way the
 *     catalogue does, so the category's size is the honest floor.
 *
 * THE VARIANTS. The material facet pages of the resolved root, for a
 * comparison post (AUTO-205 Part 3): two real materials the product is sold
 * in are the two sides a comparison can honestly take. Since FIX-920 a
 * material counts only for the products the root ITSELF shows that are named
 * for it (`productsNamedForRoot`; two or more of them, and not all of them);
 * the facet page's own grid is a separate pull and was holding flasks under
 * "the materials toothpicks are sold in".
 *
 * COST. One matcher call and one category read per generation, both through
 * reads the strips make anyway, inside the same read memo (lib/ai/read-memo.ts),
 * so the generation that follows pays nothing new for them. Measured on the
 * live pool: about 0.17 s per topic with the reads memoised.
 *
 * SERVER ONLY (disk through the matcher, Sanity through the category read).
 * Never throws: a failed read measures as 0 products and no variants, which
 * makes the post a guide or a question, the survivable answer.
 */
import { siteWideHiddenSkus } from '../products/site-wide-hidden';
import { catalogTopUpFloor, matchRelatedProducts, productNounOf, resolveCategoryForKeywords } from '../ai/related-products';
import { getMaterialVariantsForRoot, getProductsForCategorySlug } from '../categories';
import { productsNamedForRoot, type NamedProduct } from '../ai/category-resolver';

/** How many products the supply count looks for. A list of LIST_IDEAS_MAX ideas at PRODUCTS_PER_IDEA needs 36; 200 is the diagnostic's limit and leaves the number meaningful for the report. */
export const DEPTH_SUPPLY_LIMIT = 200;

export interface TopicDepth {
  /** The root category the topic resolves to, or null. */
  category: string | null;
  /** Products the matcher returns for the topic phrase (up to DEPTH_SUPPLY_LIMIT). */
  supply: number;
  /** Products the resolved category shows; 0 with no category. */
  categorySize: number;
  /** max(supply, categorySize): what the shape rules read. */
  depth: number;
  /** Material variants of the category, largest first (values as in the facet URLs). */
  variants: string[];
}

export interface MeasureTopicDepthOptions {
  /** The floors the idea strips use, so the supply is what a strip could draw on. */
  minScore: number;
  catalogMinScore: number;
}

/** Measure one topic. Never throws. */
export async function measureTopicDepth(topic: string, opts: MeasureTopicDepthOptions): Promise<TopicDepth> {
  const phrase = topic.trim();
  const none: TopicDepth = { category: null, supply: 0, categorySize: 0, depth: 0, variants: [] };
  if (!phrase) return none;
  try {
    const hiddenSkus = await siteWideHiddenSkus();
    const category = await resolveCategoryForKeywords(phrase);
    const products = await matchRelatedProducts({
      hiddenSkus,
      categorySlug: category ?? undefined,
      keywords: [phrase],
      limit: DEPTH_SUPPLY_LIMIT,
      minScore: opts.minScore,
      catalogMinScore: catalogTopUpFloor([phrase], opts.catalogMinScore),
      scanMustCarry: productNounOf(phrase),
      includeProductPages: true,
    });
    let categorySize = 0;
    let variants: string[] = [];
    if (category) {
      // What the root itself shows (Patrick's curation applied), read once:
      // its size is the depth floor, and the products in it that are named
      // for the root are what a material variant must be made of (FIX-920: a
      // facet page's own grid is not a subset of its root, and 214 of 881
      // offered materials had no product in theirs).
      let shown: NamedProduct[];
      try {
        const { getEffectiveCategoryProducts } = await import('../sanity/queries/effective-category-products');
        shown = await getEffectiveCategoryProducts(category, hiddenSkus);
      } catch {
        shown = getProductsForCategorySlug(category);
      }
      categorySize = shown.length;
      variants = getMaterialVariantsForRoot(category, 2, productsNamedForRoot(category, shown).map((p) => p.sku)).map((v) => v.value);
    }
    return { category, supply: products.length, categorySize, depth: Math.max(products.length, categorySize), variants };
  } catch {
    return none;
  }
}
