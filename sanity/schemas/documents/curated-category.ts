import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'curatedCategory',
  title: 'Curated Category',
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
      of: [{ type: 'reference', to: [{ type: 'faq' }] }],
    }),
    defineField({
      name: 'mappedGeigerUrl',
      title: 'Mapped Geiger URL',
      type: 'string',
      description:
        'Source Geiger URL (https://www.geiger.com/...). Always linked through the affiliate helper.',
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
