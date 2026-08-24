import 'server-only';

import type { PortableTextBlock } from '@portabletext/react';
import type { GeigerProduct } from '@/lib/product-types';
import {
  dedupeProductsBySku,
  resolveStripCards as resolvePureStripCards,
  stripCardProducts,
  type StripCard,
  type StripCardContext,
} from '@/lib/products/strip-cards';
import { customProductToGeigerProduct } from './custom-products';
import { productPageToGeigerProduct } from './product-pages';
import type {
  StripProductEntry,
  StripProductRefEntry,
} from '@/lib/sanity/strip-product-entries';

/** A `blogProducts` block as projected by getBlogPostBySlug (entries dereferenced in place). */
export interface BlogProductsBlock {
  _type: 'blogProducts';
  _key?: string;
  heading?: string;
  /** SKU/manual entries + dereferenced productPage/customProduct refs (null = dangling ref). */
  products?: (StripProductEntry | null)[];
}

/**
 * Normalize a dereferenced strip reference (productPage / customProduct) into
 * the GeigerProduct contract so the strip renderers (blog body, page
 * productStrip, landing, video) hand it to the shared ProductCard:
 *   - productPage → internal card (`detailUrl` = /products/<slug>, same tab);
 *   - customProduct → affiliate/external card (its externalUrl, new tab).
 *
 * Returns null for anything that can't render a working card — a productPage
 * missing its slug (the detail link would 404) or a customProduct missing its
 * externalUrl (ProductCard would link to the bare affiliate homepage). Callers
 * DROP null results rather than rendering a broken card.
 *
 * Server-only: the converters live in server-only query modules — fine, since
 * every strip renderer is a server component.
 */
export function stripRefToGeigerProduct(entry: StripProductRefEntry): GeigerProduct | null {
  if (entry._type === 'productPage') {
    if (!entry._id || !entry.title || !entry.slug) return null;
    return productPageToGeigerProduct(entry);
  }
  if (!entry._id || !entry.title || !entry.externalUrl) return null;
  return customProductToGeigerProduct({
    ...entry,
    title: entry.title,
    externalUrl: entry.externalUrl,
  });
}

// ---------------------------------------------------------------------------
// SNIP-150: the server-side binding of the shared strip resolver.
// ---------------------------------------------------------------------------

/** The per-strip inputs a page already holds; `resolveRef` is bound here. */
export type StripResolveContext = Omit<StripCardContext, 'resolveRef'>;

/**
 * Resolve one strip's entries into the ordered cards it renders, with the
 * reference normalizer above bound in. This is what the blog body, the
 * page-builder ProductStrip, the video strip AND the blog post's structured
 * data call, so the cards a reader sees and the products Google is told about
 * come from one list. Pure apart from that binding; see lib/products/strip-cards.ts.
 */
export function resolveStripCards(
  entries: readonly (StripProductEntry | null)[],
  ctx: StripResolveContext,
): StripCard[] {
  return resolvePureStripCards(entries, { ...ctx, resolveRef: stripRefToGeigerProduct });
}

/** The `blogProducts` blocks of a blog body, in document order. */
export function blogProductsBlocks(
  body: readonly PortableTextBlock[] | undefined,
): BlogProductsBlock[] {
  if (!body) return [];
  const out: BlogProductsBlock[] = [];
  for (const block of body) {
    const b = block as { _type?: string };
    if (b._type === 'blogProducts') out.push(block as unknown as BlogProductsBlock);
  }
  return out;
}

/**
 * Every GeigerProduct the strips of a blog body render, in reading order and
 * each product once (SNIP-150). The blog post page hands this to the shared
 * `productItemListSchema`, and because it is built by the SAME
 * `resolveStripCards` call the BlogBody renderer makes for each block, with
 * the same inputs, a hidden or replaced SKU is absent from both or neither.
 */
export function collectBlogStripProducts(
  body: readonly PortableTextBlock[] | undefined,
  ctx: StripResolveContext,
): GeigerProduct[] {
  const products: GeigerProduct[] = [];
  for (const block of blogProductsBlocks(body)) {
    products.push(...stripCardProducts(resolveStripCards(block.products ?? [], ctx)));
  }
  return dedupeProductsBySku(products);
}
