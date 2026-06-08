import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'faq',
  title: 'FAQ',
  type: 'document',
  fields: [
    defineField({
      name: 'question',
      title: 'Question',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'answer',
      title: 'Answer',
      type: 'text',
      rows: 4,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'categoryTags',
      title: 'Category Tags',
      description:
        'Curated categories this FAQ applies to. Used by the Related FAQs section on /cat pages.',
      type: 'array',
      of: [
        { type: 'reference', to: [{ type: 'curatedCategory' }] },
        { type: 'reference', to: [{ type: 'customCategory' }] },
      ],
    }),
  ],
  preview: {
    select: { title: 'question', subtitle: 'answer' },
  },
});
