import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'brand',
  title: 'Brand',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'name', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'image',
      options: { hotspot: true },
      fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
    }),
    defineField({
      name: 'description',
      title: 'Description',
      description:
        'Optional brand intro shown on /brands/[slug]. Left blank, the per-brand page falls back to a generic paragraph.',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'geigerUrl',
      title: 'Geiger URL',
      description:
        'Source Geiger brand-listing URL. Always linked through the affiliate-rewrite helper.',
      type: 'url',
    }),
    defineField({
      name: 'productCount',
      title: 'Product Count',
      description: 'Auto-populated from data/geiger/products.json during the monthly rebuild.',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'featured',
      title: 'Featured',
      description:
        'Turn on to surface this brand in the Featured Brands strip at the top of the /brands page. It still appears in the full A–Z grid below too.',
      type: 'boolean',
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'productCount',
      media: 'logo',
    },
    prepare({ title, subtitle, media }) {
      return {
        title,
        subtitle: typeof subtitle === 'number' ? `${subtitle} products` : undefined,
        media,
      };
    },
  },
});
