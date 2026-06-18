/**
 * Fill the /services/custom-products page from Geiger's custom-products page.
 *
 *   tsx scripts/seed/fill-custom-products-page.ts             # publish + clear draft
 *   tsx scripts/seed/fill-custom-products-page.ts --dry-run   # print, no write
 *
 * Source content scraped (2026-06-19) from:
 *   https://www.geiger.com/c/custom-products
 *
 * Layout mirrors the source page top-to-bottom:
 *   hero ("Be Unique", non-overlay) → "Custom Product Solutions – Global Reach"
 *   intro → 3 icon features (International Product Sourcing / Global Supply Team /
 *   Unique Product Suite) → global-distribution paragraph + 4 capability icon
 *   features (UK distribution, European sourcing, in-house apparel decorating, no
 *   added duties/taxes/shipping) → closing CTA → "300+ associates" stat banner.
 *
 * Body copy is kept close to the source, brand-adapted ("Geiger" → Perfect
 * Imprints / "we"/"our"). The source has NO inline product/category links, so
 * nothing to affiliate-rewrite. Banner + icon images are hot-linked via `imageUrl`
 * for Patrick to replace in Studio.
 *
 * DELIBERATE DEVIATIONS (can't be truthfully rebranded — flagged for review):
 *  - The source's "Geiger made national headlines … acquired UK distributor BTC
 *    Group … Together as GeigerBTC Group …" narrative is a real Geiger corporate
 *    event. It is NOT reproduced as a Perfect Imprints claim; it's replaced with a
 *    generic global-distribution paragraph. The GeigerBTC logo image is dropped.
 *  - The "acquisition of a top overseas distributor" phrase is softened.
 *  - The stat "300 talented associates in Maine and regional field offices. 450
 *    promotional consultants." is Geiger's (Maine = Geiger HQ). Ported as
 *    "300+ talented associates and 450 promotional consultants" (Maine dropped) —
 *    Patrick should confirm/adjust the numbers for Perfect Imprints in Studio.
 *
 * Writes the PUBLISHED document so /services/custom-products renders live, and
 * removes the stale placeholder draft. Idempotent (createOrReplace).
 * Requires SANITY_API_TOKEN with write scope.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');

function loadDotEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

function buildClient(): SanityClient {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID is required.');
  if (!DRY_RUN && !token) throw new Error('SANITY_API_TOKEN (write scope) is required.');
  return createClient({ projectId, dataset, apiVersion: '2024-10-01', useCdn: false, token });
}

// --- portable text + section builders (deterministic keys) ------------------
let _n = 0;
const key = () => `k${++_n}`;
const span = (text: string) => ({ _type: 'span', _key: key(), text, marks: [] as string[] });
const para = (text: string) => ({
  _type: 'block',
  _key: key(),
  style: 'normal',
  markDefs: [],
  children: [span(text)],
});

type Block = ReturnType<typeof para>;

const IMG_BASE =
  'https://s3.amazonaws.com/geiger-public-hosted-files-dev/geigerdotcom/theme/aria';

const heroBanner = (
  heading: string,
  subheading: string,
  imageUrl: string,
  cta: { label: string; href: string },
) => ({
  _type: 'heroBanner',
  _key: key(),
  heading,
  subheading,
  imageUrl,
  overlayText: false,
  ctaLabel: cta.label,
  ctaHref: cta.href,
  hidden: false,
});
const richText = (heading: string | undefined, body: Block[], anchorId?: string) => ({
  _type: 'richText',
  _key: key(),
  ...(heading ? { heading } : {}),
  ...(anchorId ? { anchorId } : {}),
  body,
  hidden: false,
});
interface Feature {
  imageUrl?: string;
  heading: string;
  text?: string;
}
const iconFeatures = (heading: string | undefined, columns: number, features: Feature[]) => ({
  _type: 'iconFeatures',
  _key: key(),
  ...(heading ? { heading } : {}),
  columns,
  features: features.map((f) => ({
    _key: key(),
    ...(f.imageUrl ? { imageUrl: f.imageUrl } : {}),
    heading: f.heading,
    ...(f.text ? { text: f.text } : {}),
  })),
  hidden: false,
});
const statBanner = (background: string, statText: string, subtext: string) => ({
  _type: 'statBanner',
  _key: key(),
  background,
  statText,
  subtext,
  hidden: false,
});
const ctaBlock = (heading: string, subheading: string, buttons: { label: string; href: string }[]) => ({
  _type: 'ctaBlock',
  _key: key(),
  heading,
  subheading,
  buttons: buttons.map((b) => ({ _key: key(), label: b.label, href: b.href })),
  hidden: false,
});

const QUOTE_CTA = { label: 'Request a Quote', href: '/contact' };

function buildPage() {
  return {
    _id: 'page-custom-products',
    _type: 'page' as const,
    title: '100% Custom Products',
    slug: { _type: 'slug' as const, current: 'custom-products' },
    seo: {
      _type: 'seo' as const,
      metaTitle: '100% Custom Promotional Products | Perfect Imprints',
      metaDescription:
        'Fully custom promotional products sourced domestically and globally. Custom shapes, materials, and decoration built to match your brand, budget, and timeline.',
    },
    sections: [
      // --- Hero --------------------------------------------------------------
      heroBanner(
        'Be Unique: 100% Custom Products',
        'Custom-made promotional products sourced to match your brand, budget, and timeline - the only limit is your imagination.',
        `${IMG_BASE}/custom_header.jpg`,
        QUOTE_CTA,
      ),

      // --- Custom Product Solutions – Global Reach --------------------------
      richText('Custom Product Solutions – Global Reach', [
        para(
          'We source custom products both domestically and globally. We help you navigate the global market so you get just the right item created for your unique need, all within the desired budget and timeline. The only limit is your imagination!',
        ),
      ]),

      // --- 3 core capability icon features ----------------------------------
      iconFeatures(undefined, 3, [
        {
          imageUrl: `${IMG_BASE}/custom_icon_intlSourcing.png`,
          heading: 'International Product Sourcing and Shipment',
          text: 'We make international shipping easier, faster, and more affordable. By partnering with top suppliers and established distributors around the globe, we help you reach the global market with confidence.',
        },
        {
          imageUrl: `${IMG_BASE}/custom_icon_globalTeam.png`,
          heading: 'Global Supply Team',
          text: 'We and our top suppliers form a global supply team to bring you well-established, trusted products and services where you live and work. Our global partners open the door to the largest range of promotional offerings around the world. These relationships save time on international shipping and ease the hassle of dealing with weight and dollar restrictions, duties and taxes, and restricted or forbidden items.',
        },
        {
          imageUrl: `${IMG_BASE}/custom_icon_uniqueProduct.png`,
          heading: 'Unique Product Suite',
          text: 'Transform an existing item with unique decorating methods and PMS colors, or create an entirely custom design. We work with you to select the colors, fabric, or materials that best match your brand and product selection. View virtual images of your idea to make sure it matches your vision.',
        },
      ]),

      // --- Global distribution & European reach -----------------------------
      // NOTE: source narrative here is Geiger's BTC Group acquisition — replaced
      // with a generic global-distribution statement (see file header).
      richText('Global Distribution & European Reach', [
        para(
          'Through our global supply partners — including UK-based distribution and direct local product sourcing across Europe — we have strengthened our reach around the world, reducing shipping time and costs for North American and EMEA customers.',
        ),
      ]),
      iconFeatures(undefined, 4, [
        { imageUrl: `${IMG_BASE}/custom_btcIcon_ukBased.png`, heading: 'UK Based Distribution' },
        {
          imageUrl: `${IMG_BASE}/custom_btcIcon_localSourcing.png`,
          heading: 'Direct Local Product Sourcing Within Europe',
        },
        {
          imageUrl: `${IMG_BASE}/custom_btcIcon_apparel.png`,
          heading: 'In-House Apparel Decorating Services',
        },
        {
          imageUrl: `${IMG_BASE}/custom_btcIcon_costs.png`,
          heading: 'No Additional Duties, Taxes, or International Shipping Costs',
        },
      ]),

      // --- Closing CTA ------------------------------------------------------
      ctaBlock(
        'Have a custom idea?',
        'Share your vision and our team will help bring it to life — domestically or anywhere around the globe.',
        [QUOTE_CTA],
      ),

      // --- Stat banner (numbers ported from Geiger — verify for PI) ----------
      statBanner(
        'red',
        '300+ talented associates and 450 promotional consultants',
        'Experience and scale that deliver custom, done right.',
      ),
    ],
  };
}

async function main(): Promise<void> {
  const page = buildPage();
  console.log(
    `Filling /${page.slug.current} (${page.sections.length} sections: ${page.sections
      .map((s) => s._type)
      .join(', ')})`,
  );
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE (publish + clear draft)'}`);
  if (DRY_RUN) {
    console.log(JSON.stringify(page, null, 2));
    return;
  }

  const client = buildClient();
  await client.createOrReplace(page);
  console.log(`  published ${page._id}`);
  await client.delete('drafts.page-custom-products').catch((e: unknown) => {
    console.log(`  (no draft to delete: ${(e as Error).message})`);
  });
  console.log(`  cleared drafts.page-custom-products`);
  console.log('\nDone. /services/custom-products is now populated and published.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
