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
      name: 'contact',
      title: 'Contact Info',
      type: 'object',
      description:
        'Authoritative contact details. The footer and the Organization JSON-LD read from here. Falls back to the legacy Phone Number / Contact Email / Mailing Address fields above only if these are blank.',
      options: { collapsible: true, collapsed: false },
      fields: [
        defineField({
          name: 'phones',
          title: 'Phone Numbers',
          type: 'array',
          of: [{ type: 'string' }],
          description: 'One or more. The first is used as the primary telephone in schema.org.',
        }),
        defineField({
          name: 'email',
          title: 'Email',
          type: 'string',
          validation: (Rule) => Rule.email(),
        }),
        defineField({
          name: 'address',
          title: 'Address',
          type: 'object',
          options: { collapsible: true, collapsed: false },
          fields: [
            { name: 'street', type: 'string', title: 'Street' },
            { name: 'city', type: 'string', title: 'City' },
            { name: 'region', type: 'string', title: 'State / Region' },
            { name: 'postalCode', type: 'string', title: 'Postal / ZIP Code' },
            { name: 'country', type: 'string', title: 'Country', initialValue: 'US' },
          ],
        }),
      ],
    }),
    defineField({
      name: 'socialLinks',
      title: 'Social Links',
      type: 'array',
      description:
        'Add, reorder, or disable social profiles. Pick a known platform and just paste its URL — the matching icon renders automatically. Use "Other" (or upload a Custom Icon) for anything not in the list. Disabled links are hidden everywhere on the site and excluded from the Organization schema.',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'platform',
              type: 'string',
              title: 'Platform',
              options: {
                list: [
                  { title: 'Facebook', value: 'facebook' },
                  { title: 'Instagram', value: 'instagram' },
                  { title: 'LinkedIn', value: 'linkedin' },
                  { title: 'YouTube', value: 'youtube' },
                  { title: 'X (Twitter)', value: 'twitter' },
                  { title: 'Pinterest', value: 'pinterest' },
                  { title: 'TikTok', value: 'tiktok' },
                  { title: 'Other', value: 'other' },
                ],
              },
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'label',
              type: 'string',
              title: 'Label (optional)',
              description:
                'Accessible name + display label. Defaults to the platform name; required for the "Other" platform.',
            },
            {
              name: 'url',
              type: 'url',
              title: 'Profile URL',
              validation: (Rule) =>
                Rule.required().uri({ scheme: ['http', 'https'] }),
            },
            {
              name: 'customIcon',
              type: 'image',
              title: 'Custom Icon (optional)',
              description:
                'Used when Platform is "Other", or to override the built-in icon. SVG/PNG with transparent background works best.',
              options: { hotspot: false },
            },
            {
              name: 'enabled',
              type: 'boolean',
              title: 'Enabled',
              description: 'Off = hidden everywhere on the site and excluded from schema.',
              initialValue: true,
            },
          ],
          preview: {
            select: {
              platform: 'platform',
              label: 'label',
              url: 'url',
              enabled: 'enabled',
              media: 'customIcon',
            },
            prepare: ({ platform, label, url, enabled, media }) => ({
              title: `${label || platform || 'Social link'}${enabled === false ? ' (disabled)' : ''}`,
              subtitle: url,
              media,
            }),
          },
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
      name: 'categoryCtaBar',
      title: 'Category CTA Bar',
      type: 'object',
      description:
        'The "Not finding the exact … you\'re looking for?" bar shown below the products (above the FAQs) on every category and filter page that displays products. Pages with no products already show the big "Don\'t See The Products Listed?" block instead, so they never get this bar. The button opens the same "Find Products for Me" form. Leave any text field blank to use the default wording shown in its description.',
      options: { collapsible: true, collapsed: true },
      fields: [
        {
          name: 'enabled',
          type: 'boolean',
          title: 'Enabled',
          initialValue: true,
          description: 'Off = the bar is hidden on every category page.',
        },
        {
          name: 'heading',
          type: 'string',
          title: 'Heading',
          initialValue: "Not finding the exact {category} you're looking for?",
          description:
            'The token {category} is replaced automatically with the category name (remove it and the copy simply renders without it). Blank = default: "Not finding the exact {category} you\'re looking for?"',
        },
        {
          name: 'body',
          type: 'text',
          rows: 3,
          title: 'Body',
          initialValue:
            "We have other options. Contact us and we'll search through our database of over 1,000,000 promotional items.",
          description:
            'Supports the {category} token too. Blank = default: "We have other options. Contact us and we\'ll search through our database of over 1,000,000 promotional items."',
        },
        {
          name: 'buttonLabel',
          type: 'string',
          title: 'Button Label',
          initialValue: 'Find Products for Me',
          description: 'Blank = default: "Find Products for Me".',
        },
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
    defineField({
      name: 'rushProductsPage',
      title: 'Rush Products Page',
      type: 'object',
      description:
        'Hero copy + curation controls for /rush-products — the aggregator of every product Geiger lists under Shop By > 24 Hour Rush Products. Product list itself is auto-scraped weekly; use the hide list below to remove specific items.',
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
          name: 'hiddenRushSkus',
          title: 'Hide these SKUs from /rush-products',
          type: 'array',
          of: [{ type: 'string' }],
          options: { layout: 'tags' },
          description:
            'Geiger SKUs to remove from the /rush-products grid (e.g., "526320"). Useful when a rush item is off-brand or you do not want to promote it. Facet counts re-derive automatically.',
        },
        {
          name: 'pinnedRushSkus',
          title: 'Pin these Geiger SKUs to /rush-products',
          type: 'array',
          of: [{ type: 'string' }],
          options: { layout: 'tags' },
          description:
            'Geiger SKUs to promote to /rush-products even if Geiger\'s scrape did not include them. Looked up from data/geiger/products.json. Invalid/unknown SKUs are silently skipped.',
        },
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Global Settings' }),
  },
});
