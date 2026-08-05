import type { PortableTextBlock } from '@portabletext/react';
import { cachedClient } from '@/lib/sanity/client';
import { CUSTOM_CATEGORIES_TAG, categoryTag } from '@/lib/sanity/cache-tags';
import type { SanityImage, SeoFields } from '@/lib/sanity/types';
import type { CustomProductDoc } from './custom-products';

export interface CustomCategorySearchEntry {
  title: string;
  slug: string;
}

export interface CustomCategoryFaq {
  q: string;
  /** Rich text (Task B). Rendered with links; plain-texted for FAQPage schema. */
  a: PortableTextBlock[];
}

export interface CustomCategoryDoc {
  _id: string;
  title: string;
  slug: string;
  targetKeyword?: string;
  heroImage?: SanityImage;
  heroCopy?: string;
  introHtml?: PortableTextBlock[];
  bodySections?: PortableTextBlock[];
  faqs?: CustomCategoryFaq[];
  /** Editable Geiger SKU list (pre-filled on push). */
  productSkus?: string[];
  externalUrl?: string;
  seo?: SeoFields;
  /** Custom products whose `parentCategory` references this category. */
  customProducts: CustomProductDoc[];
}

const CUSTOM_CATEGORY_PRODUCT_PROJECTION = `
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
`;

const CUSTOM_CATEGORY_PROJECTION = `
  _id,
  title,
  "slug": slug.current,
  targetKeyword,
  heroImage,
  heroCopy,
  introHtml,
  bodySections,
  faqs,
  productSkus,
  externalUrl,
  seo,
  "customProducts": *[_type == "customProduct" && references(^._id)] | order(displayOrder asc, title asc) {
    ${CUSTOM_CATEGORY_PRODUCT_PROJECTION}
  }
`;

/**
 * Fetch a published `customCategory` by its slug (M5-504 Part 4). These render
 * at `/cat/<slug>` through the same route and do NOT require a Geiger mapping.
 * Returns null when none exists or Sanity is unavailable.
 */
export async function getCustomCategoryBySlug(
  slug: string,
): Promise<CustomCategoryDoc | null> {
  if (!slug) return null;
  try {
    const doc = await cachedClient.fetch<CustomCategoryDoc | null>(
      `*[_type == "customCategory" && slug.current == $slug][0] { ${CUSTOM_CATEGORY_PROJECTION} }`,
      { slug },
      { next: { tags: [categoryTag(slug)].filter(Boolean), revalidate: false } },
    );
    return doc ?? null;
  } catch {
    return null;
  }
}

/**
 * Sanity-authored category pages (custom + curated) as search entries
 * (M5-507 follow-up). Both render at `/cat/<slug>` and Sanity wins over any
 * bulk JSON page of the same slug, so these feed the live search delta and are
 * de-duped against the static index by URL on the client (Sanity-first).
 */
export async function getCustomCategorySearchEntries(): Promise<CustomCategorySearchEntry[]> {
  try {
    const docs =
      // Q-175: non-CDN + tagged like every other search-delta builder, so a
      // newly published category page is searchable in seconds rather than
      // whenever the CDN and the route's one-week ISR floor happen to align.
      // Its own tag, NOT the CATEGORY_CONTROL_TAG every /cat page reads.
      (await cachedClient.fetch<{ title?: string; slug?: { current?: string } }[]>(
        `*[(_type == "customCategory" || _type == "curatedCategory")
            && defined(title) && defined(slug.current)]{ title, slug }`,
        {},
        { next: { tags: [CUSTOM_CATEGORIES_TAG], revalidate: false } },
      )) ?? [];
    return docs
      .map((d) => ({ title: (d.title ?? '').trim(), slug: d.slug?.current ?? '' }))
      .filter((e) => e.title && e.slug);
  } catch {
    return [];
  }
}
