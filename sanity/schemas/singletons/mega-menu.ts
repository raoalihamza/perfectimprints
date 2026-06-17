import { defineField, defineType } from 'sanity';

/**
 * Mega Menu singleton (_id: "megaMenu").
 *
 * Faithfully represents the live primary navigation that was previously
 * hard-coded in `lib/nav-data.ts` + `components/layout/Header.tsx`. Seed it
 * from the current nav with `pnpm seed-mega-menu`; after that Patrick can
 * reorder / rename / hide / add items here and the live header reflects it
 * (M5-503).
 *
 * Each top-level item has a `kind`:
 *   - `link`      → a plain link (New Products, Rush Products, Deals, Brands, Videos, Blog)
 *   - `dropdown`  → a flat dropdown of links (Services)
 *   - `megaPanel` → a columned panel. `variant` selects the renderer:
 *       - `cascade` → hover-reveal columns ("Shop by")
 *       - `grid`    → full-width grid popover ("All Categories")
 */

const menuLink = {
  type: 'object' as const,
  name: 'menuLink',
  title: 'Link',
  fields: [
    { name: 'label', type: 'string', title: 'Label', validation: (r: any) => r.required() },
    { name: 'href', type: 'string', title: 'Link', validation: (r: any) => r.required() },
  ],
  preview: { select: { title: 'label', subtitle: 'href' } },
};

const menuColumn = {
  type: 'object' as const,
  name: 'menuColumn',
  title: 'Column',
  fields: [
    {
      name: 'label',
      type: 'string',
      title: 'Column Header',
      validation: (r: any) => r.required(),
    },
    {
      name: 'href',
      type: 'string',
      title: 'Header Link',
      description: 'Where the column header links to. Leave blank for a non-clickable header.',
    },
    {
      name: 'nonClickable',
      type: 'boolean',
      title: 'Non-clickable header',
      description: 'When on, the header is plain text (no link), e.g. "Tradeshow & Events".',
      initialValue: false,
    },
    {
      name: 'links',
      type: 'array',
      title: 'Links',
      of: [menuLink],
    },
  ],
  preview: {
    select: { title: 'label', links: 'links' },
    prepare({ title, links }: { title?: string; links?: unknown[] }) {
      const n = Array.isArray(links) ? links.length : 0;
      return { title: title || '(untitled column)', subtitle: `${n} link${n === 1 ? '' : 's'}` };
    },
  },
};

const menuItem = {
  type: 'object' as const,
  name: 'menuItem',
  title: 'Menu Item',
  fields: [
    { name: 'label', type: 'string', title: 'Label', validation: (r: any) => r.required() },
    {
      name: 'kind',
      type: 'string',
      title: 'Type',
      options: {
        list: [
          { title: 'Plain link', value: 'link' },
          { title: 'Dropdown (flat list)', value: 'dropdown' },
          { title: 'Mega panel (columns)', value: 'megaPanel' },
        ],
        layout: 'radio',
      },
      initialValue: 'link',
      validation: (r: any) => r.required(),
    },
    {
      name: 'href',
      type: 'string',
      title: 'Link',
      hidden: ({ parent }: { parent?: { kind?: string } }) => parent?.kind !== 'link',
    },
    {
      name: 'variant',
      type: 'string',
      title: 'Panel Style',
      description:
        'Cascade = hover-reveal columns ("Shop by"). Grid = full-width grid popover ("All Categories").',
      options: {
        list: [
          { title: 'Cascade (Shop by)', value: 'cascade' },
          { title: 'Grid (All Categories)', value: 'grid' },
        ],
        layout: 'radio',
      },
      initialValue: 'cascade',
      hidden: ({ parent }: { parent?: { kind?: string } }) => parent?.kind !== 'megaPanel',
    },
    {
      name: 'links',
      type: 'array',
      title: 'Dropdown Links',
      of: [menuLink],
      hidden: ({ parent }: { parent?: { kind?: string } }) => parent?.kind !== 'dropdown',
    },
    {
      name: 'columns',
      type: 'array',
      title: 'Columns',
      of: [menuColumn],
      hidden: ({ parent }: { parent?: { kind?: string } }) => parent?.kind !== 'megaPanel',
    },
    // Reserved fields, retained for forward-compatibility. Not rendered by the
    // current header; a future "featured products" panel could consume them.
    {
      name: 'featured',
      type: 'boolean',
      title: 'Featured (reserved — not currently rendered)',
      initialValue: false,
      hidden: ({ parent }: { parent?: { kind?: string } }) => parent?.kind !== 'megaPanel',
    },
    {
      name: 'productRefs',
      type: 'array',
      title: 'Product References (reserved — not currently rendered)',
      of: [{ type: 'reference', to: [{ type: 'customProduct' }] }],
      hidden: ({ parent }: { parent?: { kind?: string } }) => parent?.kind !== 'megaPanel',
    },
  ],
  preview: {
    select: { title: 'label', kind: 'kind', href: 'href', variant: 'variant' },
    prepare({
      title,
      kind,
      href,
      variant,
    }: {
      title?: string;
      kind?: string;
      href?: string;
      variant?: string;
    }) {
      const subtitle =
        kind === 'link'
          ? href || 'link'
          : kind === 'dropdown'
            ? 'dropdown'
            : `mega panel · ${variant || 'cascade'}`;
      return { title: title || '(untitled)', subtitle };
    },
  },
};

export default defineType({
  name: 'megaMenu',
  title: 'Mega Menu',
  type: 'document',
  fields: [
    defineField({
      name: 'items',
      title: 'Menu Items',
      description:
        'Top-level navigation, left to right. Seed with `pnpm seed-mega-menu`; edits here reflect on the live site.',
      type: 'array',
      of: [menuItem],
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Mega Menu' }),
  },
});
