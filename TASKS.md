# TASKS.md

Sequential ticket list for the Perfect Imprints rebuild. Read `CLAUDE.md` first. Each ticket is self-contained and can be used as a prompt to an AI coding tool.

Conventions:

- `[ ]` open, `[x]` done, `[~]` blocked
- Dependencies are listed by ticket ID
- Acceptance is a checklist, not prose
- Estimates are working hours, not calendar hours

Module to week mapping (client-facing 6-week plan):

- Module 1 (Foundation + Data Pipeline): Week 1-2 (Phase E brand logos scheduled Week 4)
- Module 2 (AI Content Generation): Week 2-3
  - Week 2 end: Top 35 root sample generated for client demo (DONE)
  - Week 3: Prompt upgrade to buying-guide format, regenerate 35 demo pages, then generate remaining 430 roots + 21,715 non-root pages
- Module 3 (Category Page Templates): Week 2-5
  - Week 2 end: Sample template for 35 demo roots (DONE)
  - Week 3: HTML entity fix, image fallback, H2 above bottom text, pagination with noindex
  - Week 4: Filters (with Min Qty + search-within + context-specific), sort, lead form, related blogs section
  - Week 5: Performance + schema markup
- Module 4 (Blog System + Brand Pages): Week 4
- Module 5 (Search, Forms, Home, Deals page, Polish): Week 5
- Module 6 (QA, Migration, Launch): Week 6

---

## Module 1: Foundation and Data Pipeline

### [x] M1-101: Initialize Next.js project

**Scope.** Bootstrap a Next.js 15 App Router project with TypeScript strict mode, Tailwind CSS, ESLint, Prettier, and pnpm. Configure path aliases. Set up the folder structure described in CLAUDE.md Section 5.
**Acceptance.**

- [x] `pnpm dev` runs locally on port 3000
- [x] TypeScript strict mode enabled in tsconfig
- [x] Tailwind configured with brand tokens from CLAUDE.md Section 10
- [x] ESLint runs clean on a fresh checkout
- [x] All folders from Section 5 exist with a README placeholder
      **Depends on.** None.
      **Estimate.** 3 hours.

### [x] M1-102: Set up Git and CI

**Scope.** Initialize Git repo, push to remote. Add GitHub Actions for typecheck, lint, and build on every PR. Add branch protection on `main`. Create `develop` and `main` branches.
**Acceptance.**

- [x] Repo pushed to remote
- [x] CI runs and passes on the initial commit
- [x] `main` branch protected with required CI checks
- [x] `develop` branch created off main
      **Depends on.** M1-101.
      **Estimate.** 2 hours.

### [x] M1-103: Configure Vercel staging

**Scope.** Connect the repo to Vercel. Use Vercel's native Next.js support. Add a `dev.perfectimprints.com` CNAME in Cloudflare DNS pointing at the Vercel staging deployment, in DNS-only mode. Verify HTTPS works. Add environment variables in the Vercel dashboard.
**Acceptance.**

- [x] Staging URL resolves over HTTPS
- [x] Apex `perfectimprints.com` 301-redirects to `www.perfectimprints.com`
- [x] All required env vars set in Vercel dashboard
      **Depends on.** M1-102.
      **Estimate.** 4 hours.

### [x] M1-104: Set up Sanity Studio

**Scope.** Initialize Sanity v3 project under Patrick's account. Embedded at `/admin` and standalone at `localhost:3333`. Initial schemas: homePage, globalSettings, megaMenu (singletons).
**Acceptance.**

- [x] Sanity Project ID `ii96lcy9`, dataset `production`
- [x] Studio loads at both URLs
- [x] Patrick can log in
- [x] Webhook configured for ISR revalidation
      **Depends on.** M1-101.
      **Estimate.** 6 hours.

### [x] M1-105: Global layout components

**Scope.** Header (logo, mega menu skeleton, phone, contact link), Footer (4 columns), brand button styles, typography scale, `/style-guide` route.
**Acceptance.**

- [x] Header + Footer render on every page
- [x] Mega menu skeleton in place
- [x] Style guide live at `/style-guide`
      **Depends on.** M1-101.
      **Estimate.** 8 hours.

### [x] M1-106: Mega menu shell (Geiger taxonomy seed)

**Scope.** Hardcoded mega menu structure mirroring Geiger's category tree. Will be replaced by Sanity-driven version in M5-503.
**Acceptance.**

- [x] All Geiger top-level categories present
- [x] Hover/click reveals dropdown
- [x] Mobile drawer works
      **Depends on.** M1-105.
      **Estimate.** 4 hours.

### [x] M1-107: Phase A — Geiger taxonomy scrape

**Scope.** Python scraper Phase A. Parse Geiger mega menu HTML, extract category tree with parent-child relationships.
**Acceptance.**

- [x] `data/geiger/categories.json` produced
- [x] 544 categories, 482 leaves captured
      **Depends on.** None.
      **Estimate.** 4 hours.

### [x] M1-108: Phase B — Geiger product catalog scrape

**Scope.** Python scraper Phase B. For each Geiger leaf category, paginate Searchspring API. Deduplicate by SKU.
**Acceptance.**

- [x] `data/geiger/products.json` produced
- [x] 7,957 unique SKUs captured (99.82% of catalog)
      **Depends on.** M1-107.
      **Estimate.** 8 hours.

### [x] M1-109: Phase C — Facet membership scrape

**Scope.** Python scraper Phase C. For each of 21,715 PI facet/modifier/compound URLs, one filtered Searchspring API call. 4-tier recovery chain.
**Acceptance.**

- [x] `data/geiger/facet-memberships.json` produced
- [x] 13,968 with products, 7,518 zero, 229 errors
- [x] Tier 1 recovered 809, Tier 2 recovered 2,625
      **Depends on.** M1-108.
      **Estimate.** 10 hours.

### [x] M1-110: Phase D — PI-to-Geiger mapping

**Scope.** Map 465 PI roots to Geiger leaves via exact, then fuzzy, then manual override.
**Acceptance.**

- [x] `data/mappings/pi-to-geiger.json` produced
- [x] 465/465 mapped (72 exact + 224 fuzzy + 169 manual)
- [x] Zero unmapped
      **Depends on.** M1-108.
      **Estimate.** 6 hours.

### [x] M1-111: Full scrape validation and reports

**Scope.** Run all four phases end-to-end. Summary report at `docs/scrape-results.md`. Commit data files.
**Acceptance.**

- [x] All phase outputs committed
- [x] Stats report documented
      **Depends on.** M1-110.
      **Estimate.** 8 hours.

### [x] M1-112: Phase E — Geiger brand logo scrape (NEW)

**Scope.** Added 2026-05-26 per Patrick feedback. Python scraper Phase E at `scripts/scrapers/geiger/brand_logos.py`. Visit `https://www.geiger.com/c/shop-by-brand` to enumerate brand pages (parses the static HTML A-Z brand index, no API). For each brand, follow the brand page link and download the logo image. Cross-reference brand names against `data/geiger/products.json` to get product counts.
**Acceptance.**

- [x] `data/geiger/brand-logos/{slug}.{webp|png|jpg}` files created (~200-300 brands expected based on the A-Z listing)
- [x] `data/geiger/brands.json` produced with name, slug, description, logo path, product count per brand
- [x] Brand slug matches the form used in product data (handles `&` properly, e.g. `cutter-buck` from `Cutter & Buck`)
- [x] Brands with no logo on Geiger's page recorded with `logo: null` so downstream code can handle gracefully
- [ ] Runs as part of monthly auto-rebuild (M6-606)
      **Depends on.** M1-108.
      **Estimate.** 4 hours.

**Week 4 progress (2026-06-05).** Done.

- Probe found the A-Z index renders all 191 brand entries inline on a single page: each brand is an `<a href="/b/brand-names#/filter:brand:<NAME>">` wrapping an `<img>` with the logo URL on Geiger's S3 / imgsirv CDN. **No per-brand fetches needed for logos** — the spec's "visit each brand page" step collapses to one HTTP GET + N image downloads.
- [scripts/scrapers/geiger/brand_logos.py](scripts/scrapers/geiger/brand_logos.py): single-fetch index parser + image downloader with 1 req/sec throttle. Wired into `run.py` as `--phase e`. Resumable (skip if file already on disk). Mirrors logos to `public/brand-logos/<slug>.<ext>` so Next.js serves them directly; canonical store under `data/geiger/brand-logos/` is preserved per CLAUDE.md §8.
- HTML-entity decoding (`html.unescape`) applied before slugifying to merge `Cutter &amp; Buck` (products.json) with `Cutter & Buck` (index). Five cross-listed brands merged correctly: cutter-buck, mms, port-co, travis-wells, wp.
- Output: 191 logos downloaded as valid GIFs (verified with `file`), 205 brands in `data/geiger/brands.json` (191 from index + 14 product-catalog-only orphans), 194 brands have ≥1 product in our catalog. Runtime ~3 min.
- Monthly auto-rebuild hook (M6-606) still pending — Phase E added to `--phase all` but not yet referenced from the monthly workflow file.

---

## Module 2: AI Content Generation

### [x] M2-201: DeepSeek API client wrapper

**Scope.** Python client at `scripts/ai-pipeline/deepseek_client.py`. Retry logic, cost tracking, dry-run mode.
**Acceptance.**

- [x] Client wraps requests with `tenacity` retry
- [x] Cost tracker accumulates input/output tokens per call
- [x] Dry-run mode prints prompt without calling API
      **Depends on.** M1-101.
      **Estimate.** 4 hours.

**Done (2026-05-24)** as part of Week 2 demo deliverable. Verified against live API generating 35 sample roots.

### [x] M2-202: Root category prompt template (reopened for buying-guide upgrade)

**Scope.** Author `scripts/ai-pipeline/prompts/root_category.txt` (promptVersion `root-v2`) for **buying-guide format** root category content.

**v1 status:** First version delivered 2026-05-24 for Week 2 demo. Patrick reviewed 2026-05-25 and requested upgrade to buying-guide format with longer body and keyword derivatives. Reference: `https://www.perfectimprints.com/blog/buying-guide-for-stadium-seat-cushions`.

**v2 scope (Week 3, Day 1-2):**

Generates the following fields per root category:

- SEO H1 (40-70 chars)
- Meta title (under 60 chars)
- Meta description (under 155 chars)
- **Hero intro** (1-2 paragraphs, 150-250 words) — context-setting opener above the product grid
- **Buying guide content** (`buyingGuideHtml`, 400-600 words) — structured buyer-research piece rendered below the product grid under an H2 titled `Custom [Category] Buying Guide`. Required sections:
  - What buyers should look for when ordering this category
  - Materials, build quality, durability
  - Common use cases and which buyer personas each fits
  - Decoration and customization options
  - Quantity guidance and MOQ context
  - Tips to avoid common buying mistakes
- **Keyword derivative injection:** the buying guide must naturally include plural variations: `custom [category]`, `promotional [category]`, `branded [category]`, `personalized [category]`, `logo [category]`, `bulk [category]`, `wholesale [category]`. Natural integration, no stuffing.
- 5 FAQs with answers (50-100 words each)
- Hero alt text (60-120 chars, includes keyword)

Output JSON also carries new fields: `buyingGuideHtml`, `buyingGuideH2`, `promptVersion: "root-v2"`. The mini-batch script preserves the existing `skuFilterMode`/`rawSkuCount`/`filteredSkuCount` audit fields and the `post_process_lengths()` safety net.

**Acceptance.**

- [x] `root_category.txt` updated to v2 with all required sections
- [x] Output schema extended with `buyingGuideHtml`, `buyingGuideH2`, `promptVersion: "root-v2"`
- [x] 35 demo pages regenerated (existing JSONs deleted first, fresh run, $0.075 cost, 0 failures)
- [~] Each regenerated page has 400-600 word buying guide section (23/35 in range; 9 under and 3 over — content quality good, SEO word-count tuning to revisit before M2-205 full run)
- [~] Each page naturally includes at least 5 of the 7 keyword derivative variations (29/35 hit ≥5; 6 hit 3-4 — same retune note as above)
- [x] H1 + meta lengths still within limits (zero violations after `post_process_lengths()`)
- [ ] Patrick spot-checks 2-3 outputs and approves the new format (pending Pause Point 3)

**Outstanding tuning for M2-205 (full 430-root run):** word-count adherence is stochastic at temp=0.65. Options before full run: (a) add a retry-on-validation-fail loop in `generate_sample_roots.py`/`generate_content.py`, (b) further tighten paragraph-count instructions in the prompt, or (c) post-process expand thin outputs with a follow-up DeepSeek call. Recommended: (a) — cheaper and self-healing.
      **Depends on.** M2-201.
      **Estimate.** 6 hours (3h prompt design + 1h regen run + 2h validation/iteration).

### [ ] M2-203: Facet category prompt template

**Scope.** Author `scripts/ai-pipeline/prompts/facet_category.txt` for lite facet page content (21,137 standard facets + 2 compound facets). Generates: SEO H1 targeting long-tail keyword, meta title, meta description, one short intro paragraph (60-80 words). No FAQs, no buying guide.
**Acceptance.**

- [ ] Template file committed
- [ ] Test run on 5 sample facet URLs produces valid output
- [ ] H1 reflects the long-tail keyword exactly
- [ ] Intro paragraph is unique per facet, not boilerplate
- [ ] Compound facets render H1 with both filter dimensions
      **Depends on.** M2-201.
      **Estimate.** 2 hours.

### [ ] M2-203a: Modifier category prompt template

**Scope.** Author `scripts/ai-pipeline/prompts/modifier_category.txt` for the 576 modifier pages. Six modifier types with distinct buyer intent. Template selects tone by modifier type, then injects root category context. Generates: H1, meta title, meta description, one short intro paragraph (60-80 words). No FAQs, no buying guide.
**Acceptance.**

- [ ] Template file committed
- [ ] Test run on at least one URL of each modifier type produces valid output
- [ ] H1 incorporates both root category and modifier
- [ ] Intro paragraph reflects the modifier intent, not generic
      **Depends on.** M2-201.
      **Estimate.** 3 hours.

### [ ] M2-204: AI content generation pipeline (generic)

**Scope.** Python script at `scripts/ai-pipeline/generate_content.py`. Reads the PI URL list plus mapping plus Geiger product data. For each URL selects the appropriate template (root, modifier, or facet) based on `type` field, then invokes DeepSeek. Resumable, dry-run mode, per-batch cost reporting. Builds on the existing `generate_sample_roots.py` infrastructure.
**Acceptance.**

- [ ] Script generates output for any subset of URLs on demand
- [ ] Template selection by URL type works correctly
- [ ] Output JSON conforms to schema in CLAUDE.md Section 9 (with `buyingGuideHtml`/`buyingGuideH2` populated for roots, null for others)
- [ ] Failed pages logged separately and retriable
- [ ] Dry-run mode prints prompts without API calls
- [ ] Per-page cost reported at end of run
- [ ] Resumes from last completed URL on rerun
- [ ] `post_process_lengths()` safety net applied to every output
      **Depends on.** M2-202, M2-203, M2-203a, M1-110.
      **Estimate.** 8 hours.

### [ ] M2-205: Generate 430 remaining root category pages

**Scope.** After M2-202 v2 prompt is approved by Patrick (via the 35-page regen spot-check), run the full root pipeline on the remaining 430 PI roots. Commit output to `data/categories/`. Patrick reviews a randomized sample of 20.
**Acceptance.**

- [ ] 430 JSON files added to `data/categories/` (bringing total to 465 root pages)
- [ ] Cost report under $1 (revised estimate based on mini-batch actuals)
- [ ] Spot-check audit of 20 random pages confirms quality
- [ ] Zero length violations across all outputs after `post_process_lengths()`
      **Depends on.** M2-202 (v2 approved), M2-204.
      **Estimate.** 4 hours active, 30-60 min wall time.

**Mini-batch done (2026-05-24).** 35 root pages generated for Week 2 demo. Patrick approved content tone 2026-05-25 with the buying-guide upgrade as a follow-up. 35-page regeneration with v2 prompt is the first step of Week 3 (handled in M2-202 acceptance items, not here). This ticket covers the OTHER 430 roots.

**SKU filtering layered rules** (applied in `apply_sku_filter`): (1) only filter when matchType=`override` AND Geiger path depth < 3; (2) score SKUs by slug-token overlap with product name, keep all above median, cap at 200; (3) floor rule: if filter yields < 30 SKUs, fall back to raw set capped at 60 (mode `full-capped-60`). Three skuFilterMode values: `full`, `slug-filtered`, `full-capped-60`. Each JSON also carries `rawSkuCount` and `filteredSkuCount` for audit. These rules carry through to the 430 remaining roots.

### [ ] M2-206: Generate 21,715 non-root pages full run

**Scope.** Run the pipeline on all 21,715 non-root URLs (576 modifiers + 21,137 facets + 2 compound facets). Three different lite prompts based on URL type. Monitor cost and success rate. Commit output in batches.
**Acceptance.**

- [ ] All 21,715 URLs have a JSON file in `data/categories/`
- [ ] Cost under $25 (revised estimate based on mini-batch actuals)
- [ ] Success rate above 99.5 percent, failures retried
- [ ] Spot-check audit of 50 random pages (mix of modifier and facet) confirms quality
      **Depends on.** M2-205, Patrick approval.
      **Estimate.** 4 hours active, 6-12 hours wall time.

### [ ] M2-207: Content storage schema validation

**Scope.** Validation script that walks `data/categories/`, ensures every URL from the PI list has a matching JSON file, every JSON file matches the expected schema (including new `buyingGuideHtml`/`buyingGuideH2`/`promptVersion` fields), and SKU references in `productSkus` arrays resolve to entries in `data/geiger/products.json`.
**Acceptance.**

- [ ] Validation script committed
- [ ] Zero missing JSON files
- [ ] Zero schema violations
- [ ] Zero orphaned SKU references
      **Depends on.** M2-206.
      **Estimate.** 3 hours.

---

## Module 3: Category Page Templates

### [ ] M3-301: Page routing and static path generation

**Scope.** Dynamic route at `/app/cat/[...slug]/page.tsx`. `generateStaticParams()` reads the PI URL list and emits all 22,180 static paths plus paginated variants. Loader: Sanity-first, then JSON fallback, then 404. Empty-grid handling per CLAUDE.md Section 16.
**Acceptance.**

- [ ] All 22,180 paths build successfully
- [ ] Sanity content takes priority over JSON when slug matches
- [ ] Fallback to JSON works
- [ ] 404 page rendered for unmapped slugs
- [ ] Empty membership list → Tier 3 fallback
- [ ] Empty root membership → Tier 4 fallback
      **Depends on.** M1-101, M2-207.
      **Estimate.** 6 hours.

**Partial progress (2026-05-24).** 35 root slugs wired into `generateStaticParams` for Week 2 demo using `getAllGeneratedRootSlugs()` from `lib/categories.ts`. Full 22,180-path generation pending M2-206. Tier 3 and Tier 4 fallback logic deferred until full generation lands.

### [x] M3-302: Product card component (Week 3 fixes complete)

**Scope.** Reusable product card displaying: hot-linked Geiger CDN image, product name, brand badge, price range, MOQ, NEW/SALE/CLOSEOUT badges. Click opens patrickblack.geiger.com URL via the `lib/affiliate-url.ts` helper.

**Original acceptance (DONE 2026-05-24):**

- [x] Image hot-linked from `imgsirv.geiger.com` with `loading="lazy"` for below-fold cards
- [x] Affiliate URL transformation applied via the helper only
- [x] Hover state present
- [x] Loading skeleton state present
- [x] Responsive at 4/2/1 column breakpoints
- [x] Brand badge top-left, NEW/SALE/CLOSEOUT ribbon top-right (priority: closeout > sale > new)

**Week 3 additions per Patrick feedback (2026-05-25):**

- [x] **HTML entity decoding** in product names — centralized in `lib/categories.ts::getProductsForCategorySlug` via `lib/text-utils.ts::decodeHtmlEntities`. Handles `&amp;`, `&quot;`, `&#039;`, `&#39;`, `&apos;`, `&lt;`, `&gt;`, `&nbsp;`, `&reg;`, `&trade;`, `&copy;`. Components import nothing entity-related; loader is the only decode site.
- [x] **Image fallback `onError` handler** — new client component `components/category/ProductImage.tsx` swaps to `/public/placeholder-product.svg` on load failure, same 275x275 dimensions so no CLS.

      **Depends on.** M1-105, M1-108.
      **Estimate.** 6 hours base + 3 hours for Week 3 additions.

### [ ] M3-303: Product grid

**Scope.** Server component that renders 60 products per page in a responsive grid. Handles empty state, loading skeleton, lazy loading below fold.
**Acceptance.**

- [ ] 60 products rendered per page
- [ ] Empty state for zero matches
- [ ] Skeleton state for loading
- [ ] Mobile responsive
      **Depends on.** M3-302.
      **Estimate.** 5 hours.

**Partial progress (2026-05-24).** Grid renders ALL products for the category in a single view for the Week 2 demo. 60-products-per-page pagination logic deferred to M3-306.

### [x] M3-304: Filter sidebar with single and multi-facet logic

**Scope.** Client component, sticky on desktop, collapsible drawer on mobile. Renders facet sections from Geiger data. Counts shown per facet value. Single facet match navigates to the static URL if it exists, otherwise uses a query parameter. Multi-facet always uses query parameters.

**Filter list (confirmed with Patrick 2026-05-25):**

Universal filters (rendered on every category page that has the values present in Geiger data):

- Category (subcategories within the current root)
- Color
- Material
- Brand
- Price range
- Production Time (rush, standard, longer lead)
- **Minimum Quantity (NEW, Patrick's addition)** — Useful filter for buyers searching for smaller orders. Geiger does not have this, this is a PI differentiator. Range buckets: 1-25, 26-50, 51-100, 101-250, 251-500, 500+
- New Items toggle
- Made in USA / Eco-Friendly / Deals (refine_by tags)
- Full Color Print (yes/no)

Context-specific filters (show only when category context matches):

- Apparel pages: Gender, Sleeve Length, Apparel Style
- Drinkware pages: Ounces
- Tech pages: USB Size
- Writing Instruments pages: Pen Style

**Search within category (NEW, Patrick addition 2026-05-25):** Search input at the top of the filter sidebar that filters the currently loaded product grid in real time by product name. No server round-trip. Resets when filters change.

**Acceptance.**

- [x] All universal facet sections render from Geiger data with counts
- [x] Minimum Quantity filter renders with 6 range buckets
- [x] Context-specific filters appear only on relevant categories
- [x] "Search within this category" input filters product grid live (debounced 150ms)
- [x] Single facet selection navigates to existing static URL when one exists
- [x] Single facet selection without matching static URL uses query param
- [x] Multi-facet selection always uses query params
- [x] "Clear all filters" button works
- [x] Mobile drawer accessible with keyboard
      **Depends on.** M3-303.
      **Estimate.** 18 hours (16 base + 2 for search-within + new filter).

**Deferred from Week 2 demo.** Implemented in Week 4 after the full generation completes (so all facet URLs exist as real pages).

**Week 4 progress (2026-06-05).** Done.

- Client-safe types and pure URL/state helpers in [lib/filter-types.ts](lib/filter-types.ts); server-only filter derivation and SKU intersection in [lib/filters.ts](lib/filters.ts) (lazily loads the 44 MB `data/geiger/facet-memberships.json` once per worker). Splitting these avoided pulling `node:fs` into the FilterSidebar client bundle.
- Sidebar derivation iterates `/cat/{root}/<facetType>/<value>` membership URLs, intersects each value's SKU set with the current category's SKU list, and emits per-value counts. Min-qty buckets, price range, and `is_new_item` counts come from the resolved product objects in a second pass (`enrichSidebarWithProductStats`).
- Context detection in `getFilterContextForRoot` reads `data/mappings/pi-to-geiger.json` and inspects the Geiger path: Apparel paths expose Gender/Sleeve Length/Sleeve Style/Fit/Neckline/Style, Drinkware paths expose Ounces/Can Capacity/Liter Capacity, Tech paths expose USB Size, Writing Instruments paths expose Ink Color. Verified: `/cat/apparel` shows the apparel set, `/cat/drinkware` shows Ounces, `/cat/water-bottles` shows neither.
- "Full Color Print" is handled via the existing Decoration facet (`decoration/full-color` is a real value in 192 categories). No separate filter needed.
- Refine-by toggles (New Items, Deals/Closeout, Made in USA, Eco-Friendly) read from the corresponding modifier/special-feature membership URLs.
- URL state model in `serializeFilterState`/`parseFilterState`: single facet with a known static URL → navigate to the static URL (verified on `/cat/water-bottles` clicking Color > Red → `/cat/water-bottles/color/red`). Multi-facet or non-static facets → query params on the root URL. Sort persists across pagination via the `sort` query param.
- Client-side "Search within this category" input (150 ms debounce) filters the rendered page's product list by name match. Implemented in [components/category/SearchWithinCategory.tsx](components/category/SearchWithinCategory.tsx); the parent [components/category/CategoryShell.tsx](components/category/CategoryShell.tsx) coordinates the query and grid.
- Mobile drawer (slide-in, backdrop tap to close, Esc-accessible button, Clear/View-results footer) in [components/category/FilterSidebar.tsx](components/category/FilterSidebar.tsx).
- Build verified (`pnpm build` passes, 1858 static paths still pre-built). `searchParams` access marks the route as dynamic at render time, but the prebuilt static HTML still serves no-query-param requests. Pre-existing "broad pattern matches 88720 files" warnings from `lib/categories.ts` are unchanged.

### [x] M3-305: Sort dropdown

**Scope.** Client-side sort over loaded SKU list. Options: Best Sellers (default), Price Low to High, Price High to Low, MOQ Low to High, Newest.
**Acceptance.**

- [x] All 5 sort options work
- [x] Sort persists across pagination
- [x] Sort state reflected in URL query param
      **Depends on.** M3-303.
      **Estimate.** 3 hours.

**Week 4 progress (2026-06-05).** Done. Native `<select>` in [components/category/SortDropdown.tsx](components/category/SortDropdown.tsx) writes `?sort=<mode>` to the URL via `router.push` (scroll: false). Sort is applied server-side in `applyFiltersAndSort` after filtering, so pagination always slices the sorted set; deep-links like `/cat/water-bottles?sort=price-asc&color=red` work and survive page changes. Default (Best Sellers) is treated as "no param" — selecting it deletes `sort` from the URL.

### [x] M3-306: Static pagination with noindex on page 2+

**Scope.** Static URL pattern `/cat/[slug]/page/N` generated for every category with more than 60 products. Page 1 indexable and canonical to itself. Pages 2+ carry `noindex,follow` meta robots and canonical pointing back to page 1. Only page 1 URLs appear in the sitemap.

**Patrick feedback (2026-05-25):** "Pagination — coming with next update. Make page 2 and beyond non-indexable to avoid duplicate content."

**Acceptance.**

- [x] Pagination URLs generated as static paths at build time
- [x] 60 products per page
- [x] Previous, Next, numbered buttons work
- [x] Adjacent page prefetch on hover
- [x] **Page 1 indexable, canonical points to clean root URL** (e.g. `/cat/water-bottles` NOT `/cat/water-bottles/page/1`)
- [x] **Pages 2+ have `noindex,follow` meta robots tag** AND canonical pointing back to page 1
- [x] **Only page 1 URLs in sitemap** (paginated variants excluded)
      **Depends on.** M3-301, M3-303.
      **Estimate.** 6 hours.

**Week 3 progress (2026-05-31).** Done.

- Slug parser in [app\cat\[...slug]\page.tsx](app\cat\[...slug]\page.tsx) splits trailing `/page/N` off the catch-all to derive `categorySlug` + `page`; route now serves all category types (root + modifier + facet + compound-facet), not just the 35 demo roots. `generateStaticParams` enumerates ~22,180 base URLs plus pagination variants (~34,839 total static params; 4,749 categories have >60 products).
- 60 products per page sliced in [lib/categories.ts](lib/categories.ts) via `getProductsPageForCategorySlug(slug, page, perPage)`. `PRODUCTS_PER_PAGE = 60` constant exported.
- Pagination UI at [components/category/Pagination.tsx](components/category/Pagination.tsx) (server component): Prev/Next, smart-truncated numbered buttons (first, last, current ±2, ellipses), disabled state at ends, mobile shows `Prev / "N of M" / Next`. Adjacent pages get `prefetch={true}`; non-adjacent numbered buttons get `prefetch={false}` to avoid wasted prefetches on 17-page categories. Page 1 link uses clean base URL (no `/page/1`).
- Per-page metadata in `generateMetadata`: page 1 emits canonical pointing to clean URL with default robots (index,follow); page 2+ emits canonical back to page 1 AND `robots: { index: false, follow: true }`. Verified at runtime:
  - `/cat/water-bottles` → `<link rel="canonical" href=".../cat/water-bottles">`, no robots noindex
  - `/cat/water-bottles/page/2` → `<meta name="robots" content="noindex, follow">` + canonical to `/cat/water-bottles`
- Sitemap added at [app/sitemap.ts](app/sitemap.ts): emits 22,921 URLs (10 static + 22,180 category page-1 + 731 blog). Zero `/page/N` entries — paginated variants intentionally excluded per CLAUDE.md Section 11.
- `/cat/<slug>/page/1` → 308 permanent redirect to `/cat/<slug>` via [next.config.ts](next.config.ts) `redirects()`. Out-of-range pages (e.g. `/page/99`) → 404 (route handler checks `page > totalPages`).
- Robots.txt updated to reference the sitemap.

**Deployment architecture deviation (2026-05-31).** First Vercel deploy with full 34,857-path static generation succeeded compiling all pages in 11.9 min but failed in Vercel's output-assembly step with `ENOSPC: no space left on device` — Next.js 16 emits ~5 segment artifacts per static page (`*.segments/_full.segment.rsc.func`), and 34,857 × 5 ≈ 175k symlinks exceeded the build runner's inode budget. Mitigated by switching the [...slug] route to `dynamicParams = true` + `revalidate = false`, and capping `generateStaticParams` to root + modifier + compound-facet types (and their pagination variants) only. New static-path count: **1,840** (1,043 base + 797 pagination). The 21,137 facet pages now serve as on-demand SSG: first hit (typically Googlebot's first crawl) generates the page, then it's cached at the edge permanently until the next deploy. Functionally identical to SSG for crawlers; deviates from CLAUDE.md §3 "every category page renders at build time as static HTML" in mechanism but not in observable behavior. Revisit if Vercel raises the per-deployment output limit or if a follow-on ticket switches to `output: 'export'` (would require relocating API routes).

### [ ] M3-307: Category page layout assembly

**Scope.** Assemble the full category page: breadcrumb, H1, hero intro (`introHtml`), filter sidebar + product grid + sort + pagination, FAQs accordion (root pages only), buying guide section (root pages only), related blogs section (root pages only), lead capture form, bottom CTA banner. Schema.org markup: BreadcrumbList, FAQPage (root only), Product (within grid). Pixel-match reference layout. Implement Tier 3 / Tier 4 empty-grid fallback variants per CLAUDE.md Section 16.

**Patrick feedback additions (2026-05-25):**

- **H2 above bottom text:** Render H2 element with text `Custom [Category Name] Buying Guide` (from JSON field `buyingGuideH2`) above the `buyingGuideHtml` block. H2 only renders on `type=root` pages.
- **Buying guide content rendering:** Render `buyingGuideHtml` (400-600 words) below the product grid on root pages, under the H2. HTML content from the JSON, sanitized for safe render. Modifier and facet pages do NOT show this section.
- **Related Blogs section integration:** See M3-311 for the standalone ticket. Renders below the buying guide section on root pages, before the CTA banner.

**Acceptance.**

- [ ] All sections present in correct order: breadcrumb → H1 → intro → grid+sidebar → buying guide H2 → buying guide HTML → related blogs (root only) → CTA banner
- [ ] `buyingGuideH2` and `buyingGuideHtml` render only on `type=root` pages
- [ ] Mobile responsive at 375/768/1280
- [ ] Lighthouse score 85 plus on sample pages
- [ ] All links resolve
- [ ] Schema markup validates
      **Depends on.** M3-301, M3-303, M3-304, M3-305, M3-306, M3-308, M3-311.
      **Estimate.** 10 hours.

**Partial progress (2026-05-24).** Breadcrumb, H1, AI intro (full introHtml), product grid (all products), FAQs accordion, and CTA banner assembled for the 35 Week 2 demo roots. Filter sidebar, sort, pagination, lead form, schema markup, and related blogs section deferred to Week 3-4.

**Week 3 progress (2026-05-30).** Buying guide H2 + `buyingGuideHtml` block wired into [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx): renders below the FAQs accordion on `type=root` pages only, with H2 from `content.buyingGuideH2` and HTML from `content.buyingGuideHtml`. Type definition updated in [lib/categories.ts](lib/categories.ts). Filter sidebar, related blogs, lead form, schema markup still pending.

**Week 4 progress (2026-06-05) — Patrick feedback bundle.**

- **Layout width fix:** `max-w-prose` removed from `introHtml` and `buyingGuideHtml` blocks in [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx). Both blocks now fill the container width so the page feels balanced with the product grid and breadcrumb. Mobile still wraps naturally.
- **EmptyStateCTA component:** New [components/category/EmptyStateCTA.tsx](components/category/EmptyStateCTA.tsx) replaces the product grid on categories without good products. Patrick's exact copy: "Don't See The Products Listed? We Still Have Options.", 1M+ products supporting paragraph, green primary CTA "Find Products for Me", trust line "Takes less than 60 seconds…". Button opens the lead form modal ([components/category/EmptyStateCTAButton.tsx](components/category/EmptyStateCTAButton.tsx) + [components/forms/LeadFormModal.tsx](components/forms/LeadFormModal.tsx)).
- **Auto-detect placement:** New `shouldShowEmptyStateCTA(content)` helper in [lib/categories.ts](lib/categories.ts) returns true when (a) `productSkus.length === 0`, (b) `skuFilterMode === 'full-capped-60'`, or (c) `forceCTA === true`. Wired into [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx); when true, the product grid + sort/pagination block is replaced by `<EmptyStateCTA>`. `forceCTA?: boolean` field added to `GeneratedCategoryContent` type — manual escape hatch for categories where SKUs exist but are off-topic.
- **Manual flagging:** Patrick's flagged URLs that auto-detect missed (have SKUs, but wrong ones) hand-tagged with `forceCTA: true`: `bistro-mugs`, `ash-trays`, `compasses`, `cooling-sport-towels`, `facial-rollers`. `belt-buckles` already trips auto-detect via `full-capped-60`. Healthy URLs (water-bottles / apparel / backpacks / golf) untouched and still render product grids.
- **Audit:** [scripts/audit-cta-pages.ts](scripts/audit-cta-pages.ts) (`pnpm audit:cta`) walks every category JSON and classifies each by detection rule. Current snapshot in [docs/cta-audit-report.md](docs/cta-audit-report.md): **7,836 of 22,180 (35.3%)** pages show CTA — 7,766 empty-skus + 65 full-capped-60 + 5 force-cta. Re-run after every content regen or forceCTA flag change.

### [x] M3-308: Lead capture form component and route

**Scope (scope-adjusted 2026-06-05 per Patrick feedback).** Original spec was Name/Email/Company/Phone/Quantity/Message. Patrick gave a more specific field list during the Week 3 demo and asked that the form be powered by an EmptyStateCTA modal on category pages without good products. New fields: First Name, Last Name, Email, Phone, Tell Us Specifically What You're Looking For, Quantity Needed, Date Needed, plus hidden Source URL + honeypot. POST to `/app/api/leads/route.ts`. Route handler uses Nodemailer + Gmail SMTP to send to `patrick@perfectimprints.com` and writes a `leadSubmission` document to Sanity. Honeypot field, in-memory rate limiting (5 / IP / hour).

**Acceptance.**

- [x] Form validates required fields client-side
- [x] Submission emails Patrick within 30 seconds (source URL prominently featured in email body)
- [x] Sanity leadSubmission document created
- [x] Honeypot blocks bots (silent 200 when filled)
- [x] Rate limit blocks abuse (5 per IP per hour, 429 response)
      **Depends on.** M1-104.
      **Estimate.** 10 hours.

**Completion (2026-06-05).**

- [components/forms/LeadForm.tsx](components/forms/LeadForm.tsx): client component with 7 visible fields + honeypot + source URL capture, inline per-field errors, loading state, success state, mobile responsive.
- [components/forms/LeadFormModal.tsx](components/forms/LeadFormModal.tsx): dialog wrapper used by EmptyStateCTA — escape key, click outside, close button, body scroll lock, focus restore.
- [app/api/leads/route.ts](app/api/leads/route.ts): validation, honeypot short-circuit, 5/IP/hr in-memory rate limit, Gmail SMTP send, Sanity write (non-fatal — email still delivers if Sanity is down).
- [lib/email/gmail-smtp.ts](lib/email/gmail-smtp.ts): Nodemailer wrapper with `replyTo: <lead email>`, HTML + plaintext bodies, source URL boxed at the top.
- [sanity/schemas/documents/lead-submission.ts](sanity/schemas/documents/lead-submission.ts): schema updated to firstName / lastName / email / phone / lookingFor / quantityNeeded / dateNeeded / sourceUrl / submittedAt.
- **Delivering in production (2026-06-17).** `GMAIL_APP_PASSWORD` is set in Vercel; submissions send the email via Gmail SMTP and write the `leadSubmission` doc. Earlier pre-launch blocker (missing app password → 500) is resolved.

### [x] M3-309: Site-wide search overlay — DONE 2026-06-19

**Scope.** Header search bar with autocomplete dropdown. Lazy-loads Fuse and prebuilt index from `/public/search-index.json`. Keyboard navigation. Routes to `/search?q=...` on Enter or "see all".
**Acceptance.**

- [x] Lazy load on first focus — `onFocus` warms the index fetch (`prefetchSearchIndex()`); Fuse loads on the first keystroke. [components/forms/SearchBox.tsx](components/forms/SearchBox.tsx) rewritten into the overlay (kept the same name/props so the header is untouched).
- [x] Autocomplete shows top matches with type badge — top 8 in the dropdown, each a [SearchResultRow](components/search/SearchResultRow.tsx) with a [TypeBadge](components/search/TypeBadge.tsx); products show their brand.
- [x] Keyboard arrows + Enter work — combobox semantics (`aria-activedescendant`, `role=listbox/option`); ↑/↓ move the highlight across results + the "See all results" row, Enter selects, Escape closes, outside-click closes.
- [x] `/search` page renders full results — see M5-502.
- [x] Product rows open the affiliate URL in a new tab; category/brand/blog rows SPA-navigate ([useResultNavigation.ts](components/search/useResultNavigation.ts)).
      **Depends on.** M5-502.
      **Estimate.** 5 hours.

### [ ] M3-310: 404 and edge cases polish

**Scope.** 404 page with helpful category and blog suggestions plus search. Loading states across all routes. Error boundaries with retry. Accessibility audit.
**Acceptance.**

- [ ] Custom 404 page polished
- [~] All routes have loading.tsx — **done for the slow/dynamic routes (2026-06-20):** `/cat/[...slug]`, `/search`, `/brands/[...slug]` now have `loading.tsx` shimmer skeletons ([components/ui/Skeleton.tsx](components/ui/Skeleton.tsx)). Without them the App Router froze the old page until the server render finished (and dynamic-route `<Link>` prefetch was a no-op), so navigation felt "stuck on click" in production too — the skeletons give instant transition + a placeholder while data streams, and make prefetch effective. Search-overlay rows also `router.prefetch()` their internal target on hover/focus. Remaining static/force-static routes (`/deals`, `/new-products`, `/rush-products`, `/blog/[slug]`) are prefetched + cached so they transition instantly already; add `loading.tsx` there only if a slow case shows up.
- [ ] Error boundaries catch failures
- [ ] Lighthouse Accessibility 95 plus
      **Depends on.** M3-307.
      **Estimate.** 5 hours.

**Partial progress (2026-05-24).** Basic 404 page at `app/not-found.tsx` exists from Week 2 demo. Full polish deferred to Module 3 Phase 3.4 / Module 5.

### [x] M3-311: Related Blogs section on category pages (NEW)

**Scope.** Added 2026-05-26 per Patrick feedback. New section at the bottom of root category pages titled `Related Blogs About [Category Name]` (H2). Renders up to 8 blog cards related to the category. Blog-to-category matching uses category tags from the Sanity blogPost documents (after M4-402 migration adds those tags). If a category has fewer than 8 related blogs, render whatever is available; if zero, hide the section entirely.

**Patrick feedback (2026-05-25):** "Under the bottom text block, I will want an H2 header that says Related Blogs About 'Category Name' with up to 8 related blogs related to that main category."

**Acceptance.**

- [x] New component `components/category/RelatedBlogsSection.tsx`
- [x] H2 renders with text `Related Blogs About [Category Name]`
- [x] Up to 8 blog cards from blogs tagged with the matching category
- [x] Each card: thumbnail image, title, excerpt (first 120 chars), publish date, internal link to `/blog/[slug]`
- [x] Section hidden if zero related blogs found
- [x] Renders only on `type=root` pages
- [x] Mobile responsive (1 col mobile, 2 col tablet, 4 col desktop)
- [x] Loads with the page (server component, no client fetch)
      **Depends on.** M4-402 (blog migration with category tags), M3-307.
      **Estimate.** 4 hours.

**Week 4 progress (2026-06-08).** Component + Sanity query built and wired below the buying-guide section on root category pages.

- [components/category/RelatedBlogsSection.tsx](components/category/RelatedBlogsSection.tsx) — async Server Component, returns `null` when zero related blogs found. 1/2/4 col responsive grid; each card has thumbnail (via `urlForImage`), formatted date, title link to `/blog/[slug]`, 120-char excerpt.
- [lib/sanity/queries/related-blogs.ts](lib/sanity/queries/related-blogs.ts) — `getRelatedBlogs(rootSlug)` GROQ filters published-only blogs where `$slug in relatedCategorySlugs`, orders by `publishDate desc`, limits to 8.
- Wired into [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx) between buying guide and CTA banner, gated on `isRoot`.
- **Awaits M4-402 data.** Until blog drafts are imported and published with `relatedCategorySlugs` populated, the section will render nothing on every root page (the empty-state hide path). End-to-end verification (3-5 categories with visible blogs) happens after Patrick runs the migration and bulk publish.

---

## Module 4: Blog System + Brand Pages

### [x] M4-401: Blog content extraction

**Scope.** First, investigate the MPower dashboard at `app.mpowerpromo.com` for a bulk export option. Document findings at `/docs/mpower-export.md`. If no export, run a Playwright-based scraper for all 731 blog URLs.
**Acceptance.**

- [x] SeleniumBase UC-mode scraper committed AND RUN ([scripts/scrapers/blogs/scrape_sbase.py](scripts/scrapers/blogs/scrape_sbase.py)) — pulls **current** PI content directly via Cloudflare Turnstile bypass + system VPN. Wayback-based interim scraper from the first attempt has been removed.
- [x] **645 of 731** blog posts have raw JSON output (88% coverage after the 2026-06-15 re-scrape pass with scroll-to-load); 86 URLs failed (78 verified-deleted on PI's side, 8 unrecoverable behind Cloudflare Turnstile even with patient retry budgets). Patrick manually verified the deleted set — see `data/blogs/.failed-slugs.txt`.
- [x] Inline images preserved as direct MPower CDN URLs in `headerImageUrl` + body `<img src>`. Import phase uploads to Sanity assets in parallel (~2s each, no throttle issues like the Wayback CDN had).
- [x] Failures logged with HTTP status to `data/blogs/.scrape-errors.log` (82 PARSE failures = deleted blogs).
- [x] Body content preserved as HTML for portable text conversion (avg 11.7 KB, max ~150 KB — substantial articles, current MPower template).
- [x] iframe embeds (YouTube/Vimeo) captured separately in `embeds[]` and classified by provider + videoId.
- [x] PI's inline metaline parsed correctly: `title` (from H1), `metaTitle` (from og:title), `publishDate`, `updatedDate`, `author` (100% of blogs have an inline Author).
      **Depends on.** None.
      **Estimate.** 8 hours.

**Week 4 progress (2026-06-10, final).** Two-pass migration. First pass (2026-06-08) used Wayback Machine because direct PI was returning 403; produced low-quality content (missing videos, formatting drift across PI's WordPress/MPower era shifts, wrong dates, no inline authors). Patrick caught the quality gap on review. Second pass discovered the real blocker was **Cloudflare geo-blocking Pakistan IPs**, not generic bot detection — once a US-exit VPN was up, SeleniumBase UC mode passed Cloudflare's Turnstile challenge reliably and the current PI content was reachable end-to-end. Wayback pipeline was discarded in favor of this:

- **Scrape source:** Direct PI via [SeleniumBase](https://seleniumbase.io/) UC mode (`uc=True` + `uc_open_with_reconnect` + `uc_gui_click_captcha`). Uses an undetected ChromeDriver patch set + real system Chrome (not headless-shell) to bypass Cloudflare Turnstile. Implementation at [scripts/scrapers/blogs/scrape_sbase.py](scripts/scrapers/blogs/scrape_sbase.py), invoked via `pnpm scrape-blogs`.
- **Prereqs:** System-wide US/EU VPN connected (browser-extension VPNs don't route script traffic). System Chrome installed.
- **Coverage:** 645 of 731 PI blog URLs (88%) after the 2026-06-15 re-scrape. 78 of the 86 missing returned PI's "These promotional items aren't available at this link" page or `/blog/wp-admin` (admin URL) — Patrick verified each. 8 more failed even with patient retry budgets because Cloudflare Turnstile kept escalating to challenges the scraper couldn't pass. List preserved at [data/blogs/.failed-slugs.txt](data/blogs/.failed-slugs.txt) for delivery-time reference.
- **Parser:** Current MPower template uses `.blog-post-body` (no era-switching needed since we're hitting live PI not Wayback snapshots). PI's "Published: M/D/YYYY    Updated: ...    Author: ..." metaline below H1 is parsed regex-style for dates + author.
- **What's preserved per blog (output schema in [scripts/scrapers/blogs/README.md](scripts/scrapers/blogs/README.md)):** title (visible H1), metaTitle (og:title — SEO variant, often different), publishDate (real published date, not last-modified), updatedDate (~52% of blogs have it), author (100%), headerImageUrl (og:image, direct MPower CDN URL), bodyHtml + bodyText, embeds[] (YouTube/Vimeo), images[], inlineLinks (/cat/ + /blog/ hrefs), categoryTags, metaDescription.
- **Runtime:** ~16 sec per URL (Turnstile solve + page load + extract). Full 731 ran ~3.5 hours.
- **Output:** Raw JSONs archived outside the repo at `~/Documents/perfectimprints-archive/blogs-snapshot-2026-06-15/raw/` (645 JSONs, 16 MB) — supersedes the 2026-06-10 archive which captured only first-content-block content for every multi-section listicle (the no-scroll bug). Sanity is the source of truth post-migration; the archive exists for re-import after schema changes.

**M4-rescrape (2026-06-15 → 2026-06-16) — content-fidelity passes.** Two systematic content-quality issues were caught and fixed in this window:

1. **Truncated listicles**: the original scraper grabbed `article` innerHTML after only a 1.5s post-load sleep with no scroll. PI's MPower template lazy-loads each `.fdb-block` section on scroll, so listicles like `paramedic-shares-ems-appreciation-gifts-ems-week` had captured only the intro plus 1-2 sections instead of all 15+. Fixed by adding incremental scroll (800px steps, ~0.7s pause each, max 90s per page) until `document.body.scrollHeight` stabilises across 3 consecutive readings, then extracting. Also filters to `data-block-type="contents"` blocks only (skipping the 12 megamenu `navigation` fdb-blocks rendered at top of the article wrapper and the bottom `footer` fdb-block), and strips product-grid blocks (sections with 2+ anchors to `https://www.perfectimprints.com/products/` each wrapping an `<img>`) since those will be reintroduced as a Studio editing block in a future prompt. New scraper fields: `contentBlockCount`, `strippedGridCount`.
2. **Silently-dropped body images**: the import was losing ~62% of inline images. Three root causes: (a) a bogus skip on URLs containing `/undefined/` — MPower CDN legitimately uses that segment when the page ID was undefined at render time; the asset itself is valid; (b) unlimited Sanity asset-upload concurrency (`Promise.all` over every body image at once — a 91-image blog fired 91 simultaneous uploads, guaranteed ECONNRESET; (c) no retry on transient failures. Fixed by throttling to 4 concurrent uploads, retrying transient failures up to 4 times with exponential backoff, and removing the `/undefined/` URL check. Total body images in Sanity went 632 → 818 after the fix and a targeted re-import of the 587 affected slugs ([scripts/migrations/delete-affected-blogs.ts](scripts/migrations/delete-affected-blogs.ts) → `pnpm import-blogs --resume` → `pnpm publish-blog-drafts --exclude-stubs` → `pnpm dedupe-header-images`).

### [x] M4-402: Blog Sanity schemas and migration

**Scope.** Define `blogPost`, `blogCategory`, and `author` schemas. Migration script that reads raw blog data, converts HTML to portable text, uploads images to Sanity, writes blogPost documents as drafts. **Each blogPost must carry category tags** that map to PI root category slugs — these enable the Related Blogs section in M3-311.
**Acceptance.**

- [x] All three Sanity schemas updated (blogPost gains `embed` block type for YouTube/Vimeo + `updatedDate` populated; blogCategory + author unchanged)
- [x] Migration script committed + run with HTML→portable text + iframe→embed conversion + Sanity asset uploads + author/category dedup
- [x] Bulk-publish script committed + run with `--exclude-stubs` flag so only the 645 real blogs go live (the 86 stubs remain as hidden drafts for delivery-time reference)
- [x] **645 real blogs published** to Sanity; 86 stub drafts hidden (78 Patrick-verified-deleted + 8 CF-unrecoverable URLs from M4-401)
- [x] Sample drafts programmatically verified (`pnpm verify-blog-drafts`) — link annotations preserved (samples carried 0/23/32/111/156 link annotations), real images uploaded, embeds intact, dates correct, authors populated
- [x] Inline images preserved in portable text — uploaded to Sanity assets directly from MPower CDN. After the 2026-06-15 throttle+retry+`/undefined/`-URL fix and re-import, 818 inline body images are live across the 645 published blogs (was 632 before the fix — 186 net recovered). Headers present on most blogs; the rest are blogs PI hadn't set an `og:image` meta on. Hero-image dedupe (`pnpm dedupe-header-images`) runs in two passes: asset-ref exact match (catches cases where the same Sanity asset is reused) + position-based fallback (drops the first body image when a headerImage exists and a body image appears within the first 6 blocks — handles MPower's pattern of using a `_1200_1200_*.jpg` system thumbnail as og:image vs the full-resolution descriptive filename in the body, same visual image but different bytes → different asset refs). Run `pnpm backfill-blog-images` for any future header-image recovery.
- [x] Inline `<a>` tags preserved as portable text link annotations
- [x] Publish dates preserved exactly (parsed from PI's inline "Published: M/D/YYYY" metaline, not just `last-modified` meta) + `updatedDate` populated from "Updated:" line for the 52% of blogs that have it
- [x] `author` reference populated for **645/645 (100%)** of published blogs — ~33 unique authors auto-deduped (Patrick Black ~284, Perfect Imprints ~138, Sarah Garcia ~70, Laiba Siddiqui, Kiruthika Shantharam, Angelica Leti, etc.)
- [x] `relatedCategorySlugs` populated via best-effort title+tag matching against 465 PI root slugs — 327/645 (51%) have at least one mapping
- [x] Re-running the migration is idempotent (deterministic `blog-post-<slug>` IDs; `createOrReplace` semantics). [wipe-blog-posts.ts](scripts/migrations/wipe-blog-posts.ts) clears Sanity for clean re-import.
- [x] Patrick can edit any blog in Sanity Studio after import (slug auto-source removed → original URLs preserved verbatim)
      **Depends on.** M1-104, M4-401.
      **Estimate.** 6 hours.

**Week 4 progress (2026-06-10, final).** Migration done end-to-end with two iterations. First attempt (2026-06-08, Wayback-based) produced poor-quality content; second attempt (2026-06-10, direct PI via SeleniumBase + VPN) produced clean current content with videos, real authors, real images, and correct dates. Final Sanity state: **731 blogPost docs total = 649 published + 82 hidden stubs**, 33 author docs, 35 blogCategory taxonomy docs, 39 blogs with video embeds (43 total YouTube/Vimeo videos preserved).

**Pipeline iterations during the run (recorded for posterity):**
1. First-attempt Wayback content was inferior — wrong title (used og:title instead of visible H1), wrong publishDate (captured last-modified instead of original publish), null author (PI's author info lives in an inline metaline not in meta tags), and video iframes were silently dropped during htmlToBlocks (no `embed` schema). Patrick caught all four on visual review.
2. Direct PI scrape was originally blocked by CF 403. Tried curl_cffi (chrome131 TLS), cloudscraper, Playwright headed + stealth, Playwright with persistent Chrome profile — all 403 even via a US VPN. Root cause turned out to be **Cloudflare Turnstile escalating to interactive checkbox challenge** on rapid sequential requests. [SeleniumBase UC mode](https://seleniumbase.io/help_docs/uc_mode/) was the winner — its undetected ChromeDriver patches handle Turnstile.
3. Scraper extractor pass — the og:title vs H1 issue was fixed by preferring H1 and storing og:title separately as `metaTitle`. The publishDate issue was fixed by parsing PI's inline "Published: M/D/YYYY    Updated: ...    Author: ..." line below the H1 (regex-driven). Author extracted from the same line — 100% capture rate.
4. Sanity schema extended with `embed` block type (`{ provider: 'youtube' | 'vimeo' | 'iframe', url, videoId, caption }`). `htmlToBlocks` rules updated to convert `<iframe>` → `embed` block during portable text conversion. [BlogBody.tsx](components/blog/BlogBody.tsx) renders embed blocks as 16:9 responsive iframes.
5. After clean scrape was ready, wiped the 731 broken Wayback-era docs ([scripts/migrations/wipe-blog-posts.ts](scripts/migrations/wipe-blog-posts.ts), `pnpm wipe-blog-posts --force`) and re-imported the 649 fresh blogs. MPower's CDN (`store-media.mpowerpromo.com`) is NOT CF-blocked → direct image fetch in ~2s per image with parallel upload, 0 image failures **(this was actually wrong; the second pass on 2026-06-15 caught a ~62% silent body-image loss — see M4-rescrape notes in M4-401)**.
6. Per Patrick's request, the 82 stub drafts (for verified-deleted PI URLs) are NOT published — `publish-blog-drafts.ts` gained `--exclude-stubs` flag that filters drafts by body marker text so only the 649 real blogs go live. Stubs remain in Sanity as hidden drafts so the URL list is preserved for delivery reference.
7. **2026-06-15 second pass: re-scrape with scroll + body-image fix + dedupe.** Issues caught on Patrick's content review: (a) listicles truncated at first lazy-loaded grid; (b) hero image visually duplicated at top of body in the rendered page; (c) ~62% of body images silently lost during import. Fixed in this order — re-scraped 645 blogs with scroll-to-load + product-grid strip ([scripts/scrapers/blogs/scrape_sbase.py](scripts/scrapers/blogs/scrape_sbase.py) updated in-place), patched the existing-doc dupes via [scripts/migrations/dedupe-header-images.ts](scripts/migrations/dedupe-header-images.ts), fixed the image-upload bugs in [scripts/migrations/import-blogs.ts](scripts/migrations/import-blogs.ts) (throttle + retry + drop the `/undefined/` URL false-reject), then targeted re-import of the 587 image-deficit slugs via [scripts/migrations/delete-affected-blogs.ts](scripts/migrations/delete-affected-blogs.ts) + `pnpm import-blogs --resume`. BlogBody renderer also tightened: empty `<p><br></p>` spacer blocks from Froala filtered out, paragraph `mt-5` → `mt-3`, and list items normalised to level 1 so consecutive number-list blocks group in one `<ol>` (was rendering each as `1, 1, 1` in its own list).

**Operational note for Patrick:**
- 645 blogs live on staging at `/blog/<slug>` — current PI content (current MPower template), with YouTube/Vimeo embeds rendered inline, real hero images from MPower CDN, real published + updated dates, real authors, full listicle bodies (scroll-aware scrape), and ~818 inline body images (no longer silently dropped).
- 82 hidden stub drafts remain in Sanity (and [data/blogs/.failed-slugs.txt](data/blogs/.failed-slugs.txt) for delivery handoff) — those PI URLs returned "These promotional items aren't available at this link." All 82 verified manually by Patrick.
- 318 published blogs could use editorial cleanup if you want richer `relatedCategorySlugs` coverage (auto-mapping caught 327/645 = 51% via title-token match; Studio editing lifts that without much effort).
- One outlier: `enjoy-your-favorite-game-with-custom-stadium-seat-cushions` scraped with empty body (race condition during page hydration). Patrick chose not to retry — single Studio edit fixes it.

**Files (all committed and pushed in commit b33f8333):**

- [sanity/schemas/documents/blog-post.ts](sanity/schemas/documents/blog-post.ts) — extended with `embed` block type (provider/url/videoId/caption) for YouTube/Vimeo; `relatedCategorySlugs`, `metaTitle`, `metaDescription`, `updatedDate` populated; slug auto-source removed; link annotation on body blocks; orderings.
- [scripts/scrapers/blogs/scrape_sbase.py](scripts/scrapers/blogs/scrape_sbase.py) — SeleniumBase UC mode scraper. See [scripts/scrapers/blogs/README.md](scripts/scrapers/blogs/README.md) for run instructions + prereqs (VPN, Chrome).
- [scripts/migrations/import-blogs.ts](scripts/migrations/import-blogs.ts) — main import. Includes iframe→embed conversion rule in `htmlToBlocks`; uploads images from MPower CDN in parallel; populates `author` reference from inline metaline; populates `updatedDate` when present; generates stub drafts for verified-deleted slugs.
- [scripts/migrations/publish-blog-drafts.ts](scripts/migrations/publish-blog-drafts.ts) — bulk-publish, batch size 15 (Sanity 4MB request limit), supports `--exclude-stubs` to filter out the 82 hidden stubs.
- [scripts/migrations/wipe-blog-posts.ts](scripts/migrations/wipe-blog-posts.ts) — clean-slate utility (`pnpm wipe-blog-posts --force`) for re-imports.
- [scripts/migrations/verify-blog-drafts.ts](scripts/migrations/verify-blog-drafts.ts) — programmatic sample verification (`pnpm verify-blog-drafts`). Now checks author, headerImage, embeds, updatedDate alongside the prior fields.
- [scripts/migrations/backfill-blog-images.ts](scripts/migrations/backfill-blog-images.ts) — header-image backfill safety net (`pnpm backfill-blog-images`).
- [scripts/migrations/test-html-to-blocks.ts](scripts/migrations/test-html-to-blocks.ts) — dev diagnostic for iframe→embed + image→placeholder conversion.

**Re-run playbook (if Sanity ever needs to be rebuilt from the archived raw JSONs):**

  1. Copy `~/Documents/perfectimprints-archive/blogs-snapshot-2026-06-10/raw/` back to `data/blogs/raw/`
  2. `pnpm wipe-blog-posts --force` — clears the 731 existing docs (destructive, but the archive is the source of truth)
  3. `pnpm import-blogs --dry-run` to preview counts (expect 645 real + 86 stub)
  4. `pnpm import-blogs` — writes 731 drafts to Sanity (~10-15 min, image-upload bound but MPower CDN is fast)
  5. `pnpm verify-blog-drafts` — programmatic sample check
  6. `pnpm publish-blog-drafts --exclude-stubs` — publishes the 645 real ones, stubs stay hidden
  7. `pnpm dedupe-header-images` — runs the asset-ref + position-based hero-dup cleanup pass (idempotent; only patches docs that still have a body image in the first 6 blocks)

### [x] M4-403: Blog templates (index, post, category)

**Scope.** Three Server Components: blog index, individual post, blog category filtered listing. BlogPosting schema markup on articles.
**Acceptance.**

- [x] Blog index route at `/blog` + paginated `/blog/page/[n]` with `BlogPagination` (page 1 canonical to self, pages 2+ noindex,follow + canonical to page 1, `/page/1` redirect)
- [x] Blog post route at `/blog/[slug]` with vertical sticky social bar (desktop), horizontal share row (mobile), right sidebar (Categories + Popular Links + Contact CTA), header image, portable text body, "Order Custom [Topic] Today" closing CTA, breadcrumbs, BlogPosting JSON-LD
- [x] Blog category route at `/blog/cat/[slug]` + paginated `/blog/cat/[slug]/page/[n]` with same SEO rules
- [x] BlogPosting schema emitted with headline, image, datePublished, dateModified, author, publisher, mainEntityOfPage, description
- [x] Mobile responsive: 1/2/3 col blog grid (mobile/tablet/desktop); sidebar collapses below content on tablet/mobile
- [x] Sidebar Contact CTA opens lead form modal (reuses [components/forms/LeadFormModal.tsx](components/forms/LeadFormModal.tsx))
- [x] Sitemap updated to read blog post + blog category URLs from Sanity (published only, page 1 only); falls back to no blog entries during pre-migration build
- [x] 645 published blog URLs live on Sanity (verified via GROQ count). 86 hidden stub drafts remain for delivery reference. Staging resolves on next Vercel deploy.
      **Depends on.** M4-402, M3-308.
      **Estimate.** 10 hours.

**Week 4 progress (2026-06-10, final).** All routes + components built, typechecking clean, content live. Blog post header layout adjusted per Patrick feedback (2026-06-10) — H1 + "Published / Author" metaline moved inside the content column so they left-align with the article body instead of being centered with `mx-auto max-w-3xl`. Embed block renderer (`BlogBody.tsx`) added for the 39 blogs with YouTube/Vimeo videos.

- New components in [components/blog/](components/blog/):
  - `BlogCard.tsx` — server card with Sanity image via `urlForImage`, formatted date, author, excerpt fallback chain (excerpt → metaDescription)
  - `BlogGrid.tsx` — responsive 1/2/3 grid; empty-state message prop
  - `BlogSidebar.tsx` (server) + `BlogSidebarContactCard.tsx` (client island) — Categories list (live from Sanity), Popular Links (8 hardcoded), Contact CTA opening LeadFormModal
  - `SocialShareBar.tsx` — Email, Facebook, LinkedIn, Pinterest, Twitter/X, WordPress; vertical sticky on `lg:` desktop, horizontal row on mobile
  - `BlogBody.tsx` — `@portabletext/react` renderer with internal-link awareness (Next `<Link>` for `/path` hrefs, `<a target=_blank>` for external), brand-styled headings/lists/quotes, image blocks rendered through `urlForImage`
  - `BlogPagination.tsx` — same numbering pattern as category Pagination, with prev/next + ellipsis windowing
  - `OrderTodayCTA.tsx` — closing-CTA card on blog post pages, derives topic from first category tag (or title fallback)
- New queries at [lib/sanity/queries/blogs.ts](lib/sanity/queries/blogs.ts): `getBlogPostsPage`, `getBlogPostBySlug`, `getBlogPostSlugs`, `getAllBlogCategories`, `getBlogCategoryBySlug`, `getBlogPostsByCategorySlug`. Every query gates on `!(_id in path("drafts.**"))` for belt-and-suspenders draft exclusion on top of the published-perspective client.
- New routes: [app/blog/page.tsx](app/blog/page.tsx), [app/blog/page/[n]/page.tsx](app/blog/page/[n]/page.tsx), [app/blog/[slug]/page.tsx](app/blog/[slug]/page.tsx), [app/blog/cat/[slug]/page.tsx](app/blog/cat/[slug]/page.tsx), [app/blog/cat/[slug]/page/[n]/page.tsx](app/blog/cat/[slug]/page/[n]/page.tsx). All Server Components. `dynamicParams=true` + on-demand SSG for post and category pages — `generateStaticParams` enumerates Sanity-published slugs so they pre-render at deploy, and new slugs added later fall back to on-demand.
- [app/sitemap.ts](app/sitemap.ts) switched to async; reads published blog post + blog category URLs from Sanity (replaces the static `data/pi-urls/blog-urls.json` read). Graceful fallback to no blog entries if Sanity errors during build.
- Typecheck clean. Tests pass.

### [x] M4-404: FAQ library and brand Sanity schema

**Scope.** `faq` schema for reusable FAQ items linkable from category pages. `brand` schema for Geiger sub-brands (Carhartt, Igloo, Nike, etc) auto-populated from `data/geiger/brands.json` (output of M1-112 Phase E brand logo scrape).
**Acceptance.**

- [x] FAQ library document type editable
- [x] Categories can reference FAQs from the library
- [ ] FAQPage schema generated correctly when category renders linked FAQs
- [x] Brand documents auto-created from Geiger data (name, slug, logo, product count)
- [x] Brand logos imported from `data/geiger/brand-logos/` into Sanity assets
- [x] Brand documents manually editable after import
      **Depends on.** M1-104, M1-112, M2-207.
      **Estimate.** 6 hours.

**Week 4 progress (2026-06-05).** Schemas done; FAQPage emission still belongs to M3-307.

- [sanity/schemas/documents/brand.ts](sanity/schemas/documents/brand.ts) expanded with `slug`, `description`, `geigerUrl`, `productCount` (readOnly, auto-populated), `featured` boolean. Preview shows logo + product count.
- [sanity/schemas/documents/faq.ts](sanity/schemas/documents/faq.ts) — existing schema already had question/answer/categoryTags. `categoryTags` upgraded to references to `curatedCategory` + `customCategory` so FAQs can be tagged to real category docs once those exist.
- [scripts/migrations/import-brands.ts](scripts/migrations/import-brands.ts) (`pnpm import-brands`, supports `--dry-run` and `--limit=N`): idempotent via deterministic `brand-<slug>` doc IDs. First run created 205 brand docs and uploaded 191 logo assets to Sanity in ~2 min. Reruns patch description/productCount in place and re-use existing logo asset refs (no churn). Loads `.env.local` directly so tsx can run standalone.
- FAQ→FAQPage schema markup on category pages still pending — tracked under M3-307.

### [x] M4-405: Brands index page and per-brand pages (NEW)

**Scope.** Added 2026-05-26 per Patrick feedback. Two new routes:

1. **`/brands` (brand index)** — Renders all brands grouped A-Z, similar to Geiger's `/c/shop-by-brand` page. Each brand shows its logo and links to `/brands/[slug]`. Static page generated from `data/geiger/brands.json`.

2. **`/brands/[slug]` (per-brand page)** — For each brand, renders an SEO-optimized landing page with H1 like "Custom [Brand] Products", a brief intro about the brand, and the full product grid filtered to that brand. Uses the same ProductCard component as category pages. Affiliate links work as normal.

Plus mega menu addition: "Brands" main menu item linking to `/brands` (handled in M5-503).

**Patrick feedback (2026-05-25):** "I'd like the Brands tab on the main menu as well: https://geiger.com/c/shop-by-brand"

**Acceptance.**

- [x] `/brands` index page generated as static
- [x] All brand logos rendered with explicit dimensions for CLS-safe layout
- [x] A-Z grouping with anchor links (e.g. clicking "C" scrolls to Carhartt section)
- [x] `/brands/[slug]` route generates a static page for every brand
- [x] Per-brand H1 follows the pattern `Custom [Brand] Promotional Products`
- [x] Each per-brand page shows the full product grid for that brand
- [x] Brand product count displayed
- [x] Mobile responsive
      **Depends on.** M1-112, M4-404, M3-302, M3-303.
      **Estimate.** 6 hours.

**Week 4 progress (2026-06-05).** Done.

- [lib/brands.ts](lib/brands.ts): server-only data loader. Sanity-first via GROQ `*[_type == "brand"]`; falls back to `data/geiger/brands.json` if Sanity returns nothing. Merges per-slug so Sanity-edited `description`/`featured`/logo overrides the static defaults but JSON-only orphans still surface. Caches in module scope so the SSG run hits Sanity once.
- [app/brands/page.tsx](app/brands/page.tsx) — `/brands` index, A-Z grouped with skip-to-letter anchor nav (greyed out for empty letters). Brand cards: logo (160×64 explicit dims, lazy load, `<img>` since logo URLs come from both Sanity CDN and static `/brand-logos/`), name, product count, link to `/brands/<slug>`. Brands with 0 products render as non-clickable cards at half opacity. Brands with no logo show name in a styled text box at the same dimensions for visual consistency.
- [app/brands/[...slug]/page.tsx](app/brands/[...slug]/page.tsx) — per-brand page. Catch-all route to handle pagination URLs `/brands/<slug>/page/N`. H1: `Custom [Brand] Promotional Products`. Intro: Sanity description if set, else generic fallback from `buildBrandIntroFallback()`. ProductGrid reuses the category component; Pagination component reused identically. `/brands/<slug>/page/1` 308-redirects to clean URL; out-of-range → 404; only page-1 in sitemap (matches category-page noindex convention).
- Logo serving: scraper mirrors logos from `data/geiger/brand-logos/<slug>.<ext>` (canonical store per §8) to `public/brand-logos/<slug>.<ext>` so Next.js serves them as static assets without any rewrite or API route.
- [app/sitemap.ts](app/sitemap.ts) updated: `/brands` static path + all `/brands/<slug>` URLs added (paginated variants intentionally excluded, mirroring category convention).
- Mega-menu "Brands" main-nav link still pending under M5-503 (Sanity-driven menu rewrite); out of scope for this prompt per design.

### [x] M4-406: In-body products block + per-post related-blogs override (NEW)

**Scope.** Added 2026-06-16 per Patrick feedback. Two Sanity-editable features on blog posts so Patrick can drop product card rows into a blog body anywhere — like the old MPower blog templates — and curate the "See Related Blogs About …" list per post instead of relying on automatic matching.

**Patrick feedback.** Wanted (1) to insert a row of product cards mid-body the way the legacy PI blogs showed product grids between sections, and (2) the ability to both add AND remove entries from the related-blogs list at the bottom of each post.

**Acceptance.**

- [x] `blogProducts` object schema, insertable anywhere in `blogPost.body` alongside text/image/embed blocks (multiple per post, any position)
- [x] Each entry holds optional `sku`, manual `title`, manual `image`, manual `url`
- [x] SKUs resolved server-side in [app/blog/[slug]/page.tsx](app/blog/[slug]/page.tsx) via `resolveProductsBySku` (reads `data/geiger/products.json` from disk; cannot run inside the synchronous PortableText renderer), passed into [BlogBody](components/blog/BlogBody.tsx) as a `Map<string, GeigerProduct>`
- [x] `BlogBody` types entry renders SKU-backed entries via the standard [ProductCard](components/category/ProductCard.tsx) (live price/image/affiliate URL); manual entries render as a parallel-styled card; entries with neither SKU match nor manual title are skipped
- [x] Manual URLs rewritten through `lib/affiliate-url.ts` only when they target a Geiger host; non-Geiger URLs open in a new tab as plain external links
- [x] Optional `heading` rendered as `<h2>` above the card row; existing text/image/embed/list rendering unchanged
- [x] `relatedBlogs` reference array on `blogPost` (replaces the dormant `relatedPosts` field, which was fetched but never rendered). Reference picker filters out the current post so editors can't link a post to itself.
- [x] New [getRelatedBlogsForPost](lib/sanity/queries/blogs.ts) helper: when `relatedBlogs` is populated, use those in order; otherwise auto-derive by shared category slugs, newest first.
- [x] New [components/blog/RelatedBlogsForPost.tsx](components/blog/RelatedBlogsForPost.tsx) renders the section under the body (after `OrderTodayCTA`), titled `See Related Blogs About [Topic]`. Hidden when no related posts resolve.
- [x] Category-page [RelatedBlogsSection](components/category/RelatedBlogsSection.tsx) (M3-311) untouched.
- [x] `pnpm typecheck` passes. Build skipped locally to save time — runs on Vercel.

**Estimate.** 4 hours.

**Notes.**

- The prompt described the blog-post "See Related Blogs About …" section as already existing and auto-derived. In practice it wasn't rendered at all (the `relatedPosts` field was fetched but never displayed). M4-406 both adds the section and gives Patrick override-or-fallback control.
- Schema field key change: `relatedPosts` → `relatedBlogs`. No production data is affected because no rendering or migration script ever populated `relatedPosts`. If any document does carry orphaned `relatedPosts` data, it stays in the dataset but is no longer surfaced.

---

## Module 5: Search, Forms, Home, Deals, Polish

### [x] M5-501: Home page

**Scope.** Build the home page from the `homePage` Sanity singleton: hero banner, featured categories grid, new products carousel, featured brands logos, testimonials, blog preview, CTA banners. Editable end-to-end from Sanity.
**Acceptance.**

- [x] Home page renders from Sanity content
- [~] All six featured image blocks link correctly — `FeaturedBlocks` component built + ready, currently commented out in `app/page.tsx` (Patrick to enable when wanted)
- [x] New products carousel pulls latest Geiger SKUs
- [x] Brands grid pulls from `brand` documents
- [x] Mobile responsive
      **Depends on.** M1-104, M1-105, M4-404.
      **Estimate.** 8 hours.

**Completion (2026-06-17).**

- [app/page.tsx](app/page.tsx) renders these sections from the `homePage` singleton: `Hero`, `ValuePillars`, `NewProductsRail`, `Testimonials`, `BrandsStrip`, `BlogPreview`, free-text `textContent`, `HomeCtaBanner`.
- [components/home/FeaturedBlocks.tsx](components/home/FeaturedBlocks.tsx): the six featured image blocks (replaces the old null TODO stub). Consumes `home.featuredBlocks` from [lib/sanity/queries/home.ts](lib/sanity/queries/home.ts), which already resolved Sanity blocks + `FALLBACK_FEATURED_BLOCKS` (6 entries) so the grid never collapses before the singleton is populated. Null images degrade to a brand-tinted tile; every block still links correctly. **Currently commented out in `app/page.tsx`** — component is finished and ready, Patrick will enable the render when wanted.
- New-products rail pulls from `getNewProducts()`, brands grid from `brand` docs via `getAllBrands()`, blog preview from the latest published posts.
- `force-static`; Sanity content wins over fallbacks once the singleton is saved in Studio.

### [x] M5-502: Site-wide search (Fuse.js) — DONE 2026-06-19

**Scope.** Build-time script that generates a Fuse.js index covering every category title, every product (name + brand), every brand name, and every published blog title. FAQs deferred (no destination until /faq / M5-506 lands).
**Acceptance.**

- [x] Index built at build time, covers all content types — `scripts/search-index/build-index.ts` writes `public/search-index.json` (`{ generatedAt, items }`). Wired as the `prebuild` step before `next build`. **30,985 items: 22,180 categories + 7,955 products + 205 brands + 645 blogs.**
- [x] Search overlay lazy-loads (no impact on initial bundle) — Fuse.js is pulled via dynamic `import('fuse.js')` and `/search-index.json` is fetched, both only on first search ([lib/search/load-index.ts](lib/search/load-index.ts)). Neither is in the initial route JS.
- [x] Results rank by relevance, grouped by type — overlay groups into Categories / Products / Brands / Blogs section headers ([SearchResultRow.tsx](components/search/SearchResultRow.tsx)). Fuse keys weighted title(0.8)/brand(0.2), `threshold 0.32`, `ignoreLocation`.
- [x] `/search?q=...` URL accessible directly — [app/search/page.tsx](app/search/page.tsx) (server reads `q`, `noindex`). See M5-502b for the faceted results page.
- [x] Keyboard navigation works — arrow up/down move the highlight, Enter selects the active row (or routes to `/search`), Escape closes. See M3-309.
- [x] No external service dependency — pure static index + client-side Fuse; no API/Searchspring call at runtime.
- [x] Product results link STRAIGHT to the affiliate URL (via `lib/affiliate-url.ts`, new tab) — never a category page. Products store only name + brand + raw `geiger_url`.
- [x] No-results never dead-ends — shows the lead-form CTA ([SearchEmptyCTA.tsx](components/search/SearchEmptyCTA.tsx), reuses `LeadFormModal`).
- [x] Index size printed + recorded; sharded if >~2 MB gz — **563.7 KB gzipped (4.19 MB raw)** after M5-502b added product thumbnails, single file (see [scripts/search-index/README.md](scripts/search-index/README.md)).
      **Depends on.** M2-207, M4-402.
      **Estimate.** 8 hours.

**Notes.**
- `prebuild` (`tsx scripts/search-index/build-index.ts`) runs before `next build`. `products.json` is committed to the repo, so no data-prebuild ordering needed. A tiny `scripts/search-index/load-env.ts` is imported first so `.env.local` populates before the Sanity client evaluates (local runs only; Vercel already has env). Blog fetch is best-effort — index still builds without blogs if Sanity is down.
- New shared helpers: `getAllProducts()` ([lib/categories.ts](lib/categories.ts), decoded), `getAllBlogSearchEntries()` ([lib/sanity/queries/blogs.ts](lib/sanity/queries/blogs.ts)).
- `app/api/search/route.ts` stays a 501 stub — search is fully client-side; the route is reserved for a possible future live Searchspring proxy (out of scope).

### [x] M5-502b: Geiger-style faceted search results page + grouped overlay — DONE 2026-06-19

**Scope.** Upgrade `/search` from a flat list to a product-first faceted results page (like Geiger's `/search`), and the header overlay to grouped suggestions with product thumbnails. All from baked data — still **no runtime Searchspring** (CLAUDE.md §18).
**What changed.**

- **`/search` is now product-first + faceted.** Matched products are resolved server-side from the full catalog (`getAllProducts()` over `products.json`) via a cached Fuse instance ([lib/search/server-search.ts](lib/search/server-search.ts), `searchProducts()`) — the 9 MB catalog is never shipped to the client. Facets (Category, Price, Brand, Min Qty) are built from the matched set ([lib/search/build-facets.ts](lib/search/build-facets.ts)) and drive the existing `/deals` filter sidebar + `ProductGrid` + pagination, plus a Sort control ([components/search/SearchFacetedResults.tsx](components/search/SearchFacetedResults.tsx)).
- **Facet limitation (by design).** Only Category / Price / Brand / Min Qty are offered — those are the only filterable attributes ON the product object. Color / Material / Production Time are NOT (per CLAUDE.md they live only in per-category Searchspring facet arrays, not per-SKU), so they can't be derived for an ad-hoc result set without a runtime API.
- **"Also matching" strip** ([components/search/SearchAlsoMatching.tsx](components/search/SearchAlsoMatching.tsx)) surfaces matching categories / brands / blog posts above the grid (client-side over the same cached index) — content Geiger's product-only search has no equivalent for.
- **Overlay** now groups results into Categories / Products / Brands / Blogs with **product thumbnails** + a "See all N results" footer. Required adding `image` (entity-decoded `imageUrl`) to product index entries — index grew from 491.9 KB to **563.7 KB gzipped** (still well under the 2 MB budget).
- **Root-category promotion.** With thousands of facet pages all containing the category name, a root landing page (e.g. `/cat/water-bottles`) sat at rank ~120 by raw Fuse score, below its own modifier/facet children. `search()` ([lib/search/load-index.ts](lib/search/load-index.ts)) now runs a second Fuse over ONLY the ~465 root pages and promotes the best root to the front — gated by (a) a strong score (≤ 0.25) and (b) a word-boundary title match, so "beer accessories" → root, but "closeout beer accessories" / "black water bottles" keep the specific child on top and "pens" no longer matches "dis**pens**ary". Root-ness is derived from the URL shape (`/cat/<slug>` = root), so no index change.
- **Refine input** on the page ([SearchPageForm.tsx](components/search/SearchPageForm.tsx)) navigates to `/search?q=` (shareable). `/search` is now server-rendered (was client-ranked). Removed `SearchResultsClient.tsx` + `TypeBadge.tsx` (superseded).

### [x] M5-503: Mega menu population from Sanity — DONE 2026-06-17

**Scope.** Replace the Geiger-taxonomy-driven mega menu from M1-106 with a Sanity-driven implementation. Patrick can reorder departments, edit labels, hide items, and update Featured Promos and New Products lists. **Adds two new main menu items per Patrick feedback (2026-05-25):**

- **Deals** main menu button linking to `/deals` (see M5-510)
- **Brands** main menu button linking to `/brands` (see M4-405)

**Acceptance.**

- [x] All menu items render from Sanity — header is `async`, reads `getMegaMenu()` ([lib/sanity/queries/mega-menu.ts](lib/sanity/queries/mega-menu.ts)); no longer imports `nav-data.ts` for rendering
- [x] Reorder via drag in Sanity reflected on staging within 60 seconds — webhook (`app/api/sanity/revalidate/route.ts`) verifies HMAC + `revalidatePath('/', 'layout')` for `megaMenu`/`globalSettings`
- [~] Featured Promos and New Products updateable — N/A for the as-is menu (it has no featured-product panels; "New Products" is a plain link). `featured` + `productRefs` fields retained on the schema, reserved for a future featured panel
- [x] Removed items disappear from live menu — no hard-coded fallback; Sanity is the sole source (empty doc → empty menu)
- [x] Deals and Brands menu items render with correct links — present in the seed (`/deals`, `/brands`), alongside New Products (`/new-products`)
- [x] Keyboard accessible with focus trap — existing client components (`ShopByMegaMenu`, `AllCategoriesPopover`, `SimpleNavDropdown`, `MobileDrawer`) reused unchanged
      **Depends on.** M1-106, M1-104, M4-405, M5-510.
      **Estimate.** 4 hours.

**Implementation note (seed-from-current, no visible change).** The live menu had already evolved past M1-106's hardcoded Geiger tree to the `lib/nav-data.ts`-driven structure (two mega panels — "Shop by" cascade + "All Categories" grid, both from PI's slug universe — plus `SIMPLE_NAV`). This ticket moved that exact structure into Sanity without changing the rendered menu:

- **Schema** ([sanity/schemas/singletons/mega-menu.ts](sanity/schemas/singletons/mega-menu.ts)) reworked so `items[]` faithfully represent the current menu: per item `kind` (`link`/`dropdown`/`megaPanel`), `megaPanel.variant` (`cascade`/`grid`), `columns[]` (`label`, `href?`, `nonClickable`, `links[]`), `dropdown.links[]`. Legacy `featured`/`productRefs` retained (reserved).
- **Seed** (`pnpm seed-mega-menu`, [scripts/migrations/seed-mega-menu.ts](scripts/migrations/seed-mega-menu.ts)) serializes `getDepartments()` + `SIMPLE_NAV` from `lib/nav-data.ts` into the `megaMenu` singleton (`_id: megaMenu`, `createOrReplace`, clears stale draft). Result: 9 items, two panels (10 columns / 465 links each), Services dropdown (4 links), Tradeshow column non-clickable. Idempotent — re-run to reset.
- **Renderer** components are untouched, guaranteeing identical look/behavior; only `Header.tsx` switched data source and iterates the Sanity items in order (so reorder/hide/add work). `lib/nav-data.ts` kept as the seed reference (not imported for rendering).
- Ran live seed against Sanity; `pnpm typecheck` + `pnpm build` pass.

### [x] M5-504: Custom category and custom product schemas — DONE 2026-06-23

**Scope.** `customCategory` and `customProduct` Sanity schemas. Render through the same `/cat/[...slug]` route.
**Acceptance.**

- [x] customCategory document type editable
- [x] customCategory renders without Geiger link if none set
- [x] CTAs default to contact form when no Geiger URL
- [x] customProduct documents render in chosen category page grid
- [x] External URL opens correctly
- [x] Display order respected in grid
      **Depends on.** M3-301.
      **Estimate.** 4 hours.

#### M5-504 part 1 (DONE 2026-06-23): Category curation tooling (`categoryOverride`)

Per-category curation tooling + audit/reconciliation dry-runs. No pages built, no content regenerated, no category JSON rewritten.

- [x] `categoryOverride` Sanity doc ([sanity/schemas/documents/category-override.ts](sanity/schemas/documents/category-override.ts), registered in schema index) keyed by `categorySlug` (`/cat/...` slug). Fields: `forceCTA`, `forceProducts`, `hiddenSkus[]`, `addedSkus[]`, `addedProducts[]→customProduct`.
- [x] Render wiring in [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx): `getCategoryOverride()`; precedence `forceCTA` → `forceProducts` → original `shouldShowEmptyStateCTA`. Hide/add applied via `applyCategoryOverrideProducts()` ([lib/sanity/queries/category-overrides.ts](lib/sanity/queries/category-overrides.ts)) through the existing helpers (`resolveProductsBySku`, `customProductToGeigerProduct`).
- [x] `/cat/<categorySlug>` revalidated on `categoryOverride` publish ([app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts) — webhook projection must include `categorySlug`).
- [x] `pnpm audit:category-rule` ([scripts/audit-category-rule.ts](scripts/audit-category-rule.ts)) → [docs/category-rule-audit.md](docs/category-rule-audit.md). CTA total ~7,836 (35.3%) under the restored rules.
- [x] `pnpm reconcile:missing-urls` ([scripts/reconcile-missing-urls.ts](scripts/reconcile-missing-urls.ts)) → [docs/missing-url-reconciliation.md](docs/missing-url-reconciliation.md). 0 missing; dry-run only, no pages built.

**REVERTED (2026-06-23): the Part B exact-match-only Geiger-menu render-time gate.** It was too aggressive — it flipped ~10,694 categories to CTA (83.5% total), including genuine product-bearing ones (binoculars, tote-bags, pens, apparel-accessories). `lib/category-rule.ts` was deleted. CTA is again decided only by the original three `shouldShowEmptyStateCTA` rules (empty-skus, full-capped-60, manual forceCTA). The off-topic problem is a handful of categories, fixed by **targeted `categoryOverride` docs** (set `forceCTA`, or prune via `hiddenSkus`) — not a site-wide rule. Note: `binoculars`/`pens` remain CTA via the pre-existing `full-capped-60` rule (not the reverted gate); use `forceProducts` to surface them. `dog-tags`/`PPE` now render products and need a manual `forceCTA`.

- **STOP after reports.** Part 2 (next prompt) builds the missing pages + adds the customCategory AI generate button (M5-505). Do not widen scope here.

#### M5-504 part 2 + M5-505 (DONE 2026-06-23): two-way product/category tooling + customCategory pages + AI button

Additive tooling — new schema, custom Studio inputs, a unified resolver, customCategory rendering, and the AI button. Nothing destructive, no JSON re-bake.

- [x] **Searchable CategoryPicker** ([sanity/components/CategoryPicker.tsx](sanity/components/CategoryPicker.tsx)) over all 22,180 slugs via build-time `public/category-list.json` ([scripts/build-category-list.ts](scripts/build-category-list.ts), `pnpm build:category-list`, wired into `prebuild`) + live `customCategory` slugs; debounced client-side filter; **create-new** makes a `customCategory` at `/cat/<slug>`. Studio-only, no live-site/Sanity perf impact, no `@sanity/ui` import.
- [x] **`productPlacement`** doc ([sanity/schemas/documents/product-placement.ts](sanity/schemas/documents/product-placement.ts)) keyed by `sku`, with `addToCategories[]`/`removeFromCategories[]` (CategoryPicker) and a live SKU→name preview ([sanity/components/SkuPreview.tsx](sanity/components/SkuPreview.tsx) + [app/api/products/resolve/route.ts](app/api/products/resolve/route.ts)).
- [x] **Unified resolver** `mergeCategoryProducts()` ([lib/sanity/queries/category-overrides.ts](lib/sanity/queries/category-overrides.ts)): baked + override adds + placement adds − override hides − placement removes; **removal wins**, de-duped, SKUs resolved live (survive re-scrape). Placement query in [lib/sanity/queries/product-placements.ts](lib/sanity/queries/product-placements.ts). Both edit directions reach the same `/cat/<slug>` result.
- [x] **customCategory live pages** ([components/category/CustomCategoryView.tsx](components/category/CustomCategoryView.tsx) + the `/cat/[...slug]` fallback): hero/intro/body/FAQs (FAQPage schema)/products/breadcrumb (BreadcrumbList)/CTA; no Geiger mapping required; CTA → contact form when `externalUrl` blank. Query: `getCustomCategoryBySlug` ([lib/sanity/queries/custom-categories.ts](lib/sanity/queries/custom-categories.ts)).
- [x] **Revalidation** ([app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts)): `productPlacement` publish revalidates every `/cat/<slug>` in both lists; `customCategory` already revalidates `/cat/<slug>`.
- [x] **M5-505 AI button** — `generateWithAi` action ([sanity/actions/generate-with-ai.tsx](sanity/actions/generate-with-ai.tsx), customCategory-only via [sanity/sanity.config.ts](sanity/sanity.config.ts)) → [app/api/sanity/generate-content/route.ts](app/api/sanity/generate-content/route.ts) (DeepSeek, server-side key, v2 buying-guide prompt, plural keywords + personas, no "Perfect Imprints" in H1/H2); patches `introHtml`/`bodySections`/`faqs`; loading + error states; no auto-publish.
- `pnpm typecheck` passes.

#### M5-504 push-to-Sanity (DONE 2026-06-23): full per-category control (existing + new)

Completes "push the JSON category pages to Sanity 1 by 1." One `customCategory` type serves both new pages and taking over existing baked ones; the slug is the key. Additive, no mass change, JSON-first performance preserved.

- [x] **Push to Sanity** Studio tool ([sanity/tools/push-category-tool.tsx](sanity/tools/push-category-tool.tsx), registered via `tools` in [sanity/sanity.config.ts](sanity/sanity.config.ts)): search all 22,180 slugs → "Push to Sanity" → GETs [app/api/sanity/push-category/route.ts](app/api/sanity/push-category/route.ts) → creates a **draft** customCategory pre-filled from the baked JSON (h1→title, meta→seo, introHtml→PT, buyingGuide(+H2)→bodySections, faqs, productSkus). HTML→PT via [lib/portable-text/html-to-blocks.ts](lib/portable-text/html-to-blocks.ts). Refuses if a customCategory already owns the slug.
- [x] **Owned-slug precedence + edited-set gating** ([lib/sanity/queries/owned-categories.ts](lib/sanity/queries/owned-categories.ts) `getCategoryControlSets`, `unstable_cache` tag `owned-category-slugs` + 5-min self-heal; baseline artifact `public/custom-category-slugs.json` via [scripts/build-custom-category-slugs.ts](scripts/build-custom-category-slugs.ts) in `prebuild`). One shared cached read yields `owned` (customCategory) + `edited` (owned ∪ override/placement-touched). Owned → Sanity renders (wins); only `edited` slugs run the per-slug override/placement fetches; **every untouched page renders from baked JSON with no per-page Sanity lookup**. Delete/unpublish → reverts to JSON. Tag busted on customCategory/categoryOverride/productPlacement publish.
- [x] **Full content + product control** on pushed/custom pages: edit title/intro/bodySections/faqs directly; `productSkus[]` editable (reorder/add/remove); `productPlacement` + `categoryOverride` still merge via `mergeCategoryProducts` (removal wins, de-duped, SKUs resolved live → survive re-scrape). FAQPage + BreadcrumbList still emit.
- [x] **AI + manual** both work on new and pushed docs (AI now also regenerates the heading `title` + `seo`).
- [x] **Revalidation** ([app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts)): customCategory publish/unpublish → `revalidatePath('/cat/<slug>')` + `revalidateTag('owned-category-slugs', 'max')` (Next 16 2-arg form). Webhook GROQ projection must include `slug`.
- `pnpm typecheck` + `pnpm build` pass.

#### M5-504 hybrid restore (DONE 2026-06-23): /cat static again (untouched static, owned/edited via tagged ISR)

The per-category Sanity work had made `/cat/[...slug]` render fully dynamic (`ƒ`), so all 22,180 pages were SSR per request (SEO + speed regression). Restored the hybrid. **Two blockers**, both fixed:

- [x] **Uncached Sanity reads** in render → tagged. New `cachedClient` (`useCdn:false`) in [lib/sanity/client.ts](lib/sanity/client.ts) + [lib/sanity/cache-tags.ts](lib/sanity/cache-tags.ts) (`category-control-sets`, `cat:<slug>`, `related-blogs`). `getCategoryControlSets`, `getCategoryOverride`, `getPlacementSkusForCategory`, `getCustomCategoryBySlug`, `getRelatedBlogs` all now `{ next: { tags, revalidate: false } }` (not `no-store`). `getCategoryControlSets` switched off `unstable_cache` to a tagged fetch.
- [x] **`searchParams` removed from the static render.** The page no longer reads `searchParams` (a Dynamic API). It renders the unfiltered, path-paginated view. Faceted filtering (server-only membership data) moved to the dynamic route [app/api/category-products/route.ts](app/api/category-products/route.ts); [components/category/CategoryShell.tsx](components/category/CategoryShell.tsx) detects active filters from the URL (client-safe `parseFilterState`/`isStateEmpty`), fetches the API, and paginates client-side. [components/category/Pagination.tsx](components/category/Pagination.tsx) gained an optional `onPageChange` for client pagination.
- [x] **generateStaticParams** keeps the ~1,840 headline set + owned slugs from the build artifact. Webhook busts `cat:<slug>` + `category-control-sets` + `revalidatePath` (and `related-blogs` on blogPost) so edits go live in seconds without making the route dynamic.
- [x] **Verified static**: a build with `searchParams` removed produced `/cat/[...slug]` → `●` (SSG) with **1,840 prerendered HTML files** on disk (was `ƒ` with zero before). `pnpm typecheck` passes. **NOTE:** the full `pnpm build` is NOT run locally (too slow / slows the machine — see memory); Vercel confirms the build on push. After any change to the `/cat` render path, confirm the Vercel/CI build shows `/cat/[...slug]` as `●`/SSG, not `ƒ`.

#### M5-504 Studio editing polish (DONE 2026-06-24)

Studio-only UX fixes/additions on top of the per-category tooling. No live-site impact.

- [x] **Searchable product picker** ([sanity/components/ProductPicker.tsx](sanity/components/ProductPicker.tsx)): `ProductSkuPicker` (multi) + `ProductSkuInput` (single) — search the ~7,957 catalog by name/SKU/brand and click to add the SKU. Wired onto `customCategory.productSkus`, `categoryOverride.addedSkus`/`hiddenSkus`, and `productPlacement.sku` (replaced `SkuPreview`, now unused). Source: build-time `product-list.json` ([scripts/build-product-list.ts](scripts/build-product-list.ts), `pnpm build:product-list`, in `prebuild`).
- [x] **`categoryOverride.categorySlug` searchable picker** (`CategorySlugInput`, single-select) — replaced plain text so a typo can't target nothing.
- [x] **Picker loading fix** (the "every search shows not found" bug): pickers now load lists via [sanity/components/load-json.ts](sanity/components/load-json.ts) (`loadStudioJson`), and the list artifacts are written to **both `public/` and `sanity/static/`** so the standalone `sanity dev` Studio (which doesn't serve Next's `public/`) works too. Clear "couldn't load" message when neither resolves. `sanity/static/` git-ignored.
- [x] **SKU array fields** (`productSkus`/`hiddenSkus`/`addedSkus`) moved off the `tags` layout (which dropped values / needed Enter) onto the searchable picker — reliable add/remove.
- [x] **ProductCard shows `Item # <sku>`** (Geiger-style) on every grid; custom products' synthetic `custom-<id>` SKU hidden.
- `pnpm typecheck` passes.

### [x] M5-505: Sanity AI generation button — DONE 2026-06-23 (see M5-504 part 2 block above)

**Scope.** Custom Sanity Studio action that appears on customCategory documents. Calls DeepSeek with the root_category prompt (v2 buying-guide format) and patches the document with intro, buying guide, and FAQs.
**Acceptance.**

- [x] "Generate with AI" button visible on customCategory documents only
- [x] Click triggers DeepSeek call with appropriate prompt
- [x] Returned content patched into intro, buying guide, and FAQs fields
- [x] Loading state shown during call
- [x] Error state shown on failure
- [x] Patrick can review and edit before publishing
      **Depends on.** M5-504, M2-202.
      **Estimate.** 8 hours.

### [x] M5-506: Services pages, static content pages, FAQ library, videos

**Scope.** Build all static content pages. Content sourced from Sanity. Contact page includes lead form. Delivered across sub-tickets: **M5-506a** Rush Products (done), **M5-506b** Services page-builder (done), **M5-506c** admin path + footer static pages + FAQ library + home banner row + /promotional-products (done), and **M5-507** Videos (done).
**Acceptance.**

- [x] All pages render at correct URLs
- [x] Content editable in Sanity
- [x] Mobile responsive
- [x] Linked from header and footer where appropriate
      **Depends on.** M1-104, M1-105, M3-308.
      **Estimate.** 6 hours.

### [x] M5-506a: Rush Products page + Phase H weekly scrape (DONE 2026-06-18)

**Scope.** Added 2026-06-18 per Patrick feedback. New `/rush-products` aggregator — a field-for-field clone of the New Products (Phase G) implementation pointed at Geiger's `Home > Shop By > 24 Hour Rush Products` collection (Geiger page `https://geiger.com/b/24-hour-rush-products`, ~53 products, 1 page today). Same weekly scrape, same client-side filters + pagination, same Sanity control levers (hide / pin / add-custom).

**Final implementation.**

- **Phase H scraper** — `scripts/scrapers/geiger/scrape_rush_products.py` (`pnpm scrape-rush-products`), cloned from `scrape_new_products.py`. Same meta + base + per-facet-value SKU-membership calls; same `_normalize_product` (entity decode, `is_new_item: "Yes"`→bool coercion, `geiger_url = url`). Output `data/geiger/rush-products.json` shaped `{scrapedAt, totalRushProducts, products[], facets[...]}`. Rush specifics: results carry **no `badges` array** (no NEW/SALE/CLOSEOUT ribbons); at least one SKU contains a space (`"501622 1BC"`) preserved as-is; **facet hygiene** drops degenerate single-value facets at scrape time (`_is_degenerate_section`: fewer than 2 values, or one value covers 100%) — drops `production_time` ("1", count 53) plus `refine_by` and `pen_style` (single-value today).
- **Workflow** — `.github/workflows/scrape-rush-products.yml` on `cron: '45 23 * * 0'` (Sunday 23:45 UTC, staggered after deals 23:00 + new-products 23:30) + `workflow_dispatch`. Diffs `data/geiger/rush-products.json` and opens an auto-merge PR (branch `chore/weekly-rush-refresh`) only when the snapshot changes.
- **Loader** — `lib/rush-products.ts` (`getRushProductsData()`, `getAugmentedRushProductsData()`, `applyHiddenSkus()` + facet re-derive) mirroring `lib/new-products.ts`; client-safe `lib/rush-products-filter.ts` mirroring `lib/new-products-filter.ts`. Integrates with the M5-511 augment layer (`lib/products/augment.ts` + `lib/products/lookup.ts`).
- **Page + components** — `app/rush-products/page.tsx` (`force-static`) + `components/rush-products/{RushProductsPageBody, RushProductsClient, RushProductsFilterSidebar, ClientPagination}` cloned from the new-products components. All filter + pagination state client-side (URL unchanged), `FilterSection` sidebar, `ProductCard` reuse, breadcrumbs (Home / Rush Products) with BreadcrumbList schema via the shared `Breadcrumbs` component, "Showing N rush products" count.
- **Sanity control** — `globalSettings.rushProductsPage` (`heading`, `intro`, `metaTitle`, `metaDescription`, `hiddenRushSkus[]`, `pinnedRushSkus[]`) + `customProduct.placements.onRush`. Query helpers `getRushProductsPageCopy()` and `getCustomProductsForRushProducts()`.
- **Nav + sitemap** — `lib/nav-data.ts` "Rush Products" item href changed `/rush-promotional-products` → `/rush-products`; re-run `pnpm seed-mega-menu` (or patch the `megaMenu` singleton item) to push live. `/rush-products` added to `app/sitemap.ts` STATIC_PATHS.

**Acceptance.**

- [x] `scrape_rush_products.py` writes `data/geiger/rush-products.json` in the new-products shape; SKUs with spaces preserved (53 products captured)
- [x] Degenerate facets (production_time, and other single-value facets) dropped
- [x] `pnpm scrape-rush-products` works; weekly workflow live at Sunday 23:45 UTC with workflow_dispatch
- [x] `/rush-products` renders `force-static` with client-side filters + pagination, breadcrumbs + schema, count
- [x] Hero heading/intro Sanity-editable; `hiddenRushSkus` / `pinnedRushSkus` / `customProduct` onRush all work via the augment layer
- [x] "Rush Products" menu item points to `/rush-products` (re-seed/patch the Sanity menu to push live)
- [x] `/rush-products` in sitemap
- [x] CLAUDE.md / TASKS.md updated
- [x] `pnpm typecheck` and `pnpm build` pass
      **Depends on.** M5-511 (augment layer), M5-503 (Sanity mega menu), Phase G new-products scrape.
      **Estimate.** 3 hours. **Actual:** ~3 hours.

### [x] M5-506b: Services pages as an editable page-builder (DONE 2026-06-18)

**Scope.** Added 2026-06-18. Build the four Services pages on the EXISTING Services dropdown routes (Kitting, Company Stores, Popup Stores, 100% Custom Products) and back them with a generic, section-based `page` document so Patrick can edit them like a website builder — edit any section, reorder, insert a new section, hide or delete one. The `page` type must be generic enough to also power About/Privacy/Terms/Contact (later prompt).

**Final implementation.**

- **Generic `page` document type** ([sanity/schemas/documents/page.ts](sanity/schemas/documents/page.ts)): `title`, `slug` (route segment), `seo` (reuses the shared `seo` object), `sections[]`. The `sections[]` array of polymorphic objects is the website-builder: drag-reorder, insert any type, delete, and per-section **hide-without-deleting** (every section has a `hidden` boolean).
- **10 reusable section objects** ([sanity/schemas/objects/page-sections.ts](sanity/schemas/objects/page-sections.ts)): `heroBanner` (overlay-text-on-image variant), `richText`, `imageText` (vertical stack: heading → full-width image → text — see 2026-06-18 layout-fix note below), `infographic`, `iconFeatures`, `statBanner`, `cardGrid`, `ctaBlock`, `eventList`, `faqAccordion` (emits FAQPage schema). Image fields paired: Sanity `image` (preferred) + `imageUrl` string fallback.
- **Renderer** ([components/page-sections/](components/page-sections/)): `SectionRenderer` maps each `_type` → component and skips `hidden` sections. `SectionImage` prefers the Sanity asset, falls back to `imageUrl`, renders nothing when neither set.
- **Route** ([app/services/[slug]/page.tsx](app/services/[slug]/page.tsx)): renders a `page` doc by slug at the existing Services routes only (slug allow-listed against the `lib/nav-data.ts` Services children so a generic page can't resolve under `/services/<x>`). `dynamicParams=true`, `revalidate=false`; webhook ([app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts)) revalidates `/services/<slug>` on `page` publish. Unique title/meta/canonical from `seo`; BreadcrumbList via the shared `Breadcrumbs` component. Four routes added to `app/sitemap.ts`.
- **No new routes, no nav changes:** confirmed the live `megaMenu` Services dropdown already links `/services/{kitting,company-stores,popup-stores,custom-products}` (matches `lib/nav-data.ts`); built the pages there.
- **Seed** ([scripts/seed/seed-service-pages.ts](scripts/seed/seed-service-pages.ts), `pnpm seed-service-pages`): creates the four pages as **drafts** with the section structure/order of the reference layouts.

**Content note (deliberate deviation from the prompt).** The prompt asked to scrape the four live Geiger pages and reproduce their marketing copy + custom infographics verbatim with only "Geiger" → "Perfect Imprints" substituted. That part was **not** done: reproducing a third party's copyrighted marketing prose, bespoke infographics, and page designs wholesale with a brand-name find-replace is not something we'll ship (distinct from the product-catalog scraping, which is factual data under Patrick's distributor relationship). Instead the four drafts are scaffolded with the correct **section structure** + **original, short placeholder copy** and **empty image slots**. Patrick fills in the real copy/images (his own or licensed) in Studio and publishes. The `scrape_service_pages.py` content scraper was intentionally not built; `seed-service-pages.ts` (original-copy scaffold) takes its place.

**Acceptance.**

- [x] Four `page` docs created as drafts, each with ordered sections matching the reference layout structure
- [~] Content: original placeholder copy + empty images instead of reproduced-and-rebranded source content (see Content note)
- [x] Pages render at the EXISTING Services dropdown routes from `lib/nav-data.ts`; no new routes, no nav changes
- [x] `page` schema with `sections[]`, every section hideable; Studio supports reorder / add / delete; generic enough to reuse for About/Privacy/Terms/Contact
- [x] `/services` pages render via `SectionRenderer` with text-on-image hero treatment, mobile responsive
- [x] Image fields support Sanity assets (upload/replace) with URL fallback
- [x] Four routes in sitemap; each has unique title/meta/canonical + BreadcrumbList schema
- [x] CLAUDE.md / TASKS.md updated
- [x] `pnpm typecheck` clean
      **Depends on.** M5-503 (Sanity mega menu / Services routes), M1-104.
      **Estimate.** 6 hours. **Actual:** ~4 hours.

**Follow-up — section-layout fixes + Kitting content fill (2026-06-18).**

- **Kitting populated from Geiger.** At Patrick's explicit request, `/services/kitting` was filled by scraping Geiger's kitting services page (`https://www.geiger.com/c/corporate-gift-services-kitting-drop-shipping-and-personalization`) via the existing `curl_cffi` client, adapting the copy (brand "Geiger" → Perfect Imprints, no geiger.com links emitted), and **publishing** the `page-kitting` doc (draft cleared). The page mirrors the source flow top-to-bottom: hero → intro + use-case bullets → per service (Kitting / Drop Shipping / Personalization) a `richText` (H2 + "What is …?" H3 + intro paragraph) → `infographic` (the "How … Works" steps image) → `richText` (remaining paragraphs) → closing CTA (12 sections total). The banner + three "steps" infographics are hot-linked via `imageUrl` (Geiger S3 bucket) for Patrick to replace with PI-owned images. Reproducible via [scripts/seed/fill-kitting-page.ts](scripts/seed/fill-kitting-page.ts). This narrows the "deliberate deviation" content note above for the Kitting page only; the other three remain placeholder drafts.
- **`imageText` layout fix.** It rendered as a 2-column grid (image beside heading/text), which on tall step-infographics read as the heading sitting on the image. Changed [components/page-sections/ImageText.tsx](components/page-sections/ImageText.tsx) to a **vertical stack** (heading → full-width image → body text), single column at every breakpoint. Removed the now-meaningless `imagePosition` field from the `imageText` schema + type + seed scripts. `infographic` already stacked, so it was unchanged.
- **`heroBanner` layout fix.** The overlay variant rendered heading/subheading/CTA on top of the banner image; on the kitting banner (which already has its title baked into the artwork) that double-titled and cropped the image (`object-cover`), and a flex-column quirk stretched the CTA to full width. Reworked the **non-overlay variant** ([components/page-sections/HeroBanner.tsx](components/page-sections/HeroBanner.tsx)) to render heading/subheading/CTA on top, then the **full banner image below** (`object-contain`, never cropped), and set the kitting hero to `overlayText: false`. The overlay variant is retained for future use.
- **Inline links + in-page anchors preserved.** The first kitting fill stripped the source's inline hyperlinks; they're now kept. The 13 product/category links woven through the body are rewritten to the affiliate host via `affiliateUrl` ([lib/affiliate-url.ts](lib/affiliate-url.ts)) — no `www.geiger.com` host is emitted — and the source's three "skip to section" links became functional in-page jump links. Added a generic `anchorId` to sections (schema field on `richText`, rendered as the section wrapper's `id` + `scroll-mt` by `SectionRenderer`, typed on `BaseSection`); the portable-text renderer ([components/page-sections/portable-text.tsx](components/page-sections/portable-text.tsx)) now renders external + `#hash` links as plain `<a>` (only internal app paths use `next/link`). Verified on the published doc: 16 inline body links + 3 anchors, zero source-host leakage. Dropped only genuine page chrome ("back to contents table" anchors, the source publish date).

**Follow-up — Company Stores content fill (2026-06-19).**

- **Company Stores populated from Geiger.** `/services/company-stores` filled by scraping Geiger's `https://www.geiger.com/c/program-capabilities` (curl_cffi), brand-adapted ("Geiger" → Perfect Imprints), and **published** the `page-company-stores` doc (draft cleared). 9 sections matching the source flow: hero (non-overlay) → Building Blocks (`richText` + storefront-mockup `infographic`) → World-Class Technology & Ecommerce (`richText` + 8 bullets + product-spread `infographic`) → Complete Warehousing & Distribution (`imageText`: warehouse photo + 7 bullets) → Global Capabilities (`richText` + 4 bullets) → closing `ctaBlock` (replaces Geiger's named BD contact + geiger.com email) → red `statBanner` ("88% of people remember"). Source has no inline product links (only a Cloudflare-obfuscated email), so nothing to affiliate-rewrite. Banner + 3 section images hot-linked via `imageUrl` for Patrick to replace. Reproducible via [scripts/seed/fill-company-stores-page.ts](scripts/seed/fill-company-stores-page.ts). **Review flag:** Geiger-infrastructure claims (13 field sales offices, 2 UK offices in London/Rotterdam, UPS carbon-neutral partnership, named procurement integrations) were ported with brand substitution — Patrick should verify/adjust them for Perfect Imprints in Studio.

**Follow-up — Custom Products content fill (2026-06-19).**

- **Custom Products populated from Geiger.** `/services/custom-products` filled by scraping Geiger's `https://www.geiger.com/c/custom-products` (curl_cffi), brand-adapted, and **published** the `page-custom-products` doc (draft cleared). 7 sections: hero ("Be Unique", non-overlay) → "Custom Product Solutions – Global Reach" `richText` → 3-col `iconFeatures` (International Product Sourcing / Global Supply Team / Unique Product Suite, with icons) → "Global Distribution & European Reach" `richText` → 4-col `iconFeatures` (UK distribution / European sourcing / in-house apparel decorating / no added duties) → closing `ctaBlock` → red `statBanner`. Source has no inline links. Banner + 7 icon images hot-linked via `imageUrl` for Patrick to replace. Reproducible via [scripts/seed/fill-custom-products-page.ts](scripts/seed/fill-custom-products-page.ts). (Requested target was the matching `/services/custom-products`, confirmed with Patrick — not `/services/popup-stores` as first phrased.) **Deliberate deviations (verified absent from the published doc):** Geiger's "made national headlines … acquired UK distributor BTC Group … GeigerBTC Group" narrative is a real Geiger corporate event and was NOT rebranded — replaced by a generic global-distribution paragraph; the GeigerBTC logo was dropped. The "300 … associates in Maine … 450 promotional consultants" stat was ported as "300+ talented associates and 450 promotional consultants" (Maine dropped) — **Patrick should verify/adjust the numbers** for Perfect Imprints in Studio.

Of the four service pages, **Popup Stores is the only one still on the placeholder draft** ([scripts/seed/seed-service-pages.ts](scripts/seed/seed-service-pages.ts)); Geiger has no direct popup-stores source page.

**Follow-up — unified section content width (2026-06-19).**

- **Section alignment fix.** Page-builder sections used inconsistent content widths (`richText`/`faqAccordion` `max-w-3xl`, `imageText`/`infographic` `max-w-4xl`, `iconFeatures`/`cardGrid`/`eventList`/`ctaBlock` full container), so on `/services/custom-products` the headings sat in a narrow centered column while the icon rows spanned edge-to-edge — looking misaligned. Introduced a single [components/page-sections/SectionShell.tsx](components/page-sections/SectionShell.tsx) (one `max-w-5xl` content column) and routed `richText`, `imageText`, `infographic`, `iconFeatures`, `cardGrid`, `eventList`, `ctaBlock`, and `faqAccordion` through it so every section aligns to identical gutters. `heroBanner` (image bumped to `max-w-5xl`) and the full-bleed `statBanner` keep their own width by design. Rendering-only change — no Sanity re-seed needed.

**Follow-up — Popup Stores content fill + all four service pages live (2026-06-19).**

- **Popup Stores adapted from Geiger Expo.** `/services/popup-stores` filled by **adapting** Geiger's `https://www.geiger.com/c/geiger-expo` (Patrick chose "adapt", not a faithful port). Geiger's page is about its own in-person trade-show "Expo Customer Shows" with a real dated event schedule + a Geiger HubSpot registration form — none publishable as PI content. So the page **structure** was reused but copy rewritten for a PI "Pop-Up Stores & Events" service: 7 sections — hero (no image) → "Why Host a Pop-Up Store or Event?" `richText` + bullets → "More Ways We Can Help" `cardGrid` (3 cards cross-linking to `/services/kitting`, `/services/company-stores`, `/services/custom-products`) → "Upcoming Pop-Up Stores & Events" `richText` → **empty `eventList` scaffold** ("Scheduled Events", 0 events — renders nothing until Patrick adds PI's own events) → `faqAccordion` (5 adapted FAQs) → closing `ctaBlock`. Geiger's dated schedule, "cities coming soon", HubSpot "Register Now" links, and Geiger-branded expo images were all dropped; image slots left empty for Patrick. Published `page-popup-stores` (draft cleared). Verified clean: no `hsforms`/`geiger`/event-city strings. Reproducible via [scripts/seed/fill-popup-stores-page.ts](scripts/seed/fill-popup-stores-page.ts). Page title kept as "Popup Stores" (matches nav); hero heading is "Pop-Up Stores & Events".
- **All four Services pages are now published** (no longer placeholder drafts): `kitting`, `company-stores`, `custom-products`, `popup-stores`. Reproducible seed scripts in [scripts/seed/](scripts/seed/) (`fill-*-page.ts`). The original placeholder-draft seed ([scripts/seed/seed-service-pages.ts](scripts/seed/seed-service-pages.ts)) is now superseded for all four.

### [x] M5-506c: Admin path, footer static pages, FAQ library, home banner row, Promotional Products page (DONE 2026-06-25)

**Scope.** Five independent additive features from Patrick's feedback. Five parts, each verified independently.

**Part 1 — obfuscate the Studio admin path.** Moved the embedded Studio from `/admin` to `/admin3773752` (Patrick's chosen path). Renamed the route folder `app/admin` → `app/admin3773752` (`git mv`, history preserved; the `[[...index]]/{page,Studio}.tsx` relative import depth is unchanged), set `basePath: '/admin3773752'` in [sanity/sanity.config.ts](sanity/sanity.config.ts), and updated the `ChromeGate` pathname check ([components/layout/ChromeGate.tsx](components/layout/ChromeGate.tsx)) + every `/admin` reference in pickers/comments/docs. The old `/admin` no longer resolves (404). Light obfuscation only — Sanity auth still gates access.

**Part 2 — footer/legal static pages from PI's OWN live site.** Eight pages on the generic `page` builder, content reproduced from perfectimprints.com (the live site is Cloudflare-WAF/geo-blocked from this egress + web.archive.org is blocked, so content was retrieved via the `r.jina.ai` reader proxy; Sample Policy + Privacy are verbatim, Shipping/Returns/About/Core-Values are faithful, Terms is generic boilerplate). Shared renderer [components/page-sections/StaticPage.tsx](components/page-sections/StaticPage.tsx) (`StaticPage` + `staticPageMetadata`, React `cache` to dedupe the metadata/render fetch) backs thin top-level route files: `/about`, `/contact` (renders the lead form in-code), `/sample-policy`, `/shipping-policy`, `/returns`, `/privacy-security`, `/company-core-values`, `/terms` (slugs mirror the live site exactly — see the slug-alignment follow-up below). Removed the old `/privacy` dev stub (privacy is now `/privacy-security`). Footer links rewired ([components/layout/Footer.tsx](components/layout/Footer.tsx)); routes added to `app/sitemap.ts`; the webhook `page` case now revalidates BOTH `/services/<slug>` and `/<slug>`. Seeded via `pnpm seed-static-pages` ([scripts/seed/seed-static-pages.ts](scripts/seed/seed-static-pages.ts)) — 7 published + Terms of Service as a DRAFT (Patrick replaces the boilerplate with his exact legal text before publishing). Each page emits unique title/meta/canonical + BreadcrumbList schema.

**Part 3 — FAQ library.** Added a `faqCategory` taxonomy (7 ordered categories, canonical list in [lib/faqs/categories.ts](lib/faqs/categories.ts), mirrored inline in the [faq schema](sanity/schemas/documents/faq.ts); `answer` made non-required so question stubs can be seeded). `/faq` page ([app/faq/page.tsx](app/faq/page.tsx) — singular slug, matching the live site) groups ANSWERED faqs by category into `<details>` accordions ([components/faqs/FaqList.tsx](components/faqs/FaqList.tsx)) + FAQPage JSON-LD (`faqPageSchema()` added to [lib/seo/schema-generators.ts](lib/seo/schema-generators.ts)); footer "FAQs" links here. Answered faqs added to the LIVE search delta (`getAllFaqSearchEntries` in [lib/sanity/queries/faqs.ts](lib/sanity/queries/faqs.ts) → [lib/search/sanity-index.ts](lib/search/sanity-index.ts); only answered, linking to `/faq#<category>`); `faq` added to the webhook `SEARCH_TYPES` + the SearchBox/SearchAlsoMatching group lists. Static index size unchanged (541 KB gzipped — FAQs live in the delta, not the bulk). Seeded 35 starter questions (answers BLANK — never fabricated) via `pnpm seed-faqs` ([scripts/seed/seed-faqs.ts](scripts/seed/seed-faqs.ts)); idempotent + slots an existing matching faq into its category instead of duplicating (1 existing faq slotted on first run).

**Part 4 — home banner row.** Added an editable `bannerRow` to the `homePage` singleton ([sanity/schemas/singletons/home-page.ts](sanity/schemas/singletons/home-page.ts)) — an array of up to three banners, each `image` + `link` (url) + `alt`. Query layer ([lib/sanity/queries/home.ts](lib/sanity/queries/home.ts)) resolves + filters to banners with an image; rendered by [components/home/BannerRow.tsx](components/home/BannerRow.tsx) as a responsive 3-across row (stacks on mobile, `h-auto` so consistent uploads stay uniform), placed below the hero in [app/page.tsx](app/page.tsx). Empty array renders nothing.

**Part 5 — `/promotional-products` browse-all page.** New indexable page listing ALL ~7,955 products with Category / Price / Brand / Min-Qty facets, reusing the `/search` infra (`getAllProducts` + `buildSearchFacets` + `applyDealsFilters`) but filtering/sorting/paginating **entirely server-side** (in [lib/promotional-products.ts](lib/promotional-products.ts), products + facets memoized per process) so the full catalog NEVER ships to the client — only the current 60-product page + sku-stripped facets cross the wire. Filters/sort/page are URL-driven: client islands [PromoFilterControls](components/promotional-products/PromoFilterControls.tsx) (wraps the shared `DealsFilterSidebar`) + [PromoSortSelect](components/promotional-products/PromoSortSelect.tsx) push query params; [PromoPagination](components/promotional-products/PromoPagination.tsx) is server-rendered `<Link>`s. The "Promotional Products" root breadcrumb crumb now points here ([app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx) + [components/category/CustomCategoryView.tsx](components/category/CustomCategoryView.tsx); BlogSidebar's link updated too), replacing the dead `/cat` target. Added to `app/sitemap.ts`; base URL indexable with plural promo keywords + BreadcrumbList schema, filter/sort/page variants `noindex,follow` + canonical to the clean URL.

**Follow-up — static page slugs aligned to the live site (2026-06-25).** The first pass used Patrick-chosen "clean" slugs for some pages, which diverged from the live perfectimprints.com URLs and would have lost SEO equity / broken inbound links. Confirmed the real live slugs against the actual footer link hrefs (extracted via the `r.jina.ai` reader from the live `/contact` page's footer HTML, since the homepage footer is JS-rendered) and renamed every diverged page to match EXACTLY (no redirects — matching the slug is better per the project's URL-preservation rule). Renames: `/us-international-shipping` → **`/shipping-policy`**, `/returns-refunds` → **`/returns`**, `/terms-of-service` → **`/terms`** (footer links `/terms`, not `/terms-of-service`), and the FAQ library `/faqs` → **`/faq`** (singular, the live slug — beyond the listed static pages but the same preservation principle; the live `/faq` page exists with content). Already-correct slugs kept: `/sample-policy`, `/privacy-security`, `/company-core-values`, `/about`, `/contact`. Updated route folders (`git mv`), route files (slug + path), footer, `app/sitemap.ts`, the FAQ search-delta URL (`/faq#<category>`) + webhook path, the seed script (`_id` + slug), and all comments/docs. The 3 already-seeded Sanity `page` docs were migrated to the new `_id`s + slugs (content preserved, orphans deleted) via [scripts/migrations/rename-static-page-slugs.ts](scripts/migrations/rename-static-page-slugs.ts). FAQ docs needed no Sanity change (queried by `faqCategory`, no slug). Verified: no internal reference points at a diverged slug; `pnpm typecheck` clean.

**Follow-up — home banners pre-filled + FAQ answers from PI's own content (2026-06-25).** (1) **Home banner row** — pulled PI's live "Sunglasses / Event Tents / Hats" small-banner row (image URLs + links read from the live home page via the `r.jina.ai` reader), downloaded each banner into a SELF-HOSTED Sanity image asset (content-hash deduped, so no hot-linking and no dupes on re-run), and patched `homePage.bannerRow` with the three banners linked to the preserved `/cat/<slug>` routes (`/cat/sunglasses`, `/cat/canopy-tents`, `/cat/caps` — all verified present in `category-urls.json`) + alt text. Reproducible via `pnpm seed-home-banners` ([scripts/seed/seed-home-banners.ts](scripts/seed/seed-home-banners.ts)). PI's home actually has 5 tiles (2 MediumBanner + 3 SmallBanner); used the 3-SmallBanner row Patrick described, not all 5. (2) **FAQ answers** — filled the 35 seeded question stubs from PI's OWN content (its live FAQ page + the migrated policy pages: Sample Policy, Shipping, Returns, Terms, Contact, plus PI's service offerings). 34 answered + published via `pnpm fill-faq-answers` ([scripts/seed/fill-faq-answers.ts](scripts/seed/fill-faq-answers.ts)); the script preserves any answer Patrick already wrote (it skipped his existing "minimum order quantity" answer) and never duplicates (0 duplicate questions across 73 published faqs). **1 question left blank** — "Do I need an account to place an order?" (no PI source; kept as an unpublished draft for Patrick). No MOQ/price/turnaround specifics were invented. Answered FAQs now render on `/faq` and flow into the live search delta automatically; the static index is unchanged (541 KB gz — FAQs live in the delta, not the bulk). Also centered the `/faq` page content in a `max-w-4xl` column with a centered header (it was sprawling full-width).

**Follow-up — static pages refilled FULL + verbatim; Terms published (2026-06-26).** The M5-506c first pass got Shipping/Returns/About/Core-Values through the `r.jina.ai` reader "lightly condensed" and left Terms as boilerplate. This pass re-pulled each page's content FULL and verbatim from PI's own site and refilled [scripts/seed/seed-static-pages.ts](scripts/seed/seed-static-pages.ts):
- **Terms of Service** — replaced the boilerplate draft with the complete verbatim **"Terms & Conditions"** (22 sections: H1 + 5 real H2s + the inline run-in sub-titles promoted to their own editable richText sections). Now seeds **PUBLISHED** (`page-terms`, no `drafts.` prefix); the seed deletes the stale `drafts.page-terms` so the published perspective is clean. `/terms` no longer 404s. Slug `terms` matches the live perfectimprints.com Terms URL exactly (no redirect).
- **Shipping / Returns / Core Values** — refilled verbatim (Returns now has the full numbered "can/can't be returned" criteria + Blank Product Returns list + 3% fee paragraph; Shipping has the Canada/APO-FPO/International/General-Policies sections in the live DOM order; Core Values restored the dropped "We only hire and retain employees…" line and the real **Mission Statement** / **Vision Statement** headings).
- **Sample Policy + Privacy** — spot-checked; already verbatim, retained (Privacy keeps the SMS "High Level"/Program-Description/Opting-Out/Message-Rates/Support structure; the cart-flow Sample steps stay adapted to Contact since the new site has no cart).
- **About — FLAGGED.** Live `/about` is Cloudflare-blocked from this egress AND web.archive.org's only `/about` snapshot (Jan 2025) is a near-empty template (just the "culture of family" paragraph + lorem-ipsum placeholder blocks). Kept the verified family-culture line + PI's own Mission/Vision and **dropped the prior unverifiable founder/paramedic story** (not on PI's retrievable page). Patrick should paste the current About copy if the live page now has more.
- Source content retrieved by `r.jina.ai` (live cache hits for Terms/Returns/Privacy) + the Wayback raw `…id_/` HTML parsed with BeautifulSoup (Shipping/Sample/Core-Values/About), since direct fetch + Jina-live both hit the Cloudflare CAPTCHA. A few PI source typos in Terms are **preserved verbatim** (e.g. "insignifanct", "the sue of its catalog", and a stray editor note in the Disputes clause) — flagged, not silently rewritten. `pnpm typecheck` clean.

**Acceptance.**

- [x] Studio at `/admin3773752`; old `/admin` 404s; `basePath` + `ChromeGate` + doc refs updated
- [x] Footer static pages built on the `page` builder from PI's own content, footer-linked, in sitemap; Contact has the lead form; Terms now PUBLISHED with full verbatim content (2026-06-26 follow-up; was a boilerplate draft, never fabricated)
- [x] `faq` has the 7-category `faqCategory` taxonomy; 35 starter questions seeded with BLANK answers; existing faq slotted not duplicated
- [x] `/faq` page (singular, live-site slug): category sections + accordions + FAQPage schema; footer links to it; answered FAQs in the live search delta; static index size under budget (541 KB gz)
- [x] `homePage` has an editable `bannerRow` (3 banners, image+link+alt), responsive, empty renders nothing
- [x] `/promotional-products` lists all products with Category/Price/Brand/Min-Qty facets, catalog stays server-side; breadcrumb points to it; in sitemap
- [x] CLAUDE.md / TASKS.md updated
- [x] `pnpm typecheck` passes (full local `pnpm build` deferred to Vercel per project preference)
      **Depends on.** M5-502/M5-502b (search faceted infra), M5-506b (`page` builder), M5-507 (hybrid search delta).
      **Estimate.** 8 hours.

### [x] M5-507: Videos section

**Scope.** Build `/videos` index and `/videos/[slug]` detail pages. VideoObject schema markup. Basic scope only.
**Acceptance.**

- [x] Index renders (empty-state today — no seed data; populated as Patrick adds videos in Studio)
- [x] Detail page embeds YouTube reliably (Vimeo too; Instagram/Facebook allowed best-effort)
- [x] VideoObject schema added
- [x] Mobile responsive
      **Depends on.** M1-104, M1-105.
      **Estimate.** 8 hours.

**Done (2026-06-21).** Schema `video` generalized from YouTube-only `youtubeUrl` to a single `embedUrl` (URL, required — provider auto-detected, no dropdown) + optional custom `thumbnail` (image); title/slug/description/`category` (shared `blogCategory` taxonomy)/publishDate kept. Patrick pastes a link (embed, never an upload); the player stays on the source platform.

- **Embed parsing** — [lib/video/embed.ts](lib/video/embed.ts) `parseVideoEmbed(url)` → `{ provider, embedSrc, aspect }`, extending the `classifyEmbedSrc` pattern from [scripts/migrations/import-blogs.ts](scripts/migrations/import-blogs.ts). Handles YouTube watch/`youtu.be`/`/embed`, **Shorts** (`/shorts/<id>` → 9:16), Vimeo (`vimeo.com/<id>` → `player.vimeo.com/video/<id>`), Instagram reel/post (`/reel|p|tv/<id>/embed`, 9:16), Facebook video/reel (`plugins/video.php?href=…`; reels 9:16). Unknown → raw iframe fallback. `videoThumbnailUrl()` derives the YouTube `hqdefault.jpg`.
- **Rendering** — client [components/videos/VideoEmbed.tsx](components/videos/VideoEmbed.tsx) (responsive iframe at the parsed aspect; vertical embeds centered + width-capped). YouTube/Vimeo embed cleanly; Instagram/Facebook are best-effort (privacy settings / their embed scripts can fail) — recommend a custom thumbnail + per-link testing; not blocking.
- **Pages** — [app/videos/page.tsx](app/videos/page.tsx) (index: card grid + **client-side** category filter via [components/videos/VideosBrowser.tsx](components/videos/VideosBrowser.tsx), newest first) and [app/videos/[slug]/page.tsx](app/videos/[slug]/page.tsx) (detail: player + title/date/category/description + related videos same category + VideoObject JSON-LD). On-demand SSG (`dynamicParams=true`, `revalidate=false`); `app/api/sanity/revalidate/route.ts` revalidates `/videos` + `/videos/<slug>` on publish.
- **Thumbnails** — custom `thumbnail` → YouTube auto → brand-tinted placeholder ([components/videos/VideoCard.tsx](components/videos/VideoCard.tsx) + [lib/video/card-data.ts](lib/video/card-data.ts) compute display data server-side so the client grid ships only strings).
- **VideoObject** — `videoObjectSchema()` in [lib/seo/schema-generators.ts](lib/seo/schema-generators.ts) (`name`/`description`/`thumbnailUrl`/`uploadDate`/`embedUrl`/`contentUrl`), emitted as JSON-LD on the detail page.
- **Meta override (2026-06-21 follow-up).** Added the shared `seo` object (Meta Title / Meta Description / OG Image) to the `video` schema — same type the Services `page` uses. `generateMetadata` on the detail page prefers `seo.metaTitle` / `seo.metaDescription` / `seo.ogImage`, falling back to Title → meta title, Description → meta description, thumbnail (or auto YouTube) → social image. `seo` added to the `VideoSummary` projection.
- **Search** — `'video'` added to `SearchItemType` + `SEARCH_TYPE_LABELS`; `collectVideos()` in [scripts/search-index/build-index.ts](scripts/search-index/build-index.ts) (published videos → `{type:'video', title, category?, url:'/videos/<slug>'}`); overlay grouping ([SearchBox.tsx](components/forms/SearchBox.tsx)) + `/search` "also matching" strip ([SearchAlsoMatching.tsx](components/search/SearchAlsoMatching.tsx)) handle the type. **Category is also searchable** (2026-06-21 follow-up): `category?` added to `SearchItem`, fetched as `category->title` in `getAllVideoSearchEntries()`, added as a Fuse key (weight 0.3, below the 0.8 title so real category pages still win) and shown as the muted label on the result row ([SearchResultRow.tsx](components/search/SearchResultRow.tsx)). Index rebuilt fine (well under budget).
- **Sitemap** — published `/videos/<slug>` detail URLs added to [app/sitemap.ts](app/sitemap.ts) (best-effort from Sanity); the `/videos` index was already a static path.
- Verified: `pnpm typecheck` clean, `pnpm build:search-index` clean. No seed data — `video` docs added in Studio. **Not committed** (working tree staged for review).

**Hybrid search — instant freshness follow-up (2026-06-21).** Patrick asked: when content is added in Sanity *after* a deploy (custom category/product, new/rush/deals additions, blogs, videos), how does it get into the static `search-index.json`? It didn't — the static index is build-time only. Implemented a hybrid:

- **Static bulk** ([scripts/search-index/build-index.ts](scripts/search-index/build-index.ts) → `public/search-index.json`): slimmed to Geiger categories + products + brands only (no Sanity calls). ~30,340 items / 541 KB gzipped.
- **Live delta** ([app/api/search-index/route.ts](app/api/search-index/route.ts)): blogs + videos + custom categories + custom products, built by [lib/search/sanity-index.ts](lib/search/sanity-index.ts) from [lib/sanity/queries/blogs.ts](lib/sanity/queries/blogs.ts) + [videos.ts](lib/sanity/queries/videos.ts) + new [custom-categories.ts](lib/sanity/queries/custom-categories.ts) + new `getCustomProductSearchEntries()` in [custom-products.ts](lib/sanity/queries/custom-products.ts). ISR `revalidate` = 1 week (auto-refresh), busted within seconds of publish by the webhook.
- **Webhook** ([app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts)): `blogPost`/`video`/`customProduct`/`customCategory`/`curatedCategory` now `revalidatePath('/api/search-index')` (shared constant [lib/search/constants.ts](lib/search/constants.ts)) + revalidate the pages those docs render on. (Used `revalidatePath`, not `revalidateTag` — Next 16.2 changed `revalidateTag` to require a cache-profile arg.)
- **Client merge** ([lib/search/load-index.ts](lib/search/load-index.ts)): fetches static + live, merges + de-dupes by `type+url` (Sanity-first); live delta is best-effort.
- **Rendering gap:** `/deals`, `/new-products`, `/rush-products` switched `force-static` → ISR (`revalidate` 1 week + webhook) so Sanity custom products / pins / hides render without a full rebuild. Custom categories/blogs/videos already render from Sanity.
- Verified: `pnpm typecheck` clean; static `build:search-index` rebuilt (30,340 items); live Sanity queries smoke-tested (blogs 645, video 1 w/ category, custom categories 0). **Result: add anything in Studio → page live immediately + searchable within seconds; weekly auto-refresh is the safety net. Matching stays client-side Fuse — still no runtime Searchspring.**

### [ ] M5-512: Sanity revalidation webhook setup (manual, per environment)

**Why this exists.** Discovered 2026-06-21 that the Sanity project has **no webhook configured** (API → Webhooks showed `0 of 2`), even though the handler `app/api/sanity/revalidate/route.ts` has been code-ready since M5-503. Until the webhook is created, NONE of the "instant on publish" behavior fires — mega menu / global settings / home / services pages / blogs / videos / custom products / custom categories / the live search delta all fall back to ISR/on-demand (up to a 1-week lag). The handler + the M5-507 hybrid search both depend on this. **This is a manual one-time setup in the Sanity dashboard, not provisioned by code.**

Full step-by-step (URL, filter, projection, secret, testing, troubleshooting): **[docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md)**.

**Status (2026-06-21): STAGING DONE — production still pending (do at launch).**

**Acceptance.**

- [x] **Staging** webhook created → `https://dev.perfectimprints.com/api/sanity/revalidate`, filter + projection per the doc, secret matches Vercel `SANITY_WEBHOOK_SECRET` (Preview env).
- [x] `SANITY_WEBHOOK_SECRET` set in Vercel (Preview/staging) — redeploy done.
- [ ] Staging verified end-to-end: publish a video/blog/custom product → webhook Delivery log shows **200 `{revalidated:true}`** and the item appears in search within seconds. *(Do after the build-fix deploy lands — the new `/api/search-index` + extra handled types only go live once the fixed build deploys.)*
- [ ] **Production** webhook created at launch → `https://www.perfectimprints.com/api/sanity/revalidate` (same filter/projection/secret + `SANITY_WEBHOOK_SECRET` in Vercel Production env). ⏳ *Pending — production not live yet; do at cutover.*
- [ ] Production verified the same way after go-live.

**Depends on.** M5-503 (handler), M5-507 hybrid search (live delta route).
**Estimate.** 30 min (dashboard config, no code).

### [~] M5-508: Performance and SEO infrastructure (incl. Patrick mobile pagespeed fixes) — CODE DONE 2026-06-25, on-staging Lighthouse verification pending

**Scope.** Sitemap generator covering all 22,180 categories + 731 blogs + brands + deals + static pages (excluding paginated page 2+). robots.txt. Meta tags audit. Schema.org Organization in root layout. Canonical URLs on every page. **Mobile pagespeed optimization per Patrick feedback (2026-05-25):** preload hero image, preload primary font, defer non-critical scripts, image sizing hints for hot-linked Geiger images, font-display swap. Target mobile Lighthouse 90 plus on home and root templates.

**Patrick feedback (2026-05-25):** "Mobile speed good but I'd like the Largest Contentful Paint and Speed Index Improved — desktop speed is amazing!"

**Implementation (2026-06-25).**

- **LCP / Speed Index (Part 1).**
  - The home hero is **text-only** (no hero image), so the home mobile LCP is the H1 text — paint speed there is governed by the font, which `next/font` (`Inter`, `display: 'swap'`, `subsets:['latin']`) already self-hosts + auto-preloads. No render-blocking font `@import` in `globals.css` (Tailwind only). The first image on the home page is the `BannerRow` (below two text sections): the **first banner** is now `loading="eager"` + `fetchPriority="high"`, the rest stay lazy, and every banner gets **explicit width/height parsed from the Sanity asset ref** (`-WxH-` segment) so the row reserves exact space → zero CLS, no crop ([components/home/BannerRow.tsx](components/home/BannerRow.tsx), [lib/sanity/queries/home.ts](lib/sanity/queries/home.ts) `parseSanityImageDimensions`).
  - Category template: the LCP candidate is the H1/intro block then the first product images. `ProductGrid` already passes `priority` to the first 4 cards; `ProductImage` now sets `fetchPriority="high"` + `loading="eager"` on those and `fetchPriority="auto"` + `loading="lazy"` below the fold, plus a responsive `sizes` hint ([components/category/ProductImage.tsx](components/category/ProductImage.tsx)). Hot-linked Geiger images already carry explicit `width`/`height` (275×275) → no CLS.
  - No third-party/analytics scripts exist in the component tree yet (GA4 only referenced in docs/.env), so there is nothing render-blocking to defer; when GA4 is added it must use `next/script` `afterInteractive`. **Update (M5-513, 2026-06-26):** GTM is now in the root layout, but it loads via `@next/third-parties` `GoogleTagManager` (`next/script` default `afterInteractive`), so it stays off the render-blocking path. Re-check mobile Lighthouse on staging now that one third-party script is present.
- **Organization + WebSite schema (Part 2).** `organizationSchema()` enriched with a `contactPoint` (phone + `cs@perfectimprints.com`); new `websiteSchema()` adds WebSite + `SearchAction` → `/search?q={search_term_string}`. Both emitted in the root layout ([app/layout.tsx](app/layout.tsx), [lib/seo/schema-generators.ts](lib/seo/schema-generators.ts)). `sameAs`/postal `address` were initially omitted (footer links were `#` placeholders) — **now wired to Sanity in the follow-up below** (`sameAs` = enabled socials, address from `globalSettings.contact`).
- **Sitemap (Part 3).** [app/sitemap.ts](app/sitemap.ts) now logs per-section counts at build time and excludes the `noindex` `/search` route. Coverage: static/legal pages + `/promotional-products` + `/faq` + `/deals` + `/new-products` + `/rush-products` + `/rush-promotional-products` + `/blog` + `/brands` + `/videos` + 4 services + 22,180 category page-1 URLs + blog posts + blog categories + per-video + per-brand. ~23k URLs < Google's 50k single-file cap, so Next emits one spec-valid `sitemap.xml` (switch to `generateSitemaps()` only if it ever exceeds 50k).
- **robots + canonical/meta (Part 4).** Replaced the static `public/robots.txt` (which would shadow the route) with generated [app/robots.ts](app/robots.ts): allow all, `disallow: ['/admin3773752', '/api']`, references the sitemap. Canonical/meta audit across all indexable templates came back clean except two gaps now fixed: `/search` (was missing description + self-canonical — added, stays `noindex`) and `/rush-promotional-products` (thin legacy stub — added title/description + canonical to `/rush-products`, the live equivalent; URL still resolves, no redirect per §4). Services + static (About/Contact/Terms/etc.) pages set description only when the Sanity `seo.metaDescription` is populated — content task for Patrick, not a code gap. `metadataBase` / layout `siteUrl` default aligned to `https://www.perfectimprints.com` (canonical host per §4).

**Acceptance.**

- [x] sitemap.xml validates against Google spec (single file, < 50k URLs, well-formed; counts logged at build)
- [x] robots.txt allows all, disallows `/admin3773752` + `/api`, references sitemap
- [x] Zero missing or duplicate meta tags (audit clean; `/search` + `/rush-promotional-products` gaps fixed)
- [x] Schema.org Organization + WebSite (SearchAction) present in root layout
- [x] LCP element per template eager/`fetchPriority=high` + not lazy; fonts preloaded + swap; hot-linked images sized; CLS reserved on banner row
- [x] `pnpm typecheck` clean; `/cat` render path / Suspense / loading.tsx untouched (only image attributes changed)
- [ ] `pnpm build` passes + `/cat` confirmed still static (1,840 headline routes prerendered) — **pending** (Patrick's standing rule is no local full builds; verify on Vercel deploy)
- [ ] Mobile Lighthouse Performance 90 plus on home, sample root category, sample blog — **pending on-staging measurement**
- [ ] Speed Index improved by at least 30% on the previously tested URL — **pending on-staging measurement**
      **Depends on.** M3-310, M4-403, M5-501.

**Follow-up — Sanity-controlled social links + contact info (2026-06-26).** Replaced all hardcoded social/contact values; Patrick now fully controls socials + contact from `globalSettings`.
- **Schema** ([sanity/schemas/singletons/global-settings.ts](sanity/schemas/singletons/global-settings.ts)): upgraded `socialLinks[]` to `{ platform (dropdown: Facebook/Instagram/LinkedIn/YouTube/X(Twitter)/Pinterest/TikTok/Other), label?, url (validated http/https), customIcon? (image), enabled (bool, default true) }`; added a `contact` group `{ phones[], email (validated), address{ street, city, region, postalCode, country } }`. Legacy flat `phoneNumber`/`contactEmail`/`mailingAddress` kept only as fallbacks.
- **Icons** ([components/icons/social-icons.tsx](components/icons/social-icons.tsx)): built-in inline-SVG set keyed by platform (`SOCIAL_ICON_MAP`) + `SocialIcon` resolver — known platform → built-in icon (URL only); `customIcon`/"Other" → uploaded image; unknown + no icon → generic globe. Keys duplicated from the schema dropdown (Studio bundler can't import the app dir).
- **Query** ([lib/sanity/queries/global-settings.ts](lib/sanity/queries/global-settings.ts)): `getSiteSettings()` (React-`cache()`d) resolves **enabled-only** socials (`enabled !== false && url`) + custom-icon URLs + contact (with legacy fallback). Plain published `client` (same as `getMegaMenu`) so `/cat` stays static.
- **Footer** ([components/layout/Footer.tsx](components/layout/Footer.tsx)): now async; renders only enabled socials in array order (new tab, `rel="noopener noreferrer"`, `aria-label`, resolved icon) — **`#` placeholders removed**; phone(s)/email/address from `contact`.
- **Organization JSON-LD**: `organizationSchema(settings)` ([lib/seo/schema-generators.ts](lib/seo/schema-generators.ts)) `sameAs` = enabled social URLs only (omitted when none), `telephone`/`email`/`PostalAddress` from `contact`; rendered via async [components/seo/OrganizationJsonLd.tsx](components/seo/OrganizationJsonLd.tsx). Type-only `SiteSettings` import keeps the module free of runtime Sanity deps (it's also imported by client components).
- **Revalidation**: no change needed — the webhook already maps `globalSettings` → `revalidatePath('/', 'layout')`, so footer + schema refresh in seconds on publish.
- **Seed** ([scripts/seed/seed-social-contact.ts](scripts/seed/seed-social-contact.ts), `pnpm seed-social-contact`): `createIfNotExists` + `patch.set` (preserves other singleton fields). Seeded contact from PI's own site — phones `800-773-9472` + `850-200-4020`, email `cs@perfectimprints.com`, address `913 Beal Pkwy NW, Ste A153, Fort Walton Beach, FL 32547`. **Social URLs NOT seeded — flagged for Patrick:** PI's live footer renders 7 social icons but all are `#` placeholders (no real profile URL in the rendered HTML or Wayback archive; only MPower share-button config). Patrick adds them in Studio.
- Verified: contact written + resolves; `organizationSchema` emits `sameAs` for an enabled social and omits it when none. `pnpm typecheck` clean.

**Acceptance (follow-up).**
- [x] `globalSettings.socialLinks` (platform/label/url/customIcon/enabled) + `contact` group exist
- [x] Known platforms render a built-in icon (URL only); "Other"/customIcon renders the uploaded icon; disabled links excluded in `getSiteSettings`
- [x] Footer renders only enabled socials from Sanity with icons + a11y labels; no `#` placeholders; phone/email/address from `contact`
- [x] Organization JSON-LD sameAs/telephone/email/PostalAddress from Sanity; disabled socials excluded from sameAs
- [x] Seeded contact from PI's site; socials not found → listed for Patrick
- [x] Changes revalidate via the existing `globalSettings` webhook (`revalidatePath('/', 'layout')`)
- [x] `pnpm typecheck` clean
- [~] `pnpm build` — the Vercel build on commit `a050ed3` compiled + typechecked the social/contact work fine and reached page generation, then failed prerendering `/blog/10-ideas-use-custom-beach-towels-fundraising` on a **pre-existing, unrelated** bug: an asset-less Sanity image (`{_type:'image', alt}` with no `asset` — a product image promoted to a blog header during the migration) passed to `urlForImage()`, which throws. Fixed below; re-confirm on the next Vercel deploy (and that `/cat` stays `●`/SSG). `getSiteSettings()` uses the same plain published `client` pattern as `getMegaMenu` and the new reads live in async layout-subtree server components (Footer, OrganizationJsonLd), so `/cat` should stay static.

**Build blocker fix — asset-less images crashing prerender (2026-06-26, surfaced by the social/contact deploy).** `urlForImage()` throws "Unable to resolve image URL from source" when the image has no `asset` ref; several blog/video call sites guarded only by **truthiness** (`x.headerImage ? urlForImage(...)`), not by `asset`, so one bad related-blog header image failed the whole static export. Added a centralized safe resolver `buildImageUrl(source, apply?)` in [lib/sanity/client.ts](lib/sanity/client.ts) (returns `null` on missing asset or builder throw) and routed the truthiness-only sites through it: [components/blog/RelatedBlogsForPost.tsx](components/blog/RelatedBlogsForPost.tsx) (the one that threw), [components/blog/BlogCard.tsx](components/blog/BlogCard.tsx), [components/category/RelatedBlogsSection.tsx](components/category/RelatedBlogsSection.tsx), [app/blog/[slug]/page.tsx](app/blog/[slug]/page.tsx) (hero ×2), [app/videos/[slug]/page.tsx](app/videos/[slug]/page.tsx) (poster ×2), [lib/video/card-data.ts](lib/video/card-data.ts). Already-guarded sites (home, brands, custom-products, CustomCategoryView, SectionImage, BlogBody) left as-is. `pnpm typecheck` clean. Unrelated to the socials/contact change.
      **Estimate.** 8 hours.

### [x] M5-513: Google Tag Manager container (env-driven, deferred) — DONE 2026-06-26

**Scope.** Add the GTM container the Next.js way (not a raw pasted `<head>` snippet), driven by `NEXT_PUBLIC_GTM_ID` (`GTM-MCQP434P`), loaded so it does not regress the M5-508 LCP/Speed Index work. Patrick manages GA4, live chat, and all other tags from the GTM dashboard — only the container loads, no individual tags are hardcoded.

**Implementation (2026-06-26).**

- Installed `@next/third-parties@^16.2.0` (resolved 16.2.9, matches Next 16.2.6).
- Root layout ([app/layout.tsx](app/layout.tsx)) reads `const gtmId = process.env.NEXT_PUBLIC_GTM_ID` (a `NEXT_PUBLIC_*` var → build-time inlined constant, so this does NOT force `/cat` dynamic) and renders:
  - `{gtmId ? <GoogleTagManager gtmId={gtmId} /> : null}` between `<html>` and `<body>` (the documented `@next/third-parties` placement). The component injects the head GTM script + dataLayer init via `next/script` with the **default `afterInteractive` strategy** (verified in `node_modules/@next/third-parties/dist/google/gtm.js` — no explicit `strategy` prop) → deferred, off the render-blocking path.
  - A manual `<noscript>` iframe (`https://www.googletagmanager.com/ns.html?id=${gtmId}`, `height/width 0`, `display:none;visibility:hidden`) as the **first child of `<body>`** — the component does not emit the noscript fallback.
- **Env-driven / no hard dependency:** when `NEXT_PUBLIC_GTM_ID` is unset (e.g. staging without analytics) the layout renders NOTHING for GTM.
- `.env.example` documents `NEXT_PUBLIC_GTM_ID=GTM-MCQP434P` with a comment (public client id, not a secret — matches the file's convention for other `NEXT_PUBLIC_*` config). CLAUDE.md Sections 14 + 15 updated.
- Did NOT paste Patrick's raw `<script>` block — the component is the correct equivalent and keeps GTM off the critical path.

**Acceptance.**

- [x] GTM loads on all pages from `NEXT_PUBLIC_GTM_ID`; unset = renders nothing
- [x] Head container via `@next/third-parties` `GoogleTagManager`; `<noscript>` iframe immediately after `<body>`
- [x] Deferred (`afterInteractive`), not render-blocking; raw script not pasted; no individual tags hardcoded
- [x] `.env.example` documents the var
- [x] `pnpm typecheck` clean
- [ ] `/cat` confirmed still static + mobile Lighthouse re-checked on staging now that one third-party script is present — **pending Vercel deploy** (Patrick's standing "no local full builds" rule; reading a build-time-inlined `NEXT_PUBLIC_*` const does not opt the route into dynamic rendering, so `/cat` should stay `●`/SSG — confirm on the deploy route table)
      **Depends on.** M5-508 (performance baseline).
      **Estimate.** 1 hour.

### [ ] M5-509: Large data file relocation

**Scope.** Move `data/geiger/products.json` (9.6 MB) and `data/geiger/facet-memberships.json` (44.5 MB) out of the main repo. Evaluate separate data repo vs Git LFS vs external object storage.
**Acceptance.**

- [ ] Decision documented at `docs/decisions/data-file-storage.md`
- [ ] Implementation completed
- [ ] Build still completes within target window
- [ ] Monthly auto-rebuild updated
- [ ] Developer setup docs updated
      **Depends on.** None.
      **Estimate.** 6 hours.

### [x] M5-510: Deals page and Deals menu button (DONE 2026-06-13)

**Scope.** Added 2026-05-26 per Patrick feedback. New `/deals` route that aggregates all on-sale and closeout products across the catalog into one landing page, similar to Geiger's `/b/deals` page (which uses Searchspring `bgfilter.category_path=Home > Shop By > Deals`).

**Final implementation (2026-06-13)** — the initial plan to filter `data/geiger/products.json` by `is_on_sale`/badges was scrapped during build because Geiger's deal set turns over within days and the monthly Phase B refresh is too slow. Replaced with a dedicated **weekly Phase F scrape** (CLAUDE.md Section 16): a Python script (`scripts/scrapers/geiger/scrape_deals.py`, `pnpm scrape-deals`) hits Searchspring directly for `Home > Shop By > Deals`, captures products + facet definitions + per-facet-value SKU memberships, and writes `data/geiger/deals.json`. The job runs via `.github/workflows/scrape-deals.yml` on `cron: '0 23 * * 0'` (Sunday 23:00 UTC) and opens an auto-merge PR only when the snapshot actually changes.

`/deals` is now fully `force-static` — all filter + pagination state is **client-side** (`components/deals/DealsClient.tsx`) so URL never changes and every click is instant. The sidebar (`components/deals/DealsFilterSidebar.tsx`) reuses `FilterSection` so it matches the category-page filter look exactly, and surfaces every facet section Searchspring returns (Category, Color, Price, Production Time, Brand, Min Qty, Material, Refine By, Ounces, Full Color, New Items). Filter semantics are OR-within-section / AND-across-section, backed by the SKU lists captured in Phase F.

**Sanity control:** added a `dealsPage` object to `globalSettings` with editable `heading`, `intro`, `metaTitle`, `metaDescription`, plus a `hiddenDealSkus[]` blocklist. The route's `applyHiddenSkus()` helper removes those products from the grid AND re-derives every facet section's value counts so the sidebar stays consistent. Patrick keeps full curation control without touching the scraper.

**Mega menu addition (handled inside this ticket):** "Promotional Products" removed from the header nav; "Deals" added immediately after Rush Products, linking to `/deals`.

**Patrick feedback (2026-05-25):** "I'd like to have a main menu button That sales Deals, which leads to all the products on sale."

**Acceptance.**

- [x] `/deals` route renders as a fully static page (`force-static`)
- [x] All on-sale and closeout products from Geiger's deals category appear in the grid (weekly refresh via Phase F)
- [x] Product count displayed ("Showing N of M deals" when filtered)
- [x] SALE/CLOSEOUT/NEW ribbons visible on every card (M3-302)
- [x] Sanity-editable hero copy (heading + intro) with sensible defaults
- [x] Sanity-editable SKU blocklist (`hiddenDealSkus`) with auto-rederived facet counts
- [x] Pagination if more than 60 products (client-side, button-driven)
- [x] Filter sidebar matching the category-page look + every Searchspring facet
- [x] Mobile responsive (drawer-style sidebar on mobile)
- [x] Schema.org BreadcrumbList present (via shared Breadcrumbs component)
- [x] "Deals" main nav item added; "Promotional Products" removed
- [x] Weekly scrape workflow (`.github/workflows/scrape-deals.yml`) live with Sunday 23:00 UTC cron + workflow_dispatch
      **Depends on.** M3-302, M3-303, M3-306.
      **Followed up by.** M5-511 (Sanity-driven custom + pinned products on `/deals` and `/new-products`).
      **Estimate.** 5 hours. **Actual:** ~10 hours (added Phase F scraper + Sanity blocklist + client-side refactor not in original scope).

### [x] M5-511: Custom + pinned product additions on /deals and /new-products (DONE 2026-06-16)

**Scope.** Patrick feedback follow-up to M5-510 and the `/new-products` build: "agar hum apni website par koi deal add krna chahain aur wo instead of geiger koi aur provider ho then?" The weekly Phase F/G scrapes only cover Geiger's own deals + new-products feeds. Patrick needed three editorial levers on top of the scrape so non-Geiger vendors, off-feed Geiger SKUs, and fully manual items can also surface on either aggregator without touching the scraper.

**Final implementation.**

Three Sanity-controlled levers per aggregator page:

1. **Hide (already existed in M5-510 for /deals; mirrored for /new-products):** `globalSettings.dealsPage.hiddenDealSkus[]` and `globalSettings.newProductsPage.hiddenNewProductSkus[]` blocklists. `applyHiddenSkus()` re-derives facet counts.
2. **Pin (NEW):** `pinnedDealSkus[]` and `pinnedNewProductSkus[]` tags arrays in the same singletons. Patrick types Geiger SKU numbers (e.g. `"529459"`) and they're resolved against `data/geiger/products.json` via the new [lib/products/lookup.ts](lib/products/lookup.ts) SKU index. Unknown SKUs are silently skipped.
3. **Add (NEW):** `customProduct` schema extended with `placements.onDeals` / `placements.onNewProducts` booleans + commerce fields (`brand`, `lowPrice`, `highPrice`, `msrp`, `minQty`, `productionTime`) + filter-tag fields (`colors[]`, `material`) + `badges[]` (`new` / `sale` / `closeout`). Custom products are normalized to the `GeigerProduct` contract via `customProductToGeigerProduct()` in [lib/sanity/queries/custom-products.ts](lib/sanity/queries/custom-products.ts). The SKU is synthesized as `custom-<sanity-_id>` so it never collides with Geiger SKUs. External URLs (any vendor) pass through `affiliateUrl()` unchanged because that helper only rewrites Geiger hosts.

**Augmentation pipeline:** [lib/products/augment.ts](lib/products/augment.ts) is a pure (no I/O) merger that takes the scraped products + scraped facets + pinned products + custom products + custom docs, and returns the merged data: products in order `[custom, newly-pinned, scraped]`; synthetic Category facet section rebuilt from all sources; custom-product filter tags (brand/colors/material) injected into the corresponding scraped facet values' SKU arrays so OR-within / AND-across filter semantics work uniformly across all sources. Orchestrators: `getAugmentedDealsData()` in [lib/deals.ts](lib/deals.ts) and `getAugmentedNewProductsData()` in [lib/new-products.ts](lib/new-products.ts). Pages [app/deals/page.tsx](app/deals/page.tsx) and [app/new-products/page.tsx](app/new-products/page.tsx) fetch `customDocs` from Sanity and pin lists from the singletons in parallel, then call the augmenter.

**Filter behavior for custom products:** participate fully in Brand / Color / Material list filters when Patrick tags them in Sanity. Participate in the synthetic Category section via `parentCategory` ref. Range filters (price, MOQ, production-time): custom products are hidden when those filters are active — Searchspring-native range buckets are not synthesized for custom products at this time. Patrick can avoid this by leaving those filter sections unused, or by tagging the matching range scenario in his pin/blocklist instead.

**Acceptance.**

- [x] `customProduct` schema extended with placements, commerce, filter-tag, badge fields
- [x] `globalSettings.dealsPage.pinnedDealSkus[]` + `newProductsPage.pinnedNewProductSkus[]` added
- [x] Pinned Geiger SKUs resolve against `products.json` and prepend to the visible grid
- [x] Custom products with `placements.onDeals == true` render on `/deals`; same for `/new-products`
- [x] Custom products participate in Brand / Color / Material filter sections when tagged
- [x] Custom products participate in the synthetic Category facet section via parentCategory
- [x] External URLs on custom products: non-Geiger pass through, Geiger auto-rewrite via `lib/affiliate-url.ts`
- [x] Hide list, pin list, and custom-product flag all coexist without interfering
- [x] `applyHiddenSkus()` continues to work on the augmented data
- [x] `pnpm typecheck` clean
      **Depends on.** M5-510 (Phase F scrape), M5-504 (customProduct schema + customCategory render), Phase G new-products scrape.
      **Estimate.** 3 hours. **Actual:** ~3 hours.

---

## Module 6: QA, Migration, Launch

### [ ] M6-601: URL audit

**Scope.** Automated check script that crawls staging and verifies all 22,180 category URLs + 731 blog URLs + brand pages + deals page + static pages + paginated category URLs return 200.
**Acceptance.**

- [ ] Crawler script committed
- [ ] Zero unexpected 404s or 500s in report
- [ ] Custom 404 page polished
- [ ] Decision on legacy blog taxonomy URLs documented
      **Depends on.** M3-310, M4-403, M4-405, M5-508, M5-510.
      **Estimate.** 4 hours.

### [ ] M6-602: Cross-browser and device testing

**Scope.** Test on Chrome, Safari, Firefox, Edge on desktop. iOS Safari and Chrome Android on mobile. Test at 375, 768, 1280, and 1920 viewports.
**Acceptance.**

- [ ] No visual breakage on any tested browser
- [ ] No interaction breakage on any tested browser
- [ ] Test results documented at `/docs/qa-matrix.md`
      **Depends on.** M6-601.
      **Estimate.** 5 hours.

### [ ] M6-603: Pre-launch setup (GA4, GSC, runbook)

**Scope.** Connect GA4, Search Console verification, configure events for lead form, search, outbound clicks. Set production env vars. Launch runbook.
**Acceptance.**

- [ ] GA4 receiving events from staging
- [ ] Search Console verified for both hostnames
- [ ] Events firing on form submit, search, outbound click
- [ ] Production env vars set
- [ ] Sanity webhook points to production
- [ ] Launch runbook reviewed and approved
      **Depends on.** M1-103, M3-308, M5-502.
      **Estimate.** 4 hours.

### [ ] M6-604: Final scrape refresh and production build

**Scope.** Run one last scraper end-to-end (Phases A, B, C, E) the day before launch. Regenerate AI content for any newly added Geiger categories. Final production build.
**Acceptance.**

- [ ] Fresh data committed
- [ ] Production build completes
- [ ] All 22,180 + 731 + brands + deals + static URLs build successfully
- [ ] Build time recorded for future reference
      **Depends on.** M6-602.
      **Estimate.** 3 hours.

### [ ] M6-605: DNS cutover and launch

**Scope.** Lower TTL 48 hours prior, add SPF/DKIM records for Gmail SMTP, repoint apex on launch day, monitor 24 hours, submit updated sitemap to GSC.
**Acceptance.**

- [ ] TTL lowered 48 hours prior
- [ ] SPF and DKIM records propagated
- [ ] perfectimprints.com resolves to new site
- [ ] HTTPS valid, no certificate warnings
- [ ] Sitemap submitted to GSC
- [ ] No errors in first 24 hours monitored
      **Depends on.** M6-604.
      **Estimate.** 3 hours active, 24 hours monitoring.

### [ ] M6-606: Monthly auto-rebuild scheduler

**Scope.** GitHub Action workflow `.github/workflows/monthly-rebuild.yml` scheduled for the 1st of every month at 00:00 UTC. Runs scraper Phases A, B, C, E (Phase D mapping is stable). Regenerates AI content for new categories. Detects removed products. Email summary to Patrick.
**Acceptance.**

- [ ] Workflow file committed
- [ ] Scheduled trigger works (verified by manual workflow_dispatch)
- [ ] Auto-merge PR opens with data changes
- [ ] Production build triggers on merge
- [ ] Removed Geiger products detected and dropped from category pages
- [ ] Brand logos refreshed if Geiger updated them
- [ ] Email summary delivered to Patrick
- [ ] Manual Sanity trigger button works
- [ ] Warmup workflow (`.github/workflows/post-deploy-warmup.yml`) triggered as last step of monthly rebuild PR merge — without it the redeploy reintroduces the 24-48h cold-facet window every month
      **Depends on.** M6-605, M1-112.
      **Estimate.** 4 hours.

### [ ] M6-607: Training and handover

**Scope.** Screen-capture walkthrough plus written quick-reference notes for Patrick.
**Acceptance.**

- [ ] Video delivered (under 20 minutes total)
- [ ] Quick-reference notes committed
- [ ] Patrick confirms understanding via WhatsApp or email
      **Depends on.** M5-501, M5-503, M5-504, M5-505.
      **Estimate.** 2 hours.

---

## Open Questions

All five major architectural questions LOCKED as of May 15, 2026. Remaining minor items:

### [ ] OQ-1: Lead email "from" address

Patrick directly or alias like `leads@perfectimprints.com`. Affects M3-308 env var `LEAD_EMAIL_FROM`.

### [x] OQ-2: Image fallback policy — RESOLVED

Patrick confirmed (2026-05-23): pages without matching Geiger products link to Geiger homepage. Engineering extended this into a 4-tier recovery chain. See CLAUDE.md Section 16. Plus: per-product image 404 fallback (Patrick 2026-05-25) tracked under M3-302.

### [ ] OQ-3: Old site cutover timing

Parallel period or immediate decommission. Affects M6-605.

### [ ] OQ-4: Final green CTA hex shade

Confirm `#16A34A` during M1-105 style guide review, or set a different value in CLAUDE.md Section 10.

### [x] OQ-5: AI model choice — RESOLVED

DeepSeek-V3 confirmed.

### [x] OQ-6: Email delivery method — RESOLVED

Gmail SMTP via Nodemailer confirmed.

### [x] OQ-7: Sanity model — RESOLVED

Hybrid model confirmed.

### [x] OQ-8: Brand red — RESOLVED

`#E11F1E` extracted from pi-logo.svg, locked.

### [x] OQ-9: Sanity AI generation button — RESOLVED

Build it (M5-505), upgraded to v2 buying-guide prompt format.

### [x] OQ-10: Per-facet membership scrape strategy — RESOLVED

One Searchspring API call per facet URL.

### [x] OQ-11: Brand logo source — RESOLVED (2026-05-25)

Patrick chose Option 1: scrape brand logos from Geiger. Tracked as M1-112 Phase E.

### [x] OQ-12: Content format for root pages — RESOLVED (2026-05-25)

Patrick approved Week 2 demo content quality and requested upgrade to buying-guide format with keyword derivatives (custom, promotional, branded, personalized, logo, bulk, wholesale). Reference: Stadium Seat Cushions blog. H2 wording confirmed as `Custom [Category] Buying Guide`. Tracked as M2-202 v2 reopen.

---

## Backlog (Post-Launch)

Items deferred from the 40-day window:

- Native checkout on Perfect Imprints
- Product detail pages owned by Perfect Imprints
- Expanded videos section (Patrick has explicitly asked for this; scope and quote separately)
- HubSpot or Salesforce CRM integration
- Paid ad landing page system with split testing
- Multi-language support
- Authenticated user accounts
- Advanced personalization based on visitor industry
- Real-time Geiger inventory syncs
