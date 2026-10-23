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

// -- AUTO-209: the title on the picture, and the picture's size ------------------

/**
 * The post's title no longer matches the title drawn ON its header picture
 * (AUTO-209). Returns the Studio warning to show, or null when they agree or
 * the picture carries no title. Compared ignoring case, spacing and the two
 * shapes of apostrophe and quote, because the drawn title is the stored title
 * exactly and only an EDIT should warn.
 */
export function titleOnImageDrift(titleOnImage: unknown, title: unknown): string | null {
  if (typeof titleOnImage !== 'string' || typeof title !== 'string') return null;
  const fold = (t: string) =>
    t
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const drawn = fold(titleOnImage);
  if (!drawn || drawn === fold(title)) return null;
  return `The header picture shows the title "${titleOnImage.trim()}", which no longer matches this post's title. Press "Redraw title on header image" (free, a few seconds) to put the current title on the same picture, or Generate another header image for a new picture.`;
}

/**
 * The size the header `<img>` is rendered at (AUTO-209 Part 7; Section 12
 * wants explicit dimensions so the page does not shift while it loads): the
 * asset's own pixel size, read from its id (`image-<sha>-<w>x<h>-<ext>`, the
 * same id the URL builder parses), scaled to `width`, with the Studio crop
 * frame taken off first the way the URL builder applies it; a square
 * `width x width` for the hot-linked Geiger photo (Geiger's variants are
 * square); null when nothing can be told, and the `<img>` is then as it was.
 */
export function headerImageRenderSize(
  post:
    | (BlogHeaderImageFields & {
        headerImage?: { crop?: { top?: number; bottom?: number; left?: number; right?: number } | null } | null;
      })
    | null
    | undefined,
  width: number,
): { width: number; height: number } | null {
  const ref = post?.headerImage?.asset?._ref;
  if (typeof ref === 'string' && ref) {
    const m = /-(\d+)x(\d+)-[a-z0-9]+$/.exec(ref);
    if (!m) return null;
    const crop = post?.headerImage?.crop ?? null;
    const frac = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1 ? v : 0);
    const w = Number(m[1]) * (1 - frac(crop?.left) - frac(crop?.right));
    const h = Number(m[2]) * (1 - frac(crop?.top) - frac(crop?.bottom));
    if (!(w > 0) || !(h > 0)) return null;
    return { width, height: Math.round((width * h) / w) };
  }
  return externalHeaderImageUrl(post, width) ? { width, height: width } : null;
}
