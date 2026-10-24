/**
 * The post's title, laid over its generated header picture (AUTO-209, the
 * looks replaced by AUTO-210). PURE: no Sanity, no fs, no network, no next/*,
 * so vitest drives every rule and the server renderer (compose-title.tsx)
 * only draws what this decides.
 *
 * Patrick asked whether the AI blog images could carry the blog title, and
 * pointed at his own posts. The division of labour is:
 *
 *   - the image model draws the photograph (AUTO-206 / AUTO-207, unchanged),
 *     told to keep one third of the frame calm;
 *   - a cheap vision call LOOKS AT THAT FINISHED PICTURE and says where the
 *     product is (so it is never covered) and whether the calm third really
 *     is calm;
 *   - CODE draws the look and the letters, with a real font, from the post's
 *     exact title. The image model never draws text: AUTO-203 and AUTO-206
 *     measured it drawing marks that look like lettering and are not words,
 *     and one wrong letter on a published post is worse than no title.
 *
 * THE LOOKS (AUTO-210). AUTO-209's vocabulary (a band, a corner block, a
 * bowed panel, the title straight on the photo over a soft shadow, six fills
 * picked by the vision call) was rejected by Ali on sight: the shapes read as
 * boxes butted against the photograph, the logo floated in a white pill, the
 * band took a third of the height, the colour had no relation to the picture
 * and the plain text read as typed on. Fourteen treatments were composed on
 * four existing pictures and he kept four:
 *
 *   panel        a straight column down one side, under a third of the
 *                width, in navy, a red rule above the title and the logo
 *                knocked out to white at the foot of the column;
 *   gradient     no edge at all: the picture's OWN colour, near black, held
 *                along one side and dissolving to nothing by two thirds of
 *                the width; the title set left, vertically centred;
 *   lower-third  the same dissolve from the bottom, the title at the bottom
 *                left across three quarters of the width;
 *   lockup       Patrick's pink header: a list number set at 260 px beside
 *                the rest, a red rule over it; a title with a colon splits
 *                into a large first part and a smaller second; over the side
 *                gradient. A title with neither has no lockup and the
 *                rotation skips it;
 *   curve        the PPAI graphic (added at Ali's request after the first
 *                four): a quarter ellipse bleeding in from a top corner,
 *                navy, CURVE_WIDTH_SHARE by CURVE_HEIGHT_SHARE (about 24% of
 *                the frame, smaller than the 30% of the options page), the
 *                lines following the curve, and the logo all white in its own
 *                small brand-red curve in the far bottom corner, the way the
 *                PPAI mark sits in that graphic's green curve.
 *
 * Rejected, and why: the curved shape (the PPAI purple) and the wedge, which
 * under a 30% ceiling hold a 50-character title at 56 to 74 px only; the
 * semi-transparent panel, which read as a stain in the picture's colour and
 * as ordinary in charcoal; type only, which on all four pictures reached
 * 4.5:1 only with a shadow, and that shadow is the typed-on look; and the
 * picture's colour as a solid fill, which gave brown on three of the four
 * (wood) and read muddy beside navy. The logo pill is gone: the full logo
 * is white inside the panel, and everywhere else the bare P! mark sits in a
 * free bottom corner, ink on a light corner and white on a dark one.
 *
 * THE PHOTOGRAPH IS NEVER LETTERBOXED: it runs full bleed under every look,
 * and no opaque shape takes more than PANEL_WIDTH_SHARE of the frame.
 *
 * THE HEADLINE (AUTO-211, the look Patrick's own recent headers follow): the
 * title large across the TOP in two tones, navy up to a colon and blue after
 * it (else the first line navy, the rest blue), over a soft white haze that
 * dissolves into the photograph, the products below. The picture is asked
 * to keep its top third light and calm for it (header-image.ts). It is the
 * FIRST look of every new picture; the five others are what a regenerate
 * walks through.
 *
 * THE ROTATION. The six looks are taken in a fixed cycle that ALWAYS starts
 * at the headline for a first picture; a regenerate (Generate another header
 * image, Regenerate Blog with AI) starts from the look AFTER the one the
 * post has now, so every regenerate gives a new look (Ali's rule). A look
 * the picture refuses (it would cover the product, the lockup has nothing to
 * set large, the measured contrast fails) falls to the next in the cycle;
 * when every look covers the product, the one covering least is used and
 * the title still goes on.
 *
 * THE SIDE. The side looks mirror: the title goes on the third the picture
 * was asked to keep calm (header-image.ts titleRoomSideFor, left or right),
 * or on the other side when the vision call says only that one is calm.
 *
 * THE TEXT COLOUR is white on every look but the headline. The panel's navy
 * carries it at 12.3:1; under a gradient it is MEASURED: every sampled cell
 * under the title is composited with the gradient the way the renderer
 * composites it, and the gradient is held until past the title's far edge,
 * so the share figure (TITLE_CONTRAST_SHARE of the cells) reaches
 * TITLE_MIN_CONTRAST on any photograph; a picture that still fails moves to
 * the next look. The headline's dark letters are measured the same way under
 * their white haze, the haze held at the weakest alpha that carries them.
 *
 * WHAT IS NEVER DONE HERE: no picture Patrick uploaded is ever given a title
 * (only the AI step calls this), and a hot-linked Geiger photo cannot be,
 * because composing it into our own file would copy a Geiger image onto this
 * site (Section 18).
 */

import { TITLE_FONT_ADVANCES, TITLE_FONT_UNITS_PER_EM } from './title-font-metrics';

// -- The vocabulary --------------------------------------------------------------

export const TITLE_LOOKS = ['headline', 'panel', 'gradient', 'lower-third', 'lockup', 'curve'] as const;
export type TitleLookName = (typeof TITLE_LOOKS)[number];

export const TITLE_LAYOUTS = [
  'headline',
  'panel-left',
  'panel-right',
  'gradient-left',
  'gradient-right',
  'lower-third',
  'lockup-left',
  'lockup-right',
  'curve-left',
  'curve-right',
] as const;
export type TitleLayoutName = (typeof TITLE_LAYOUTS)[number];
export type TitleSide = 'left' | 'right';

export function isTitleLayout(value: unknown): value is TitleLayoutName {
  return typeof value === 'string' && (TITLE_LAYOUTS as readonly string[]).includes(value);
}

export function isTitleLook(value: unknown): value is TitleLookName {
  return typeof value === 'string' && (TITLE_LOOKS as readonly string[]).includes(value);
}

/** The look a layout is: `panel-left` is a panel; `lower-third` and `headline` are themselves. */
export function layoutLook(layout: TitleLayoutName): TitleLookName {
  if (layout === 'lower-third' || layout === 'headline') return layout;
  return layout.split('-')[0] as TitleLookName;
}

/** The side a layout sits on: left or right, bottom for the lower third, top for the headline. */
export function layoutSide(layout: TitleLayoutName): TitleSide | 'bottom' | 'top' {
  if (layout === 'lower-third') return 'bottom';
  if (layout === 'headline') return 'top';
  return layout.endsWith('-right') ? 'right' : 'left';
}

export function layoutFor(look: TitleLookName, side: TitleSide): TitleLayoutName {
  return look === 'lower-third' || look === 'headline' ? look : (`${look}-${side}` as TitleLayoutName);
}

/** Where a look wants the picture's calm third: the headline needs the top, every other look a side. */
export function roomSideForLook(look: TitleLookName): 'top' | 'side' {
  return look === 'headline' ? 'top' : 'side';
}

/** Brand navy (Section 10's dark blue beside the logo's red and ink): the panel's fill. */
export const PANEL_FILL = '#23306B';
export const TITLE_INK = '#231F20';
export const TITLE_WHITE = '#FFFFFF';
export const BRAND_RED = '#E11F1E';

/** WCAG AA for normal text: the title is large, but at phone width it is about 13 px, so the normal-text figure is used. */
export const TITLE_MIN_CONTRAST = 4.5;
/** Under a gradient, the share of sampled cells under the title that must reach the contrast. */
export const TITLE_CONTRAST_SHARE = 0.98;
/** The most of the product the title's own block (or the panel) may cover. */
export const MAX_PRODUCT_COVER = 0.12;
/**
 * The most of the product that may sit under a gradient's HELD part (its full
 * strength). A gradient does not hide what it covers the way the panel does,
 * it darkens it, so the lettering is held to MAX_PRODUCT_COVER and the tint
 * to this: a product more than half under the tint is effectively hidden
 * (AUTO-210, measured on the 94 archived pictures: with the held region
 * tested as a panel, 71 of 94 refused every gradient look and the rotation
 * collapsed to the panel and the lower third).
 */
export const HELD_MAX_PRODUCT_COVER = 0.5;
/** The panel's width as a share of the frame, which is also its share of the frame's area: under a third, never letterboxing the picture. */
export const PANEL_WIDTH_SHARE = 0.32;
/** The side gradient: held at GRADIENT_ALPHA for at least this share of the width (or past the title), then dissolving over GRADIENT_FADE_SHARE. */
export const GRADIENT_HOLD_SHARE = 0.34;
export const GRADIENT_HOLD_MAX_SHARE = 0.62;
export const GRADIENT_FADE_SHARE = 0.36;
export const GRADIENT_ALPHA = 0.92;
/** The lower third: held from just above the title, dissolving upwards over this share of the height. */
export const LOWER_FADE_SHARE = 0.26;
export const LOWER_ALPHA = 0.9;
/** Tracking (em) and line height, the "set, not typed" figures Ali kept. */
export const TITLE_LETTER_SPACING = -0.025;
export const TITLE_LINE_HEIGHT = 1.04;
/** The frame margin every look keeps. */
export const TITLE_MARGIN = 72;
/** Never closer to the frame's top or bottom than this: a 1.91:1 social crop takes about 24 px off each of a 768-tall picture. */
export const SAFE_Y = 52;
/** The lockup's numeral size, and the smaller tier's ceiling. */
export const LOCKUP_NUMERAL_SIZE = 260;
/** The curve: a quarter ellipse with these radii as shares of the frame; its area is pi/4 times their product (about 24%). */
export const CURVE_WIDTH_SHARE = 0.5;
export const CURVE_HEIGHT_SHARE = 0.62;
/** The logo's own curve: a circle of this share of the height, bleeding in from the far bottom corner, brand red. */
export const BADGE_RADIUS_SHARE = 0.28;
/**
 * The headline (AUTO-211, the pattern Patrick's own recent headers follow): the
 * title large across the TOP of the picture in two colours, navy for the first
 * part and this blue for the rest, over a soft white haze that fades into the
 * photograph, the products below it. The haze is held at the weakest of
 * HEADLINE_ALPHAS that gives the blue TITLE_MIN_CONTRAST over the sampled
 * picture, so a bright calm top takes almost none and a busy one takes more.
 */
export const HEADLINE_INK = PANEL_FILL;
export const HEADLINE_ACCENT = '#1E5FD2';
export const HEADLINE_ALPHAS = [0.5, 0.66, 0.82, 0.94] as const;
/** The haze dissolves below the lettering over this share of the height. */
export const HEADLINE_FADE_SHARE = 0.22;
/** The lettering's distance from the top edge (base canvas px). */
export const HEADLINE_TOP = 48;
/**
 * The most of the product box the headline's lettering may cover: looser than
 * MAX_PRODUCT_COVER because Patrick's own headers graze the top of the
 * product, and because the vision call's box is coarse (the first live proof
 * boxed the disc WITH the basket and the plant beside it, so 15% of that box
 * was sky and leaf tips). Before the ceiling is applied the title is first
 * set smaller to stay ABOVE the product (HEADLINE_ABOVE_GAP clear of it).
 */
export const HEADLINE_MAX_PRODUCT_COVER = 0.2;
export const HEADLINE_ABOVE_GAP = 24;
/** A soft white glow around the letters, a belt under the measured haze; never measured, never relied on. */
export const HEADLINE_GLOW = '0 0 16px rgba(255,255,255,0.85)';

// -- Colour arithmetic ------------------------------------------------------------

function channelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB colour, channels 0..1. */
export function luminanceOf(r: number, g: number, b: number): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export function hexLuminance(hex: string): number {
  return luminanceOf(...hexToRgb(hex));
}

export function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r1)}${hex(g1)}${hex(b1)}`;
}

/** The gradient colour when the picture could not be sampled or has no colour of its own: navy taken near black. */
export const GRADIENT_FALLBACK_COLOUR = '#121A3A';
/** Lightness the picture's hue is taken down to for the gradients: near black, so white text holds under GRADIENT_ALPHA on any photograph. */
export const GRADIENT_LIGHTNESS = 0.13;

/**
 * The photograph's own colour for the gradients (AUTO-210, Ali's "colour with
 * a relationship to the photograph"): its dominant saturated hue (24 bins,
 * each sampled cell weighted by its saturation and by how far it is from
 * black and white), at its own saturation clamped, taken down to
 * GRADIENT_LIGHTNESS. A picture with no saturated colour (a grey room) gives
 * the navy fallback.
 */
export function gradientColourOf(grid: PixelGrid | null | undefined): { hex: string; hue: number | null } {
  if (!grid) return { hex: GRADIENT_FALLBACK_COLOUR, hue: null };
  const bins = Array.from({ length: 24 }, () => ({ w: 0, s: 0 }));
  let total = 0;
  const n = grid.width * grid.height;
  for (let i = 0; i < n; i += 1) {
    const [h, s, l] = rgbToHsl(grid.rgb[i * 3], grid.rgb[i * 3 + 1], grid.rgb[i * 3 + 2]);
    const w = s * (1 - Math.abs(l - 0.5) * 1.6);
    if (w <= 0.05) continue;
    const b = Math.floor(h / 15) % 24;
    bins[b].w += w;
    bins[b].s += s * w;
    total += w;
  }
  let best = 0;
  for (let b = 1; b < 24; b += 1) if (bins[b].w > bins[best].w) best = b;
  if (n === 0 || total / n < 0.04) return { hex: GRADIENT_FALLBACK_COLOUR, hue: null };
  const hue = best * 15 + 7.5;
  const sat = Math.min(0.5, Math.max(0.38, bins[best].s / bins[best].w));
  return { hex: hslToHex(hue, sat, GRADIENT_LIGHTNESS), hue };
}

// -- The title ----------------------------------------------------------------------

/** The title exactly as the post stores it, with only its surrounding and doubled spaces taken out. */
export function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

/** Characters of the title the font cannot draw; empty when every one can. */
export function undrawableCharacters(title: string): string[] {
  const out: string[] = [];
  for (const ch of normalizeTitle(title)) {
    if (TITLE_FONT_ADVANCES[ch] === undefined && !out.includes(ch)) out.push(ch);
  }
  return out;
}

/** True when the font can draw every character, so what is drawn is exactly the title. */
export function titleIsDrawable(title: string): boolean {
  return normalizeTitle(title).length > 0 && undrawableCharacters(title).length === 0;
}

/** The drawn width of a run of text at `size` px from the font's own advances alone (no kerning, no tracking). */
export function measureText(text: string, size: number): number {
  let units = 0;
  for (const ch of text) units += TITLE_FONT_ADVANCES[ch] ?? TITLE_FONT_UNITS_PER_EM;
  return (units * size) / TITLE_FONT_UNITS_PER_EM;
}

/** The drawn width of a line as the renderer draws it: the advances plus the tracking between the letters. */
export function measureLine(text: string, size: number): number {
  return measureText(text, size) + Math.max(0, [...text].length - 1) * TITLE_LETTER_SPACING * size;
}

/** Kept back from every line's measured room, so rounding and the renderer's own measuring can never push a line past its box. */
export const LINE_FIT_MARGIN = 0.03;

/** Words that read badly at the end of a line ("Gifts for / Women"); a break after one costs more. */
const WEAK_LINE_ENDINGS = new Set([
  'a',
  'an',
  'the',
  'for',
  'of',
  'to',
  'and',
  'or',
  'in',
  'on',
  'with',
  'at',
  'by',
  'your',
  'our',
  'that',
  'from',
  'into',
  'is',
  'are',
  '&',
  'vs',
  'vs.',
]);

/** The articles, which read worst of all at a line's end ("Bags: A / Buyer's Guide"). */
const ARTICLES = new Set(['a', 'an', 'the']);

export interface FittedTitle {
  size: number;
  lines: string[];
  /** The widest line, px. */
  width: number;
  /** All the lines together, px. */
  height: number;
  lineHeight: number;
}

/**
 * The best way to break `words` into exactly `n` lines at `size`, every line
 * no wider than `maxWidth`: lines as even as possible, a line never ending on
 * a weak word, a break preferred right after a colon or a question mark.
 * Null when no break fits.
 */
export function breakIntoLines(
  words: readonly string[],
  n: number,
  size: number,
  maxWidth: number,
  /** True for a narrow column (the panel), where one word to a line is the normal shape and costs nothing extra. */
  narrow = false,
): { lines: string[]; cost: number } | null {
  if (n < 1 || words.length < n) return null;
  const room = maxWidth * (1 - LINE_FIT_MARGIN);
  const widthOf = (i: number, j: number) => measureLine(words.slice(i, j).join(' '), size);
  // best[k][j]: cheapest way to put words[0..j) on k lines.
  const best: (number | null)[][] = Array.from({ length: n + 1 }, () => Array(words.length + 1).fill(null));
  const from: number[][] = Array.from({ length: n + 1 }, () => Array(words.length + 1).fill(-1));
  best[0][0] = 0;
  for (let k = 1; k <= n; k += 1) {
    for (let j = k; j <= words.length; j += 1) {
      for (let i = k - 1; i < j; i += 1) {
        const prev = best[k - 1][i];
        if (prev === null) continue;
        const w = widthOf(i, j);
        if (w > room) continue;
        const last = words[j - 1].toLowerCase();
        const isLast = j === words.length;
        // Uneven lines cost; the last line may be shorter at half the price.
        let cost = ((room - w) / room) ** 2 * (isLast ? 0.5 : 1);
        if (!isLast) {
          if (WEAK_LINE_ENDINGS.has(last)) cost += ARTICLES.has(last) ? 1.5 : 0.6;
          if (/[:?!]$/.test(last)) cost -= 1.0;
          // One word alone on a line that is not the last ("Custom / Tote Bags: / ...").
          if (j - i === 1 && n > 1 && !narrow) cost += 1.2;
        } else if (j - i === 1 && n > 1 && !narrow) {
          cost += words[j - 1].length <= 4 ? 0.9 : 0.6; // a single word alone on the last line
        }
        const total = prev + cost;
        if (best[k][j] === null || total < (best[k][j] as number)) {
          best[k][j] = total;
          from[k][j] = i;
        }
      }
    }
  }
  const total = best[n][words.length];
  if (total === null) return null;
  const lines: string[] = [];
  let j = words.length;
  for (let k = n; k >= 1; k -= 1) {
    const i = from[k][j];
    lines.unshift(words.slice(i, j).join(' '));
    j = i;
  }
  return { lines, cost: total };
}

export interface FitSpec {
  maxWidth: number;
  maxLines: number;
  maxSize: number;
  minSize: number;
  /** The tallest the lines together may be, px. */
  maxHeight?: number;
  /** A narrow column: one word to a line is its normal shape (see breakIntoLines). */
  narrow?: boolean;
}

/**
 * How much size a better break is worth: the fitter takes the size and the
 * break with the highest `FIT_SIZE_WEIGHT x size / maxSize - cost`, so one
 * word stranded on a line (cost 1.2) is worth about 17% of the size to
 * avoid, and a break at a colon (worth 1.0) about 14%. AUTO-209 had 10;
 * AUTO-210 lowered it after the wider boxes started taking four lines at a
 * larger size over three lines broken at the colon.
 */
export const FIT_SIZE_WEIGHT = 7;

/**
 * The title fitted to a box: every size from `maxSize` down to `minSize`
 * (2 px steps) at which it breaks into at most `maxLines` lines no wider than
 * `maxWidth` (and, with `maxHeight`, no taller than that together) is scored,
 * the cheapest break at each size against the size itself, and the best
 * wins. Null when it does not fit even at `minSize`.
 */
export function fitTitle(title: string, spec: FitSpec): FittedTitle | null {
  const words = normalizeTitle(title).split(' ').filter(Boolean);
  if (words.length === 0) return null;
  let best: { score: number; fitted: FittedTitle } | null = null;
  for (let size = Math.floor(spec.maxSize); size >= spec.minSize; size -= 2) {
    let chosen: { lines: string[]; cost: number } | null = null;
    const lineHeightAt = Math.round(size * TITLE_LINE_HEIGHT);
    for (let n = 1; n <= Math.min(spec.maxLines, words.length); n += 1) {
      if (spec.maxHeight !== undefined && n * lineHeightAt > spec.maxHeight) break;
      const got = breakIntoLines(words, n, size, spec.maxWidth, spec.narrow === true);
      if (got && (!chosen || got.cost < chosen.cost - 1e-9)) chosen = got;
    }
    if (chosen) {
      const lineHeight = Math.round(size * TITLE_LINE_HEIGHT);
      const score = (FIT_SIZE_WEIGHT * size) / spec.maxSize - chosen.cost;
      if (!best || score > best.score + 1e-9) {
        best = {
          score,
          fitted: {
            size,
            lines: chosen.lines,
            width: Math.ceil(Math.max(...chosen.lines.map((l) => measureLine(l, size)))),
            height: lineHeight * chosen.lines.length,
            lineHeight,
          },
        };
      }
    }
  }
  return best?.fitted ?? null;
}

/**
 * The lockup's two parts (Patrick's pink header): a leading list number set
 * large beside the rest, or the part before a colon set large over the part
 * after it. Null for a title with neither, which gets no lockup.
 */
export function lockupParts(title: string): { mode: 'number' | 'colon'; big: string; rest: string } | null {
  const t = normalizeTitle(title);
  const m = /^(\d{1,3})\s+(\S.*)$/.exec(t);
  if (m) return { mode: 'number', big: m[1], rest: m[2] };
  const colon = t.indexOf(':');
  if (colon > 0 && colon < t.length - 1) {
    const big = t.slice(0, colon).trim();
    const rest = t.slice(colon + 1).trim();
    if (big && rest) return { mode: 'colon', big, rest };
  }
  return null;
}

// -- Geometry --------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Canvas {
  width: number;
  height: number;
}

/** The width every measurement below is written for; other widths scale. Every generated header is 1376 x 768. */
export const BASE_CANVAS_WIDTH = 1376;

function scaleOf(canvas: Canvas): number {
  return canvas.width / BASE_CANVAS_WIDTH;
}

/** A run of a line in one colour (the headline's two tones). */
export interface TextSpan {
  text: string;
  colour: string;
}

export interface TextBlock {
  lines: string[];
  size: number;
  lineHeight: number;
  rect: Rect;
  /** Lines end on the right (the right-side curve, whose lines hug the curve on their left). Default left. */
  align?: 'left' | 'right';
  /** Per line, the runs and their colours; absent means the whole block in the plan's one text colour. */
  spans?: TextSpan[][];
  /** A CSS text-shadow drawn behind the letters (the headline's glow). */
  shadow?: string;
}

/**
 * The headline's two tones: with a colon, everything up to and including it
 * is navy and the rest blue ("Custom Pens for Business:" / "A Buyer's Guide");
 * without one, the first line is navy and the lines after it blue (a
 * one-line title is all navy). The split follows the lines as fitted, so a
 * colon in the middle of a line splits that line into two runs.
 */
export function headlineSpans(lines: readonly string[]): TextSpan[][] {
  const main = (text: string): TextSpan => ({ text, colour: HEADLINE_INK });
  const accent = (text: string): TextSpan => ({ text, colour: HEADLINE_ACCENT });
  let split: { line: number; word: number } | null = null;
  outer: for (let i = 0; i < lines.length; i += 1) {
    const words = lines[i].split(' ');
    for (let j = 0; j < words.length; j += 1) {
      if (words[j].endsWith(':') && (j < words.length - 1 || i < lines.length - 1)) {
        split = { line: i, word: j };
        break outer;
      }
    }
  }
  return lines.map((line, i) => {
    if (split) {
      if (i < split.line) return [main(line)];
      if (i > split.line) return [accent(line)];
      const words = line.split(' ');
      const head = words.slice(0, split.word + 1).join(' ');
      const tail = words.slice(split.word + 1).join(' ');
      return tail ? [main(`${head} `), accent(tail)] : [main(head)];
    }
    return i === 0 ? [main(line)] : [accent(line)];
  });
}

/**
 * Greedy fill, one line at a time, the room for each line given by the shape
 * at that line's bottom (the curve narrows as it goes down). Null when a word
 * does not fit or the lines run out.
 */
export function fitShaped(title: string, o: { maxSize: number; minSize: number; maxLines: number; y0: number; widthAt: (yBottom: number) => number }): FittedTitle | null {
  const words = normalizeTitle(title).split(' ').filter(Boolean);
  if (words.length === 0) return null;
  for (let size = Math.floor(o.maxSize); size >= o.minSize; size -= 2) {
    const lh = Math.round(size * TITLE_LINE_HEIGHT);
    const lines: string[] = [];
    let i = 0;
    let ok = true;
    while (i < words.length) {
      const room = o.widthAt(o.y0 + (lines.length + 1) * lh) * (1 - LINE_FIT_MARGIN);
      let j = i;
      let line = '';
      while (j < words.length) {
        const cand = line ? `${line} ${words[j]}` : words[j];
        if (measureLine(cand, size) <= room) {
          line = cand;
          j += 1;
        } else break;
      }
      if (j === i) {
        ok = false;
        break;
      }
      lines.push(line);
      i = j;
      if (lines.length > o.maxLines) {
        ok = false;
        break;
      }
    }
    // A lone short word on the last line: a size down first, when there is one.
    if (ok && lines.length > 1 && lines[lines.length - 1].length <= 5 && size - 2 >= o.minSize) continue;
    if (ok) return { size, lines, width: Math.ceil(Math.max(...lines.map((l) => measureLine(l, size)))), height: lh * lines.length, lineHeight: lh };
  }
  return null;
}

interface Geometry {
  layout: TitleLayoutName;
  look: TitleLookName;
  side: TitleSide | 'bottom' | 'top';
  text: TextBlock;
  /** The lockup's numeral, or its first (large) tier when the lockup split at a colon is drawn as `text` + `second`. */
  big: TextBlock | null;
  /** The lockup's smaller second tier (the part after the colon). */
  second: TextBlock | null;
  panel: Rect | null;
  /** The curve's bounding box (a quarter ellipse from the top corner of `side`). */
  curve: Rect | null;
  /** The region the gradient is HELD over (the part that reads as a solid tint), for the product test. */
  held: Rect | null;
  rule: Rect | null;
  /** What the look occupies, for the logo test (and the product test, for the panel). */
  footprint: Rect;
  /** The lettering as a whole (the title with the lockup's numeral or second tier), for the product test. */
  block: Rect;
  /** The region the contrast is measured over (the text, grown a little). */
  measure: Rect;
}

function grow(r: Rect, by: number, canvas: Canvas): Rect {
  const x = Math.max(0, r.x - by);
  const y = Math.max(0, r.y - by);
  return {
    x,
    y,
    w: Math.min(canvas.width, r.x + r.w + by) - x,
    h: Math.min(canvas.height, r.y + r.h + by) - y,
  };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function panelGeometry(title: string, canvas: Canvas, side: TitleSide): Geometry | null {
  const s = scaleOf(canvas);
  const w = Math.round(PANEL_WIDTH_SHARE * canvas.width);
  const padEdge = 64 * s;
  const padIn = 40 * s;
  const fitted = fitTitle(title, {
    maxWidth: w - padEdge - padIn,
    maxLines: 9,
    maxSize: 96 * s,
    minSize: 50 * s,
    maxHeight: canvas.height - 2 * SAFE_Y * s - 150 * s,
    narrow: true,
  });
  if (!fitted) return null;
  const x = Math.round(side === 'left' ? padEdge : canvas.width - w + padIn);
  const y = Math.round((canvas.height - fitted.height) / 2 - 10 * s);
  const text: TextBlock = { lines: fitted.lines, size: fitted.size, lineHeight: fitted.lineHeight, rect: { x, y, w: fitted.width, h: fitted.height } };
  const panel: Rect = { x: side === 'left' ? 0 : canvas.width - w, y: 0, w, h: canvas.height };
  return {
    layout: layoutFor('panel', side),
    look: 'panel',
    side,
    text,
    big: null,
    second: null,
    panel,
    curve: null,
    held: null,
    rule: { x, y: Math.round(y - 34 * s), w: Math.round(96 * s), h: Math.round(8 * s) },
    footprint: panel,
    block: text.rect,
    measure: text.rect,
  };
}

/** How far past the block's far edge a side gradient stays at full strength. */
const HOLD_PAST_BLOCK = 24;

/** The held region of a side gradient: from the frame edge to just past the block's far edge, at least GRADIENT_HOLD_SHARE. */
function heldFor(block: Rect, canvas: Canvas, side: TitleSide): Rect {
  const s = scaleOf(canvas);
  const far = side === 'left' ? block.x + block.w : canvas.width - block.x;
  const hold = Math.min(canvas.width * GRADIENT_HOLD_MAX_SHARE, Math.max(canvas.width * GRADIENT_HOLD_SHARE, far + HOLD_PAST_BLOCK * s));
  return side === 'left' ? { x: 0, y: 0, w: Math.round(hold), h: canvas.height } : { x: Math.round(canvas.width - hold), y: 0, w: Math.round(hold), h: canvas.height };
}

function gradientGeometry(title: string, canvas: Canvas, side: TitleSide): Geometry | null {
  const s = scaleOf(canvas);
  const margin = TITLE_MARGIN * s;
  const spec = { maxWidth: 0.5 * canvas.width, maxSize: 100 * s, minSize: 52 * s };
  const fitted = fitTitle(title, { ...spec, maxLines: 4 }) ?? fitTitle(title, { ...spec, maxLines: 5 });
  if (!fitted) return null;
  const x = Math.round(side === 'left' ? margin : canvas.width - margin - fitted.width);
  const y = Math.round((canvas.height - fitted.height) / 2);
  const text: TextBlock = { lines: fitted.lines, size: fitted.size, lineHeight: fitted.lineHeight, rect: { x, y, w: fitted.width, h: fitted.height } };
  const held = heldFor(text.rect, canvas, side);
  return {
    layout: layoutFor('gradient', side),
    look: 'gradient',
    side,
    text,
    big: null,
    second: null,
    panel: null,
    curve: null,
    held,
    rule: null,
    footprint: union(held, grow(text.rect, 16 * s, canvas)),
    block: text.rect,
    measure: grow(text.rect, 10 * s, canvas),
  };
}

function lowerThirdGeometry(title: string, canvas: Canvas): Geometry | null {
  const s = scaleOf(canvas);
  const margin = TITLE_MARGIN * s;
  const lowerSpec = { maxWidth: 0.78 * canvas.width, maxSize: 88 * s, minSize: 52 * s, maxHeight: 0.3 * canvas.height };
  const fitted = fitTitle(title, { ...lowerSpec, maxLines: 2 }) ?? fitTitle(title, { ...lowerSpec, maxLines: 3 });
  if (!fitted) return null;
  const y = Math.round(canvas.height - 60 * s - fitted.height);
  const text: TextBlock = { lines: fitted.lines, size: fitted.size, lineHeight: fitted.lineHeight, rect: { x: Math.round(margin), y, w: fitted.width, h: fitted.height } };
  const top = Math.round(y - 32 * s);
  const held: Rect = { x: 0, y: top, w: canvas.width, h: canvas.height - top };
  return {
    layout: 'lower-third',
    look: 'lower-third',
    side: 'bottom',
    text,
    big: null,
    second: null,
    panel: null,
    curve: null,
    held,
    rule: null,
    footprint: held,
    block: text.rect,
    measure: grow(text.rect, 10 * s, canvas),
  };
}

function lockupGeometry(title: string, canvas: Canvas, side: TitleSide): Geometry | null {
  const parts = lockupParts(title);
  if (!parts) return null;
  const s = scaleOf(canvas);
  const margin = TITLE_MARGIN * s;
  if (parts.mode === 'number') {
    const bigSize = Math.round(LOCKUP_NUMERAL_SIZE * s);
    const bigLh = Math.round(bigSize * 0.78);
    const bigW = Math.ceil(measureLine(parts.big, bigSize));
    const gap = 28 * s;
    const fitted = fitTitle(parts.rest, { maxWidth: GRADIENT_HOLD_MAX_SHARE * canvas.width - margin - bigW - gap - HOLD_PAST_BLOCK * s, maxLines: 5, maxSize: 84 * s, minSize: 48 * s });
    if (!fitted) return null;
    const h = Math.max(fitted.height, bigSize * 0.76);
    const y0 = Math.round((canvas.height - h) / 2);
    const blockW = bigW + gap + fitted.width;
    const x0 = Math.round(side === 'left' ? margin : canvas.width - margin - blockW);
    const big: TextBlock = { lines: [parts.big], size: bigSize, lineHeight: bigLh, rect: { x: x0, y: Math.round(y0 - bigSize * 0.08), w: bigW, h: bigLh } };
    const tx = Math.round(x0 + bigW + gap);
    const ty = Math.round(y0 + (h - fitted.height) / 2);
    const text: TextBlock = { lines: fitted.lines, size: fitted.size, lineHeight: fitted.lineHeight, rect: { x: tx, y: ty, w: fitted.width, h: fitted.height } };
    const block: Rect = { x: x0, y: y0, w: blockW, h: Math.round(h) };
    const held = heldFor(block, canvas, side);
    return {
      layout: layoutFor('lockup', side),
      look: 'lockup',
      side,
      text,
      big,
      second: null,
      panel: null,
      curve: null,
      held,
      rule: { x: tx, y: Math.round(y0 - 30 * s), w: Math.ceil(measureLine(fitted.lines[0], fitted.size)), h: Math.round(8 * s) },
      footprint: union(held, grow(block, 16 * s, canvas)),
      block,
      measure: grow(block, 10 * s, canvas),
    };
  }
  const tierWidth = GRADIENT_HOLD_MAX_SHARE * canvas.width - margin - HOLD_PAST_BLOCK * s;
  const first = fitTitle(parts.big, { maxWidth: tierWidth, maxLines: 3, maxSize: 108 * s, minSize: 56 * s });
  const rest = fitTitle(parts.rest, { maxWidth: tierWidth, maxLines: 3, maxSize: 60 * s, minSize: 40 * s });
  if (!first || !rest) return null;
  const gapY = 26 * s;
  const h = first.height + gapY + rest.height;
  const y0 = Math.round((canvas.height - h) / 2);
  const w = Math.max(first.width, rest.width);
  const x0 = Math.round(side === 'left' ? margin : canvas.width - margin - w);
  const text: TextBlock = { lines: first.lines, size: first.size, lineHeight: first.lineHeight, rect: { x: x0, y: y0, w: first.width, h: first.height } };
  const second: TextBlock = { lines: rest.lines, size: rest.size, lineHeight: rest.lineHeight, rect: { x: x0, y: Math.round(y0 + first.height + gapY), w: rest.width, h: rest.height } };
  const block: Rect = { x: x0, y: y0, w, h: Math.round(h) };
  const held = heldFor(block, canvas, side);
  return {
    layout: layoutFor('lockup', side),
    look: 'lockup',
    side,
    text,
    big: null,
    second,
    panel: null,
    curve: null,
    held,
    rule: { x: x0, y: Math.round(y0 + first.height + 8 * s), w: Math.round(120 * s), h: Math.round(6 * s) },
    footprint: union(held, grow(block, 16 * s, canvas)),
    block,
    measure: grow(block, 10 * s, canvas),
  };
}

/**
 * The headline: the title across the top, inside the margins, at most three
 * lines (two preferred by the fitter's own scoring), never below 42% of the
 * height, so the products below it stay in view. The haze is held to just
 * under the lettering and fades over HEADLINE_FADE_SHARE of the height.
 */
function headlineGeometry(title: string, canvas: Canvas, /** The y the lettering must end above (the product's top), when known. */ ceiling?: number): Geometry | null {
  const s = scaleOf(canvas);
  const margin = TITLE_MARGIN * s;
  const maxBottom = Math.min(0.42 * canvas.height, ceiling ?? Number.POSITIVE_INFINITY);
  const fitted = fitTitle(title, { maxWidth: canvas.width - 2 * margin, maxLines: 3, maxSize: 104 * s, minSize: 56 * s, maxHeight: maxBottom - HEADLINE_TOP * s });
  if (!fitted) return null;
  const y = Math.round(HEADLINE_TOP * s);
  const text: TextBlock = { lines: fitted.lines, size: fitted.size, lineHeight: fitted.lineHeight, rect: { x: Math.round(margin), y, w: fitted.width, h: fitted.height } };
  const held: Rect = { x: 0, y: 0, w: canvas.width, h: Math.round(y + fitted.height + 28 * s) };
  return {
    layout: 'headline',
    look: 'headline',
    side: 'top',
    text,
    big: null,
    second: null,
    panel: null,
    curve: null,
    held,
    rule: null,
    footprint: held,
    block: text.rect,
    measure: grow(text.rect, 10 * s, canvas),
  };
}

function curveGeometry(title: string, canvas: Canvas, side: TitleSide): Geometry | null {
  const s = scaleOf(canvas);
  const cx = CURVE_WIDTH_SHARE * canvas.width;
  const cy = CURVE_HEIGHT_SHARE * canvas.height;
  const padEdge = TITLE_MARGIN * s;
  const padCurve = 52 * s;
  const y0 = Math.round(60 * s);
  const widthAt = (yb: number) => (yb >= cy ? 0 : cx * Math.sqrt(1 - (yb / cy) ** 2) - padEdge - padCurve);
  const fitted = fitShaped(title, { maxSize: 96 * s, minSize: 50 * s, maxLines: 5, y0, widthAt });
  if (!fitted) return null;
  const x = Math.round(side === 'left' ? padEdge : canvas.width - padEdge - fitted.width);
  const text: TextBlock = { lines: fitted.lines, size: fitted.size, lineHeight: fitted.lineHeight, rect: { x, y: y0, w: fitted.width, h: fitted.height }, align: side === 'right' ? 'right' : 'left' };
  const curve: Rect = { x: side === 'left' ? 0 : canvas.width - cx, y: 0, w: Math.round(cx), h: Math.round(cy) };
  return {
    layout: layoutFor('curve', side),
    look: 'curve',
    side,
    text,
    big: null,
    second: null,
    panel: null,
    curve,
    held: null,
    rule: null,
    footprint: curve,
    block: text.rect,
    measure: text.rect,
  };
}

/** The geometry of one placement for one title, or null when the title does not fit it (or, for the lockup, has nothing to set large). */
export function geometryFor(layout: TitleLayoutName, title: string, canvas: Canvas): Geometry | null {
  const look = layoutLook(layout);
  const side = layoutSide(layout);
  if (look === 'headline') return headlineGeometry(title, canvas);
  if (look === 'curve') return curveGeometry(title, canvas, side as TitleSide);
  if (look === 'panel') return panelGeometry(title, canvas, side as TitleSide);
  if (look === 'gradient') return gradientGeometry(title, canvas, side as TitleSide);
  if (look === 'lower-third') return lowerThirdGeometry(title, canvas);
  return lockupGeometry(title, canvas, side as TitleSide);
}

export function intersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** How much of the product a rectangle covers, 0..1; 0 with no product box. */
export function productCover(rect: Rect, product: Rect | null): number {
  if (!product || product.w <= 0 || product.h <= 0) return 0;
  return intersectionArea(rect, product) / (product.w * product.h);
}

// -- The picture, sampled --------------------------------------------------------

/** The picture as a coarse grid of sRGB colours (channels 0..1), row major, three numbers a cell. */
export interface PixelGrid {
  width: number;
  height: number;
  rgb: ArrayLike<number>;
}

function cellsUnder(grid: PixelGrid, rect: Rect, canvas: Canvas): number[] {
  const sx = grid.width / canvas.width;
  const sy = grid.height / canvas.height;
  const x0 = Math.max(0, Math.floor(rect.x * sx));
  const y0 = Math.max(0, Math.floor(rect.y * sy));
  const x1 = Math.min(grid.width, Math.ceil((rect.x + rect.w) * sx));
  const y1 = Math.min(grid.height, Math.ceil((rect.y + rect.h) * sy));
  const out: number[] = [];
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) out.push(y * grid.width + x);
  return out;
}

function cellLuminance(grid: PixelGrid, cell: number): number {
  return luminanceOf(grid.rgb[cell * 3], grid.rgb[cell * 3 + 1], grid.rgb[cell * 3 + 2]);
}

/** The mean luminance of the cells under a rectangle (0 for an empty one). */
export function meanLuminance(grid: PixelGrid, rect: Rect, canvas: Canvas): number {
  const cells = cellsUnder(grid, rect, canvas);
  if (cells.length === 0) return 0;
  return cells.reduce((s, c) => s + cellLuminance(grid, c), 0) / cells.length;
}

export interface GradientSpec {
  side: TitleSide | 'bottom' | 'top';
  /** The colour, as hex. */
  colour: string;
  alpha: number;
  /** Where the full alpha ends, px from the gradient's own edge (the left edge, the right edge, the bottom or the top). */
  holdTo: number;
  /** Where it reaches nothing, px from the same edge. */
  fadeTo: number;
}

/** The gradient's alpha at a canvas point, exactly as the renderer's linear-gradient gives it. */
export function gradientAlphaAt(g: GradientSpec, x: number, y: number, canvas: Canvas): number {
  const d = g.side === 'left' ? x : g.side === 'right' ? canvas.width - x : g.side === 'top' ? y : canvas.height - y;
  if (d <= g.holdTo) return g.alpha;
  if (d >= g.fadeTo) return 0;
  return g.alpha * (1 - (d - g.holdTo) / (g.fadeTo - g.holdTo));
}

/**
 * The contrast text of luminance `textLuminance` (white unless given: the
 * headline measures its blue) gets over `rect` under a gradient: every cell
 * composited in sRGB exactly as the renderer composites it, and the value
 * TITLE_CONTRAST_SHARE of the cells reach.
 */
export function gradientContrast(grid: PixelGrid, rect: Rect, canvas: Canvas, g: GradientSpec, textLuminance = 1): number {
  const cells = cellsUnder(grid, rect, canvas);
  if (cells.length === 0) return 0;
  const over = hexToRgb(g.colour);
  const ratios = cells
    .map((c) => {
      const x = ((c % grid.width) + 0.5) * (canvas.width / grid.width);
      const y = (Math.floor(c / grid.width) + 0.5) * (canvas.height / grid.height);
      const a = gradientAlphaAt(g, x, y, canvas);
      const [r, gg, b] = [0, 1, 2].map((k) => grid.rgb[c * 3 + k] * (1 - a) + over[k] * a);
      return contrastRatio(textLuminance, luminanceOf(r, gg, b));
    })
    .sort((a, b) => a - b);
  return ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * (1 - TITLE_CONTRAST_SHARE)))];
}

// -- The vision call ----------------------------------------------------------------

export const CALM_SIDES = ['left', 'right', 'top', 'either', 'neither'] as const;
export type CalmSide = (typeof CALM_SIDES)[number];

export interface TitleLayoutAnswer {
  /** The main product, in canvas-independent thousandths: [ymin, xmin, ymax, xmax], 0..1000. */
  productBox: [number, number, number, number] | null;
  /** Which third of the frame is calm enough to carry the title. */
  calmSide: CalmSide | null;
  reason: string;
}

export const TITLE_LAYOUT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    productBox: { type: 'ARRAY', items: { type: 'INTEGER' } },
    calmSide: { type: 'STRING', enum: [...CALM_SIDES] },
    reason: { type: 'STRING' },
  },
  required: ['productBox', 'calmSide', 'reason'],
  propertyOrdering: ['productBox', 'calmSide', 'reason'],
};

/**
 * The vision model's instructions: look at THIS picture and say where the
 * product is and which side is calm. It is told the title only so it knows
 * how long it is; it is never asked to write it, and it no longer chooses
 * the look (AUTO-210: the rotation does).
 */
export function buildTitleLayoutPrompt(
  title: string,
  /** The third of the frame the picture was asked to leave empty, as a hint the model checks by looking. */
  intendedRoom?: TitleSide | 'top' | null,
): { system: string; user: string } {
  return {
    system:
      "You are the graphic designer for a business blog. You lay each post's title over its header photograph so the title reads clearly and the product stays fully visible. You answer with ONE JSON object and nothing else.",
    user: [
      `This photograph heads a blog post titled "${normalizeTitle(title)}" (${normalizeTitle(title).length} characters). The title will be laid over the photograph by code, along the top, down one side or along the bottom. Look at the photograph and answer two things.`,
      ...(intendedRoom ? [`The photograph was composed to leave its ${intendedRoom} third calm for the title. Check that by looking.`] : []),
      '1. productBox: the main product in the photograph as [ymin, xmin, ymax, xmax], each 0 to 1000 of the image height or width. The product itself, not the props beside it.',
      '2. calmSide: which third of the frame is calm enough to carry the title without covering anything that matters: "top", "left", "right", "either" (the left and the right are both calm) or "neither".',
      '3. reason: one short sentence.',
      'Return exactly: {"productBox": [ymin, xmin, ymax, xmax], "calmSide": "...", "reason": "..."}',
    ].join('\n'),
  };
}

/** The answer read defensively: anything outside the vocabulary is dropped, never guessed. */
export function parseTitleLayoutAnswer(raw: unknown): TitleLayoutAnswer {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const box = Array.isArray(r.productBox) ? r.productBox.map((v) => (typeof v === 'number' ? v : Number.NaN)) : [];
  let productBox: TitleLayoutAnswer['productBox'] = null;
  if (box.length === 4 && box.every((v) => Number.isFinite(v))) {
    const [ymin, xmin, ymax, xmax] = box.map((v) => Math.max(0, Math.min(1000, v)));
    if (ymax > ymin && xmax > xmin) productBox = [ymin, xmin, ymax, xmax];
  }
  const calmSide = (CALM_SIDES as readonly string[]).includes(r.calmSide as string) ? (r.calmSide as CalmSide) : null;
  return {
    productBox,
    calmSide,
    reason: typeof r.reason === 'string' ? r.reason.replace(/\s+/g, ' ').trim().slice(0, 240) : '',
  };
}

export function productRectOf(box: TitleLayoutAnswer['productBox'], canvas: Canvas): Rect | null {
  if (!box) return null;
  const [ymin, xmin, ymax, xmax] = box;
  return {
    x: (xmin / 1000) * canvas.width,
    y: (ymin / 1000) * canvas.height,
    w: ((xmax - xmin) / 1000) * canvas.width,
    h: ((ymax - ymin) / 1000) * canvas.height,
  };
}

// -- The plan ---------------------------------------------------------------------

/** The logo as it is drawn: the full logo knocked out to white inside the panel, the bare P! mark in a free bottom corner, or the logo all white on its own red curve (`badge`). */
export interface LogoPlacement {
  kind: 'full' | 'mark' | 'badge';
  /** White artwork (on a dark area or the panel); false is the colour artwork, ink and red, on a light corner. */
  white: boolean;
  rect: Rect;
}

/** The logo's proportions (public/logo.svg, 601.8 x 225.5) and the mark's crop (title-logo.ts). */
export const TITLE_LOGO_ASPECT = 601.8 / 225.5;
export const TITLE_MARK_ASPECT = 180 / 195;

export interface TitlePlan {
  /** The title exactly as drawn. */
  title: string;
  layout: TitleLayoutName;
  look: TitleLookName;
  side: TitleSide | 'bottom' | 'top';
  canvas: Canvas;
  panel: { rect: Rect; fill: string } | null;
  /** The curve look: a quarter ellipse with these radii from the top corner of `side`. */
  curve: { rect: Rect; side: TitleSide; fill: string } | null;
  /** The logo's own small curve in the far bottom corner (the curve look only). */
  badge: { cx: number; cy: number; r: number; fill: string } | null;
  gradient: GradientSpec | null;
  rule: { rect: Rect; fill: string } | null;
  text: TextBlock & { colour: string; letterSpacing: number };
  big: TextBlock | null;
  second: TextBlock | null;
  logo: LogoPlacement | null;
  /** The contrast the text gets: exact on the panel, the measured TITLE_CONTRAST_SHARE figure under a gradient. */
  contrast: number;
  /** False when the picture could not be sampled, so a gradient's contrast is the design figure rather than a measurement. */
  measured: boolean;
  /** The look the post had before, when this plan was made for a regenerate. */
  previous: TitleLookName | null;
  /** Why the plan is not the first choice, for the log and the report. */
  reasons: string[];
}

/** A stable number from a string (FNV-1a with an avalanche step), for the rotation. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The order the looks are tried in: the fixed cycle headline, panel,
 * gradient, lower-third, lockup, curve. A FIRST picture always starts at the
 * headline (AUTO-211, Ali's rule: the look Patrick's own headers follow now
 * is the one every new post gets), and a regenerate starts right AFTER the
 * post's current look, so a regenerate always gives a new look (the old one
 * is last). The seed no longer moves the start; it is kept so callers and
 * the side fallback are unchanged.
 */
export function lookOrderFor(_seed: number, previous: TitleLookName | null): TitleLookName[] {
  const n = TITLE_LOOKS.length;
  const start = previous ? (TITLE_LOOKS.indexOf(previous) + 1) % n : 0;
  return Array.from({ length: n }, (_, i) => TITLE_LOOKS[(start + i) % n]);
}

export interface PlanTitleInput {
  title: string;
  canvas: Canvas;
  /** The picture, sampled; without it a gradient's contrast is not measured and the gradient colour is the fallback. */
  grid?: PixelGrid | null;
  /** The vision call's answer, or null when it failed or ran out of time. */
  answer?: TitleLayoutAnswer | null;
  /** The post's slug or title, for the rotation. */
  seed?: string;
  /** The look the post's picture has now, for a regenerate: the plan starts from the look after it. */
  previous?: TitleLookName | null;
  /** The third of the frame the picture was asked to keep calm (header-image.ts titleRoomSideFor): a side, or the top for the headline. */
  room?: TitleSide | 'top' | null;
  /** A redraw: this exact layout and nothing else (title-only redraw on the kept copy). */
  forced?: TitleLayoutName | null;
  /** False to draw no logo. */
  logo?: boolean;
}

function logoFor(geo: Geometry, canvas: Canvas, grid: PixelGrid | null | undefined, product: Rect | null, avoid: Rect[]): LogoPlacement | null {
  const s = scaleOf(canvas);
  if (geo.look === 'panel' && geo.panel) {
    const w = Math.round(150 * s);
    const h = Math.round(w / TITLE_LOGO_ASPECT);
    const rect: Rect = { x: geo.text.rect.x, y: Math.round(canvas.height - 52 * s - h), w, h };
    // The column is the logo's home; only a title that reaches the foot of the column pushes it out.
    if (intersectionArea(grow(rect, 14 * s, canvas), geo.text.rect) > 0) return null;
    return { kind: 'full', white: true, rect };
  }
  if (geo.look === 'curve') {
    // The PPAI way: the logo all white in its own red curve in the far corner; the bare mark when the product sits there.
    const r = BADGE_RADIUS_SHARE * canvas.height;
    const right = geo.side === 'left';
    const box: Rect = { x: right ? canvas.width - r : 0, y: canvas.height - r, w: r, h: r };
    if (!product || intersectionArea(box, product) === 0) {
      const w = Math.round(128 * s);
      const h = Math.round(w / TITLE_LOGO_ASPECT);
      return { kind: 'badge', white: true, rect: { x: right ? Math.round(canvas.width - 40 * s - w) : Math.round(40 * s), y: Math.round(canvas.height - 30 * s - h), w, h } };
    }
  }
  const w = Math.round(96 * s);
  const h = Math.round(w / TITLE_MARK_ASPECT);
  const margin = Math.round(48 * s);
  const bottomRight: Rect = { x: canvas.width - margin - w, y: canvas.height - 44 * s - h, w, h };
  const bottomLeft: Rect = { x: margin, y: canvas.height - 44 * s - h, w, h };
  // A side look keeps the mark away from its own side; the headline (across the top) may use either bottom corner, the right first.
  const corners: Rect[] = geo.side === 'right' ? [bottomLeft] : geo.side === 'top' ? [bottomRight, bottomLeft] : [bottomRight];
  for (const rect of corners) {
    const clear = grow(rect, 16 * s, canvas);
    if (avoid.some((r) => intersectionArea(clear, r) > 0)) continue;
    if (product && intersectionArea(clear, product) > 0) continue;
    // Under a lower third the corner is inside the held gradient, so the mark is white; elsewhere it follows what is under it.
    const white = geo.look === 'lower-third' ? true : grid ? meanLuminance(grid, clear, canvas) < 0.35 : false;
    return { kind: 'mark', white, rect };
  }
  return null;
}

/**
 * The whole decision: which look, which side, how the title breaks, the
 * gradient's colour and reach, where the logo goes. Null when the title
 * cannot be drawn exactly (an empty title, or a character the font does not
 * have), or fits no look at all; then the picture is stored without a title
 * rather than with a wrong one.
 */
export function planTitle(input: PlanTitleInput): TitlePlan | null {
  const title = normalizeTitle(input.title);
  if (!titleIsDrawable(title)) return null;
  const canvas = input.canvas;
  const answer = input.answer ?? null;
  const product = productRectOf(answer?.productBox ?? null, canvas);
  const seed = seedOf(input.seed ?? title);
  const reasons: string[] = [];
  const grid = input.grid ?? null;
  const previous = input.previous ?? null;

  // The side (for the side looks): the calm third the picture was asked to keep, unless the vision call says only the other one is calm.
  let side: TitleSide = input.room === 'left' || input.room === 'right' ? input.room : seed % 2 === 0 ? 'left' : 'right';
  if (answer?.calmSide === 'left' || answer?.calmSide === 'right') {
    if (answer.calmSide !== side) {
      reasons.push(`the picture's ${answer.calmSide} third is the calm one, so the title went there instead of the ${side}`);
      side = answer.calmSide;
    }
  }
  if (!answer) reasons.push('the vision call gave no answer, so the product was not located and the side came from the room rule');

  const queue: TitleLayoutName[] = input.forced
    ? [input.forced]
    : lookOrderFor(seed, previous).map((look) => layoutFor(look, side));
  if (previous && !input.forced) reasons.push(`the post's picture was a ${previous}, so the next look was tried first`);

  const gradientColour = gradientColourOf(grid).hex;
  const s = scaleOf(canvas);

  let leastCover: { layout: TitleLayoutName; cover: number } | null = null;
  for (const pass of [1, 2] as const) {
    if (pass === 2) {
      if (!leastCover) break;
      reasons.push(`every look covers part of the product, so the one covering least (${leastCover.layout}, ${Math.round(leastCover.cover * 100)}%) was used`);
    }
    for (const layout of queue) {
      if (pass === 2 && layout !== leastCover?.layout) continue;
      let geo = geometryFor(layout, title, canvas);
      if (!geo) {
        reasons.push(layoutLook(layout) === 'lockup' && !lockupParts(title) ? `${layout}: the title has no list number and no colon to set large` : `${layout}: the title does not fit it`);
        continue;
      }
      // The panel hides what it covers; a gradient's lettering must not cover the product and its tint must not hide it.
      let cover = geo.look === 'panel' || geo.look === 'curve' ? productCover(geo.footprint, product) : productCover(grow(geo.block, 16 * s, canvas), product);
      const coverLimit = geo.look === 'headline' ? HEADLINE_MAX_PRODUCT_COVER : MAX_PRODUCT_COVER;
      if (geo.look === 'headline' && product && cover > coverLimit) {
        // The headline's own remedy first: the title set smaller, so it ends above the product.
        const above = headlineGeometry(title, canvas, product.y - HEADLINE_ABOVE_GAP * s);
        if (above) {
          const aboveCover = productCover(grow(above.block, 16 * s, canvas), product);
          if (aboveCover <= coverLimit) {
            reasons.push(`headline: the title was set smaller (${above.text.size} px) to stay above the product`);
            geo = above;
            cover = aboveCover;
          }
        }
      }
      const tinted = geo.held ? productCover(geo.held, product) : 0;
      if (pass === 1 && (cover > coverLimit || tinted > HELD_MAX_PRODUCT_COVER)) {
        reasons.push(
          cover > coverLimit
            ? `${layout}: ${geo.look === 'panel' || geo.look === 'curve' ? 'it' : 'the title'} would cover ${Math.round(cover * 100)}% of the product`
            : `${layout}: its ${geo.look === 'headline' ? 'haze would wash out' : 'gradient would darken'} ${Math.round(tinted * 100)}% of the product`,
        );
        const worst = Math.max(cover, tinted);
        if (leastCover === null || worst < leastCover.cover) leastCover = { layout, cover: worst };
        continue;
      }
      let gradient: GradientSpec | null = null;
      let contrast: number;
      let measured = true;
      if (geo.look === 'panel' || geo.look === 'curve') {
        contrast = contrastRatio(hexLuminance(PANEL_FILL), 1);
      } else if (geo.look === 'headline') {
        // The white haze from the top: the weakest alpha that carries the blue.
        const held = geo.held as Rect;
        const holdTo = held.h;
        const fadeTo = Math.min(canvas.height, Math.round(holdTo + HEADLINE_FADE_SHARE * canvas.height));
        const accentLum = hexLuminance(HEADLINE_ACCENT);
        if (grid) {
          contrast = 0;
          for (const alpha of HEADLINE_ALPHAS) {
            gradient = { side: 'top', colour: TITLE_WHITE, alpha, holdTo, fadeTo };
            contrast = gradientContrast(grid, geo.measure, canvas, gradient, accentLum);
            if (contrast >= TITLE_MIN_CONTRAST) break;
          }
          if (contrast < TITLE_MIN_CONTRAST && pass === 1) {
            reasons.push(`${layout}: even under its strongest haze the title reaches only ${Math.round(contrast * 100) / 100}:1, so the next look was tried`);
            continue;
          }
        } else {
          // Not sampled: the middle alpha over black, the worst case for dark letters.
          const alpha = HEADLINE_ALPHAS[2];
          gradient = { side: 'top', colour: TITLE_WHITE, alpha, holdTo, fadeTo };
          contrast = contrastRatio(accentLum, luminanceOf(alpha, alpha, alpha));
          measured = false;
          reasons.push(`${layout}: the picture could not be sampled, so the contrast is the haze's own figure`);
        }
      } else {
        const held = geo.held as Rect;
        const holdTo = geo.side === 'bottom' ? held.h : held.w;
        const fadeTo = Math.min(geo.side === 'bottom' ? canvas.height : canvas.width, Math.round(holdTo + (geo.side === 'bottom' ? LOWER_FADE_SHARE * canvas.height : GRADIENT_FADE_SHARE * canvas.width)));
        gradient = { side: geo.side, colour: gradientColour, alpha: geo.side === 'bottom' ? LOWER_ALPHA : GRADIENT_ALPHA, holdTo, fadeTo };
        if (grid) {
          contrast = gradientContrast(grid, geo.measure, canvas, gradient);
          if (contrast < TITLE_MIN_CONTRAST && pass === 1) {
            reasons.push(`${layout}: under its gradient the title reaches only ${Math.round(contrast * 100) / 100}:1, so the next look was tried`);
            continue;
          }
        } else {
          // Not sampled: the design figure, the near-black colour at full alpha over white, the worst case.
          const [r, g, b] = hexToRgb(gradientColour).map((v) => v * gradient!.alpha + 1 - gradient!.alpha);
          contrast = contrastRatio(1, luminanceOf(r, g, b));
          measured = false;
          reasons.push(`${layout}: the picture could not be sampled, so the contrast is the gradient's own figure`);
        }
      }
      const avoid = geo.look === 'lower-third' ? [grow(geo.block, 16 * s, canvas)] : [geo.footprint, grow(geo.block, 16 * s, canvas)];
      const logo = input.logo === false ? null : logoFor(geo, canvas, grid, product, geo.look === 'panel' ? [] : avoid);
      const badgeR = BADGE_RADIUS_SHARE * canvas.height;
      return {
        title,
        layout,
        look: geo.look,
        side: geo.side,
        canvas,
        panel: geo.panel ? { rect: geo.panel, fill: PANEL_FILL } : null,
        curve: geo.curve ? { rect: geo.curve, side: geo.side as TitleSide, fill: PANEL_FILL } : null,
        badge: logo?.kind === 'badge' ? { cx: geo.side === 'left' ? canvas.width + 0.1 * badgeR : -0.1 * badgeR, cy: canvas.height + 0.1 * badgeR, r: badgeR, fill: BRAND_RED } : null,
        gradient,
        rule: geo.rule ? { rect: geo.rule, fill: BRAND_RED } : null,
        text:
          geo.look === 'headline'
            ? { ...geo.text, colour: HEADLINE_INK, letterSpacing: TITLE_LETTER_SPACING, spans: headlineSpans(geo.text.lines), shadow: HEADLINE_GLOW }
            : { ...geo.text, colour: TITLE_WHITE, letterSpacing: TITLE_LETTER_SPACING },
        big: geo.big,
        second: geo.second,
        logo,
        contrast: Math.round(contrast * 100) / 100,
        measured,
        previous,
        reasons,
      };
    }
  }
  return null;
}

/** The plan as one stored line, so a re-title (title-only redraw) can reproduce the look exactly. */
export interface StoredTitleTreatment {
  layout: TitleLayoutName;
  productBox: [number, number, number, number] | null;
}

export function storedTreatmentOf(plan: TitlePlan, answer: TitleLayoutAnswer | null): StoredTitleTreatment {
  return { layout: plan.layout, productBox: answer?.productBox ?? null };
}

/** Read a stored treatment back; null when it is not one (an AUTO-209 name, garbage, nothing). */
export function parseStoredTreatment(raw: unknown): StoredTitleTreatment | null {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const r = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  if (!r || !isTitleLayout(r.layout)) return null;
  return { layout: r.layout, productBox: parseTitleLayoutAnswer({ productBox: r.productBox }).productBox };
}

/** The look a stored treatment records, for the regenerate rule; null when there is none to read. */
export function previousLookOf(treatment: unknown): TitleLookName | null {
  const stored = parseStoredTreatment(treatment);
  return stored ? layoutLook(stored.layout) : null;
}
