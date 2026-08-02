import { NextResponse } from 'next/server';

import { createRateLimiter, getClientIp } from '@/lib/api/rate-limit';
import { renderQuotePdf } from '@/lib/quotes/pdf/render-quote-pdf';
import { isQuoteToken } from '@/lib/quotes/token';
import { getQuoteByToken } from '@/lib/sanity/queries/quotes';

/**
 * The downloadable quote PDF (Q-160): GET /api/quote-pdf/<token>
 *
 * WHAT THE BROWSER SENDS: the token, and nothing else that matters. The quote,
 * every price, the customer block and the rep block are re-read server-side
 * from the published document, exactly as the customer page does. There is no
 * request field a caller could use to change a number on the document.
 *
 * SAME DOOR AS THE PAGE. An unknown, malformed, empty or unpublished token gets
 * the same 404 the page gives for the same input (`getQuoteByToken` returns
 * null for all four and never throws), so this route cannot be used to test
 * whether a token exists. A malformed token is rejected before any Sanity call,
 * which also keeps junk out of the cache-tag space.
 *
 * AN EXPIRED QUOTE STILL DOWNLOADS, with the expiry stated on the document. A
 * customer must always be able to keep a copy of what they were quoted; refusing
 * the download of a price they already saw would be hostile, and the printed
 * page says plainly that it has expired.
 *
 * IT HAS NO RENDER PATH, so it cannot affect the staticness of /quote/<token>
 * or anything else. The page stays statically generated; this is where the work
 * happens.
 */

export const runtime = 'nodejs';
// It renders on demand for one private document: never prerendered, never
// cached by the framework.
export const dynamic = 'force-dynamic';
/**
 * The Q-121 addendum measured a warm render at about 322 ms and a cold one at
 * about 678 ms on the deployed function, so 60 seconds is already enormous
 * headroom. The repo's only other long-budget route (the bulk import) sets 300
 * because it uploads dozens of assets; copying that here would only widen how
 * long a pathological request could hang before the platform cuts it off.
 */
export const maxDuration = 60;

/**
 * DOWNLOADING IS A NORMAL, REPEATABLE ACTION. A customer who saves the quote,
 * forwards it, loses the attachment and downloads it again is behaving exactly
 * as intended, so the allowance is deliberately generous - far higher than the
 * submission ceiling on the response route, which caps something that creates a
 * record. This is only here to stop a flood.
 *
 * Keyed per IP AND token for the same reason the response route is (Q-155): an
 * office behind one NAT address must not share one budget across unrelated
 * quotes. A token is unguessable, so it cannot be used to widen the limit.
 *
 * Same honest limitation as everywhere else: the store is per serverless
 * instance, so this is spam damping, not a security boundary. The durable
 * protection is the 128-bit token.
 */
const downloadLimiter = createRateLimiter({ max: 40, windowMs: 60 * 60 * 1000 });

/** One answer for every "no such quote", so the route reveals nothing. */
function notFound(): NextResponse {
  return NextResponse.json({ error: 'This quote link is no longer available.' }, { status: 404 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  if (!isQuoteToken(token)) return notFound();

  const ip = getClientIp(request);
  if (downloadLimiter.isRateLimited(`${ip}|${token}`)) {
    return NextResponse.json(
      {
        error:
          'That is a few too many downloads in a short time. Please wait a few minutes and try again, or email your contact and we will send you a copy.',
      },
      { status: 429 },
    );
  }

  const quote = await getQuoteByToken(token);
  if (!quote) return notFound();

  let rendered: { buffer: Buffer; fileName: string };
  try {
    rendered = await renderQuotePdf(quote, new Date());
  } catch (err) {
    // Loud, because the customer is shown a short message and pointed at their
    // browser's print option instead - so this log line is the only trace.
    console.error(
      `[quote-pdf] FAILED to render the PDF for quote ${quote.quoteNumber || quote._id}. The customer was offered the print fallback.`,
      err,
    );
    return NextResponse.json(
      { error: 'We could not build the PDF just now. Please try again in a moment.' },
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(rendered.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(rendered.buffer.byteLength),
      // The filename carries the quote number, so a saved or forwarded copy is
      // still identifiable weeks later. It is sanitized in quotePdfFileName -
      // a quote number is Patrick's free text and this is a response header.
      'Content-Disposition': `attachment; filename="${rendered.fileName}"`,
      // A private document must not sit in any shared cache, and a crawler that
      // reaches this URL is told the same thing next.config.ts tells it about
      // the page itself.
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
