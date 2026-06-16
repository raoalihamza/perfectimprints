import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'globalSettings',
  title: 'Global Settings',
  type: 'document',
  fields: [
    defineField({
      name: 'phoneNumber',
      title: 'Phone Number',
      type: 'string',
      initialValue: '800-773-9472',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'contactEmail',
      title: 'Contact Email',
      type: 'string',
    }),
    defineField({
      name: 'mailingAddress',
      title: 'Mailing Address',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'hoursOfOperation',
      title: 'Hours of Operation',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'socialLinks',
      title: 'Social Links',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'platform', type: 'string', title: 'Platform' },
            { name: 'url', type: 'url', title: 'URL' },
          ],
          preview: { select: { title: 'platform', subtitle: 'url' } },
        },
      ],
    }),
    defineField({
      name: 'footerColumns',
      title: 'Footer Columns',
      type: 'array',
      of: [{ type: 'footerColumn' }],
      description:
        'Recommended order: About Us, Popular Links, Customer Service, Contact Us.',
    }),
    defineField({
      name: 'popularLinks',
      title: 'Popular Links',
      type: 'array',
      of: [{ type: 'link' }],
      description: 'Optional seasonal popular links shown in the footer.',
    }),
    defineField({
      name: 'copyrightText',
      title: 'Copyright Text',
      type: 'string',
      initialValue: '© {year} Perfect Imprints. All Rights Reserved.',
      description: 'Use {year} as a placeholder that is replaced at render time.',
    }),
    defineField({
      name: 'ctaBanner',
      title: 'CTA Banner',
      type: 'object',
      fields: [
        { name: 'title', type: 'string', title: 'Title' },
        { name: 'body', type: 'text', title: 'Body', rows: 2 },
        { name: 'buttonLabel', type: 'string', title: 'Button Label' },
        { name: 'buttonHref', type: 'string', title: 'Button Href' },
      ],
    }),
    defineField({
      name: 'dealsPage',
      title: 'Deals Page',
      type: 'object',
      description:
        'Hero copy + curation controls for /deals — the aggregator of every on-sale and closeout product Geiger lists under Shop By > Deals. Product list itself is auto-scraped weekly; use the hide list below to remove specific items.',
      fields: [
        { name: 'heading', type: 'string', title: 'Heading (H1)' },
        { name: 'intro', type: 'text', title: 'Intro paragraph', rows: 4 },
        { name: 'metaTitle', type: 'string', title: 'Meta title (under 60 chars)' },
        {
          name: 'metaDescription',
          type: 'text',
          title: 'Meta description (under 155 chars)',
          rows: 2,
        },
        {
          name: 'hiddenDealSkus',
          title: 'Hide these SKUs from /deals',
          type: 'array',
          of: [{ type: 'string' }],
          options: { layout: 'tags' },
          description:
            'Geiger SKUs to remove from the /deals product grid (e.g., "526499"). Useful when a deal product is off-brand or you do not want to promote it. Facet counts re-derive automatically.',
        },
        {
          name: 'pinnedDealSkus',
          title: 'Pin these Geiger SKUs to /deals',
          type: 'array',
          of: [{ type: 'string' }],
          options: { layout: 'tags' },
          description:
            'Geiger SKUs to promote to /deals even if Geiger\'s scrape did not include them. Looked up from data/geiger/products.json. Invalid/unknown SKUs are silently skipped.',
        },
      ],
    }),
    defineField({
      name: 'newProductsPage',
      title: 'New Products Page',
      type: 'object',
      description:
        'Hero copy + curation controls for /new-products — the aggregator of every product Geiger lists under Shop By > New Products. Product list itself is auto-scraped weekly; use the hide list below to remove specific items.',
      fields: [
        { name: 'heading', type: 'string', title: 'Heading (H1)' },
        { name: 'intro', type: 'text', title: 'Intro paragraph', rows: 4 },
        { name: 'metaTitle', type: 'string', title: 'Meta title (under 60 chars)' },
        {
          name: 'metaDescription',
          type: 'text',
          title: 'Meta description (under 155 chars)',
          rows: 2,
        },
        {
          name: 'hiddenNewProductSkus',
          title: 'Hide these SKUs from /new-products',
          type: 'array',
          of: [{ type: 'string' }],
          options: { layout: 'tags' },
          description:
            'Geiger SKUs to remove from the /new-products grid (e.g., "529459"). Useful when a new item is off-brand or you do not want to promote it. Facet counts re-derive automatically.',
        },
        {
          name: 'pinnedNewProductSkus',
          title: 'Pin these Geiger SKUs to /new-products',
          type: 'array',
          of: [{ type: 'string' }],
          options: { layout: 'tags' },
          description:
            'Geiger SKUs to promote to /new-products even if Geiger\'s scrape did not include them. Looked up from data/geiger/products.json. Invalid/unknown SKUs are silently skipped.',
        },
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Global Settings' }),
  },
});
