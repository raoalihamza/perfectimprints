import { defineField, defineType } from 'sanity';

/**
 * A customer's action on a quote (Q-110). Everything the customer does is a
 * NEW append-only record, never an edit to the quote itself - the single most
 * important structural decision in the Quick Quote module. A Sanity publish
 * replaces the published document WHOLESALE, so if a customer's acceptance
 * were stored on the quote, Patrick's next publish (from a draft opened
 * before the acceptance) would silently erase it. Separate records (this
 * type) physically cannot be touched by his draft/publish cycle. This is the
 * proven `leadSubmission` pattern: schema-level readOnly at the document AND
 * on every field.
 *
 * One type covers all three events via `kind`:
 *   - viewed             - the customer opened the quote page
 *   - accepted           - the customer accepted the quote
 *   - revisionRequested  - the customer asked for changes
 *
 * These are written by ONE place: app/api/quote-response/route.ts (Q-150),
 * which creates a record and then revalidates the affected quote's cache tag
 * itself, in the same request. That is exactly why this type is DELIBERATELY
 * NOT in the Sanity webhook Filter - a delivery would be a redundant round trip
 * plus one more manual Filter step that can be forgotten (see the note in
 * app/api/sanity/revalidate/route.ts).
 *
 * The quote reference is WEAK on purpose: a strong reference would block
 * deleting a quote while responses exist. Weak means Patrick can delete a
 * quote cleanly; the response keeps the quote number for its paper trail.
 */
export default defineType({
  name: 'quoteResponse',
  title: 'Quote Response',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'quote',
      title: 'Quote',
      type: 'reference',
      to: [{ type: 'quote' }],
      weak: true,
      readOnly: true,
    }),
    defineField({
      name: 'quoteNumber',
      title: 'Quote number',
      type: 'string',
      readOnly: true,
      description: 'Kept here as well, so the record stays meaningful even if the quote is deleted.',
    }),
    defineField({
      name: 'kind',
      title: 'What happened',
      type: 'string',
      readOnly: true,
      options: {
        list: [
          { title: 'Link opened', value: 'viewed' },
          { title: 'Accepted', value: 'accepted' },
          { title: 'Revision requested', value: 'revisionRequested' },
        ],
      },
    }),
    defineField({
      name: 'createdAt',
      title: 'When',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'comment',
      title: 'Customer comment',
      type: 'text',
      rows: 4,
      readOnly: true,
    }),
    defineField({
      name: 'files',
      title: 'Uploaded files',
      type: 'array',
      of: [{ type: 'file' }],
      readOnly: true,
      description: 'Artwork the customer attached when accepting.',
    }),
    defineField({
      name: 'context',
      title: 'Context',
      type: 'string',
      readOnly: true,
      description:
        'Coarse troubleshooting context only (e.g. which page recorded it). No precise personal or device data is stored.',
    }),
  ],
  orderings: [
    {
      title: 'Newest first',
      name: 'createdAtDesc',
      by: [{ field: 'createdAt', direction: 'desc' }],
    },
  ],
  preview: {
    select: { kind: 'kind', quoteNumber: 'quoteNumber', createdAt: 'createdAt' },
    prepare({ kind, quoteNumber, createdAt }) {
      const labels: Record<string, string> = {
        viewed: 'Link opened',
        accepted: 'Accepted',
        revisionRequested: 'Revision requested',
      };
      return {
        title: `${labels[kind ?? ''] ?? 'Response'}${quoteNumber ? ` - ${quoteNumber}` : ''}`,
        subtitle: createdAt ? new Date(createdAt).toLocaleString('en-US') : undefined,
      };
    },
  },
});
