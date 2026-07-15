/**
 * Seed the "Catalog Request" builder form as a `form` DRAFT (P2-CAT-002).
 *
 *   pnpm seed-catalog-form             # write the draft (skips if published)
 *   pnpm seed-catalog-form --dry-run   # print, no write
 *
 * The /shop-by-theme/<slug> landing pages' three "Get the Catalog" CTAs open
 * this ONE shared form (slug `catalog-request` — CATALOG_FORM_SLUG in
 * lib/leads/catalog-lead.ts); the catalog being requested rides a hidden
 * `catalogSlug` field, NOT a per-catalog form. On submit, /api/leads emails
 * the customer that catalog's gated-page link (cc the recipient) — so keep an
 * `email`-typed field on the form: the delivery address is the first
 * email-typed answer.
 *
 * Same model as seed-service-forms: the doc is created as a DRAFT
 * (drafts.form-catalog-request) for Patrick to review + publish; a form that
 * is ALREADY PUBLISHED is skipped so the seed never clobbers live edits.
 * Until it is published, the landing CTAs fall back to linking /contact.
 *
 * Requires SANITY_API_TOKEN with write scope.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');

// Mirrors lib/leads/catalog-lead.ts CATALOG_FORM_SLUG (not imported — lib
// modules in that graph are Next-server-only; keep the two in sync).
const FORM_SLUG = 'catalog-request';
const FORM_ID = `form-${FORM_SLUG}`;

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

interface FieldSeed {
  _key: string;
  _type: 'formField';
  label: string;
  fieldType: string;
  required: boolean;
  placeholder?: string;
  width?: 'full' | 'half';
}

let _n = 0;
const field = (
  label: string,
  fieldType: string,
  required: boolean,
  extra: { placeholder?: string; width?: 'full' | 'half' } = {},
): FieldSeed => ({ _key: `f${++_n}`, _type: 'formField', label, fieldType, required, ...extra });

// Patrick's spec (P2-CAT-002): First Name, Last Name, Company, Phone, Email
// required + optional Comments. Widths give the standard two-up layout.
const formDoc = {
  _id: `drafts.${FORM_ID}`,
  _type: 'form',
  title: 'Catalog Request',
  slug: { _type: 'slug', current: FORM_SLUG },
  recipientEmail: 'patrick@perfectimprints.com',
  sendCustomerConfirmation: true,
  intro: "Tell us where to send it and the catalog link will be in your inbox in moments.",
  submitButtonLabel: 'Send Me the Catalog',
  successMessage: 'Thanks! Check your inbox — we just emailed you the catalog link.',
  fields: [
    field('First Name', 'shortText', true, { width: 'half' }),
    field('Last Name', 'shortText', true, { width: 'half' }),
    field('Company', 'shortText', true),
    field('Phone', 'phone', true, { width: 'half' }),
    field('Email', 'email', true, { width: 'half' }),
    field('Comments', 'longText', false, {
      placeholder: 'Anything specific you are looking for? (optional)',
    }),
  ],
};

async function main(): Promise<void> {
  console.log(`Catalog Request form seed — slug "${FORM_SLUG}"`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}`);

  if (DRY_RUN) {
    console.log(JSON.stringify(formDoc, null, 2));
    return;
  }

  const client = buildClient();

  // Never clobber a live form Patrick may have edited.
  const published = await client.fetch<{ _id: string } | null>(
    `*[_type == "form" && _id == $id][0]{_id}`,
    { id: FORM_ID },
  );
  if (published) {
    console.log(`"${FORM_SLUG}" is already PUBLISHED — skipped (edit it in Studio instead).`);
    return;
  }

  await client.createOrReplace(formDoc);
  console.log(
    `Done. Wrote DRAFT drafts.${FORM_ID} — review + Publish in Studio to activate the catalog CTAs (until then they link to /contact).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
