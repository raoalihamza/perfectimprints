import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'link',
  title: 'Link',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      title: 'Label',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'href',
      title: 'URL or path',
      type: 'string',
      description: 'Internal path (e.g. /contact) or absolute URL.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'external',
      title: 'Opens in new tab',
      type: 'boolean',
      initialValue: false,
    }),
  ],
  preview: {
    select: { title: 'label', subtitle: 'href' },
  },
});
