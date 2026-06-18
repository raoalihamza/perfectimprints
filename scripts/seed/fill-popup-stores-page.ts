/**
 * Fill the /services/popup-stores page (adapted from Geiger's Expo page).
 *
 *   tsx scripts/seed/fill-popup-stores-page.ts             # publish + clear draft
 *   tsx scripts/seed/fill-popup-stores-page.ts --dry-run   # print, no write
 *
 * Source structure referenced (2026-06-19) from:
 *   https://www.geiger.com/c/geiger-expo
 *
 * ADAPTATION (not a faithful port — chosen with Patrick). Geiger's page is about
 * Geiger's own in-person trade-show "Expo Customer Shows" with a real dated event
 * schedule and a Geiger HubSpot registration form — none of which can be published
 * as Perfect Imprints content. So this reuses the page STRUCTURE (hero → why →
 * more-ways cards → upcoming events → FAQ → CTA) but rewrites the copy for a
 * Perfect Imprints "Pop-Up Stores & Events" service:
 *  - Geiger's dated expo schedule + "more cities coming soon" → DROPPED. Replaced
 *    by an EMPTY, editable `eventList` ("Scheduled Events") for Patrick to fill
 *    with PI's own events (renders nothing until populated).
 *  - "Register Now" → Geiger HubSpot form → replaced with /contact CTAs.
 *  - The "more ways to get inspired" cross-links now point at OUR service pages
 *    (/services/kitting, /services/company-stores, /services/custom-products).
 *  - No Geiger-branded expo marketing images are used; image slots are left empty
 *    for Patrick to add PI pop-up/event photos in Studio.
 *
 * Writes the PUBLISHED document so /services/popup-stores renders live, and
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

const heroBanner = (heading: string, subheading: string, cta: { label: string; href: string }) => ({
  _type: 'heroBanner',
  _key: key(),
  heading,
  subheading,
  // No image: heading/subheading/CTA render on their own (Patrick can add a
  // pop-up/event photo in Studio). Not overlaid.
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
interface Card {
  title: string;
  text: string;
  ctaLabel: string;
  ctaHref: string;
}
const cardGrid = (heading: string, columns: number, cards: Card[]) => ({
  _type: 'cardGrid',
  _key: key(),
  heading,
  columns,
  cards: cards.map((c) => ({
    _key: key(),
    title: c.title,
    text: c.text,
    ctaLabel: c.ctaLabel,
    ctaHref: c.ctaHref,
  })),
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
const faqAccordion = (heading: string, items: { question: string; answer: string }[]) => ({
  _type: 'faqAccordion',
  _key: key(),
  heading,
  items: items.map((i) => ({ _key: key(), question: i.question, answer: i.answer })),
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
    _id: 'page-popup-stores',
    _type: 'page' as const,
    title: 'Popup Stores',
    slug: { _type: 'slug' as const, current: 'popup-stores' },
    seo: {
      _type: 'seo' as const,
      metaTitle: 'Pop-Up Stores & Events | Perfect Imprints',
      metaDescription:
        'Launch limited-time pop-up stores and branded in-person events. We help you plan, stock, and fulfill memorable brand experiences for launches, campaigns, and employee programs.',
    },
    sections: [
      // --- Hero (no image — Patrick can add a pop-up/event photo) -----------
      heroBanner(
        'Pop-Up Stores & Events',
        'Where your brand meets your people. We help you launch limited-time pop-up stores and in-person events that put your branded merchandise directly in your customers’ and employees’ hands.',
        QUOTE_CTA,
      ),

      // --- Why host ---------------------------------------------------------
      richText('Why Host a Pop-Up Store or Event?', [
        para(
          'Pop-up stores and branded events are a powerful way to showcase promotional products, connect your team and customers with merchandise in person, and create memorable brand moments. We help you plan, stock, and run limited-time experiences for product launches, campaigns, employee appreciation, and gifting programs.',
        ),
        bullet(
          'Showcase products in person: apparel, drinkware, technology, gifts, office products, and more.',
        ),
        bullet(
          'Connect with your audience: let employees and customers see, choose, and order the items they want.',
        ),
        bullet(
          'Create momentum: drive excitement for product launches, campaigns, events, and seasonal programs.',
        ),
      ]),

      // --- More ways we can help (cross-links to our other services) --------
      cardGrid('More Ways We Can Help', 3, [
        {
          title: 'Kitting & Fulfillment',
          text: 'Streamline onboarding, events, and gifting with fully managed kitting and distribution solutions.',
          ctaLabel: 'Explore Kitting',
          ctaHref: '/services/kitting',
        },
        {
          title: 'Company Stores',
          text: 'Give your team an always-on branded store with ecommerce, warehousing, and fulfillment built in.',
          ctaLabel: 'Explore Company Stores',
          ctaHref: '/services/company-stores',
        },
        {
          title: 'Custom Products',
          text: 'Create merchandise tailored to your brand, audience, and goals with support from our product experts.',
          ctaLabel: 'Explore Custom Products',
          ctaHref: '/services/custom-products',
        },
      ]),

      // --- Upcoming events: intro + EMPTY editable scaffold -----------------
      richText('Upcoming Pop-Up Stores & Events', [
        para(
          'We host and support pop-up stores and in-person events throughout the year. Contact us for our current calendar, or to plan a pop-up experience of your own — we’ll help with everything from product selection to on-site setup and fulfillment.',
        ),
      ]),
      // Empty on purpose: renders nothing live until Patrick adds events in Studio.
      eventList('Scheduled Events', []),

      // --- FAQ --------------------------------------------------------------
      faqAccordion('Frequently Asked Questions About Pop-Up Stores & Events', [
        {
          question: 'What is a pop-up store?',
          answer:
            'A pop-up store is a limited-time online or in-person shop — ideal for an event, campaign, or product launch. Recipients order the items they want during the window, and we handle production and fulfillment.',
        },
        {
          question: 'Who are pop-up stores and events for?',
          answer:
            'Marketing teams, HR teams, event planners, and anyone looking to engage employees or customers with branded merchandise for launches, appreciation programs, giveaways, and company events.',
        },
        {
          question: 'What products can be featured?',
          answer:
            'Branded apparel, drinkware, technology items, office products, gifts, wellness products, bags, and other promotional items designed to support brand visibility and engagement.',
        },
        {
          question: 'Do you handle fulfillment?',
          answer:
            'Yes. We can combine your pop-up store or event with kitting, warehousing, and drop shipping so orders are produced, packed, and delivered for you.',
        },
        {
          question: 'How do we get started?',
          answer:
            'Contact us with your goals and timeline, and our team will help you plan the right pop-up store or event.',
        },
      ]),

      // --- Closing CTA ------------------------------------------------------
      ctaBlock(
        'Ready to plan a pop-up?',
        'Tell us about your project and our team will help you build a pop-up store or event that fits your brand and timeline.',
        [QUOTE_CTA],
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
  await client.delete('drafts.page-popup-stores').catch((e: unknown) => {
    console.log(`  (no draft to delete: ${(e as Error).message})`);
  });
  console.log(`  cleared drafts.page-popup-stores`);
  console.log('\nDone. /services/popup-stores is now populated and published.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
