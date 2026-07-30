# Quick Quote Module + 8 Small Improvements — Diagnostic & Reuse Report

> Planning-only diagnostic (2026-07-26) for quoting Patrick's next milestone: the **Quick Quote module** + the **small improvements** batch. No code was changed. Purpose: find what already exists to reuse, flag the genuinely hard parts, and enable a lean-vs-full budget split.

---

## The headline finding (read this first)

**Geiger SKUs cannot auto-price from the data we hold.** The scraped catalog (`lib/product-types.ts`, `data/geiger/products.json` and all four aggregator files) carries exactly 15 fields per product, and the only pricing ones are `low_price`, `high_price`, `msrp`, `min_qty`. There is **no quantity-break price grid, no setup charge, no decoration-method pricing** anywhere — Searchspring is a search API and simply doesn't return that data (confirmed by reading `normalize_product` in `scripts/scrapers/geiger/products.py` and grepping the entire data layer: zero hits for price grids / setup / imprint charges).

So Patrick's sentence *"when quantity + decoration are chosen, unit cost and setup cost auto-populate"* splits into two honest cases:

- **Product-page items (Sanity `productPage` docs): YES, fully.** `pricingTiers` (qty-break unit prices), per-unit decoration `upcharge`, flat `setupCharge`, and `minQty` already exist, and the pure math in `lib/products/quote-estimate.ts` (`estimateForQuantity`, `decorationUpchargeFor`, `formatUsd`) already computes `qty × (unitPrice + decoration) + setup`. This is ~90–100% reusable per line item.
- **Raw Geiger SKUs: NO.** We can auto-populate photo, name, truncated description, price *range*, and min qty — but the actual unit cost and setup must be **typed by Patrick** (or the SKU first promoted to a productPage with tiers). Getting real Geiger cost data would mean a whole new integration (PromoStandards/SAGE-style pricing feed or detail-page scraping) — a separate project, not part of this milestone.

This must be set as an expectation with Patrick before quoting. It's the single biggest scope risk — and framed right it's fine: for a quote he's writing himself, entering his cost per line is normal workflow anyway.

---

## 1. Reuse map — Quick Quote module

| Piece | What exists (files) | What's new |
|---|---|---|
| **Line-item pricing math** | `estimateForQuantity` / `decorationUpchargeFor` (`lib/products/quote-estimate.ts`); `productPageValidTiers` / `productPageDecorations` (`lib/sanity/queries/product-pages.ts`) | Multi-line quote totals: subtotal, per-item shipping sum, tax field, grand total (simple arithmetic, but no multi-line structure exists today) |
| **SKU/product lookup for line items** | `getGeigerProductsBySkus` (`lib/products/lookup.ts`); the Studio `ProductSkuInput` / `ProductSkuPicker` (`sanity/components/ProductPicker.tsx`) searchable by name/SKU/brand — exactly the entry UX Patrick wants | A `quoteLineItem` object type (product ref/SKU + qty + decoration + unit cost + setup + shipping + photo override + custom-item fields). Custom items = the same object with everything manual — no separate mechanism needed |
| **Quote document** | Nothing — `leadSubmission` is an append-only, read-only inbox with no status/lifecycle | New `quote` doc type: rep block, customer block, line items, dates, status (draft/sent/accepted/revision-requested), comments |
| **Public quote page** | The exact route pattern: `dynamicParams=true` + `revalidate=false` + cache tags + webhook revalidation (`app/products/[slug]/page.tsx`); noindex + sitemap-exclusion precedent (gated catalog page, `app/shop-by-theme/[slug]/catalog/page.tsx`); "Read More" truncation, product-card visual language | The `/quote/[...]` route + template. **"Updates live as I edit" is already solved** — publish in Studio → webhook busts the tag → page refreshes in seconds. No dynamic rendering needed. ⚠️ Caveat: the URL needs a random token segment — the current gated-page pattern is guessable-path obscurity; a quote carries customer pricing, so generate an unguessable slug (e.g. `/quote/acme/Q-1042-x8k3f9`) |
| **Quote number** | Nothing — no counter/sequence pattern anywhere in the repo | Small: a Sanity singleton counter patched via transaction on quote-create, or a date-derived number + collision check. Half a day |
| **Customer-initiated draft (Get a Quote → draft quote)** | The whole intake: `ProductQuoteForm` posts hidden `productSlug` + selection + estimate to `app/api/leads/route.ts`, which already records product, qty, color/size/decoration, estimated total | One addition in the leads route: also `create()` a **draft** `quote` doc from the same payload. Small, because every input it needs is already in the POST |
| **Accept / Revise + comment + artwork** | Attachment pipeline is 100% solved (shared limits, server re-validation, buffer → Nodemailer + Sanity asset, non-fatal policy); honeypot / rate-limit / Turnstile; email builders (`sendBuiltEmail` with cc, escaped HTML builders) | A small dedicated `/api/quote-response` route (or a leads-route branch) that **patches the quote's status** and emails Patrick — the write-back to a specific doc is the one thing no existing form flow does. The form UI itself is a thin fork of existing pieces |
| **Email the quote link** | Near-exact template: `gatedCatalogUrl` + `buildCatalogConfirmationEmail` + `sendBuiltEmail({cc})` in `lib/leads/catalog-lead.ts` — "email a validated address a private link, cc Patrick" | Copy-adapt for quote wording |
| **PDF download** | **Nothing.** No PDF lib installed; Playwright is a devDep for a one-off build script only (not Lambda-viable) | New: `@react-pdf/renderer` in a `runtime='nodejs'` route (pure JS, no browser binary, fits Vercel; `maxDuration` precedent exists in the bulk-import route). Build the quote layout twice (React page + react-pdf document). Realistically 2–4 days including layout polish |
| **Open notification** | Nothing (no pixel/beacon/view-log anywhere; no middleware — and per project rules there must be none). Reusable: email plumbing + the in-memory rate-limiter shape in the leads route | New: post-mount client beacon on the quote page → tiny API route → email Patrick, debounced (e.g. patch `lastViewedAt` on the quote doc and skip if < N hours). More reliable than an email pixel (which mail clients block) — and it fires on *page* view, which is exactly what Patrick actually wants |
| **Sales tax** | — | Patrick's description reads as a **flat editable field**. Quote it as a field; do not build tax calculation. Confirm in one sentence with him |

**Summary:** the intake half (forms, attachments, email, spam stack, per-line math, SKU search UX, live-update publishing) is **~80% reusable**. The genuinely new core is: the `quote` doc + Studio editing experience, the public tokened template, the status write-back, and the PDF.

---

## 2. Reuse map — the small improvements

| # | Improvement | What exists | Rating | Reason |
|---|---|---|---|---|
| 1 | **Per-decoration setup charges (2-colour = 2 setups)** | `decorationMethods[]` = `{method, upcharge}` (per-unit only); one flat `setupCharge`; estimate math is pure and centralized | **Medium** | Add `setupCharge` (+ optional per-colour amount + colour-count selector) to the decoration entry, update `quote-estimate.ts` + the purchase panel, keep back-compat with the flat field. Do it **together with the quote module** — same schema, same math, one pass |
| 2 | **Suppress SKU from search** | Proven `hiddenDealSkus` blocklist pattern in `globalSettings`; every product search item already carries `sku`; live-delta route is webhook-busted | **Small** | New `searchHiddenSkus[]` field (reusing `ProductSkuPicker`), shipped via the live delta and filtered in `load-index.ts` merge + `server-search.ts`. No index rebuild needed |
| 3 | **Videos in multiple categories** | `video.category` is a single reference; ~5 consumers assume one (projection, `VideosBrowser` filter, related-videos GROQ, search entry) | **Medium** | Schema → array + touch each consumer + migrate existing docs (or dual-read fallback). Mechanical but wide |
| 4 | **Reorder products on a category page** | Order is purely positional in `mergeCategoryProducts` (`lib/sanity/queries/category-overrides.ts`): added items first, then baked. `customProduct.displayOrder` exists but is *not* applied here. No ordering field anywhere | **Medium-Large** — the sleeper | The sort itself is easy; the cost is honoring pins through faceted filtering (`applyFiltersAndSort` re-sorts), client pagination (pins must land on page 1), and **two render paths that must agree** (static page + `/api/category-products`). Scope it explicitly: "pin N items to the top of the default view" is Medium; "arbitrary full reorder surviving every filter/sort combo" is Large. Recommend quoting the pin-to-top version |
| 5 | **Product-strip SKU entry becomes a search** | `ProductSkuInput` already exists and already backs `productPlacement.sku`; `blogProduct` is **one shared object** used by blog bodies, video strips, page productStrip, landing pages, and productPage related | **Trivial** | One line — attach `components: {input: ProductSkuInput}` to `blogProduct.sku` — and all five surfaces get the picker at once. No migration (stored value stays the same string) |
| 6 | **Search box on blog/video index headings** | `SearchBox` (`components/forms/SearchBox.tsx`) is fully self-contained (takes `className`/`placeholder`, not header-coupled) | **Small** | Flex row in `app/blog/page.tsx` + `app/videos/page.tsx`, 3/4 title + 1/4 box. Caveat: it searches globally and routes to `/search`. If Patrick expects *blog-only* results, that's a scoping feature (the index has `type` fields, so possible) — confirm which he wants; global is nearly free |

Patrick's "a few others" — nothing else concrete was implied beyond these six; the setup-charges item (#1) is the only one that structurally interlocks with the quote module.

---

## 3. Genuine unknowns (can't quote confidently without resolving)

1. **Geiger cost auto-populate expectation.** Resolved by *one question to Patrick*: "For Geiger SKUs, the site's data has only a price range — are you OK typing your cost per line (we pre-fill photo/name/description/range), or do you expect real Geiger tier pricing pulled automatically?" If he expects the latter, that's a separate integration to scope, not this milestone.
2. **PDF fidelity.** `@react-pdf/renderer` is the right tool, but "looks like the product pages" in PDF means a hand-built second layout. Resolve with a half-day spike rendering one dummy quote to PDF on Vercel before committing to a number. Budget swings ±2 days on this.
3. **Open-notification reliability.** Email pixels are blocked by most mail clients; the page-view beacon is reliable but tells him "quote page opened," not "email opened." Confirm the beacon interpretation is acceptable (it almost certainly is — it's actually the better signal).
4. **Reordering scope (#4).** Pin-to-top vs. full arbitrary reorder under filters — a one-question scope check that changes the estimate materially.

---

## 4. Suggested budget split

**Slice A — lean core Quick Quote (delivers the full value loop):**

- `quote` doc type + Studio editing (line items via the existing SKU picker, custom items, photo override, auto number, dates, totals with flat tax + per-item shipping)
- Tokened public `/quote/...` page in the product-page visual language, live-updating via the existing webhook pattern
- "Email quote to customer, cc Patrick" (catalog-email pattern)
- Accept / Revise buttons with comment + status write-back + email to Patrick
- Get-a-Quote form also creates a draft quote
- Plus improvement **#1** (per-decoration setup charges), since the quote math needs it anyway

**Slice B — polish (defer if budget is tight):**

- PDF download (the single biggest standalone chunk; interim: browser print styles on the quote page cost ~an hour and cover "send to my supervisor")
- Open-view notification beacon
- Artwork-upload prompt on accept (the attachment pipeline makes this cheap, but it's severable)

**Slice C — the remaining small improvements:**

- #5 (strip SKU picker) and #2 (suppress SKU) are near-free, #6 (blog/video search box) small, #3 (video multi-category) medium, #4 (reorder, scoped as pin-to-top) medium. These can pad any weekly payment as quick wins.

---

## 5. Things that will bite

- **The Geiger auto-pricing expectation** — settle it in writing before quoting (see Unknown 1).
- **Quote URL guessability** — must generate a random token; don't reuse the gated-catalog "obscure slug" habit for pages carrying customer pricing.
- **The manual Sanity webhook Filter step** — a new `quote` type must be hand-added to the webhook Filter on both environments or published edits never go live (`docs/sanity-webhook-setup.md`; this has bitten before with `landingPage` / `productPage` / `form`).
- **`/quote` becomes a reserved slug** — add to `lib/reserved-slugs.ts` + the page/landingPage schema mirrors.
- **Quote counter races** — Sanity has no atomic sequence; use a transaction-guarded singleton or date-derived numbers with a collision check.
- **Reordering (#4)** is the improvement most likely to be underquoted — two render paths + filters + pagination.
- **PDF layout drift** — the web quote and the PDF are two layouts that must be maintained in parallel; keep the PDF deliberately simpler.

---

## Appendix — key evidence

- **Geiger product record (15 fields, identical across all data files):** `sku`, `name`, `brand`, `low_price`, `high_price`, `msrp`, `min_qty`, `imageUrl`, `description`, `category_paths`, `badges`, `is_new_item`, `is_on_sale`, `product_type_unigram`, `geiger_url`. No tier pricing, no setup/decoration charges. TS type: `lib/product-types.ts`.
- **productPage pricing model:** `qty × (tierUnitPrice + decorationUpcharge) + flat setupCharge` — single line item; no multi-line, tax, shipping, or discount modeling.
- **`leadSubmission`** is `readOnly: true`, append-only, no status field — cannot represent a quote lifecycle.
- **No PDF lib, no counter pattern, no view tracking, no middleware** exist in the repo today (verified by dependency + grep sweep).
- **Public live-update pattern** (`dynamicParams=true` + `revalidate=false` + cache tag + webhook `revalidateTag`) is proven on `/products/[slug]`, `/shop-by-theme/[slug]/catalog`, `/services/[slug]` and fits `/quote` directly.
