/**
 * Raw-HTML detector for rich-text fields (FIX-840, 2026-08-25).
 *
 * A visitor on /videos/premium-branded-gifts-for-national-doctors-day read
 * `<a href="/blog/national-doctors-day-gifts">here</a>` as plain text. The site
 * was right to print it that way: the span had been typed as HTML into what was
 * then a plain-text field, the rich-text migration wrapped the string verbatim,
 * and the renderer escapes text (it must, or a Sanity value could inject markup
 * into the page). The fix is at the source: warn the editor in Studio the moment
 * a paragraph contains something shaped like an HTML tag, and point them at the
 * link button.
 *
 * Dependency-free on purpose (the standalone Studio bundler cannot import the
 * Next app's lib/), so it can be imported by any schema AND unit-tested.
 */

/**
 * Matches an opening, closing or self-closing tag with a letter-led name:
 * `<a href="...">`, `</a>`, `<br/>`, `<strong>`. Does NOT match `<3`, `< 5`,
 * `a<b`, `<-` or `<` followed by a digit/space, so ordinary prose comparisons
 * are never flagged.
 */
const HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]*)?\/?>/;

/** True when the text contains something shaped like an HTML tag. */
export function containsHtmlTag(text: string): boolean {
  return HTML_TAG.test(text);
}

/**
 * Scans a Portable Text array (or a legacy plain string) and returns the first
 * tag found, or null when the content is clean. Only span TEXT is inspected;
 * markDefs (where a real link's href lives) are deliberately not scanned, so a
 * proper link to a URL containing angle brackets can never trip this.
 */
export function findRawHtmlTag(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.match(HTML_TAG)?.[0] ?? null;
  if (!Array.isArray(value)) return null;
  for (const block of value) {
    const b = block as { _type?: string; children?: { _type?: string; text?: unknown }[] };
    if (b?._type !== 'block' || !Array.isArray(b.children)) continue;
    for (const child of b.children) {
      if (typeof child?.text !== 'string') continue;
      const m = child.text.match(HTML_TAG);
      if (m) return m[0];
    }
  }
  return null;
}

/**
 * The Studio message. Names the offending tag so the editor can find it, and
 * says what to do instead. Returns null when the content is clean, which is
 * what Sanity's `Rule.custom` treats as "valid".
 */
export function rawHtmlValidationMessage(value: unknown): string | null {
  const tag = findRawHtmlTag(value);
  if (!tag) return null;
  const shown = tag.length > 40 ? `${tag.slice(0, 40)}...` : tag;
  return (
    `This text contains HTML (${shown}), which will show to visitors exactly as typed, not as a link or formatting. ` +
    'Delete the tags. To add a link, select the words and use the link button in the toolbar.'
  );
}
