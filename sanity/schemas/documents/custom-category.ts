import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'customCategory',
  title: 'Custom Category',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'isCustom',
      title: 'Is Custom Category',
      type: 'boolean',
      initialValue: true,
      readOnly: true,
    }),
    defineField({
      name: 'targetKeyword',
      title: 'Target Keyword',
      type: 'string',
      description: 'Used by the AI generation prompt (e.g. "custom water bottles").',
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero Image',
      type: 'image',
      options: { hotspot: true },
      fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
    }),
    defineField({
      name: 'heroCopy',
      title: 'Hero Copy',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'introHtml',
      title: 'Intro (Portable Text)',
      type: 'array',
      of: [{ type: 'block' }],
      description: 'Editable directly, or click "Generate with AI" to auto-fill (M5-505).',
    }),
    defineField({
      name: 'bodySections',
      title: 'Body Sections',
      type: 'array',
      of: [{ type: 'block' }],
    }),
    defineField({
      name: 'faqs',
      title: 'FAQs',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'q', title: 'Question', type: 'string' },
            { name: 'a', title: 'Answer', type: 'text', rows: 3 },
          ],
          preview: { select: { title: 'q' } },
        },
      ],
    }),
    defineField({
      name: 'externalUrl',
      title: 'External CTA URL',
      type: 'string',
      description: 'Optional. If blank, CTAs default to the contact form.',
    }),
    defineField({
      name: 'relatedBlogPosts',
      title: 'Related Blog Posts',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'blogPost' }] }],
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'slug.current', media: 'heroImage' },
  },
});
