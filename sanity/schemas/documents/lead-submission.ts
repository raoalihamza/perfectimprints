import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'leadSubmission',
  title: 'Lead Submission',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({ name: 'firstName', title: 'First Name', type: 'string', readOnly: true }),
    defineField({ name: 'lastName', title: 'Last Name', type: 'string', readOnly: true }),
    defineField({ name: 'email', title: 'Email', type: 'string', readOnly: true }),
    defineField({ name: 'phone', title: 'Phone', type: 'string', readOnly: true }),
    defineField({
      name: 'lookingFor',
      title: 'Looking For',
      type: 'text',
      rows: 4,
      readOnly: true,
    }),
    defineField({ name: 'quantityNeeded', title: 'Quantity Needed', type: 'string', readOnly: true }),
    defineField({ name: 'dateNeeded', title: 'Date Needed', type: 'string', readOnly: true }),
    defineField({ name: 'sourceUrl', title: 'Source URL', type: 'string', readOnly: true }),
    defineField({ name: 'submittedAt', title: 'Submitted At', type: 'datetime', readOnly: true }),
  ],
  preview: {
    select: { firstName: 'firstName', lastName: 'lastName', email: 'email', sourceUrl: 'sourceUrl' },
    prepare({ firstName, lastName, email, sourceUrl }) {
      const name = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
      return {
        title: name,
        subtitle: email,
        description: sourceUrl,
      };
    },
  },
});
