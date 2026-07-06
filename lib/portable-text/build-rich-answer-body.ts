/**
 * richAnswer-body builder (P2-AI-003). Turns AI-generated description
 * paragraphs into Portable Text that matches the `richAnswer` schema
 * (sanity/schemas/objects/rich-answer.ts) EXACTLY — which is far stricter than
 * `blogPost.body`:
 *   - ONLY `{_type:'block', style:'normal'}` blocks — no h2/h3, no lists
 *     (never emits `listItem`/`level`), no images, no `blogProducts` strips.
 *     Studio silently drops schema-illegal blocks, so emitting any of those
 *     would lose content without an error.
 *   - `strong`/`em` decorators and the `link` annotation only, and the link
 *     markDef is `{_type:'link', _key, href}` with NO `openInNewTab` — that
 *     field does not exist on the richAnswer link (unlike the blog body link),
 *     and Studio would strip/flag it.
 *
 * Input paragraphs use the same `BlogRichText` span shape as the blog builder
 * so `placeInternalLinks` (in richAnswer link-shape mode) can run on them
 * first. Any `openInNewTab` that sneaks onto a span link is deliberately
 * dropped here — belt and suspenders on top of the placement parametrization.
 *
 * Pure module: no React, no `sanity`, no `server-only`, no node:fs — safe in
 * API routes, build scripts, and the offline verifier alike. Key generation
 * mirrors build-blog-body.ts.
 */

import type { BlogInlineSpan, BlogRichText } from './build-blog-body';

interface RichAnswerSpanChild {
  _type: 'span';
  _key: string;
  text: string;
  marks: string[];
}

/** richAnswer link markDef — href only, NEVER `openInNewTab`. */
interface RichAnswerLinkMarkDef {
  _type: 'link';
  _key: string;
  href: string;
}

export interface RichAnswerBlock {
  _type: 'block';
  _key: string;
  style: 'normal';
  markDefs: RichAnswerLinkMarkDef[];
  children: RichAnswerSpanChild[];
}

let keyCounter = 0;
function nextKey(prefix: string): string {
  keyCounter += 1;
  // Uniqueness across a single build run is all PT keys require.
  return `${prefix}-${keyCounter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function buildRichAnswerBody(paragraphs: BlogRichText[]): RichAnswerBlock[] {
  const out: RichAnswerBlock[] = [];
  for (const paragraph of paragraphs) {
    const spans = typeof paragraph === 'string' ? [{ text: paragraph }] : paragraph;
    const children: RichAnswerSpanChild[] = [];
    const markDefs: RichAnswerLinkMarkDef[] = [];
    for (const span of spans) {
      const rich = span as BlogInlineSpan;
      const text = rich.text ?? '';
      if (!text.trim()) continue;
      const marks: string[] = [];
      if (rich.strong) marks.push('strong');
      if (rich.link?.href) {
        // href only — the richAnswer link annotation has no other field.
        const def: RichAnswerLinkMarkDef = {
          _type: 'link',
          _key: nextKey('rl'),
          href: rich.link.href,
        };
        markDefs.push(def);
        marks.push(def._key);
      }
      children.push({ _type: 'span', _key: nextKey('rs'), text, marks });
    }
    if (children.length === 0) continue; // blank paragraph → dropped
    out.push({
      _type: 'block',
      _key: nextKey('rb'),
      style: 'normal',
      markDefs,
      children,
    });
  }
  return out;
}
