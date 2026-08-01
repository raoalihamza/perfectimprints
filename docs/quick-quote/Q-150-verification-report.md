# Q-150: Automated verification of the customer actions on a quote

Run: 2026-08-01T08:39:03.696Z. Target: https://dev.perfectimprints.com. Script: scripts/quick-quote/verify-q150.ts (verification only - no app code touched). Mode: dry run (offline checks only). Dataset is SHARED between staging and production; every fixture quote used the zz-test-quote- prefix, every response the route created was swept by its reference back to one of those quotes, and the quote counter was recorded before the run and restored exactly (values in the table). Tokens are never printed in full.

## Fixture arithmetic (independent literals, not derived from the app code)

- Live quote line: 200 x $4.25 = $850.00; + $45 setup = $895.00, no shipping, no tax
- After the freshness edit (quantity 200 -> 400): 400 x $4.25 = $1,700.00; + $45 = $1,745.00

## Results

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| route: app/api/quote-response/route.ts exists | present | present | PASS |
| route: nodejs runtime | set | set | PASS |
| route: force-dynamic (a write route is never prerendered) | set | set | PASS |
| route: never patches or replaces a document (append-only responses) | no patch / createOrReplace | no patch / createOrReplace | PASS |
| route: creates quoteResponse documents | present | present | PASS |
| route: the response is saved BEFORE the notification is sent | save then notify | save then notify | PASS |
| page: still reads no searchParams / cookies / headers | none present | none present | PASS |
| island: components/quote/QuoteActions.tsx exists | present | present | PASS |
| island: no useSearchParams (the silent prerender killer) | absent | absent | PASS |
| island: the token arrives as a prop, not from the URL | prop | prop | PASS |
| island: "Accept this quote" control defined | present | present | PASS |
| island: "Request a change" control defined | present | present | PASS |
| island: "Print or save as PDF" control defined | present | present | PASS |
| webhook: no quoteResponse case in the revalidate route (by design) | absent | absent | PASS |
| print: the action buttons are hidden on paper | hidden | hidden | PASS |
| sitemap source: no quote route anywhere | absent | absent | PASS |
| draft: lib/leads/quote-draft-creator.ts exists | present | present | PASS |
| draft: written at a drafts. id (never published) | drafts. prefix | drafts. prefix | PASS |
| draft: every path wrapped so a failure cannot lose the lead | try/catch present | try/catch present | PASS |
| draft: no quote number allocated | absent | absent | PASS |
| token: 500 generated, all 32 lowercase hex | all valid | all valid | PASS |

## What a script cannot prove (for Ali, after the deploy)

None of the following are marked passed; they need a human with a browser and an inbox:

1. Accept a real quote with a comment and a small image, and confirm the email reaches Patrick with the artwork attached.
2. Request a change on another quote and confirm that email arrives with the comment prominent.
3. Open a quote and confirm the "opened" email arrives, then refresh several times and confirm no further emails.
4. Confirm the responses appear in Studio under the quote, newest first, with the artwork downloadable.
5. Submit Get a Quote on a product page: confirm a DRAFT quote appears in Studio with the right product, quantity and prices, and that the normal lead email still arrives.
6. Check the three buttons on a phone.
