/**
 * Seed the first 10 local landing pages as fully AI-generated `landingPage`
 * DRAFTS (P2-AI-005 seeding pass).
 *
 *   pnpm seed-landing-pages
 *   (= tsx scripts/seed/seed-landing-pages.ts)
 *
 * Reads data/seed/landing-seed.json (city + product + MUST-INCLUDE landmarks +
 * keywords per page) and, for each entry IN SEQUENCE (gentle on DeepSeek, easy
 * to read logs), runs the SAME generation the Studio "Generate Landing Page
 * with AI" button runs — lib/ai/generate-landing-content.ts, shared with
 * app/api/sanity/generate-landing — then writes the result as a DRAFT
 * document for Patrick to review, edit, and publish in Studio.
 *
 * - DRAFTS ONLY: deterministic ids `drafts.landing-<slug>` + createOrReplace,
 *   so re-running regenerates/overwrites the same 10 drafts (no duplicates)
 *   and NOTHING is ever published by this script.
 * - One bad page never aborts the batch: a failed hard limit (thin body,
 *   missing landmark, too few FAQs) or DeepSeek error is logged and the loop
 *   continues; failures are listed in the final summary.
 * - Field shapes mirror the Studio action's patch exactly (portable-text
 *   bodies from the engine, `blogProduct` SKU entries, keyed faqs and
 *   aiSuggestedLinks), so Studio renders every field. heroCtaLabel is left
 *   unset — the template's documented blank-fallback ("Request a Quote")
 *   applies; leadFormHeading comes from the generated payload.
 *
 * Requires SANITY_API_TOKEN (write scope, same var every other seed script
 * uses) + DEEPSEEK_API_KEY — preflight exits non-zero BEFORE any work if
 * either is missing. The engine is dynamically imported AFTER .env.local is
 * loaded so lib/sanity/client.ts initializes with the real project id.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const PROJECT_ROOT = resolve(__dirname, '../..');
const SEED_PATH = resolve(PROJECT_ROOT, 'data/seed/landing-seed.json');

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

interface SeedPage {
  title: string;
  slug: string;
  city: string;
  state: string;
  product: string;
  landmarks: string[];
  keywords: string[];
}

interface SeedFile {
  leadRecipientDefault?: string;
  pages: SeedPage[];
}

function buildClient(): SanityClient {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production';
  if (!projectId) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID is required.');
  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    useCdn: false,
    token: process.env.SANITY_API_TOKEN,
  });
}

async function main(): Promise<void> {
  loadDotEnvLocal();

  // --- Preflight: fail loudly BEFORE any generation or write ----------------
  const missingEnv: string[] = [];
  if (!process.env.SANITY_API_TOKEN) missingEnv.push('SANITY_API_TOKEN (write scope)');
  if (!process.env.DEEPSEEK_API_KEY) missingEnv.push('DEEPSEEK_API_KEY');
  if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !process.env.SANITY_STUDIO_PROJECT_ID) {
    missingEnv.push('NEXT_PUBLIC_SANITY_PROJECT_ID');
  }
  if (missingEnv.length > 0) {
    console.error(
      `Missing required env var${missingEnv.length === 1 ? '' : 's'} (set in .env.local or the shell):\n` +
        missingEnv.map((v) => `  - ${v}`).join('\n'),
    );
    process.exit(1);
  }
  if (!existsSync(SEED_PATH)) {
    console.error(`Seed file not found: ${SEED_PATH}`);
    process.exit(1);
  }

  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as SeedFile;
  const pages = (seed.pages ?? []).filter(
    (p) => p && p.slug?.trim() && p.city?.trim() && p.state?.trim() && p.product?.trim(),
  );
  if (pages.length === 0) {
    console.error('landing-seed.json has no usable pages (slug/city/state/product required).');
    process.exit(1);
  }
  const leadRecipient = (seed.leadRecipientDefault || '').trim() || 'patrick@perfectimprints.com';

  // Dynamic import AFTER env is loaded: the engine's import graph initializes
  // the Sanity client (project id) at module-init time.
  const { generateLandingContent } = await import('../../lib/ai/generate-landing-content');

  const client = buildClient();
  const created: string[] = [];
  const failed: { slug: string; reason: string }[] = [];

  console.log(`Seeding ${pages.length} landing-page DRAFTS (nothing will be published)…\n`);

  for (const [i, page] of pages.entries()) {
    const label = `[${i + 1}/${pages.length}] ${page.slug}`;
    console.log(`${label} — generating…`);
    try {
      const gen = await generateLandingContent({
        title: page.title,
        city: page.city,
        state: page.state,
        product: page.product,
        landmarks: page.landmarks ?? [],
        keywords: page.keywords ?? [],
        currentSlug: page.slug,
      });

      // Deterministic per-doc array keys (unique within the doc is all Sanity
      // requires); the portable-text bodies carry their own keys from the
      // engine's builders.
      let n = 0;
      const key = (prefix: string) => `${prefix}-${++n}`;

      const doc = {
        _id: `drafts.landing-${page.slug}`,
        _type: 'landingPage',
        // Patrick's inputs, exactly as seeded.
        title: page.title,
        slug: { _type: 'slug', current: page.slug },
        city: page.city,
        state: page.state,
        product: page.product,
        landmarks: page.landmarks ?? [],
        aiTopicKeywords: page.keywords ?? [],
        leadRecipient,
        // Generated content — the same shapes the Studio action patches.
        heroHeading: gen.heroHeading,
        heroSubheading: gen.heroSubheading,
        localIntro: gen.localIntro,
        optionsIdeas: gen.optionsIdeas,
        whyUs: gen.whyUs,
        faqs: gen.faqs.map((f) => ({ _key: key('qa'), question: f.question, answer: f.answer })),
        relatedProducts: gen.relatedProducts.map((p) => ({
          _key: key('rp'),
          _type: 'blogProduct',
          sku: p.sku,
        })),
        leadFormHeading: gen.leadFormHeading,
        seo: {
          _type: 'seo',
          metaTitle: gen.metaTitle,
          metaDescription: gen.metaDescription,
        },
        aiSuggestedLinks: gen.suggestedLinks.map((l) => ({
          _key: key('ail'),
          _type: 'aiSuggestedLink',
          label: l.label,
          href: l.href,
          reason: l.reason,
        })),
      };

      await client.createOrReplace(doc);
      created.push(page.slug);
      console.log(
        `${label} — created draft: ${page.slug} ` +
          `(${gen.relatedProducts.length} products, ${gen.faqs.length} FAQs, ` +
          `${gen.suggestedLinks.filter((l) => l.reason.includes('(placed in the body)')).length} links placed)\n`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failed.push({ slug: page.slug, reason });
      console.error(`${label} — FAILED: ${reason}\n`);
    }
  }

  // --- Summary ---------------------------------------------------------------
  console.log('—'.repeat(60));
  console.log(`Done. ${created.length} DRAFT${created.length === 1 ? '' : 'S'} created/updated, ${failed.length} failed.`);
  console.log('All pages are UNPUBLISHED drafts — review, edit, and publish in Studio.');
  if (created.length > 0) {
    console.log('\nDrafts:');
    for (const slug of created) console.log(`  - drafts.landing-${slug}  →  /${slug} (once published)`);
  }
  if (failed.length > 0) {
    console.log('\nFailures (re-run the script to retry — successful drafts are just overwritten):');
    for (const f of failed) console.log(`  - ${f.slug}: ${f.reason}`);
  }
  process.exitCode = failed.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
