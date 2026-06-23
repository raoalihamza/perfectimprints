/**
 * Faithful (but simple) HTML → Portable Text conversion for the category
 * pipeline's stored copy (M5-504 push-to-Sanity). The baked category JSON and
 * the DeepSeek output use a tiny HTML subset — `<p>` paragraphs and optional
 * `<h3>` sub-headers — so a regex splitter is sufficient and avoids pulling in
 * @sanity/block-tools (which needs a Studio schema at runtime).
 *
 * Pure module: no React, no `sanity`, no `server-only` — safe in the Studio
 * action, the API route, and build scripts alike.
 */

export type PortableBlock = {
  _type: 'block';
  _key: string;
  style: 'normal' | 'h2' | 'h3';
  markDefs: never[];
  children: { _type: 'span'; _key: string; text: string; marks: never[] }[];
};

let keyCounter = 0;
function nextKey(prefix: string): string {
  keyCounter += 1;
  // Uniqueness across a single conversion run is all PT keys require.
  return `${prefix}-${keyCounter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function textBlock(text: string, style: 'normal' | 'h2' | 'h3' = 'normal'): PortableBlock {
  return {
    _type: 'block',
    _key: nextKey('b'),
    style,
    markDefs: [],
    children: [{ _type: 'span', _key: nextKey('s'), text, marks: [] }],
  };
}

/** Strip tags + collapse whitespace + decode the few entities we emit. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split a `<p>` / `<h3>` HTML string into Portable Text blocks. */
export function htmlToBlocks(html: string | null | undefined): PortableBlock[] {
  if (!html) return [];
  const blocks: PortableBlock[] = [];
  const re = /<(p|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const text = plainText(m[2]);
    if (!text) continue;
    blocks.push(textBlock(text, tag === 'h3' ? 'h3' : 'normal'));
  }
  // Fallback: no recognised block tags → treat the whole string as one paragraph.
  if (blocks.length === 0) {
    const text = plainText(html);
    if (text) blocks.push(textBlock(text, 'normal'));
  }
  return blocks;
}

/**
 * Build the `bodySections` blocks for a category: an optional H2 heading
 * (the buying-guide title) followed by the guide paragraphs.
 */
export function buildGuideBlocks(
  h2: string | null | undefined,
  guideHtml: string | null | undefined,
): PortableBlock[] {
  const out: PortableBlock[] = [];
  if (h2 && h2.trim()) out.push(textBlock(h2.trim(), 'h2'));
  out.push(...htmlToBlocks(guideHtml));
  return out;
}
