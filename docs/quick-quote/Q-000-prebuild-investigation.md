# Q-000: Quick Quote pre-build investigation (second pass)

Date: 2026-07-29. Repo: `perfectimprints` (main site, Next.js 16.2.6 App Router, Sanity dataset `production`). Investigation only - no code, schema, or Sanity changes were made. The first-pass diagnostic lives at `docs/quick-quote-diagnostic.md`; its conclusions (no Geiger cost data, reusable intake pipeline, reusable estimate math) are taken as given and were not re-verified.

## Decisions you need to make

1. **Customer response storage (Q1):** Shape A (separate append-only `quoteResponse` document type) is the clear winner. Evidence: Studio publish replaces the published document wholesale, and the repo's own bulk-import route defensively copies published into draft because of exactly that. Decision needed: approve Shape A, and pick how Patrick sees responses in Studio (recommendation: a desk-structure list pane plus the notification email; both are cheap).
2. **Per-decoration setup charge shape (Q2):** recommended shape is two optional fields on the existing `decorationMethod` object (`setupCharge`, and a quote-line `colorCount` multiplier) with the flat `productPage.setupCharge` as fallback. Fully back compatible, one source of truth stays in `lib/products/quote-estimate.ts`. Decision needed: confirm the business rule "total setup = color count x per-decoration setup charge" with Patrick (this is his pricing model, not a technical question).
3. **PDF library (Q3):** recommend `@react-pdf/renderer` 4.5.1 behind a half-day spike on a deploy preview before committing to the estimate. It is serverless-safe (pure JS, no browser binary) and supports React 19, but Node 24 is above its officially tested range, so the spike is not optional. Decision needed: approve the spike.
4. **Quote URL + numbering (Q4):** recommend `/quote/<token>` with a 128-bit lowercase-hex token stored as the document slug, and a revision-guarded counter singleton for sequential quote numbers. Decision needed (Patrick): does he want sequential quote numbers (counter singleton, slightly more code) or date-based numbers with a random suffix (simpler, not strictly sequential)? Recommendation: sequential, since quote numbers appear on customer-facing PDFs.
5. **View alert (Q5):** recommend a new lightweight POST route pinged from the quote page after mount, with first-view dedupe persisted in Sanity (not in memory). Honest limitation: corporate email link scanners can trigger a false "viewed" alert, and there is no way to fully prevent that without auth. Decision needed: accept that limitation (recommendation: yes, with the alert email worded "the quote link was opened").
6. **Cheap improvements (Q5):** both confirmed viable. The SKU picker attachment is as cheap as claimed. The search suppression is slightly more than "copy a pattern": the blocklist pattern exists, but search has no exclusion hook today, so filter code in two places plus one webhook case addition is needed.

## Files consulted

Primary sources read for this report (all paths verified to exist): `CLAUDE.md`, `TASKS.md`, `docs/sanity-webhook-setup.md`, `docs/quick-quote-diagnostic.md`, `sanity/schemas/documents/product-page.ts`, `sanity/schemas/documents/lead-submission.ts`, `sanity/schemas/documents/page.ts`, `sanity/schemas/documents/landing-page.ts`, `lib/products/quote-estimate.ts`, `lib/sanity/queries/product-pages.ts`, `lib/sanity/client.ts`, `lib/sanity/studio-nonce-auth.ts`, `lib/sanity/cache-tags.ts`, `lib/reserved-slugs.ts`, `app/api/sanity/revalidate/route.ts`, `app/api/leads/route.ts`, `app/api/sanity/bulk-import/route.ts`, `lib/email/gmail-smtp.ts`, `sanity/components/ProductPicker.tsx`, `sanity/schemas/objects/blog-products.ts`, `components/products/ProductPurchasePanel.tsx`, `components/products/ProductQuoteForm.tsx`, `lib/bulk-import/parse.ts`, `lib/bulk-import/build-doc.ts`, `package.json`, `next.config.ts`, `app/products/[slug]/page.tsx`, `app/shop-by-theme/[slug]/catalog/page.tsx`, `app/sitemap.ts`, `scripts/search-index/build-index.ts`, `app/api/search-index/route.ts`, `lib/search/load-index.ts`, `lib/search/server-search.ts`, `sanity/desk-structure.ts`, `sanity/sanity.config.ts`, `perfect-imprints-sanity-guide.html`, `scripts/migrations/migrate-decoration-methods.ts`.

External sources (Q3): npm registry metadata for `@react-pdf/renderer`, `pdf-lib`, `pdfkit`; react-pdf.org/compatibility; github.com/diegomura/react-pdf issues #2350, #2460, #3285.

---

## Q1: How a customer-facing document survives Patrick's editing

### What the code does today

**Write clients.** Three read clients live in `lib/sanity/client.ts`: `client` (CDN, `perspective: 'published'`, no token), `previewClient` (token, `previewDrafts`), and `cachedClient` (`useCdn: false`, `perspective: 'published'`, no token - the tag-cached render-path client). Server writes use two clients: `serverSanityClient()` in `lib/sanity/studio-nonce-auth.ts` (lines 68-87: `SANITY_API_TOKEN`, `useCdn: false`, `perspective: 'raw'`, `apiVersion: '2024-10-01'`) and an inline `getSanityWriteClient()` in `app/api/leads/route.ts` (lines 77-89: same token, no explicit perspective).

**Installed versions.** `package.json` declares `@sanity/client ^6.22.0` and `sanity ^3.62.0`; the resolved installs are `@sanity/client` **6.29.1** and `sanity` **3.99.0** (verified in `node_modules/*/package.json` and `pnpm-lock.yaml`).

**Default perspective.** Per the installed client's own README (`node_modules/@sanity/client/README.md` line 504) and `src/types.ts`: the default perspective is `published` only for API version >= `v2025-02-19`; below that it is `raw`. Every client in this repo pins `apiVersion: '2024-10-01'`, so any client that does not set `perspective` explicitly (including the leads write client) defaults to `raw`. Not a problem today because that client only creates documents, but any future *fetch* on a token-bearing client without an explicit perspective would see drafts. A quote-page read client must set `perspective: 'published'` explicitly (the `cachedClient` already does).

**Routes that write to Sanity.** Exactly two: `app/api/leads/route.ts` (lines 368 and 613: `sanity.create({ _type: 'leadSubmission', ... })` - a NEW published document per submission, no `_id`, never a patch; plus `assets.upload` for attachments, non-fatal) and `app/api/sanity/bulk-import/route.ts` (lines 259-276: `createIfNotExists` plus `client.patch(draftId).set(...).commit()` - the patch target is always a `drafts.` id, never a published document). The eight `generate-*` routes contain no Sanity client at all; their patches happen client-side in Studio via `useDocumentOperation` on the draft. `push-category/route.ts` is read-only (the Studio tool creates the draft). **No API route in this repo patches a published document of any type.**

**How leadSubmission is made read-only.** `sanity/schemas/documents/lead-submission.ts` sets document-level `readOnly: true` (line 7) AND `readOnly: true` on every field. There is no desk-structure special-casing (`sanity/desk-structure.ts` only special-cases the three singletons) and no document-action restriction (`sanity/sanity.config.ts` lines 42-61 only append AI actions). So the read-only gate is schema-level only; Publish/Delete remain technically available on leadSubmission but there is nothing to edit.

**Publish-replaces-wholesale.** No in-repo document states it outright; it is Sanity platform behaviour. The strongest in-repo evidence that the codebase depends on it: `app/api/sanity/bulk-import/route.ts` lines 250-251, where the route deliberately seeds a new draft as a full copy of the published document before patching, with the comment "so the update only changes the imported columns". That defensive copy only makes sense because publishing a draft replaces the published document with the draft's entire content. Verification method: installed-client docs plus this code path; marked as platform behaviour, not proven by experiment in this repo.

**Types written by both Studio and a route.** Only `productPage`, and only at the DRAFT level (Studio editing and bulk-import both mutate `drafts.<id>`; the published doc is only read). The nonce docs (`drafts.siteRefreshAuth`, `drafts.bulkImportAuth`) are written by Studio tools and only read by routes, and their types are not registered in `sanity/schemas/index.ts`, so they are invisible in the desk. There is no existing case of a route patching a document Patrick concurrently edits, which means the quote milestone would be introducing that conflict class for the first time if Shape B were chosen.

### Recommendation

**Shape A: a separate append-only `quoteResponse` document type.** The route creates a new published document per customer action (Accept / Request Revision, comment, optional artwork asset), referencing the quote by `_ref` and carrying the token or quote number for redundancy. This is exactly the proven `leadSubmission` pattern (same write client, same non-fatal error handling, same schema-level `readOnly: true`). Patrick's draft-publish cycle physically cannot touch it.

Shape B (a status field patched on the quote document) fails on the evidence above: Patrick keeps an open draft while editing; the route would patch the published document; his next Publish replaces the published document with his draft, silently reverting the customer's accept. Mitigations (patching both draft and published, or `ifRevisionId` dances) add complexity and still race. Reject Shape B.

**How Patrick sees the response (nothing built yet, options only):**

- Option 1: a desk-structure child pane. `sanity/desk-structure.ts` is currently minimal (singletons pinned, everything else default), so adding a "Quote Responses" list (optionally a filtered child pane per quote) is a small, precedented change.
- Option 2: a read-only custom input component on the quote document that queries responses referencing it (the repo has custom-input precedent in `sanity/components/`, e.g. `ProductPicker.tsx`, but no query-and-display component precedent).
- Option 3: the notification email (a response should email Patrick anyway, reusing `sendBuiltEmail` in `lib/email/gmail-smtp.ts`).

Recommendation: Options 1 + 3 together. The email is the push signal; the desk list is the durable record. Option 2 is nicer UX but is the only one requiring novel Studio component work; defer it.

---

## Q2: Blast radius of per-decoration setup charges

### What the code does today - full consumer inventory

The current model: `productPage.setupCharge` is a single optional flat number (`sanity/schemas/documents/product-page.ts` lines 365-373, `pricing` fieldset). `decorationMethods` (lines 129-172, `details` fieldset) is an array of `decorationMethod` objects `{method: required string, upcharge: optional number >= 0}` (per-unit). Legacy plain-string entries exist in data and are normalized at read time; they show as invalid in Studio. The estimate formula (single source): `lib/products/quote-estimate.ts` line 87, `total = qty * (unitPrice + decorationUpcharge) + setupCharge`, with setup flat and never multiplied.

| Consumer | Path | Access | If decoration gains own `setupCharge` + optional `colorCount` |
| --- | --- | --- | --- |
| Schema | `sanity/schemas/documents/product-page.ts` 129-172, 365-373 | definition | Must change (add optional fields to the `decorationMethod` object). Additive, no migration. |
| Estimate math | `lib/products/quote-estimate.ts` (`estimateForQuantity` 64-90, `decorationUpchargeFor` 42-49, `DecorationOption` 23-26) | source of truth | Must change. If untouched while the schema changes, every page **silently misprices** (ignores the new per-decoration setup). This is the one true mispricing hazard. |
| Query/normalizer | `lib/sanity/queries/product-pages.ts` (`productPageDecorations` 127-142, `FULL_PROJECTION` 175+) | raw projection + normalize | Must change (project and pass through the new fields). Without it: silent misprice (fields never reach the client). Legacy strings keep normalizing to `{upcharge: 0}` and get no setup charge, which is correct. |
| Product page server | `app/products/[slug]/page.tsx` (396, 505-514) | passes `doc.setupCharge` raw + helper outputs | Must change (pass the richer decoration objects). Live render path: prerender risk, see below. |
| Purchase panel | `components/products/ProductPurchasePanel.tsx` (81-82, 262-269) | helpers only | Must change (estimate line breakdown text, a colour-count input if selected decoration has one). Uses helpers only, so no second formula can appear. |
| Quote form/modal | `components/products/ProductQuoteForm.tsx` (115-116, 179-188) | helpers only | Must change (same recompute; the annotated `selectedDecoration` string and posted `estimatedTotal` should reflect the setup). |
| Selection context | `components/products/ProductSelectionContext.tsx` | method-name strings only | Unaffected unless colour count becomes shared selection state; if so, small additive change. |
| Leads route | `app/api/leads/route.ts` (224-225, 325-326) | records client strings verbatim | Unaffected (strings pass through). No recompute exists server-side today. |
| leadSubmission schema | `sanity/schemas/documents/lead-submission.ts` 73-85 | string fields | Unaffected. |
| Card normalizer | `productPageToGeigerProduct` / `PRODUCT_PAGE_CARD_FIELDS` in `lib/sanity/queries/product-pages.ts` | neither field projected | Unaffected. |
| JSON-LD | `app/products/[slug]/page.tsx` 402-429 (inline AggregateOffer) | tiers only via `productPageValidTiers` | Unaffected (setup/decoration pricing is deliberately not in the schema markup today; keep it that way). `lib/seo/schema-generators.ts` has zero hits for these fields. |
| Bulk import | `lib/bulk-import/parse.ts` (121, 155-165, 446-447, 505-530), `lib/bulk-import/build-doc.ts` (60, 92-99), `public/templates/product-pages-template.csv`, help text in `sanity/tools/bulk-import-tool.tsx` 492-493 | own raw parsing/writing | Would not break (unknown columns already warn-and-skip), but needs new optional columns ("Decoration N Setup") + template + help text to be *complete*. Note an existing divergence: build-doc omits `upcharge` when blank while the migration script writes `upcharge: 0`. |
| AI generation | `app/api/sanity/generate-product/route.ts` (57, 72, 202), `sanity/actions/generate-product-with-ai.tsx` (49-53, 155-164) | method names only, only-if-empty, never writes upcharge or setupCharge | Unaffected (verified: `setupCharge`/`upcharge` appear nowhere in the route; the action's patch comment says "Patrick sets upcharges"). Keep the AI boundary as is. |
| Patrick guide | `perfect-imprints-sanity-guide.html` ~1517-1714 (Pricing bullet, Details bullet, AI note, configurator explanation, bulk-import column reference) | documentation | Must be updated in the same release (project rule). |
| Migration script | `scripts/migrations/migrate-decoration-methods.ts` (UTF-16LE file; ripgrep skips it as binary) | raw patch, one-off, already run | Unaffected (idempotent; touches only `method`/`upcharge`/`_key`). |
| Tests | `lib/bulk-import/parse.test.ts` (16, 50, 70, 104-139, 203-225) | covers Setup Charge + Decoration columns | Extend for new columns. **`lib/products/quote-estimate.ts` has NO test file today** - add one before changing the formula. |
| Duplicated code (hazard) | `decorationLabel()` duplicated in `ProductPurchasePanel.tsx` 42-46 and `ProductQuoteForm.tsx` 62-66; string-to-object normalizer exists in 3 places (`product-pages.ts` 132, `generate-product-with-ai.tsx` 49, migration script) | - | The label duplication is where a display-only inconsistency could creep in; consolidate the label helper into `quote-estimate.ts` as part of this change. |

### Recommended field shape (design only, plain terms)

- On the `decorationMethod` object, add one optional field: `setupCharge` (number, USD, "one-time setup fee per screen/colour for this method"). Absent = fall back to the flat `productPage.setupCharge` exactly as today.
- On the SELECTION side (configurator state + the future quote line), add an optional `colorCount` (integer, default 1), shown only when a decoration with a per-setup charge is selected. Total setup = `colorCount x decoration.setupCharge` when the decoration has one, else the flat `setupCharge` as today. This models "two colours = two setups" without touching stored product data.
- Math change lives ONLY in `lib/products/quote-estimate.ts`: extend `DecorationOption` with optional `setupCharge`, and extend `estimateForQuantity` (either an optional params object or a superseding wrapper that the old signature delegates to). Every consumer already goes through these helpers, so the product page estimate, Studio preview (if one is built), and the quote line stay mechanically in agreement.
- Back-compat check: every existing published document has no per-decoration `setupCharge` and no `colorCount` anywhere, so every code path reduces to the current formula. Zero migration.

Business decision for Patrick (not technical): is setup priced per colour per decoration method, and does a repeat order waive setup? The field shape above supports the first; the second is quote-level (a "waive setup" toggle on the quote line) and should be decided before the quote schema is finalized.

### Prerender/build risk flags

- `app/products/[slug]/page.tsx` and its client islands are a LIVE static render path (`dynamicParams = true`, `revalidate = false`). Any change must be verified on a deploy preview by curling the raw HTML of a product page (H1, gallery image, Product JSON-LD present, no `BAILOUT_TO_CLIENT_SIDE_RENDERING`). `pnpm typecheck` proves none of that.
- Hydration parity: the estimate renders server-side numbers formatted with the explicit `en-US` locale (`formatUsd`, `quote-estimate.ts` 93-100). New breakdown text must go through the same helper or hydration mismatch is possible.
- The GROQ `FULL_PROJECTION` change is invisible to typecheck if a field name is typo'd (GROQ is a string); silent misprice, not a build failure. Verify on preview with a test document.

---

## Q3: PDF generation viability

### What the repo has today

- **No PDF library exists.** Grep over `pnpm-lock.yaml` for react-pdf / pdfkit / pdf-lib / jspdf / puppeteer / chrome-aws-lambda / @sparticuz: zero matches. `playwright ^1.49.0` is a devDependency used only by the one-off local script `scripts/seo/generate-og-default.mjs` (not in any build step); a browser binary is not viable in a Vercel function, so it is not a candidate. `next/og` (`ImageResponse`, vendored inside Next) exists but produces PNG, not PDF. `xlsx ^0.18.5` is prod (bulk import) but irrelevant to PDF.
- **Runtimes:** `package.json` engines `node >= 24.0.0`, `.nvmrc` 24, CI pins Node 24. React `^19.0.0`, Next `^16.2.0` (resolved 16.2.6). No `vercel.json`.
- **Route precedent:** `app/api/sanity/bulk-import/route.ts` lines 32-35 is the only route with a long budget: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `maxDuration = 300`. Eleven routes set `runtime = 'nodejs'`; none set `edge`.
- **Bundling:** `next.config.ts` has no `serverExternalPackages`, no webpack overrides. Nothing blocks adding one if the spike shows it is needed.
- **Fonts:** no font files are committed anywhere (verified by glob; no `public/fonts`). The site uses Inter via `next/font/google` (`app/layout.tsx` 2, 11-15). All existing HTML emails hardcode Arial/Helvetica. So a PDF either uses react-pdf's built-in Helvetica (matches the email typography convention, zero assets) or Inter must be committed as a TTF and registered.
- **Attachment path:** `lib/email/gmail-smtp.ts` `sendBuiltEmail` (186-212) accepts arbitrary `{filename, content: Buffer, contentType}` attachments with no validation, so a generated PDF Buffer can be emailed as-is. `sendCustomerConfirmationEmail` (222-241) does NOT support attachments; use `sendBuiltEmail` or extend it. `.pdf` is already an accepted upload extension in the leads route (line 45).

### `@react-pdf/renderer` assessment (registry + docs, no install performed)

- Current version 4.5.1. Peer dependency: `react ^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0` - **React 19 is supported** (since v4.1.0), so it fits the installed React `^19`.
- Footprint: the core package is ~292 KB unpacked, but it pulls `@react-pdf/layout`, `@react-pdf/pdfkit`, `@react-pdf/font`, a Yoga layout engine and fontkit; realistic installed cost is a few MB of pure JS. **No browser binary, no native module** - serverless-safe. Built-in standard fonts (Helvetica etc.) mean no runtime font asset is required unless brand fonts are wanted.
- Known issues relevant here: (a) Next.js versions before 14.1.1 crashed with it in the App Router - not applicable at 16.2.6; (b) a January 2026 issue (#3285) with monorepo *external-package* imports - not our setup, it would be a direct dependency; (c) an esbuild-ESM `__dirname` issue in the Yoga dependency - Next's bundler is not esbuild, but this is exactly the class of thing the spike must prove; (d) `Font.register` needed for anything beyond the built-in fonts.
- **Node 24 is above the officially tested range (18, 20, 21 latest minors) - not verified.** No known breakage is documented, but this alone justifies the spike.

### Alternative

`pdf-lib` 1.17.1 (~19.5 MB unpacked, pure JS, zero runtime deps beyond bundled standard fonts): serverless-safe and dependency-light, but it is a low-level PDF constructor - every line, box and text run is placed by coordinate. Fidelity to the web layout would be entirely hand-built, and the quote layout would be written twice (once in React for the page, once imperatively for the PDF) with no shared abstraction. `pdfkit` 0.19.1 (~8.4 MB) sits in the same imperative category. `@react-pdf/renderer` lets the PDF be declared as a React component tree sharing formatting helpers (`formatUsd`, the selection summary from `lib/products/quote-estimate.ts`) with the page, which is the decisive advantage given the "one source of truth for the maths" rule.

### Recommendation

`@react-pdf/renderer` 4.5.1, generated server-side in a `runtime = 'nodejs'` route following the bulk-import precedent (`maxDuration` well under 300 is plausible; a single quote PDF should render in low seconds). Serve on demand from a route rather than storing the PDF, so an edited quote always downloads fresh; optionally also attach to the notification email via `sendBuiltEmail`. Use built-in Helvetica initially (matches emails, zero font assets); committing Inter is a cosmetic follow-up.

**Yes, run the spike before committing to the number:** one dummy quote rendered to PDF from a route on a deploy preview, on Node 24, verifying cold-start time and bundle behaviour. Spike effort: about half a day. Full quote PDF after a green spike: roughly 1.5 to 3 days depending on layout fidelity. If the spike fails on Node 24 or bundling, fall back to `pdf-lib` and add about 1 to 2 days for hand layout.

---

## Q4: The public quote route, its token, and its number

### 1. Reserved slugs - what exists and what changes

Canonical list: `lib/reserved-slugs.ts` lines 31-60 (`RESERVED_SLUGS`, 24 entries: cat, blog, videos, brands, deals, new-products, rush-products, rush-promotional-products, promotional-products, products, shop-by-theme, faq, search, services, admin3773752, api, about, contact, terms, privacy-security, returns, shipping-policy, sample-policy, company-core-values), plus `RESERVED_SLUG_SET` and `isReservedSlug`. Two inline mirrors exist because the standalone Studio bundler cannot import `lib/`: `sanity/schemas/documents/page.ts` lines 17-42 (enforced in the slug validator at line 89) and `sanity/schemas/documents/landing-page.ts` lines 25-55 (same 24 plus the four service slugs, enforced at line 113). Consumers of the set: `app/[...slug]/page.tsx` line 14 (root catch-all filters against it) and `app/sitemap.ts` line 15. There is no productPage or catalogPage mirror (their slugs live under dedicated folders).

To reserve a `quote` top-level segment: exactly three edits (the lib array plus the two schema mirrors). A dedicated folder route `app/quote/[token]/` then always beats the root catch-all, so no page/landingPage can ever shadow or collide with it even before the reservation lands, but the reservation prevents Patrick from creating a doc that silently never renders.

### 2. Noindex + sitemap-exclusion precedent - reusable as is

Robots handling is per-page metadata; there is no central robots helper (the root layout `robots` at `app/layout.tsx` 43-50 only sets `googleBot max-image-preview` and documents the shallow-merge caveat). The direct precedent is the gated catalog page `app/shop-by-theme/[slug]/catalog/page.tsx`: `robots: { index: false, follow: false }` in `generateMetadata` (lines 39-41) with the explicit comment that the emailed link is the only entry point, and sitemap exclusion **by omission** - `app/sitemap.ts` lines 145-156 lists only the public landing pages and never maps the `/catalog` sub-path. `/search` uses the weaker `index: false, follow: true` (`app/search/page.tsx` 32). For a quote page, copy the gated-catalog form exactly (`follow: false`, so Google is told not to follow links out of a private document), add nothing to the sitemap, and note `app/robots.ts` needs no change (it only disallows `/admin3773752` and `/api`; a `Disallow: /quote` line is optional hardening but also advertises the path prefix - recommend leaving robots.txt untouched and relying on noindex, matching the catalog precedent).

### 3. Route config precedent - confirmed

`app/products/[slug]/page.tsx` lines 58-64: `export const dynamicParams = true; export const revalidate = false;` with `generateStaticParams` from `getAllProductPageSlugs()`, and the in-code comment confirming a product published after the last deploy renders on-demand instead of 404ing. The same config is on `app/[...slug]/page.tsx` 67-68, both shop-by-theme routes, and `app/services/[slug]/page.tsx`. So yes: a route configured this way serves a document that did not exist at build time, provided the read is a tag-cached fetch the webhook busts. A quote page should use exactly this, likely with `generateStaticParams` returning `[]` (prebuilding customer quotes has no value; on-demand only). Caveat carried over from the standing reminders: staticness is proven by curling deployed raw HTML, not by the build listing.

### 4. Token generation and placement

What exists: the only token-like generation is the Studio nonce, `crypto.randomUUID()` client-side (`sanity/tools/site-refresh-tool.tsx` 136-141, duplicated in `bulk-import-tool.tsx`), compared server-side with `node:crypto` `timingSafeEqual` (`lib/sanity/studio-nonce-auth.ts` 57-61). `randomBytes` is imported nowhere; `nanoid`/`uuid` are not direct dependencies. `node:crypto` is already imported in two route files, so adding `randomBytes` has precedent-adjacent footing but no direct precedent.

Recommendation: **128 bits from `crypto.randomBytes(16).toString('hex')`** - 32 lowercase hex chars. Two reasons for lowercase hex specifically: (a) `sanitizeTagValue` in `lib/sanity/cache-tags.ts` (lines 104-115) LOWERCASES tag values, so a mixed-case token (base64url, default nanoid) would collapse case in the cache tag; lowercase hex keeps the tag and the token 1:1; (b) hex survives copy/paste and email-client URL mangling. 128 bits is unguessably large for a low-value target (a quote document), and matches or exceeds the UUID entropy already trusted for the Studio nonce.

Storage: a field on the quote document, ideally **as the document's `slug`** (`slug.current = <token>`), generated once via the schema's `initialValue` (an `initialValue` function can call `crypto.randomUUID()` in the Studio browser context - the same API `newNonce()` already uses; strip dashes and lowercase). Using the slug field means: the existing webhook Projection already projects `slug` (no Projection change, see below), the revalidate route's slug-based patterns apply directly, and Patrick never types or thinks about it (hide or read-only the field in Studio).

Path vs query parameter: **path segment** (`/quote/<token>`), decisively. A query parameter would require reading `searchParams`, which is a Dynamic API that forces the route dynamic (the exact failure mode CLAUDE.md Section 13 documents for `/cat`); a path param works with `dynamicParams` on-demand SSG, gets its own edge-cached page, and feeds a per-quote cache tag (`quote:<token>` through `sanitizeTagValue`) that the webhook can bust for the seconds-fresh update requirement.

### 5. Quote numbering

What exists: **no counter, sequence, or `.inc()` pattern anywhere in first-party code** (grep verified). `client.transaction()` is used only in one-off migration scripts (`scripts/migrations/wipe-blog-posts.ts` 87-90, `publish-blog-drafts.ts` 96-105, `delete-affected-blogs.ts` 94-97, `import-blogs.ts` 754-806). The installed `@sanity/client` 6.29.1 exposes `transaction()`, `patch().inc()`, `patch().setIfMissing()`, and `patch().ifRevisionId()` (verified against `node_modules/@sanity/client/dist/index.d.ts`; `inc` at line 192, `Transaction` at 3106).

Recommendation: a **counter singleton document plus optimistic concurrency**: read the counter document with its `_rev`, then `patch(counterId).ifRevisionId(rev).inc({ value: 1 }).commit()`, then use the incremented value; on a 409 conflict (another quote grabbed the same revision) retry with fresh state, a few attempts with jitter. This cannot issue a duplicate: two concurrent creators cannot both commit against the same revision. Honest failure modes: (a) under a genuine burst the retry loop adds latency and, if attempts are exhausted, quote creation fails visibly and must be retried by the human - it never silently duplicates; (b) if someone deletes the counter document in Studio, numbering restarts - mitigate with `createIfNotExists` seeding from a floor value and by not registering the counter type in the desk (the invisible-type precedent of `siteRefreshAuth`, which is not in `sanity/schemas/index.ts` and therefore never appears in Studio). The simpler alternative (date-derived number plus random suffix, e.g. `Q-20260729-4F2K`, with an existence check) has no contention at all but is not sequential; that trade is Patrick's call (see decision list).

### 6. Webhook Filter and Projection - exact strings

Current values, verbatim from `docs/sanity-webhook-setup.md` lines 88-89:

Filter (current):

```
!(_id in path("drafts.**")) && _type in ["megaMenu","globalSettings","homePage","page","blogPost","video","customProduct","customCategory","curatedCategory","faq","categoryOverride","productPlacement","customSchema","brand","landingPage","productPage","form","catalogPage"]
```

Projection (current):

```
{_id, _type, slug, categorySlug, pageUrl, "addToCategories": array::unique([...coalesce(before().addToCategories, []), ...coalesce(after().addToCategories, [])]), "removeFromCategories": array::unique([...coalesce(before().removeFromCategories, []), ...coalesce(after().removeFromCategories, [])])}
```

Updated Filter once a `quote` type exists (assuming the response type is named `quoteResponse`; include it only if a response should trigger revalidation of the quote page, which it should so the customer sees their own accepted state and Patrick's page view updates):

```
!(_id in path("drafts.**")) && _type in ["megaMenu","globalSettings","homePage","page","blogPost","video","customProduct","customCategory","curatedCategory","faq","categoryOverride","productPlacement","customSchema","brand","landingPage","productPage","form","catalogPage","quote","quoteResponse"]
```

Projection: **no change needed**, provided the quote token is stored in the standard `slug` field (the projection already carries `_id, _type, slug`). If the token lived in a custom field instead, the Projection would need that field added - one more reason to use `slug`.

This is a manual step in Sanity Manage (API > Webhooks), on BOTH webhooks (staging `dev.perfectimprints.com` and production `www.perfectimprints.com`), matching the five existing "manual step for an existing webhook" precedents in `docs/sanity-webhook-setup.md` (lines 111-154). A type left out of the Filter silently never revalidates - this exact omission has bitten before (`faq`, `brand`).

Code-side (not manual, listed for completeness): a `quote` case in `app/api/sanity/revalidate/route.ts` busting a `QUOTES_TAG` plus a per-token tag built through `sanitizeTagValue`, and `revalidatePath('/quote/<token>')`; the 2-arg `revalidateTag(tag, 'max')` form via the existing `bustTag()` guard (lines 42-44).

### 7. Middleware - confirmed absent

No `middleware.ts` exists (root listing verified; no `src/`). CLAUDE.md Section 4 states the rule: no per-request middleware on this site. So the quote page cannot be gated by middleware; unguessable path + `robots index:false, follow:false` + sitemap omission is the whole mechanism, identical to the gated catalog page. This is "hidden", not "authenticated" - anyone holding the URL can open it. That is the accepted model for the gated catalog and is assumed acceptable here (flag to Patrick only if quotes will contain sensitive pricing he would not want forwarded).

---

## Q5: The customer-initiated draft, the view alert, and the cheap improvements

### 1. The exact "Get a Quote" payload today

Client: `components/products/ProductQuoteForm.tsx` (POST at line 199, FormData mutations at 157-195). Keys on the wire:

| Key | Notes |
| --- | --- |
| `website` | honeypot (line 244/192); any value = silent 200 |
| `productSlug` | hidden input (253); slug only, never recipient or title |
| `selectedColor` / `selectedSize` | select or hidden input; only when options exist (300-346) |
| `selectedDecoration` | overwritten before POST with the annotated string, e.g. "Pad Print (+$0.50/unit)" (181-188) |
| `quantityNeeded` | `formData.set` from clamped state (179); there is NO `quantity` key (the number input has no name attribute) |
| `estimatedTotal` | display string via `formatUsd`, e.g. "$1,234.00", or empty (180) |
| `firstName`, `lastName`, `email`, `phone`, `company` | inputs (389-450) |
| `dateNeeded` | native date input converted to MM/DD/YYYY via `usDateFromIso` (195) |
| `shippingZip`, `comments` | inputs (478, 492) |
| `attachments` | repeated key, up to 3 files (189-190) |
| `sourceUrl` | `window.location.href` (191) |
| `cf-turnstile-response` | injected by the Turnstile widget when configured |

Server (`app/api/leads/route.ts`): required on this branch (isProductQuote, line 226) are firstName, email, quantityNeeded, dateNeeded; lastName/phone/lookingFor are relaxed (236-238). Recipient and product title are resolved server-side via `getProductLeadInfo(productSlug)` (`lib/sanity/queries/product-pages.ts` 523-534, tag-cached; unknown slug degrades to site default). The leadSubmission record stores the fields plus attachment asset refs; it does not store IP or user agent.

**What a customer-initiated draft quote would need that the payload does not carry:**

- Numeric price components. The payload carries only the display string `estimatedTotal` and the annotated decoration string; it has no numeric unit price, tier index, decoration upcharge, or setup charge. For a `productPage` product these are all re-derivable server-side from the slug via the existing helpers (the honest approach: never trust client numbers, recompute from `productPageValidTiers` + `productPageDecorations` + `estimateForQuantity`). For a Geiger SKU there is nothing to derive (price ranges only, per the first-pass diagnostic), so a Geiger-seeded line starts with no cost and Patrick fills it in.
- Quote-level metadata that no form can supply: quote number, token, status, Patrick's actual price (vs the estimate), expiry date, terms text. All assigned at creation, none from the customer.
- Nothing else: the customer identity, quantity, selection, date needed, and artwork are all already in the payload. So the "draft quote from a submission" feature is a server-side creation of a quote document reusing the payload as-is plus recomputation; it does not require touching the form.

### 2. View alert

What exists today: no analytics/beacon route of any kind in `app/api` (full route inventory verified; `app/api/search/route.ts` is a 501 stub). No `navigator.sendBeacon` usage anywhere. The only analytics is the GTM container in `app/layout.tsx` (env-gated). The leads rate limiter is an **in-memory module-scope Map** (`app/api/leads/route.ts` 38-59: 5 per IP per hour, keyed via x-forwarded-for), explicitly per serverless instance and lost on cold start - fine for spam damping, unusable for view dedupe. Middleware is confirmed absent and forbidden by project rules. A statically served `/quote/<token>` page produces no server invocation on view, so a server-only "was it opened" signal does not exist and cannot exist without a client ping.

Recommendation: a small POST route (e.g. under `/api/quote-view`) that the quote page pings once after mount with the token. The route resolves the quote server-side (same tag-cached read), then applies **persistent first-view dedupe in Sanity**: record the view (a tiny append-only doc, or a field on the Shape A response-side record - never on the quote doc itself, for the Q1 reason), and email Patrick via `sendBuiltEmail` only when no prior view record exists for that quote. Subsequent opens and refreshes write nothing and send nothing (or optionally update a lastViewedAt silently). Per-instance memory must not be the dedupe mechanism; Sanity persistence must be, because instances recycle.

Honest limitations to accept: (a) corporate email security scanners and link-preview bots often fetch links in emails; some execute JS, so a false "viewed" alert before the human opens it is possible and cannot be fully prevented without authentication - word the alert email "the quote link was opened" rather than "the customer viewed the quote"; (b) a customer with JS disabled or an aggressive content blocker produces no alert; (c) if Patrick opens the customer link himself he triggers it - mitigate with a query-flag on the link he uses from Studio, or just by the email being one-time. This is a "notification, not an audit log" feature and should be sold to Patrick as such.

### 3. The two cheap-improvement claims

**Claim A (SKU picker on the shared product strip object): CONFIRMED.** `blogProduct.sku` is a plain string field with no components today (`sanity/schemas/objects/blog-products.ts` 43-49). `ProductSkuInput` (`sanity/components/ProductPicker.tsx` 244-268) is a `StringInputProps` component that emits `set(<bare sku string>)` / `unset()` - byte-identical stored shape to hand-typing, as proven by its existing attachment to `productPlacement.sku` (`sanity/schemas/documents/product-placement.ts` 27). Attaching it via `components: { input: ProductSkuInput }` on the shared object gives the picker to every surface that uses `blogProduct` at once, with zero data migration: blog bodies (`blog-post.ts` 118), the page-builder `productStrip` (`page-sections.ts` 405-424), video `relatedProducts` (`video.ts` 73), landingPage `relatedProducts` (`landing-page.ts` 195), and productPage `relatedProducts` (`product-page.ts` 479-495, which inlines the same `blogProduct` type). catalogPage does not use `blogProduct` (it uses `addedSkus`, which already has the array picker). One behavioural nuance, not a blocker: the picker restricts entry to SKUs in `product-list.json` and shows a load-error state if that file is unavailable - same behaviour Patrick already has on `productPlacement.sku`.

**Claim B (hidden-SKU blocklist for search): CONFIRMED WITH A QUALIFIER.** The blocklist pattern exists five times over (`globalSettings.dealsPage.hiddenDealSkus` + new-products + rush variants in `sanity/schemas/singletons/global-settings.ts`, `categoryOverride.hiddenSkus`, `catalogPage.hiddenSkus`, each with an `applyHiddenSkus`-style applier), and the live delta route exists and is webhook-busted (`app/api/search-index/route.ts`, revalidated via `revalidatePath('/api/search-index')` for the SEARCH_TYPES and productPage cases in `app/api/sanity/revalidate/route.ts` 328-331, 429). The qualifier: **search itself has no exclusion hook anywhere today.** The static bulk index builder (`scripts/search-index/build-index.ts`) emits every product with a name and Geiger URL, unconditionally; the client merge (`lib/search/load-index.ts` 128-157) and the server `/search` Fuse path (`lib/search/server-search.ts` 44-50) filter nothing; and a `globalSettings` publish does NOT currently bust the search index route (the layout-types webhook case returns without touching it). So the honest scope for "suppress a SKU from search without a redeploy" is: a new blocklist field (the existing pattern), a filter applied in `load-index.ts` AND `server-search.ts` (two independent search paths), the blocklist shipped through the delta route, and one webhook-case addition so the singleton publish busts `/api/search-index`. Still small, but it is "copy the pattern plus wire three read points", not "copy the pattern".

---

## Consolidated manual steps (Sanity Manage / Vercel) visible from here

1. **Sanity Manage, webhook Filter update, BOTH environments** (staging and production webhooks): append `"quote"` and `"quoteResponse"` (final type names TBD) to the `_type` list. Projection unchanged if the token is stored in the standard `slug` field. Copy-paste strings are in Q4 section 6 above. This is the same class of step as the five prior additions documented in `docs/sanity-webhook-setup.md` and it has been forgotten before; treat it as a launch blocker for the milestone.
2. **No new Vercel environment variables identified.** The quote flow reuses `SANITY_API_TOKEN`, `GMAIL_USER`/`GMAIL_APP_PASSWORD`, `NEXT_PUBLIC_SITE_URL`, and the existing Turnstile keys. If the PDF spike ends up needing a committed font asset that is a repo change, not an env change.
3. **No Vercel dashboard changes identified.** `maxDuration` for a PDF route is code (`export const maxDuration`), within the existing plan limits already exercised by bulk-import's 300.
4. If Patrick approves the counter-singleton numbering: nothing manual, but note the counter document type should be deliberately left out of `sanity/schemas/index.ts` so it never appears in the desk (in-repo precedent: `siteRefreshAuth`).
5. Cheap improvements require no manual steps in either dashboard.
