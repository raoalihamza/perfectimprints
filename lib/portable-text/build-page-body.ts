/**
 * Page-builder richText body builder (P2-AI-004). Turns AI-generated section
 * content into Portable Text matching the page-builder `portableBody()` field
 * (sanity/schemas/objects/page-sections.ts) — the DEFAULT Sanity block editor:
 *   - `block` blocks with styles normal/h2/h3 and bullet/number `listItem`
 *     blocks with `level: 1` (all default-editor-legal)
 *   - `strong`/`em` decorators and the page-builder `link` annotation, whose
 *     markDef is `{_type:'link', _key, href, openInNewTab?}` — the annotation
 *     carries an optional "Open in new tab" toggle (P2-CP follow-up; declared
 *     explicitly in page-sections.ts portableBody). The flag is emitted only
 *     when the span link carries it; plain `{href}` links stay `{href}`.
 *   - NO `blogProducts` strips (pages use the separate `productStrip` section)
 *     and NO image blocks (the AI cannot source a real image file — inline
 *     images stay manual inserts for Patrick).
 *
 * Input paragraphs use the same `BlogRichText` span shape as the blog builder
 * so `placeInternalLinks` (in 'page' link-shape mode) can run on them first.
 *
 * Pure module: no React, no `sanity`, no `server-only`, no node:fs — safe in
 * API routes, build scripts, and the offline verifier alike. Key generation
 * mirrors build-blog-body.ts.
 */

import type { BlogInlineSpan, BlogRichText } from './build-blog-body';

interface PageSpanChild {
  _type: 'span';
  _key: string;
  text: string;
  marks: string[];
}

/** Page-builder link markDef — href + the optional "Open in new tab" flag. */
interface PageLinkMarkDef {
  _type: 'link';
  _key: string;
  href: string;
  openInNewTab?: boolean;
}

export interface PageTextBlock {
  _type: 'block';
  _key: string;
  style: 'normal' | 'h2' | 'h3';
  listItem?: 'bullet' | 'number';
  level?: number;
  markDefs: PageLinkMarkDef[];
  children: PageSpanChild[];
}

/** Structured input for one page richText body. */
export interface PageBodyInput {
  paragraphs?: BlogRichText[];
  list?: { kind: 'bullet' | 'number'; items: BlogRichText[] };
}

let keyCounter = 0;
function nextKey(prefix: string): string {
  keyCounter += 1;
  // Uniqueness across a single build run is all PT keys require.
  return `${prefix}-${keyCounter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function toBlock(
  content: BlogRichText,
  style: 'normal' | 'h2' | 'h3',
  listItem?: 'bullet' | 'number',
): PageTextBlock | null {
  const spans = typeof content === 'string' ? [{ text: content }] : content;
  const children: PageSpanChild[] = [];
  const markDefs: PageLinkMarkDef[] = [];
  for (const span of spans) {
    const rich = span as BlogInlineSpan;
    const text = rich.text ?? '';
    if (!text.trim()) continue;
    const marks: string[] = [];
    if (rich.strong) marks.push('strong');
    if (rich.link?.href) {
      const def: PageLinkMarkDef = { _type: 'link', _key: nextKey('pl'), href: rich.link.href };
      // The 'page' placement shape sets openInNewTab (AI links default it ON);
      // spans without the flag stay plain {href}.
      if (typeof rich.link.openInNewTab === 'boolean') def.openInNewTab = rich.link.openInNewTab;
      markDefs.push(def);
      marks.push(def._key);
    }
    children.push({ _type: 'span', _key: nextKey('ps'), text, marks });
  }
  if (children.length === 0) return null; // blank content → dropped
  const block: PageTextBlock = {
    _type: 'block',
    _key: nextKey('pb'),
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

/**
 * Builds ONE richText section's `body` array: paragraphs then an optional
 * list. The section HEADING is not emitted here — it goes in the richText
 * section's own `heading` field (rendered as an H2 by the RichText component).
 */
export function buildPageBody(input: PageBodyInput): PageTextBlock[] {
  const out: PageTextBlock[] = [];
  for (const p of input.paragraphs ?? []) {
    const b = toBlock(p, 'normal');
    if (b) out.push(b);
  }
  if (input.list) {
    for (const item of input.list.items) {
      const b = toBlock(item, 'normal', input.list.kind);
      if (b) out.push(b);
    }
  }
  return out;
}

/** One heading-led slice of a multi-section page body (P2-AI-005). */
export interface PageBodySectionInput extends PageBodyInput {
  heading?: string;
}

/**
 * Builds a SINGLE portable-text body containing multiple heading-led sections
 * (P2-AI-005 landing pages: `optionsIdeas` is one body field, so its section
 * headings live IN the body as h2 blocks — unlike the page builder, where each
 * richText section carries its heading in a separate field). Headings are
 * emitted as default-editor-legal `style:'h2'` blocks; blank headings/sections
 * are dropped. Same key generation + href-only link markDefs as buildPageBody.
 */
export function buildPageSectionsBody(sections: PageBodySectionInput[]): PageTextBlock[] {
  const out: PageTextBlock[] = [];
  for (const section of sections) {
    if (section.heading?.trim()) {
      const h = toBlock(section.heading.trim(), 'h2');
      if (h) out.push(h);
    }
    out.push(...buildPageBody(section));
  }
  return out;
}
