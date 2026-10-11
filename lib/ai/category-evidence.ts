/**
 * The evidence the category resolver reads (FIX-911): for each of the 465
 * roots, the names of the products the root actually shows.
 *
 * "Actually shows" is the point. 137 roots are curated in Sanity and 94 of
 * those replace their baked list outright, so the baked JSON alone names the
 * wrong products for exactly the roots Patrick has put work into (caps: 0
 * baked, 73 curated; sunscreen: 200 baked department items, 23 curated).
 * The curation is read in ONE request (lib/sanity/queries/category-evidence)
 * and applied here by the same membership rules `mergeCategoryProducts`
 * applies: a customCategory's own list wins over the baked one,
 * `replaceProducts` empties it, adds and placements join, hides and removals
 * win. Order and pinning are ignored: this is evidence, not a grid. The
 * site-wide hide list is ignored too (six SKUs today cannot make or break a
 * two-product, ten-percent test).
 *
 * A ROOT WHOSE PAGE SHOWS THE LEAD FORM GIVES NO EVIDENCE. 59 roots are
 * `full-capped-60`: their list is the top 60 of a parent department, and the
 * category page itself refuses to show it (CLAUDE.md section 3). hot-sauce,
 * coffee-tea-cocoa, food-beverage and collapsible-bottles all hold the same
 * 59 drinkware items; read as evidence, "sport and bike bottles" resolved to
 * hot-sauce. So the page's own precedence is applied here (forceCTA, then
 * replaceProducts, then forceProducts, then the baked rule), and a root that
 * shows the form contributes no names. It can still be named by its slug.
 *
 * The strip itself never comes from here. It comes from
 * `getEffectiveCategoryProducts`, the one function that resolves a category
 * for display; the harness checks that the two agree (FIX-911 report).
 *
 * SERVER ONLY (disk + Sanity). The index is memoised for a few minutes per
 * server instance: a list post resolves ten phrases in one request, and
 * building the index means reading 465 category files.
 */

import {
  getAllGeneratedRootSlugs,
  getCategoryContent,
  getProductsForCategorySlug,
  resolveProductsBySku,
  shouldShowEmptyStateCTA,
} from '../categories';
import { buildCategoryIndex, type CategoryEvidence, type CategoryIndex } from './category-resolver';
import type { CategoryCuration } from '../sanity/queries/category-evidence';

interface NamedProduct {
  sku: string;
  name: string;
  brand?: string | null;
}

export interface AssembleEvidenceInput {
  roots: readonly string[];
  /** The baked products of a root, resolved against the catalogue. */
  baked: (slug: string) => readonly NamedProduct[];
  /** The baked CTA rule for a root (`shouldShowEmptyStateCTA`): empty, full-capped-60 or forceCTA in the JSON. */
  bakedShowsCta: (slug: string) => boolean;
  /** Catalogue lookup for SKUs added in Sanity. */
  bySku: (skus: readonly string[]) => readonly NamedProduct[];
  /** null = Sanity unavailable: the baked lists alone. */
  curation: CategoryCuration | null;
}

const label = (p: { name?: string; title?: string; brand?: string | null }) =>
  `${p.name ?? p.title ?? ''} ${p.brand ?? ''}`.trim();
const trimmed = (list: readonly (string | null | undefined)[] | null | undefined): string[] =>
  (list ?? []).map((s) => `${s ?? ''}`.trim()).filter(Boolean);

/**
 * Pure: the product names each root shows, from the baked lists and the
 * curation snapshot. Mirrors the membership half of `mergeCategoryProducts`.
 */
export function assembleCategoryEvidence(input: AssembleEvidenceInput): CategoryEvidence[] {
  const { roots, baked, bakedShowsCta, bySku, curation } = input;
  if (!curation) {
    return roots.map((slug) => ({ slug, names: bakedShowsCta(slug) ? [] : baked(slug).map(label) }));
  }

  const overrideBySlug = new Map<string, CategoryCuration['overrides'][number]>();
  for (const o of curation.overrides) {
    const slug = (o.categorySlug ?? '').trim();
    // Newest first: the first one seen is the one the category page uses.
    if (slug && !overrideBySlug.has(slug)) overrideBySlug.set(slug, o);
  }
  const ownedBySlug = new Map(
    curation.owned.filter((o) => o.slug).map((o) => [o.slug as string, o]),
  );
  const placementAdds = new Map<string, string[]>();
  const placementRemoves = new Map<string, string[]>();
  for (const p of curation.placements) {
    const sku = `${p.sku ?? ''}`.trim();
    if (!sku) continue;
    for (const slug of trimmed(p.addToCategories)) placementAdds.set(slug, [...(placementAdds.get(slug) ?? []), sku]);
    for (const slug of trimmed(p.removeFromCategories)) placementRemoves.set(slug, [...(placementRemoves.get(slug) ?? []), sku]);
  }
  const pagesBySlug = new Map<string, CategoryCuration['pages']>();
  for (const page of curation.pages) {
    for (const slug of trimmed(page.addToCategories)) pagesBySlug.set(slug, [...(pagesBySlug.get(slug) ?? []), page]);
  }

  return roots.map((slug) => {
    const override = overrideBySlug.get(slug);
    const owned = ownedBySlug.get(slug);
    const removed = new Set([...trimmed(override?.hiddenSkus), ...(placementRemoves.get(slug) ?? [])]);

    // Geiger products: override adds, placement adds, then the base list
    // (the customCategory's own SKUs when Sanity owns the page, else baked;
    // nothing at all under replaceProducts).
    const addedSkus = [...trimmed(override?.addedSkus), ...(placementAdds.get(slug) ?? [])];
    const base: readonly NamedProduct[] = override?.replaceProducts
      ? []
      : owned
        ? bySku(trimmed(owned.productSkus))
        : baked(slug);
    const seen = new Set<string>();
    const names: string[] = [];
    const push = (sku: string, text: string) => {
      if (!sku || seen.has(sku) || removed.has(sku)) return;
      seen.add(sku);
      names.push(text);
    };

    // Patrick's own cards first, as the merge does: a customCategory's
    // custom products, the override's added products (a product page without
    // a slug cannot render), and product pages placed from the product side.
    for (const doc of owned?.custom ?? []) if (doc?._id) push(`custom-${doc._id}`, label(doc));
    for (const doc of override?.added ?? []) {
      if (!doc?._id || !doc._type) continue;
      if (doc._type === 'productPage' && !doc.slug) continue;
      push(`custom-${doc._id}`, label(doc));
    }
    for (const doc of pagesBySlug.get(slug) ?? []) if (doc?._id) push(`custom-${doc._id}`, label(doc));

    for (const p of bySku(addedSkus)) push(p.sku, label(p));
    for (const p of base) push(p.sku, label(p));

    // The category page's own precedence for "grid or lead form".
    const showsForm = override?.forceCTA
      ? true
      : override?.replaceProducts || owned
        ? names.length === 0
        : override?.forceProducts
          ? false
          : bakedShowsCta(slug);
    return { slug, names: showsForm ? [] : names };
  });
}

/** How long one server instance keeps an index before rebuilding it. */
const INDEX_TTL_MS = 5 * 60_000;
let memo: { at: number; index: Promise<CategoryIndex> } | null = null;

async function readCuration(): Promise<CategoryCuration | null> {
  // The Sanity read lives behind `server-only` and needs network. A failure
  // (the offline verifier, a unit test, Sanity down) degrades to the baked
  // lists, the same way the matcher's category branch degrades.
  try {
    const { getCategoryCuration } = await import('../sanity/queries/category-evidence');
    return await getCategoryCuration();
  } catch {
    return null;
  }
}

async function buildIndex(): Promise<CategoryIndex> {
  const curation = await readCuration();
  return buildCategoryIndex(
    assembleCategoryEvidence({
      roots: getAllGeneratedRootSlugs(),
      baked: (slug) => getProductsForCategorySlug(slug),
      bakedShowsCta: (slug) => {
        const content = getCategoryContent(slug);
        return !content || shouldShowEmptyStateCTA(content);
      },
      bySku: (skus) => resolveProductsBySku([...skus]),
      curation,
    }),
  );
}

/** The resolver's index, memoised per server instance for INDEX_TTL_MS. */
export function loadCategoryIndex(): Promise<CategoryIndex> {
  const now = Date.now();
  if (memo && now - memo.at < INDEX_TTL_MS) return memo.index;
  const index = buildIndex();
  memo = { at: now, index };
  // A failed build must not be remembered.
  index.catch(() => {
    if (memo?.index === index) memo = null;
  });
  return index;
}

/** Tests and the measuring harness: forget the memoised index. */
export function resetCategoryIndexMemo(): void {
  memo = null;
}
