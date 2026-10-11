/**
 * The token rules of product matching (FIX-911), in one pure module so the
 * related-products matcher and the category resolver cannot disagree about
 * what a word is: the same lowercase split, the same non-significant list,
 * the same singular / plural fold. Until FIX-911 these were private functions
 * inside lib/ai/related-products.ts.
 *
 * Pure: no node:fs, no `sanity`, no `server-only`.
 */

import { PRODUCT_MATCH_NON_SIGNIFICANT_WORDS } from './brand-voice';

/** Lowercase alphanumeric tokens, length >= 3. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/** Tokens that carry relevance signal: generic promo words and filler stripped, "can" kept. */
export function significantTokens(text: string): string[] {
  return tokenize(text).filter((t) => !PRODUCT_MATCH_NON_SIGNIFICANT_WORDS.has(t));
}

/**
 * Whether a token set carries a word, folding a trailing "s" either way
 * ("bottles" is carried by "bottle" and "bottle" by "bottles"). The matcher's
 * one plural rule; deliberately naive, and deliberately the same everywhere.
 */
export function carriesToken(tokens: ReadonlySet<string>, word: string): boolean {
  return (
    tokens.has(word) ||
    (word.endsWith('s') && tokens.has(word.slice(0, -1))) ||
    tokens.has(`${word}s`)
  );
}

/**
 * The words of a product phrase that name the product, in order, each once.
 *
 * A trailing "with ..." or "for ..." is cut first: it names an accessory or
 * an audience ("wine openers with flashlights", "cups for gift sets"), and
 * English puts the product before it. A word that occurs twice keeps its LAST
 * place, so the final token is always the phrase's last word.
 */
export function productPhraseTokens(phrase: string): string[] {
  const head = phrase.toLowerCase().replace(/\s+(with|for)\s+.*$/, '');
  const raw = significantTokens(head);
  return raw.filter((t, i) => raw.lastIndexOf(t) === i);
}
