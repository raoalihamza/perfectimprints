/**
 * Seed the four Services pages as section-based `page` drafts (M5-506b).
 *
 *   tsx scripts/seed/seed-service-pages.ts             # create/replace drafts
 *   tsx scripts/seed/seed-service-pages.ts --dry-run   # print, no write
 *
 * Creates DRAFT documents (drafts.page-<slug>) so Patrick reviews + publishes in
 * Studio. Each page is scaffolded with the section types in the order shown on
 * the corresponding live reference page, but the copy here is ORIGINAL, generic
 * placeholder text written for Perfect Imprints and the images are intentionally
 * left empty — Patrick replaces both in Studio. This is deliberately NOT a
 * copy-the-source-site seed: we don't reproduce a third party's marketing copy
 * or infographics. The value is the editable structure + working pages.
 *
 * Slugs match the existing Services dropdown routes in lib/nav-data.ts:
 *   kitting · company-stores · popup-stores · custom-products
 *
 * Requires SANITY_API_TOKEN with write scope. Idempotent (createOrReplace).
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
// Loose seed shapes — the runtime payload is validated by the Sanity schema, so
// the builders just need a common element type to keep `sections[]` uniform.
interface SectionSeed {
  _type: string;
  _key: string;
  hidden: boolean;
  [k: string]: unknown;
}
interface PageSeed {
  _id: string;
  _type: 'page';
  title: string;
  slug: { _type: 'slug'; current: string };
  seo: { _type: 'seo'; metaTitle: string; metaDescription: string };
  sections: SectionSeed[];
}

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
const h2 = (text: string) => ({
  _type: 'block',
  _key: key(),
  style: 'h2',
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

const heroBanner = (heading: string, subheading: string) => ({
  _type: 'heroBanner',
  _key: key(),
  heading,
  subheading,
  overlayText: true,
  hidden: false,
});
const richText = (heading: string | undefined, body: Block[]) => ({
  _type: 'richText',
  _key: key(),
  ...(heading ? { heading } : {}),
  body,
  hidden: false,
});
const imageText = (heading: string, body: Block[]) => ({
  _type: 'imageText',
  _key: key(),
  heading,
  body,
  hidden: false,
});
const infographic = (heading: string, caption: string) => ({
  _type: 'infographic',
  _key: key(),
  heading,
  caption,
  hidden: false,
});
const iconFeatures = (
  heading: string,
  columns: number,
  features: { heading: string; text: string }[],
) => ({
  _type: 'iconFeatures',
  _key: key(),
  heading,
  columns,
  features: features.map((f) => ({ _key: key(), heading: f.heading, text: f.text })),
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
const cardGrid = (
  heading: string,
  columns: number,
  cards: { title: string; text: string }[],
) => ({
  _type: 'cardGrid',
  _key: key(),
  heading,
  columns,
  cards: cards.map((c) => ({ _key: key(), title: c.title, text: c.text })),
  hidden: false,
});
const eventList = (
  heading: string,
  events: { city: string; venue: string; date: string; time: string }[],
) => ({
  _type: 'eventList',
  _key: key(),
  heading,
  events: events.map((e) => ({ _key: key(), ...e })),
  hidden: false,
});
const ctaBlock = (
  heading: string,
  subheading: string,
  buttons: { label: string; href: string; formSlug?: string }[],
) => ({
  _type: 'ctaBlock',
  _key: key(),
  heading,
  subheading,
  buttons: buttons.map((b) => ({
    _key: key(),
    label: b.label,
    href: b.href,
    ...(b.formSlug ? { formSlug: b.formSlug } : {}),
  })),
  hidden: false,
});

// P2-FB-002: each service page's quote button opens that service's form
// (seeded by scripts/seed/seed-service-forms.ts) in a popup; the /contact href
// stays as the fallback while the form is unpublished.
const quoteCta = (formSlug: string) => ({ label: 'Request a Quote', href: '/contact', formSlug });

// --- the four pages (original placeholder copy) -----------------------------
function buildPages(): PageSeed[] {
  return [
    {
      _id: 'drafts.page-kitting',
      _type: 'page',
      title: 'Kitting, Drop Shipping & Personalization',
      slug: { _type: 'slug', current: 'kitting' },
      seo: {
        _type: 'seo',
        metaTitle: 'Kitting & Fulfillment Services | Perfect Imprints',
        metaDescription:
          'Custom gift kitting, drop shipping, and personalization. We assemble, pack, and ship branded kits to your recipients so you do not have to.',
      },
      sections: [
        heroBanner(
          'Kitting, Drop Shipping & Personalization',
          'Let our team assemble, pack, and ship your branded gifts — to one address or thousands.',
        ),
        richText('What is Kitting?', [
          para(
            'Kitting bundles several promotional items into one curated, ready-to-give package. Pick the products, the packaging, and an insert message, and we handle the assembly so every recipient gets a consistent, polished kit.',
          ),
          para('Popular kits include a mix of drinkware, apparel, tech, and a printed note card.'),
        ]),
        infographic('How Kitting Works', 'Upload your "How Kitting Works" graphic here.'),
        richText('Drop Shipping', [
          para(
            'Ship promotional products directly to multiple locations at once — including individual employee or customer home addresses — without routing everything through a single office first.',
          ),
        ]),
        infographic('How Drop Shipping Works', 'Upload your "How Drop Shipping Works" graphic here.'),
        richText('Personalization', [
          para(
            'Add individual names or messages to take a branded item from generic to genuinely personal — a memorable touch for employee onboarding, milestones, and client gifts.',
          ),
        ]),
        infographic(
          'How Personalization Works',
          'Upload your "How Personalization Works" graphic here.',
        ),
        ctaBlock(
          'Ready to start a custom kit?',
          'Tell us about your project and our team will help you build the perfect kit.',
          [quoteCta('kitting-quote')],
        ),
      ],
    },
    {
      _id: 'drafts.page-company-stores',
      _type: 'page',
      title: 'Company Stores',
      slug: { _type: 'slug', current: 'company-stores' },
      seo: {
        _type: 'seo',
        metaTitle: 'Corporate Company Stores | Perfect Imprints',
        metaDescription:
          'Custom online company stores for your branded merchandise. Ecommerce, warehousing, fulfillment, and reporting built around your program.',
      },
      sections: [
        heroBanner(
          'Corporate Company Stores',
          'A branded online store for your team, built and managed end to end.',
        ),
        richText('Building Blocks for the Best Company Store', [
          para(
            'We design and run custom online stores for your branded merchandise, so employees, clients, and event teams can order approved gear on demand.',
          ),
        ]),
        iconFeatures('What you get', 3, [
          {
            heading: 'Ecommerce & Technology',
            text: 'A mobile-friendly storefront tailored to your brand, with curated collections and seasonal updates.',
          },
          {
            heading: 'Warehousing & Fulfillment',
            text: 'Inventory storage, pick/pack, and shipping with real-time visibility into stock levels.',
          },
          {
            heading: 'Reporting & Support',
            text: 'Online analytics, dedicated customer service, and permission-based program controls.',
          },
        ]),
        imageText('Complete warehousing and distribution', [
          bullet('Accurate shipping charges and reduced excess packaging.'),
          bullet('Custom kitting and special packaging.'),
          bullet('Real-time inventory visibility.'),
          bullet('In-house decoration and print services.'),
        ]),
        statBanner('red', '88% of people remember the advertiser on a promotional product.', 'Put your brand in their hands.'),
        ctaBlock('Interested in a company store?', 'Contact us to scope a program that fits your team.', [
          quoteCta('company-stores-quote'),
        ]),
      ],
    },
    {
      _id: 'drafts.page-popup-stores',
      _type: 'page',
      title: 'Popup Stores',
      slug: { _type: 'slug', current: 'popup-stores' },
      seo: {
        _type: 'seo',
        metaTitle: 'Popup Stores | Perfect Imprints',
        metaDescription:
          'Limited-time popup stores for events, campaigns, and product launches. Branded merchandise available to order for a set window, then fulfilled for you.',
      },
      sections: [
        heroBanner(
          'Popup Stores',
          'Limited-time branded stores for events, launches, and campaigns.',
        ),
        richText('What is a Popup Store?', [
          para(
            'A popup store is a temporary online shop that opens for a set window — perfect for an event, a campaign, or a product launch. Recipients order the items they want during the window, and we handle production and fulfillment afterward.',
          ),
        ]),
        cardGrid('Great for', 3, [
          { title: 'Events & Conferences', text: 'Let attendees order branded gear ahead of or during the event.' },
          { title: 'Campaign Launches', text: 'Spin up a themed store for a seasonal or product campaign.' },
          { title: 'Team Orders', text: 'Collect sizes and preferences without holding inventory.' },
        ]),
        ctaBlock('Planning an event or launch?', 'We can have your popup store ready quickly.', [
          quoteCta('popup-stores-quote'),
        ]),
      ],
    },
    {
      _id: 'drafts.page-custom-products',
      _type: 'page',
      title: '100% Custom Products',
      slug: { _type: 'slug', current: 'custom-products' },
      seo: {
        _type: 'seo',
        metaTitle: '100% Custom Promotional Products | Perfect Imprints',
        metaDescription:
          'Fully custom promotional products sourced domestically and overseas. Custom shapes, materials, and decoration built to match your brand and budget.',
      },
      sections: [
        heroBanner(
          'Be Unique: 100% Custom Products',
          'Custom-made promotional products sourced to match your brand, budget, and timeline.',
        ),
        richText('Custom Product Solutions', [
          para(
            'When an off-the-shelf item will not do, we create one. We source custom products domestically and overseas and guide you through the process so you get exactly the right item for your need.',
          ),
        ]),
        iconFeatures('How we help', 3, [
          {
            heading: 'International Product Sourcing',
            text: 'Faster, more affordable overseas sourcing through trusted supply partners.',
          },
          {
            heading: 'Global Supply Team',
            text: 'A network of partners that eases shipping, duties, and restricted-item hassles.',
          },
          {
            heading: 'Unique Product Suite',
            text: 'Custom shapes, materials, PMS colors, and decoration — with virtual proofs before you commit.',
          },
        ]),
        statBanner('ink', '300+ associates. Hundreds of promotional consultants.', 'Experience that delivers custom right.'),
        ctaBlock('Have a custom idea?', 'Share your vision and we will help bring it to life.', [
          quoteCta('custom-products-quote'),
        ]),
      ],
    },
  ];
}

async function main(): Promise<void> {
  const pages = buildPages();
  console.log(`Seeding ${pages.length} service page drafts:`);
  for (const p of pages) {
    const visible = (p.sections as { _type: string }[]).map((s) => s._type).join(', ');
    console.log(`  • ${p.title}  (/${p.slug.current})  [${p.sections.length} sections: ${visible}]`);
  }
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE (drafts)'}`);
  if (DRY_RUN) return;

  const client = buildClient();
  for (const p of pages) {
    await client.createOrReplace(p);
    console.log(`  wrote ${p._id}`);
  }
  console.log('\nDone. Review + publish each page in Studio.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
