# Q-160: Automated verification of the quote PDF, the status banner, and the lifecycle

Run: 2026-08-02T03:56:16.404Z. Target: https://dev.perfectimprints.com. Script: scripts/quick-quote/verify-q160.ts (verification only - no app code touched). Mode: apply.

The dataset is SHARED between staging and production. Every fixture quote used the `zz-test-quote-` id prefix and a `ZZ Test` label, every guard was re-checked against the stored document at the moment of deletion, and the quote counter was recorded before the run and restored exactly (values in the table). Tokens are never printed in full.

**Test emails go nowhere on purpose.** Every fixture rep address is on the reserved `.invalid` TLD, which can never be delivered to and never bounces into a real mailbox. Earlier runs on this project put bounce messages into Patrick's inbox; this is deliberate, not careless.

## Fixture arithmetic (independent literals - lib/quotes/quote-totals.ts is never imported here)

- 16 product lines, each 100 x $2.50 = $250.00; + $25.00 setup + $10.00 shipping = **$285.00** line total
- merchandise per line $275.00, so 16 x $275.00 = **$4,400.00**; shipping 16 x $10.00 = **$160.00**
- 1 charge line: 2 x $40.00 = **$80.00**
- subtotal (shipping excluded) = $4,400.00 + $80.00 = **$4,480.00**
- sales tax, typed on the quote, never calculated = **$45.25**
- **GRAND TOTAL = $4,480.00 + $160.00 + $45.25 = $4,685.25**
- expired fixture: 10 x $5.00 = **$50.00**, no setup, no shipping, no tax

The fixture is deliberately awkward: a 130-character product name (the spike's `flexBasis` trap), a 350-character description, a long line note, one image URL carrying `format=webp`, and one image URL on a host that does not resolve.

## Results

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| route: app/api/quote-pdf/[token]/route.ts exists | present | present | PASS |
| route: no underscore-prefixed or malformed segment in the path | none | none | PASS |
| route: nodejs runtime | set | set | PASS |
| route: force-dynamic (never prerendered, so it cannot affect a page) | set | set | PASS |
| route: a longer maxDuration is set (the bulk-import precedent) | a number | 60 | PASS |
| route: rate limited with the shared limiter (downloads are repeatable, so generously) | createRateLimiter used | createRateLimiter used | PASS |
| route: download allowance | (informational) | 40 per hour per IP and token | INFO |
| route: the token is validated before any Sanity call | isQuoteToken guard | isQuoteToken guard | PASS |
| route: resolves the quote SERVER-SIDE, trusting nothing else from the request | getQuoteByToken(token) | getQuoteByToken(token) | PASS |
| route: never patches or creates a document (a download writes nothing) | no mutation | no mutation | PASS |
| route: a private document is never put in a shared cache | Cache-Control private/no-store | Cache-Control private/no-store | PASS |
| route: tells crawlers the same thing the page does | X-Robots-Tag noindex | X-Robots-Tag noindex | PASS |
| route: a render failure returns a clean message, never a raw error | try/catch around the render | try/catch around the render | PASS |
| dependency: @react-pdf/renderer pinned to the exact version the spike validated | 4.5.1 | 4.5.1 | PASS |
| images: an undecodable format parameter is stripped from the URL | format deleted | format deleted | PASS |
| images: fetched with an EXPLICIT timeout, not left to the renderer | AbortSignal.timeout | AbortSignal.timeout | PASS |
| images: per-image timeout | (informational) | 3500 ms | INFO |
| images: fetched in parallel, so N slow images cost one wait and not N | Promise.all | Promise.all | PASS |
| images: the bytes are verified as JPEG or PNG by magic number | detectFormat present | detectFormat present | PASS |
| images: a failure resolves to null, so a missing photo never fails the download | returns null | returns null | PASS |
| layout: flexBasis 0 on the flexible cells (or a long name pushes the money off the page) | present | present | PASS |
| layout: the table header is fixed, so it repeats on every page | fixed header | fixed header | PASS |
| layout: rows are wrap={false}, so a line item never splits across a page | wrap={false} | wrap={false} | PASS |
| layout: a page number is printed | Page N of M | Page N of M | PASS |
| layout: no font file is registered (the built-in Helvetica, no binary asset) | no Font.register | no Font.register | PASS |
| logo: the document renders the real logo, not a text wordmark | QUOTE_PDF_LOGO used as an Image | QUOTE_PDF_LOGO used as an Image | PASS |
| withheld: the PDF document never references `sku` | absent | absent | PASS |
| withheld: the PDF document never references `sentAt` | absent | absent | PASS |
| withheld: the PDF document never references `customerEmail` | absent | absent | PASS |
| withheld: the PDF document never references `customerPhone` | absent | absent | PASS |
| withheld: the PDF document never references `customerAddress` | absent | absent | PASS |
| logo: the generated module lib/quotes/pdf/quote-pdf-logo.ts exists | present | present | PASS |
| logo: it decodes to a real PNG (the renderer cannot use an SVG) | PNG magic bytes | PNG, 36.2 KB | PASS |
| logo: it is inlined, not read from disk at request time | no fs read | no fs read | PASS |
| island: no useSearchParams (the silent prerender killer) | absent | absent | PASS |
| button: the PDF control calls the real route | /api/quote-pdf/ | /api/quote-pdf/ | PASS |
| button: a working state is shown while the PDF is generated | Preparing your PDF | Preparing your PDF | PASS |
| button: a failure points at the browser print option | print fallback offered | print fallback offered | PASS |
| buttons: the two response controls are gated only by EXPIRY, never by the last action | disabled={expired} twice, nothing keyed on the status | 2 expiry gate(s), no status gate | PASS |
| banner: the status panel says the customer can still do something else | follow-up line present | follow-up line present | PASS |
| banner: it carries real visual weight (a thick rule and a larger heading) | border-l-8 + text-lg | border-l-8 + text-lg | PASS |
| print: the print stylesheet is retained as the fallback | present | present | PASS |
| page: still reads no searchParams / cookies / headers | none present | none present | PASS |
| page: does NOT import the PDF renderer (it must not enter the page bundle) | absent | absent | PASS |
| webhook: no new document type, so no Filter change (quote was wired in Q-110) | the 'quote' branch already exists | the 'quote' branch already exists | PASS |
| sitemap: no quote route and no PDF route anywhere | absent | absent | PASS |
| local render: produces a real PDF | %PDF- header | %PDF- header | PASS |
| local render | (informational) | 1545 ms, 51734 bytes, 2 page(s) | INFO |
| local render: 17 lines produce more than one page | 2 or more pages | 2 page(s) | PASS |
| local render: the table header repeats on every page | at least 2 | 2 occurrence(s) | PASS |
| local render: every line item name is on the document | 0 missing | 0 missing | PASS |
| local render: the hand-computed grand total is on the document | $4,685.25 | $4,685.25 | PASS |
| local render: a 130-character product name does not push anything off the page | every text run starts between 0 and 576 pt | 36.0 to 542.5 pt | PASS |
| local render: internal label is NOT printed | absent | absent | PASS |
| local render: the Geiger item number is NOT printed | absent | absent | PASS |
| local render: the sent-at date is NOT printed | absent | absent | PASS |
| preflight: the PDF route is live on the target | (informational) | probe answered 404 with the route's own message | INFO |
| counter: state BEFORE the run | (informational) | prefix="Q-" lastNumber=1003 | INFO |
| pdf: a published quote returns 200 | 200 | 200 | PASS |
| pdf: the content type is application/pdf | application/pdf | application/pdf | PASS |
| pdf: it is a real, openable PDF | %PDF- header | %PDF- header | PASS |
| pdf: the download filename carries the quote number | filename containing Q-1004 | attachment; filename="Quote-Q-1004-Perfect-Imprints.pdf" | PASS |
| pdf: shape | (informational) | 19222 bytes, 2 page(s), 2 decoded stream(s) | INFO |
| pdf: contains the quote number | Q-1004 | present | PASS |
| pdf: contains the customer company | ZZ Test Buyer Company Q160 | present | PASS |
| pdf: contains the rep name | ZZ Test Rep | present | PASS |
| pdf: EVERY line item name is present, including the 130-character one | 0 missing of 16 | 0 missing of 16 | PASS |
| pdf: the charge line is present | ZZ Test Art Fee | present | PASS |
| pdf: a product line total (100 x $2.50 + $25 + $10) | $285.00 | $285.00 | PASS |
| pdf: the charge line total (2 x $40.00) | $80.00 | $80.00 | PASS |
| pdf: the subtotal ($4,400 merchandise + $80 charge) | $4,480.00 | $4,480.00 | PASS |
| pdf: the shipping total (16 x $10.00) | $160.00 | $160.00 | PASS |
| pdf: the sales tax as typed | $45.25 | $45.25 | PASS |
| pdf: THE GRAND TOTAL ($4,480 + $160 + $45.25) | $4,685.25 | $4,685.25 | PASS |
| pdf: 17 lines produce more than one page | 2 or more pages | 2 page(s) | PASS |
| pdf: the table header repeats on every page | at least 2 | 2 occurrence(s) | PASS |
| pdf: every page is numbered | at least 2 | 2 page number(s) | PASS |
| pdf: a 130-character product name does not push anything off the page | every text run starts between 0 and 576 pt | 36.0 to 542.5 pt | PASS |
| withheld: the internal label is not in the PDF text | absent | absent | PASS |
| withheld: the customer's own email is not in the PDF text | absent | absent | PASS |
| withheld: the customer's own phone is not in the PDF text | absent | absent | PASS |
| withheld: the customer's own address is not in the PDF text | absent | absent | PASS |
| withheld: the sent-at date is not in the PDF text | absent | absent | PASS |
| withheld: the Geiger supplier item number is not in the PDF text | absent | absent | PASS |
| withheld: a /products/ link is not in the PDF text | absent | absent | PASS |
| timing: cold / warm-median / network baseline | (informational) | 1423 / 974 / 338 ms | INFO |
| timing: a warm download stays under 10 seconds even with a dead image on the quote | under 10000 ms | 974 ms | PASS |
| images: a quote carrying a dead image URL still produces a valid PDF | valid PDF | valid PDF | PASS |
| expired: the PDF still downloads | 200 | 200 | PASS |
| expired: the document says so | passed its expiry date | stated | PASS |
| expired: the price is still on it | $50.00 | $50.00 | PASS |
| expired: the expiry date is labelled as expired, not as valid until | Expired: | Expired: | PASS |
| reject: unknown (well-formed) token answered 404 | 404 | 404 | PASS |
| reject: malformed token answered 404 | 404 | 404 | PASS |
| reject: tag-hostile token answered 404 | 404 | 404 | PASS |
| reject: an empty token answers 404 (the route does not exist without one) | 404 | 404 | PASS |
| reject: unknown and malformed tokens are INDISTINGUISHABLE (same status, same message) | 1 distinct response | 1 distinct response(s) | PASS |
| STATICNESS: raw HTML carries the rendered quote, with NO client-side-render bailout | article present, no BAILOUT marker | article present, no marker | PASS |
| STATICNESS: "Accept this quote" is in the server-rendered HTML | present | present | PASS |
| STATICNESS: "Request a change" is in the server-rendered HTML | present | present | PASS |
| STATICNESS: "Download PDF" is in the server-rendered HTML | present | present | PASS |
| page: the grand total is still in the raw HTML | $4,685.25 | present | PASS |
| cleanup: fixtures AND their responses deleted | all zz-test-quote-* gone | 2 deleted | PASS |
| cleanup: zero test quotes remain | 0 | 0 | PASS |
| cleanup: zero test RESPONSES remain | 0 | 0 | PASS |
| counter: state AFTER restore | (informational) | prefix="Q-" lastNumber=1003 (restored to prefix="Q-" lastNumber=1003) | INFO |
| counter: restored EXACTLY to its before-run state | prefix="Q-" lastNumber=1003 | prefix="Q-" lastNumber=1003 | PASS |

## Timings

- Local render (this machine, includes the remote image fetch): 1545 ms, 51734 bytes
- Deployed cold (first request, includes the dead-image timeout): 1423 ms round trip
- Deployed warm: 1184, 824, 974, 891 ms round trip (median 974 ms)
- Baseline round trip to a no-work route on the same deployment (median of 4, first discarded): 338 ms
- So generating and sending the PDF costs roughly 636 ms warm and 1085 ms cold on top of the network. Everything else in the numbers above is latency from this location, which a customer in the United States does not pay.

## Notes / findings

- A sample PDF from the local render was written to C:\Users\aliha\AppData\Local\Temp\pi-quote-pdf-q160\q160-sample.pdf (outside the repo, nothing untracked is left behind). Open it to judge whether it reads as a document a buyer would forward.
- The LOCAL RENDER checks read the current working tree; the DEPLOYED checks read whatever is live on the target. If a change has landed since the last deploy the two will legitimately differ (a different PDF byte size is the usual tell), so redeploy and re-run before reading the deployed numbers as current.
- The 16-line fixture deliberately carries one DEAD image URL and one format=webp URL, so every timing above is a worst case rather than a clean one. A real quote with working photos is faster.
- The webp-format image URL on line 1 and the dead host on line 2 are both in the live fixture, so "a broken image still renders" and "a webp URL still renders its image" are proved by the same response that carried every line and the correct grand total. Whether the photo is visually present is on the manual list - text extraction cannot see a picture.

## What a script cannot prove (for Ali, after the single deploy)

None of the following are marked passed; text extraction cannot see geometry, and a script has no inbox:

1. **Download a real quote's PDF and look at it.** Does it read as a document a buyer would forward to their boss? Are the product photos actually visible, and is the long product name wrapping inside its column rather than pushing the money columns sideways?
2. **Download one on a phone.** Confirm it opens in the phone's own PDF viewer and is readable.
3. **Confirm the status banner is the first thing you notice** after accepting or requesting a change, and that all three buttons still work afterwards.
4. **Carried over from Q-155 and still unconfirmed:** press Mark as sent, open the customer link, and confirm the "opened" email arrives. Then refresh several times and confirm no flood.
