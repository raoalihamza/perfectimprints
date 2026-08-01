/**
 * The rules for a customer's response to a quote (Q-150).
 *
 * PURE + CLIENT-SAFE (no fs, no Sanity, no `server-only`, no React), the same
 * discipline as lib/quotes/quote-totals.ts and lib/quotes/quote-display.ts. The
 * customer's buttons, the write route, and the Studio all decide the same
 * things through THIS module, so "is this comment required", "has this quote
 * expired for the purpose of accepting it", and "should Patrick be emailed
 * about this view" can never mean two different things on two surfaces.
 *
 * Nothing here reads a price and nothing here throws.
 */

/** The three things a customer can do, matching the quoteResponse schema. */
export const QUOTE_RESPONSE_KINDS = ['viewed', 'accepted', 'revisionRequested'] as const;
export type QuoteResponseKind = (typeof QUOTE_RESPONSE_KINDS)[number];

/** The two kinds a human deliberately triggers (a view is automatic). */
export const CUSTOMER_ACTION_KINDS = ['accepted', 'revisionRequested'] as const;
export type CustomerActionKind = (typeof CUSTOMER_ACTION_KINDS)[number];

/**
 * How much a customer may write in one comment.
 *
 * 2000 characters is several paragraphs: comfortably more than any real "please
 * change the quantity to 500 and switch the logo to the white version", and
 * short enough that the notification email and the Studio panel stay readable.
 * Over-length is REJECTED with a clear message rather than silently truncated -
 * quietly cutting a customer's change request in half would lose the part that
 * mattered and nobody would ever know.
 */
export const QUOTE_COMMENT_MAX_CHARS = 2000;

/**
 * How long after a recorded view another view of the SAME quote is ignored
 * entirely (no document written, no email). This is what stops a refresh, a
 * back-button, or a customer re-opening the page three times while deciding
 * from filling the response log with noise.
 */
export const VIEW_RECORD_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/**
 * How long after a recorded view Patrick is emailed again about the same quote.
 * Deliberately much longer than the record window: the response log can afford
 * a row per session, an inbox cannot. Six hours means at most a "morning" and
 * an "afternoon" alert for a customer who keeps coming back to the same quote,
 * while a genuine re-open the next day still tells him something.
 */
export const VIEW_NOTIFY_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

export function isQuoteResponseKind(value: unknown): value is QuoteResponseKind {
  return typeof value === 'string' && (QUOTE_RESPONSE_KINDS as readonly string[]).includes(value);
}

export function isCustomerActionKind(value: unknown): value is CustomerActionKind {
  return typeof value === 'string' && (CUSTOMER_ACTION_KINDS as readonly string[]).includes(value);
}

/** Trimmed non-empty string, or null. */
function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface CommentValidation {
  /** The comment to store, or null when the customer left it blank. */
  comment: string | null;
  /** A plain-English message for the customer, or null when the input is fine. */
  error: string | null;
}

/**
 * Validates the comment for a given action.
 *
 * A revision request MUST carry a comment: "please change something" with no
 * indication of what is useless to Patrick and forces a second round trip with
 * the customer. Accepting may carry one or not.
 */
export function validateQuoteComment(
  kind: CustomerActionKind,
  raw: unknown,
): CommentValidation {
  const comment = clean(raw);
  if (kind === 'revisionRequested' && !comment) {
    return {
      comment: null,
      error: 'Tell us what you would like changed so we can update the quote.',
    };
  }
  if (comment && comment.length > QUOTE_COMMENT_MAX_CHARS) {
    return {
      comment: null,
      error: `Please keep your message under ${QUOTE_COMMENT_MAX_CHARS.toLocaleString('en-US')} characters, or email us the details instead.`,
    };
  }
  return { comment, error: null };
}

// ---------------------------------------------------------------------------
// View debounce
// ---------------------------------------------------------------------------

/** Milliseconds since an ISO timestamp, or null when it is missing/unparseable. */
export function millisSince(iso: unknown, now: Date): number | null {
  const text = clean(iso);
  if (!text) return null;
  const then = Date.parse(text);
  if (!Number.isFinite(then)) return null;
  const delta = now.getTime() - then;
  return delta >= 0 ? delta : 0;
}

export interface ViewDecision {
  /** Write a `viewed` quoteResponse document. */
  record: boolean;
  /** Email Patrick that the link was opened. */
  notify: boolean;
  /** Why, in one phrase, for the route's log and the verification script. */
  reason: string;
}

export interface ViewDecisionInput {
  /** `createdAt` of the newest existing `viewed` response, if any. */
  lastViewedAt?: unknown;
  /**
   * The quote's `sentAt`. A quote that has never been marked as sent has not
   * reached a customer, so an opener is almost certainly Patrick checking his
   * own work: record it, but do not put an alert in his inbox about himself.
   */
  sentAt?: unknown;
  now: Date;
}

/**
 * Whether this page open should be recorded, and whether it should be emailed.
 *
 * The windows are checked against a timestamp PERSISTED IN SANITY, never against
 * per-instance memory: serverless instances recycle constantly, so an in-memory
 * dedupe would let a refresh through as soon as the request landed on a cold
 * instance, which is exactly the flood this is here to prevent.
 */
export function decideViewHandling(input: ViewDecisionInput): ViewDecision {
  const since = millisSince(input.lastViewedAt, input.now);
  const neverSent = !clean(input.sentAt);

  if (since !== null && since < VIEW_RECORD_WINDOW_MS) {
    return { record: false, notify: false, reason: 'repeat view inside the record window' };
  }
  if (neverSent) {
    return { record: true, notify: false, reason: 'quote not marked as sent yet (likely your own preview)' };
  }
  if (since !== null && since < VIEW_NOTIFY_WINDOW_MS) {
    return { record: true, notify: false, reason: 'recorded, inside the notify window' };
  }
  return { record: true, notify: true, reason: since === null ? 'first recorded view' : 'first view outside the notify window' };
}

// ---------------------------------------------------------------------------
// What the returning customer is told
// ---------------------------------------------------------------------------

export interface StoredResponse {
  kind?: unknown;
  createdAt?: unknown;
  comment?: unknown;
}

export interface LatestActionSummary {
  kind: CustomerActionKind;
  createdAt: string | null;
  comment: string | null;
}

/**
 * The most recent deliberate action on a quote, which is what the page shows a
 * returning customer so they are not left wondering whether their acceptance
 * landed, and do not send it twice.
 *
 * Views are ignored: telling someone "you opened this page" is noise. A quote
 * can be responded to MORE THAN ONCE on purpose (request a change, Patrick
 * revises, accept later), so this reports the LATEST action rather than locking
 * the page after the first one.
 */
export function latestCustomerAction(
  responses: StoredResponse[] | null | undefined,
): LatestActionSummary | null {
  if (!Array.isArray(responses)) return null;
  let best: LatestActionSummary | null = null;
  let bestTime = -Infinity;
  for (const entry of responses) {
    if (!entry || !isCustomerActionKind(entry.kind)) continue;
    const createdAt = clean(entry.createdAt);
    // An entry with no usable timestamp still counts, it just sorts last.
    const time = createdAt ? Date.parse(createdAt) : NaN;
    const rank = Number.isFinite(time) ? time : -Infinity;
    if (best === null || rank > bestTime) {
      best = { kind: entry.kind, createdAt, comment: clean(entry.comment) };
      bestTime = rank;
    }
  }
  return best;
}
