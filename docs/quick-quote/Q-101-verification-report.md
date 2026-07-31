# Q-101: Automated verification of Q-100 (per-decoration setup charges)

Run: 2026-07-31T00:00:53.881Z. Target: https://dev.perfectimprints.com. Script: scripts/quick-quote/verify-q100.ts (throwaway, verification only - no app code touched).

## Fixture arithmetic (derived from the documented rule, independent of the app code)

- `zz-test-setup-blank`: 50 x $10.00 + $100.00 setup [flat $100.00 (decoration setup absent)] = $600.00
- `zz-test-setup-zero`: 50 x $10.00 + $0.00 setup [decoration setup 0 (cancels the flat fee)] = $500.00
- `zz-test-setup-fifty`: 50 x $10.00 + $50.00 setup [decoration setup $50.00 (overrides flat $100.00)] = $550.00

All three share one pricing tier (min qty 50, price $10.00), a flat product setupCharge of $100.00, and one decoration method with no per-unit upcharge; only the decoration's own setupCharge differs (absent / 0 / 50).

## Results

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| zz-test-setup-blank: stored decoration setupCharge | ABSENT | ABSENT | PASS |
| zz-test-setup-zero: stored decoration setupCharge | 0 | 0 | PASS |
| zz-test-setup-fifty: stored decoration setupCharge | 50 | 50 | PASS |
| zz-test-setup-blank: page live (HTTP 200) | 200 | 200 after 3s (x-vercel-cache: MISS) | PASS |
| zz-test-setup-blank: H1 present | ZZ Test Setup Blank | found | PASS |
| zz-test-setup-blank: tier price in HTML | $10.00 | found | PASS |
| zz-test-setup-blank: no CSR bailout marker | absent | absent | PASS |
| zz-test-setup-blank: setup line rendered | + $100.00 setup | found | PASS |
| zz-test-setup-blank: estimated total rendered | $600.00 | found | PASS |
| zz-test-setup-zero: page live (HTTP 200) | 200 | 200 after 1s (x-vercel-cache: MISS) | PASS |
| zz-test-setup-zero: H1 present | ZZ Test Setup Zero | found | PASS |
| zz-test-setup-zero: tier price in HTML | $10.00 | found | PASS |
| zz-test-setup-zero: no CSR bailout marker | absent | absent | PASS |
| zz-test-setup-zero: NO setup line rendered | no "+ $... setup" text | none | PASS |
| zz-test-setup-zero: estimated total rendered | $500.00 | found | PASS |
| zz-test-setup-fifty: page live (HTTP 200) | 200 | 200 after 2s (x-vercel-cache: MISS) | PASS |
| zz-test-setup-fifty: H1 present | ZZ Test Setup Fifty | found | PASS |
| zz-test-setup-fifty: tier price in HTML | $10.00 | found | PASS |
| zz-test-setup-fifty: no CSR bailout marker | absent | absent | PASS |
| zz-test-setup-fifty: setup line rendered | + $50.00 setup | found | PASS |
| zz-test-setup-fifty: estimated total rendered | $550.00 | found | PASS |
| zz-test-setup-fifty: revalidation after patch (setup 75, total $575.00) | $575.00 appears without redeploy | updated in 5s (x-vercel-cache: REVALIDATED) | PASS |
| cleanup: fixtures deleted | zz-test-setup-blank, zz-test-setup-zero, zz-test-setup-fifty | zz-test-setup-blank, zz-test-setup-fifty, zz-test-setup-zero | PASS |
| zz-test-setup-blank: 404 after delete | 404 | 404 after 1s | PASS |
| zz-test-setup-zero: 404 after delete | 404 | 404 after 1s | PASS |
| zz-test-setup-fifty: 404 after delete | 404 | 404 after 2s | PASS |

## Raw HTML vs browser

The estimate numbers (setup line + estimated total) WERE present in the raw server HTML, as expected: the purchase panel is a client island whose deterministic initial render is server-prerendered. No browser check needed for the totals.

## Post-run sweep

A second pass with --cleanup-only after the run found no zz-test-* productPage documents (published or draft) left in the dataset: "Deleted: (nothing found)".
