/**
 * Seed globalSettings.contact (+ socialLinks if any) from Perfect Imprints' OWN
 * live site (Patrick's data).
 *
 *   pnpm seed-social-contact            # write
 *   pnpm seed-social-contact --dry-run  # print, no write
 *
 * Values were read from the live perfectimprints.com /contact page footer
 * (via the r.jina.ai reader + the Wayback raw HTML, since the site is
 * Cloudflare-WAF/geo-blocked from this egress):
 *   - phones  : 800-773-9472, 850-200-4020   (footer "Phone M-F 8-5 CST")
 *   - email   : cs@perfectimprints.com       (PI's customer-service address)
 *   - address : 913 Beal Pkwy NW, Ste A153, Fort Walton Beach, FL 32547
 *
 * SOCIAL LINKS — NOT SEEDED. PI's live footer renders 7 social icons but every
 * one is a `#` placeholder (no real profile URL is in the rendered HTML or the
 * Wayback snapshot; the only social references are MPower's share-button config).
 * So there are no real profile URLs to seed. Patrick adds them in Studio:
 * Global Settings → Social Links → pick a platform + paste the URL (the icon is
 * automatic) → Enabled on. See the report printed at the end.
 *
 * Uses createIfNotExists + patch.set so existing globalSettings fields
 * (dealsPage, newProductsPage, footerColumns, …) are preserved. Idempotent.
 * Requires SANITY_API_TOKEN with write scope.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');
const SETTINGS_ID = 'globalSettings';

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

// --- PI's own contact data (found on the live site) -------------------------
const CONTACT = {
  phones: ['800-773-9472', '850-200-4020'],
  email: 'cs@perfectimprints.com',
  address: {
    street: '913 Beal Pkwy NW, Ste A153',
    city: 'Fort Walton Beach',
    region: 'FL',
    postalCode: '32547',
    country: 'US',
  },
};

// Real social profile URLs were NOT found on PI's live site (all footer icons
// are `#` placeholders). None are seeded — listed in the report for Patrick.
const SOCIAL_LINKS: Array<{
  platform: string;
  label?: string;
  url: string;
  enabled: boolean;
}> = [];

async function main(): Promise<void> {
  console.log('Seeding globalSettings social + contact from PI\'s own site.\n');
  console.log('Contact:');
  console.log(`  phones : ${CONTACT.phones.join(', ')}`);
  console.log(`  email  : ${CONTACT.email}`);
  console.log(
    `  address: ${CONTACT.address.street}, ${CONTACT.address.city}, ${CONTACT.address.region} ${CONTACT.address.postalCode} (${CONTACT.address.country})`,
  );
  console.log(`\nSocial links to seed: ${SOCIAL_LINKS.length}`);
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}`);

  if (!DRY_RUN) {
    const client = buildClient();
    // Don't clobber the singleton's other fields — create-if-missing then patch.
    await client.createIfNotExists({ _id: SETTINGS_ID, _type: 'globalSettings' });

    const patch = client.patch(SETTINGS_ID).set({ contact: CONTACT });
    // Only set socialLinks if we actually found some (never wipe Patrick's edits).
    if (SOCIAL_LINKS.length > 0) {
      patch.set({
        socialLinks: SOCIAL_LINKS.map((s, i) => ({
          _key: `social-${i}`,
          _type: 'object',
          ...s,
        })),
      });
    }
    await patch.commit();
    console.log(`\n  patched ${SETTINGS_ID}.contact`);
    if (SOCIAL_LINKS.length > 0) console.log(`  patched ${SETTINGS_ID}.socialLinks`);
  }

  console.log('\n--- REPORT -----------------------------------------------------');
  console.log('Seeded (found on PI\'s site):');
  console.log('  ✓ phone numbers (2): 800-773-9472, 850-200-4020');
  console.log('  ✓ email: cs@perfectimprints.com');
  console.log('  ✓ mailing address: 913 Beal Pkwy NW, Ste A153, Fort Walton Beach, FL 32547');
  console.log('\nNOT found on PI\'s site (add manually in Studio → Global Settings):');
  console.log('  ✗ social profile URLs — every footer social icon on the live site is a');
  console.log('    "#" placeholder; no Facebook/Instagram/LinkedIn/YouTube/X/Pinterest/');
  console.log('    TikTok profile URL is present in the rendered HTML or Wayback archive.');
  console.log('    → Studio: Social Links → + → pick platform → paste URL → Enabled.');
  console.log('----------------------------------------------------------------');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
