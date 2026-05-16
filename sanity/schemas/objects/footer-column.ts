import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'footerColumn',
  title: 'Footer Column',
  type: 'object',
  fields: [
    defineField({
      name: 'heading',
      title: 'Heading',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'links',
      title: 'Links',
      type: 'array',
      of: [{ type: 'link' }],
    }),
  ],
  preview: {
    select: { title: 'heading' },
  },
});
