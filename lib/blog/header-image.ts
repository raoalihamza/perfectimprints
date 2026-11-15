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

// -- The title on a generated picture, and the picture's size --------------------

/**
 * Is the picture ON the post one the header engine made and put a title on?
 * Its asset id says so (the id carries the size and the format):
 *   - AUTO-220: the image model draws at 1536 x 864 and the stamped picture is
 *     a PNG, so the id ends `-1536x864-png` (`-1536x864-jpg` when the mark
 *     could not be stamped and the model's own bytes were stored);
 *   - AUTO-209 to AUTO-212: the old composites, 1376 x 768 PNGs.
 * Measured 2026-11-05: none of Patrick's hand-made headers has either size
 * (JPEGs and AVIFs of 1661 x 947, 1774 x 887 and similar).
 *
 * Why it matters. When Patrick replaces a generated header in Studio, Studio
 * swaps the asset and KEEPS the fields beside it (`titleOnImage`,
 * `unmarkedImage`, `ladderRung`). So "the picture shows an old title" must
 * be said only when the picture on the post is still ours; his own upload
 * must never be flagged. A cheap gate for the Studio warning; the server's
 * upload-marker check (header-edit-base.ts) is the rule for anything that
 * writes.
 */
export function isGeneratedTitledHeaderRef(ref: unknown): boolean {
  return typeof ref === 'string' && /^image-[A-Za-z0-9]+-(?:1536x864-(?:png|jpg)|1376x768-png)$/.test(ref);
}

/**
 * The post's title no longer matches the title ON its header picture. Returns
 * the Studio warning to show, or null when they agree or the picture carries
 * no title. Compared ignoring case, spacing and the two shapes of apostrophe
 * and quote, so only an EDIT warns. AUTO-220: the image model draws the
 * title, so the fix is a new picture; there is no redraw.
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
  return `The header picture shows the title "${titleOnImage.trim()}", which no longer matches this post's title. The title is part of the picture, so press "Generate another header image" for a new picture with the current title (or upload your own).`;
}

/**
 * Whether the SOCIAL image (og:image, twitter:image) must be asked for as a
 * JPEG. The social image is served without `auto=format` (IMG-120: scrapers
 * cache what they get), so the CDN returns the asset's own format, and only a
 * JPEG is both small and shown everywhere: a generated header is a PNG (1.1 MB
 * at 1200 wide against 67 KB as a JPEG, measured AUTO-209), and X does not
 * show an AVIF or WebP card image at all. A header that already IS a JPEG is
 * requested exactly as before, so its URL does not change. AUTO-220: this was
 * a `-png$` test, true only for the engine's own pictures.
 */
export function socialImageNeedsJpeg(ref: unknown): boolean {
  if (typeof ref !== 'string' || !ref) return false;
  const m = /-([a-z0-9]+)$/i.exec(ref);
  const format = m ? m[1].toLowerCase() : '';
  return format !== 'jpg' && format !== 'jpeg';
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
