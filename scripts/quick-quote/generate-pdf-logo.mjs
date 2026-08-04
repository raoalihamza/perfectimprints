// One-off generator for the quote PDF's logo (Q-160 follow-up).
//
// WHY THIS EXISTS. The customer quote PAGE renders `public/logo.svg`, so the
// browser's Ctrl+P output carries the real logo. The generated PDF could not:
// @react-pdf/renderer decodes JPEG and PNG only and has no way to load an SVG
// file, so the document shipped with a text wordmark instead. Patrick spotted
// the difference immediately, which is exactly the right instinct - a quote a
// buyer forwards to their boss should carry the mark, not a typeface.
//
// So the SVG is rasterised ONCE, here, to a transparent PNG, and the result is
// checked in as a base64 module (see the output path below). Nothing is
// rendered at request time and nothing is read from disk at request time.
//
// Run with: node scripts/quick-quote/generate-pdf-logo.mjs
// Re-run ONLY if public/logo.svg changes. Uses the Playwright chromium already
// in node_modules, exactly like scripts/seo/generate-og-default.mjs.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

// The logo prints about 150 points wide. 600 px across that is roughly 290 dpi,
// so it stays sharp on paper and when a customer zooms in a PDF viewer, while
// staying small enough to inline. The viewBox is 601.8 x 225.5.
const W = 600;
const H = Math.round((W * 225.5) / 601.8);

const logoSvg = readFileSync(join(root, 'public', 'logo.svg'), 'utf8');

// Transparent background: the PDF places this on its own white header, and an
// opaque white box would show its edges against any future tint.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;background:transparent}
  .logo{width:${W}px}
  .logo svg{width:100%;height:auto;display:block}
</style></head><body><div class="logo">${logoSvg}</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });

const tmpPng = join(root, 'public', 'logo-print.png');
await page.screenshot({
  path: tmpPng,
  clip: { x: 0, y: 0, width: W, height: H },
  type: 'png',
  omitBackground: true,
});
await browser.close();

const bytes = readFileSync(tmpPng);

// The PNG is emitted as a TypeScript module rather than left in public/.
// Reading a file from public/ at request time is not reliable on Vercel (public
// assets are served by the static layer and are not guaranteed to be on the
// function's filesystem), and this is one small image - inlining it removes the
// failure mode entirely, costs no I/O, and only enters the PDF route's bundle.
const out = join(root, 'lib', 'quotes', 'pdf', 'quote-pdf-logo.ts');
const base64 = bytes.toString('base64');
const wrapped = base64.replace(/(.{100})/g, '$1\n');

writeFileSync(
  out,
  `/**
 * The Perfect Imprints logo for the quote PDF, as an inlined PNG (Q-160).
 *
 * GENERATED FILE - do not edit by hand. Rasterised from public/logo.svg by
 * scripts/quick-quote/generate-pdf-logo.mjs; re-run that script if the logo
 * changes. ${W}x${H}, transparent background, ${(bytes.length / 1024).toFixed(1)} KB.
 *
 * It is inlined rather than read from public/ at request time because public
 * assets are served by the static layer and are not guaranteed to be on a
 * serverless function's filesystem. One small image, no I/O, no failure mode,
 * and it only enters the PDF route's bundle.
 *
 * @react-pdf/renderer decodes JPEG and PNG only and cannot load an SVG file,
 * which is why the source SVG cannot simply be handed to the renderer.
 */

/** Intrinsic pixel size, so the document can keep the aspect ratio honest. */
export const QUOTE_PDF_LOGO_WIDTH = ${W};
export const QUOTE_PDF_LOGO_HEIGHT = ${H};

const LOGO_BASE64 = \`
${wrapped}
\`;

/** Decoded once at module load, then reused by every render in this container. */
export const QUOTE_PDF_LOGO: { data: Buffer; format: 'png' } = {
  data: Buffer.from(LOGO_BASE64.replace(/\\s+/g, ''), 'base64'),
  format: 'png',
};
`,
  'utf8',
);

// The PNG itself is not kept: the module above is the only copy the app uses,
// and a second one in public/ would be a thing to forget to regenerate.
unlinkSync(tmpPng);

console.log(
  `Wrote ${out} (${W}x${H}, ${(bytes.length / 1024).toFixed(1)} KB PNG, ${(base64.length / 1024).toFixed(1)} KB base64)`,
);
