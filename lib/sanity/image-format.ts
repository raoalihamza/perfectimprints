/**
 * IMG-120: the one place that knows which Sanity image URLs may ask the CDN
 * for a modern format, and which must not.
 *
 * The Sanity image CDN does NOT content-negotiate on its own. PORT-000
 * measured it: the same URL requested with `Accept: image/webp` comes back as
 * `image/jpeg`, byte for byte. WebP (or AVIF) is served ONLY when the URL
 * carries `auto=format`, at which point the CDN picks the best format the
 * requesting browser accepts. Across the 58 unique images on /new-products
 * that was 982,647 bytes down to 737,761, a 24 percent saving one parameter
 * away, and the page-builder images (SectionImage, portable-text) had been
 * quietly carrying the parameter since they were written.
 *
 * So every RENDERED Sanity image now asks for it, through the two helpers in
 * lib/sanity/client.ts (`urlForRenderImage` / `buildRenderImageUrl`). What
 * does NOT ask for it, on purpose:
 *
 *  - og:image / twitter:image. Social scrapers fetch these with their own
 *    Accept headers and cache aggressively; a served JPEG is the format every
 *    one of them handles, and X in particular has a history of dropping cards
 *    whose image format it did not expect. Those call sites keep the plain
 *    `buildImageUrl`.
 *  - JSON-LD `image` / `ImageObject.contentUrl`. Google fetches these to
 *    verify them, and the SNIP-172 / FIX-830 work fixed real format problems
 *    there (AVIF schema images). A structured-data URL must resolve to the
 *    same bytes for every fetcher, which `auto=format` by definition does not.
 *  - Sitemap `<image:loc>` entries, for the same reason.
 *
 * `withoutAutoFormat` is the belt for the last two: a `GeigerProduct.imageUrl`
 * produced by the Sanity card normalisers is ONE string that feeds both the
 * `<img>` and the structured data, so the render side carries `auto=format`
 * and the schema side strips it at the ONE boundary where those URLs enter
 * JSON-LD (`schemaImageUrl` in the product serializer, and
 * `collectionPageSchema` for the category image). A Geiger URL never carries
 * the parameter and is returned byte-identical.
 */

/**
 * Remove a Sanity CDN `auto` query parameter (`auto=format`), leaving every
 * other parameter, their order, and any non-Sanity URL exactly as they were.
 * Returns the input unchanged when there is nothing to remove.
 */
export function withoutAutoFormat<T extends string | null | undefined>(url: T): T {
  if (!url || !/[?&]auto=/i.test(url)) return url;
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return url;
  }
  if (host !== 'cdn.sanity.io') return url;
  const stripped = url
    .replace(/([?&])auto=[^&#]*(&|(?=#)|$)/gi, (_m, lead: string, trail: string) =>
      trail === '&' ? lead : '',
    )
    .replace(/\?(#|$)/, '$1');
  return stripped as T;
}
