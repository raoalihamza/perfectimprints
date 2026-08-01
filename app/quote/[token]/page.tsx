import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { QuoteDocument } from '@/components/quote/QuoteDocument';
import { getQuoteByToken } from '@/lib/sanity/queries/quotes';

interface Props {
  params: Promise<{ token: string }>;
}

/**
 * The customer's private quote page (Q-140): /quote/<token>.
 *
 * READ ONLY for now. The accept / request-a-revision buttons, the view
 * notification, the PDF and the Send button arrive in later updates; this page
 * deliberately shows no dead controls, only how to reply (see QuoteDocument).
 *
 * HIDDEN, NOT AUTHENTICATED - exactly the gated-catalog model
 * (app/shop-by-theme/[slug]/catalog/page.tsx): an unguessable 128-bit token in
 * the path, `robots: index/follow false`, never in the sitemap, never linked
 * from a menu. Anyone holding the URL can open it, which is why this page also
 * sets `referrer: 'no-referrer'` (below) and why next.config.ts adds an
 * `X-Robots-Tag` header for this path.
 *
 * STATIC MODEL. The token is read from the PATH only - never searchParams,
 * cookies or headers, any of which is a Dynamic API that would flip the route
 * to per-request rendering (CLAUDE.md Section 13). The Sanity read is the
 * non-CDN tag-cached `getQuoteByToken` (QUOTES_TAG + quote:<token>,
 * `revalidate: false`, never `no-store`), and the webhook's existing `quote`
 * case busts both tags plus this path, so a Studio publish reaches the
 * customer in seconds without a redeploy.
 */

// A quote published after the last deploy must still open - Patrick creates
// quotes constantly and a 404 until the next build would be useless. Same
// dynamicParams pattern as /products/[slug].
export const dynamicParams = true;

// generateStaticParams returns NOTHING on purpose. Prebuilding is wrong here
// twice over: the token set changes every time Patrick writes a quote (so a
// baked list is stale the moment it ships), and baking private customer links
// into the deployment output turns a build artifact into a list of live quote
// URLs. Every quote page is generated on its first hit and then cached.
export function generateStaticParams(): { token: string }[] {
  return [];
}

// A DAILY revalidate rather than the `false` used elsewhere, for one concrete
// reason: whether a quote has expired is decided at render time, so a page
// generated before its expiry date would keep saying "Valid until ..." forever
// if it were only ever re-rendered by a Studio publish. 24 hours bounds how
// stale that notice can be. It costs nothing extra in Sanity reads - the
// tagged fetch inside getQuoteByToken has `revalidate: false`, so a scheduled
// re-render reuses the cached response and only the clock moves. The page is
// still statically generated and edge cached; the webhook still updates it in
// seconds on publish.
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const quote = await getQuoteByToken(token);
  if (!quote) return { robots: { index: false, follow: false }, referrer: 'no-referrer' };

  const number = quote.quoteNumber?.trim();
  return {
    title: { absolute: number ? `Quote ${number} | Perfect Imprints` : 'Your Quote | Perfect Imprints' },
    // Deliberately generic. Any richer description would be pulled into a link
    // preview by a chat app the moment the customer forwards the link.
    description: 'Your quotation from Perfect Imprints.',
    // Hidden from search, and Google is told not to follow links out of a
    // private document either - the gated catalog page form exactly.
    robots: { index: false, follow: false },
    // Without this, clicking any link on the quote sends the FULL private URL
    // (token included) to the destination site in the Referer header. The
    // site-wide default is strict-origin-when-cross-origin, which still leaks
    // the origin and, same-origin, the whole path. Metadata `referrer` is
    // per-route: it emits <meta name="referrer" content="no-referrer"> on this
    // page only and changes nothing anywhere else on the site.
    referrer: 'no-referrer',
  };
}

export default async function CustomerQuotePage({ params }: Props) {
  const { token } = await params;

  // getQuoteByToken returns null for an unknown, malformed, empty or
  // unpublished token and never throws, so all of those become one honest 404
  // rather than an error page or a blank page. (A malformed token also never
  // reaches the cache-tag space - the helper rejects it before the fetch.)
  const quote = await getQuoteByToken(token);
  if (!quote) notFound();

  // Evaluated per render, which with the daily revalidate above is what makes
  // the expiry notice appear on its own.
  return <QuoteDocument quote={quote} now={new Date()} />;
}
