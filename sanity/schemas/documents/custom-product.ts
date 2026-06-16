import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'customProduct',
  title: 'Custom Product',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: { hotspot: true },
      fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'externalUrl',
      title: 'External URL',
      type: 'url',
      description:
        'Where this product opens (partner site, vendor, custom landing). Non-Geiger URLs open as-is; Geiger URLs auto-rewrite to the patrickblack.geiger.com affiliate host.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'parentCategory',
      title: 'Parent Category',
      type: 'reference',
      to: [{ type: 'curatedCategory' }, { type: 'customCategory' }],
      description:
        'Determines which Category facet bucket this product appears under on /deals and /new-products.',
    }),
    defineField({
      name: 'displayOrder',
      title: 'Display Order',
      type: 'number',
      initialValue: 0,
    }),

    // ---- Placement flags ----
    defineField({
      name: 'placements',
      title: 'Show On Pages',
      type: 'object',
      description:
        'Toggle on/off per page. A single custom product can appear on /deals, /new-products, or both. Category-grid placement is controlled by Parent Category above.',
      fields: [
        {
          name: 'onDeals',
          type: 'boolean',
          title: 'Show on /deals',
          initialValue: false,
        },
        {
          name: 'onNewProducts',
          type: 'boolean',
          title: 'Show on /new-products',
          initialValue: false,
        },
      ],
    }),

    // ---- Commerce fields (optional; only fill when needed for /deals or /new-products) ----
    defineField({
      name: 'brand',
      title: 'Brand',
      type: 'string',
      description: 'Optional. Participates in the Brand filter on /deals and /new-products.',
    }),
    defineField({
      name: 'lowPrice',
      title: 'Low Price (USD)',
      type: 'number',
      description: 'Cheapest tier shown on the product card.',
    }),
    defineField({
      name: 'highPrice',
      title: 'High Price (USD)',
      type: 'number',
      description: 'Top-of-range price shown on the product card. Leave empty for single price.',
    }),
    defineField({
      name: 'msrp',
      title: 'MSRP (USD)',
      type: 'number',
    }),
    defineField({
      name: 'minQty',
      title: 'Minimum Quantity',
      type: 'number',
    }),
    defineField({
      name: 'productionTime',
      title: 'Production Time (days)',
      type: 'number',
    }),

    // ---- Filter taggings (optional; only fill what you want the filter sidebar to honor) ----
    defineField({
      name: 'colors',
      title: 'Colors',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
      description:
        'Tag with the same color names Geiger uses (Blue, Red, Black, etc.) so this product participates in the Color filter alongside scraped Geiger products.',
    }),
    defineField({
      name: 'material',
      title: 'Material',
      type: 'string',
      description: 'Tag with the Material name (e.g. "Stainless Steel"). Participates in the Material filter.',
    }),

    // ---- Badges ----
    defineField({
      name: 'badges',
      title: 'Badges',
      type: 'array',
      of: [
        {
          type: 'string',
          options: {
            list: [
              { title: 'NEW', value: 'new' },
              { title: 'SALE', value: 'sale' },
              { title: 'CLOSEOUT', value: 'closeout' },
            ],
          },
        },
      ],
      options: { layout: 'tags' },
      description:
        'Ribbons shown on the product card. CLOSEOUT > SALE > NEW priority. Leave empty for no ribbon.',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      media: 'image',
      subtitle: 'externalUrl',
      onDeals: 'placements.onDeals',
      onNew: 'placements.onNewProducts',
    },
    prepare({ title, media, subtitle, onDeals, onNew }) {
      const tags: string[] = [];
      if (onDeals) tags.push('Deals');
      if (onNew) tags.push('New');
      const tagSuffix = tags.length ? ` · ${tags.join(' + ')}` : '';
      return { title, media, subtitle: `${subtitle || ''}${tagSuffix}` };
    },
  },
});
