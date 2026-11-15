// AUTO-220 (was generate-title-logo.mjs, AUTO-210 / AUTO-212): inline the P!
// mark from public/logo.svg as lib/blog-automation/header-mark.ts, so the
// header stamp (stamp-mark.tsx) can draw it on a serverless function without
// reading public/ at request time (public assets are served by the static
// layer and are not guaranteed to be on the function's filesystem; the quote
// PDF inlines its logo for the same reason).
// Re-run when the logo changes:  node scripts/blog-automation/generate-header-mark.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const svg = readFileSync(join(root, 'public', 'logo.svg'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\r?\n\s*/g, '');
const inks = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/gi)].map((m) => m[1].toLowerCase());
const unique = [...new Set(inks)];
if (!unique.includes('#231f20') || !unique.includes('#ea2929')) {
  throw new Error(`logo.svg no longer uses the ink (#231f20) and red (#ea2929) this module expects; fills: ${unique.join(', ')}`);
}
// AUTO-212: the bare mark is built from the mark's OWN paths, not cut out of
// the full logo with a viewBox. A rectangle cannot hold it cleanly: the P
// starts at x 1.75 (the old crop began at 22 and cut it on every header) and
// the script letter beside the ! reaches x 204 at the height of the !'s dot.
// The mark is the paths that start left of x 200 and above y 190 (the
// affiliate line below starts at y 198) and carry a fill (one unfilled outline
// draws nothing); exactly three: the P and the two parts of the !.
const markPaths = [...svg.matchAll(/<path d="M(-?\d*\.?\d+),?(-?\d*\.?\d+)[^"]*"[^>]*\/>/g)]
  .filter((m) => Number(m[1]) < 200 && Number(m[2]) < 190 && !m[0].includes('fill="none"'))
  .map((m) => m[0]);
if (markPaths.length !== 3 || !markPaths.some((d) => d.includes('#231f20')) || !markPaths.some((d) => d.includes('#ea2929'))) {
  throw new Error(`expected the P! mark to be three paths in ink and red, found ${markPaths.length}`);
}
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 206 172">${markPaths.join('')}</svg>`;
const out = `/**
 * The Perfect Imprints P! mark as SVG source, for the header stamp
 * (AUTO-220; the mark itself is AUTO-212's). GENERATED FILE - do not edit by
 * hand. Written by scripts/blog-automation/generate-header-mark.mjs from
 * public/logo.svg; re-run that script when the logo changes.
 *
 * Inlined for the same reason the quote PDF inlines its logo: a serverless
 * function is not guaranteed to have public/ on its filesystem, and a blog
 * header silently losing its mark is exactly the fault worth a few KB of
 * generated source to remove.
 *
 * The mark is built from its own three paths (AUTO-212). Its ink runs from
 * x 1.75 to 203.5 and y 0.75 to 170.75; the earlier mark was the full logo
 * cut with the viewBox '22 0 180 195', which cut the left of the P off every
 * header that carried it, and no rectangle of the full logo holds the mark
 * cleanly because the script letter beside the ! reaches x 204.
 * mark-placement.ts MARK_ASPECT must match HEADER_MARK_VIEWBOX (a test checks).
 */

export const HEADER_MARK_VIEWBOX = '0 0 206 172';
/** The mark in its own colours: the P in ink (#231f20), the ! in red (#ea2929). */
export const HEADER_MARK_SVG = ${JSON.stringify(markSvg)};

export const HEADER_MARK_INK = '#231f20';
export const HEADER_MARK_RED = '#ea2929';

/**
 * How the mark is coloured for what is behind it:
 *   colour     the P in ink, the ! in red (a light background);
 *   white      the P in white, the ! in red (a dark background);
 *   all-white  every path white (a red or mid-tone background the red would vanish into);
 *   all-ink    every path ink (a light red or pink background).
 */
export type HeaderMarkVariant = 'colour' | 'white' | 'all-white' | 'all-ink';

/**
 * A thin outline hugging the letterforms, for a corner too busy for a bare
 * mark to read (a product, leaves, lettering): light under a dark mark,
 * dark under a white one. Not a box and not a pill: it follows the shape
 * of the P and the !.
 */
export type HeaderMarkHalo = 'light' | 'dark';

/** How far the outline reaches beyond the mark, in the mark's own units; the outlined SVG's viewBox is this much larger all round. */
export const HEADER_MARK_HALO_PAD = 8;

function recolour(svg: string, variant: HeaderMarkVariant): string {
  if (variant === 'white') return svg.replace(/fill="#231f20"/g, 'fill="#ffffff"');
  if (variant === 'all-white') return svg.replace(/fill="#231f20"/g, 'fill="#ffffff"').replace(/fill="#ea2929"/g, 'fill="#ffffff"');
  if (variant === 'all-ink') return svg.replace(/fill="#ea2929"/g, 'fill="#231f20"');
  return svg;
}

/** The mark as SVG. With a halo the viewBox grows by HEADER_MARK_HALO_PAD on every side, so draw it in a box that much larger and the mark itself stays where it was. */
export function headerMarkSvg(variant: HeaderMarkVariant, halo: HeaderMarkHalo | null = null): string {
  const mark = recolour(HEADER_MARK_SVG, variant);
  if (!halo) return mark;
  const paths = mark.replace(/^<svg[^>]*>/, '').replace(/<\\/svg>$/, '');
  const colour = halo === 'light' ? '#ffffff' : '#231f20';
  const width = HEADER_MARK_HALO_PAD * 2 - 2;
  const under = paths.replace(/fill="#[0-9a-f]{6}"/g, 'fill="' + colour + '" stroke="' + colour + '" stroke-width="' + width + '" stroke-linejoin="round"');
  const pad = HEADER_MARK_HALO_PAD;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [-pad, -pad, 206 + pad * 2, 172 + pad * 2].join(' ') + '">' + under + paths + '</svg>';
}

export function svgDataUri(svg: string): string {
  return \`data:image/svg+xml;base64,\${Buffer.from(svg).toString('base64')}\`;
}
`;
writeFileSync(join(root, 'lib', 'blog-automation', 'header-mark.ts'), out);
console.log(`wrote lib/blog-automation/header-mark.ts (${markSvg.length} chars of SVG)`);
