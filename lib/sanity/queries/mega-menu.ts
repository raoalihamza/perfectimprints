import { client } from '@/lib/sanity/client';
import type { NavDepartment, NavNode } from '@/lib/nav-data';
import type { MegaMenuItem, MegaMenuChild } from '@/components/layout/MegaMenu';

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
// ---------------------------------------------------------------------------

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
      const headerHref = !c.nonClickable && c.href ? c.href : null;
      const children: NavNode[] = (c.links ?? [])
        .filter((l) => l.label)
        .map((l) => ({
          label: l.label as string,
          href: l.href ?? null,
          available: Boolean(l.href),
          children: [],
        }));
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
          href: item.href || '#',
          children: (item.links ?? [])
            .filter((l) => l.label && l.href)
            .map((l) => ({ label: l.label as string, href: l.href as string })),
        },
      });
    } else {
      // Treat anything else (including explicit `link`) as a plain link.
      desktopItems.push({ kind: 'link', label: item.label, href: item.href || '#' });
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
    raw = await client.fetch<RawMegaMenu | null>(MEGA_MENU_QUERY);
  } catch {
    raw = null;
  }
  return resolveMegaMenu(raw);
}
