import { createClient, type SanityClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import { isConfiguredSanityProject, SanityReadTokenMissingError } from './read-access';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? 'placeholder';
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
const apiVersion = '2024-10-01';

// SEC-100: the dataset is PRIVATE, so every read carries this server-only
// token. This line is the ONLY place in app/, components/ or lib/ that reads
// the variable (asserted by lib/sanity/read-access.test.ts), and the name
// must never gain a NEXT_PUBLIC_ prefix: that would ship it to every browser.
// No client component can reach this module (also asserted), and Next inlines
// only NEXT_PUBLIC_ variables into browser bundles, so the value stays on the
// server. Role: Viewer. It CAN read drafts, which is why `perspective:
// 'published'` below is load-bearing and must never be removed or overridden
// per query: at this apiVersion a token-bearing client defaults to `raw`.
const readToken = process.env.SANITY_API_READ_TOKEN?.trim() || undefined;

/** True when this server has a read token (the prebuild check and the health check say so in words). */
export const sanityReadTokenConfigured = readToken !== undefined;

// SEC-100 removed `client`, the tokenless CDN client. Its only user was the
// prebuild script scripts/build-custom-category-slugs.ts, now on the read
// client below. A tokenless client is exactly what returns an EMPTY answer
// from a private dataset, so keeping one around is keeping the trap.

// Q-175 removed `previewClient` (a tokened `perspective: 'previewDrafts'` client)
// and the `getClient(preview)` selector. Nothing imported either - verified by
// search across app/, components/, lib/, scripts/ and sanity/ before deleting.
// The reason is not tidiness: that client read UNPUBLISHED drafts and carried a
// write token, so wiring it into a render path by mistake would have published
// Patrick's drafts to the world. Deleting it removes the possibility rather than
// relying on nobody making that mistake. If drafts preview is ever wanted, build
// it deliberately behind an auth check, not by reviving a stray export.

/**
 * THE read client: every Sanity read on the site goes through it (73 fetch
 * calls in 29 modules when SEC-100 was written). `useCdn: false` is REQUIRED
 * for Next.js fetch caching: the CDN client ignores `next` tag options. Reads
 * pass `{ next: { tags, revalidate } }` so they are tagged and statically
 * prerenderable (not `no-store`), and the webhook revalidates by tag.
 *
 * The token does not change caching. Measured in Next 16.2.6's patch-fetch:
 * an `Authorization` header only turns caching off when the route is already
 * dynamic (`revalidate === 0`), and an explicit `next.revalidate` keeps the
 * fetch cached either way. The header is part of the fetch cache key, so the
 * deploy that adds (or rotates) the token costs one cold fetch per key.
 *
 * With a real project configured and NO token, `fetch` throws
 * `SanityReadTokenMissingError` instead of sending an anonymous query: an
 * anonymous query against the private dataset would get HTTP 200 and an empty
 * result, which every caller would render (and Next would cache) as an empty
 * page. The CI build uses the `placeholder` project and so is unaffected.
 */
export const cachedClient: SanityClient = guardReadClient(
  createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: false,
    perspective: 'published',
    ...(readToken ? { token: readToken } : {}),
  }),
);

function guardReadClient(base: SanityClient): SanityClient {
  if (readToken || !isConfiguredSanityProject(projectId)) return base;
  return new Proxy(base, {
    get(target, prop) {
      if (prop === 'fetch') return () => Promise.reject(new SanityReadTokenMissingError());
      // Bound to the real client: its methods use private fields, which a
      // Proxy receiver cannot reach.
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

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
