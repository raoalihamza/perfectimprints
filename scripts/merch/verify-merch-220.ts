/**
 * MERCH-220: live verification of the shipping figures Google is handed on
 * every /products/<slug> page. THIS IS THE CHECK THAT READS WHAT GOOGLE READS.
 *
 *   pnpm verify:merch-220                                  # production, read-only
 *   pnpm verify:merch-220 -- --site https://dev.perfectimprints.com
 *   pnpm verify:merch-220 -- --ceiling 500 --limit 20
 *
 * It fetches every /products/ URL in the deployed sitemap, parses the Product
 * JSON-LD out of the raw HTML (exactly the bytes Googlebot receives), reads
 * the CURRENT shipping settings from the public Sanity dataset, and checks:
 *
 *   1. the emitted `shippingRate` equals an INDEPENDENT recomputation of the
 *      settings percentage of the emitted `price`, in integer cents with
 *      half-up rounding, done here with BigInt rather than by importing the
 *      site's own function (a check that shares its arithmetic with the thing
 *      it checks proves nothing);
 *   2. the rate never exceeds the price and never exceeds a stated ceiling;
 *   3. `handlingTime` equals the production time the PAGE ITSELF prints
 *      ("Production time: 7 days"), or the settings fallback when the page
 *      prints none, and `transitTime` / `shippingDestination` equal the
 *      settings or are absent;
 *   4. nothing that MERCH-100 removed has come back (no referenceQuantity,
 *      eligibleQuantity or UnitPriceSpecification anywhere in the Product);
 *   5. a settings percentage between 0 and 1 is flagged as a fraction typed
 *      where a percentage was meant (0.15 for 15%), because that is the one
 *      unit slip the price ceiling cannot see.
 *
 * MERCH-100's $432.50 x 50 = $21,625 was visible in the markup from day one
 * and nobody read it back; this script exists so the next figure is read back
 * before Google does. It makes NO writes anywhere: GET requests to the site
 * and one anonymous GROQ read. Exit code 1 on any failure. Writes a report to
 * docs/merch/MERCH-220-verification-report.md.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// -- Flags -------------------------------------------------------------------

function flagValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return undefined;
}

const PROJECT_ROOT = resolve(__dirname, '../..');
const REPORT_PATH = resolve(PROJECT_ROOT, 'docs/merch/MERCH-220-verification-report.md');

function loadDotEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

// Deliberately NOT read from NEXT_PUBLIC_SITE_URL: a developer's .env.local
// points that at localhost (the Studio nonce workaround), and a verification
// of what Google reads must default to the deployed production site.
const SITE = (flagValue('--site') ?? 'https://www.perfectimprints.com').replace(/\/$/, '');
/**
 * The most a single order's shipping may be told to Google, in USD. At 15%
 * the dearest live minimum order ($1,944.96) gives $291.74, so 500 leaves
 * headroom for a higher percentage or a dearer product while still catching
 * a slip of one order of magnitude on the CHEAPEST product ($143.28 x 15
 * would be $2,149). Raise it deliberately, with the reason, never quietly.
 */
const CEILING_USD = Number(flagValue('--ceiling') ?? 500);
const LIMIT = Number(flagValue('--limit') ?? 0);
const PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? 'ii96lcy9';
const DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';

// -- Independent arithmetic --------------------------------------------------

/** USD (as emitted, a JSON number) to integer cents, half up. */
function centsOf(usd: number): bigint {
  // Go through the decimal string so 199.5 is exactly 19950 and not 19949.999.
  const fixed = usd.toFixed(2);
  return BigInt(fixed.replace('.', ''));
}

/** percentage of priceCents, rounded half up, all in BigInt. */
function expectedRateCents(priceCents: bigint, percentage: number): bigint {
  const pctHundredths = BigInt(Math.round(percentage * 100));
  return (priceCents * pctHundredths + 5000n) / 10000n;
}

function usd(cents: bigint): string {
  const s = cents.toString().padStart(3, '0');
  return `$${s.slice(0, -2)}.${s.slice(-2)}`;
}

// -- Types -------------------------------------------------------------------

interface Settings {
  orderPercentage: number | null;
  flatRate: number | null;
  destinationCountry: string | null;
  handlingDaysMin: number | null;
  handlingDaysMax: number | null;
  transitDaysMin: number | null;
  transitDaysMax: number | null;
}

interface PageResult {
  slug: string;
  status: number;
  price: number | null;
  rate: number | null;
  visibleProductionDays: number | null;
  handling: { min: number; max: number } | null;
  transit: { min: number; max: number } | null;
  destination: string | null;
  failures: string[];
}

// -- Helpers -----------------------------------------------------------------

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function readSettings(): Promise<Settings> {
  const groq = '*[_type == "globalSettings"][0].shippingPolicy';
  const url = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}?query=${encodeURIComponent(groq)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sanity read failed: HTTP ${res.status}`);
  const raw = ((await res.json()) as { result?: Record<string, unknown> | null }).result ?? {};
  const pct = num(raw.orderPercentage);
  return {
    orderPercentage: pct !== null && pct >= 0 && pct <= 100 ? pct : null,
    flatRate: (() => {
      const r = num(raw.flatRate);
      return r !== null && r >= 0 ? r : null;
    })(),
    destinationCountry:
      typeof raw.destinationCountry === 'string' && /^[A-Za-z]{2}$/.test(raw.destinationCountry.trim())
        ? raw.destinationCountry.trim().toUpperCase()
        : null,
    handlingDaysMin: num(raw.handlingDaysMin),
    handlingDaysMax: num(raw.handlingDaysMax),
    transitDaysMin: num(raw.transitDaysMin),
    transitDaysMax: num(raw.transitDaysMax),
  };
}

/** GET with three attempts: a single ECONNRESET on page 90 of 158 must not end the run. */
async function fetchText(url: string): Promise<{ status: number; text: string }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'verify-merch-220 (read-only)' } });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError;
}

function range(min: number | null, max: number | null): { min: number; max: number } | null {
  if (min === null || max === null || min < 0 || max < 0 || min > max) return null;
  return { min, max };
}

async function productUrls(): Promise<string[]> {
  const res = await fetchText(`${SITE}/sitemap.xml`);
  if (res.status !== 200) throw new Error(`sitemap fetch failed: HTTP ${res.status}`);
  const xml = res.text;
  // Anchored on the site origin: a loose `/products/` match would also take
  // `/cat/pet-products/activity/baseball` (812 hits instead of 158).
  const escaped = SITE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<loc>(${escaped}/products/[^<]+)</loc>`, 'g');
  const urls = [...xml.matchAll(pattern)].map((m) => m[1]);
  return [...new Set(urls)].sort();
}

function productBlock(html: string): Record<string, any> | null {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const b of blocks) {
    try {
      const j = JSON.parse(b);
      if (j && j['@type'] === 'Product') return j;
    } catch {
      /* not this one */
    }
  }
  return null;
}

/** "Production time:</dt><dd>7<!-- --> <!-- -->days" as the page renders it. */
function visibleProductionDays(html: string): number | null {
  const m = html.match(/Production time:<\/dt><dd[^>]*>\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function deepKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.add(k);
      deepKeys(v, out);
    }
  }
  return out;
}

async function checkPage(url: string, settings: Settings): Promise<PageResult> {
  const slug = url.split('/products/')[1];
  const failures: string[] = [];
  const res = await fetchText(url);
  const html = res.text;
  const result: PageResult = {
    slug,
    status: res.status,
    price: null,
    rate: null,
    visibleProductionDays: visibleProductionDays(html),
    handling: null,
    transit: null,
    destination: null,
    failures,
  };
  if (res.status !== 200) {
    failures.push(`HTTP ${res.status}`);
    return result;
  }
  if (html.includes('BAILOUT_TO_CLIENT_SIDE_RENDERING')) failures.push('CSR bailout marker in the static HTML');

  const product = productBlock(html);
  if (!product) {
    failures.push('no Product JSON-LD');
    return result;
  }
  for (const forbidden of ['referenceQuantity', 'eligibleQuantity', 'UnitPriceSpecification', 'priceSpecification']) {
    if (deepKeys(product).has(forbidden)) failures.push(`MERCH-100 regression: "${forbidden}" is back`);
  }

  const offer = product.offers as Record<string, any> | undefined;
  if (!offer) {
    // A product with no usable tier gets no offer by design; nothing to check.
    return result;
  }
  const price = num(offer.price);
  result.price = price;
  if (price === null) {
    failures.push('offer has no numeric price');
    return result;
  }
  const details = (offer.shippingDetails ?? {}) as Record<string, any>;
  const rate = num(details.shippingRate?.value);
  result.rate = rate;
  result.destination = details.shippingDestination?.addressCountry ?? null;
  const h = details.deliveryTime?.handlingTime;
  const t = details.deliveryTime?.transitTime;
  result.handling = h ? { min: h.minValue, max: h.maxValue } : null;
  result.transit = t ? { min: t.minValue, max: t.maxValue } : null;

  // 1. The rate, independently recomputed.
  if (settings.orderPercentage !== null) {
    const expected = expectedRateCents(centsOf(price), settings.orderPercentage);
    if (rate === null) failures.push(`no shippingRate emitted; expected ${usd(expected)} (${settings.orderPercentage}% of $${price.toFixed(2)})`);
    else if (centsOf(rate) !== expected) failures.push(`shippingRate $${rate.toFixed(2)} but ${settings.orderPercentage}% of $${price.toFixed(2)} is ${usd(expected)}`);
    if (details.shippingRate && details.shippingRate.currency !== 'USD') failures.push('shippingRate currency is not USD');
  } else if (settings.flatRate !== null) {
    if (rate !== settings.flatRate) failures.push(`shippingRate ${rate} but the flat rate setting is ${settings.flatRate}`);
  } else if (rate !== null) {
    failures.push(`shippingRate ${rate} emitted with no rate in the settings`);
  }
  // 2. The ceilings.
  if (rate !== null && rate > price) failures.push(`shippingRate $${rate.toFixed(2)} EXCEEDS the price $${price.toFixed(2)}`);
  if (rate !== null && rate > CEILING_USD) failures.push(`shippingRate $${rate.toFixed(2)} is above the ceiling of $${CEILING_USD}`);

  // 3. Handling = the page's own figure, else the settings fallback.
  const expectedHandling =
    result.visibleProductionDays !== null && result.visibleProductionDays > 0
      ? { min: result.visibleProductionDays, max: result.visibleProductionDays }
      : range(settings.handlingDaysMin, settings.handlingDaysMax);
  if (JSON.stringify(result.handling) !== JSON.stringify(expectedHandling)) {
    failures.push(`handlingTime ${JSON.stringify(result.handling)} but the page prints ${result.visibleProductionDays ?? 'no production time'} and the fallback is ${JSON.stringify(range(settings.handlingDaysMin, settings.handlingDaysMax))}`);
  }
  const expectedTransit = range(settings.transitDaysMin, settings.transitDaysMax);
  if (JSON.stringify(result.transit) !== JSON.stringify(expectedTransit)) {
    failures.push(`transitTime ${JSON.stringify(result.transit)} but the settings say ${JSON.stringify(expectedTransit)}`);
  }
  if (result.destination !== settings.destinationCountry) {
    failures.push(`shippingDestination ${result.destination} but the settings say ${settings.destinationCountry}`);
  }
  return result;
}

// -- Main --------------------------------------------------------------------

async function main(): Promise<void> {
  const started = new Date();
  const settings = await readSettings();
  const globalFailures: string[] = [];
  if (settings.orderPercentage !== null && settings.orderPercentage > 0 && settings.orderPercentage < 1) {
    globalFailures.push(
      `the settings percentage is ${settings.orderPercentage}, which reads as a FRACTION typed where a percentage was meant (0.15 for 15%). The field takes the number of percent: 15.`,
    );
  }
  console.log(`site ${SITE}`);
  console.log(`settings ${JSON.stringify(settings)}`);
  console.log(`ceiling $${CEILING_USD}`);

  let urls = await productUrls();
  if (LIMIT > 0) urls = urls.slice(0, LIMIT);
  console.log(`checking ${urls.length} product pages`);

  const results: PageResult[] = [];
  for (let i = 0; i < urls.length; i += 1) {
    results.push(await checkPage(urls[i], settings));
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${urls.length}`);
  }

  const failed = results.filter((r) => r.failures.length > 0);
  const priced = results.filter((r) => r.price !== null);
  const rated = results.filter((r) => r.rate !== null).sort((a, b) => a.rate! - b.rate!);
  const lowest = rated[0];
  const highest = rated[rated.length - 1];

  const lines: string[] = [
    '# MERCH-220 verification report',
    '',
    `Run ${started.toISOString()} against ${SITE}. Read-only: GET requests to the site and one anonymous GROQ read; nothing was written anywhere.`,
    '',
    '## Settings read from Sanity',
    '',
    '```json',
    JSON.stringify(settings, null, 2),
    '```',
    '',
    '## Summary',
    '',
    `- Product pages in the sitemap: ${results.length}`,
    `- Pages with an offer price: ${priced.length}`,
    `- Pages emitting a shippingRate: ${rated.length}`,
    `- Ceiling: $${CEILING_USD}`,
    lowest ? `- Lowest shipping figure published: $${lowest.rate!.toFixed(2)} on ${lowest.slug} (price $${lowest.price!.toFixed(2)})` : '- Lowest shipping figure published: none (no rate in the settings)',
    highest ? `- Highest shipping figure published: $${highest.rate!.toFixed(2)} on ${highest.slug} (price $${highest.price!.toFixed(2)})` : '- Highest shipping figure published: none',
    `- Pages failing a check: ${failed.length}`,
    `- Settings-level failures: ${globalFailures.length}`,
    '',
  ];
  if (globalFailures.length) lines.push('## Settings-level failures', '', ...globalFailures.map((f) => `- ${f}`), '');
  if (failed.length) {
    lines.push('## Failing pages', '');
    for (const r of failed) lines.push(`- **${r.slug}**: ${r.failures.join('; ')}`);
    lines.push('');
  }
  lines.push(
    '## Every page',
    '',
    '| Page | Price | Shipping | Page prints | handlingTime | transitTime | Destination | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const r of results.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))) {
    lines.push(
      `| ${r.slug} | ${r.price === null ? '' : `$${r.price.toFixed(2)}`} | ${r.rate === null ? 'none' : `$${r.rate.toFixed(2)}`} | ${r.visibleProductionDays === null ? 'no production time' : `${r.visibleProductionDays} days`} | ${r.handling ? `${r.handling.min} to ${r.handling.max}` : 'none'} | ${r.transit ? `${r.transit.min} to ${r.transit.max}` : 'none'} | ${r.destination ?? 'none'} | ${r.failures.length ? 'FAIL' : 'ok'} |`,
    );
  }
  lines.push(
    '',
    '## What this script cannot see',
    '',
    'Merchant Center. After a deploy that changes these figures, open three products there, one cheap, one middling and one expensive, and read the shipping cost and delivery time Google shows against this table. That is where the multiplied price of MERCH-100 finally became visible.',
    '',
  );
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');

  console.log('');
  console.log(`priced ${priced.length}/${results.length}, rated ${rated.length}, failing ${failed.length}, settings failures ${globalFailures.length}`);
  if (lowest && highest) console.log(`shipping range $${lowest.rate!.toFixed(2)} to $${highest.rate!.toFixed(2)}`);
  for (const g of globalFailures) console.log(`SETTINGS FAIL: ${g}`);
  for (const r of failed) console.log(`FAIL ${r.slug}: ${r.failures.join('; ')}`);
  console.log(`report: ${REPORT_PATH}`);
  if (failed.length || globalFailures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
