# Q-140: Automated verification of the customer quote page

Run: 2026-08-01T05:52:39.747Z. Target: https://dev.perfectimprints.com. Script: scripts/quick-quote/verify-q140.ts (verification only - no app code touched). Mode: dry run (offline checks only). Dataset is SHARED between staging and production; every fixture used the zz-test-quote- prefix and was deleted; the quote counter was recorded before the run and restored exactly (values in the table). Tokens are never printed in full.

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

## What a script cannot prove (for Ali, after the deploy)

None of the following are marked passed; they need a human with a browser:

1. Open a real quote link and confirm it looks right and reads as part of the Perfect Imprints site.
2. Open the same link on a phone and confirm the line items are readable without sideways scrolling.
3. Use the browser print preview (Ctrl+P) and confirm the quote is usable as a printed page: no site header or footer, line items whole, descriptions complete.
