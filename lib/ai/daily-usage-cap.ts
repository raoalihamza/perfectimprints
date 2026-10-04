/**
 * A daily cap on paid AI calls, counted OUTSIDE process memory (AUTO-202,
 * extracted verbatim from lib/portfolio/ai-usage.ts, PORT-170, so the blog
 * header images and the portfolio photo descriptions share ONE counter
 * mechanism and differ only in the document they count in and the number).
 *
 * WHERE THE COUNTER LIVES, AND WHY NOT IN MEMORY. A serverless instance is
 * recycled without notice, so a counter held in module scope would start from
 * zero on every cold start, which is precisely the case a cap exists for (the
 * quote view debounce, Q-150, learned this and keeps its state in Sanity).
 * Each counter is a single invisible Sanity document holding the UTC day and
 * the number of calls reserved that day. Its `_type` is deliberately NOT
 * registered in sanity/schemas/index.ts (the `quoteCounter` / `siteRefreshAuth`
 * precedent), so it never appears in the Studio desk and cannot be edited by
 * accident.
 *
 * RESERVE BEFORE SPENDING. The caller reserves a slot BEFORE it calls Google,
 * with the same revision-guarded compare-and-set `lib/quotes/numbering.ts`
 * uses (read `_rev`, commit `ifRevisionId`, retry on conflict), so two
 * concurrent calls cannot both take the last slot and a bug that loops cannot
 * spend past the cap: the reservation counts attempts, not successes, and a
 * Gemini failure after a reservation still consumes the slot. That is the
 * honest ceiling on spend. If the reservation itself cannot be written
 * (Sanity unreachable), the answer is "no": the cap fails CLOSED, because an
 * uncounted call is exactly what the cap promises will not happen.
 *
 * Client-agnostic like numbering.ts: the caller passes the Sanity client
 * (the routes pass `serverSanityClient()`), and the tests pass a fake. No
 * node imports, no `server-only`, no fs.
 */

const MAX_ATTEMPTS = 5;

/** The minimal client surface the reservation needs (the numbering.ts structural-interface rule). */
export interface DailyCapClient {
  fetch<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T>;
  createIfNotExists(doc: { _id: string; _type: string } & Record<string, unknown>): Promise<unknown>;
  patch(id: string): {
    ifRevisionId(rev: string): {
      set(attrs: Record<string, unknown>): { commit(): Promise<unknown> };
    };
  };
}

/** One counter: which document, what ceiling, and the words of its refusal. */
export interface DailyCapSpec {
  docId: string;
  docType: string;
  cap: number;
  /** The plain-words refusal shown when the day's slots are gone. */
  capMessage: (cap: number) => string;
  /** The refusal when the counter itself cannot be read or written. */
  unavailableMessage?: string;
}

export type DailyCapReservation =
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

export const DEFAULT_UNAVAILABLE_MESSAGE =
  'The daily-limit counter could not be updated, so nothing was sent to Google. Try again in a moment; if it keeps happening, tell Ali.';

function jitteredDelay(attempt: number): Promise<void> {
  const ms = 100 * attempt + Math.floor(Math.random() * 200);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reserve one call for today in the given counter. Resolves `ok: true` with
 * the count after the reservation, or `ok: false` with `reason: 'cap'` (the
 * day's slots are all taken) or `reason: 'unavailable'` (the counter could not
 * be read or written after bounded retries). Never throws.
 */
export async function reserveDailyAiCall(
  client: DailyCapClient,
  spec: DailyCapSpec,
  now: Date = new Date(),
): Promise<DailyCapReservation> {
  const day = usageDayKey(now);
  const cap = spec.cap;
  const unavailable = spec.unavailableMessage ?? DEFAULT_UNAVAILABLE_MESSAGE;
  try {
    await client.createIfNotExists({
      _id: spec.docId,
      _type: spec.docType,
      day,
      count: 0,
    });
  } catch {
    return { ok: false, reason: 'unavailable', used: 0, cap, day, message: unavailable };
  }

  let lastUsed = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let snapshot: UsageSnapshot | null;
    try {
      snapshot = await client.fetch<UsageSnapshot | null>(`*[_id == $id][0]{ _rev, day, count }`, {
        id: spec.docId,
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
      return { ok: false, reason: 'cap', used: stored, cap, day, message: spec.capMessage(cap) };
    }
    const next = stored + 1;
    try {
      await client
        .patch(spec.docId)
        .ifRevisionId(snapshot._rev)
        .set({ day, count: next })
        .commit();
      return { ok: true, used: next, cap, day };
    } catch {
      // Revision conflict (a concurrent caller won) or a transient API error:
      // retry with fresh state. A failed commit reserved nothing.
      await jitteredDelay(attempt);
    }
  }
  return { ok: false, reason: 'unavailable', used: lastUsed, cap, day, message: unavailable };
}
