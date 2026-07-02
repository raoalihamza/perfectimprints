import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { GeigerProduct } from './categories';
import {
  customProductIsCloseout,
  type CustomProductDoc,
} from '@/lib/sanity/queries/custom-products';
import { getAllCategoryUrls } from './pi-urls';
import {
  FACET_REGISTRY,
  MIN_QTY_BUCKETS,
  type FilterContext,
  type FilterState,
  type RefineByCounts,
  type SidebarData,
  type SortMode,
} from './filter-types';

export * from './filter-types';

const ROOT = process.cwd();
const MEMBERSHIPS_FILE = path.join(ROOT, 'data', 'geiger', 'facet-memberships.json');
const MAPPINGS_FILE = path.join(ROOT, 'data', 'mappings', 'pi-to-geiger.json');

// ---------------------------------------------------------------------------
// Memberships loader (cached)
// ---------------------------------------------------------------------------

interface MembershipsFile {
  memberships: Record<string, string[]>;
}

let _memberships: Map<string, Set<string>> | null = null;

function loadMemberships(): Map<string, Set<string>> {
  if (_memberships) return _memberships;
  const raw = fs.readFileSync(MEMBERSHIPS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as MembershipsFile;
  const map = new Map<string, Set<string>>();
  for (const [url, skus] of Object.entries(parsed.memberships)) {
    map.set(url, new Set(skus));
  }
  _memberships = map;
  return map;
}

export function getMembershipSkus(url: string): Set<string> | null {
  const memberships = loadMemberships();
  return memberships.get(url) ?? null;
}

// ---------------------------------------------------------------------------
// Added-product attribute overlay (categoryOverride Replace-products mode)
//
// In Replace-products mode the grid shows ONLY the products Patrick added
// (pinned Geiger SKUs + custom products). Those SKUs are NOT in THIS category's
// scraped facet memberships, so the sidebar (built from facet-memberships.json)
// can't see them and any facet click drops them. This overlay recovers real
// attributes for the added products so they participate in the Color / Material
// / Brand / Feature / Type filters (and the Made-in-USA / Eco / Closeout
// refine-by toggles):
//
//   - Pinned Geiger SKUs: recovered from a reverse SKU->facet-value index over
//     facet-memberships.json. Their attributes live under their ORIGINAL
//     category URLs, so this works regardless of which category they were
//     pinned from (GeigerProduct itself carries no color/material — only brand).
//   - Custom products: colors[]/material/brand/features[]/types[] plus the
//     madeInUsa/ecoFriendly/closeout toggles, all read off the customProduct doc.
//
// Scoped to color/material/brand/feature/type + the 3 refine-by facets only, so
// the reverse index stays lean (one pass over the membership file, ~a few
// hundred-k (url,sku) pairs, built once per worker and cached like
// loadMemberships). Server-only (node:fs); never import into a client component.
// ---------------------------------------------------------------------------

export interface AddedAttrOverlay {
  color: Set<string>;
  material: Set<string>;
  brand: Set<string>;
  feature: Set<string>;
  type: Set<string>;
  madeInUsa: boolean;
  ecoFriendly: boolean;
  closeout: boolean;
}
export type AddedAttrOverlayMap = Map<string, AddedAttrOverlay>;

/** Value facets the overlay covers — each is both a facet type in the URL shape
 *  `/cat/<root>/<type>/<value>` and a Set-valued key on AddedAttrOverlay. */
const OVERLAY_FACET_TYPES = ['color', 'material', 'brand', 'feature', 'type'] as const;
type OverlayFacetType = (typeof OVERLAY_FACET_TYPES)[number];

const REVERSE_ATTR_TYPES = new Set<string>(OVERLAY_FACET_TYPES);

/**
 * Slugify a human-readable custom-product attribute value into Geiger's
 * facet-value slug format (matches lib/products/augment.ts, incl. `&` -> "and")
 * so custom values merge with the scraped Geiger facet values (e.g.
 * "Stainless Steel" -> "stainless-steel", "Vineyard Vines" -> "vineyard-vines").
 */
function slugifyFacetValue(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function emptyOverlayEntry(): AddedAttrOverlay {
  return {
    color: new Set(),
    material: new Set(),
    brand: new Set(),
    feature: new Set(),
    type: new Set(),
    madeInUsa: false,
    ecoFriendly: false,
    closeout: false,
  };
}

let _reverseAttrIndex: Map<string, AddedAttrOverlay> | null = null;

/**
 * Lazily build (once per worker) a reverse index mapping each SKU to the
 * color/material/brand/feature/type values + made-in-USA/eco/closeout flags it
 * belongs to, across ALL category URLs in facet-memberships.json. Mirrors the
 * EXACT membership URL shapes used by buildSidebarData / applyFiltersAndSort:
 *   /cat/<root>/{color|material|brand|feature|type}/<value>
 *   /cat/<root>/special-feature/made-in-usa   (made in USA)
 *   /cat/<root>/eco-friendly                  (bare — refine-by)
 *   /cat/<root>/closeout                      (bare — refine-by)
 */
function loadReverseAttrIndex(): Map<string, AddedAttrOverlay> {
  if (_reverseAttrIndex) return _reverseAttrIndex;
  const memberships = loadMemberships();
  const idx = new Map<string, AddedAttrOverlay>();
  const ensure = (sku: string): AddedAttrOverlay => {
    let e = idx.get(sku);
    if (!e) {
      e = emptyOverlayEntry();
      idx.set(sku, e);
    }
    return e;
  };
  for (const [url, skus] of memberships) {
    if (!url.startsWith('/cat/')) continue;
    const tail = url.slice('/cat/'.length).split('/'); // [root, ...facetPath]
    if (tail.length === 3) {
      const type = tail[1];
      const value = tail[2];
      if (REVERSE_ATTR_TYPES.has(type)) {
        for (const sku of skus) ensure(sku)[type as OverlayFacetType].add(value);
      } else if (type === 'special-feature' && value === 'made-in-usa') {
        for (const sku of skus) ensure(sku).madeInUsa = true;
      }
    } else if (tail.length === 2) {
      const seg = tail[1];
      if (seg === 'eco-friendly') {
        for (const sku of skus) ensure(sku).ecoFriendly = true;
      } else if (seg === 'closeout') {
        for (const sku of skus) ensure(sku).closeout = true;
      }
    }
  }
  _reverseAttrIndex = idx;
  return idx;
}

/**
 * Build the per-render attribute overlay for the products shown on a
 * Replace-products category. Keyed by SKU:
 *   - custom products (sku `custom-<id>`): colors[]/material/brand/features[]/
 *     types[] off the doc (slugified to Geiger's value format), plus the
 *     madeInUsa/ecoFriendly/closeout toggles (closeout also honors the
 *     CLOSEOUT badge).
 *   - pinned Geiger SKUs: looked up in the reverse index (real Geiger tags).
 * Only the products actually shown are included, so counts reflect the grid.
 */
export function buildAddedAttrOverlay(
  products: GeigerProduct[],
  addedProducts: CustomProductDoc[] | undefined,
): AddedAttrOverlayMap {
  const reverse = loadReverseAttrIndex();
  const customBySku = new Map<string, CustomProductDoc>();
  for (const doc of addedProducts ?? []) customBySku.set(`custom-${doc._id}`, doc);

  const overlay: AddedAttrOverlayMap = new Map();
  for (const p of products) {
    const custom = customBySku.get(p.sku);
    if (custom) {
      const entry = emptyOverlayEntry();
      for (const c of custom.colors ?? []) {
        const s = slugifyFacetValue(c);
        if (s) entry.color.add(s);
      }
      if (custom.material) {
        const s = slugifyFacetValue(custom.material);
        if (s) entry.material.add(s);
      }
      const brand = custom.brand ?? p.brand ?? undefined;
      if (brand) {
        const s = slugifyFacetValue(brand);
        if (s) entry.brand.add(s);
      }
      for (const f of custom.features ?? []) {
        const s = slugifyFacetValue(f);
        if (s) entry.feature.add(s);
      }
      for (const t of custom.types ?? []) {
        const s = slugifyFacetValue(t);
        if (s) entry.type.add(s);
      }
      entry.madeInUsa = custom.madeInUsa === true;
      entry.ecoFriendly = custom.ecoFriendly === true;
      entry.closeout = customProductIsCloseout(custom);
      overlay.set(p.sku, entry);
      continue;
    }
    const rev = reverse.get(p.sku);
    if (rev) {
      // Clone so a caller can never mutate the cached reverse index.
      overlay.set(p.sku, {
        color: new Set(rev.color),
        material: new Set(rev.material),
        brand: new Set(rev.brand),
        feature: new Set(rev.feature),
        type: new Set(rev.type),
        madeInUsa: rev.madeInUsa,
        ecoFriendly: rev.ecoFriendly,
        closeout: rev.closeout,
      });
    }
  }
  return overlay;
}

/** Whether an overlay entry has `value` for a color/material/brand/feature/type facet. */
function overlayHasFacetValue(e: AddedAttrOverlay, facetType: string, value: string): boolean {
  if (!REVERSE_ATTR_TYPES.has(facetType)) return false;
  return e[facetType as OverlayFacetType].has(value);
}

// ---------------------------------------------------------------------------
// Mappings loader (cached)
// ---------------------------------------------------------------------------

interface MappingEntry {
  geigerCategoryPath: string;
  geigerSlug: string;
  matchType: string;
  confidence: number;
}

interface MappingsFile {
  mappings: Record<string, MappingEntry>;
}

let _mappings: Record<string, MappingEntry> | null = null;

function loadMappings(): Record<string, MappingEntry> {
  if (_mappings) return _mappings;
  const raw = fs.readFileSync(MAPPINGS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as MappingsFile;
  _mappings = parsed.mappings;
  return _mappings;
}

export function getFilterContextForRoot(rootSlug: string): FilterContext {
  const mappings = loadMappings();
  const entry = mappings[rootSlug];
  if (!entry) return null;
  const path = entry.geigerCategoryPath;
  if (path.includes('> Apparel') || path.includes('> T-Shirts') || path.includes('> Polos')) {
    return 'apparel';
  }
  if (path.includes('> Drinkware')) return 'drinkware';
  if (path.includes('> Office & Technology > Tech Accessories') || path.includes('> Technology')) {
    return 'tech';
  }
  if (path.includes('> Writing Instruments')) return 'writing';
  return null;
}

// ---------------------------------------------------------------------------
// Static URL set
// ---------------------------------------------------------------------------

let _staticUrlSet: Set<string> | null = null;

function loadStaticUrlSet(): Set<string> {
  if (_staticUrlSet) return _staticUrlSet;
  const set = new Set<string>();
  for (const u of getAllCategoryUrls()) {
    set.add(u.url);
  }
  _staticUrlSet = set;
  return set;
}

export function staticFacetUrlExists(
  rootSlug: string,
  facetType: string,
  facetValue: string
): string | null {
  const url = `/cat/${rootSlug}/${facetType}/${facetValue}`;
  return loadStaticUrlSet().has(url) ? url : null;
}

// ---------------------------------------------------------------------------
// Sidebar derivation
// ---------------------------------------------------------------------------

function valueToLabel(value: string): string {
  const words = value.split('-').filter(Boolean);
  return words
    .map((w) => {
      if (w.length <= 2) return w.toUpperCase();
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/**
 * Build the filter sidebar for a category.
 *
 * `overlay` + `curated` are set ONLY for a Replace-products category
 * (`categoryOverride.replaceProducts`), where the grid shows exclusively
 * Patrick's added products. In that mode the Color / Material / Brand / Feature
 * / Type sections and the refine-by counts fold in the added-product attribute
 * overlay (so the
 * added products show up as filter values and add to counts), and every facet
 * value's `staticUrl` is nulled so a filter click stays on the root URL with
 * query params (hitting the override-aware /api/category-products) instead of
 * navigating to a baked child facet page that would serve the ORIGINAL products.
 * Non-curated categories are unaffected (their static facet URLs are kept for
 * SEO and their counts are unchanged).
 */
export function buildSidebarData(
  rootSlug: string,
  baseSkus: string[],
  overlay?: AddedAttrOverlayMap,
  curated = false,
): SidebarData {
  const memberships = loadMemberships();
  const baseSet = new Set(baseSkus);
  const context = getFilterContextForRoot(rootSlug);

  const rootPrefix = `/cat/${rootSlug}/`;
  const facetUrls: { url: string; facetType: string; facetValue: string }[] = [];
  for (const url of memberships.keys()) {
    if (!url.startsWith(rootPrefix)) continue;
    const rest = url.slice(rootPrefix.length).split('/');
    if (rest.length !== 2) continue;
    facetUrls.push({ url, facetType: rest[0], facetValue: rest[1] });
  }

  const sectionsByKey = new Map<string, SidebarData['sections'][number]>();
  for (const ft of FACET_REGISTRY) {
    if (ft.context && ft.context !== context) continue;
    sectionsByKey.set(ft.key, { key: ft.key, label: ft.label, values: [] });
  }

  // Standard membership-intersection counts. In curated mode the color/material/
  // brand/feature/type sections are rebuilt below (set-based, overlay folded in),
  // so skip those five here to avoid double-counting a SKU that is in both.
  for (const f of facetUrls) {
    if (curated && REVERSE_ATTR_TYPES.has(f.facetType)) continue;
    const section = sectionsByKey.get(f.facetType);
    if (!section) continue;
    const facetSkus = memberships.get(f.url);
    if (!facetSkus) continue;
    let count = 0;
    for (const sku of facetSkus) {
      if (baseSet.has(sku)) count++;
    }
    if (count === 0) continue;
    section.values.push({
      value: f.facetValue,
      label: valueToLabel(f.facetValue),
      count,
      staticUrl: curated ? null : staticFacetUrlExists(rootSlug, f.facetType, f.facetValue),
    });
  }

  // Curated (Replace-products): rebuild Color / Material / Brand / Feature /
  // Type from SKU SETS accumulated over BOTH this root's memberships AND the
  // overlay, so count = set size (a SKU in both is counted once) and an
  // overlay-only value (0 membership hits) is created rather than dropped.
  if (curated && overlay) {
    const valSkus: Record<OverlayFacetType, Map<string, Set<string>>> = {
      color: new Map(),
      material: new Map(),
      brand: new Map(),
      feature: new Map(),
      type: new Map(),
    };
    const add = (type: OverlayFacetType, value: string, sku: string) => {
      let m = valSkus[type].get(value);
      if (!m) {
        m = new Set();
        valSkus[type].set(value, m);
      }
      m.add(sku);
    };
    for (const f of facetUrls) {
      if (!REVERSE_ATTR_TYPES.has(f.facetType)) continue;
      const facetSkus = memberships.get(f.url);
      if (!facetSkus) continue;
      for (const sku of facetSkus) {
        if (baseSet.has(sku)) add(f.facetType as OverlayFacetType, f.facetValue, sku);
      }
    }
    for (const [sku, entry] of overlay) {
      for (const t of OVERLAY_FACET_TYPES) {
        for (const v of entry[t]) add(t, v, sku);
      }
    }
    for (const type of OVERLAY_FACET_TYPES) {
      const section = sectionsByKey.get(type);
      if (!section) continue;
      for (const [value, skuSet] of valSkus[type]) {
        section.values.push({
          value,
          label: valueToLabel(value),
          count: skuSet.size,
          staticUrl: null,
        });
      }
    }
  }

  for (const section of sectionsByKey.values()) {
    section.values.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  const sections = [...sectionsByKey.values()].filter((s) => s.values.length > 0);

  // Refine-by counts: union of this root's membership hits (∩ baseSet) with the
  // overlay flags (curated only), de-duped by SKU so combined counts are right.
  // With no overlay this reduces to the old membership-intersection count.
  const countRefine = (
    members: Set<string> | undefined,
    pick: (e: AddedAttrOverlay) => boolean,
  ): number => {
    const s = new Set<string>();
    if (members) for (const sku of members) if (baseSet.has(sku)) s.add(sku);
    if (curated && overlay) for (const [sku, e] of overlay) if (pick(e)) s.add(sku);
    return s.size;
  };
  const refineBy: RefineByCounts = {
    madeInUsa: countRefine(
      memberships.get(`/cat/${rootSlug}/special-feature/made-in-usa`),
      (e) => e.madeInUsa,
    ),
    ecoFriendly: countRefine(memberships.get(`/cat/${rootSlug}/eco-friendly`), (e) => e.ecoFriendly),
    deals: countRefine(memberships.get(`/cat/${rootSlug}/closeout`), (e) => e.closeout),
    newItems: 0,
  };

  return {
    rootSlug,
    baseSkuCount: baseSkus.length,
    context,
    sections,
    price: null,
    minQtyBuckets: [],
    refineBy,
  };
}

export function enrichSidebarWithProductStats(
  sidebar: SidebarData,
  products: GeigerProduct[]
): SidebarData {
  let pMin = Infinity;
  let pMax = -Infinity;
  for (const p of products) {
    const v = p.low_price;
    if (v == null) continue;
    if (v < pMin) pMin = v;
    if (v > pMax) pMax = v;
  }
  sidebar.price = pMin <= pMax ? { min: Math.floor(pMin), max: Math.ceil(pMax) } : null;

  sidebar.minQtyBuckets = MIN_QTY_BUCKETS.map((bucket) => {
    let count = 0;
    for (const p of products) {
      if (p.min_qty == null) continue;
      if (p.min_qty < bucket.min) continue;
      if (bucket.max != null && p.min_qty > bucket.max) continue;
      count++;
    }
    return { bucket, count };
  }).filter((b) => b.count > 0);

  let newCount = 0;
  for (const p of products) {
    if (p.is_new_item) newCount++;
  }
  sidebar.refineBy.newItems = newCount;

  return sidebar;
}

// ---------------------------------------------------------------------------
// Server-side filter application
// ---------------------------------------------------------------------------

export function applyFiltersAndSort(
  products: GeigerProduct[],
  state: FilterState,
  rootSlug: string,
  overlay?: AddedAttrOverlayMap,
): GeigerProduct[] {
  let result = products;

  for (const [facetType, values] of Object.entries(state.facets)) {
    if (values.length === 0) continue;
    const unionSet = new Set<string>();
    for (const value of values) {
      const url = `/cat/${rootSlug}/${facetType}/${value}`;
      const skus = getMembershipSkus(url);
      if (!skus) continue;
      for (const s of skus) unionSet.add(s);
    }
    // Without an overlay an empty membership union means nothing matches (fast
    // path preserved). With an overlay (curated), an added product can still
    // match via its own attributes, so we must run the per-product filter.
    if (unionSet.size === 0 && !overlay) return [];
    result = result.filter((p) => {
      if (unionSet.has(p.sku)) return true;
      if (overlay) {
        const e = overlay.get(p.sku);
        if (e) {
          for (const v of values) if (overlayHasFacetValue(e, facetType, v)) return true;
        }
      }
      return false;
    });
  }

  // Refine-by toggles: keep a product if it is in the scraped membership set OR
  // (curated) the overlay flags it. `pick` reads the matching overlay flag.
  const intersectWithUrl = (url: string, pick: (e: AddedAttrOverlay) => boolean) => {
    const skus = getMembershipSkus(url);
    return result.filter((p) => {
      if (skus && skus.has(p.sku)) return true;
      if (overlay) {
        const e = overlay.get(p.sku);
        if (e && pick(e)) return true;
      }
      return false;
    });
  };
  if (state.madeInUsa) {
    result = intersectWithUrl(`/cat/${rootSlug}/special-feature/made-in-usa`, (e) => e.madeInUsa);
  }
  if (state.ecoFriendly) {
    result = intersectWithUrl(`/cat/${rootSlug}/eco-friendly`, (e) => e.ecoFriendly);
  }
  if (state.deals) {
    result = intersectWithUrl(`/cat/${rootSlug}/closeout`, (e) => e.closeout);
  }

  if (state.newOnly) {
    result = result.filter((p) => p.is_new_item);
  }

  if (state.minQtyBuckets.length > 0) {
    const buckets = MIN_QTY_BUCKETS.filter((b) => state.minQtyBuckets.includes(b.key));
    result = result.filter((p) => {
      if (p.min_qty == null) return false;
      for (const b of buckets) {
        if (p.min_qty >= b.min && (b.max == null || p.min_qty <= b.max)) return true;
      }
      return false;
    });
  }

  if (state.priceMin != null || state.priceMax != null) {
    const lo = state.priceMin ?? -Infinity;
    const hi = state.priceMax ?? Infinity;
    result = result.filter((p) => {
      const v = p.low_price;
      if (v == null) return false;
      return v >= lo && v <= hi;
    });
  }

  return sortProducts(result, state.sort);
}

function sortProducts(products: GeigerProduct[], sort: SortMode): GeigerProduct[] {
  if (sort === 'best-sellers') return products;
  const arr = [...products];
  switch (sort) {
    case 'price-asc':
      arr.sort((a, b) => (a.low_price ?? Infinity) - (b.low_price ?? Infinity));
      break;
    case 'price-desc':
      arr.sort((a, b) => (b.low_price ?? -Infinity) - (a.low_price ?? -Infinity));
      break;
    case 'moq-asc':
      arr.sort((a, b) => (a.min_qty ?? Infinity) - (b.min_qty ?? Infinity));
      break;
    case 'newest':
      arr.sort((a, b) => Number(b.is_new_item) - Number(a.is_new_item));
      break;
  }
  return arr;
}
