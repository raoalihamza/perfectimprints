import 'server-only';

import type { PortableTextBlock } from '@portabletext/react';
import { cachedClient, buildImageUrl, urlForImage } from '@/lib/sanity/client';
import { PRODUCT_PAGES_TAG, productPageTag } from '@/lib/sanity/cache-tags';
import type { SanityImage, SeoFields } from '@/lib/sanity/types';
import type { GeigerProduct } from '@/lib/product-types';
import type { DecorationOption } from '@/lib/products/quote-estimate';
import type { CustomProductDoc } from './custom-products';

// ---------------------------------------------------------------------------
// Sanity `productPage` documents (P2-CP-001 part 1) — full custom product
// detail pages rendered at /products/<slug> (app/products/[slug]). Mirrors
// lib/sanity/queries/pages.ts / landing-pages.ts: every read is a non-CDN
// cache-tagged fetch (never no-store) so the route stays statically
// prerenderable while the webhook revalidates a publish in seconds.
//
// Surfacing (confirmed scope): the detail page, /new-products, related-products
// carousels, site search (live delta), and — per-category, only where Patrick
// attaches one via categoryOverride.addedProducts (P2-CP-004 batch 3) — /cat
// grids. Never inside /cat automatically.
// ---------------------------------------------------------------------------

export type ProductPageImage = SanityImage & { alt?: string; _key?: string };

export interface ProductPageColorVariant {
  _key?: string;
  colorName?: string;
  swatchHex?: string;
  images?: ProductPageImage[];
}

export interface ProductPagePricingTier {
  _key?: string;
  minQty?: number;
  price?: number;
}

/**
 * The "card" subset — everything needed to normalize a productPage into a
 * GeigerProduct for ProductCard / the aggregators / search / the matcher.
 * List queries and dereferenced related-product refs use exactly this shape;
 * the full doc (detail page) extends it.
 */
export interface ProductPageCard {
  _id: string;
  title: string;
  slug: string;
  brand?: string;
  colorVariants?: ProductPageColorVariant[];
  defaultImages?: ProductPageImage[];
  pricingTiers?: ProductPagePricingTier[];
  minQty?: number;
  onSale?: boolean;
  salePercentOff?: number;
  saleExpires?: string;
  material?: string;
  features?: string[];
  types?: string[];
  madeInUsa?: boolean;
  ecoFriendly?: boolean;
  closeout?: boolean;
  showInNewProducts?: boolean;
}

/** Manual related-products entry — the shared `blogProduct` object (SKU or manual). */
export interface RelatedBlogProductEntry {
  _type: 'blogProduct';
  _key?: string;
  sku?: string;
  title?: string;
  image?: ProductPageImage;
  url?: string;
}

/** A dereferenced `customProduct` reference in the manual related list. */
export type RelatedCustomProductRef = { _type: 'customProduct' } & Partial<CustomProductDoc> & {
    _id: string;
    title?: string;
  };

/** A dereferenced `productPage` reference in the manual related list. */
export type RelatedProductPageRef = { _type: 'productPage' } & ProductPageCard;

export type ProductPageRelatedEntry =
  | RelatedBlogProductEntry
  | RelatedCustomProductRef
  | RelatedProductPageRef;

/**
 * One decorationMethods entry. New entries are `{method, upcharge?,
 * setupCharge?}` objects (per-unit upcharge + optional per-method one-time
 * setup charge, Q-100 - both feed the estimate); entries saved before the
 * P2-CP follow-up are plain strings - `productPageDecorations()` normalizes
 * both.
 */
export interface ProductPageDecorationEntry {
  _key?: string;
  method?: string;
  upcharge?: number;
  setupCharge?: number;
}

export interface ProductPageDoc extends ProductPageCard {
  description?: PortableTextBlock[];
  decorationMethods?: (string | ProductPageDecorationEntry)[];
  sizes?: string[];
  productionTime?: number;
  /** One-time flat setup/decoration charge added to the on-page ESTIMATE. */
  setupCharge?: number;
  // Logistics / carton (all optional — only set values render/emit).
  unitsPerCarton?: number;
  cartonWeight?: number;
  cartonWidth?: number;
  cartonHeight?: number;
  cartonDepth?: number;
  fobZip?: string;
  fobCity?: string;
  fobState?: string;
  relatedCategorySlug?: string;
  relatedKeywords?: string[];
  relatedProducts?: ProductPageRelatedEntry[];
  /** Slugs of the manual `relatedVideos` references (deref'd in the projection). */
  relatedVideoSlugs?: string[];
  /** Slugs of the manual `relatedBlogs` references (deref'd in the projection). */
  relatedBlogSlugs?: string[];
  seo?: SeoFields;
}

/**
 * Normalized decoration options for the configurator/quote form: legacy string
 * entries and blank upcharges become `{method, upcharge: 0}`; blank methods
 * are dropped; duplicates (by method) keep the first entry.
 *
 * Per-method setup charge (Q-100): carried through ONLY when it is a finite
 * number of 0 or more - an explicit 0 is kept (it means "no setup fee for
 * this method" and overrides the flat product charge in
 * `effectiveSetupCharge`); blank / negative / non-finite values stay
 * undefined so the flat charge applies. Legacy string entries never carry
 * one, so they fall back to the flat charge exactly as before.
 */
export function productPageDecorations(doc: ProductPageDoc): DecorationOption[] {
  const out: DecorationOption[] = [];
  for (const entry of doc.decorationMethods ?? []) {
    const method = (typeof entry === 'string' ? entry : entry?.method ?? '').trim();
    if (!method || out.some((o) => o.method === method)) continue;
    const raw = typeof entry === 'string' ? undefined : entry?.upcharge;
    const upcharge = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
    const rawSetup = typeof entry === 'string' ? undefined : entry?.setupCharge;
    const setupCharge =
      typeof rawSetup === 'number' && Number.isFinite(rawSetup) && rawSetup >= 0
        ? rawSetup
        : undefined;
    out.push({ method, upcharge, ...(setupCharge !== undefined ? { setupCharge } : {}) });
  }
  return out;
}

// Exported (P2-CP-004 batch 3) so getCategoryOverride's addedProducts[]->
// productPage branch projects EXACTLY the card subset productPageToGeigerProduct
// needs — one fragment, no drift.
export const PRODUCT_PAGE_CARD_FIELDS = `
  _id,
  title,
  "slug": slug.current,
  brand,
  colorVariants,
  defaultImages,
  pricingTiers,
  minQty,
  onSale,
  salePercentOff,
  saleExpires,
  material,
  features,
  types,
  madeInUsa,
  ecoFriendly,
  closeout,
  showInNewProducts
`;

// Manual related entries: blogProduct objects come through verbatim; references
// are dereferenced in place, carrying the card fields for BOTH target types
// (fields the other type lacks simply come back null and are ignored).
// NOTE: the reference member is NAMED (`relatedProductRef` in the schema), and
// Sanity stores a named array member's `_type` as the member name — NOT
// 'reference' — so the deref condition keys on `defined(_ref)` (true for any
// reference item, named or not, and never for blogProduct objects).
const FULL_PROJECTION = `{
  ${PRODUCT_PAGE_CARD_FIELDS},
  description,
  decorationMethods,
  sizes,
  productionTime,
  setupCharge,
  unitsPerCarton,
  cartonWeight,
  cartonWidth,
  cartonHeight,
  cartonDepth,
  fobZip,
  fobCity,
  fobState,
  relatedCategorySlug,
  relatedKeywords,
  "relatedVideoSlugs": relatedVideos[]->slug.current,
  "relatedBlogSlugs": relatedBlogs[]->slug.current,
  relatedProducts[]{
    _type == 'blogProduct' => { _type, _key, sku, title, image, url },
    defined(_ref) => @->{
      _type,
      _id,
      title,
      "slug": slug.current,
      brand,
      description,
      externalUrl,
      image,
      lowPrice,
      highPrice,
      msrp,
      minQty,
      productionTime,
      badges,
      placements,
      colors,
      material,
      features,
      types,
      madeInUsa,
      ecoFriendly,
      closeout,
      colorVariants,
      defaultImages,
      pricingTiers,
      onSale,
      showInNewProducts
    }
  },
  showInNewProducts,
  seo
}`;

/** First displayable image: first color variant's first image, else defaultImages[0]. */
export function productPageFirstImage(doc: ProductPageCard): ProductPageImage | null {
  for (const variant of doc.colorVariants ?? []) {
    const img = (variant.images ?? []).find((i) => i?.asset?._ref);
    if (img) return img;
  }
  return (doc.defaultImages ?? []).find((i) => i?.asset?._ref) ?? null;
}

/**
 * The SINGLE source of truth for which pricing tiers count: both minQty and
 * price must be positive numbers, sorted by quantity, capped at the 5 the
 * table renders (the schema max-5 rule is warning-level, so 6+ can publish).
 * The detail-page table, the card price range, the price line, and the
 * JSON-LD AggregateOffer ALL derive from this list so they can never disagree
 * (review finding: the range previously admitted tiers the table dropped).
 */
export function productPageValidTiers(
  doc: ProductPageCard,
): { minQty: number; price: number }[] {
  return (doc.pricingTiers ?? [])
    .filter(
      (t): t is ProductPagePricingTier & { minQty: number; price: number } =>
        typeof t.minQty === 'number' &&
        Number.isFinite(t.minQty) &&
        t.minQty > 0 &&
        typeof t.price === 'number' &&
        Number.isFinite(t.price) &&
        t.price > 0,
    )
    .sort((a, b) => a.minQty - b.minQty)
    .slice(0, 5)
    .map((t) => ({ minQty: t.minQty, price: t.price }));
}

/** Low/high card price derived from the (valid, displayed) pricing tiers. */
export function productPagePriceRange(doc: ProductPageCard): {
  low: number | null;
  high: number | null;
} {
  const prices = productPageValidTiers(doc).map((t) => t.price);
  if (prices.length === 0) return { low: null, high: null };
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

/** Explicit minQty, else the lowest (valid, displayed) tier quantity. */
export function productPageMinQty(doc: ProductPageCard): number | null {
  if (typeof doc.minQty === 'number' && doc.minQty > 0) return doc.minQty;
  const tiers = productPageValidTiers(doc);
  return tiers.length > 0 ? tiers[0].minQty : null;
}

/** Color filter values — derived from the color variants (no separate tags field). */
export function productPageColors(doc: ProductPageCard): string[] {
  const out: string[] = [];
  for (const v of doc.colorVariants ?? []) {
    const name = v.colorName?.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Normalize a productPage into the GeigerProduct contract so it flows through
 * ProductCard, the aggregators, search, and the related matcher uniformly.
 *
 * Conventions:
 * - `sku` uses the same `custom-<_id>` convention as customProduct: it never
 *   collides with real Geiger SKUs, ProductCard already hides the `Item #` line
 *   for it, and `augmentAggregator`'s filter-tag injection (which keys synthetic
 *   SKUs as `custom-<_id>`) lines up without changes.
 * - `detailUrl` is the internal route — ProductCard links there (same tab)
 *   instead of the affiliate host. `geiger_url` stays null (nothing external).
 * - `is_on_sale` ← onSale; the CLOSEOUT/SALE ribbons ride the badges array;
 *   `is_new_item` ← showInNewProducts (feeds the New Items filter).
 */
export function productPageToGeigerProduct(doc: ProductPageCard): GeigerProduct {
  const image = productPageFirstImage(doc);
  const imageUrl = image ? buildImageUrl(image, (b) => b.width(400).fit('max')) : null;
  const { low, high } = productPagePriceRange(doc);

  const badges: GeigerProduct['badges'] = [];
  if (doc.closeout === true) badges.push({ tag: 'closeout', value: 'CLOSEOUT' });
  if (doc.onSale === true) badges.push({ tag: 'sale', value: 'SALE' });

  return {
    sku: `custom-${doc._id}`,
    name: doc.title,
    brand: doc.brand ?? null,
    low_price: low,
    high_price: high ?? low,
    msrp: null,
    min_qty: productPageMinQty(doc),
    imageUrl,
    description: null,
    category_paths: [],
    badges,
    is_new_item: doc.showInNewProducts === true,
    is_on_sale: doc.onSale === true,
    product_type_unigram: null,
    geiger_url: null,
    detailUrl: `/products/${doc.slug}`,
  };
}

/**
 * A CustomProductDoc-shaped view of a productPage, for `augmentAggregator`'s
 * filter-tag injection on /new-products (Brand/Color/Material/Feature/Type +
 * Made-in-USA/Eco/Closeout/New-Items). Injection keys the synthetic SKU as
 * `custom-<_id>`, matching `productPageToGeigerProduct`. `externalUrl` is a
 * required field on the interface but is never read by the injection — it is
 * set to '' and MUST NOT be used to render a link.
 */
export function productPageAsCustomDoc(doc: ProductPageCard): CustomProductDoc {
  const badges: string[] = [];
  if (doc.onSale === true) badges.push('sale');
  if (doc.closeout === true) badges.push('closeout');
  return {
    _id: doc._id,
    title: doc.title,
    externalUrl: '',
    brand: doc.brand,
    colors: productPageColors(doc),
    material: doc.material,
    features: doc.features,
    types: doc.types,
    madeInUsa: doc.madeInUsa,
    ecoFriendly: doc.ecoFriendly,
    closeout: doc.closeout,
    badges,
    placements: { onNewProducts: doc.showInNewProducts === true },
  };
}

// ---------------------------------------------------------------------------
// Queries — all through the non-CDN cachedClient with PRODUCT_PAGES_TAG (+ the
// per-slug tag for single-doc reads). Failures degrade to null/[] so a Sanity
// outage never crashes a render.
// ---------------------------------------------------------------------------

export async function getProductPageBySlug(slug: string): Promise<ProductPageDoc | null> {
  try {
    return await cachedClient.fetch<ProductPageDoc | null>(
      `*[_type == "productPage" && slug.current == $slug][0]${FULL_PROJECTION}`,
      { slug },
      { next: { tags: [PRODUCT_PAGES_TAG, productPageTag(slug)].filter(Boolean), revalidate: false } },
    );
  } catch {
    return null;
  }
}

export async function getAllProductPageSlugs(): Promise<string[]> {
  try {
    const slugs = await cachedClient.fetch<string[]>(
      `*[_type == "productPage" && defined(slug.current)].slug.current`,
      {},
      { next: { tags: [PRODUCT_PAGES_TAG], revalidate: false } },
    );
    return (slugs ?? []).filter(Boolean);
  } catch {
    return [];
  }
}

/** Products surfaced on /new-products (Visibility toggle on), newest first. */
export async function getProductPagesForNewProducts(): Promise<ProductPageCard[]> {
  try {
    return (
      (await cachedClient.fetch<ProductPageCard[]>(
        `*[_type == "productPage" && defined(slug.current) && showInNewProducts == true] | order(_createdAt desc) { ${PRODUCT_PAGE_CARD_FIELDS} }`,
        {},
        { next: { tags: [PRODUCT_PAGES_TAG], revalidate: false } },
      )) ?? []
    ).filter((d) => d.slug);
  } catch {
    return [];
  }
}

/** Every published productPage as a card — feeds the related-products matcher. */
export async function getAllProductPageCards(): Promise<ProductPageCard[]> {
  try {
    return (
      (await cachedClient.fetch<ProductPageCard[]>(
        `*[_type == "productPage" && defined(slug.current)] | order(title asc) { ${PRODUCT_PAGE_CARD_FIELDS} }`,
        {},
        { next: { tags: [PRODUCT_PAGES_TAG], revalidate: false } },
      )) ?? []
    ).filter((d) => d.slug);
  } catch {
    return [];
  }
}

export interface ProductPageSearchEntry {
  title: string;
  /** Internal route `/products/<slug>` — NOT an affiliate URL. */
  url: string;
  brand?: string;
  /** Small thumbnail for the autocomplete overlay. */
  image?: string;
  /** The manually-entered REAL item number (search key) — never `custom-<id>`. */
  sku?: string;
}

/**
 * Every productPage as a search entry for the LIVE Sanity search delta
 * (app/api/search-index). Entries use the `product` result type but carry
 * `internal: true` downstream (see lib/search/sanity-index.ts) so `resultTarget`
 * routes them to the internal detail page, never the affiliate host.
 *
 * The thumbnail comes from `productPageFirstImage()` — the SAME selection the
 * card/gallery/og:image use (scans all variants, skips asset-less stubs) — so
 * the overlay thumbnail can't be missing while the card shows an image.
 */
export async function getProductPageSearchEntries(): Promise<ProductPageSearchEntry[]> {
  try {
    const docs =
      (await cachedClient.fetch<
        {
          title?: string;
          slug?: string;
          brand?: string;
          sku?: string;
          colorVariants?: ProductPageColorVariant[];
          defaultImages?: ProductPageImage[];
        }[]
      >(
        `*[_type == "productPage" && defined(slug.current) && defined(title)]{
          title,
          "slug": slug.current,
          brand,
          sku,
          colorVariants,
          defaultImages
        }`,
        {},
        { next: { tags: [PRODUCT_PAGES_TAG], revalidate: false } },
      )) ?? [];
    return docs
      .map((d) => {
        const entry: ProductPageSearchEntry = {
          title: (d.title ?? '').trim(),
          url: d.slug ? `/products/${d.slug}` : '',
        };
        if (d.brand) entry.brand = d.brand.trim();
        // The REAL item number Patrick entered (search key) — the synthetic
        // custom-<_id> SKU is an internal id and is deliberately NOT indexed.
        if (d.sku?.trim()) entry.sku = d.sku.trim();
        const image = productPageFirstImage({
          _id: '',
          title: '',
          slug: '',
          colorVariants: d.colorVariants,
          defaultImages: d.defaultImages,
        });
        if (image) {
          try {
            entry.image = urlForImage(image).width(80).height(80).fit('max').url();
          } catch {
            /* leave image unset */
          }
        }
        return entry;
      })
      .filter((e) => e.title && e.url);
  } catch {
    return [];
  }
}

/**
 * The stored lead-routing fields the /api/leads route needs (P2-CP-002).
 * Structurally compatible with `LandingLeadInfo` (lib/leads/landing-lead.ts)
 * so the same routing resolver applies.
 */
export interface ProductLeadLookup {
  leadRecipient?: string | null;
  title?: string | null;
}

/**
 * Lightweight SERVER-SIDE lookup for the lead route (P2-CP-002): maps a
 * client-submitted product slug to the doc's stored `leadRecipient` (+ title
 * for the email/record copy). The client never sends a recipient — only this
 * slug — so the stored value is the only possible destination (no open relay;
 * same design as `getLandingLeadInfo`). Returns null when the slug is not a
 * real productPage or the read fails; the route then treats the submission as
 * non-product (default recipient, no confirmation). Cache-tagged like every
 * productPage read, so editing `Lead recipient` in Studio re-routes within
 * seconds of the webhook firing.
 */
export async function getProductLeadInfo(slug: string): Promise<ProductLeadLookup | null> {
  if (!slug) return null;
  try {
    return await cachedClient.fetch<ProductLeadLookup | null>(
      `*[_type == "productPage" && slug.current == $slug][0]{ leadRecipient, title }`,
      { slug },
      { next: { tags: [PRODUCT_PAGES_TAG, productPageTag(slug)].filter(Boolean), revalidate: false } },
    );
  } catch {
    return null;
  }
}

export interface ProductPageSitemapEntry {
  slug: string;
  /** ~1200px representative image for the sitemap <image:image> entry. */
  image?: string;
}

/**
 * Slug + representative image for the sitemap (mirrors the /cat image entries).
 * Image selection = `productPageFirstImage()`, consistent with the card/gallery.
 */
export async function getProductPageSitemapEntries(): Promise<ProductPageSitemapEntry[]> {
  try {
    const docs =
      (await cachedClient.fetch<
        {
          slug?: string;
          colorVariants?: ProductPageColorVariant[];
          defaultImages?: ProductPageImage[];
        }[]
      >(
        `*[_type == "productPage" && defined(slug.current)]{
          "slug": slug.current,
          colorVariants,
          defaultImages
        }`,
        {},
        { next: { tags: [PRODUCT_PAGES_TAG], revalidate: false } },
      )) ?? [];
    return docs
      .filter((d): d is { slug: string; colorVariants?: ProductPageColorVariant[]; defaultImages?: ProductPageImage[] } =>
        Boolean(d.slug),
      )
      .map((d) => {
        const entry: ProductPageSitemapEntry = { slug: d.slug };
        const first = productPageFirstImage({
          _id: '',
          title: '',
          slug: d.slug,
          colorVariants: d.colorVariants,
          defaultImages: d.defaultImages,
        });
        const image = first ? buildImageUrl(first, (b) => b.width(1200).fit('max')) : null;
        if (image) entry.image = image;
        return entry;
      });
  } catch {
    return [];
  }
}
