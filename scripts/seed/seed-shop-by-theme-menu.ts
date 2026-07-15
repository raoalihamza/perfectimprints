/**
 * Upsert the "Shop by Theme" dropdown into the `megaMenu` singleton (P2-CAT-003).
 *
 *   pnpm seed-shop-by-theme-menu             # live write
 *   pnpm seed-shop-by-theme-menu --dry-run   # print, no write
 *
 * Builds the dropdown from the PUBLISHED `catalogPage` docs at run time — one
 * link per catalog LANDING page (/shop-by-theme/<slug>, label = catalog
 * title), ordered by title. The gated /catalog pages are NEVER menu links.
 *
 * TARGETED PATCH, not a reset: unlike `pnpm seed-mega-menu` (which
 * createOrReplace's the WHOLE singleton from lib/nav-data.ts), this script
 * touches ONLY the one item keyed `item-shop-by-theme`:
 *   - already present → its label/links are refreshed IN PLACE (position kept);
 *   - absent → inserted after the "Deals" item (else appended at the end).
 * Every other menu item — including Patrick's Studio edits — is left
 * untouched. Idempotent: re-run any time (e.g. after publishing a new
 * catalogPage) to refresh the links; Patrick can also just edit the dropdown
 * in Studio like any other menu item.
 *
 * ⚠️ Interactions to know about:
 *   - `pnpm seed-mega-menu` RESETS the whole menu from code and therefore
 *     DROPS this item — re-run this script after any full re-seed.
 *   - No published catalogPage docs → nothing to link → the script exits
 *     without writing (a dropdown of dead links helps nobody).
 *   - A megaMenu DRAFT is patched too when one exists (otherwise publishing
 *     that draft later would silently drop the item).
 *
 * Requires SANITY_API_TOKEN with write scope.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');
const MEGA_MENU_ID = 'megaMenu';
const ITEM_KEY = 'item-shop-by-theme';
const ITEM_LABEL = 'Shop by Theme';

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

interface MenuLink {
  _type: 'menuLink';
  _key: string;
  label: string;
  href: string;
}

interface MenuItem {
  _type: 'menuItem';
  _key: string;
  label: string;
  kind: string;
  href?: string;
  links?: MenuLink[];
  [k: string]: unknown;
}

function buildItem(catalogs: { title: string; slug: string }[]): MenuItem {
  return {
    _type: 'menuItem',
    _key: ITEM_KEY,
    label: ITEM_LABEL,
    kind: 'dropdown',
    links: catalogs.map((c, i) => ({
      _type: 'menuLink',
      _key: `lnk-shop-by-theme-${c.slug || i}`,
      label: c.title,
      // LANDING page only — the gated /catalog pages are never in a menu.
      href: `/shop-by-theme/${c.slug}`,
    })),
  };
}

/** Upsert the item into an items array: replace in place, or insert after "Deals". */
function upsertItem(items: MenuItem[], item: MenuItem): MenuItem[] {
  const existing = items.findIndex((it) => it._key === ITEM_KEY || it.label === ITEM_LABEL);
  if (existing >= 0) {
    const next = [...items];
    next[existing] = { ...item, _key: next[existing]._key };
    return next;
  }
  const dealsIndex = items.findIndex((it) => (it.label || '').trim().toLowerCase() === 'deals');
  const insertAt = dealsIndex >= 0 ? dealsIndex + 1 : items.length;
  return [...items.slice(0, insertAt), item, ...items.slice(insertAt)];
}

async function main(): Promise<void> {
  const client = buildClient();

  const catalogs = await client.fetch<{ title: string; slug: string }[]>(
    `*[_type == "catalogPage" && !(_id in path("drafts.**")) && defined(slug.current) && defined(title)]
      | order(title asc) { title, "slug": slug.current }`,
  );

  console.log(`Published catalog pages found: ${catalogs.length}`);
  for (const c of catalogs) console.log(`  • ${c.title} → /shop-by-theme/${c.slug}`);

  if (catalogs.length === 0) {
    console.log(
      '\nNo published catalogPage docs — nothing to link, exiting without writing. ' +
        'Publish the catalog pages first, then re-run.',
    );
    return;
  }

  const item = buildItem(catalogs);

  if (DRY_RUN) {
    console.log('\n[dry-run] Item that would be upserted into the megaMenu:');
    console.log(JSON.stringify(item, null, 2));
    return;
  }

  // Patch the published singleton and, when present, the draft too (else a
  // later publish of the draft would silently drop the item).
  let wrote = 0;
  for (const id of [MEGA_MENU_ID, `drafts.${MEGA_MENU_ID}`]) {
    const doc = await client.fetch<{ _id: string; items?: MenuItem[] } | null>(
      `*[_id == $id][0]{ _id, items }`,
      { id },
    );
    if (!doc) continue;
    const nextItems = upsertItem(doc.items ?? [], item);
    await client.patch(id).set({ items: nextItems }).commit();
    wrote += 1;
    console.log(`Patched ${id} (${nextItems.length} top-level items).`);
  }

  if (wrote === 0) {
    console.log(
      'No megaMenu singleton found — run `pnpm seed-mega-menu` first, then re-run this script.',
    );
    return;
  }
  console.log(
    `\nDone. "${ITEM_LABEL}" dropdown now links ${catalogs.length} catalog landing page(s). ` +
      'The webhook revalidates the header within seconds of the patch.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
