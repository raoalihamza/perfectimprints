/**
 * Which root category a product phrase belongs to (FIX-911). The rules, as a
 * pure function over an evidence index: every root's slug, and the names of
 * the products the root actually shows.
 *
 * Why this exists. Until FIX-911 `resolveCategoryForKeywords` scored root
 * SLUG words only (shared words, then the shorter slug). FIX-910 measured
 * what that does to generated blog strips: for "collapsible can coolers" the
 * koozies root scored zero, because the root is named `koozies` and its 76
 * products are named "Can Cooler"; "photo frame ornaments" went to
 * photo-frames on two shared words against one; "sunscreen golf packs" went
 * to the golf department. The truth was in the product names and the
 * resolver never read them.
 *
 * The rules, strongest first. T is the phrase's product words in order
 * (`productPhraseTokens`: generic promo words and filler dropped, a trailing
 * "with ..." / "for ..." cut).
 *
 *   1. EXACT. A root whose slug carries every word of the phrase ("power
 *      banks" -> power-banks-chargers). Unchanged from before.
 *   2. A SLUG NAMES THE PHRASE'S TAIL, two words or more. English stacks
 *      modifiers to the left, so dropping leading words generalises the
 *      phrase: "test tote bags" -> "tote bags" -> tote-bags; "spf lip balm"
 *      -> lip-balm. The longest such tail wins. A category literally named
 *      for the product is the strongest evidence short of rule 1.
 *   3. PRODUCT NAMES CARRY THE PHRASE'S TAIL, two words or more (or the
 *      whole of a one-word phrase): "stainless steel can coolers" -> "can
 *      coolers" -> the koozies root, whose slug shares no word with it. A
 *      root counts when at least MIN_EVIDENCE_PRODUCTS of its products carry
 *      the tail and they are MIN_EVIDENCE_SHARE of its list; the longest
 *      tail wins, then the largest share. The share is what keeps a
 *      1,000-product department holding 57 "12-Can Cooler Bag"s (6%) behind
 *      the koozies root (33 of 76 names, 43%). Measured 2026-10-10; the
 *      hard-cooler root is second (26 of 78, "12-Can Convertible Cooler").
 *   4. NAMED OUTRIGHT. A root whose whole slug is in the phrase ("photo
 *      frame ornaments" names both photo-frames and ornaments). The one
 *      furthest right wins, because the last word is the product; and a root
 *      is refused when its own products do not carry the word it was matched
 *      on (the keychains root is 75 "Key Tag"s), so the next one is tried.
 *   5. THE HEAD WORD NAMES ONE ROOT. The phrase's last word is in exactly one
 *      root's slug ("test notebooks" -> journals-notebooks), and that root's
 *      products carry it. Three roots carry "signs" and six carry "sets", so
 *      "neon signs" and "travel sets" get no answer from this rule.
 *   6. Otherwise NO category. The caller falls back to the whole catalogue
 *      at its own floor, or to nothing. An unanswered phrase is honest; the
 *      old rule's answer for "cassette tape shaped items" was yoga-items.
 *
 * NAMES ARE EVIDENCE, NEVER A GATE. Rules 1, 2, 4 and 5 answer from the
 * slug, so "embroidered koozies", "retro sunglasses" and "safety reminder
 * magnets" resolve although no product is named that way. FIX-910 measured
 * the other road (a root must hold two products naming the whole phrase, or
 * there is no category): 28 of 56 right strips lost. Do not turn rule 3 into
 * a condition on the others.
 *
 * Pure: no node:fs, no `sanity`, no `server-only`. The index is built by
 * lib/ai/category-evidence.ts; tests build it from a fixture.
 */

import { carriesToken, productPhraseTokens, significantTokens } from './match-tokens';

/** One root: its slug and the names (name + brand) of the products it shows. */
export interface CategoryEvidence {
  slug: string;
  names: readonly string[];
}

/** A root needs at least this many products carrying the words to count as evidence. */
export const MIN_EVIDENCE_PRODUCTS = 2;
/** ...and they must be at least this share of the root's products. */
export const MIN_EVIDENCE_SHARE = 0.1;

interface IndexedCategory {
  slug: string;
  slugTokens: readonly string[];
  slugSet: ReadonlySet<string>;
  names: readonly ReadonlySet<string>[];
}

export interface CategoryIndex {
  categories: readonly IndexedCategory[];
}

export type CandidateRule = 'exact' | 'tail-slug' | 'tail-names' | 'named' | 'head';

export interface CategoryCandidate {
  slug: string;
  rule: CandidateRule;
  /** The words the candidate was matched on. */
  words: string[];
  /** Products of the root whose names carry those words (name rules and verification). */
  products?: number;
  share?: number;
}

export function buildCategoryIndex(evidence: readonly CategoryEvidence[]): CategoryIndex {
  return {
    categories: evidence.map((e) => {
      const slugTokens = [...new Set(significantTokens(e.slug.split('-').join(' ')))];
      return {
        slug: e.slug,
        slugTokens,
        slugSet: new Set(slugTokens),
        names: e.names.map((n) => new Set(significantTokens(n))),
      };
    }),
  };
}

/** Shorter slug first, then alphabetical: the old resolver's tie-break, kept. */
function slugOrder(a: IndexedCategory, b: IndexedCategory): number {
  return a.slug.length - b.slug.length || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

/** Products of the root whose names carry EVERY word. */
function carrying(c: IndexedCategory, words: readonly string[]): number {
  let n = 0;
  for (const name of c.names) if (words.every((w) => carriesToken(name, w))) n += 1;
  return n;
}

/** Products of the root whose names carry ANY of the words. */
function carryingAny(c: IndexedCategory, words: readonly string[]): number {
  let n = 0;
  for (const name of c.names) if (words.some((w) => carriesToken(name, w))) n += 1;
  return n;
}

function isEvidence(products: number, total: number): boolean {
  return products >= MIN_EVIDENCE_PRODUCTS && total > 0 && products / total >= MIN_EVIDENCE_SHARE;
}

/**
 * Every candidate root for a phrase, strongest first. Exported so the
 * measuring harness and the tests can see WHY a root was chosen; callers
 * want `resolveCategoryFromIndex`.
 */
export function categoryCandidates(phrase: string, index: CategoryIndex): CategoryCandidate[] {
  const T = productPhraseTokens(phrase);
  if (T.length === 0) return [];
  const out: CategoryCandidate[] = [];
  const seen = new Set<string>();
  const add = (c: CategoryCandidate) => {
    if (seen.has(c.slug)) return;
    seen.add(c.slug);
    out.push(c);
  };
  const phraseSet = new Set(T);
  const shared = (c: IndexedCategory) => T.filter((t) => carriesToken(c.slugSet, t));

  // 1) Exact: the slug carries every word of the phrase.
  for (const c of index.categories.filter((c) => T.every((t) => carriesToken(c.slugSet, t))).sort(slugOrder)) {
    add({ slug: c.slug, rule: 'exact', words: [...T] });
  }

  // 2) A slug names the phrase's tail, two words or more, longest tail first.
  for (let k = T.length - 1; k >= 2; k -= 1) {
    const tail = T.slice(-k);
    const bySlug = index.categories
      .filter((c) => tail.every((t) => carriesToken(c.slugSet, t)))
      .sort((a, b) => shared(b).length - shared(a).length || slugOrder(a, b));
    for (const c of bySlug) add({ slug: c.slug, rule: 'tail-slug', words: tail });
  }

  // 3) Product names carry the phrase's tail. A one-word phrase is its own
  //    tail; a longer phrase stops at two words, because one word in product
  //    names is the incidental-word match this whole module exists to avoid.
  for (let k = T.length; k >= Math.min(2, T.length); k -= 1) {
    const tail = T.slice(-k);
    const byNames = index.categories
      .map((c) => ({ c, products: carrying(c, tail) }))
      .filter((e) => isEvidence(e.products, e.c.names.length))
      .sort(
        (a, b) =>
          b.products / b.c.names.length - a.products / a.c.names.length ||
          b.products - a.products ||
          slugOrder(a.c, b.c),
      );
    for (const e of byNames) {
      add({ slug: e.c.slug, rule: 'tail-names', words: tail, products: e.products, share: e.products / e.c.names.length });
    }
  }

  // 4) Named outright (the whole slug is in the phrase) and 5) the head word
  //    names exactly one root. Both are verified by the root's own product
  //    names; the one matched furthest right in the phrase is tried first.
  const head = T[T.length - 1];
  const named = index.categories.filter(
    (c) => c.slugTokens.length > 0 && c.slugTokens.every((s) => carriesToken(phraseSet, s)),
  );
  const headOnly = index.categories.filter((c) => carriesToken(c.slugSet, head) && !named.includes(c));
  const bySlug = [
    ...named.map((c) => ({ c, rule: 'named' as const })),
    ...(headOnly.length === 1 ? [{ c: headOnly[0], rule: 'head' as const }] : []),
  ]
    .map((e) => {
      const words = e.rule === 'head' ? [head] : shared(e.c);
      return { ...e, words, right: Math.max(...words.map((w) => T.lastIndexOf(w))) };
    })
    .sort(
      (a, b) =>
        b.right - a.right ||
        (a.rule === b.rule ? 0 : a.rule === 'named' ? -1 : 1) ||
        b.words.length - a.words.length ||
        slugOrder(a.c, b.c),
    );
  for (const e of bySlug) {
    const products = carryingAny(e.c, e.words);
    if (!isEvidence(products, e.c.names.length)) continue;
    add({ slug: e.c.slug, rule: e.rule, words: e.words, products, share: products / e.c.names.length });
  }

  return out;
}

export function resolveCategoryFromIndex(phrase: string, index: CategoryIndex): string | null {
  return categoryCandidates(phrase, index)[0]?.slug ?? null;
}
