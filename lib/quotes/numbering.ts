/**
 * Quote number allocation (Q-110). Sequential, human-readable numbers
 * ("Q-1001", "Q-1002", ...) that are NEVER duplicated, even when two quotes
 * are created seconds apart.
 *
 * How: a counter singleton document (`quoteCounter`) holds the prefix and the
 * last issued number. Allocation is a revision-guarded compare-and-set: read
 * the counter with its `_rev`, then commit `set({ lastNumber: next })` guarded
 * by `ifRevisionId(rev)`. Two concurrent allocators cannot both commit against
 * the same revision - the loser gets a conflict, re-reads, and retries with
 * jitter. If every attempt conflicts (a genuine burst), allocation FAILS
 * LOUDLY with `QuoteNumberAllocationError`: the caller must surface the error
 * and the quote is left without a number (validation blocks publishing it) -
 * a number is never guessed, never blank, never reused.
 *
 * The counter's `_type` is DELIBERATELY NOT registered in
 * sanity/schemas/index.ts (the `siteRefreshAuth` invisible-type precedent), so
 * it never appears in the Studio desk and cannot be casually edited or
 * deleted. The starting number is settable ONCE: the first allocation seeds
 * the counter via `createIfNotExists` with `lastNumber = 1000` (first issued
 * number 1001); to start elsewhere, set the seeded doc's `lastNumber` /
 * `prefix` via the API or Vision BEFORE the first quote is numbered.
 *
 * PURE-ISH + CLIENT-AGNOSTIC on purpose: no node imports, no `server-only`,
 * no fs - the caller passes the Sanity client. The Studio "Assign quote
 * number" input calls it with the cookie-authed Studio client (`useClient`),
 * and a future server route calls it with `serverSanityClient()`. Both are
 * non-CDN clients; correctness does not depend on read freshness anyway (a
 * stale read simply fails the revision guard and retries). This is the ONE
 * home of the allocation logic - do not re-implement it elsewhere.
 *
 * The client parameter is a minimal STRUCTURAL interface (not the
 * `SanityClient` class type) because the Studio bundles a newer major of
 * @sanity/client than the app's direct dependency, and the class's #private
 * member makes the two nominal types mutually unassignable. Both satisfy
 * this interface structurally.
 */

/** The minimal client surface allocation needs (see the note above). */
export interface QuoteNumberingClient {
  fetch<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T>;
  createIfNotExists(
    doc: { _id: string; _type: string } & Record<string, unknown>,
  ): Promise<unknown>;
  patch(id: string): {
    ifRevisionId(rev: string): {
      set(attrs: Record<string, unknown>): { commit(): Promise<unknown> };
    };
  };
}

export const QUOTE_COUNTER_ID = 'quoteCounter';
export const QUOTE_COUNTER_TYPE = 'quoteCounter';
export const DEFAULT_QUOTE_PREFIX = 'Q-';
/** First number ever issued when the counter seeds itself (Patrick's call to change). */
export const DEFAULT_FIRST_QUOTE_NUMBER = 1001;

const MAX_ATTEMPTS = 5;

export class QuoteNumberAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteNumberAllocationError';
  }
}

export interface AllocatedQuoteNumber {
  /** The bare sequential number, e.g. 1001. */
  number: number;
  /** The display string stored on the quote, e.g. "Q-1001". */
  quoteNumber: string;
}

interface CounterSnapshot {
  _rev?: string;
  prefix?: unknown;
  lastNumber?: unknown;
}

function jitteredDelay(attempt: number): Promise<void> {
  const ms = 100 * attempt + Math.floor(Math.random() * 200);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Allocate the next quote number. Resolves with the issued number, or throws
 * `QuoteNumberAllocationError` after bounded retries - the caller must treat
 * a throw as "no number was issued" (nothing was consumed on a failed commit).
 */
export async function allocateQuoteNumber(
  client: QuoteNumberingClient,
): Promise<AllocatedQuoteNumber> {
  // Idempotent seed - a no-op once the counter exists, and the ONE place the
  // default starting number lives.
  await client.createIfNotExists({
    _id: QUOTE_COUNTER_ID,
    _type: QUOTE_COUNTER_TYPE,
    prefix: DEFAULT_QUOTE_PREFIX,
    lastNumber: DEFAULT_FIRST_QUOTE_NUMBER - 1,
  });

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const counter = await client.fetch<CounterSnapshot | null>(
      `*[_id == $id][0]{ _rev, prefix, lastNumber }`,
      { id: QUOTE_COUNTER_ID },
    );
    if (!counter?._rev) {
      // Seeded a moment ago but not readable yet (or deleted mid-flight).
      await jitteredDelay(attempt);
      continue;
    }
    const last =
      typeof counter.lastNumber === 'number' && Number.isFinite(counter.lastNumber)
        ? Math.floor(counter.lastNumber)
        : DEFAULT_FIRST_QUOTE_NUMBER - 1;
    const next = last + 1;
    const prefix =
      typeof counter.prefix === 'string' && counter.prefix.length > 0
        ? counter.prefix
        : DEFAULT_QUOTE_PREFIX;
    try {
      await client
        .patch(QUOTE_COUNTER_ID)
        .ifRevisionId(counter._rev)
        .set({ lastNumber: next })
        .commit();
      return { number: next, quoteNumber: `${prefix}${next}` };
    } catch (err) {
      // Revision conflict (another allocation won) or a transient API error -
      // both are retried with fresh state. A failed commit consumed nothing.
      lastError = err;
      await jitteredDelay(attempt);
    }
  }
  throw new QuoteNumberAllocationError(
    `Could not allocate a quote number after ${MAX_ATTEMPTS} attempts. ` +
      `No number was issued - try again. (${lastError instanceof Error ? lastError.message : 'unknown error'})`,
  );
}
