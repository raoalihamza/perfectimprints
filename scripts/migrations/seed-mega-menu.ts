/**
 * Seed the Sanity `megaMenu` singleton from the current hard-coded nav (M5-503).
 *
 *   pnpm seed-mega-menu             # real run (overwrites the megaMenu doc)
 *   pnpm seed-mega-menu --dry-run   # build the doc and print a summary, no write
 *
 * Source of truth is `lib/nav-data.ts`:
 *   - `getDepartments()` builds the two mega panels ("Shop by" cascade +
 *     "All Categories" grid) from PI's slug universe.
 *   - `SIMPLE_NAV` provides the plain links + the Services dropdown.
 *
 * The result is byte-for-byte the menu the header rendered before the switch,
 * so the live menu does not change until Patrick edits it in Studio. Run again
 * any time to reset the menu back to the code-defined default.
 *
 * Requires SANITY_API_TOKEN with write scope (Editor or higher) for live runs.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

import {
  getDepartments,
  SIMPLE_NAV,
  SHOP_BY_LABEL,
  ALL_CATEGORIES_LABEL,
  type NavDepartment,
} from '../../lib/nav-data';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');
const MEGA_MENU_ID = 'megaMenu';

// Minimal .env.local loader so this script can run standalone via tsx.
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
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
loadDotEnvLocal();

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildClient(): SanityClient {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN;

  if (!projectId) {
    throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID (or SANITY_STUDIO_PROJECT_ID) is required.');
  }
  if (!DRY_RUN && !token) {
    throw new Error('SANITY_API_TOKEN is required for writes. Use --dry-run to skip writes.');
  }

  return createClient({ projectId, dataset, apiVersion: '2024-10-01', useCdn: false, token });
}

interface MenuLink {
  _type: 'menuLink';
  _key: string;
  label: string;
  href: string;
}

interface MenuColumn {
  _type: 'menuColumn';
  _key: string;
  label: string;
  href?: string;
  nonClickable: boolean;
  links: MenuLink[];
}

interface MenuItem {
  _type: 'menuItem';
  _key: string;
  label: string;
  kind: 'link' | 'dropdown' | 'megaPanel';
  href?: string;
  variant?: 'cascade' | 'grid';
  links?: MenuLink[];
  columns?: MenuColumn[];
}

function departmentsToColumns(departments: NavDepartment[]): MenuColumn[] {
  return departments.map((d) => ({
    _type: 'menuColumn',
    _key: `col-${d.slug}`,
    label: d.label,
    ...(d.href ? { href: d.href } : {}),
    nonClickable: !d.href,
    links: d.children.map((c, j) => ({
      _type: 'menuLink',
      _key: `lnk-${d.slug}-${j}`,
      label: c.label,
      href: c.href ?? '',
    })),
  }));
}

function buildItems(): MenuItem[] {
  const departments = getDepartments();

  // The two mega panels render the same department set, two ways.
  const shopBy: MenuItem = {
    _type: 'menuItem',
    _key: 'item-shop-by',
    label: SHOP_BY_LABEL,
    kind: 'megaPanel',
    variant: 'cascade',
    columns: departmentsToColumns(departments),
  };
  const allCategories: MenuItem = {
    _type: 'menuItem',
    _key: 'item-all-categories',
    label: ALL_CATEGORIES_LABEL,
    kind: 'megaPanel',
    variant: 'grid',
    columns: departmentsToColumns(departments),
  };

  const simpleItems: MenuItem[] = SIMPLE_NAV.map((nav) => {
    const key = `item-${slugify(nav.label)}`;
    if (nav.children && nav.children.length > 0) {
      return {
        _type: 'menuItem',
        _key: key,
        label: nav.label,
        kind: 'dropdown',
        links: nav.children.map((c, j) => ({
          _type: 'menuLink',
          _key: `lnk-${slugify(nav.label)}-${j}`,
          label: c.label,
          href: c.href,
        })),
      };
    }
    return { _type: 'menuItem', _key: key, label: nav.label, kind: 'link', href: nav.href };
  });

  // Order matches the prior header: Shop by, All Categories, then SIMPLE_NAV.
  return [shopBy, allCategories, ...simpleItems];
}

function summarize(items: MenuItem[]): void {
  console.log(`\nmegaMenu seed — ${items.length} top-level items:`);
  for (const it of items) {
    if (it.kind === 'megaPanel') {
      const cols = it.columns ?? [];
      const links = cols.reduce((n, c) => n + c.links.length, 0);
      console.log(
        `  • ${it.label}  [megaPanel/${it.variant}]  ${cols.length} columns, ${links} links`,
      );
    } else if (it.kind === 'dropdown') {
      console.log(`  • ${it.label}  [dropdown]  ${(it.links ?? []).length} links`);
    } else {
      console.log(`  • ${it.label}  [link]  → ${it.href}`);
    }
  }
}

async function main(): Promise<void> {
  const items = buildItems();
  summarize(items);
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] Document that would be written to _id="megaMenu":');
    console.log(JSON.stringify({ _id: MEGA_MENU_ID, _type: 'megaMenu', items }, null, 2));
    return;
  }

  const client = buildClient();

  // Clear any stale draft so Studio shows the freshly-seeded published menu.
  try {
    await client.delete(`drafts.${MEGA_MENU_ID}`);
  } catch {
    /* no draft to delete — fine */
  }

  await client.createOrReplace({ _id: MEGA_MENU_ID, _type: 'megaMenu', items });

  console.log(`\nDone. Wrote megaMenu singleton (_id="${MEGA_MENU_ID}").`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
