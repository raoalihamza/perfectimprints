import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'homePage',
  title: 'Home Page',
  type: 'document',
  fields: [
    defineField({
      name: 'heroBanner',
      title: 'Hero Banner',
      type: 'object',
      fields: [
        { name: 'image', type: 'image', title: 'Image', options: { hotspot: true } },
        { name: 'headline', type: 'string', title: 'Headline' },
        { name: 'subheadline', type: 'string', title: 'Subheadline' },
        { name: 'ctaLabel', type: 'string', title: 'CTA Label' },
        { name: 'ctaHref', type: 'string', title: 'CTA Href' },
      ],
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
      title: 'Value Pillars (three)',
      type: 'array',
      description:
        'Three short pillars rendered above the featured blocks. Replaces a generic stat strip — speak to bulk B2B buyers (marketing, HR, safety, ops).',
      validation: (Rule) =>
        Rule.length(3).warning('Home page is designed for exactly three value pillars.'),
      of: [
        {
          type: 'object',
          fields: [
            { name: 'title', type: 'string', title: 'Title' },
            { name: 'body', type: 'text', title: 'Body', rows: 3 },
          ],
          preview: { select: { title: 'title', subtitle: 'body' } },
        },
      ],
      initialValue: [
        {
          title: 'Bulk Pricing on 22,000+ Products',
          body: 'Custom apparel, drinkware, bags, tech, writing, and giveaways — wholesale pricing scaled to your order size.',
        },
        {
          title: 'Rush Production Available',
          body: 'Promotional products with 1–5 day production for trade shows, hires, and on-site events that can’t wait.',
        },
        {
          title: 'Dedicated Reps, Free Art Proofs',
          body: 'Real account managers, no AI chat. Free art proofs before production so your branded items land right the first time.',
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
