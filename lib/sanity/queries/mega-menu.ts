import { cachedClient } from '@/lib/sanity/client';
import { MEGA_MENU_TAG } from '@/lib/sanity/cache-tags';
import type { NavDepartment, NavNode } from '@/lib/nav-data';
import type { MegaMenuItem, MegaMenuChild } from '@/components/layout/MegaMenu';
import { normalizeHref } from '@/lib/sanity/normalize-href';

// ---------------------------------------------------------------------------
// Mega menu — Sanity-driven (M5-503).
//
// The live header reads from the `megaMenu` singleton. This module fetches that
// document and resolves it into the exact data shapes the existing renderer
// components already consume (`NavDepartment[]` for the panels, `MegaMenuItem[]`
// for the mobile drawer + dropdowns), so the menu looks and behaves identically
// to the previous hard-coded `lib/nav-data.ts` version.
//
// There is NO hard-coded fallback: whatever is in Sanity is what renders. If the
// singleton is missing/empty (or the fetch fails), the menu renders empty.
//
// The read goes through the non-CDN `cachedClient` with the `MEGA_MENU_TAG` cache
// tag (revalidate:false, never no-store) — so the layout stays statically
// prerenderable AND the webhook busts the tag deterministically on a `megaMenu`
// publish. The previous CDN `client` read (useCdn:true, untagged) could serve a
// stale menu on edits (esp. a link REMOVAL) — same fix pattern as global settings.
// ---------------------------------------------------------------------------

// Tagged, non-CDN fetch options — see the global-settings rationale.
const MEGA_MENU_FETCH_OPTS = { next: { tags: [MEGA_MENU_TAG], revalidate: false as const } };

interface RawLink {
  label?: string;
  href?: string;
}

interface RawColumn {
  label?: string;
  href?: string;
  nonClickable?: boolean;
  links?: RawLink[];
}

interface RawItem {
  label?: string;
  kind?: 'link' | 'dropdown' | 'megaPanel';
  href?: string;
  variant?: 'cascade' | 'grid';
  links?: RawLink[];
  columns?: RawColumn[];
}

interface RawMegaMenu {
  items?: RawItem[];
}

export type ResolvedMenuItem =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'dropdown'; label: string; item: MegaMenuItem }
  | { kind: 'megaPanel'; variant: 'cascade' | 'grid'; label: string; departments: NavDepartment[] };

export interface ResolvedMenu {
  desktopItems: ResolvedMenuItem[];
  mobileItems: MegaMenuItem[];
}

const MEGA_MENU_QUERY = `*[_type == "megaMenu"][0]{
  items[]{
    label,
    kind,
    href,
    variant,
    links[]{ label, href },
    columns[]{ label, href, nonClickable, links[]{ label, href } }
  }
}`;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function columnsToDepartments(columns: RawColumn[]): NavDepartment[] {
  return columns
    .filter((c) => c.label)
    .map((c, i) => {
      // Internal hrefs are slash-tolerant (normalizeHref prepends `/` to bare
      // internal paths, leaves external/protocol/anchor untouched).
      const headerHref = !c.nonClickable && c.href ? normalizeHref(c.href) || null : null;
      const children: NavNode[] = (c.links ?? [])
        .filter((l) => l.label)
        .map((l) => {
          const href = normalizeHref(l.href) || null;
          return {
            label: l.label as string,
            href,
            available: Boolean(href),
            children: [],
          };
        });
      return {
        label: c.label as string,
        slug: slugify(c.label as string) || `col-${i}`,
        href: headerHref,
        available: Boolean(headerHref),
        children,
      };
    });
}

// Flattens departments into the leaf list the mobile "All Categories" accordion
// shows: the department itself, then "Department · Child" rows. Mirrors the
// previous `buildMobileItems` in Header.tsx exactly.
function flattenDeptLeaves(departments: NavDepartment[]): MegaMenuChild[] {
  return departments.flatMap((d) => [
    ...(d.available && d.href ? [{ label: d.label, href: d.href }] : []),
    ...d.children
      .filter((c) => c.available && c.href)
      .map((c) => ({ label: `${d.label} · ${c.label}`, href: c.href as string })),
  ]);
}

export function resolveMegaMenu(raw: RawMegaMenu | null): ResolvedMenu {
  const items = raw?.items ?? [];
  const desktopItems: ResolvedMenuItem[] = [];

  for (const item of items) {
    if (!item.label) continue;
    if (item.kind === 'megaPanel') {
      desktopItems.push({
        kind: 'megaPanel',
        variant: item.variant === 'grid' ? 'grid' : 'cascade',
        label: item.label,
        departments: columnsToDepartments(item.columns ?? []),
      });
    } else if (item.kind === 'dropdown') {
      desktopItems.push({
        kind: 'dropdown',
        label: item.label,
        item: {
          label: item.label,
          href: normalizeHref(item.href) || '#',
          children: (item.links ?? [])
            .filter((l) => l.label && l.href)
            .map((l) => ({ label: l.label as string, href: normalizeHref(l.href) })),
        },
      });
    } else {
      // Treat anything else (including explicit `link`) as a plain link.
      desktopItems.push({ kind: 'link', label: item.label, href: normalizeHref(item.href) || '#' });
    }
  }

  // Mobile drawer: a single "All Categories" accordion (from the grid panel)
  // followed by the dropdowns and plain links, in order. Cascade panels are not
  // shown on mobile — this matches the prior header behavior exactly.
  const mobileItems: MegaMenuItem[] = [];
  for (const item of desktopItems) {
    if (item.kind === 'megaPanel') {
      if (item.variant === 'grid') {
        mobileItems.push({
          label: item.label,
          href: '#',
          children: flattenDeptLeaves(item.departments),
        });
      }
    } else if (item.kind === 'dropdown') {
      mobileItems.push(item.item);
    } else {
      mobileItems.push({ label: item.label, href: item.href });
    }
  }

  return { desktopItems, mobileItems };
}

export async function getMegaMenu(): Promise<ResolvedMenu> {
  let raw: RawMegaMenu | null = null;
  try {
    raw = await cachedClient.fetch<RawMegaMenu | null>(MEGA_MENU_QUERY, {}, MEGA_MENU_FETCH_OPTS);
  } catch {
    raw = null;
  }
  return resolveMegaMenu(raw);
}
