/**
 * The blog header image a reader shows (AUTO-202). A post carries its header
 * in one of two shapes, and the readers (the post page, its social card and
 * BlogPosting image, the blog cards, the related-posts row) prefer the first:
 *
 *   - `headerImage`, a Sanity image asset: Patrick's own upload, the AI
 *     generated picture, or a picture from the header image library; or
 *   - `externalHeaderImage`, `{ url, alt }`, a HOT-LINKED picture on Geiger's
 *     image server: the post's first product photo, the LAST fallback of the
 *     header image chain. It is a link and not an upload because Section 18
 *     forbids copying Geiger product images onto this site's origin (brand
 *     logos excepted), and Section 8 says hot-linking them is what Patrick is
 *     permitted to do as a distributor. So a product photo can only ever be
 *     a header this way.
 *
 * Pure, no imports: the Studio bundle, the server components and the tests
 * all take it. `geigerImageVariant` is the one Geiger size rewrite on the
 * site; `lib/seo/open-graph.ts` imports it for the social image.
 */

export interface ExternalHeaderImage {
  url?: string | null;
  alt?: string | null;
}

export interface BlogHeaderImageFields {
  headerImage?: { asset?: { _ref?: string | null } | null } | null;
  externalHeaderImage?: ExternalHeaderImage | null;
}

/** Only this host's URLs are ever shown from a hot link; anything else is dropped. */
export const GEIGER_IMAGE_HOST = 'imgsirv.geiger.com';

/** The Geiger CDN URL at a given square size (the social-image rewrite); other hosts unchanged. */
export function geigerImageVariant(url: string, px: number): string {
  if (!/imgsirv\.geiger\.com/i.test(url)) return url;
  return url.replace(/\b(thumbnail|w|h)=\d+/gi, `$1=${px}`);
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** True when the post has an uploaded or generated header asset, which always wins. */
export function hasHeaderAsset(post: BlogHeaderImageFields | null | undefined): boolean {
  return Boolean(post?.headerImage?.asset?._ref);
}

/**
 * The hot-linked header image URL at `px` wide, or null: null when the post
 * has a header ASSET (the asset wins), when there is no external URL, or when
 * the URL is not an https Geiger image URL (a value nothing on this site ever
 * writes, refused rather than rendered).
 */
export function externalHeaderImageUrl(post: BlogHeaderImageFields | null | undefined, px: number): string | null {
  if (hasHeaderAsset(post)) return null;
  const url = post?.externalHeaderImage?.url?.trim();
  if (!url) return null;
  if (hostOf(url) !== GEIGER_IMAGE_HOST) return null;
  return geigerImageVariant(url, px);
}

/** The alt text stored beside the hot link, or null. */
export function externalHeaderImageAlt(post: BlogHeaderImageFields | null | undefined): string | null {
  const alt = post?.externalHeaderImage?.alt?.trim();
  return alt ? alt : null;
}
