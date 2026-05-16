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
  ],
  preview: {
    prepare: () => ({ title: 'Global Settings' }),
  },
});
