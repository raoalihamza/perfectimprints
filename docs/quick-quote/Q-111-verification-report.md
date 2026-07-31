# Q-111: Automated verification of Q-110 (quote data foundation)

Run: 2026-07-31T01:32:17.691Z. Target: https://dev.perfectimprints.com. Script: scripts/quick-quote/verify-q110.ts (verification only - no app code touched). Dataset is SHARED between staging and production; every fixture used the zz-test-quote- prefix and was deleted; the quote counter was recorded before the run and restored exactly (values in the table).

## Fixture arithmetic (independent literals, not derived from the app code)

- Geiger line: 250 x $3.20 = $800.00; + $50 setup + $40 shipping = $890.00 (merchandise $850.00)
- Own-product line: 100 x $5.50 = $550.00; + $25 setup = $575.00
- Custom line: 10 x $12.00 = $120.00; + $15 shipping = $135.00 (merchandise $120.00)
- Charge line (Art fee): 1 x $40.00 = $40.00
- Subtotal (merchandise): 850 + 575 + 120 + 40 = $1,585.00; shipping 40 + 15 = $55.00
- Sales tax as typed: $62.13 (added verbatim, never calculated)
- Grand total: 1585 + 55 + 62.13 = $1,702.13
- Fraction of a cent: 3 x $0.335 = $1.005 exactly, rounds half-up to $1.01

## Results

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| token: 10000 generated, all 32 lowercase hex | all valid | all valid | PASS |
| token: no collisions in 10000 | 10000 unique | 10000 unique | PASS |
| token: sanitizer round-trip (10000 tokens) | sanitizeTagValue(token) === token, tag "quote:<token>" | all unchanged | PASS |
| token: mixed case would collapse (control) | sanitizer lowercases non-lowercase input | lowercased as expected | PASS |
| totals: single line grand (250 x $3.20 + $50 + $40) | 890 | 890 | PASS |
| totals: single line subtotal excludes shipping | 850 | 850 | PASS |
| totals: mixed subtotal (850 + 575 + 120 + 40) | 1585 | 1585 | PASS |
| totals: mixed shipping (40 + 15) | 55 | 55 | PASS |
| totals: mixed grand (1585 + 55 + 62.13) | 1702.13 | 1702.13 | PASS |
| totals: per-line totals (890, 575, 135, 40) | 890, 575, 135, 40 | 890, 575, 135, 40 | PASS |
| totals: charge line (3 x $12.50) | 37.5 | 37.5 | PASS |
| totals: missing quantity treated as 0 (0 x 5 + 50 + 25) | 75 | 75 | PASS |
| totals: negative/NaN inputs treated as 0 | 0 | 0 | PASS |
| totals: charge with no price | 0 | 0 | PASS |
| totals: tax absent (grand = 40) | 40 | 40 | PASS |
| totals: NaN/negative tax adds nothing | 40 / 40 | 40 / 40 | PASS |
| totals: tax 7.77 added verbatim (40 + 7.77) | 47.77 | 47.77 | PASS |
| totals: 3 x $0.335 = $1.005 rounds to | 1.01 | 1.01 | PASS |
| totals: empty quote all zeros | 0 / 0 / 0 | 0 / 0 / 0 | PASS |
| numbering: exhaustion behaviour (stub) | throws QuoteNumberAllocationError, no number issued | QuoteNumberAllocationError after 2.1s | PASS |
| reserved slug: 'quote' in canonical list | present | present | PASS |
| reserved slug: 'quote' in page schema mirror | present | present | PASS |
| reserved slug: 'quote' in landingPage schema mirror | present | present | PASS |
| read helper: tagged fetch (static source check) | tags [QUOTES_TAG, quote:<token>], revalidate:false, no no-store | as intended | PASS |
| webhook route: quote case busts both tags (static source check) | QUOTES_TAG + quoteTag(<slug>) | both busted | PASS |
| deploy gate: staging route has the quote case | 200 revalidated:true type:quote | 200 {"revalidated":true,"scope":"/quote/deadbe[redacted]","type":"quote"} | PASS |
| counter: state BEFORE the run | (informational) | ABSENT (document does not exist) | INFO |
| numbering: sequential #1 | Q-1001 | Q-1001 | PASS |
| numbering: sequential #2 | Q-1002 | Q-1002 | PASS |
| numbering: sequential #3 | Q-1003 | Q-1003 | PASS |
| numbering: 6 concurrent allocations all succeed | 6/6 | 6/6 | PASS |
| numbering: concurrent numbers all distinct | no duplicates | no duplicates | PASS |
| numbering: concurrent set contiguous | 1004,1005,1006,1007,1008,1009 | 1004,1005,1006,1007,1008,1009 | PASS |
| numbering: counter matches count issued | lastNumber 1009 | prefix="Q-" lastNumber=1009 | PASS |
| doc: no persisted totals fields | none of: subtotal, shippingTotal, grandTotal, total, lineTotals, computedTotals, responses | none present | PASS |
| read helper: returns the quote by token | non-null | non-null | PASS |
| read helper: quoteNumber round-trips | Q-1001 | Q-1001 | PASS |
| read helper: 4 line items in order | quoteGeigerLine,quoteOwnProductLine,quoteCustomLine,quoteChargeLine | quoteGeigerLine,quoteOwnProductLine,quoteCustomLine,quoteChargeLine | PASS |
| read helper: Geiger line intact (sku, qty, unit cost) | 501003, 250, 3.2 | 501003, 250, 3.2 | PASS |
| read helper: own-product line dereferenced for display | zz-test-quote-product / ZZ Test Quote Product | zz-test-quote-product / ZZ Test Quote Product | PASS |
| read helper: customer block mapped | ZZ Test Company / Ali Hamza Rao / alihamzarao13@gmail.com | ZZ Test Company / Ali Hamza Rao / alihamzarao13@gmail.com | PASS |
| read helper: salesTax round-trips | 62.13 | 62.13 | PASS |
| read helper: unknown well-formed token | null (no throw) | null | PASS |
| read helper: malformed token | null (no throw) | null | PASS |
| read helper: empty string | null (no throw) | null | PASS |
| read helper: sanitizer-altering characters | null (no throw) | null | PASS |
| snapshot: product setupCharge 100 -> 999, quote line unchanged | unitCost 5.5, setupCharge 25 | unitCost 5.5, setupCharge 25 | PASS |
| snapshot: product restored exactly | setupCharge 100 | setupCharge 100 | PASS |
| freshness: signed revalidate POST accepted | 200 revalidated:true type:quote | 200 revalidated:true | PASS |
| freshness: token redacted in response | /quote/65941b[redacted] | /quote/65941b[redacted] | PASS |
| freshness: full token NOT in response body | absent | absent | PASS |
| responses: one of each kind created | accepted,revisionRequested,viewed | accepted,revisionRequested,viewed | PASS |
| responses: SURVIVE parent edit + republish (clobber test) | 3 records intact | 3 records (accepted,revisionRequested,viewed) | PASS |
| delete: quote deletes despite responses (weak refs) | deleted cleanly | deleted cleanly | PASS |
| delete: responses remain, quote number intact | 3 records, all Q-1001 | 3 records, numbers: Q-1001 | PASS |
| delete: read helper returns null after delete | null | null | PASS |
| cleanup: fixtures deleted | all zz-test-quote-* gone | zz-test-quote-product, zz-test-quote-resp-accepted, zz-test-quote-resp-revisionrequested, zz-test-quote-resp-viewed | PASS |
| cleanup: zero test documents remain | 0 | 0 | PASS |
| counter: state AFTER restore | (informational) | ABSENT (document does not exist) (deleted (it did not exist before the run)) | INFO |
| counter: restored EXACTLY to its before-run state | ABSENT (document does not exist) | ABSENT (document does not exist) | PASS |

## Notes / findings

- What a caller receives when allocation cannot succeed (simulated 5x conflict): QuoteNumberAllocationError: "Could not allocate a quote number after 5 attempts. No number was issued - try again. (409 revision conflict (simulated))". The quote is left unnumbered and unpublishable (validation requires the number); nothing is consumed.
- The revalidate response reports scope + type only; it does not enumerate busted tag names (deliberate, the body lands in the webhook delivery log). That the quote case busts QUOTES_TAG + quote:<token> is verified from the route source (static check above); the cache-level effect has no observable surface until the /quote/<token> page exists.
- Writer note for the future response route: this script sets _weak:true on the reference object it writes. The schema-level weak:true governs Studio-created references; an API-written reference carries weakness only via the stored _weak flag. The quote deletion succeeding below (with responses present) is the empirical proof the stored references are weak.

## What a script cannot prove (Studio click-through for Ali)

None of the following are marked passed; they need a human in the Studio:

1. Open Content > Quote > Create new. The "Assign quote number" button should appear in Quote identity; after one click a number like Q-1001 shows as plain text with "Assigned automatically. Not editable." and NO editable text box; the Private link token field is read-only with a generated value.
2. Add line items and change a quantity: the "Totals (computed)" box should update live (subtotal / shipping / sales tax / grand total).
3. Duplicate an existing quote (document menu > Duplicate) and try to publish the copy: publishing should be BLOCKED by the uniqueness messages on the quote number and the private link token.
4. On a quote that has responses, the "Responses" box in Sending & responses should list them newest first (nothing writes responses yet, so this is only observable after the later prompts, or while the Q-111 fixtures briefly existed).
5. Create a new quote and check the "Your details" fieldset: name/email should pre-fill from the logged-in Studio user (whose name actually appears is worth confirming), phone from Global Settings contact.
6. On a Geiger product line, the SKU field should offer the search-and-pick product picker, not free typing.
7. The "no persisted totals" check covered an API-authored document; a Studio-edited quote should equally never gain stored totals fields (the totals field stores nothing by design).
