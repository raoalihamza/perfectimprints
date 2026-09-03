import { defineField, defineType } from 'sanity';
import { ProductSkuPicker } from '../../components/ProductPicker';

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
      name: 'videoCtaBar',
      title: 'Video CTA Bar',
      type: 'object',
      description:
        'The "Need help choosing…?" bar shown on every video page (below the featured products, above Related Videos). Same style and same "Find Products for Me" form as the Category CTA Bar above — this one is just the wording for video pages, where there is no product category to name. Leave any text field blank to use the default wording shown in its description.',
      options: { collapsible: true, collapsed: true },
      fields: [
        {
          name: 'enabled',
          type: 'boolean',
          title: 'Enabled',
          initialValue: true,
          description: 'Off = the bar is hidden on every video page.',
        },
        {
          name: 'heading',
          type: 'string',
          title: 'Heading',
          initialValue: "Need help choosing the right Promotional Products? We're here.",
          description:
            'Blank = default: "Need help choosing the right Promotional Products? We\'re here."',
        },
        {
          name: 'body',
          type: 'text',
          rows: 3,
          title: 'Body',
          initialValue:
            "Contact us and we'll search through our database of over 1,000,000 promotional items.",
          description:
            'Blank = default: "Contact us and we\'ll search through our database of over 1,000,000 promotional items."',
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
    // PORT-115. The /portfolio page's own copy lives HERE, on the singleton the
    // webhook Filter already carries in both environments, rather than on a
    // new document type that would need the Filter edited by hand in staging
    // and production (a step PORT-000 found silently missed eight times on
    // this project). Same reasoning as the three aggregator page objects
    // above. Rich text (the shared richAnswer: paragraphs, bold, italic,
    // links; no images or blocks) so a phrase can be bolded or linked.
    defineField({
      name: 'portfolioPage',
      title: 'Portfolio Page',
      type: 'object',
      description:
        'Copy for the Portfolio Gallery page at /portfolio. The photos come from your Portfolio Items; this is only the introduction shown above them.',
      options: { collapsible: true, collapsed: true },
      fields: [
        {
          name: 'intro',
          title: 'Introduction (shown above the filters and photos)',
          type: 'richAnswer',
          description:
            'A short paragraph or two, in your own words, about the kind of work you take on. You can bold a phrase or add a link. Leave it empty and the page keeps its standard one-line opening. It never shows while the gallery has no published items.',
        },
      ],
    }),
    // HIDE-100. Sits directly above "Site Search" on purpose: the two controls
    // look alike in Studio and the difference has to be readable at a glance.
    // This one is the broad one (everywhere), that one is the narrow exception
    // (search only). Both are read at request time, so an edit takes effect on
    // publish without a rebuild and removing a SKU brings the product back.
    //
    // Patrick's stated purpose, which the wording below reflects: this is the
    // list for Geiger products he has REPLACED with his own /products/<slug>
    // page, so the plain Geiger card stops competing with his own. It is NOT
    // the tool for an item showing in the wrong category; that stays the
    // per-category "Hidden SKUs" field on a Category Override, which is
    // unchanged and still the right control for that job.
    defineField({
      name: 'hiddenProducts',
      title: 'Hidden Products (whole site)',
      type: 'object',
      description:
        'Products here are removed from every part of the site at once. Use this when you have built your own product page for a Geiger item and do not want the plain Geiger version showing next to it.',
      options: { collapsible: true, collapsed: true },
      fields: [
        {
          name: 'skus',
          title: 'Hide these products everywhere',
          type: 'array',
          of: [{ type: 'string' }],
          components: { input: ProductSkuPicker },
          description:
            'Search the catalog and click a product to remove it from the WHOLE site: every category page, related products, product strips in blogs, videos, pages and landing pages, Deals, New Products, Rush Products, brand pages, Promotional Products, and site search. Use it for a Geiger product you have replaced with your own product page. To remove an item from ONE category only, because it does not belong there, use the Hidden SKUs field on that Category Override instead. Your own custom products and product pages can never be hidden by this list. Remove a product from this list to bring it back everywhere. Takes effect within seconds of publishing.',
        },
      ],
    }),
    // Q-170 improvement 2. Deliberately its own group rather than a field on one
    // of the three aggregator objects above: those hide lists each control ONE
    // page's grid, this one controls SEARCH across the whole site and nothing
    // else. Read at request time by every search read path, so an edit takes
    // effect on publish without a rebuild, and removing a SKU brings it back.
    defineField({
      name: 'siteSearch',
      title: 'Site Search',
      type: 'object',
      description:
        'Controls what the site search can find, and nothing else. A product hidden here still appears on its category pages and anywhere else that lists it. To remove a product from the whole site, use Hidden Products (whole site) above.',
      options: { collapsible: true, collapsed: true },
      fields: [
        {
          name: 'hiddenSkus',
          title: 'Hide these SKUs from site search only',
          type: 'array',
          of: [{ type: 'string' }],
          components: { input: ProductSkuPicker },
          description:
            'Search the catalog and click a product to stop it appearing in the search box suggestions and on the /search results page. It is NOT removed from anywhere else: it still appears on its category pages, in the sitemap, and on any page that lists it. If you want it gone from the whole site, use Hidden Products (whole site) above instead, and leave this list alone. Remove it from this list to bring it back to search. Takes effect within seconds of publishing.',
        },
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Global Settings' }),
  },
});
