# Q-160: Automated verification of the quote PDF, the status banner, and the lifecycle

Extended by **Q-200** (Patrick's two confirmed changes): a new quote's rep phone defaults to the main company line, and the customer's full block (email, phone, address) is shown on the page AND in the PDF. A third fixture carrying only the required email proves the optional fields render cleanly when they are blank.

Run: 2026-08-07T03:23:42.415Z. Target: https://dev.perfectimprints.com. Script: scripts/quick-quote/verify-q160.ts (verification only - no app code touched). Mode: dry run (offline checks + a local render).

Nothing was written to Sanity in this mode. The safety machinery is still in the script and is used by `--apply`: the `zz-test-quote-` id prefix, a `ZZ Test` label, a guard re-checked against the stored document at the moment of deletion, cleanup in a finally that survives a crash, and the quote counter recorded before the run and restored exactly.

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
| pdf source: the customer's email is rendered | referenced | referenced | PASS |
| pdf source: the customer's phone is rendered | referenced | referenced | PASS |
| pdf source: the customer's address lines is rendered | referenced | referenced | PASS |
| pdf source: the address is printed one line per line, not as one blob | customerAddressLines.map | customerAddressLines.map | PASS |
| layout: the party boxes are flexBasis 0, so a long address wraps inside its own block | present on the party style | present on the party style | PASS |
| address: the split rule lives once, in lib/quotes/quote-display.ts | quoteAddressLines exported | quoteAddressLines exported | PASS |
| address: the PDF model uses the shared rule rather than its own split | quoteAddressLines imported | quoteAddressLines imported | PASS |
| address: the web page uses the shared rule rather than its own split | quoteAddressLines imported | quoteAddressLines imported | PASS |
| page source: the customer's email is a mailto link | mailto:${customerEmail} | mailto:${customerEmail} | PASS |
| page source: the customer's phone is a tel link | tel:${customerPhone} | tel:${customerPhone} | PASS |
| page source: the address block keeps its stored line breaks | whitespace-pre-line | whitespace-pre-line | PASS |
| rep phone: the default prefers the main company line over the contact list | mainPhone before contactPhone | mainPhone before contactPhone | PASS |
| rep phone: the last-resort fallback is the main company line | 800-773-9472 | 800-773-9472 | PASS |
| rep phone: it is an initialValue, so no EXISTING quote is rewritten | initialValue only | initialValue only | PASS |
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
| local render | (informational) | 1527 ms, 51932 bytes, 2 page(s) | INFO |
| local render: 17 lines produce more than one page | 2 or more pages | 2 page(s) | PASS |
| local render: the table header repeats on every page | at least 2 | 2 occurrence(s) | PASS |
| local render: every line item name is on the document | 0 missing | 0 missing | PASS |
| local render: the hand-computed grand total is on the document | $4,685.25 | $4,685.25 | PASS |
| local render: a 130-character product name does not push anything off the page | every text run starts between 0 and 576 pt | 36.0 to 542.5 pt | PASS |
| local render: internal label is NOT printed | absent | absent | PASS |
| local render: the Geiger item number is NOT printed | absent | absent | PASS |
| local render: the sent-at date is NOT printed | absent | absent | PASS |
| local render: the customer's email IS printed | present | present | PASS |
| local render: the customer's phone IS printed | present | present | PASS |
| local render: address line 1 IS printed | present | present | PASS |
| local render: address line 2 IS printed | present | present | PASS |
| local render: address line 3 IS printed | present | present | PASS |
| local render (no phone, no address): produces a real PDF | %PDF- header | %PDF- header | PASS |
| local render (no phone, no address): the email that IS set still prints | zz-test-minimal-q200@example.invalid | present | PASS |
| local render (no phone, no address): the quote still prices correctly | $60.00 | $60.00 | PASS |
| local render (no phone, no address): the word undefined does not appear | absent | absent | PASS |
| local render (no phone, no address): a stray null does not appear | absent | absent | PASS |
| local render (no phone, no address): a NaN value does not appear | absent | absent | PASS |
| local render (no phone, no address): a stray spaced comma does not appear | absent | absent | PASS |
| local render (no phone, no address): a doubled comma does not appear | absent | absent | PASS |
| local render (no phone, no address): the no-customer fallback line is not used | absent | absent | PASS |

## Timings

- Local render (this machine, includes the remote image fetch): 1527 ms, 51932 bytes

## Notes / findings

- A sample PDF from the local render was written to C:\Users\aliha\AppData\Local\Temp\pi-quote-pdf-q160\q160-sample.pdf (outside the repo, nothing untracked is left behind). Open it to judge whether it reads as a document a buyer would forward.

## What this run did NOT cover

This was a dry run, so nothing was written to Sanity and the DEPLOYED route was never called. The local render above proves the document itself: it exercises the real model, the real image fetch (including a dead host and a `format=webp` Geiger URL), and the real renderer, on the real awkward fixture.

Still to run, once the branch is deployed:

```
pnpm tsx scripts/quick-quote/verify-q160.ts --apply
```

That adds: the deployed route answering 200 with `application/pdf` and the right download filename, deployed cold and warm timings with the network baseline separated out, the expired quote still downloading, unknown / malformed / empty tokens all answering an identical 404, and the quote page still being static with all three buttons in the raw HTML. It refuses to write anything if the route is not live on the target yet.

## What a script cannot prove (for Ali, after the single deploy)

None of the following are marked passed; text extraction cannot see geometry, and a script has no inbox:

1. **Download a real quote's PDF and look at it.** Does it read as a document a buyer would forward to their boss? Are the product photos actually visible, and is the long product name wrapping inside its column rather than pushing the money columns sideways?
2. **Download one on a phone.** Confirm it opens in the phone's own PDF viewer and is readable.
3. **Confirm the status banner is the first thing you notice** after accepting or requesting a change, and that all three buttons still work afterwards.
4. **Carried over from Q-155 and still unconfirmed:** press Mark as sent, open the customer link, and confirm the "opened" email arrives. Then refresh several times and confirm no flood.
