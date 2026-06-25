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
      // Intentionally NOT required: the FAQ library is seeded with question
      // stubs Patrick fills in later. The /faq page + search only surface FAQs
      // that already have an answer, so an empty stub never goes live.
    }),
    defineField({
      name: 'faqCategory',
      title: 'FAQ Category',
      description: 'Groups this question into a section on the /faq library page.',
      type: 'string',
      // KEEP IN SYNC with lib/faqs/categories.ts (the app/query/seed side). The
      // list is duplicated here because the standalone Studio bundler can't
      // import from the Next app's lib/.
      options: {
        list: [
          { title: 'Product Selection & Availability', value: 'product-selection' },
          { title: 'Ordering, Quotes & Minimums', value: 'ordering-quotes-minimums' },
          { title: 'Artwork, Proofs & Branding', value: 'artwork-proofs-branding' },
          { title: 'Production, Rush Orders & Delivery', value: 'production-rush-delivery' },
          {
            title: 'Company Stores, Kitting & Custom Programs',
            value: 'company-stores-kitting-programs',
          },
          {
            title: 'Order Changes, Cancellations & Problems',
            value: 'order-changes-cancellations-problems',
          },
          { title: 'Getting Started', value: 'getting-started' },
        ],
      },
    }),
    defineField({
      name: 'categoryTags',
      title: 'Category Tags',
      description:
        'Curated categories this FAQ applies to. Used by the Related FAQs section on /cat pages.',
      type: 'array',
      of: [
        { type: 'reference', to: [{ type: 'curatedCategory' }, { type: 'customCategory' }] },
      ],
    }),
  ],
  preview: {
    select: { title: 'question', category: 'faqCategory', answer: 'answer' },
    prepare: ({
      title,
      category,
      answer,
    }: {
      title?: string;
      category?: string;
      answer?: string;
    }) => ({
      title: title || '(no question)',
      subtitle: [category || 'Uncategorized', answer ? '✓ answered' : '— needs answer'].join(' · '),
    }),
  },
});
