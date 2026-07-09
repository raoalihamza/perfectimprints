/**
 * Deterministic auto-placement of internal links into an AI-generated blog
 * body (P2-AI-002b — Patrick confirmed links should be inserted, not just
 * suggested). Operates on the structured BlogBodyInput BEFORE Portable Text
 * assembly: it upgrades matched plain-text runs inside NORMAL PARAGRAPHS into
 * rich spans carrying a `link` annotation, which buildBlogBody then emits as
 * schema-exact markDefs + span marks. Headings, list items, and product strips
 * are never touched.
 *
 * Placement rules:
 *   - For each target, anchor candidates come from its label (longest
 *     contiguous word n-grams first) plus the significant keywords in its
 *     `reason`; a candidate must contain at least one significant token
 *     (generic promo words don't qualify as anchors on their own).
 *   - The FIRST clean occurrence wins (case-insensitive, word-boundary,
 *     original casing preserved). One link per target, one per href, never the
 *     same phrase twice, no overlapping/nested links.
 *   - Spread: paragraphs that already carry a link are only used when no
 *     link-free paragraph matches.
 *   - No clean anchor → the target is SKIPPED (an awkward forced link is worse
 *     than no link). Total placements capped by `maxLinks`.
 *
 * Link shape (P2-AI-003): the span-level link object is parametrized because
 * the two consuming schemas differ — the blog body link annotation carries
 * `openInNewTab`, the `richAnswer` link annotation (video descriptions, FAQ
 * answers) has ONLY `href`. Pass `{ linkShape: 'richAnswer' }` when the placed
 * body will be built by buildRichAnswerBody; default 'blog' keeps the original
 * `{ href, openInNewTab: false }` shape for buildBlogBody.
 *
 * Pure module: no fs, no Sanity (the InternalLinkSuggestion import is
 * type-only, erased at runtime) — unit-tested by the offline verifier.
 */

import type {
  BlogBodyInput,
  BlogInlineSpan,
  BlogRichText,
} from '../portable-text/build-blog-body';
import type { InternalLinkSuggestion } from './internal-links';
import { GENERIC_PROMO_WORDS } from './brand-voice';

const NON_ANCHOR_WORDS = new Set<string>([
  ...GENERIC_PROMO_WORDS,
  'the',
  'and',
  'for',
  'with',
  'your',
  'our',
  'from',
  'that',
  'this',
  'are',
  'can',
  'will',
  'how',
  'why',
  'what',
  'best',
  'top',
  'ideas',
  'idea',
  'guide',
  'perfect',
  'imprints',
]);

const MAX_NGRAM_WORDS = 6;

function isSignificantWord(word: string): boolean {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  return w.length >= 4 && !NON_ANCHOR_WORDS.has(w);
}

/**
 * Ordered anchor-phrase candidates for a target: label n-grams (longest
 * first, left to right), then single significant words from label + reason
 * keywords. Every candidate contains at least one significant token.
 */
function anchorCandidates(target: InternalLinkSuggestion): string[] {
  const label = target.label.split('|')[0].trim();
  const words = label.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (phrase: string) => {
    const key = phrase.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(phrase);
  };

  for (let n = Math.min(MAX_NGRAM_WORDS, words.length); n >= 2; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n);
      if (gram.some(isSignificantWord)) add(gram.join(' '));
    }
  }
  // Single-word fallbacks: significant words from the label, then from the
  // "… keywords: a, b" suffix of the engine's reason string.
  for (const w of words) if (isSignificantWord(w)) add(w.replace(/[^\w\s'&-]/g, ''));
  const kwSuffix = target.reason.split(/keywords?:\s*/i)[1];
  if (kwSuffix) {
    for (const w of kwSuffix.split(/[,\s]+/)) if (isSignificantWord(w)) add(w);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseRegex(phrase: string): RegExp {
  // Word-boundary on both sides; whitespace in the phrase matches any run.
  const body = escapeRegExp(phrase).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^\\w])(${body})(?![\\w])`, 'i');
}

function toSpans(paragraph: BlogRichText): BlogInlineSpan[] {
  return typeof paragraph === 'string' ? [{ text: paragraph }] : paragraph;
}

function paragraphHasLink(paragraph: BlogRichText): boolean {
  return typeof paragraph !== 'string' && paragraph.some((s) => !!s.link);
}

/**
 * The link object put on a placed span. 'blog' → `{ href, openInNewTab:false }`
 * (what buildBlogBody's markDef expects); 'richAnswer' → `{ href }` ONLY (that
 * annotation has no other field — Studio would strip/flag extras); 'page' →
 * `{ href, openInNewTab:true }` — the page-builder `portableBody` link
 * annotation carries an "Open in new tab" toggle (P2-CP follow-up), and Patrick
 * wants AI-placed links to default to a new tab (he can toggle any off in the
 * link popover before publishing). Consumed by buildPageBody (P2-AI-004).
 */
export type PlacedLinkShape = 'blog' | 'richAnswer' | 'page';

export interface PlaceInternalLinksOptions {
  /** Default 'blog'. */
  linkShape?: PlacedLinkShape;
}

/**
 * Try to wrap the first occurrence of `re` (searching only link-free spans)
 * in a link to `href`. Returns the new spans array, or null when no match.
 */
function linkFirstMatch(
  paragraph: BlogRichText,
  re: RegExp,
  href: string,
  linkShape: PlacedLinkShape,
): BlogInlineSpan[] | null {
  const spans = toSpans(paragraph);
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span.link) continue;
    const m = re.exec(span.text);
    if (!m) continue;
    const start = m.index + m[1].length;
    const matched = m[2];
    const before = span.text.slice(0, start);
    const after = span.text.slice(start + matched.length);
    const link =
      linkShape === 'blog'
        ? { href, openInNewTab: false }
        : linkShape === 'page'
          ? { href, openInNewTab: true }
          : { href };
    const replacement: BlogInlineSpan[] = [];
    if (before) replacement.push({ ...span, text: before });
    replacement.push({ ...span, text: matched, link });
    if (after) replacement.push({ ...span, text: after });
    return [...spans.slice(0, i), ...replacement, ...spans.slice(i + 1)];
  }
  return null;
}

export interface PlaceInternalLinksResult {
  body: BlogBodyInput;
  /** hrefs actually placed, in placement order. */
  placedHrefs: string[];
}

export function placeInternalLinks(
  input: BlogBodyInput,
  targets: InternalLinkSuggestion[],
  maxLinks = 5,
  opts: PlaceInternalLinksOptions = {},
): PlaceInternalLinksResult {
  const linkShape = opts.linkShape ?? 'blog';
  // Shallow-clone the structure so paragraph arrays can be swapped in place.
  const body: BlogBodyInput = {
    intro: [...(input.intro ?? [])],
    sections: input.sections.map((s) => ({
      ...s,
      paragraphs: s.paragraphs ? [...s.paragraphs] : s.paragraphs,
    })),
  };

  // Normal paragraphs only, in reading order — headings/lists/strips excluded.
  interface ParagraphRef {
    get(): BlogRichText;
    set(v: BlogRichText): void;
  }
  const refs: ParagraphRef[] = [];
  (body.intro ?? []).forEach((_, i) =>
    refs.push({ get: () => body.intro![i], set: (v) => (body.intro![i] = v) }),
  );
  body.sections.forEach((section) => {
    (section.paragraphs ?? []).forEach((_, i) =>
      refs.push({
        get: () => section.paragraphs![i],
        set: (v) => (section.paragraphs![i] = v),
      }),
    );
  });

  const placedHrefs: string[] = [];
  const usedPhrases = new Set<string>();

  for (const target of targets) {
    if (placedHrefs.length >= maxLinks) break;
    if (!target.href || placedHrefs.includes(target.href)) continue;

    const candidates = anchorCandidates(target).filter((c) => !usedPhrases.has(c.toLowerCase()));
    let placed = false;
    // Pass 1: paragraphs without links (spread); pass 2: allow sharing a
    // paragraph only when nothing else matched.
    for (const allowLinked of [false, true]) {
      if (placed) break;
      for (const phrase of candidates) {
        if (placed) break;
        const re = phraseRegex(phrase);
        for (const ref of refs) {
          const paragraph = ref.get();
          // Pass 1 (allowLinked=false): link-free paragraphs only (spread).
          // Pass 2 (allowLinked=true): revisit only already-linked paragraphs.
          if (paragraphHasLink(paragraph) !== allowLinked) continue;
          const next = linkFirstMatch(paragraph, re, target.href, linkShape);
          if (next) {
            ref.set(next);
            placedHrefs.push(target.href);
            usedPhrases.add(phrase.toLowerCase());
            placed = true;
            break;
          }
        }
      }
    }
    // No clean anchor → skip this target (never force an awkward link).
  }

  return { body, placedHrefs };
}
