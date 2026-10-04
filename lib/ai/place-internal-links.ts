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
 * Two anchor policies (AUTO-201):
 *   - 'label' (the default, what every caller had): the rules above exactly
 *     as P2-AI-002b wrote them. Kept byte-for-byte for the video, page,
 *     landing, product and catalog generators, whose output was not
 *     re-measured in that ticket.
 *   - 'topic': what the blog generator uses, after a read of the links on all
 *     29 real AI posts and drafts (2026-10-05) showed the 'label' fallbacks
 *     producing anchors such as "[events]" on the koozies category page,
 *     "[business]" on a hats video, "[for every]", "[ornaments for]" and
 *     "[custom pepper spray.]" with the full stop inside the link. Under
 *     'topic' an anchor must contain one of the TOPIC WORDS the finder
 *     matched the target on (its `matchedTokens`, or the words after
 *     "keywords:" in its reason), generic promo words and near-generic
 *     words ("business", "events", "gifts") never count as topic words, a
 *     candidate phrase is trimmed of leading and trailing function words,
 *     numbers and punctuation, a one-word anchor is allowed only when that
 *     word is also in the target's own address (it is what the page is
 *     about), a word is matched in singular or plural, and a match is
 *     refused when the word just before or just after it is a topic word
 *     (so "[custom pepper]" is never cut out of "custom pepper spray"). A
 *     target with no topic word, or no clean anchor, is skipped: fewer links,
 *     never a forced one.
 *
 * Link shape (P2-AI-003): the span-level link object is parametrized because
 * the two consuming schemas differ — the blog body link annotation carries
 * `openInNewTab`, the `richAnswer` link annotation (video descriptions, FAQ
 * answers) has ONLY `href`. Pass `{ linkShape: 'richAnswer' }` when the placed
 * body will be built by buildRichAnswerBody; default 'blog' keeps the original
 * `{ href, openInNewTab: false }` shape for buildBlogBody.
 *
 * Pure module: no fs, no Sanity (the InternalLinkSuggestion import is
 * type-only, erased at runtime). Unit-tested by the offline verifier and,
 * for the 'topic' policy, by place-internal-links.test.ts.
 */

import type {
  BlogBodyInput,
  BlogInlineSpan,
  BlogRichText,
} from '../portable-text/build-blog-body';
import type { InternalLinkKind, InternalLinkSuggestion } from './internal-links';
import { GENERIC_PROMO_WORDS, MATCH_FILLER_WORDS, NEAR_GENERIC_WORDS } from './brand-voice';

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
 * Ordered anchor-phrase candidates for a target under the 'label' policy:
 * label n-grams (longest first, left to right), then single significant words
 * from label + reason keywords. Every candidate contains at least one
 * significant token.
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

// ── The 'topic' policy (AUTO-201) ─────────────────────────────────────────────

/**
 * Words that describe the occasion or the act of promoting rather than a
 * product, so a target matched only on one of them has no real anchor
 * ("[events]" on the koozies page, "[campaigns]" on a pepper spray video).
 * Deliberately short: a word here can never be a topic word on its own, so
 * every entry must be one that is generic across the whole catalog.
 */
export const ANCHOR_OCCASION_WORDS = [
  'event',
  'events',
  'campaign',
  'campaigns',
  'giveaway',
  'giveaways',
  'promotion',
  'promotions',
  'marketing',
  'brand',
  'brands',
  'branding',
] as const;

/** Words that cannot begin an anchor: function words and list or guide framing. */
const LEADING_EDGE_WORDS = new Set<string>([
  ...MATCH_FILLER_WORDS,
  'a',
  'an',
  'or',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'as',
  'is',
  'it',
  'its',
  'vs',
  'into',
  'over',
  'about',
  'every',
  'each',
  'all',
  'any',
  'use',
  'using',
  'uses',
  'used',
  'ways',
  'way',
  'tips',
  'you',
  'them',
  'they',
  'new',
  'great',
  'creative',
  'more',
  'most',
  'guide',
]);

/**
 * Words that cannot end an anchor: the leading set, the generic promo
 * modifiers ("ways to use custom"), and the near-generic and occasion words
 * ("custom koozies for events" is linked as "custom koozies"; "custom
 * ornaments for business" as "custom ornaments").
 */
const TRAILING_EDGE_WORDS = new Set<string>([
  ...LEADING_EDGE_WORDS,
  ...GENERIC_PROMO_WORDS,
  ...NEAR_GENERIC_WORDS,
  ...ANCHOR_OCCASION_WORDS,
]);

/** Words that are never topic words: generic promo, filler, near-generic, occasion. */
const NON_TOPIC_WORDS = new Set<string>([
  ...GENERIC_PROMO_WORDS,
  ...MATCH_FILLER_WORDS,
  ...NEAR_GENERIC_WORDS,
  ...ANCHOR_OCCASION_WORDS,
]);

/** Lower-case letters and digits only; the comparison form of a word. */
function bare(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Plural folded: "koozies" and "koozie" compare equal, as do "boxes" and
 * "box", "sunglasses" and "sunglass", "bottles" and "bottle". The "es"
 * ending is stripped only after a sibilant (box, buzz, church, dish, glass);
 * elsewhere only the "s" goes, so "bottles" folds to "bottle" and not to
 * "bottl", which is what let "[custom water]" through beside "bottle" on the
 * AUTO-201 proof run.
 */
export function stem(word: string): string {
  const w = bare(word);
  if (w.length > 4 && /(?:xes|zes|ches|shes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Strip the punctuation a title carries ("Spray:", "(2025", "Ornaments,") but keep inner hyphens, apostrophes and ampersands. */
function cleanWord(word: string): string {
  return word.replace(/^[^\w&]+|[^\w&]+$/g, '');
}

const isNumber = (word: string): boolean => /^\d+(?:st|nd|rd|th)?$/i.test(word);

/**
 * The words an anchor must contain for this target: what the finder matched
 * it on, minus every word that is generic across the catalog. Read from
 * `matchedTokens` when the finder set it, else from the "keywords: a, b"
 * suffix of the reason (what a hand-built suggestion carries).
 */
export function topicWordsOf(target: InternalLinkSuggestion): string[] {
  const raw =
    target.matchedTokens && target.matchedTokens.length > 0
      ? target.matchedTokens
      : (target.reason.split(/keywords?:\s*/i)[1] ?? '').split(/[,\s]+/);
  const out: string[] = [];
  for (const token of raw) {
    const w = bare(token);
    if (w.length < 3 || NON_TOPIC_WORDS.has(w) || isNumber(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

function isTopicWord(word: string, topicStems: Set<string>): boolean {
  return topicStems.has(stem(word));
}

/** The route prefixes of the site's own addresses; never words of what a page is about. */
const ROUTE_WORDS = new Set(['blog', 'videos', 'cat', 'products', 'services', 'shop', 'by', 'theme']);

/**
 * The words of the target's own address that say what the page is about:
 * route prefixes, generic promo and filler words dropped. A one-word anchor
 * is allowed only when EVERY one of these is a topic word, so the page is
 * about exactly the topic and nothing wider. Measured on the AUTO-201 proof
 * run: it keeps "[tote]" for /cat/tote-bags and "[cushions]" for
 * /cat/seat-cushions, and refuses "[bag]" for /cat/lunch-bags-boxes-totes,
 * "[seats]" for /cat/seat-covers, "[water]" for a debossed-bottles video and
 * "[employees]" for a pepper spray post, which the address-contains-the-word
 * rule alone had let through.
 */
function hrefTopicWords(href: string): Set<string> {
  const path = href.replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0];
  return new Set(
    path
      .split(/[^a-z0-9]+/i)
      .filter((w) => w.length > 0 && !ROUTE_WORDS.has(w.toLowerCase()) && !NON_TOPIC_WORDS.has(w.toLowerCase()) && !isNumber(w))
      .map(stem)
      .filter((w) => w.length > 0),
  );
}

/**
 * Trim a window of label words to a phrase that can stand as an anchor:
 * leading function words and numbers off the front, function words, numbers
 * and generic promo words off the end. Null when nothing usable is left.
 */
function trimEdges(words: string[]): string[] | null {
  let start = 0;
  let end = words.length;
  while (start < end && (LEADING_EDGE_WORDS.has(bare(words[start])) || isNumber(words[start]) || bare(words[start]) === '')) start += 1;
  while (end > start && (TRAILING_EDGE_WORDS.has(bare(words[end - 1])) || isNumber(words[end - 1]) || bare(words[end - 1]) === '')) end -= 1;
  return end > start ? words.slice(start, end) : null;
}

/**
 * Ordered anchor candidates under the 'topic' policy: every label n-gram,
 * trimmed, that contains a topic word, longest TRIMMED phrase first (so
 * "custom pepper spray" is tried before the fragment "custom pepper"), then
 * the topic words themselves as one-word anchors where the target's address
 * carries the word. Returns the candidates with whether each is a single word.
 */
export function topicAnchorCandidates(target: InternalLinkSuggestion): { phrase: string; single: boolean }[] {
  const topicStems = new Set(topicWordsOf(target).map(stem));
  if (topicStems.size === 0) return [];
  const label = target.label.split('|')[0].trim();
  const words = label
    .split(/\s+/)
    .map(cleanWord)
    .filter((w) => bare(w).length > 0);
  const seen = new Set<string>();
  const phrases: string[] = [];
  const add = (phrase: string[]) => {
    const key = phrase.map(bare).join(' ');
    if (!key || seen.has(key)) return;
    seen.add(key);
    phrases.push(phrase.join(' '));
  };
  for (let n = Math.min(MAX_NGRAM_WORDS, words.length); n >= 2; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const trimmed = trimEdges(words.slice(i, i + n));
      if (!trimmed || trimmed.length < 2) continue;
      if (!trimmed.some((w) => isTopicWord(w, topicStems))) continue;
      add(trimmed);
    }
  }
  // Longest trimmed phrase first; equal lengths keep label order (stable sort).
  phrases.sort((a, b) => b.split(' ').length - a.split(' ').length);
  const out = phrases.map((phrase) => ({ phrase, single: false }));
  // One-word anchors: a topic word that is in the target's own address, and
  // only when the address is about nothing but topic words.
  const addressWords = hrefTopicWords(target.href);
  const aboutTheTopic = addressWords.size > 0 && [...addressWords].every((w) => topicStems.has(w));
  const singles: string[] = [];
  if (aboutTheTopic) {
    for (const w of words) {
      if (isTopicWord(w, topicStems) && addressWords.has(stem(w)) && bare(w).length >= 4) singles.push(w);
    }
    for (const t of topicWordsOf(target)) {
      if (addressWords.has(stem(t)) && t.length >= 4) singles.push(t);
    }
  }
  for (const s of singles) {
    const key = bare(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ phrase: s, single: true });
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

/**
 * The 'topic' policy's pattern: each word in singular or plural, so the
 * candidate "custom pepper spray" matches "custom pepper sprays" in the text
 * and the fragment "custom pepper" is never needed.
 */
function wordPattern(word: string): string {
  const alts = [word];
  const low = word.toLowerCase();
  if (low.length > 3 && low.endsWith('s') && !low.endsWith('ss')) alts.push(word.slice(0, -1));
  return `(?:${alts.map(escapeRegExp).join('|')})(?:e?s)?`;
}

function topicPhraseRegex(phrase: string): RegExp {
  const body = phrase.split(/\s+/).map(wordPattern).join('\\s+');
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

/** Which anchor rules apply (AUTO-201). Default 'label'. */
export type AnchorPolicy = 'label' | 'topic';

export interface PlaceInternalLinksOptions {
  /** Default 'blog'. */
  linkShape?: PlacedLinkShape;
  /** Default 'label'; the blog generator passes 'topic'. */
  anchorPolicy?: AnchorPolicy;
  /**
   * The POST's own topic words (its keywords), topic policy only: a match
   * is refused when the word just before or after it is one of these, as
   * well as one of the target's. On the AUTO-201 proof run the stadium
   * blankets page had matched on "stadium" alone, so "[Custom stadium]" was
   * cut out of "custom stadium seat cushions": "seat" is not that target's
   * word, but it is the post's.
   */
  topicWords?: string[];
}

/** The words just before and after a match in a span, for the topic policy's no-split rule. */
function neighbourWords(text: string, start: number, end: number): { before: string; after: string } {
  const before = text.slice(0, start).match(/([A-Za-z0-9'-]+)[^A-Za-z0-9]*$/)?.[1] ?? '';
  const after = text.slice(end).match(/^[^A-Za-z0-9]*([A-Za-z0-9'-]+)/)?.[1] ?? '';
  return { before, after };
}

/**
 * Try to wrap the first occurrence of `re` (searching only link-free spans)
 * in a link to `href`. Returns the new spans array and the anchor text, or
 * null when no match. `topicStems` (topic policy only) refuses a match that
 * would cut a product phrase: a topic word right AFTER any match ("[custom
 * pepper] spray", "[Custom stadium] seat cushions"), and a topic word right
 * BEFORE a one-word anchor ("pepper [spray]"). A phrase may follow a topic
 * word: "stadium [seat cushions]" leaves the modifier out and the noun
 * phrase whole, which reads fine; refusing it sent the seat cushions page to
 * a bare "[seats]" on the AUTO-201 proof run.
 */
function linkFirstMatch(
  paragraph: BlogRichText,
  re: RegExp,
  href: string,
  linkShape: PlacedLinkShape,
  topicStems: Set<string> | null,
  single: boolean,
): { spans: BlogInlineSpan[]; anchor: string } | null {
  const spans = toSpans(paragraph);
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span.link) continue;
    const m = re.exec(span.text);
    if (!m) continue;
    const start = m.index + m[1].length;
    const matched = m[2];
    if (topicStems) {
      // The neighbours are read across the WHOLE paragraph, not this span
      // alone: once a paragraph carries a link it is split into spans, and
      // on the AUTO-201 proof run "[Custom stadium]" was cut out of "Custom
      // stadium [seat cushions]" because the "seat" sat in the next span.
      const left = spans.slice(0, i).map((s) => s.text).join('') + span.text.slice(0, start);
      const right = span.text.slice(start + matched.length) + spans.slice(i + 1).map((s) => s.text).join('');
      const { before, after } = neighbourWords(`${left}${matched}${right}`, left.length, left.length + matched.length);
      if (after && isTopicWord(after, topicStems)) continue;
      if (single && before && isTopicWord(before, topicStems)) continue;
    }
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
    return { spans: [...spans.slice(0, i), ...replacement, ...spans.slice(i + 1)], anchor: matched };
  }
  return null;
}

/** One link as it was placed (AUTO-201): what the reader sees and where it goes. */
export interface PlacedLink {
  href: string;
  /** The exact text wrapped in the link, as it stands in the paragraph. */
  anchor: string;
  label: string;
  kind: InternalLinkKind;
}

export interface PlaceInternalLinksResult {
  body: BlogBodyInput;
  /** hrefs actually placed, in placement order. */
  placedHrefs: string[];
  /** The same placements with their anchor text (AUTO-201). */
  placed: PlacedLink[];
}

export function placeInternalLinks(
  input: BlogBodyInput,
  targets: InternalLinkSuggestion[],
  maxLinks = 5,
  opts: PlaceInternalLinksOptions = {},
): PlaceInternalLinksResult {
  const linkShape = opts.linkShape ?? 'blog';
  const policy: AnchorPolicy = opts.anchorPolicy ?? 'label';
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
  const placed: PlacedLink[] = [];
  const usedPhrases = new Set<string>();
  const postStems = (opts.topicWords ?? [])
    .flatMap((w) => w.split(/[^a-z0-9]+/i))
    .map(bare)
    .filter((w) => w.length >= 3 && !NON_TOPIC_WORDS.has(w) && !isNumber(w))
    .map(stem);

  for (const target of targets) {
    if (placedHrefs.length >= maxLinks) break;
    if (!target.href || placedHrefs.includes(target.href)) continue;

    // The no-split guard sees the target's words AND the post's.
    const topicStems = policy === 'topic' ? new Set([...topicWordsOf(target).map(stem), ...postStems]) : null;
    const candidates: { phrase: string; re: RegExp; single: boolean }[] =
      policy === 'topic'
        ? topicAnchorCandidates(target)
            .filter((c) => !usedPhrases.has(c.phrase.toLowerCase()))
            .map((c) => ({ phrase: c.phrase, re: topicPhraseRegex(c.phrase), single: c.single }))
        : anchorCandidates(target)
            .filter((c) => !usedPhrases.has(c.toLowerCase()))
            .map((phrase) => ({ phrase, re: phraseRegex(phrase), single: false }));
    let done = false;
    // Pass 1: paragraphs without links (spread); pass 2: allow sharing a
    // paragraph only when nothing else matched.
    for (const allowLinked of [false, true]) {
      if (done) break;
      for (const { phrase, re, single } of candidates) {
        if (done) break;
        for (const ref of refs) {
          const paragraph = ref.get();
          // Pass 1 (allowLinked=false): link-free paragraphs only (spread).
          // Pass 2 (allowLinked=true): revisit only already-linked paragraphs.
          if (paragraphHasLink(paragraph) !== allowLinked) continue;
          const next = linkFirstMatch(paragraph, re, target.href, linkShape, topicStems, single);
          if (next) {
            ref.set(next.spans);
            placedHrefs.push(target.href);
            placed.push({ href: target.href, anchor: next.anchor, label: target.label, kind: target.kind });
            usedPhrases.add(phrase.toLowerCase());
            // The anchor as it stands in the text is spent too, so two targets
            // never link the same words (the plural-tolerant match can differ
            // from the candidate phrase by an "s").
            usedPhrases.add(next.anchor.toLowerCase());
            done = true;
            break;
          }
        }
      }
    }
    // No clean anchor → skip this target (never force an awkward link).
  }

  return { body, placedHrefs, placed };
}
