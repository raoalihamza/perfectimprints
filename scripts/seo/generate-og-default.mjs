// One-off generator for the social-card fallback image `public/og-default.png`.
//
// X (Twitter) does NOT render SVG card images, so the CTA-only / no-image
// fallback can't be `logo.svg` — it must be a raster. This renders a branded
// 1200×630 OG card (white background, brand-red accent bar, centered PI logo)
// to PNG via the Playwright chromium that's already in node_modules.
//
// Run with: node scripts/seo/generate-og-default.mjs
// Re-run only if the logo or the card design changes; the PNG is committed.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const W = 1200;
const H = 630;
const BRAND_RED = '#E11F1E';

const logoSvg = readFileSync(join(root, 'public', 'logo.svg'), 'utf8');

// Inline the SVG so there's no file:// load dependency; cap its width so it
// sits comfortably centered with whitespace around it.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px}
  body{display:flex;align-items:center;justify-content:center;background:#ffffff;
       font-family:Arial,Helvetica,sans-serif}
  .accent{position:absolute;left:0;right:0;bottom:0;height:14px;background:${BRAND_RED}}
  .logo{width:760px;max-width:78%}
  .logo svg{width:100%;height:auto;display:block}
</style></head><body>
  <div class="logo">${logoSvg}</div>
  <div class="accent"></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
const out = join(root, 'public', 'og-default.png');
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H }, type: 'png' });
await browser.close();

const bytes = readFileSync(out).length;
console.log(`Wrote ${out} (${W}x${H}, ${(bytes / 1024).toFixed(1)} KB)`);
