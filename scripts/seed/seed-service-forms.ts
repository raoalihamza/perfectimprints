/**
 * Seed the four service quote forms as `form` DRAFTS (P2-FB-002) and wire the
 * service pages' "Request a Quote" buttons to open them.
 *
 *   tsx scripts/seed/seed-service-forms.ts             # write drafts + patch buttons
 *   tsx scripts/seed/seed-service-forms.ts --dry-run   # print, no write
 *
 * What it does:
 *   1. Creates DRAFT `form` documents (drafts.form-<slug>) for Kitting /
 *      Company Stores / 100% Custom Products / Pop-Up Stores with Patrick's
 *      exact field lists. Patrick reviews + publishes in Studio (same model as
 *      seed-service-pages). A form that is ALREADY PUBLISHED is skipped — the
 *      seed never clobbers a live form Patrick may have edited.
 *   2. Patches the four service `page` docs (published + draft): every
 *      ctaBlock button labeled "Request a Quote" gets `formSlug` set to that
 *      service's form. The button's `href` (/contact) is kept as the fallback,
 *      so until the form is PUBLISHED the button keeps linking to /contact —
 *      publishing the form flips it to the popup with no further edit.
 *      Idempotent: buttons that already carry a formSlug are left alone.
 *
 * All four forms email patrick@perfectimprints.com (editable per form in
 * Studio) and send the customer a confirmation copy.
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

// --- form builders -----------------------------------------------------------

interface FieldSeed {
  _key: string;
  _type: 'formField';
  label: string;
  fieldType: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  /** 'half' pairs with the adjacent half field on desktop; unset = full row. */
  width?: 'full' | 'half';
}

interface FormSeed {
  _id: string;
  _type: 'form';
  title: string;
  slug: { _type: 'slug'; current: string };
  recipientEmail: string;
  sendCustomerConfirmation: boolean;
  intro: string;
  submitButtonLabel: string;
  successMessage: string;
  fields: FieldSeed[];
}

let _n = 0;
const key = () => `f${++_n}`;
const field = (
  label: string,
  fieldType: string,
  required = false,
  extra: { options?: string[]; placeholder?: string; width?: 'full' | 'half' } = {},
): FieldSeed => ({ _key: key(), _type: 'formField', label, fieldType, required, ...extra });

// Common contact block on all four forms. Company/First/Email/Phone required,
// Last Name optional (reasonable default — adjustable per form in Studio).
// Widths give the LeadForm look: Company on its own row, then First+Last and
// Phone+Email paired two-up on desktop (editor-adjustable per field).
const commonFields = (): FieldSeed[] => [
  field('Company Name', 'shortText', true),
  field('First Name', 'shortText', true, { width: 'half' }),
  field('Last Name', 'shortText', false, { width: 'half' }),
  field('Phone', 'phone', true, { width: 'half' }),
  field('Email', 'email', true, { width: 'half' }),
];

const COMMENT_LABEL = 'Comment Box (anything else we need to know to accurately quote you)';
const RECIPIENT = 'patrick@perfectimprints.com';
const SUCCESS = 'Thanks, we received your request and will get back to you shortly.';

function buildForms(): FormSeed[] {
  return [
    {
      _id: 'drafts.form-kitting-quote',
      _type: 'form',
      title: 'Kitting Quote Request',
      slug: { _type: 'slug', current: 'kitting-quote' },
      recipientEmail: RECIPIENT,
      sendCustomerConfirmation: true,
      intro: 'Tell us about your kit and our team will follow up with pricing and ideas.',
      submitButtonLabel: 'Request a Quote',
      successMessage: SUCCESS,
      fields: [
        ...commonFields(),
        field('What products do you have in mind for the kit?', 'longText', true),
        field('What type of packaging would you like?', 'shortText', false),
        field('What quantity do you need?', 'shortText', true, {
          placeholder: '500 or 100-200',
          width: 'half',
        }),
        field('When do you need your kits delivered?', 'date', true, { width: 'half' }),
        field(COMMENT_LABEL, 'longText', false),
      ],
    },
    {
      _id: 'drafts.form-company-stores-quote',
      _type: 'form',
      title: 'Company Store Quote Request',
      slug: { _type: 'slug', current: 'company-stores-quote' },
      recipientEmail: RECIPIENT,
      sendCustomerConfirmation: true,
      intro: 'Tell us about your program and we will scope a company store that fits.',
      submitButtonLabel: 'Request a Quote',
      successMessage: SUCCESS,
      fields: [
        ...commonFields(),
        field('Do you currently have a company store?', 'checkbox', false),
        field("If so, what's the URL?", 'shortText', false, {
          placeholder: 'https://store.yourcompany.com',
        }),
        field('What is your approximate annual sales from the company store?', 'shortText', false, {
          width: 'half',
        }),
        field('Approximately how many items are in your store?', 'number', false, {
          width: 'half',
        }),
        field(COMMENT_LABEL, 'longText', false),
      ],
    },
    {
      _id: 'drafts.form-custom-products-quote',
      _type: 'form',
      title: '100% Custom Product Quote Request',
      slug: { _type: 'slug', current: 'custom-products-quote' },
      recipientEmail: RECIPIENT,
      sendCustomerConfirmation: true,
      intro: 'Share your vision and we will help bring your fully custom product to life.',
      submitButtonLabel: 'Request a Quote',
      successMessage: SUCCESS,
      fields: [
        ...commonFields(),
        field(
          'Tell us your vision for this custom product (in as much detail as possible)',
          'longText',
          true,
        ),
        field('What quantity do you need?', 'shortText', true, {
          placeholder: '500 or 100-200',
          width: 'half',
        }),
        field('When do you need them by?', 'date', true, { width: 'half' }),
        field('What item color do you need?', 'shortText', false, { width: 'half' }),
        field('How many colors will be printed on the custom items?', 'number', false, {
          width: 'half',
        }),
        field(
          'Do you have a photo or a sketch you can share with us for inspiration?',
          'fileUpload',
          false,
        ),
      ],
    },
    {
      _id: 'drafts.form-popup-stores-quote',
      _type: 'form',
      title: 'Popup Store Quote Request',
      slug: { _type: 'slug', current: 'popup-stores-quote' },
      recipientEmail: RECIPIENT,
      sendCustomerConfirmation: true,
      intro: 'Tell us about your event or launch and we will get your popup store ready.',
      submitButtonLabel: 'Request a Quote',
      successMessage: SUCCESS,
      fields: [
        ...commonFields(),
        field('What is the estimated amount of sales for this popup store?', 'shortText', false, {
          width: 'half',
        }),
        field('How many different items will you sell for this popup store?', 'number', false, {
          width: 'half',
        }),
        field('What specific items would you like to sell on the popup store?', 'longText', true),
        field('What date would you like to go live with your popup store?', 'date', false, {
          width: 'half',
        }),
        field('How long will you want to keep the popup store open?', 'shortText', false, {
          width: 'half',
        }),
        field(
          'Would you like us to distribute and ship the items to the individuals who order, or will we bulk ship to one location?',
          'dropdown',
          false,
          { options: ['Ship to individuals', 'Bulk ship to one location'] },
        ),
      ],
    },
  ];
}

// --- field-width backfill (layout follow-up) ----------------------------------

/**
 * The seed skips forms that are already PUBLISHED, so this second idempotent
 * pass carries the seed's `width` layout onto EXISTING form docs (published +
 * draft): each live field whose label matches a seeded half-width field and
 * whose own `width` is still unset gets `width: 'half'`. A width Patrick has
 * explicitly set (full OR half) is never touched.
 */
async function applyFieldWidths(client: SanityClient, forms: FormSeed[]): Promise<void> {
  for (const seed of forms) {
    const halfLabels = new Set(
      seed.fields.filter((f) => f.width === 'half').map((f) => f.label),
    );
    if (halfLabels.size === 0) continue;
    const publishedId = seed._id.replace(/^drafts\./, '');
    for (const id of [publishedId, seed._id]) {
      const doc = await client.fetch<{
        _id: string;
        fields?: Array<{ _key: string; label?: string; width?: string }>;
      } | null>(`*[_id == $id][0]{ _id, fields[]{ _key, label, width } }`, { id });
      if (!doc) continue;
      const patches: Record<string, string> = {};
      for (const f of doc.fields ?? []) {
        if (f.width) continue; // explicit editor choice — leave it
        if (f.label && halfLabels.has(f.label)) {
          patches[`fields[_key=="${f._key}"].width`] = 'half';
        }
      }
      if (Object.keys(patches).length === 0) {
        console.log(`  ${id}: field widths already set (ok)`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`  ${id}: would set width=half on ${Object.keys(patches).length} field(s)`);
        continue;
      }
      await client.patch(id).set(patches).commit();
      console.log(`  ${id}: set width=half on ${Object.keys(patches).length} field(s)`);
    }
  }
}

// --- service page button wiring ----------------------------------------------

/** service page slug → form slug */
const PAGE_TO_FORM: Record<string, string> = {
  kitting: 'kitting-quote',
  'company-stores': 'company-stores-quote',
  'custom-products': 'custom-products-quote',
  'popup-stores': 'popup-stores-quote',
};

interface PageButtons {
  _id: string;
  sections?: Array<{
    _key: string;
    _type: string;
    buttons?: Array<{ _key: string; label?: string; formSlug?: string }>;
  }>;
}

async function wireQuoteButtons(client: SanityClient): Promise<void> {
  for (const [pageSlug, formSlug] of Object.entries(PAGE_TO_FORM)) {
    for (const id of [`page-${pageSlug}`, `drafts.page-${pageSlug}`]) {
      const doc = await client.fetch<PageButtons | null>(
        `*[_id == $id][0]{ _id, sections[]{ _key, _type, buttons[]{ _key, label, formSlug } } }`,
        { id },
      );
      if (!doc) continue;
      const patches: Record<string, string> = {};
      for (const section of doc.sections ?? []) {
        if (section._type !== 'ctaBlock') continue;
        for (const button of section.buttons ?? []) {
          if (!/request a quote/i.test(button.label ?? '')) continue;
          if (button.formSlug) continue; // already wired — leave Patrick's value
          patches[`sections[_key=="${section._key}"].buttons[_key=="${button._key}"].formSlug`] =
            formSlug;
        }
      }
      if (Object.keys(patches).length === 0) {
        console.log(`  ${id}: no un-wired "Request a Quote" buttons (ok)`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`  ${id}: would set ${Object.keys(patches).length} button(s) → ${formSlug}`);
        continue;
      }
      await client.patch(id).set(patches).commit();
      console.log(`  ${id}: wired ${Object.keys(patches).length} button(s) → ${formSlug}`);
    }
  }
}

// --- main ---------------------------------------------------------------------

async function main(): Promise<void> {
  const forms = buildForms();
  console.log(`Seeding ${forms.length} service form drafts:`);
  for (const f of forms) {
    console.log(`  • ${f.title}  (${f.slug.current})  [${f.fields.length} fields]`);
  }
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE (drafts)'}\n`);

  const client = buildClient();

  for (const f of forms) {
    const publishedId = f._id.replace(/^drafts\./, '');
    const published = await client.fetch<{ _id: string } | null>(`*[_id == $id][0]{_id}`, {
      id: publishedId,
    });
    if (published) {
      console.log(`  ${publishedId} is already PUBLISHED — skipped (never clobber a live form)`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  would write ${f._id}`);
      continue;
    }
    await client.createOrReplace(f);
    console.log(`  wrote ${f._id}`);
  }

  console.log('\nBackfilling field widths on existing forms:');
  await applyFieldWidths(client, forms);

  console.log('\nWiring service page "Request a Quote" buttons:');
  await wireQuoteButtons(client);

  console.log(
    '\nDone. Publish each form in Studio — until a form is published, its button keeps the /contact fallback link.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
