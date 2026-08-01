import 'server-only';

import { generateQuoteToken } from '@/lib/quotes/token';
import { buildDraftQuote, type DraftQuoteSubmission } from '@/lib/quotes/quote-draft';
import { getProductQuoteSource } from '@/lib/sanity/queries/product-pages';
import { getSanityWriteClient } from '@/lib/sanity/write-client';

/**
 * Creates the DRAFT quote that a "Get a Quote" submission earns (Q-150 part 6).
 *
 * THIS FUNCTION CANNOT THROW. That is its most important property and the
 * reason it is a separate module rather than inline code in the leads route: a
 * lead is revenue, a draft quote is a convenience, and losing the first because
 * of the second would be indefensible. Every failure path returns a result
 * object with `created: false` and logs; the caller carries on unconditionally.
 *
 * The three rules the draft itself obeys (no publish, no client prices, no
 * quote number) live in the pure lib/quotes/quote-draft.ts, which is where they
 * are tested. This module only does the parts that need the network: resolve
 * the product, generate a token, and write the document at a `drafts.` id.
 */

export interface DraftQuoteOutcome {
  created: boolean;
  /** A one-line note for the lead email, or null when there is nothing to say. */
  note: string | null;
  /** Anything Patrick should check before sending, appended to the note. */
  warnings: string[];
}

const NOT_CREATED: DraftQuoteOutcome = { created: false, note: null, warnings: [] };

/**
 * How long the lead is willing to wait for the draft.
 *
 * This runs inline, before the lead email, so that email can say a draft is
 * waiting. That ordering is only safe with a hard ceiling: without one, a hung
 * Sanity call would hold the visitor's submission open until the platform's own
 * function timeout, and a lead that times out is a lead lost. Eight seconds is
 * far more than the two round trips actually need.
 *
 * On a timeout the work is NOT cancelled - it may well finish and leave a
 * perfectly good draft in Studio. All that is lost is the mention in the email.
 */
const DRAFT_TIMEOUT_MS = 8000;

export async function createDraftQuoteFromSubmission(input: {
  productSlug: string;
  submission: DraftQuoteSubmission;
  /** The address the lead notification went to, recorded as the quote's rep. */
  repEmail?: string | null;
}): Promise<DraftQuoteOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<DraftQuoteOutcome>((resolvePromise) => {
      timer = setTimeout(() => {
        console.error(
          `[leads] draft quote creation exceeded ${DRAFT_TIMEOUT_MS}ms for product "${input.productSlug}" - carrying on with the lead. The draft may still land in Studio.`,
        );
        resolvePromise(NOT_CREATED);
      }, DRAFT_TIMEOUT_MS);
    });
    return await Promise.race([buildAndWrite(input), timeout]);
  } catch (err) {
    // Loud, because the lead succeeded and this is the only trace that the
    // convenience half of the flow did not.
    console.error(
      `[leads] DRAFT QUOTE CREATION FAILED for product "${input.productSlug}" (non-fatal - the lead was captured normally).`,
      err,
    );
    return NOT_CREATED;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function buildAndWrite(input: {
  productSlug: string;
  submission: DraftQuoteSubmission;
  repEmail?: string | null;
}): Promise<DraftQuoteOutcome> {
  try {
    const sanity = getSanityWriteClient();
    if (!sanity) return NOT_CREATED;

    // The product is the ONLY trustworthy source of a price here (the form
    // posts a formatted display string, never a number). No product, no draft.
    const product = await getProductQuoteSource(input.productSlug);
    if (!product) return NOT_CREATED;

    const { doc, warnings } = buildDraftQuote({
      submission: input.submission,
      product,
      token: generateQuoteToken(),
      repEmail: input.repEmail,
      now: new Date(),
    });

    // A `drafts.` id is what makes this a draft. An unreviewed quote must never
    // be reachable at a live customer link, and the customer page reads through
    // a `perspective: 'published'` client, so this token simply 404s until
    // Patrick publishes it. `crypto.randomUUID` matches the id shape Sanity
    // generates for a Studio-created document.
    // `_type` is repeated after the spread only so TypeScript can see it: the
    // builder returns a plain record, and the client's create() requires a
    // literal `_type`. Same value either way.
    await sanity.create({ ...doc, _id: `drafts.${crypto.randomUUID()}`, _type: 'quote' });

    return {
      created: true,
      note: 'A draft quote has been started for you in Sanity Studio. Open Quotes, assign a quote number, check the pricing, then publish it to get the customer link.',
      warnings,
    };
  } catch (err) {
    // Loud, because the lead succeeded and this is the only trace that the
    // convenience half of the flow did not.
    console.error(
      `[leads] DRAFT QUOTE CREATION FAILED for product "${input.productSlug}" (non-fatal - the lead was captured normally).`,
      err,
    );
    return NOT_CREATED;
  }
}
