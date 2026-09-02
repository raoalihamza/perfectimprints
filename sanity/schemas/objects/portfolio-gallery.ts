import { defineField, defineType } from 'sanity';

/**
 * The reusable Portfolio Gallery block (PORT-100).
 *
 * Registered as a NAMED object type, following the `blogProduct` promotion
 * precedent (sanity/schemas/objects/blog-products.ts), so PORT-120 can place
 * it on blog posts, product pages, video pages and landing pages by adding
 * `{ type: 'portfolioGallery' }` to each document's fields without writing
 * four of anything. Its items are decided by ONE resolver
 * (lib/portfolio/gallery.ts) on every surface.
 *
 * DELIBERATELY NOT in `pageSectionSchemas` and NOT on any document's fields in
 * this ticket. All placement is PORT-120.
 *
 * Two modes, with conditional visibility so Patrick only sees the fields that
 * apply: "Hand picked" shows an ordered list of items; "From a category" shows
 * a category picker and fills automatically (featured first, then display
 * order, then newest).
 */
export const PORTFOLIO_GALLERY_MODES = [
  { title: 'Hand picked', value: 'manual' },
  { title: 'From a category', value: 'category' },
] as const;

export default defineType({
  name: 'portfolioGallery',
  title: 'Portfolio Gallery',
  type: 'object',
  fields: [
    defineField({
      name: 'heading',
      title: 'Heading (optional)',
      type: 'string',
      description: 'Shown above the gallery, e.g. "Recent work for fire departments".',
    }),
    defineField({
      name: 'mode',
      title: 'Which items',
      type: 'string',
      options: { list: [...PORTFOLIO_GALLERY_MODES], layout: 'radio', direction: 'horizontal' },
      initialValue: 'manual',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'items',
      title: 'Items (in this order)',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'portfolioItem' }] }],
      description:
        'Pick the portfolio items to show. They appear in this order; drag to reorder. Hidden items are skipped automatically.',
      hidden: ({ parent }) => parent?.mode === 'category',
      validation: (Rule) =>
        Rule.unique().custom((items, ctx) => {
          const mode = (ctx.parent as { mode?: string } | undefined)?.mode ?? 'manual';
          if (mode !== 'manual') return true;
          if (!Array.isArray(items) || items.length === 0) {
            return 'Pick at least one item, or switch to "From a category".';
          }
          return true;
        }),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'reference',
      to: [{ type: 'portfolioCategory' }],
      description:
        'The gallery fills itself from this category: featured items first, then display order, then newest.',
      hidden: ({ parent }) => parent?.mode !== 'category',
      validation: (Rule) =>
        Rule.custom((value, ctx) => {
          const mode = (ctx.parent as { mode?: string } | undefined)?.mode;
          if (mode === 'category' && !value) return 'Pick a category, or switch to "Hand picked".';
          return true;
        }),
    }),
    defineField({
      name: 'limit',
      title: 'How many to show',
      type: 'number',
      initialValue: 8,
      description: 'Maximum number of items in this gallery. Default 8.',
      validation: (Rule) => Rule.integer().min(1).max(48),
    }),
    defineField({
      name: 'hidden',
      title: 'Hidden',
      type: 'boolean',
      description: 'Hide this gallery on the live site without deleting it.',
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      heading: 'heading',
      mode: 'mode',
      items: 'items',
      category: 'category.title',
      limit: 'limit',
      hidden: 'hidden',
    },
    prepare({ heading, mode, items, category, limit, hidden }) {
      const count = Array.isArray(items) ? items.length : 0;
      const source =
        mode === 'category'
          ? `From category: ${category || 'none chosen'}`
          : `Hand picked: ${count} item${count === 1 ? '' : 's'}`;
      return {
        title: `Portfolio gallery: ${heading || source}`,
        subtitle: `${source}${typeof limit === 'number' ? ` · up to ${limit}` : ''}${hidden ? ' · hidden' : ''}`,
      };
    },
  },
});
