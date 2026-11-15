/**
 * Where the P! mark goes on a header picture and which colours it takes
 * (AUTO-220). PURE: no next/*, no fs, no network; stamp-mark.tsx samples the
 * picture and draws what this module decides.
 *
 * WHY CODE STAMPS IT. None of the 35 pictures CHECK-image-brief-26 measured
 * carried the mark, Patrick's own recent headers all do, and he was adding it
 * by hand. The image model cannot be relied on to draw a logo it has never
 * seen, so the mark is put on afterwards, by code, from the site's own SVG.
 *
 * THE CORNER. The model usually draws the title across the top and stands the
 * products along the bottom, so no corner is always free. The two bottom
 * corners are measured on the sampled picture and the calmer one is taken
 * (the bottom right when they are about the same, where Patrick's own headers
 * carry it); a top corner is used only when both bottom corners are busy and a
 * top one is calm. "Calm" is the spread of brightness under the mark: a plain
 * floor, wall or colour band is calm, a product or lettering is not.
 *
 * THE COLOURS. The mark is the P in ink and the ! in red. Whichever of the
 * four variants (header-mark.ts) reads best against the colour under it is
 * used: the brand's own two (ink and red on a light corner, white and red on
 * a dark one) when both parts stand out, else one colour, white or ink,
 * whichever has more contrast (a red band would swallow the red !).
 *
 * A BUSY CORNER GETS AN OUTLINE. When even the calmer corner holds something
 * (the first real poster had pumpkins and leaves in both bottom corners, and
 * a bare dark mark over them half vanished), an average colour says nothing
 * about what is under each stroke of the mark, so the mark keeps the brand's
 * own colours and a thin outline hugging its letterforms is drawn under it:
 * light under the dark mark, dark under the white one. Not a box, not a
 * pill (AUTO-210 rejected the white pill): it follows the P and the !.
 *
 * THE MARK IS NEVER CLIPPED. Its box sits a margin inside the frame on every
 * canvas; a test renders the stamp in every corner and fails if any ink
 * reaches the frame edge.
 */
import { HEADER_MARK_HALO_PAD, type HeaderMarkHalo, type HeaderMarkVariant } from './header-mark';

export interface Canvas {
  width: number;
  height: number;
}

/** A picture sampled to a coarse grid: sRGB channels 0..1, three a cell, row by row. */
export interface PixelGrid {
  width: number;
  height: number;
  rgb: ArrayLike<number>;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The mark's own shape (header-mark.ts HEADER_MARK_VIEWBOX '0 0 206 172'). */
export const MARK_ASPECT = 206 / 172;
/** The mark's width as a share of the picture's (110 px on the 1376 canvas it was first drawn on; 123 px on 1536). */
export const MARK_WIDTH_SHARE = 0.08;
/** The gap between the mark and the frame edge, as a share of the picture's width (54 px on 1536). */
export const MARK_MARGIN_SHARE = 0.035;

export type MarkCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export const MARK_CORNERS: readonly MarkCorner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

/** Above this spread of brightness a corner holds something (a product, lettering). */
export const MARK_BUSY = 0.16;
/** Below this a corner is plain. */
export const MARK_CALM = 0.07;
/** The bottom left is taken only when it is calmer than the bottom right by more than this. */
export const MARK_SIDE_TOLERANCE = 0.03;
/** Both of the brand's colours must stand out by at least this much (a contrast ratio) for the two-colour mark to be used. */
export const MARK_MIN_TWO_COLOUR_CONTRAST = 2.2;

export interface MarkPlacement {
  corner: MarkCorner;
  rect: Rect;
  variant: HeaderMarkVariant;
  /** The contrast ratio of the mark's weakest part against the colour under it; 0 when the picture could not be sampled. */
  contrast: number;
  /** The spread of brightness under the mark, 0 (flat) upwards; -1 when the picture could not be sampled. */
  busyness: number;
  /** The outline drawn under the mark in a busy corner; null in a calm one. */
  halo: HeaderMarkHalo | null;
}

/** The box the mark's SVG is drawn in: the mark's own box, grown all round by the outline's reach when it has one. */
export function markDrawRect(placement: Pick<MarkPlacement, 'rect' | 'halo'>): Rect {
  const r = placement.rect;
  if (!placement.halo) return r;
  const pad = (r.w / 206) * HEADER_MARK_HALO_PAD;
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

/** A busy corner: the brand's own colours over an outline, dark mark on a light or mid corner, white mark on a dark one. */
export function busyMarkStyle(background: number): { variant: HeaderMarkVariant; halo: HeaderMarkHalo; contrast: number } {
  const dark = background < 0.18;
  return dark
    ? { variant: 'white', halo: 'dark', contrast: contrastRatio(WHITE_LUMINANCE, INK_LUMINANCE) }
    : { variant: 'colour', halo: 'light', contrast: contrastRatio(INK_LUMINANCE, WHITE_LUMINANCE) };
}

/** The mark's box in one corner: MARK_WIDTH_SHARE wide, MARK_MARGIN_SHARE in from both edges, whole pixels. */
export function markRect(canvas: Canvas, corner: MarkCorner): Rect {
  const w = Math.round(canvas.width * MARK_WIDTH_SHARE);
  const h = Math.round(w / MARK_ASPECT);
  const margin = Math.round(canvas.width * MARK_MARGIN_SHARE);
  const x = corner.endsWith('right') ? canvas.width - margin - w : margin;
  const y = corner.startsWith('bottom') ? canvas.height - margin - h : margin;
  return { x, y, w, h };
}

function channel(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB colour (channels 0..1). */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio of two luminances. */
export function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

const INK_LUMINANCE = luminance(0x23 / 255, 0x1f / 255, 0x20 / 255);
const RED_LUMINANCE = luminance(0xea / 255, 0x29 / 255, 0x29 / 255);
const WHITE_LUMINANCE = 1;

export interface CornerReading {
  /** Mean luminance under the mark. */
  luminance: number;
  /** Standard deviation of the luminance under the mark. */
  busyness: number;
}

/** What is under the mark's box (with a quarter of its size added all round), read off the sampled grid. */
export function readCorner(grid: PixelGrid, canvas: Canvas, rect: Rect): CornerReading {
  const padX = rect.w * 0.25;
  const padY = rect.h * 0.25;
  const sx = grid.width / canvas.width;
  const sy = grid.height / canvas.height;
  const x0 = Math.max(0, Math.floor((rect.x - padX) * sx));
  const x1 = Math.min(grid.width - 1, Math.ceil((rect.x + rect.w + padX) * sx));
  const y0 = Math.max(0, Math.floor((rect.y - padY) * sy));
  const y1 = Math.min(grid.height - 1, Math.ceil((rect.y + rect.h + padY) * sy));
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * grid.width + x) * 3;
      const l = luminance(grid.rgb[i], grid.rgb[i + 1], grid.rgb[i + 2]);
      n += 1;
      sum += l;
      sumSq += l * l;
    }
  }
  if (n === 0) return { luminance: 0.5, busyness: 0 };
  const mean = sum / n;
  return { luminance: mean, busyness: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
}

/** The variant that reads best against a background of this luminance, and how well. */
export function markVariantFor(background: number): { variant: HeaderMarkVariant; contrast: number } {
  const ink = contrastRatio(INK_LUMINANCE, background);
  const red = contrastRatio(RED_LUMINANCE, background);
  const white = contrastRatio(WHITE_LUMINANCE, background);
  const colour = Math.min(ink, red);
  const whiteRed = Math.min(white, red);
  const twoColour = colour >= whiteRed ? { variant: 'colour' as const, contrast: colour } : { variant: 'white' as const, contrast: whiteRed };
  if (twoColour.contrast >= MARK_MIN_TWO_COLOUR_CONTRAST) return twoColour;
  return white >= ink ? { variant: 'all-white', contrast: white } : { variant: 'all-ink', contrast: ink };
}

/**
 * The corner and the colours for this picture. With no grid (the picture could
 * not be sampled) the mark goes bottom right in its own colours, which is
 * where Patrick's own headers carry it.
 */
export function chooseMarkPlacement(canvas: Canvas, grid: PixelGrid | null): MarkPlacement {
  if (!grid) {
    // Unsampled: the outline makes the mark readable whatever is under it.
    return { corner: 'bottom-right', rect: markRect(canvas, 'bottom-right'), variant: 'colour', contrast: 0, busyness: -1, halo: 'light' };
  }
  const read = (corner: MarkCorner) => ({ corner, rect: markRect(canvas, corner), ...readCorner(grid, canvas, markRect(canvas, corner)) });
  const br = read('bottom-right');
  const bl = read('bottom-left');
  let pick = bl.busyness + MARK_SIDE_TOLERANCE < br.busyness ? bl : br;
  if (pick.busyness > MARK_BUSY) {
    const tr = read('top-right');
    const tl = read('top-left');
    const top = tl.busyness + MARK_SIDE_TOLERANCE < tr.busyness ? tl : tr;
    if (top.busyness < MARK_CALM) pick = top;
  }
  const busyness = Math.round(pick.busyness * 1000) / 1000;
  if (pick.busyness > MARK_BUSY) {
    const busy = busyMarkStyle(pick.luminance);
    return { corner: pick.corner, rect: pick.rect, variant: busy.variant, contrast: Math.round(busy.contrast * 100) / 100, busyness, halo: busy.halo };
  }
  const { variant, contrast } = markVariantFor(pick.luminance);
  return { corner: pick.corner, rect: pick.rect, variant, contrast: Math.round(contrast * 100) / 100, busyness, halo: null };
}
