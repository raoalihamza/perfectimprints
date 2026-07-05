/**
 * Word-count budgeting for AI-generated long-form content (P2-AI-002b).
 *
 * Telling an LLM "write 1700 words" is unreliable (Patrick's first real run
 * came out at ~963 against a 1,500-2,000 ask). What works is concrete
 * per-section budgets: fix the section count up front, reserve an intro
 * budget, split the remainder evenly, and state all the numbers in the prompt.
 * The generate route then enforces a dynamic thin floor (75% of target) on the
 * assembled result.
 *
 * Pure module: no fs, no Sanity, no env — unit-tested by the offline verifier.
 */

export const WORD_COUNT_MIN = 1200;
export const WORD_COUNT_MAX = 2400;
export const WORD_COUNT_DEFAULT = 1700;

/** Fraction of the target below which the result is rejected as thin. */
export const THIN_FLOOR_RATIO = 0.75;

/** Clamp an editor-supplied target into the supported range (default 1700). */
export function clampWordCount(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : NaN;
  if (Number.isNaN(n)) return WORD_COUNT_DEFAULT;
  return Math.min(WORD_COUNT_MAX, Math.max(WORD_COUNT_MIN, n));
}

/** How many idea sections a list post gets for a target (8-12). */
export function listIdeaCount(target: number): number {
  return Math.min(12, Math.max(8, Math.round(target / 170)));
}

/** How many prose sections a single-focus post gets for a target (4-6). */
export function singleSectionCount(target: number): number {
  return Math.min(6, Math.max(4, Math.round(target / 340)));
}

export interface WordBudget {
  target: number;
  /** Words reserved for the intro paragraphs (~120-180). */
  intro: number;
  sectionCount: number;
  /** Approximate words for EACH section's paragraphs. */
  perSection: number;
}

/**
 * Split a clamped target into intro + per-section budgets. intro + sectionCount
 * × perSection lands within rounding distance of the target.
 */
export function buildWordBudget(target: number, sectionCount: number): WordBudget {
  const intro = Math.min(180, Math.max(120, Math.round(target * 0.09)));
  const perSection = Math.round((target - intro) / Math.max(1, sectionCount));
  return { target, intro, sectionCount, perSection };
}
