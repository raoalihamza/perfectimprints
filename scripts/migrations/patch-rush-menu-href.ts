/**
 * Point the live "Rush Products" mega-menu item at the new `/rush-products`
 * aggregator (M5-506a).
 *
 *   tsx scripts/migrations/patch-rush-menu-href.ts             # live patch
 *   tsx scripts/migrations/patch-rush-menu-href.ts --dry-run   # print, no write
 *
 * The header renders from the Sanity `megaMenu` singleton (M5-503), not from
 * `lib/nav-data.ts`, so editing nav-data.ts alone does not change the live link.
 * This does a SURGICAL patch — it only rewrites the matching item's `href`, so
 * any other Studio edits to the menu are preserved (unlike `pnpm seed-mega-menu`,
 * which replaces the whole document).
 *
 * Requires SANITY_API_TOKEN with write scope. Idempotent: re-running is a no-op
 * once the href already matches.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');
const MEGA_MENU_ID = 'megaMenu';
const OLD_HREF = '/rush-promotional-products';
const NEW_HREF = '/rush-products';
const ITEM_LABEL = 'Rush Products';

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

interface MenuItem {
  _key: string;
  label?: string;
  kind?: string;
  href?: string;
}

async function main(): Promise<void> {
  const client = buildClient();
  const doc = await client.getDocument<{ items?: MenuItem[] }>(MEGA_MENU_ID);
  if (!doc) {
    throw new Error(`megaMenu singleton (_id="${MEGA_MENU_ID}") not found. Run pnpm seed-mega-menu first.`);
  }
  const items = doc.items ?? [];
  const target = items.find(
    (it) => it.label === ITEM_LABEL && (it.href === OLD_HREF || it.href === NEW_HREF),
  );
  if (!target) {
    console.log(`No "${ITEM_LABEL}" link item found (href ${OLD_HREF}|${NEW_HREF}). Nothing to do.`);
    return;
  }
  if (target.href === NEW_HREF) {
    console.log(`Already correct: "${ITEM_LABEL}" → ${NEW_HREF}. No write needed.`);
    return;
  }

  const idx = items.indexOf(target);
  console.log(`Patching items[${idx}] ("${ITEM_LABEL}"): ${target.href} → ${NEW_HREF}`);
  if (DRY_RUN) {
    console.log('[dry-run] no write performed.');
    return;
  }
  await client.patch(MEGA_MENU_ID).set({ [`items[${idx}].href`]: NEW_HREF }).commit();
  console.log('Done. Live menu now links Rush Products → /rush-products.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
