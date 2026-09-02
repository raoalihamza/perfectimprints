import { createClient, type SanityClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? 'placeholder';
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
const apiVersion = '2024-10-01';

export const client: SanityClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  perspective: 'published',
});

// Q-175 removed `previewClient` (a tokened `perspective: 'previewDrafts'` client)
// and the `getClient(preview)` selector. Nothing imported either - verified by
// search across app/, components/, lib/, scripts/ and sanity/ before deleting.
// The reason is not tidiness: that client read UNPUBLISHED drafts and carried a
// write token, so wiring it into a render path by mistake would have published
// Patrick's drafts to the world. Deleting it removes the possibility rather than
// relying on nobody making that mistake. If drafts preview is ever wanted, build
// it deliberately behind an auth check, not by reviving a stray export.

/**
 * Cache-able published client for the `/cat/<slug>` render path. `useCdn: false`
 * is REQUIRED for Next.js fetch caching — the CDN client ignores `next` tag
 * options. Reads through this client pass `{ next: { tags, revalidate } }` so
 * they are tagged + statically prerenderable (not `no-store`), keeping the
 * category route static-generatable while the webhook revalidates by tag.
 */
export const cachedClient: SanityClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  perspective: 'published',
});

const builder = imageUrlBuilder({ projectId, dataset });

export function urlForImage(source: unknown) {
  return builder.image(source as never);
}

/**
 * Safe image URL resolver. Returns `null` when the source has no asset ref (or
 * the builder throws) instead of crashing the render — a Sanity image object
 * that is `{ _type: 'image', alt }` with NO `asset` (e.g. a blog headerImage
 * that lost its asset during migration, or an editor who set alt but never
 * uploaded) would otherwise throw "Unable to resolve image URL from source" and
 * fail the whole prerender. Pass `apply` to chain sizing/crop on the builder.
 *
 * Prefer this over a bare `x ? urlForImage(x)…url() : null` — truthiness on the
 * image object is NOT enough; the asset ref must exist.
 */
export function buildImageUrl(
  source: unknown,
  apply: (b: ReturnType<typeof urlForImage>) => ReturnType<typeof urlForImage> = (b) => b,
): string | null {
  const ref = (source as { asset?: { _ref?: string } } | null | undefined)?.asset?._ref;
  if (!ref) return null;
  try {
    return apply(urlForImage(source)).url();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// IMG-120: rendered Sanity images ask the CDN for a modern format.
//
// The Sanity image CDN does not content-negotiate by itself: without
// `auto=format` a JPEG upload is served as JPEG to every browser, WebP-capable
// or not (PORT-000 measured the same URL with and without an `Accept:
// image/webp` header and got byte-identical JPEG both times). `auto=format`
// lets the CDN answer with WebP/AVIF where the browser accepts it, which on
// /new-products cut the 58 unique card images from 982,647 to 737,761 bytes.
//
// Use these two for anything that ends up in an `<img>` (or a CSS background).
// Do NOT use them for og:image / twitter:image, JSON-LD image URLs, or sitemap
// image entries: social scrapers and image indexers handle format negotiation
// inconsistently, and those surfaces must resolve to the same bytes for every
// fetcher. Those call sites keep the plain `buildImageUrl` / `urlForImage`
// above, and the structured-data boundary strips the parameter defensively
// (lib/sanity/image-format.ts `withoutAutoFormat`) for the one URL that feeds
// both a card and a schema: `GeigerProduct.imageUrl` from the card normalisers.
// ---------------------------------------------------------------------------

/** `urlForImage` with `auto=format` applied. For rendered images only. */
export function urlForRenderImage(source: unknown) {
  return urlForImage(source).auto('format');
}

/** `buildImageUrl` with `auto=format` applied. For rendered images only. */
export function buildRenderImageUrl(
  source: unknown,
  apply: (b: ReturnType<typeof urlForImage>) => ReturnType<typeof urlForImage> = (b) => b,
): string | null {
  return buildImageUrl(source, (b) => apply(b).auto('format'));
}
