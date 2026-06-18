/**
 * Fill the /services/company-stores page from Geiger's program-capabilities page.
 *
 *   tsx scripts/seed/fill-company-stores-page.ts             # publish + clear draft
 *   tsx scripts/seed/fill-company-stores-page.ts --dry-run   # print, no write
 *
 * Source content scraped (2026-06-19) from:
 *   https://www.geiger.com/c/program-capabilities
 *
 * Layout mirrors the source page top-to-bottom:
 *   hero (heading + subheading + CTA on top, full banner image below — NOT
 *   overlaid) → Building Blocks (richText + storefront-mockup infographic) →
 *   World-Class Technology & Ecommerce (richText + bullets + product-spread
 *   infographic) → Complete Warehousing & Distribution (imageText: warehouse
 *   photo + bullets) → Global Capabilities (richText + bullets) → closing CTA →
 *   "88% remember" stat banner.
 *
 * Body copy is kept verbatim from the source, lightly adapted: brand references
 * ("Geiger") → Perfect Imprints / "we"/"our". The source page has NO inline
 * product/category links (its only anchor is a Cloudflare-obfuscated email),
 * so there are no affiliate links to rewrite. The Geiger business-development
 * contact line (a named Geiger employee + geiger.com email) is replaced by a
 * Perfect Imprints CTA. Banner + section images are hot-linked via `imageUrl`
 * (the page schema's fallback field) for Patrick to replace in Studio.
 *
 * NOTE for review: several claims on the source are Geiger-infrastructure facts
 * (e.g. "13 field sales offices", "2 UK sales offices … London and Rotterdam",
 * "carbon neutral through our partnership with UPS", specific procurement
 * integrations). They are ported with brand substitution but Patrick should
 * verify/adjust them for Perfect Imprints in Studio.
 *
 * Writes the PUBLISHED document so /services/company-stores renders live, and
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
const bullet = (text: string) => ({
  _type: 'block',
  _key: key(),
  style: 'normal',
  listItem: 'bullet',
  level: 1,
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
const imageText = (heading: string, imageUrl: string, body: Block[]) => ({
  _type: 'imageText',
  _key: key(),
  heading,
  imageUrl,
  body,
  hidden: false,
});
const infographic = (imageUrl: string, caption: string) => ({
  _type: 'infographic',
  _key: key(),
  imageUrl,
  caption,
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
    _id: 'page-company-stores',
    _type: 'page' as const,
    title: 'Company Stores',
    slug: { _type: 'slug' as const, current: 'company-stores' },
    seo: {
      _type: 'seo' as const,
      metaTitle: 'Corporate Company Stores | Perfect Imprints',
      metaDescription:
        'Custom online company stores for your branded merchandise - world-class ecommerce, warehousing, fulfillment, reporting, and global capabilities, managed end to end.',
    },
    sections: [
      // --- Hero --------------------------------------------------------------
      heroBanner(
        'Corporate Company Stores',
        'A branded online store for your team - built, hosted, and managed end to end.',
        `${IMG_BASE}/corporatePrograms_hero.jpg`,
        QUOTE_CTA,
      ),

      // --- Building Blocks ---------------------------------------------------
      richText('Building Blocks for the Best Company Store', [
        para(
          'Perfect Imprints offers superior branding solutions tailor-designed for you with our world-class technology, ecommerce, complete warehousing and distribution solutions, and global capabilities. Experience matters, and we have built a reputation by being the best.',
        ),
      ]),
      infographic(
        `${IMG_BASE}/corporatePrograms_websites.jpg`,
        'Your promo store, built for desktop, tablet, and mobile',
      ),

      // --- World-Class Technology & Ecommerce -------------------------------
      richText('World-Class Technology and Award-Winning Ecommerce', [
        para(
          'Perfect Imprints designs, creates and maintains mobile-friendly ecommerce websites, hosted internally and fully integrated with our systems. Our unrivaled information technology team has a perfect record integrating ecommerce sites with our clients’ procurement systems.',
        ),
        para(
          'We custom design each site to match the personality and unique culture of the client. We will promote your brand through a shopping tool that is feature rich, yet technically simple and intuitive for the end user.',
        ),
        para('Build your company store with us for:'),
        bullet('Mobile responsive website perfectly suited to your needs.'),
        bullet(
          'Support for a wide range of procurement systems including Ariba, Coupa, Oracle, PeopleSoft and EqualLevel.',
        ),
        bullet('Curated product collections and seasonal updating with new merchandise.'),
        bullet('Dedicated toll-free customer service number.'),
        bullet('US-based call center services including live chat during full business day.'),
        bullet('Online reporting portal for on-demand analytics.'),
        bullet('Permission-based email marketing services.'),
        bullet('Financing of inventory.'),
      ]),
      infographic(
        `${IMG_BASE}/corporatePrograms_products.jpg`,
        'Branded apparel, drinkware, tech, and more',
      ),

      // --- Complete Warehousing & Distribution (image + text) ---------------
      imageText('Complete Warehousing and Distribution Solutions', `${IMG_BASE}/corporatePrograms_warehouse.jpg`, [
        para(
          'Our state-of-the-art distribution center provides many benefits to our clients. While warehousing, storage, pick/pack and ship services are widespread features, we offer an extensive package of additional services you won’t find anywhere else:',
        ),
        bullet(
          'Cubiscan technology to compute accurate shipping charges and reduce wasteful excess packaging.',
        ),
        bullet('Certified hazardous materials shipper.'),
        bullet('Custom kitting and special packaging capabilities.'),
        bullet('100% carbon neutral through our partnership with UPS.'),
        bullet('Real-time inventory visibility.'),
        bullet('In-house embroidery services.'),
        bullet('Print services.'),
      ]),

      // --- Global Capabilities ----------------------------------------------
      richText('Global Capabilities', [
        para(
          'Perfect Imprints’ global footprint and network of partnerships facilitate smooth and secure international sourcing and shipping. Our headquarters and distribution center are backed up by:',
        ),
        bullet('13 field sales offices.'),
        bullet('2 UK sales offices and distribution centers in London and Rotterdam, Netherlands.'),
        bullet(
          'Close partnerships with top distributors and suppliers with offices and factories around the globe.',
        ),
        bullet('A global technology platform that is accessible in any part of the world.'),
      ]),

      // --- Closing CTA (replaces Geiger BD contact line) --------------------
      ctaBlock(
        'Interested in a company store?',
        'Looking to work with a company known for award-winning technology and a proven track record of running successful programs with outstanding service and creativity? Contact us and our team will help you build the right program.',
        [QUOTE_CTA],
      ),

      // --- Stat banner ------------------------------------------------------
      statBanner('red', '88% of people remember', 'the advertiser on a promotional product.'),
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
  await client.delete('drafts.page-company-stores').catch((e: unknown) => {
    console.log(`  (no draft to delete: ${(e as Error).message})`);
  });
  console.log(`  cleared drafts.page-company-stores`);
  console.log('\nDone. /services/company-stores is now populated and published.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
