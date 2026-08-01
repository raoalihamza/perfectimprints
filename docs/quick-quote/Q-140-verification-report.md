# Q-140: Automated verification of the customer quote page

Run: 2026-08-01T06:42:07.241Z. Target: https://dev.perfectimprints.com. Script: scripts/quick-quote/verify-q140.ts (verification only - no app code touched). Mode: apply. Dataset is SHARED between staging and production; every fixture used the zz-test-quote- prefix and was deleted; the quote counter was recorded before the run and restored exactly (values in the table). Tokens are never printed in full.

## Fixture arithmetic (independent literals, not derived from the app code)

- Geiger line: 250 x $3.20 = $800.00; + $50 setup + $40 shipping = $890.00 (merchandise $850.00)
- Own-product line: 100 x $5.50 = $550.00; + $25 setup = $575.00 (display name blank on purpose, so the referenced product title has to appear)
- Custom line: 10 x $12.00 = $120.00; + $15 shipping = $135.00 (merchandise $120.00)
- Charge line: 1 x $40.00 = $40.00
- Subtotal (merchandise): 850 + 575 + 120 + 40 = $1,585.00; shipping 40 + 15 = $55.00
- Sales tax as typed: $62.13 (added verbatim, never calculated)
- Grand total: 1585 + 55 + 62.13 = $1,702.13
- After the freshness edit (quantity 250 -> 300): line 1 = 300 x $3.20 + $50 + $40 = $1,050.00; subtotal $1,745.00; grand total $1,862.13

## Results

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| route: app/quote/[token]/page.tsx exists | present | present | PASS |
| route: reads no searchParams / cookies / headers (comments stripped) | none present | none present | PASS |
| route: dynamicParams = true (a quote published after the deploy renders) | true | true | PASS |
| route: generateStaticParams prebuilds nothing (no token list in the build) | returns [] | returns [] | PASS |
| route: metadata robots index:false follow:false | set | set | PASS |
| route: metadata referrer no-referrer | set | set | PASS |
| route: unknown token becomes notFound() | present | present | PASS |
| sitemap source: no quote route anywhere | absent | absent | PASS |
| next.config: X-Robots-Tag header on /quote/:token* | present | present | PASS |
| token: 500 generated, all 32 lowercase hex | all valid | all valid | PASS |
| counter: state BEFORE the run | (informational) | prefix="Q-" lastNumber=1002 | INFO |
| page: published quote returns 200 | 200 | 200 | PASS |
| page: raw HTML carries the rendered quote (not a client-side shell) | quote article present, no BAILOUT marker | article present, no marker | PASS |
| page: raw HTML contains the quote number | Q-1003 | present | PASS |
| page: raw HTML contains the customer company | ZZ Test Buyer Company | present | PASS |
| page: raw HTML contains the customer contact name | ZZ Test Contact Person | present | PASS |
| page: raw HTML contains the line 1 name (Geiger) | ZZ Test Geiger Line Item | present | PASS |
| page: raw HTML contains the line 2 name (own product, deref fallback) | ZZ Test Own Product Title | present | PASS |
| page: raw HTML contains the line 3 name (custom) | ZZ Test Custom Item | present | PASS |
| page: raw HTML contains the line 4 label (charge) | ZZ Test Art Fee | present | PASS |
| page: raw HTML contains the rep name | ZZ Test Rep | present | PASS |
| page: raw HTML contains the rep email | zz-test-rep-q140@example.com | present | PASS |
| page: raw HTML contains the line note | ZZ Test line note for the customer. | present | PASS |
| page: raw HTML contains the full description (Read more content) | ZZTAILMARKERQ140 | present | PASS |
| money: page shows the hand-computed grand total | $1,702.13 | $1,702.13 | PASS |
| money: page shows the hand-computed subtotal | $1,585.00 | $1,585.00 | PASS |
| money: page shows the hand-computed shipping total | $55.00 | $55.00 | PASS |
| money: page shows the hand-computed sales tax | $62.13 | $62.13 | PASS |
| money: page shows the hand-computed line 1 total | $890.00 | $890.00 | PASS |
| money: page shows the hand-computed line 2 total | $575.00 | $575.00 | PASS |
| money: page shows the hand-computed line 3 total | $135.00 | $135.00 | PASS |
| money: page shows the hand-computed line 4 total | $40.00 | $40.00 | PASS |
| robots: meta noindex + nofollow on the page | present | present | PASS |
| referrer: meta no-referrer on the page | present | present | PASS |
| robots: X-Robots-Tag response header | contains noindex | noindex, nofollow, noarchive | PASS |
| sitemap: deployed sitemap.xml lists no quote URL | absent | absent (6796438 bytes scanned) | PASS |
| 404: unknown (well-formed) token | 404 | 404 | PASS |
| 404: malformed token | 404 | 404 | PASS |
| 404: token with tag-hostile characters | 404 | 404 | PASS |
| 404: empty token (trailing slash) | 404 | 404 | PASS |
| 404: bare /quote | 404 | 404 | PASS |
| expired: page returns 200 | 200 | 200 | PASS |
| expired: expiry notice rendered | notice present | notice present | PASS |
| expired: prices still shown (not hidden) | $135.00 | $135.00 | PASS |
| empty: quote with no line items returns 200 | 200 | 200 | PASS |
| empty: empty state rendered | message present | message present | PASS |
| sparse: quote missing every optional field returns 200 | 200 | 200 | PASS |
| sparse: the one line still renders | ZZ Test Bare Line | present | PASS |
| no-undefined: "undefined" nowhere in the sparse quote HTML (React's $undefined flight sentinel excluded) | absent | absent | PASS |
| no-undefined: "undefined" nowhere in the full quote HTML (React's $undefined flight sentinel excluded) | absent | absent | PASS |
| no-undefined: "undefined" nowhere in the empty quote HTML (React's $undefined flight sentinel excluded) | absent | absent | PASS |
| no-undefined: "undefined" nowhere in the expired quote HTML (React's $undefined flight sentinel excluded) | absent | absent | PASS |
| withheld: internal label does not appear anywhere in the HTML | absent | absent | PASS |
| withheld: customer email does not appear anywhere in the HTML | absent | absent | PASS |
| withheld: customer phone does not appear anywhere in the HTML | absent | absent | PASS |
| withheld: customer address does not appear anywhere in the HTML | absent | absent | PASS |
| withheld: sent-at date (raw) does not appear anywhere in the HTML | absent | absent | PASS |
| withheld: sent-at date (formatted) does not appear anywhere in the HTML | absent | absent | PASS |
| withheld: Geiger SKU does not appear anywhere in the HTML | absent | absent | PASS |
| freshness: an edit reaches the customer page with no redeploy | grand total becomes $1,862.13 | updated in ~7s via the real Sanity webhook | PASS |
| cleanup: fixtures deleted | all zz-test-quote-* gone | zz-test-quote-q140-empty, zz-test-quote-q140-expired, zz-test-quote-q140-full, zz-test-quote-q140-product, zz-test-quote-q140-sparse | PASS |
| cleanup: zero test documents remain | 0 | 0 | PASS |
| counter: state AFTER restore | (informational) | prefix="Q-" lastNumber=1002 (restored to prefix="Q-" lastNumber=1002) | INFO |
| counter: restored EXACTLY to its before-run state | prefix="Q-" lastNumber=1002 | prefix="Q-" lastNumber=1002 | PASS |

## What a script cannot prove (for Ali, after the deploy)

None of the following are marked passed; they need a human with a browser:

1. Open a real quote link and confirm it looks right and reads as part of the Perfect Imprints site.
2. Open the same link on a phone and confirm the line items are readable without sideways scrolling.
3. Use the browser print preview (Ctrl+P) and confirm the quote is usable as a printed page: no site header or footer, line items whole, descriptions complete.
