import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'leadSubmission',
  title: 'Lead Submission',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({ name: 'name', title: 'Name', type: 'string', readOnly: true }),
    defineField({ name: 'email', title: 'Email', type: 'string', readOnly: true }),
    defineField({ name: 'phone', title: 'Phone', type: 'string', readOnly: true }),
    defineField({ name: 'company', title: 'Company', type: 'string', readOnly: true }),
    defineField({ name: 'quantity', title: 'Quantity', type: 'string', readOnly: true }),
    defineField({
      name: 'comments',
      title: 'Comments',
      type: 'text',
      rows: 4,
      readOnly: true,
    }),
    defineField({ name: 'sourcePage', title: 'Source Page', type: 'string', readOnly: true }),
    defineField({ name: 'timestamp', title: 'Timestamp', type: 'datetime', readOnly: true }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'email', description: 'sourcePage' },
  },
});
