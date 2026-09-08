/**
 * Image sizing rules for the Portfolio Gallery tiles and lightbox (PORT-110;
 * fit instead of crop since PORT-150).
 *
 * WHY THIS EXISTS. Every rendered portfolio image, tile and lightbox alike,
 * is requested from Sanity with `fit=max` at its natural aspect, and the tile
 * shows the WHOLE picture inside a fixed square box with CSS
 * `object-fit: contain`, the box's own white background filling whatever the
 * picture does not (PORT-150). `fit=max` is the ONE Sanity request mode
 * measured never to upscale, which is why it is the only mode used here:
 * IMG-110 found a plain `w=1200` fabricating a 1200x1200 from a 768px asset;
 * PORT-110 measured `fit=crop` doing the same on 2026-09-02 (a 1200x1200
 * asset asked for `w=1600&h=1600&fit=crop` came back 1600x1600, a 1661x947
 * asset asked for `w=1000&h=1000&fit=crop` came back 1000x1000); and
 * PORT-150 measured `fit=fill`, the CDN's own letterbox mode, doing it too
 * on 2026-09-08 (the 1661x947 asset asked for `w=2000&h=2000&fit=fill&bg=ffffff`
 * came back 2000x2000 at 3.91 MB against 2.38 MB for its true size under
 * `fit=max`; a 1500x1500 asset asked for `w=1600&h=2000&fit=fill` came back
 * 1600x2000). `fit=max` on the same assets returned 1661x947 and 1500x1500.
 * So the padding is done by the tile in CSS, never by the CDN, and no
 * request for a portfolio image ever names a height.
 *
 * The width clamp (`widthsWithin`) stays. With `fit=max` the CDN would not
 * upscale an oversized request, but a srcset advertising 960 for a 726px-wide
 * asset lies to the browser about what the candidates hold (two candidates
 * that resolve to the same bytes), so every candidate is compared against
 * the (cropped) asset WIDTH and anything larger is dropped. The intrinsic
 * size comes from the asset id itself, which Sanity writes as
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
 * The tile box's aspect ratio, width over height. 1 is a square, and it is
 * the CSS class `aspect-square` on the grid tile (PortfolioGrid); change the
 * two together. PORT-150 measured the 38-image PORT-140 set against a square
 * box and a 4:5 box (the fraction of the box a whole fitted image fills is
 * min(image aspect, box aspect) / max(image aspect, box aspect)): square
 * averages 87.4% with a median of 95.3%, 4:5 averages 78.8% with a median of
 * 80.0%, because 15 of the 38 are exactly square and 12 more are within 10%
 * of it; 4:5 only helps the three bottle photographs (32/34/39% to 40/42/49%)
 * and costs every square image a fifth of its tile. The square stays.
 */
export const TILE_BOX_ASPECT = 1;

/**
 * The fraction of the tile's WIDTH a whole image occupies once fitted inside
 * the box (`object-fit: contain`): an image at least as wide as the box's
 * aspect spans the full width (1) and leaves space above and below; a taller
 * one spans the full height and its width is image aspect / box aspect. The
 * 726x2252 bottle photograph is 0.322 of a square tile wide. Three decimals;
 * an unusable box counts as 1 (the safe over-statement).
 */
export function fittedWidthFraction(box: ImageBox, boxAspect: number = TILE_BOX_ASPECT): number {
  if (!(box.width > 0) || !(box.height > 0) || !(boxAspect > 0)) return 1;
  const fraction = box.width / box.height / boxAspect;
  if (!Number.isFinite(fraction) || fraction >= 1) return 1;
  return Math.max(0.001, Math.round(fraction * 1000) / 1000);
}

/** Split on the commas that separate `sizes` clauses, not the ones inside min() or calc(). */
function splitSizesClauses(sizes: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < sizes.length; i++) {
    const c = sizes[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(sizes.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(sizes.slice(start).trim());
  return parts.filter(Boolean);
}

/**
 * A `sizes` attribute whose every length is multiplied by `fraction`, for a
 * tile whose fitted image is narrower than the box (PORT-150). `sizes` tells
 * the browser the DISPLAYED width; a tall image displayed 96px wide in a
 * 300px tile would otherwise fetch the candidate for 300px, and with the
 * tile candidates now at natural aspect that is 640x1985 pixels for a
 * 96x300 rendering. Each clause keeps its media condition and wraps its
 * length as `calc(<length> * <fraction>)` (nesting an existing calc() or
 * min() inside calc() is valid CSS). A fraction of 1 or more returns the
 * attribute unchanged, so a square or wide image pays nothing.
 */
export function scaleSizes(sizes: string, fraction: number): string {
  if (!(fraction > 0) || fraction >= 1 || !Number.isFinite(fraction)) return sizes;
  const factor = Math.round(fraction * 1000) / 1000;
  return splitSizesClauses(sizes)
    .map((clause) => {
      let media = '';
      let length = clause;
      if (clause.startsWith('(')) {
        let depth = 0;
        for (let i = 0; i < clause.length; i++) {
          if (clause[i] === '(') depth++;
          else if (clause[i] === ')' && --depth === 0) {
            media = clause.slice(0, i + 1);
            length = clause.slice(i + 1).trim();
            break;
          }
        }
      }
      return `${media ? media + ' ' : ''}calc(${length} * ${factor})`;
    })
    .join(', ');
}

/**
 * Tile widths, as device pixels of the tile BOX's width. The grid is 2
 * columns under 768px, 3 to 1279px and 4 above (see PortfolioGrid), so a
 * tile is roughly 160 to 400 CSS px wide. 320 and 480 serve 1x and 2x phones
 * and the 1x desktop tile, 640 and 800 serve 2x tablets and desktops, 960
 * serves a 3x phone or a 2x wide tablet. Nothing above 960: no tile is ever
 * laid out wider than 480 CSS px. A fitted image narrower than the box has
 * its `sizes` scaled down (`scaleSizes`), so these candidates still cover it
 * from the small end.
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
