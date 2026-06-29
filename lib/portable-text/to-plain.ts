/**
 * Plain-text extractor for Portable Text (Task B — rich-text FAQ answers + video
 * descriptions). Concatenates the span text across blocks, paragraphs joined by
 * a single space, so the result is safe to drop straight into JSON-LD
 * (`acceptedAnswer.text`, `VideoObject.description`), `<meta>` descriptions, and
 * OG/Twitter tags — all of which must stay PLAIN strings even though the field
 * now renders as rich text with links.
 *
 * Pure module: no React, no `sanity`, no `server-only` — safe in the app, in
 * build scripts, and in the migration alike. Tolerates a legacy plain string so
 * it never throws on un-migrated data.
 */

interface PtSpan {
  text?: string;
}
interface PtBlock {
  _type?: string;
  children?: PtSpan[];
}

export function portableTextToPlain(value: unknown): string {
  if (!value) return '';
  // Tolerate legacy plain strings (pre-migration data) so callers never crash.
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';

  const paragraphs: string[] = [];
  for (const block of value) {
    if (!block || typeof block !== 'object') continue;
    const b = block as PtBlock;
    if (b._type !== 'block' || !Array.isArray(b.children)) continue;
    const text = b.children
      .map((c) => (typeof c?.text === 'string' ? c.text : ''))
      .join('')
      .trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs.join(' ').trim();
}
