import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'homePage',
  title: 'Home Page',
  type: 'document',
  fields: [
    defineField({
      name: 'heroText',
      title: 'Hero (top of page)',
      type: 'object',
      description:
        'The text hero at the very top of the home page — eyebrow, big headline (H1), and the sub-paragraph below it. Kept as text (no image) so the page loads fast. This is the heading Patrick edits here.',
      options: { collapsible: true, collapsed: false },
      fields: [
        { name: 'eyebrow', type: 'string', title: 'Eyebrow / kicker (small red line above the H1)' },
        { name: 'headline', type: 'string', title: 'Headline (H1)' },
        { name: 'subheadline', type: 'text', title: 'Sub-paragraph', rows: 4 },
      ],
      initialValue: {
        eyebrow: 'BULK PROMOTIONAL EXPERTS SINCE 1999',
        headline: 'Custom Promotional Products That People Actually Use',
        subheadline:
          'Branded apparel, drinkware, bags, tech, and giveaways for trade shows, employee gifts, safety programs, and customer thank-yous. 22,000+ products with bulk volume pricing, rush options, and free art proofs.',
      },
    }),
    defineField({
      name: 'heroBanner',
      title: 'Hero Banner (legacy image fields — not shown on the home page)',
      type: 'object',
      description:
        'Legacy fields. The home hero is now driven by the "Hero (top of page)" group above; these are retained only so older data is not lost.',
      options: { collapsible: true, collapsed: true },
      fields: [
        { name: 'image', type: 'image', title: 'Image', options: { hotspot: true } },
        { name: 'headline', type: 'string', title: 'Headline' },
        { name: 'subheadline', type: 'string', title: 'Subheadline' },
        { name: 'ctaLabel', type: 'string', title: 'CTA Label' },
        { name: 'ctaHref', type: 'string', title: 'CTA Href' },
      ],
    }),
    defineField({
      name: 'bannerRowHeading',
      title: 'Banner Row Heading (H2 above the banners)',
      type: 'string',
      description: 'Section heading shown directly above the banner row. Leave blank to hide it.',
      initialValue: 'Featured Product Categories',
    }),
    defineField({
      name: 'bannerRowSubheading',
      title: 'Banner Row Subheading',
      type: 'text',
      rows: 2,
      description: 'Short line under the banner-row heading. Leave blank to hide it.',
      initialValue: 'Seasonal promos your customers and team will love and use right now!',
    }),
    defineField({
      name: 'bannerRow',
      title: 'Banner Row (three banners)',
      description:
        'A single row of up to three equal-size banner images that link out, shown below the hero. Upload consistently-sized images so the row stays uniform. Leave empty to hide the row entirely.',
      type: 'array',
      validation: (Rule) => Rule.max(3).warning('The banner row is designed for three banners.'),
      of: [
        {
          type: 'object',
          fields: [
            { name: 'image', type: 'image', title: 'Banner image', options: { hotspot: true } },
            {
              name: 'link',
              type: 'url',
              title: 'Link URL',
              description: 'Where the banner links (an internal path like /deals or a full URL).',
              validation: (Rule) =>
                Rule.uri({ allowRelative: true, scheme: ['http', 'https'] }),
            },
            {
              name: 'alt',
              type: 'string',
              title: 'Alt text',
              validation: (Rule) => Rule.required(),
            },
          ],
          preview: { select: { title: 'alt', subtitle: 'link', media: 'image' } },
        },
      ],
    }),
    defineField({
      name: 'featuredBlocks',
      title: 'Featured Image Blocks (six)',
      type: 'array',
      validation: (Rule) =>
        Rule.length(6).warning('Patrick spec: home page has exactly six featured blocks.'),
      of: [
        {
          type: 'object',
          fields: [
            { name: 'title', type: 'string', title: 'Title' },
            {
              name: 'image',
              type: 'image',
              title: 'Image',
              options: { hotspot: true },
              fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
            },
            { name: 'href', type: 'string', title: 'Link' },
          ],
          preview: { select: { title: 'title', media: 'image' } },
        },
      ],
      initialValue: [
        { title: 'Promotional Products', href: '/cat/promotional-products' },
        { title: 'New & Trending Promotional Items', href: '/cat/new-products' },
        { title: 'Custom Apparel', href: '/cat/custom-apparel' },
        { title: 'Company Stores', href: '/services/company-stores' },
        { title: 'Popup Stores', href: '/services/popup-stores' },
        { title: '100% Custom Promotional Items', href: '/services/custom-products' },
      ],
    }),
    defineField({
      name: 'valueProps',
      title: 'Value Pillars',
      type: 'array',
      description:
        'Short pillars rendered near the top of the page — speak to bulk B2B buyers (marketing, HR, safety, ops). Three or fewer show as a static row; add MORE than three and they rotate in a carousel (3 visible at a time).',
      validation: (Rule) =>
        Rule.min(1).warning('Add at least one value pillar (3 looks best as a static row).'),
      of: [
        {
          type: 'object',
          fields: [
            { name: 'title', type: 'string', title: 'Title' },
            {
              name: 'body',
              type: 'array',
              title: 'Body',
              description:
                'Rich text — you can add links here (select text → link icon). Links render in brand red. For example, link "Rush Production Available" to the Rush Products page.',
              of: [
                {
                  type: 'block',
                  // Plain paragraphs only — no headings inside a pillar — but
                  // keep bold/italic + links so Patrick can add a hyperlink.
                  styles: [{ title: 'Normal', value: 'normal' }],
                  lists: [],
                  marks: {
                    decorators: [
                      { title: 'Bold', value: 'strong' },
                      { title: 'Italic', value: 'em' },
                    ],
                    annotations: [
                      {
                        name: 'link',
                        type: 'object',
                        title: 'Link',
                        fields: [
                          {
                            name: 'href',
                            type: 'url',
                            title: 'URL',
                            validation: (Rule) =>
                              Rule.uri({ allowRelative: true, scheme: ['http', 'https', 'mailto', 'tel'] }),
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
          preview: { select: { title: 'title' } },
        },
      ],
    }),
    defineField({
      name: 'newProductsHeading',
      title: 'New Products Rail Heading',
      type: 'string',
      initialValue: 'New and Trending Promotional Products',
    }),
    defineField({
      name: 'rushProductsHeading',
      title: 'Rush Products Rail Heading',
      type: 'string',
      description: 'Heading for the rush-production product rail (shown below the New Products rail).',
      initialValue: 'Rush Production Promotional Products',
    }),
    defineField({
      name: 'testimonialsHeading',
      title: 'Testimonials Heading',
      type: 'string',
      description: 'Heading above the testimonials carousel.',
      initialValue: 'What Our Customers are Saying',
    }),
    defineField({
      name: 'testimonials',
      title: 'Testimonials',
      type: 'array',
      description:
        'Short customer quotes. The section is hidden on the home page when this list is empty.',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'text', type: 'text', title: 'Quote', rows: 4 },
            { name: 'attribution', type: 'string', title: 'Attribution (name + role)' },
            { name: 'company', type: 'string', title: 'Company (optional)' },
          ],
          preview: { select: { title: 'attribution', subtitle: 'text' } },
        },
      ],
    }),
    defineField({
      name: 'blogPreviewHeading',
      title: 'Blog Preview Heading',
      type: 'string',
      initialValue: 'From the Blog',
    }),
    defineField({
      name: 'textContent',
      title: 'SEO Text Content',
      type: 'array',
      of: [{ type: 'block' }],
      description:
        'Long-form intro/SEO copy rendered at the bottom of the home page. Optional — written in Patrick’s voice, never paraphrased from Geiger.',
    }),
    defineField({
      name: 'brandsGridHeading',
      title: 'Brands Strip Heading',
      type: 'string',
      initialValue: 'Brands We Carry',
    }),
    defineField({
      name: 'brandsGridSubheading',
      title: 'Brands Strip Subheading',
      type: 'string',
      initialValue: 'Custom imprint and embroidery on the brands buyers already trust.',
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Home Page' }),
  },
});
