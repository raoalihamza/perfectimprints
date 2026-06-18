/**
 * Fill the /services/kitting page from Geiger's kitting services page.
 *
 *   tsx scripts/seed/fill-kitting-page.ts             # publish + clear draft
 *   tsx scripts/seed/fill-kitting-page.ts --dry-run   # print, no write
 *
 * Source content scraped (2026-06-18) from:
 *   https://www.geiger.com/c/corporate-gift-services-kitting-drop-shipping-and-personalization
 *
 * Layout mirrors the source page top-to-bottom:
 *   hero (heading + subheading + CTA on top, full banner image below — NOT
 *   overlaid) → intro + use-case bullets + a "skip to section" table of contents
 *   (jump links) → for each of Kitting / Drop Shipping / Personalization: richText
 *   (H2 + "What is …?" H3 + intro paragraph) → infographic (the "How … Works"
 *   steps image) → richText (remaining paragraphs) → closing CTA.
 *
 * The body copy is kept verbatim from the source, lightly adapted: brand
 * references ("Geiger") are rewritten to Perfect Imprints / "we"/"our". The
 * INLINE LINKS from the source are preserved: product/category links are rewritten
 * to the affiliate host via lib/affiliate-url.ts (`affiliateUrl`), and the three
 * "skip to section" links become in-page anchors (#kitting / #drop-shipping /
 * #personalization). Only genuine Geiger-page chrome is dropped ("back to contents
 * table" anchors, the source's publish date). The banner + three "steps"
 * infographics are hot-linked via `imageUrl` (the page schema's fallback field)
 * rather than downloaded; Patrick can replace them with PI-owned images in Studio.
 *
 * Unlike scripts/seed/seed-service-pages.ts (which seeds DRAFTS with placeholder
 * copy), this script writes the PUBLISHED document so /services/kitting renders
 * live, and removes the now-stale placeholder draft so Studio is consistent.
 *
 * Requires SANITY_API_TOKEN with write scope. Idempotent (createOrReplace).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';
import { affiliateUrl } from '../../lib/affiliate-url';

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

// A run of inline content: plain string, or a link { t: text, href }.
type Seg = string | { t: string; href: string };
function buildChildren(segs: Seg[]) {
  const markDefs: Array<{ _type: 'link'; _key: string; href: string }> = [];
  const children = segs.map((seg) => {
    if (typeof seg === 'string') return span(seg);
    const mk = key();
    markDefs.push({ _type: 'link', _key: mk, href: seg.href });
    return { _type: 'span', _key: key(), text: seg.t, marks: [mk] };
  });
  return { markDefs, children };
}
const para = (...segs: Seg[]) => {
  const { markDefs, children } = buildChildren(segs);
  return { _type: 'block', _key: key(), style: 'normal', markDefs, children };
};
const h3 = (text: string) => ({
  _type: 'block',
  _key: key(),
  style: 'h3',
  markDefs: [],
  children: [span(text)],
});
const bullet = (...segs: Seg[]) => {
  const { markDefs, children } = buildChildren(segs);
  return { _type: 'block', _key: key(), style: 'normal', listItem: 'bullet', level: 1, markDefs, children };
};

type Block = ReturnType<typeof para>;

const IMG_BASE =
  'https://geiger-public-hosted-files-dev.s3.amazonaws.com/geigerdotcom/theme/aria';

// Geiger inline links → affiliate host (relative paths resolve to patrickblack.geiger.com).
const link = (t: string, geigerPath: string) => ({ t, href: affiliateUrl(geigerPath) });
const jump = (t: string, anchor: string) => ({ t, href: `#${anchor}` });

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
  // false = heading/subheading/CTA on top, full banner image below (not overlaid).
  overlayText: false,
  ctaLabel: cta.label,
  ctaHref: cta.href,
  hidden: false,
});
const richText = (
  heading: string | undefined,
  body: Block[],
  anchorId?: string,
) => ({
  _type: 'richText',
  _key: key(),
  ...(heading ? { heading } : {}),
  ...(anchorId ? { anchorId } : {}),
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
    _id: 'page-kitting',
    _type: 'page' as const,
    title: 'Kitting, Drop Shipping & Personalization',
    slug: { _type: 'slug' as const, current: 'kitting' },
    seo: {
      _type: 'seo' as const,
      metaTitle: 'Kitting, Drop Shipping & Personalization | Perfect Imprints',
      metaDescription:
        'Our services make imprinted gifts easy. We personalize items with individual names, assemble custom gift sets, and ship to each recipient’s doorstep.',
    },
    sections: [
      // --- Hero: title + subheading + CTA on top, banner image below ---------
      heroBanner(
        'Special Gift Services: Kitting, Drop Shipping & Personalization',
        'Our services make imprinted gifts easy - we personalize items with individual names, assemble custom gift sets, and even ship to each recipient’s doorstep.',
        `${IMG_BASE}/Kitting-Drop-Shipping-and-Personalization-Services.jpg`,
        QUOTE_CTA,
      ),

      // --- Intro + use-case bullets + "skip to section" jump links ----------
      richText('Our Special Gift Services', [
        para(
          'Staying in touch and connected with others through inventive means has never been more vital. A custom gift or kit is the perfect way to:',
        ),
        bullet('Say thank you and show appreciation to your customers, teams and clients'),
        bullet('Show staff you value them as they work from home, or as they return to the office'),
        bullet('Welcome new staff'),
        bullet('Celebrate the holidays'),
        bullet('Stay connected with students as they learn remotely'),
        bullet(
          'Promote product launches, marketing campaigns, webinars, tradeshows, and much more!',
        ),
        para(
          'On top of the thousands of ',
          link('customizable gifts', '/b/corporate-gifts'),
          ' available, we offer special services that make it even easier for you to deliver a memorable gift to employees, students, or clients. Read more about our special services below or skip to the section that interests you most:',
        ),
        bullet(jump('Kitting – Assembled Customized Gift Sets', 'kitting')),
        bullet(jump('Drop Shipping – Promotional Products Delivered Directly to Recipients', 'drop-shipping')),
        bullet(jump('Personalization – Individual Names Printed on Gifts', 'personalization')),
      ]),

      // --- Kitting: H2 + H3 + intro → infographic → more paragraphs ---------
      richText(
        'Assembled Customized Gift Sets',
        [
          h3('What is Kitting?'),
          para(
            'Kitting is a comprehensive service that allows you to create highly personalised gift sets for any occasion. Products are selected, customised, and packed to your requirements, including personalised products, gift-wrapping and messages. Having products packed together in a cohesive way creates a truly memorable brand experience. Unlike many of our competitors, we do this all in-house, giving us control over costs, timelines, and quality.',
          ),
        ],
        'kitting',
      ),
      infographic(`${IMG_BASE}/Kitting-Services.jpg`, 'How custom gift kitting works'),
      richText(undefined, [
        para(
          'Another popular idea for kitting is to choose a ',
          link('bag', '/b/bags-and-totes'),
          ', tote, lunch bag, or backpack and put the additional swag items inside the bag for a cohesive presentation. This is especially popular if you are planning an event or tradeshow and plan to give out bags and giveaways to attendees.',
        ),
        para(
          'A customized and well-planned kit can enhance the experience of receiving swag and leave a lasting impression. Plus, kitting can add perceived value and gives you additional ways to display your logo and message. Mix and match products like a ',
          link('blanket', '/p/polar-fleece-blanket-124070?pid=394960'),
          ', ',
          link('mug', '/p/11oz-super-mug-101423?pid=178418'),
          ', ',
          link('notebook', '/p/nature-friendly-notebook-and-pen-110602?pid=212922'),
          ', and ',
          link('earbuds', '/p/wireless-earbud-pods-with-rechargeable-case-122200?pid=372443'),
          '.',
        ),
        para(
          'Having trouble deciding which items to kit together? See our ',
          link('kits and bundles', '/b/kits-and-bundles'),
          ' page for inspiration from pre-selected kits to help spark your creativity, or contact us to get started on a custom kit.',
        ),
      ]),

      // --- Drop Shipping: H2 + H3 + intro → infographic → more paragraphs ---
      richText(
        'Promotional Products Delivered Directly to Recipients',
        [
          h3('What is Drop Shipping?'),
          para(
            'Drop shipping is a shipping method that allows you to directly ship products to multiple locations at the same time. This gives you the flexibility to ship to individual addresses, including to your customer or employee’s homes.',
          ),
        ],
        'drop-shipping',
      ),
      infographic(`${IMG_BASE}/Drop-Shipping.jpg`, 'How promotional gift drop shipping works'),
      richText(undefined, [
        para(
          'Do you have clients or staff across the US? Employees working from home? Students learning remotely? No matter what the case, drop shipping is the answer. All you’ll need is a list of the recipients’ addresses, and your selected products — such as a ',
          link('t-shirt', '/p/favorite-gildan-ultra-cotton-t-shirt-adult-121120?pid=354633'),
          ', ',
          link('water bottle', '/p/16oz-vigo-stainless-insulated-bottle-119590?pid=329055'),
          ', or ',
          link('padfolio', '/p/durahyde-exec-brief-padfolio-104335?pid=177286'),
          ' — will show up on their doorstep. We can combine kitting and drop shipping to create a seamless, easy, end-to-end promotional gifting solution.',
        ),
      ]),

      // --- Personalization: H2 + H3 + intro → infographic → more paragraphs -
      richText(
        'Add a Touch of Class that will Deliver the “Wow” Factor',
        [
          h3('What is Personalization?'),
          para(
            'Beyond adding your logo or message to an item, you can take it to the next level by personalizing it with individuals’ names. Receiving a promotional item creates a positive experience to begin with, but receiving a promotional item with your own name on it creates a truly special gift and memorable experience for your employees and clients.',
          ),
        ],
        'personalization',
      ),
      infographic(`${IMG_BASE}/Personalization.jpg`, 'How product personalization works'),
      richText(undefined, [
        para(
          'Drinkware, metal pens, and bags are some of the top choices to personalize. Among the drinkware items that can be personalized is the best-selling ',
          link('20 oz Himalayan Tumbler', '/p/himalayan-tumbler-119160?pid=329550'),
          '. Especially now, when reducing the spread of germs is a top priority, personalization can also help to ensure items aren’t accidentally mixed up or shared among people. Metal pens like the ',
          link('Maestro Pen', '/p/maestro-pen-103678?pid=176385'),
          ' are the perfect vehicle for personalization, as the laser-engraved imprint provides an elegant look. The ',
          link('Cityside Laptop Backpack', '/p/cityside-laptop-backpack-121470?pid=360061'),
          ' is great for both personal and professional use.',
        ),
      ]),

      // --- Closing CTA ------------------------------------------------------
      ctaBlock(
        'Ready to get started on your next project?',
        'Don’t wait for a holiday or special event to recognize and appreciate staff and customers — every day is a great day to express your gratitude. Contact us for a quote and personal 1-on-1 support from one of our knowledgeable Promotional Products Experts.',
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
  await client.delete('drafts.page-kitting').catch((e: unknown) => {
    console.log(`  (no draft to delete: ${(e as Error).message})`);
  });
  console.log(`  cleared drafts.page-kitting`);
  console.log('\nDone. /services/kitting is now populated and published.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
