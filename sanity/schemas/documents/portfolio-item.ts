import { defineField, defineType } from 'sanity';
// The twenty colour values are the site's own /cat colour-facet vocabulary.
// Imported, not retyped: lib/portfolio/colors.ts is pure and dependency-free,
// so the Studio bundle takes it the same way sanity/schemas/documents/quote.ts
// takes lib/quotes/quote-totals (a plain relative import). One list, two users.
import { PORTFOLIO_COLOR_OPTIONS, isPortfolioColor } from '../../../lib/portfolio/colors';

/**
 * Portfolio Gallery item (PORT-100): one job Patrick actually produced for a
 * customer, e.g. "Embroidered caps for a fire department".
 *
 * ONE image per item in this ticket. The schema is written so a later
 * `additionalImages[]` array can be added without touching the existing
 * `image` field or any stored document (see the PORT-100 report).
 *
 * The `slug` is optional and used by NO route yet. It exists so that if
 * Patrick later wants individual case-study pages, the data is already there.
 * No route is built for it here.
 */
export default defineType({
  name: 'portfolioItem',
  title: 'Portfolio Item',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'What the job was, e.g. "Embroidered caps for a fire department".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug (optional)',
      type: 'slug',
      description:
        'Not used on the site yet. Fill it in (click Generate) if you think this job might get its own page one day; it costs nothing now.',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) =>
        Rule.custom((slug?: { current?: string }) => {
          const current = slug?.current?.trim();
          if (!current) return true;
          if (current.includes('/')) return 'No slashes. This is a single dashed phrase.';
          if (current !== current.toLowerCase()) return 'Lowercase only.';
          return true;
        }),
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      description: 'The photo of the finished work. Drag the hotspot to choose what stays in view when it is cropped.',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          title: 'Alt text',
          type: 'string',
          description:
            'A short description of the picture for screen readers and Google, e.g. "Navy embroidered caps with a fire department crest".',
          validation: (Rule) => Rule.required().max(160),
        }),
      ],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'reference',
      to: [{ type: 'portfolioCategory' }],
      description: 'Which gallery filter this belongs under. Create categories under Portfolio Category.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'colors',
      title: 'Colours',
      type: 'array',
      of: [{ type: 'string' }],
      description:
        'Tick every colour that appears in the work (a job often has several). These are the same twenty colours the site\'s category filters use, so the gallery colour filter and the product filters speak the same language.',
      options: {
        list: [...PORTFOLIO_COLOR_OPTIONS],
        layout: 'grid',
      },
      validation: (Rule) =>
        Rule.unique().custom((values?: unknown[]) => {
          const bad = (values ?? []).filter((v) => !isPortfolioColor(v));
          if (bad.length === 0) return true;
          return `Only the listed colours are allowed. Not recognised: ${bad.map(String).join(', ')}.`;
        }),
    }),
    defineField({
      name: 'description',
      title: 'Description (optional)',
      type: 'text',
      rows: 3,
      description: 'A line or two about the job: what was made, how it was decorated, what it was for.',
      validation: (Rule) => Rule.max(400),
    }),
    defineField({
      name: 'clientName',
      title: 'Client name (optional)',
      type: 'string',
      description:
        'ONLY fill this in where the customer has agreed to be named on your website. Leave it blank otherwise; the item shows perfectly well without it.',
      validation: (Rule) => Rule.max(120),
    }),
    defineField({
      name: 'featured',
      title: 'Featured',
      type: 'boolean',
      description: 'Pins this item to the top of the gallery and of any "From a category" gallery block.',
      initialValue: false,
    }),
    defineField({
      name: 'displayOrder',
      title: 'Display order',
      type: 'number',
      description:
        'Lower numbers come first (after any featured items). Leave blank to sort after the numbered ones, newest first.',
      validation: (Rule) => Rule.integer(),
    }),
    defineField({
      name: 'hidden',
      title: 'Hidden',
      type: 'boolean',
      description: 'Take this item off the site without deleting it.',
      initialValue: false,
    }),
  ],
  orderings: [
    {
      title: 'Gallery order (featured, then display order, then newest)',
      name: 'galleryOrder',
      by: [
        { field: 'featured', direction: 'desc' },
        { field: 'displayOrder', direction: 'asc' },
        { field: '_createdAt', direction: 'desc' },
      ],
    },
    { title: 'Newest first', name: 'newest', by: [{ field: '_createdAt', direction: 'desc' }] },
  ],
  preview: {
    select: {
      title: 'title',
      media: 'image',
      category: 'category.title',
      featured: 'featured',
      hidden: 'hidden',
    },
    prepare({ title, media, category, featured, hidden }) {
      const parts: string[] = [category || 'No category'];
      if (featured) parts.push('Featured');
      if (hidden) parts.push('HIDDEN');
      return { title: title || 'Untitled item', subtitle: parts.join(' · '), media };
    },
  },
});
