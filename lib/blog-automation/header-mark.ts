/**
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
export const HEADER_MARK_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 206 172\"><path d=\"M40.5,136.4c4.1.8,9.8,1.1,15.9,1.1,23.3,0,45-6.2,60.4-19.2,11.9-9.7,19.7-23.8,22.6-41,2.9-16.9-1.6-31.1-10.8-39.9-9.8-9.7-26.6-14.8-50.8-14.8s-38.8,1.6-51,3.8L1.9,170.8h32.7l5.9-34.4ZM55.5,49.4c3.6-.8,10.2-1.6,19.3-1.6,22.8,0,34.9,10.7,31.4,30.8-3.7,21.2-20.7,33.2-45.3,33.2s-12-.3-15.8-1.3l10.5-61.2Z\" fill=\"#231f20\"/><path d=\"M179.7,122.9h-49c-.7,0-1.1.2-1.1.9s-.2,1.2-.3,1.8c0,.3,0,.4,0,.7-1.1,6.6-2.2,13.2-3.3,19.8-1.1,6.9-2.3,13.7-3.4,20.6-.3,1.4-.4,2.7-.6,4.1h50.5c.9-5.2,1.8-10.4,2.7-15.6,1.3-7.5,2.5-14.9,3.9-22.3.6-3.3,1.1-6.6,1.8-10h-1.1Z\" fill=\"#ea2929\"/><path d=\"M145,32.6c10.8,11.1,15.2,27.8,12.1,46-1.8,10.5-5.3,19.9-10.2,28.1h34.3c7.5-35.3,14.9-70.6,22.4-105.8h-54c-1.6,10.5-3.2,21.2-4.7,31.7Z\" fill=\"#ea2929\"/></svg>";

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
  const paths = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const colour = halo === 'light' ? '#ffffff' : '#231f20';
  const width = HEADER_MARK_HALO_PAD * 2 - 2;
  const under = paths.replace(/fill="#[0-9a-f]{6}"/g, 'fill="' + colour + '" stroke="' + colour + '" stroke-width="' + width + '" stroke-linejoin="round"');
  const pad = HEADER_MARK_HALO_PAD;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [-pad, -pad, 206 + pad * 2, 172 + pad * 2].join(' ') + '">' + under + paths + '</svg>';
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
