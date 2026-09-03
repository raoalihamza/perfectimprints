/**
 * Image sizing rules for the Portfolio Gallery tiles and lightbox (PORT-110).
 *
 * WHY THIS EXISTS. The grid tile is a square crop (the hotspot Patrick drags
 * in Studio decides what stays in view), and `fit=max` is the ONE Sanity
 * request mode measured NOT to upscale; the default mode upscales (IMG-110
 * found a plain `w=1200` fabricating a 1200x1200 from a 768px asset) and so
 * does `fit=crop`. Measured against the live CDN on 2026-09-02: a 1200x1200
 * asset asked for `w=1600&h=1600&fit=crop` came back as a fabricated
 * 1600x1600, and a 1661x947 asset asked for `w=1000&h=1000&fit=crop` came
 * back 1000x1000 although it is only 947 tall. `fit=max` never upscales (the
 * same 1200 asset asked for `w=1600&fit=max` came back 1200, and the wide one
 * asked for `w=2000&fit=max` came back at its true 1661x947), which is the
 * IMG-110 guard. So for a square tile the clamp to the asset's own pixels is
 * LOAD-BEARING, not a belt: every candidate width is compared against the
 * shorter side of the (cropped) asset and anything larger is dropped.
 *
 * The intrinsic size comes from the asset id itself, which Sanity writes as
 * `image-<sha1>-<width>x<height>-<ext>`; the image URL builder parses the
 * very same id to make a URL at all, so an id this module cannot read is one
 * no URL could be built for either.
 *
 * Pure on purpose: no fs, no Sanity client, no React, so it is unit tested
 * directly and can be imported by anything.
 */

export interface ImageBox {
  width: number;
  height: number;
}

export interface SanityImageRefInfo extends ImageBox {
  extension: string;
}

/** Sanity's stored crop: fractions (0 to 1) of each edge to remove. */
export interface ImageCropFractions {
  top?: number | null;
  bottom?: number | null;
  left?: number | null;
  right?: number | null;
}

const REF_PATTERN = /^image-[a-f0-9]+-(\d+)x(\d+)-([a-z0-9]+)$/i;

/** Read `{ width, height, extension }` out of a Sanity image asset id, or null. */
export function parseSanityImageRef(
  ref: string | null | undefined,
): SanityImageRefInfo | null {
  if (!ref) return null;
  const match = REF_PATTERN.exec(ref.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height, extension: match[3].toLowerCase() };
}

function fraction(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 0.99);
}

/**
 * The pixel box left after Sanity's crop is applied (the URL builder emits
 * the same crop as a `rect=` parameter, so this is the box every later
 * width is measured against). No crop, or an unusable one, means the whole
 * asset. Never smaller than 1x1.
 */
export function croppedImageBox(box: ImageBox, crop?: ImageCropFractions | null): ImageBox {
  if (!crop) return { width: box.width, height: box.height };
  const horizontal = Math.min(fraction(crop.left) + fraction(crop.right), 0.99);
  const vertical = Math.min(fraction(crop.top) + fraction(crop.bottom), 0.99);
  return {
    width: Math.max(1, Math.floor(box.width * (1 - horizontal))),
    height: Math.max(1, Math.floor(box.height * (1 - vertical))),
  };
}

/**
 * Square tile widths. The grid is 2 columns under 768px, 3 to 1279px and 4
 * above (see PortfolioGrid), so a tile is roughly 160 to 400 CSS px wide.
 * 320 and 480 serve 1x and 2x phones and the 1x desktop tile, 640 and 800
 * serve 2x tablets and desktops, 960 serves a 3x phone or a 2x wide tablet.
 * Nothing above 960: no tile is ever laid out wider than 480 CSS px.
 */
export const TILE_WIDTHS: readonly number[] = [320, 480, 640, 800, 960];

/**
 * Lightbox widths, `fit=max` (natural aspect, never upscaled). 800 covers a
 * 1x phone or small laptop, 1200 a 2x phone or 1x desktop, 1600 a 2x laptop.
 * Nothing above 1600: the lightbox image is capped at 70vh, so on a 2x 1440p
 * display it is at most about 1600 device pixels wide.
 */
export const LIGHTBOX_WIDTHS: readonly number[] = [800, 1200, 1600];

/**
 * The `sizes` attribute matching PortfolioGrid's columns AND the page layout
 * around it: 2 columns full width under 768px, 3 columns full width to
 * 1023px, then from 1024px the 260px filter sidebar + 32px gap + 64px page
 * padding come off the width before the 3 columns share it (388px in all),
 * and from 1280px the 4-column tile is about 220 to 285 CSS px, so a fixed
 * 300px is honest there. Without the sidebar clause a 2x tablet at 1024px
 * would fetch the 800 candidate for a 212px tile.
 */
export const TILE_SIZES =
  '(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) calc((100vw - 388px) / 3), 300px';

/**
 * The widest content column each PORT-120 host lays the gallery block in, in
 * CSS px, measured from the host's own layout classes with the compiled
 * Tailwind values (the container is `max-w-screen-2xl` = 1536 with 32px of
 * padding a side from `lg`):
 *   - `section`: the page-builder SectionShell (`max-w-5xl`), used by
 *     ordinary pages, /services pages and the landing-page template;
 *   - `blog`: the article column of /blog/<slug>, which is the container
 *     minus the 48px share rail, the 280px sidebar and two 40px gaps;
 *   - `product`: /products/<slug>, whose content runs the full container;
 *   - `video`: the `max-w-4xl` column of /videos/<slug>.
 */
export const PORTFOLIO_EMBED_COLUMN_WIDTHS = {
  section: 1024,
  blog: 1064,
  product: 1472,
  video: 896,
} as const;

export type PortfolioEmbedHost = keyof typeof PORTFOLIO_EMBED_COLUMN_WIDTHS;

/** The gaps PortfolioGrid puts between tiles from `sm` (gap-4 = 16px). */
const TILE_GAP = 16;

/**
 * The `sizes` attribute for a gallery EMBEDDED in a content column
 * (PORT-120). The srcset candidates do not change (TILE_WIDTHS already spans
 * 1x to 3x of any tile the grid lays out); what changes is how wide the
 * browser is told the tile will be, because inside a column the tile is a
 * fraction of the COLUMN, not of the viewport. Under 768px and under 1024px
 * every host column is the full viewport minus padding, so the 2- and
 * 3-column clauses are the ones the /portfolio page uses; from 1024px the
 * column is capped at the host's width, so the 3- and 4-column clauses are
 * the smaller of the viewport share and the column's own share (`min()`,
 * which every browser that reads `sizes` at all has supported since 2020; an
 * older one ignores the attribute and falls back to 100vw, the old
 * behaviour, so nothing is worse for it). The blog column is narrower than
 * its share between 1024 and 1279px because the page grid also holds the
 * sidebar there; the 3-column clause over-states it by one srcset step at
 * 2x on that one range, a bounded over-fetch that never changes layout and
 * never upscales.
 */
export function embeddedTileSizes(host: PortfolioEmbedHost): string {
  const column = PORTFOLIO_EMBED_COLUMN_WIDTHS[host];
  const threeUp = Math.floor((column - 2 * TILE_GAP) / 3);
  const fourUp = Math.floor((column - 3 * TILE_GAP) / 4);
  return (
    `(max-width: 767px) 50vw, (max-width: 1023px) 33vw, ` +
    `(max-width: 1279px) min(33vw, ${threeUp}px), min(25vw, ${fourUp}px)`
  );
}

/**
 * Fallback `sizes` for the lightbox image when the aspect is unknown. The
 * per-tile value comes from `lightboxSizesFor`, which is what the page uses.
 */
export const LIGHTBOX_SIZES = '100vw';

/**
 * The lightbox `sizes` for a known aspect. The viewer renders the image at
 * most 70vh tall and inside a row that spends about 168px on the two arrow
 * buttons, gaps and page padding, so its displayed width is the smaller of
 * those two limits. Stating both stops a tall portrait photo fetching the
 * 1600 candidate when it can only ever be 360 CSS px wide. A browser that
 * does not understand `min()` in `sizes` ignores the attribute and falls back
 * to 100vw, which is the old behaviour, so nothing is worse for it.
 */
export function lightboxSizesFor(box: ImageBox): string {
  if (!(box.width > 0) || !(box.height > 0)) return LIGHTBOX_SIZES;
  const ratio = Math.round((box.width / box.height) * 1000) / 1000;
  return `min(calc(100vw - 168px), calc(70vh * ${ratio}))`;
}

/**
 * Keep the candidate widths that do not exceed `max`, and when none does
 * (an asset smaller than the smallest candidate) return `max` itself so the
 * asset is still served at its own true size. `max` of null or non-finite
 * means "unknown", which returns every candidate unchanged; callers must then
 * use a fit mode that cannot upscale (`fit=max`).
 */
export function widthsWithin(candidates: readonly number[], max: number | null | undefined): number[] {
  if (typeof max !== 'number' || !Number.isFinite(max)) return [...candidates];
  const ceiling = Math.max(1, Math.floor(max));
  const within = candidates.filter((w) => w <= ceiling);
  return within.length > 0 ? within : [ceiling];
}

/**
 * The width to name in `src`: the largest candidate that does not exceed
 * `preferred`, else the smallest candidate. `src` is only the fallback for a
 * browser with no `srcset` support, so a mid-size choice is right.
 */
export function pickSrcWidth(widths: readonly number[], preferred: number): number {
  const sorted = [...widths].sort((a, b) => a - b);
  let chosen = sorted[0];
  for (const w of sorted) if (w <= preferred) chosen = w;
  return chosen;
}

/** `url 320w, url 480w, ...` from `{ url, width }` entries. */
export function buildSrcSet(entries: readonly { url: string; width: number }[]): string {
  return entries.map((e) => `${e.url} ${e.width}w`).join(', ');
}
