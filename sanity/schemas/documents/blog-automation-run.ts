import { defineField, defineType } from 'sanity';

/**
 * One scheduled blog run (AUTO-208): what the blog engine did in one of its
 * two nightly slots, written by the server and READ ONLY in the Studio, the
 * leadSubmission precedent. One document per slot per UTC day, named
 * `blogAutomationRun.<day>.<slot>`; the claim on that fixed id is what keeps
 * two firings from writing two posts into one slot (lib/blog-automation/
 * run-log.ts). The morning email says the same things; this is the record.
 */
export default defineType({
  name: 'blogAutomationRun',
  title: 'Blog Automation Run',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({ name: 'day', title: 'Day (UTC)', type: 'string', readOnly: true }),
    defineField({ name: 'slot', title: 'Slot', type: 'string', readOnly: true, description: 'a = about 10 pm Florida time, b = about 4 am.' }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      readOnly: true,
      description: 'written = a draft was saved; published = it went live; failed = nothing was saved (the error below says why); claimed / running = in progress.',
    }),
    defineField({ name: 'stage', title: 'Stage', type: 'string', readOnly: true }),
    defineField({ name: 'attempts', title: 'Attempts', type: 'number', readOnly: true, description: '1, or more when a later firing took the slot over from a stuck or failed run.' }),
    defineField({ name: 'claimedAt', title: 'Claimed', type: 'datetime', readOnly: true }),
    defineField({ name: 'updatedAt', title: 'Last touched', type: 'datetime', readOnly: true }),
    defineField({ name: 'finishedAt', title: 'Finished', type: 'datetime', readOnly: true }),
    defineField({ name: 'takenOverFrom', title: 'Taken over from', type: 'string', readOnly: true }),
    defineField({
      name: 'switches',
      title: 'Switches as read',
      type: 'object',
      readOnly: true,
      fields: [
        { name: 'paused', title: 'Paused', type: 'boolean', readOnly: true },
        { name: 'publishMode', title: 'Publish mode', type: 'string', readOnly: true },
      ],
    }),
    defineField({
      name: 'topic',
      title: 'Topic',
      type: 'object',
      readOnly: true,
      fields: [
        { name: 'query', title: 'Search term', type: 'string', readOnly: true },
        { name: 'key', title: 'Topic key', type: 'string', readOnly: true },
        { name: 'page', title: 'Page ranking now', type: 'string', readOnly: true },
        { name: 'queuePosition', title: 'Position in the usable list', type: 'number', readOnly: true },
      ],
    }),
    defineField({ name: 'titleShape', title: 'Title shape', type: 'string', readOnly: true }),
    defineField({ name: 'template', title: 'Body template', type: 'string', readOnly: true }),
    defineField({ name: 'documentId', title: 'Post document id', type: 'string', readOnly: true }),
    defineField({ name: 'draftId', title: 'Draft id', type: 'string', readOnly: true }),
    defineField({ name: 'publishedId', title: 'Published id', type: 'string', readOnly: true }),
    defineField({ name: 'title', title: 'Title', type: 'string', readOnly: true }),
    defineField({ name: 'slug', title: 'Slug', type: 'string', readOnly: true }),
    defineField({ name: 'words', title: 'Words', type: 'number', readOnly: true }),
    defineField({
      name: 'strips',
      title: 'Product rows',
      type: 'object',
      readOnly: true,
      fields: [
        { name: 'rows', title: 'Rows', type: 'number', readOnly: true },
        { name: 'products', title: 'Products', type: 'number', readOnly: true },
      ],
    }),
    defineField({ name: 'placedLinks', title: 'Internal links placed', type: 'number', readOnly: true }),
    defineField({ name: 'pictureSource', title: 'Header picture', type: 'string', readOnly: true, description: 'ai, library, product or none.' }),
    defineField({ name: 'pictureNote', title: 'Picture note', type: 'text', rows: 3, readOnly: true }),
    defineField({
      name: 'choice',
      title: 'How the topic was chosen',
      type: 'object',
      readOnly: true,
      fields: [
        { name: 'recentKeys', title: 'Products of the recent posts', type: 'array', of: [{ type: 'string' }], readOnly: true },
        { name: 'recentShape', title: 'Shape of the last post', type: 'string', readOnly: true },
        { name: 'candidates', title: 'Candidates looked at', type: 'array', of: [{ type: 'string' }], readOnly: true },
        { name: 'shape', title: 'Shape chosen', type: 'string', readOnly: true },
      ],
    }),
    defineField({
      name: 'timings',
      title: 'Timings (ms)',
      type: 'object',
      readOnly: true,
      fields: [
        { name: 'chooseMs', title: 'Choosing the topic', type: 'number', readOnly: true },
        { name: 'generateMs', title: 'Writing the post and its picture', type: 'number', readOnly: true },
        { name: 'publishMs', title: 'Publishing', type: 'number', readOnly: true },
        { name: 'totalMs', title: 'Total', type: 'number', readOnly: true },
      ],
    }),
    defineField({
      name: 'cost',
      title: 'Cost (USD, estimated)',
      type: 'object',
      readOnly: true,
      fields: [
        { name: 'deepseekCalls', title: 'DeepSeek calls', type: 'number', readOnly: true },
        { name: 'deepseekUsd', title: 'DeepSeek', type: 'number', readOnly: true },
        { name: 'imageUsd', title: 'Picture', type: 'number', readOnly: true },
        { name: 'totalUsd', title: 'Total', type: 'number', readOnly: true },
        { name: 'basis', title: 'How it was worked out', type: 'string', readOnly: true },
      ],
    }),
    defineField({
      name: 'error',
      title: 'Error',
      type: 'object',
      readOnly: true,
      fields: [
        { name: 'stage', title: 'Stage', type: 'string', readOnly: true },
        { name: 'message', title: 'What happened', type: 'text', rows: 3, readOnly: true },
      ],
    }),
    defineField({ name: 'notes', title: 'Notes', type: 'array', of: [{ type: 'string' }], readOnly: true }),
  ],
  preview: {
    select: { day: 'day', slot: 'slot', status: 'status', title: 'title', stage: 'stage' },
    prepare: ({ day, slot, status, title, stage }) => ({
      title: `${day ?? '?'} slot ${slot ?? '?'}: ${status ?? '?'}`,
      subtitle: title || (status === 'failed' ? `failed at ${stage ?? '?'}` : ''),
    }),
  },
  orderings: [{ title: 'Newest first', name: 'newest', by: [{ field: 'claimedAt', direction: 'desc' }] }],
});
