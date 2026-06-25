/**
 * Seed the FAQ library with question stubs (M5-506).
 *
 *   tsx scripts/seed/seed-faqs.ts             # write
 *   tsx scripts/seed/seed-faqs.ts --dry-run   # print, no write
 *
 * Creates DRAFT `faq` docs grouped under the 7-category taxonomy
 * (lib/faqs/categories.ts), with the `answer` LEFT EMPTY for Patrick to fill —
 * answers are his business policies (MOQ, pricing, shipping) and are never
 * fabricated here. The /faq page + search only surface ANSWERED faqs, so the
 * empty stubs stay invisible on the live site until he writes an answer and
 * publishes.
 *
 * Idempotent + non-destructive:
 *   - If an faq with the same question already exists (e.g. one Patrick added),
 *     it is slotted into the right category (its `faqCategory` is set only if
 *     currently empty) instead of duplicated — answers are never touched.
 *   - Otherwise a new draft stub is created (createIfNotExists), so re-running
 *     never duplicates.
 *
 * The question SET below is a sensible starter for a promotional-products
 * distributor; Patrick edits / adds / deletes freely in Studio.
 *
 * Requires SANITY_API_TOKEN with write scope.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';
import { FAQ_CATEGORY_VALUES } from '../../lib/faqs/categories';

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

// category value -> starter questions (answers intentionally omitted)
const SEED: { category: string; questions: string[] }[] = [
  {
    category: 'product-selection',
    questions: [
      'How do I choose the right promotional product for my campaign?',
      "Can you help me find a product if I don't see it on your site?",
      'Are the products on your site in stock and available right now?',
      'Do you offer eco-friendly or made-in-the-USA products?',
      'Can I order a sample before placing my full order?',
    ],
  },
  {
    category: 'ordering-quotes-minimums',
    questions: [
      'What is the minimum order quantity?',
      'How do I request a quote?',
      'What payment methods do you accept?',
      'Do you offer price breaks for larger quantities?',
      'Can I place an order with no minimum quantity?',
    ],
  },
  {
    category: 'artwork-proofs-branding',
    questions: [
      'What artwork file formats do you accept?',
      'Will I see a proof before my order goes into production?',
      'Can you match a specific PMS color?',
      'What decoration methods do you offer (screen print, embroidery, laser engraving)?',
      'Do you charge a setup or art fee?',
    ],
  },
  {
    category: 'production-rush-delivery',
    questions: [
      'How long does production take?',
      'Do you offer rush production for tight deadlines?',
      'How is my order shipped and how do I track it?',
      'Can you ship my order to multiple locations?',
      'Do you ship internationally?',
    ],
  },
  {
    category: 'company-stores-kitting-programs',
    questions: [
      'What is a company store and how does it work?',
      'Can you assemble and ship branded kits for me?',
      'Do you offer drop shipping to individual recipients?',
      'Can you create a 100% custom product for my brand?',
      'How do I set up an ongoing branded merchandise program?',
    ],
  },
  {
    category: 'order-changes-cancellations-problems',
    questions: [
      "Can I change or cancel my order after it's placed?",
      'What is your return and refund policy?',
      'What should I do if there is a problem with my order?',
      'What happens if my order arrives late or damaged?',
      'Who do I contact about an existing order?',
    ],
  },
  {
    category: 'getting-started',
    questions: [
      'How do I get started with my first order?',
      'Do I need an account to place an order?',
      'How do I reach a Perfect Imprints representative?',
      'What information do you need from me to begin?',
      'How does the ordering process work from start to finish?',
    ],
  },
];

const normalize = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');
const slugify = (q: string) =>
  q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

interface ExistingFaq {
  _id: string;
  question?: string;
  faqCategory?: string;
}

async function main(): Promise<void> {
  // Validate every seed category against the canonical taxonomy.
  for (const s of SEED) {
    if (!FAQ_CATEGORY_VALUES.has(s.category)) {
      throw new Error(`Unknown faqCategory "${s.category}" — not in lib/faqs/categories.ts`);
    }
  }

  const total = SEED.reduce((n, s) => n + s.questions.length, 0);
  console.log(`FAQ seed: ${total} starter questions across ${SEED.length} categories.`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE (drafts + slot existing)'}\n`);

  const client = buildClient();

  // Existing faqs (drafts + published) keyed by normalized question.
  const existing = DRY_RUN
    ? []
    : await client.fetch<ExistingFaq[]>(`*[_type == "faq"]{ _id, question, faqCategory }`);
  const byQuestion = new Map<string, ExistingFaq>();
  for (const e of existing) {
    if (e.question) byQuestion.set(normalize(e.question), e);
  }

  let created = 0;
  let categorized = 0;
  let skipped = 0;

  for (const { category, questions } of SEED) {
    for (const question of questions) {
      const norm = normalize(question);
      const match = byQuestion.get(norm);

      if (match) {
        if (!match.faqCategory) {
          console.log(`  slot      [${category}] ${question}`);
          if (!DRY_RUN) await client.patch(match._id).set({ faqCategory: category }).commit();
          categorized++;
        } else {
          skipped++;
        }
        continue;
      }

      console.log(`  create    [${category}] ${question}`);
      if (!DRY_RUN) {
        await client.createIfNotExists({
          _id: `drafts.faq-${slugify(question)}`,
          _type: 'faq',
          question,
          faqCategory: category,
        });
      }
      created++;
    }
  }

  console.log(
    `\nDone. created ${created} draft stub(s), categorized ${categorized} existing, skipped ${skipped} already-categorized.`,
  );
  if (!DRY_RUN) {
    console.log('Add answers in Studio and publish — answered FAQs appear on /faq + in search.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
