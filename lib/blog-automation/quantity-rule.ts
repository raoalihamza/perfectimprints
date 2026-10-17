/**
 * The quantity rule (AUTO-208, Part 5): a generated post states NO number
 * for an order quantity. PURE, no imports, so the generator, the audit script
 * and vitest read one rule.
 *
 * WHY. FIX-920 read "minimum order quantities, usually starting at 25 to 50
 * units" in a generated post, and Ali read a balloons post that stated
 * minimums beside a product row whose own Min Qty said something else. Each
 * product carries its OWN minimum (`min_qty`, printed on its card as "Min
 * N"), the minimums differ by item (from 1 to several hundred on the live
 * catalogue), and the strips are matched AFTER the body is written, so the
 * model cannot know which products will sit beside its sentence: it was
 * inventing a figure about Patrick's business. The choice is the price
 * rule's (AUTO-201): the post states no number for an order quantity, and
 * may say that minimums vary by product and are shown on each item. A
 * minimum printed in prose would also go stale at the next catalogue
 * rebuild, which is exactly why prices were banned. The alternative, feeding
 * the matched products' minimums back into the text, would mean a second
 * generation pass per post and a sentence that is wrong the moment Patrick
 * swaps a product in the strip; it was not built.
 */

/** The prompt's wording; the system prompt reads it from here. */
export const QUANTITY_RULE =
  'NO order quantities, minimum order quantities or unit counts as NUMBERS anywhere in the text (never "25 units", "a minimum of 50", "orders of 100 or more", "as few as 12", "MOQ of 250", "packs of 24"): every product carries its own minimum, which is shown on its card and differs by item, so a figure in the text would be wrong for most of them. You may say that minimums vary by product and are shown on each item, without a figure.';

const UNIT = '(?:units?|pieces?|pcs\\.?|pc\\.?)';
/** A figure with a unit noun: "25 to 50 units", "a 24-piece minimum", "500+ pcs". */
const FIGURE_WITH_UNIT = new RegExp(`\\b\\d[\\d,]*\\+?[\\s-]*${UNIT}\\b`, 'i');
/** "500 or more pieces", "250 minimum units". */
const FIGURE_OR_MORE_UNIT = new RegExp(`\\b\\d[\\d,]*\\s*(?:or more|and up|or higher|or above|minimum|min\\.?)\\s*${UNIT}\\b`, 'i');
/** The phrases that make a bare figure within forty characters an order quantity. */
const CONTEXT =
  '(?:minimums?|moq|order quantit(?:y|ies)|orders? (?:of|start(?:ing|s)?|begin(?:s|ning)?|from|as (?:small|low|few) as)|starting (?:at|from)|starts? at|as few as|as little as|as low as|at least|a minimum of|minimum (?:order|run|quantity) of|quantities (?:of|from|start(?:ing)?)|runs? of|lots? of|batches? of|case packs? of|packs? of|cases? of|cartons? of)';
/** A figure that is plainly NOT an order quantity: a time, a measure, a percentage, a count of colours or ideas, a size. */
const NOT_A_QUANTITY =
  '(?!\\s*(?:%|percent|hours?|hrs?|days?|weeks?|months?|years?|minutes?|seconds?|oz\\b|ounces?|ml\\b|liters?|litres?|inch(?:es)?|in\\b|cm\\b|mm\\b|ft\\b|feet|foot|colou?rs?|ideas?|ways?|tips?|steps?|options?|sizes?|styles?|designs?|degrees?|mph|lbs?|pounds?|grams?|kg\\b|x\\b|times|business days|to \\d+ (?:business )?days|\\d{3}\\b))';
/** A figure may be the start of a range ("3-4 weeks", "25 to 50 units"); what follows the WHOLE range decides, never the first figure alone. */
const RANGE = '\\s*(?:-|to)\\s*\\d[\\d,]*(?![\\d,])';
const AFTER_FIGURE = `(?:${RANGE}${NOT_A_QUANTITY}|(?!${RANGE})${NOT_A_QUANTITY})`;
const FIGURE_IN_CONTEXT = new RegExp(`\\b${CONTEXT}\\b[^.!?\\n]{0,40}?\\b(\\d[\\d,]*)(?![\\d,])${AFTER_FIGURE}`, 'i');

/**
 * A number in prose that reads as an ORDER QUANTITY: a figure followed by
 * units / pieces / pcs, a figure followed by "or more" / "and up" with such
 * a unit, or a figure within forty characters after a quantity phrase
 * ("minimum", "MOQ", "orders of", "orders start at", "as few as", "at
 * least", "quantities of", "runs of", "packs of", "cases of" ...), UNLESS
 * that figure is plainly something else: "at least 24 hours", "at least 16
 * oz", "at least 3 colors", "7 ideas", a size, a year ("since 1985" is not
 * a quantity phrase at all). Measured against every AI post on the site
 * before it shipped (the AUTO-208 report has the counts). A hit rejects the
 * post, as a price does; nothing is edited.
 */
export function containsQuantityClaim(text: string): boolean {
  if (FIGURE_WITH_UNIT.test(text)) return true;
  if (FIGURE_OR_MORE_UNIT.test(text)) return true;
  return FIGURE_IN_CONTEXT.test(text);
}

/** The first sentence-sized stretch that carries a quantity claim, for a message; null when none. */
export function firstQuantityClaim(text: string): string | null {
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (containsQuantityClaim(sentence)) return sentence.trim();
  }
  return containsQuantityClaim(text) ? text.trim().slice(0, 160) : null;
}
