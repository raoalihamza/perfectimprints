/**
 * The daily cap on AI photo-detail calls (PORT-170), the promise that "the
 * system cannot run up a bill".
 *
 * WHERE THE COUNTER LIVES, AND WHY NOT IN MEMORY. A serverless instance is
 * recycled without notice, so a counter held in module scope would start from
 * zero on every cold start, which is precisely the case a cap exists for (the
 * quote view debounce, Q-150, learned this and keeps its state in Sanity).
 * This counter is a single invisible Sanity document, `portfolioAiUsage`,
 * holding the UTC day and the number of calls reserved that day. Its `_type`
 * is deliberately NOT registered in sanity/schemas/index.ts (the
 * `quoteCounter` / `siteRefreshAuth` precedent), so it never appears in the
 * Studio desk and cannot be edited by accident. It is the ONLY Sanity
 * document the AI photo route ever writes; no content document is touched
 * server-side, the Studio button fills the draft in the editor's browser.
 *
 * RESERVE BEFORE SPENDING. The route reserves a slot BEFORE it calls Google,
 * with the same revision-guarded compare-and-set `lib/quotes/numbering.ts`
 * uses (read `_rev`, commit `ifRevisionId`, retry on conflict), so two
 * concurrent clicks cannot both take the last slot and a bug that loops
 * cannot spend past the cap: the reservation counts attempts, not successes,
 * and a Gemini failure after a reservation still consumes the slot. That is
 * the honest ceiling on spend. If the reservation itself cannot be written
 * (Sanity unreachable), the answer is "no": the cap fails CLOSED, because an
 * uncounted call is exactly what the cap promises will not happen.
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
 * Client-agnostic like numbering.ts: the caller passes the Sanity client
 * (the route passes `serverSanityClient()`), and the tests pass a fake. No
 * node imports, no `server-only`, no fs.
 */

/** Calls allowed per UTC day. See the header comment before changing it. */
export const PORTFOLIO_AI_DAILY_CAP = 100;

export const PORTFOLIO_AI_USAGE_DOC_ID = 'portfolioAiUsage';
export const PORTFOLIO_AI_USAGE_DOC_TYPE = 'portfolioAiUsage';

const MAX_ATTEMPTS = 5;

/** The minimal client surface the reservation needs (the numbering.ts structural-interface rule). */
export interface PortfolioAiUsageClient {
  fetch<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T>;
  createIfNotExists(doc: { _id: string; _type: string } & Record<string, unknown>): Promise<unknown>;
  patch(id: string): {
    ifRevisionId(rev: string): {
      set(attrs: Record<string, unknown>): { commit(): Promise<unknown> };
    };
  };
}

export type PortfolioAiReservation =
  | { ok: true; used: number; cap: number; day: string }
  | { ok: false; reason: 'cap' | 'unavailable'; used: number; cap: number; day: string; message: string };

interface UsageSnapshot {
  _rev?: string;
  day?: unknown;
  count?: unknown;
}

/** The UTC calendar day a moment falls in, `YYYY-MM-DD`. */
export function usageDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The plain-words refusal the Studio shows when the cap is reached. */
export function capReachedMessage(cap: number): string {
  return `The daily limit of ${cap} AI photo descriptions has been reached, so nothing was sent to Google. The limit resets at midnight UTC (evening in Florida). You can still fill the fields in by hand.`;
}

function jitteredDelay(attempt: number): Promise<void> {
  const ms = 100 * attempt + Math.floor(Math.random() * 200);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reserve one call for today. Resolves `ok: true` with the count after the
 * reservation, or `ok: false` with `reason: 'cap'` (the day's slots are all
 * taken) or `reason: 'unavailable'` (the counter could not be read or
 * written after bounded retries). Never throws.
 */
export async function reservePortfolioAiCall(
  client: PortfolioAiUsageClient,
  now: Date = new Date(),
  cap: number = PORTFOLIO_AI_DAILY_CAP,
): Promise<PortfolioAiReservation> {
  const day = usageDayKey(now);
  try {
    await client.createIfNotExists({
      _id: PORTFOLIO_AI_USAGE_DOC_ID,
      _type: PORTFOLIO_AI_USAGE_DOC_TYPE,
      day,
      count: 0,
    });
  } catch {
    return { ok: false, reason: 'unavailable', used: 0, cap, day, message: unavailableMessage() };
  }

  let lastUsed = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let snapshot: UsageSnapshot | null;
    try {
      snapshot = await client.fetch<UsageSnapshot | null>(`*[_id == $id][0]{ _rev, day, count }`, {
        id: PORTFOLIO_AI_USAGE_DOC_ID,
      });
    } catch {
      await jitteredDelay(attempt);
      continue;
    }
    if (!snapshot?._rev) {
      await jitteredDelay(attempt);
      continue;
    }
    // A new day starts the count over; an old document from yesterday counts nothing.
    const sameDay = snapshot.day === day;
    const stored =
      sameDay && typeof snapshot.count === 'number' && Number.isFinite(snapshot.count)
        ? Math.max(0, Math.floor(snapshot.count))
        : 0;
    lastUsed = stored;
    if (stored >= cap) {
      return { ok: false, reason: 'cap', used: stored, cap, day, message: capReachedMessage(cap) };
    }
    const next = stored + 1;
    try {
      await client
        .patch(PORTFOLIO_AI_USAGE_DOC_ID)
        .ifRevisionId(snapshot._rev)
        .set({ day, count: next })
        .commit();
      return { ok: true, used: next, cap, day };
    } catch {
      // Revision conflict (a concurrent click won) or a transient API error:
      // retry with fresh state. A failed commit reserved nothing.
      await jitteredDelay(attempt);
    }
  }
  return { ok: false, reason: 'unavailable', used: lastUsed, cap, day, message: unavailableMessage() };
}

function unavailableMessage(): string {
  return 'The daily-limit counter could not be updated, so nothing was sent to Google. Try again in a moment; if it keeps happening, tell Ali.';
}
