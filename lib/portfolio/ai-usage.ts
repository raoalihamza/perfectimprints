/**
 * The daily cap on AI photo-detail calls (PORT-170), the promise that "the
 * system cannot run up a bill".
 *
 * AUTO-202 moved the mechanism itself (the invisible Sanity counter document,
 * the revision-guarded compare-and-set, reserve-before-spending, fail closed)
 * VERBATIM into lib/ai/daily-usage-cap.ts so the blog header images share it;
 * this file keeps the portfolio's own counter document, its number and its
 * wording, and every export it had, so nothing that imports it changed. The
 * reasoning behind the mechanism is in that file's header.
 *
 * THE NUMBER. 100 calls per UTC day. Patrick spoke of about 500 photographs a
 * year; the busiest plausible day is a batch of thirty or forty after a
 * photo session, and a failed call he retries costs a second slot, so 100 is
 * a ceiling he should never meet. At the chosen model's paid rate a full day
 * costs about USD 0.10, a month of full days about USD 3; even a swap to a
 * ten-times-dearer model keeps a runaway day under a dollar. The cap resets
 * at midnight UTC (about 7pm to 8pm in Florida), which the refusal message
 * states in plain words.
 *
 * It is the ONLY Sanity document the AI photo route ever writes; no content
 * document is touched server-side, the Studio button fills the draft in the
 * editor's browser.
 */
import {
  reserveDailyAiCall,
  usageDayKey,
  type DailyCapClient,
  type DailyCapReservation,
} from '../ai/daily-usage-cap';

export { usageDayKey };

/** Calls allowed per UTC day. See the header comment before changing it. */
export const PORTFOLIO_AI_DAILY_CAP = 100;

export const PORTFOLIO_AI_USAGE_DOC_ID = 'portfolioAiUsage';
export const PORTFOLIO_AI_USAGE_DOC_TYPE = 'portfolioAiUsage';

/** The minimal client surface the reservation needs (the numbering.ts structural-interface rule). */
export type PortfolioAiUsageClient = DailyCapClient;

export type PortfolioAiReservation = DailyCapReservation;

/** The plain-words refusal the Studio shows when the cap is reached. */
export function capReachedMessage(cap: number): string {
  return `The daily limit of ${cap} AI photo descriptions has been reached, so nothing was sent to Google. The limit resets at midnight UTC (evening in Florida). You can still fill the fields in by hand.`;
}

/**
 * Reserve one call for today. Resolves `ok: true` with the count after the
 * reservation, or `ok: false` with `reason: 'cap'` (the day's slots are all
 * taken) or `reason: 'unavailable'` (the counter could not be read or
 * written after bounded retries). Never throws.
 */
export function reservePortfolioAiCall(
  client: PortfolioAiUsageClient,
  now: Date = new Date(),
  cap: number = PORTFOLIO_AI_DAILY_CAP,
): Promise<PortfolioAiReservation> {
  return reserveDailyAiCall(
    client,
    { docId: PORTFOLIO_AI_USAGE_DOC_ID, docType: PORTFOLIO_AI_USAGE_DOC_TYPE, cap, capMessage: capReachedMessage },
    now,
  );
}
