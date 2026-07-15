import 'server-only';

import type { PortableTextBlock } from '@portabletext/react';
import { cachedClient } from '@/lib/sanity/client';
import { CATALOG_PAGES_TAG, catalogPageTag } from '@/lib/sanity/cache-tags';
import type { SanityImage, SeoFields } from '@/lib/sanity/types';
import { PRODUCT_PAGE_CARD_FIELDS } from './product-pages';
import type { CategoryOverrideAddedProduct } from './category-overrides';

// ---------------------------------------------------------------------------
// Sanity `catalogPage` documents (P2-CAT-001) — Geiger themed-catalog lead
// pages. One doc drives TWO routes:
//   /shop-by-theme/<slug>          — public SEO landing page (indexed)
//   /shop-by-theme/<slug>/catalog  — gated product page (noindex, not in sitemap)
//
// Mirrors lib/sanity/queries/product-pages.ts: every read is a non-CDN
// cache-tagged fetch (never no-store) so both routes stay statically
// prerenderable while the webhook revalidates a publish in seconds.
//
// Freshness notes for the deref'd content:
//  - `addedProducts` (customProduct / productPage refs) are dereferenced INSIDE
//    this catalog-page-tagged read — the webhook's findEmbeddingContentDocs
//    lookup (references($id)) busts each embedding catalogPage when the
//    referenced product is published/edited.
//  - `relatedBlogs` / `relatedVideos` are projected as SLUGS only; the card
//    data loads through the order-preserving tag-cached helpers
//    (getBlogSummariesBySlugs → RELATED_BLOGS_TAG, getVideoSummariesBySlugs →
//    VIDEOS_TAG), so a blog/video publish refreshes the strips with NO webhook
//    change — the same pattern as productPage's strips (P2-CP-004 batch 4).
// ---------------------------------------------------------------------------

export type CatalogPageHeroImage = SanityImage & { alt?: string };

export interface CatalogPageDoc {
  _id: string;
  title: string;
  slug: string;
  /** Which entry in data/geiger/catalogs.json supplies the synced products. */
  catalogKey: string;
  /** Optional override for the gated page's BROWSE CATALOG button. */
  browseCatalogUrl?: string;
  // Landing page content (public)
  heroHeading?: string;
  heroSubheading?: string;
  heroImage?: CatalogPageHeroImage;
  body?: PortableTextBlock[];
  ctaHeading?: string;
  ctaButtonLabel?: string;
  seo?: SeoFields;
  // Gated page: products
  addedSkus?: string[];
  /** Resolved customProduct / productPage docs referenced by `addedProducts`. */
  addedProducts?: CategoryOverrideAddedProduct[];
  hiddenSkus?: string[];
  // Gated page: strips
  relatedKeywords?: string[];
  /** Slugs of the manual `relatedBlogs` references (deref'd in the projection). */
  relatedBlogSlugs?: string[];
  /** Slugs of the manual `relatedVideos` references (deref'd in the projection). */
  relatedVideoSlugs?: string[];
}

// addedProducts reuses the categoryOverride projection shape: the union is
// discriminated by `_type`, customProduct carries the full card fields the
// normalizer needs, productPage reuses the exported PRODUCT_PAGE_CARD_FIELDS
// fragment (one fragment, no drift).
const PROJECTION = `{
  _id,
  title,
  "slug": slug.current,
  catalogKey,
  browseCatalogUrl,
  heroHeading,
  heroSubheading,
  heroImage,
  body,
  ctaHeading,
  ctaButtonLabel,
  seo,
  addedSkus,
  "addedProducts": addedProducts[]->{
    _type,
    _type == "customProduct" => {
      _id,
      title,
      description,
      externalUrl,
      image,
      brand,
      lowPrice,
      highPrice,
      msrp,
      minQty,
      productionTime,
      colors,
      material,
      features,
      types,
      madeInUsa,
      ecoFriendly,
      closeout,
      badges,
      displayOrder,
      placements,
      "parentCategory": parentCategory->{ "slug": slug.current, title }
    },
    _type == "productPage" => {
      ${PRODUCT_PAGE_CARD_FIELDS}
    }
  },
  hiddenSkus,
  relatedKeywords,
  "relatedBlogSlugs": relatedBlogs[]->slug.current,
  "relatedVideoSlugs": relatedVideos[]->slug.current
}`;

export async function getCatalogPageBySlug(slug: string): Promise<CatalogPageDoc | null> {
  if (!slug) return null;
  try {
    return await cachedClient.fetch<CatalogPageDoc | null>(
      `*[_type == "catalogPage" && slug.current == $slug][0]${PROJECTION}`,
      { slug },
      { next: { tags: [CATALOG_PAGES_TAG, catalogPageTag(slug)].filter(Boolean), revalidate: false } },
    );
  } catch {
    return null;
  }
}

/** Every published catalogPage slug — feeds generateStaticParams + the sitemap. */
export async function getAllCatalogPageSlugs(): Promise<string[]> {
  try {
    const slugs = await cachedClient.fetch<string[]>(
      `*[_type == "catalogPage" && defined(slug.current)].slug.current`,
      {},
      { next: { tags: [CATALOG_PAGES_TAG], revalidate: false } },
    );
    return (slugs ?? []).filter(Boolean);
  } catch {
    return [];
  }
}
