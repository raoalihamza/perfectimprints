import { defineArrayMember, defineType } from 'sanity';
import { rawHtmlValidationMessage } from './raw-html';

/**
 * Minimal rich-text field for short answers/descriptions (Task B). Reused by the
 * `faq` answer, `customCategory.faqs[].a`, and `video.description`. Supports
 * normal paragraphs, bold/italic, and the standard link annotation only — no
 * images, headings, lists, or product blocks (these are short answers).
 *
 * The renderer (components/portable-text/RichAnswer.tsx) handles internal vs.
 * external/#hash links and Geiger affiliate rewriting; the schema only needs to
 * capture the href.
 */
export default defineType({
  name: 'richAnswer',
  title: 'Answer',
  type: 'array',
  // FIX-840: typed HTML (`<a href="...">here</a>`) in a paragraph is shown to
  // visitors exactly as typed, because the renderer escapes text and must keep
  // doing so. Warn at the source and point at the link button. A WARNING, not an
  // error, so nothing already published is blocked from being republished; the
  // yellow flag still appears on the field and in the publish dialog.
  validation: (Rule) => Rule.custom((value) => rawHtmlValidationMessage(value) ?? true).warning(),
  of: [
    defineArrayMember({
      type: 'block',
      // Plain paragraphs only — no h2/h3/blockquote for a short answer.
      styles: [{ title: 'Normal', value: 'normal' }],
      lists: [],
      marks: {
        decorators: [
          { title: 'Bold', value: 'strong' },
          { title: 'Italic', value: 'em' },
        ],
        annotations: [
          {
            name: 'link',
            type: 'object',
            title: 'Link',
            fields: [
              {
                name: 'href',
                type: 'string',
                title: 'URL or path',
                description:
                  'Internal path (e.g. /cat/water-bottles or #section), an absolute URL, or a Geiger product link (auto-rewritten to the affiliate host).',
                validation: (Rule) => Rule.required(),
              },
            ],
          },
        ],
      },
    }),
  ],
});

/**
 * Plain-text snippet from a `richAnswer` value, for Studio previews. Duplicated
 * here (instead of importing lib/portable-text/to-plain) because the standalone
 * Studio bundler can't import from the Next app's lib/. Keep the two in sync.
 */
export function richAnswerToPlain(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';
  const out: string[] = [];
  for (const block of value) {
    const b = block as { _type?: string; children?: { text?: string }[] };
    if (b?._type !== 'block' || !Array.isArray(b.children)) continue;
    const text = b.children
      .map((c) => (typeof c?.text === 'string' ? c.text : ''))
      .join('')
      .trim();
    if (text) out.push(text);
  }
  return out.join(' ').trim();
}
