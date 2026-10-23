// AUTO-210: inline public/logo.svg as lib/blog-automation/title-logo.ts, so
// the header-title renderer (compose-title.tsx) can draw the logo on a
// serverless function without reading public/ at request time (public assets
// are served by the static layer and are not guaranteed to be on the
// function's filesystem; the quote PDF inlines its logo for the same reason).
// Re-run when the logo changes:  node scripts/blog-automation/generate-title-logo.mjs
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
const out = `/**
 * The Perfect Imprints logo as SVG source, for the header-title renderer
 * (AUTO-210). GENERATED FILE - do not edit by hand. Written by
 * scripts/blog-automation/generate-title-logo.mjs from public/logo.svg;
 * re-run that script when the logo changes.
 *
 * Inlined for the same reason the quote PDF inlines its logo: a serverless
 * function is not guaranteed to have public/ on its filesystem, and a blog
 * header silently losing its logo is exactly the fault worth a few KB of
 * generated source to remove.
 */

/** The logo exactly as public/logo.svg has it (ink #231f20 and red #ea2929), comments and line breaks removed. */
export const TITLE_LOGO_SVG = ${JSON.stringify(svg)};

/** The viewBox that crops the SVG to the P! mark alone (the affiliate line below it is left out). */
export const TITLE_MARK_VIEWBOX = '22 0 180 195';

/** The logo with its ink knocked out to white; PERFECT and the ! stay red. For a dark fill. */
export function titleLogoWhite(): string {
  return TITLE_LOGO_SVG.replace(/fill="#231f20"/g, 'fill="#ffffff"');
}

/** Every path white, for the logo on a brand-red field (the curve look's badge). */
export function titleLogoAllWhite(): string {
  return titleLogoWhite().replace(/fill="#ea2929"/g, 'fill="#ffffff"');
}

/** The P! mark alone: white (ink knocked out) or in colour. */
export function titleMark(white: boolean): string {
  const src = white ? titleLogoWhite() : TITLE_LOGO_SVG;
  return src.replace(/viewBox="[^"]+"/, \`viewBox="\${TITLE_MARK_VIEWBOX}"\`);
}

export function svgDataUri(svg: string): string {
  return \`data:image/svg+xml;base64,\${Buffer.from(svg).toString('base64')}\`;
}
`;
writeFileSync(join(root, 'lib', 'blog-automation', 'title-logo.ts'), out);
console.log(`wrote lib/blog-automation/title-logo.ts (${svg.length} chars of SVG)`);
