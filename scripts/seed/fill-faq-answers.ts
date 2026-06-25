/**
 * Fill the seeded FAQ stubs with answers from Perfect Imprints' OWN content
 * (M5-506 follow-up). Answers are sourced from PI's live FAQ page + the policy
 * pages already migrated (Sample Policy, U.S. & International Shipping, Returns &
 * Refunds, Terms, Contact) and PI's service offerings — nothing is fabricated.
 * Questions PI's own content does NOT answer are left BLANK (see UNANSWERED) so
 * Patrick can fill them; they stay unpublished and never surface on /faq.
 *
 *   tsx scripts/seed/fill-faq-answers.ts             # fill + publish
 *   tsx scripts/seed/fill-faq-answers.ts --dry-run   # print, no writes
 *
 * For each answered question this PUBLISHES the faq (creates the published doc,
 * deletes the draft stub) so it appears on /faq and enters the search index.
 * Matches existing faqs by question text, so it never duplicates and preserves
 * any fields Patrick added. Idempotent.
 *
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

// question (must match the seeded text exactly) -> answer (from PI's own content)
const ANSWERS: { q: string; a: string }[] = [
  {
    q: 'How do I choose the right promotional product for my campaign?',
    a: 'Start with your audience, budget, and goal in mind, then browse our categories or use search to compare options. If you would like a hand, our promotional product team is happy to recommend custom and branded products that fit your campaign — just reach out through our Contact page or call 800-773-9472.',
  },
  {
    q: "Can you help me find a product if I don't see it on your site?",
    a: 'Absolutely. We work with thousands of factories across the United States and select overseas manufacturers, so we can source promotional products beyond what is shown online — including 100% custom items made for your brand. Tell us what you are looking for and we will track it down.',
  },
  {
    q: 'Are the products on your site in stock and available right now?',
    a: 'Most promotional products are decorated to order rather than kept in stock, so availability and lead times are shown per product and confirmed when you order. If you have a firm in-hands date, let us know and we will confirm timing before you commit.',
  },
  {
    q: 'Do you offer eco-friendly or made-in-the-USA products?',
    a: 'Yes — you will find eco-friendly and made-in-the-USA promotional products throughout our catalog. Filter a category by those options, or ask our team and we will point you to sustainable and American-made branded items that fit your needs.',
  },
  {
    q: 'Can I order a sample before placing my full order?',
    a: 'Yes. Most products are available as samples — typically for a small product charge plus shipping, often printed with a random logo. If you would like a pre-production sample with your own logo, contact us for pricing (setup, run, product, and shipping charges apply). Samples usually ship within 2-3 business days.',
  },
  {
    q: 'What is the minimum order quantity?',
    a: 'Minimum order quantities vary by product — each product page lists its minimum. We also carry a selection of no-minimum promotional products for smaller orders. If you need a specific quantity, contact us and we will find branded options that fit.',
  },
  {
    q: 'How do I request a quote?',
    a: 'Send us the product you are interested in, the quantity, and your in-hands date through our Contact page, or call 800-773-9472 or email cs@perfectimprints.com. We will get a custom quote back to you quickly.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept Visa, MasterCard, Discover, and American Express, as well as PayPal. ACH payment can also be arranged by phone.',
  },
  {
    q: 'Do you offer price breaks for larger quantities?',
    a: 'Yes — promotional products are priced by quantity, so your per-unit price drops as your order size goes up. You will see the price breaks on each product, and we are glad to quote your specific quantity.',
  },
  {
    q: 'Can I place an order with no minimum quantity?',
    a: 'Yes — we carry a range of no-minimum promotional products you can order in small quantities. Browse our no-minimum options or ask our team for branded items that work for low-quantity orders.',
  },
  {
    q: 'What artwork file formats do you accept?',
    a: 'Vector files are preferred — .eps, .ai, vector .pdf, or .svg created in Adobe Illustrator. For full-color (CMYK) printing, we can also use high-resolution .jpg, .tif, or .psd files. Vector artwork helps your order process fastest.',
  },
  {
    q: 'Will I see a proof before my order goes into production?',
    a: 'Yes. We send a free proof on every custom order for you to approve before production begins — usually the same day you order (sooner when you supply vector artwork). Please review it carefully, since it shows exactly how your imprint will look.',
  },
  {
    q: 'Can you match a specific PMS color?',
    a: 'Yes — we can match a specific PMS color on request. Just include your PMS number with your order and artwork so we can match your brand colors as closely as the product and decoration method allow.',
  },
  {
    q: 'What decoration methods do you offer (screen print, embroidery, laser engraving)?',
    a: 'We offer a full range of decoration methods depending on the product — including screen printing, embroidery, full-color (CMYK) printing, heat transfer, sublimation, and laser engraving/etching. Not sure which is right? Our team and in-house designers can recommend the best option for your branded items.',
  },
  {
    q: 'Do you charge a setup or art fee?',
    a: 'Some orders include a one-time setup charge (and run charges) depending on the product and decoration method — these are always shown in your quote, never hidden. Our in-house designers can also help prepare or create your artwork.',
  },
  {
    q: 'How long does production take?',
    a: 'Production averages about 5-7 business days after you approve your proof and payment is received, though exact timelines vary by product and are listed on each product page. Need it sooner? Ask about our rush options.',
  },
  {
    q: 'Do you offer rush production for tight deadlines?',
    a: 'Yes — rush production is available on thousands of our promotional products, along with expedited shipping options. Share your in-hands date and we will find branded items that can make your deadline.',
  },
  {
    q: 'How is my order shipped and how do I track it?',
    a: 'Orders ship via national carriers such as UPS and FedEx, with Ground, 3-Day, 2nd Day, and Next Day options. You will receive automated order acknowledgment and shipping-status emails — including tracking — as your order moves through production and delivery.',
  },
  {
    q: 'Can you ship my order to multiple locations?',
    a: 'Yes — we can ship to multiple locations, including individual recipient addresses, through our drop shipping and kitting services. It is a great fit for multi-office rollouts and employee or client gifts.',
  },
  {
    q: 'Do you ship internationally?',
    a: 'Yes. We ship to Canada via UPS or FedEx (customers cover any duties and taxes) and to most other countries by UPS, FedEx, or USPS, passing along discounted international rates. For international orders, contact us by email or live chat so we can find the best option.',
  },
  {
    q: 'What is a company store and how does it work?',
    a: 'A company store is a custom branded online store we build and manage for your organization, so employees, clients, and event teams can order approved branded merchandise on demand. We can handle the storefront, warehousing, fulfillment, and reporting for you — contact us to scope a program.',
  },
  {
    q: 'Can you assemble and ship branded kits for me?',
    a: 'Yes — our kitting service bundles several promotional items into curated, ready-to-give kits that we assemble, pack, and ship for you, to one address or many. It is great for onboarding, events, and client gifts.',
  },
  {
    q: 'Do you offer drop shipping to individual recipients?',
    a: 'Yes — we can drop ship branded products directly to multiple locations or to individual recipients’ home addresses, so you do not have to route everything through one office first.',
  },
  {
    q: 'Can you create a 100% custom product for my brand?',
    a: 'Yes — when an off-the-shelf item will not do, we create 100% custom promotional products, sourcing custom shapes, materials, colors, and decoration both domestically and overseas to match your brand and budget.',
  },
  {
    q: 'How do I set up an ongoing branded merchandise program?',
    a: 'Ask us about a company store — a managed, ongoing branded merchandise program with an online storefront, inventory, fulfillment, and reporting built around your team. Contact us and we will help design a program that fits your organization.',
  },
  {
    q: "Can I change or cancel my order after it's placed?",
    a: 'You can change or cancel before you approve your proof. Once design work has begun, cancellations carry a minimum 3% fee plus any art charges for work already completed — so please reach out as soon as possible and we will do what we can.',
  },
  {
    q: 'What is your return and refund policy?',
    a: 'Custom printed items can be returned if they are misprinted, the imprint quality is poor, or your order did not ship in time for a confirmed event date. Because we send a free proof on every order, returns are not accepted for things like small imprint sizes, general dissatisfaction, minor color variation (unless a PMS match was requested), typos missed at proof approval, or cancelled events. Blank-product returns vary by manufacturer and may carry restocking fees. Please contact us before returning anything.',
  },
  {
    q: 'What should I do if there is a problem with my order?',
    a: 'Contact our customer service team right away at 800-773-9472 or cs@perfectimprints.com — please reach out before returning anything so we can sort it out. We send a free proof on every order to prevent issues, and we will make it right if something is not as approved.',
  },
  {
    q: 'What happens if my order arrives late or damaged?',
    a: 'We ship 99.7% of orders on time, but if your order does not arrive in time for a confirmed event date, or shows up misprinted or defective, contact us — those situations are eligible for a return or replacement.',
  },
  {
    q: 'Who do I contact about an existing order?',
    a: 'Reach our team at 800-773-9472 or cs@perfectimprints.com, Monday through Friday, 8:00 a.m. to 5:00 p.m. CST — or simply reply to your order acknowledgment email and we will help.',
  },
  {
    q: 'How do I get started with my first order?',
    a: 'Browse our categories or search for the promotional products you need, then request a quote or place your order. Not sure where to begin? Call 800-773-9472 or send us a message and our team will walk you through it.',
  },
  {
    q: 'How do I reach a Perfect Imprints representative?',
    a: 'Call 800-773-9472, email cs@perfectimprints.com, or use our Contact page. We are available Monday through Friday, 8:00 a.m. to 5:00 p.m. CST (closed on major holidays).',
  },
  {
    q: 'What information do you need from me to begin?',
    a: 'To get you a quote, it helps to know the product you are interested in, the quantity, your in-hands date, and your logo or artwork (vector files like .eps or .ai work best). Do not have everything yet? Reach out anyway and we will guide you.',
  },
  {
    q: 'How does the ordering process work from start to finish?',
    a: 'It is simple: choose your products and quantity and place your order or request a quote; send us your logo/artwork; we email a free proof for your approval (usually the same day); once you approve and payment is received, production runs about 5-7 business days; then your branded order ships via UPS or FedEx. We keep you posted by email at each step.',
  },
];

// Questions PI's own content does NOT answer — left blank for Patrick (kept as
// unpublished drafts, so they never appear on /faq).
const UNANSWERED: string[] = ['Do I need an account to place an order?'];

const normalize = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

interface FaqRow {
  _id: string;
  question?: string;
  faqCategory?: string;
  answer?: string;
}

async function main(): Promise<void> {
  console.log(
    `Filling ${ANSWERS.length} FAQ answers from PI content; leaving ${UNANSWERED.length} blank.`,
  );
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE (fill + publish)'}\n`);

  const client = buildClient();
  const existing = await client.fetch<FaqRow[]>(
    `*[_type == "faq"]{ _id, question, faqCategory, answer }`,
  );
  const byQuestion = new Map<string, FaqRow>();
  for (const e of existing) {
    if (!e.question) continue;
    const k = normalize(e.question);
    // Prefer the published doc if both a draft and a published exist.
    const prev = byQuestion.get(k);
    if (!prev || (prev._id.startsWith('drafts.') && !e._id.startsWith('drafts.'))) {
      byQuestion.set(k, e);
    }
  }

  let published = 0;
  let patched = 0;
  let skipped = 0;
  const notFound: string[] = [];

  for (const { q, a } of ANSWERS) {
    const doc = byQuestion.get(normalize(q));
    if (!doc) {
      notFound.push(q);
      continue;
    }

    // Never clobber an answer Patrick already wrote — keep his over ours.
    const existingAnswer = (doc.answer ?? '').trim();

    if (doc._id.startsWith('drafts.')) {
      const pubId = doc._id.replace(/^drafts\./, '');
      const finalAnswer = existingAnswer || a;
      console.log(
        `  publish  ${pubId}  ${q.slice(0, 56)}${existingAnswer ? '  (kept existing answer)' : ''}`,
      );
      if (!DRY_RUN) {
        // Carry over the draft's fields (question, faqCategory, …) but drop the
        // draft `_id`/`_rev` and write a fresh published doc with the answer.
        const { _id, _rev, ...rest } = doc as unknown as Record<string, unknown>;
        void _id;
        void _rev;
        await client.createOrReplace({ ...rest, _id: pubId, _type: 'faq', answer: finalAnswer });
        await client.delete(doc._id);
      }
      published++;
    } else if (existingAnswer) {
      console.log(`  skip     ${doc._id}  ${q.slice(0, 56)}  (already answered)`);
      skipped++;
    } else {
      console.log(`  patch    ${doc._id}  ${q.slice(0, 56)}`);
      if (!DRY_RUN) await client.patch(doc._id).set({ answer: a }).commit();
      patched++;
    }
  }

  console.log(
    `\nDone. published ${published} draft(s), patched ${patched} existing, skipped ${skipped} already-answered, ${notFound.length} not matched.`,
  );
  if (notFound.length) {
    console.log('\nNot matched (question text differs from the seed — check manually):');
    for (const q of notFound) console.log(`  - ${q}`);
  }
  console.log('\nLeft BLANK (no PI source — Patrick to fill, kept as unpublished draft):');
  for (const q of UNANSWERED) console.log(`  - ${q}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
