/**
 * Structured blog-body builder (P2-AI-001/002). `htmlToBlocks` (sibling module)
 * only handles mark-less `<p>`/`<h3>` — blog bodies need h2 headings, bullet +
 * numbered lists, optional strong/link marks, and inline `blogProducts` strips,
 * so the AI blog engine describes the body as structured input and this module
 * emits valid Portable Text matching the `blogPost.body` schema exactly:
 *   - `block` with styles normal/h2/h3
 *   - bullet/number `listItem` blocks with `level: 1` (what
 *     BlogBody.normalizeBody expects)
 *   - `blogProducts` objects `{ heading?, products: [{ _type:'blogProduct', sku }] }`
 *   - optional `strong` decorator and `link` annotation (markDefs
 *     `{ _type:'link', href, openInNewTab }`) — supported so auto-inserted
 *     internal links can be turned on later, NOT emitted by the default
 *     generate flow (links are suggested for confirmation instead).
 *
 * The builder deliberately emits NO `image` / `embed` blocks: the AI cannot
 * source a real image file or video URL, so those stay manual inserts for
 * Patrick (the body schema + BlogBody renderer fully support both).
 *
 * Pure module: no React, no `sanity`, no `server-only`, no node:fs — safe in
 * API routes, build scripts, and the offline verifier alike. Key generation
 * mirrors html-to-blocks.ts.
 */

export interface BlogBodyLink {
  href: string;
  openInNewTab?: boolean;
}

/** A run of inline text, optionally bold and/or wrapped in a link annotation. */
export interface BlogInlineSpan {
  text: string;
  strong?: boolean;
  link?: BlogBodyLink;
}

/** Paragraph / list-item content: a plain string or rich inline spans. */
export type BlogRichText = string | BlogInlineSpan[];

export interface BlogProductStripInput {
  heading?: string;
  skus: string[];
}

export interface BlogBodySectionInput {
  heading?: string;
  headingLevel?: 'h2' | 'h3';
  paragraphs?: BlogRichText[];
  list?: { kind: 'bullet' | 'number'; items: BlogRichText[] };
  /** Rendered after the section's text — a row of SKU-backed product cards. */
  products?: BlogProductStripInput;
}

export interface BlogBodyInput {
  /** Opening paragraphs before the first section heading. */
  intro?: BlogRichText[];
  sections: BlogBodySectionInput[];
}

// --- Output block shapes (structurally what @portabletext/react consumes) ----

interface SpanChild {
  _type: 'span';
  _key: string;
  text: string;
  marks: string[];
}

interface LinkMarkDef {
  _type: 'link';
  _key: string;
  href: string;
  openInNewTab: boolean;
}

export interface BlogTextBlock {
  _type: 'block';
  _key: string;
  style: 'normal' | 'h2' | 'h3';
  listItem?: 'bullet' | 'number';
  level?: number;
  markDefs: LinkMarkDef[];
  children: SpanChild[];
}

export interface BlogProductsBlock {
  _type: 'blogProducts';
  _key: string;
  heading?: string;
  products: { _type: 'blogProduct'; _key: string; sku: string }[];
}

export type BlogBodyBlock = BlogTextBlock | BlogProductsBlock;

let keyCounter = 0;
function nextKey(prefix: string): string {
  keyCounter += 1;
  // Uniqueness across a single build run is all PT keys require.
  return `${prefix}-${keyCounter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function toSpans(content: BlogRichText): { children: SpanChild[]; markDefs: LinkMarkDef[] } {
  const children: SpanChild[] = [];
  const markDefs: LinkMarkDef[] = [];
  const spans = typeof content === 'string' ? [{ text: content }] : content;
  for (const span of spans) {
    const text = (span as BlogInlineSpan).text ?? '';
    if (!text.trim()) continue;
    const marks: string[] = [];
    const rich = span as BlogInlineSpan;
    if (rich.strong) marks.push('strong');
    if (rich.link?.href) {
      const def: LinkMarkDef = {
        _type: 'link',
        _key: nextKey('l'),
        href: rich.link.href,
        openInNewTab: !!rich.link.openInNewTab,
      };
      markDefs.push(def);
      marks.push(def._key);
    }
    children.push({ _type: 'span', _key: nextKey('s'), text, marks });
  }
  return { children, markDefs };
}

function textBlock(
  content: BlogRichText,
  style: 'normal' | 'h2' | 'h3',
  listItem?: 'bullet' | 'number',
): BlogTextBlock | null {
  const { children, markDefs } = toSpans(content);
  if (children.length === 0) return null;
  const block: BlogTextBlock = {
    _type: 'block',
    _key: nextKey('b'),
    style,
    markDefs,
    children,
  };
  if (listItem) {
    block.listItem = listItem;
    block.level = 1;
  }
  return block;
}

function productsBlock(strip: BlogProductStripInput): BlogProductsBlock | null {
  const products = strip.skus
    .map((s) => s.trim())
    .filter(Boolean)
    .map((sku) => ({ _type: 'blogProduct' as const, _key: nextKey('p'), sku }));
  if (products.length === 0) return null;
  const block: BlogProductsBlock = {
    _type: 'blogProducts',
    _key: nextKey('bp'),
    products,
  };
  if (strip.heading?.trim()) block.heading = strip.heading.trim();
  return block;
}

export function buildBlogBody(input: BlogBodyInput): BlogBodyBlock[] {
  const out: BlogBodyBlock[] = [];
  const pushText = (b: BlogTextBlock | null) => {
    if (b) out.push(b);
  };

  for (const p of input.intro ?? []) pushText(textBlock(p, 'normal'));

  for (const section of input.sections) {
    if (section.heading?.trim()) {
      pushText(textBlock(section.heading.trim(), section.headingLevel ?? 'h2'));
    }
    for (const p of section.paragraphs ?? []) pushText(textBlock(p, 'normal'));
    if (section.list) {
      for (const item of section.list.items) {
        pushText(textBlock(item, 'normal', section.list.kind));
      }
    }
    if (section.products) {
      const b = productsBlock(section.products);
      if (b) out.push(b);
    }
  }

  return out;
}
