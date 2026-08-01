import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { validateFiles } from '@/components/forms/attachment-limits';
import { getClientIp, createRateLimiter } from '@/lib/api/rate-limit';
import { verifyTurnstile } from '@/lib/api/turnstile';
import { sendBuiltEmail } from '@/lib/email/gmail-smtp';
import {
  readFileBuffers,
  toEmailAttachments,
  uploadAttachmentRefs,
  type FileBuffer,
} from '@/lib/leads/attachments';
import { DEFAULT_LEAD_RECIPIENT } from '@/lib/leads/landing-lead';
import { buildQuoteNotification } from '@/lib/leads/quote-lead';
import { isQuoteExpired } from '@/lib/quotes/quote-display';
import { quoteCustomerUrl } from '@/lib/quotes/quote-link';
import {
  decideViewHandling,
  isCustomerActionKind,
  validateQuoteComment,
  type CustomerActionKind,
} from '@/lib/quotes/quote-response';
import { computeQuoteTotals, formatUsd } from '@/lib/quotes/quote-totals';
import { isQuoteToken } from '@/lib/quotes/token';
import { QUOTES_TAG, quoteTag } from '@/lib/sanity/cache-tags';
import { getQuoteForResponse, type QuoteForResponse } from '@/lib/sanity/queries/quotes';
import { getSanityWriteClient } from '@/lib/sanity/write-client';

/**
 * The customer's response to a quote (Q-150): accept, request a change, or the
 * automatic "the link was opened" signal.
 *
 * WHAT THIS ROUTE NEVER DOES
 *
 *   - It never patches or overwrites the quote document. Every response is a
 *     NEW append-only `quoteResponse` document. A Studio publish replaces the
 *     published document wholesale, so an acceptance stored on the quote would
 *     be silently erased by Patrick's next publish from a draft he opened
 *     before it arrived. This is the single structural rule of the module
 *     (Q-110, proven again by the clobber test in the Q-150 verification).
 *   - It never trusts a recipient, a quote id, a price or a total from the
 *     browser. The ONLY thing the client sends that matters is the token, and
 *     everything else is re-derived from the published quote server-side.
 *
 * THE ORDERING RULE: the response record is written FIRST and the notification
 * email is sent afterwards, non-fatally. Losing a customer's acceptance because
 * an SMTP call timed out would be the worst failure this module could have, so
 * a failed email logs loudly and the customer still gets a success.
 *
 * `quoteResponse` is deliberately NOT in the Sanity webhook Filter: this route
 * revalidates the affected quote tag itself, immediately after the write, so a
 * webhook delivery would be a redundant round trip plus one more manual Filter
 * step that can be forgotten (the silent-failure class that has already bitten
 * `faq` and `brand` on this project).
 */

export const runtime = 'nodejs';
// Never prerendered or cached: it writes. This is an API route with no render
// path, so it cannot affect the staticness of /quote/<token> or anything else.
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com';

/**
 * Rate limiting, revised in Q-155 after the Q-150 verification run refused a
 * legitimate acceptance.
 *
 * THE PROBLEM WITH THE FIRST VERSION. There was one action bucket of 5 per hour
 * per IP, checked BEFORE any validation. So every rejected attempt cost the
 * customer the same as a completed one: attach a 12MB logo (rejected), try a
 * different file (rejected), submit a change request with an empty box
 * (rejected), and four fifths of the allowance is gone before a single valid
 * submission. Refusing the attempt that finally gets it right is the worst
 * possible moment to fail, and it punishes exactly the customer who is trying
 * honestly rather than the one abusing the endpoint.
 *
 * THE SHAPE NOW. Attempts and successes are counted separately, because they
 * mean different things:
 *
 *   - ATTEMPTS (`attemptLimiter`, 30/hour per IP, checked early) exist only to
 *     stop someone hammering the endpoint. Being wrong is not abuse, so the
 *     ceiling is high enough that no honest customer can reach it while still
 *     capping a flood.
 *   - SUCCESSES (`submitLimiter`, 10/hour per IP AND QUOTE, checked immediately
 *     before the write) cap how many records one customer can actually put on
 *     one quote. This is the number that matters, and it is only ever spent by
 *     a submission that passed expiry, comment, file and CAPTCHA validation.
 *
 * WHY THE SUBMIT KEY INCLUDES THE TOKEN. Keying on IP alone means one office
 * behind a single NAT address shares one budget across unrelated quotes, so one
 * busy customer can silently refuse another. Adding the token makes different
 * quotes independent, and a token is not guessable, so it cannot be used to
 * widen the limit.
 *
 * VIEWS get the same per-IP-and-quote key for the same NAT reason, and their
 * own bucket: the beacon fires on every page load, so it must never be able to
 * exhaust the allowance a customer needs in order to press Accept. The 30
 * minute record debounce means almost all of these do no work at all.
 *
 * HONEST LIMITATION, unchanged: the store is per serverless instance and is
 * lost on a cold start, so this is spam damping and not a security boundary.
 * The durable protections are the unguessable token, the honeypot, Turnstile,
 * and server-side validation.
 */
const attemptLimiter = createRateLimiter({ max: 30, windowMs: 60 * 60 * 1000 });
const submitLimiter = createRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 });
const viewLimiter = createRateLimiter({ max: 20, windowMs: 60 * 60 * 1000 });

/** Per customer AND per quote, so unrelated quotes never share an allowance. */
function perQuoteKey(ip: string, token: string): string {
  return `${ip}|${token}`;
}

/**
 * The one message a rate-limited customer sees. It always names a way out,
 * and the page adds the rep's email address underneath it, so nobody is ever
 * left at a dead end because of a counter.
 */
function tooManyRequests(): NextResponse {
  return NextResponse.json(
    {
      error:
        'That is a few too many attempts in a short time. Please wait a few minutes and try again, or email your contact and we will take it from there.',
    },
    { status: 429 },
  );
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * One answer for "no such quote", used for an unknown token, a malformed
 * token, an empty token and a token whose quote is unpublished or deleted.
 * Same status and same wording in every case, so the response cannot be used
 * to test whether a given token exists.
 */
function notFound(): NextResponse {
  return NextResponse.json({ error: 'This quote link is no longer available.' }, { status: 404 });
}

/** Company, else contact name, else the email, else nothing. */
function customerLabel(quote: QuoteForResponse): string {
  return (
    quote.customerCompany?.trim() ||
    quote.customerName?.trim() ||
    quote.customerEmail?.trim() ||
    ''
  );
}

/** Where a notification goes: the quote's own rep, else the site default. */
function notificationRecipient(quote: QuoteForResponse): string {
  const rep = quote.repEmail?.trim();
  if (rep && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rep)) return rep;
  return process.env.LEAD_EMAIL_TO || DEFAULT_LEAD_RECIPIENT;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Honeypot - silently accept, so a bot learns nothing from the answer.
  if (str(formData.get('website')).length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const token = str(formData.get('token'));
  const kindRaw = str(formData.get('kind'));

  // A malformed token is rejected BEFORE any Sanity call, which also keeps
  // junk out of the cache-tag space (only 32-lowercase-hex ever builds a tag).
  if (!isQuoteToken(token)) return notFound();

  const ip = getClientIp(request);
  const isView = kindRaw === 'viewed';

  if (!isView && !isCustomerActionKind(kindRaw)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  // The FLOOD guard only. A deliberate action spends its real allowance much
  // later, immediately before the write, so an attempt the route itself
  // rejects (bad file, empty comment, expired quote) does not cost the
  // customer the submission they are about to get right.
  if (isView) {
    if (viewLimiter.isRateLimited(perQuoteKey(ip, token))) return tooManyRequests();
  } else if (attemptLimiter.isRateLimited(ip)) {
    return tooManyRequests();
  }

  const quote = await getQuoteForResponse(token);
  if (!quote) return notFound();

  const now = new Date();
  const sanity = getSanityWriteClient();

  // ---- The automatic view signal -----------------------------------------
  //
  // Deliberately NOT CAPTCHA'd: it fires without a human touching anything, so
  // there is no interaction to challenge. It is protected by the rate limit
  // above and by the persisted debounce below, and the worst a forged view can
  // achieve is one extra "the link was opened" email per notify window.
  if (isView) {
    const decision = decideViewHandling({
      lastViewedAt: quote.lastViewedAt,
      sentAt: quote.sentAt,
      now,
    });

    if (!decision.record) {
      return NextResponse.json({ ok: true, recorded: false });
    }
    if (!sanity) {
      console.error('[quote-response] Sanity write client unavailable - view not recorded.');
      return NextResponse.json({ ok: true, recorded: false });
    }

    try {
      await sanity.create({
        _type: 'quoteResponse',
        quote: { _type: 'reference', _ref: quote._id, _weak: true },
        ...(quote.quoteNumber?.trim() ? { quoteNumber: quote.quoteNumber.trim() } : {}),
        kind: 'viewed',
        createdAt: now.toISOString(),
        context: 'Opened the quote page',
      });
    } catch (err) {
      // A failed view record is genuinely minor: nothing the customer did is
      // lost, so it logs and the beacon reports success rather than retrying.
      console.error('[quote-response] failed to record a view (non-fatal)', err);
      return NextResponse.json({ ok: true, recorded: false });
    }

    // NO revalidation here, deliberately. The customer page shows only
    // deliberate actions (the projection filters views out), so a view changes
    // nothing it renders - busting the tag would regenerate an identical page
    // and cost an ISR write on every visit. Patrick's Studio panel queries
    // Sanity directly and is unaffected by the page cache.

    if (decision.notify) {
      await notify(quote, token, 'viewed', { at: now.toISOString(), viewNote: null });
    }
    return NextResponse.json({ ok: true, recorded: true, notified: decision.notify });
  }

  // ---- A deliberate action: accept, or request a change -------------------
  const kind = kindRaw as CustomerActionKind;

  // Expiry is decided HERE, at submit time, not from what the page believed
  // when it loaded. A page opened yesterday evening and submitted this morning
  // is the realistic case, and accepting an expired price silently would put
  // Patrick on the hook for it.
  if (isQuoteExpired(quote.expiryDate, now)) {
    return NextResponse.json(
      {
        error:
          'This quote has passed its expiry date, so we cannot accept it online. Please email your contact and we will send you an updated quote right away.',
        expired: true,
      },
      { status: 409 },
    );
  }

  const { comment, error: commentError } = validateQuoteComment(kind, formData.get('comment'));
  if (commentError) {
    return NextResponse.json(
      { error: commentError, fields: { comment: commentError } },
      { status: 400 },
    );
  }

  // Attachments: the SAME limits and the same server-side re-validation as
  // every other form on the site (components/forms/attachment-limits.ts).
  const rawFiles = formData
    .getAll('files')
    .filter((v): v is File => v instanceof File && v.size > 0);
  const fileError = validateFiles(rawFiles);
  if (fileError) {
    return NextResponse.json(
      { error: fileError, fields: { files: fileError } },
      { status: 400 },
    );
  }

  const captchaOk = await verifyTurnstile(
    str(formData.get('cf-turnstile-response')),
    ip,
    'quote-response',
  );
  if (!captchaOk) {
    return NextResponse.json(
      { error: 'Could not verify you are human. Please try again.' },
      { status: 400 },
    );
  }

  if (!sanity) {
    console.error(
      '[quote-response] Sanity write client unavailable - REFUSING the response so the customer is not told it was saved.',
    );
    return NextResponse.json(
      { error: 'We could not save your response. Please email your contact and we will pick it up.' },
      { status: 503 },
    );
  }

  // The REAL allowance, spent here and nowhere else: everything above has
  // passed (expiry, comment, files, CAPTCHA), so this request is going to be
  // recorded. Checked before the attachments are uploaded so a refused
  // submission never leaves orphaned assets behind.
  if (submitLimiter.isRateLimited(perQuoteKey(ip, token))) return tooManyRequests();

  // Bytes read ONCE and reused for the Sanity asset and the email attachment.
  const buffers = await readFileBuffers(rawFiles);
  const fileRefs = await uploadAttachmentRefs(sanity, buffers, 'quote-response');

  // THE RECORD IS THE PRIMARY JOB. Everything after this point is best effort.
  try {
    await sanity.create({
      _type: 'quoteResponse',
      quote: { _type: 'reference', _ref: quote._id, _weak: true },
      ...(quote.quoteNumber?.trim() ? { quoteNumber: quote.quoteNumber.trim() } : {}),
      kind,
      createdAt: now.toISOString(),
      ...(comment ? { comment } : {}),
      ...(fileRefs.length > 0 ? { files: fileRefs } : {}),
      context: kind === 'accepted' ? 'Accepted on the quote page' : 'Change requested on the quote page',
    });
  } catch (err) {
    console.error('[quote-response] FAILED TO SAVE A CUSTOMER RESPONSE', err);
    return NextResponse.json(
      { error: 'We could not save your response. Please email your contact and we will pick it up.' },
      { status: 500 },
    );
  }

  // Patrick's view and the customer's own page both follow from this.
  revalidateQuote(token);

  await notify(quote, token, kind, {
    at: now.toISOString(),
    comment,
    buffers,
  });

  return NextResponse.json({ ok: true, kind });
}

/**
 * Busts the quote's cache tags and its page. This is what replaces a webhook
 * delivery for `quoteResponse`: the write and the invalidation happen in the
 * same request, so Patrick's Studio panel and a returning customer both see
 * the response without waiting on anything external.
 */
function revalidateQuote(token: string): void {
  try {
    revalidateTag(QUOTES_TAG, 'max');
    const tag = quoteTag(token);
    if (tag) revalidateTag(tag, 'max');
    revalidatePath(`/quote/${token}`);
  } catch (err) {
    console.error('[quote-response] revalidation failed (non-fatal)', err);
  }
}

/**
 * Sends the notification, NEVER throwing. Called after the record exists, so a
 * mail failure costs an alert and not the customer's action; the log line is
 * deliberately loud because the record is now the only trace.
 */
async function notify(
  quote: QuoteForResponse,
  token: string,
  kind: 'viewed' | 'accepted' | 'revisionRequested',
  extras: { at: string; comment?: string | null; buffers?: FileBuffer[]; viewNote?: string | null },
): Promise<void> {
  try {
    const totals = computeQuoteTotals(quote.lineItems, quote.salesTax);
    const buffers = extras.buffers ?? [];
    const totalBytes = buffers.reduce((sum, f) => sum + f.buffer.byteLength, 0);
    // Gmail's ceiling is 25MB; the upload limits already cap a submission at
    // 20MB, so this only bites in the rare all-three-files-at-maximum case.
    const attachable = totalBytes > 0 && totalBytes <= 20 * 1024 * 1024;

    const email = buildQuoteNotification(kind, {
      quoteNumber: quote.quoteNumber,
      customerLabel: customerLabel(quote),
      grandTotal: formatUsd(totals.grandTotal),
      // Patrick's copy of the link is the CUSTOMER'S link, so he opens exactly
      // what they are looking at. It goes only to his own inbox.
      quoteUrl: quoteCustomerUrl(SITE_URL, token),
      at: extras.at,
      comment: extras.comment ?? null,
      attachmentNames: buffers.map((f) => f.filename),
      attachmentsInStudioOnly: buffers.length > 0 && !attachable,
      viewNote: extras.viewNote ?? null,
    });

    await sendBuiltEmail({
      to: notificationRecipient(quote),
      // A reply goes to the customer when we know their address, which is what
      // Patrick will want to do next in both action cases.
      ...(quote.customerEmail?.trim() ? { replyTo: quote.customerEmail.trim() } : {}),
      ...email,
      ...(attachable ? { attachments: toEmailAttachments(buffers) } : {}),
    });
  } catch (err) {
    console.error(
      `[quote-response] NOTIFICATION EMAIL FAILED for quote ${quote.quoteNumber || quote._id} (${kind}). The response IS saved in Sanity.`,
      err,
    );
  }
}
