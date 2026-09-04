import { defineField, defineType } from 'sanity';
import { portfolioGalleryCategoryProblem, portfolioGalleryItemsProblem } from './portfolio-gallery-rules';

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
 * Placed on all five surfaces by PORT-120: a field on productPage, video and
 * landingPage, a member of the blog body, and a page-builder section.
 *
 * Two modes, with conditional visibility so Patrick only sees the fields that
 * apply: "Hand picked" shows an ordered list of items; "From a category" shows
 * a category picker and fills automatically (featured first, then display
 * order, then newest).
 *
 * NO FIELD HERE MAY CARRY AN `initialValue` (FIX-861). Because the block is
 * also a document FIELD, Sanity writes any initial value into every new
 * product page, video and landing page on creation, and the block's own rules
 * then block Publish on a gallery nobody opened. An untouched block must stay
 * absent. The publish rules, and what counts as "started", live in
 * ./portfolio-gallery-rules.ts.
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
      description: 'Leave this unanswered for no gallery. Unanswered means hand picked once you add items.',
    }),
    defineField({
      name: 'items',
      title: 'Items (in this order)',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'portfolioItem' }] }],
      description:
        'Pick the portfolio items to show. They appear in this order; drag to reorder. Hidden items are skipped automatically.',
      hidden: ({ parent }) => parent?.mode === 'category',
      validation: (Rule) => Rule.unique().custom((_items, ctx) => portfolioGalleryItemsProblem(ctx.parent)),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'reference',
      to: [{ type: 'portfolioCategory' }],
      description:
        'The gallery fills itself from this category: featured items first, then display order, then newest.',
      hidden: ({ parent }) => parent?.mode !== 'category',
      validation: (Rule) => Rule.custom((_value, ctx) => portfolioGalleryCategoryProblem(ctx.parent)),
    }),
    defineField({
      name: 'limit',
      title: 'How many to show',
      type: 'number',
      description: 'Maximum number of items in this gallery. Leave blank for 8.',
      validation: (Rule) => Rule.integer().min(1).max(48),
    }),
    defineField({
      name: 'hidden',
      title: 'Hidden',
      type: 'boolean',
      description: 'Hide this gallery on the live site without deleting it.',
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
