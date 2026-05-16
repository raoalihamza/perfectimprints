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
      name: 'textContent',
      title: 'Text Content',
      type: 'array',
      of: [{ type: 'block' }],
    }),
    defineField({
      name: 'brandsGridHeading',
      title: 'Brands Grid Heading',
      type: 'string',
      initialValue: 'Brands and Clients',
    }),
    defineField({
      name: 'brandsGridSubheading',
      title: 'Brands Grid Subheading',
      type: 'string',
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Home Page' }),
  },
});
