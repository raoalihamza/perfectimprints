// One-off generator for the font the blog header title is set in (AUTO-209).
//
// WHY THIS EXISTS. The title on a generated header picture is drawn by CODE,
// never by the image model (the model draws marks that look like lettering
// and are not words, and the title must be the post's exact title). Code
// needs a real font to draw with, and nothing in node_modules carries a bold
// one: next/og ships Geist Regular only, and the repo commits no font file.
// So Inter ExtraBold (the site's own typeface, Section 10), subset to the
// characters a title uses, is fetched ONCE here from Google Fonts as a static
// WOFF (satori reads TTF, OTF and WOFF, never WOFF2) and checked in as a
// base64 module, the quote-pdf-logo precedent: nothing is read from disk at
// request time, so a serverless function can never lose the font.
//
// The module also carries the advance width of every character, read from
// the font's own hmtx and cmap tables, so the title can be broken into lines
// and sized EXACTLY before anything is rendered (satori would otherwise
// re-wrap the lines inside a box it measures its own way).
//
// Inter is under the SIL Open Font License 1.1; the license text is written
// beside the module, as the license requires when the font is distributed.
//
// Run with: node scripts/blog-automation/generate-title-font.mjs
// Re-run ONLY to change the weight or the character set. Network access to
// fonts.googleapis.com and raw.githubusercontent.com is needed.
import { writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const WEIGHT = 800;
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
// Typographic quotes and dashes (DeepSeek writes both straight and curly
// apostrophes), the ellipsis, the marks a product name can carry, and the
// accented Latin letters an English title can borrow.
const EXTRA = '\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u2022\u00AE\u2122\u00A9\u00B0\u00BD\u00BC\u00BE\u00D7\u00A0'
  + '\u00E9\u00E8\u00EA\u00EB\u00E1\u00E0\u00E2\u00E4\u00E3\u00E5\u00E7\u00ED\u00EC\u00EE\u00EF\u00F1\u00F3\u00F2\u00F4\u00F6\u00F5\u00FA\u00F9\u00FB\u00FC\u00FD\u00FF'
  + '\u00C9\u00C8\u00C1\u00C0\u00C7\u00D1\u00D3\u00D6\u00DA\u00DC';
const CHARSET = ASCII + EXTRA;
// An old desktop user agent: Google then serves WOFF, not WOFF2.
const UA = 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:30.0) Gecko/20100101 Firefox/30.0';

const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${WEIGHT}&text=${encodeURIComponent(CHARSET)}`, { headers: { 'user-agent': UA } })).text();
const url = /url\((https:[^)]+)\)\s*format\('woff'\)/.exec(css)?.[1];
if (!url) throw new Error(`No WOFF in the Google Fonts answer:\n${css}`);
const woff = Buffer.from(await (await fetch(url)).arrayBuffer());
if (woff.subarray(0, 4).toString('latin1') !== 'wOFF') throw new Error('The font is not a WOFF file');

// -- WOFF tables -------------------------------------------------------------
const tables = {};
const numTables = woff.readUInt16BE(12);
for (let i = 0; i < numTables; i += 1) {
  const o = 44 + i * 20;
  const tag = woff.subarray(o, o + 4).toString('latin1');
  const offset = woff.readUInt32BE(o + 4);
  const compLength = woff.readUInt32BE(o + 8);
  const origLength = woff.readUInt32BE(o + 12);
  const raw = woff.subarray(offset, offset + compLength);
  tables[tag] = compLength < origLength ? inflateSync(raw) : raw;
}
for (const t of ['head', 'hhea', 'hmtx', 'cmap', 'OS/2']) if (!tables[t]) throw new Error(`The font has no ${t} table`);
if (tables.fvar) throw new Error('The font is a variable font; satori needs a static instance');

const unitsPerEm = tables.head.readUInt16BE(18);
const ascender = tables.hhea.readInt16BE(4);
const descender = tables.hhea.readInt16BE(6);
const numberOfHMetrics = tables.hhea.readUInt16BE(34);
const os2 = tables['OS/2'];
const usWeightClass = os2.readUInt16BE(4);
if (usWeightClass !== WEIGHT) throw new Error(`Expected weight ${WEIGHT}, the font says ${usWeightClass}`);
const capHeight = os2.readUInt16BE(0) >= 2 ? os2.readInt16BE(88) : Math.round(unitsPerEm * 0.727);

function advanceOf(glyph) {
  const i = Math.min(glyph, numberOfHMetrics - 1);
  return tables.hmtx.readUInt16BE(i * 4);
}

// cmap: the Windows Unicode BMP subtable, format 4.
const cmap = tables.cmap;
let sub = -1;
for (let i = 0; i < cmap.readUInt16BE(2); i += 1) {
  const o = 4 + i * 8;
  const platform = cmap.readUInt16BE(o);
  const encoding = cmap.readUInt16BE(o + 2);
  const off = cmap.readUInt32BE(o + 4);
  if (platform === 3 && encoding === 1 && cmap.readUInt16BE(off) === 4) sub = off;
}
if (sub < 0) throw new Error('No format 4 Unicode cmap subtable');
const segX2 = cmap.readUInt16BE(sub + 6);
const endBase = sub + 14;
const startBase = endBase + segX2 + 2;
const deltaBase = startBase + segX2;
const rangeBase = deltaBase + segX2;
function glyphOf(code) {
  for (let s = 0; s < segX2 / 2; s += 1) {
    const end = cmap.readUInt16BE(endBase + s * 2);
    if (code > end) continue;
    const start = cmap.readUInt16BE(startBase + s * 2);
    if (code < start) return 0;
    const delta = cmap.readInt16BE(deltaBase + s * 2);
    const rangeOffset = cmap.readUInt16BE(rangeBase + s * 2);
    if (rangeOffset === 0) return (code + delta) & 0xffff;
    const at = rangeBase + s * 2 + rangeOffset + (code - start) * 2;
    const g = cmap.readUInt16BE(at);
    return g === 0 ? 0 : (g + delta) & 0xffff;
  }
  return 0;
}

const advances = {};
const missing = [];
for (const ch of CHARSET) {
  const g = glyphOf(ch.codePointAt(0));
  if (g === 0) {
    missing.push(ch);
    continue;
  }
  advances[ch] = advanceOf(g);
}
if (missing.length > 0) throw new Error(`The subset font lacks: ${missing.map((c) => `U+${c.codePointAt(0).toString(16)}`).join(' ')}`);

const license = await (await fetch('https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt')).text();
if (!/SIL OPEN FONT LICENSE/i.test(license)) throw new Error('The license text did not look like the OFL');

const b64 = woff.toString('base64');
const lines = b64.match(/.{1,120}/g).join('\n');
// Keys are written with \\u escapes for anything outside ASCII, so the generated
// file holds no literal typographic character (the repo's no-em-dash rule).
const keyOf = (ch) => JSON.stringify(ch).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`);
const advanceEntries = Object.entries(advances)
  .map(([ch, w]) => `  ${keyOf(ch)}: ${w},`)
  .join('\n');

const metrics = `/**
 * The metrics of the font the blog header title is set in (AUTO-209): Inter
 * ExtraBold, weight ${WEIGHT}. GENERATED FILE - do not edit by hand. Written
 * by scripts/blog-automation/generate-title-font.mjs, from the same font file
 * as title-font.ts; re-run that script to change the weight or the
 * character set.
 *
 * Pure numbers, separate from the font bytes, so the layout rules
 * (title-layout.ts) measure a title without loading 27 KB of font.
 *
 * TITLE_FONT_ADVANCES is the advance width of every character, in font
 * units, read from the font's own hmtx and cmap tables: the line breaking
 * and sizing measure with it, so the lines are fixed before the renderer
 * sees them. Kerning is not in the table (Inter's kerning narrows pairs; the
 * layout keeps a margin), so a measured line is not narrower than the drawn
 * one. A character absent from this table cannot be drawn, and a title that
 * carries one is not drawn at all (title-layout.ts, titleIsDrawable).
 */

/** Font units per em. */
export const TITLE_FONT_UNITS_PER_EM = ${unitsPerEm};
export const TITLE_FONT_ASCENDER = ${ascender};
export const TITLE_FONT_DESCENDER = ${descender};
export const TITLE_FONT_CAP_HEIGHT = ${capHeight};
export const TITLE_FONT_WEIGHT = ${WEIGHT};
export const TITLE_FONT_FAMILY = 'Inter';

/** Advance width per character, font units. */
export const TITLE_FONT_ADVANCES: Readonly<Record<string, number>> = {
${advanceEntries}
};
`;

const out = `/**
 * The font the blog header title is set in (AUTO-209): Inter ExtraBold
 * (weight ${WEIGHT}), the site's own typeface, as a static WOFF subset to the
 * characters a title uses, inlined. Its metrics are title-font-metrics.ts.
 *
 * GENERATED FILE - do not edit by hand. Written by
 * scripts/blog-automation/generate-title-font.mjs from Google Fonts; re-run
 * that script to change the weight or the character set. ${(woff.length / 1024).toFixed(1)} KB.
 *
 * Inlined rather than read from disk at request time, the quote-pdf-logo
 * precedent: a serverless function is not guaranteed to have a loose file,
 * and a header that silently lost its font would print boxes. Inter is under
 * the SIL Open Font License 1.1, whose text is title-font.OFL.txt beside this
 * file. Copyright (c) 2016 The Inter Project Authors.
 */

const TITLE_FONT_BASE64 = \`
${lines}
\`;

/** The WOFF bytes, for the renderer. */
export function titleFontData(): Buffer {
  return Buffer.from(TITLE_FONT_BASE64.replace(/\\s+/g, ''), 'base64');
}
`;

writeFileSync(join(root, 'lib', 'blog-automation', 'title-font-metrics.ts'), metrics);
writeFileSync(join(root, 'lib', 'blog-automation', 'title-font.ts'), out);
writeFileSync(join(root, 'lib', 'blog-automation', 'title-font.OFL.txt'), license.replace(/\r\n/g, '\n'));
console.log(`Wrote title-font.ts and title-font-metrics.ts: ${woff.length} bytes WOFF, ${Object.keys(advances).length} characters, unitsPerEm ${unitsPerEm}, capHeight ${capHeight}`);
