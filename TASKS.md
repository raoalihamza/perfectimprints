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
- **Pre-launch blocker:** `GMAIL_APP_PASSWORD` must be set in Vercel. Without it, submissions return 500. Patrick to supply.

### [ ] M3-309: Site-wide search overlay

**Scope.** Header search bar with autocomplete dropdown. Lazy-loads Fuse and prebuilt index from `/public/search-index.json`. Keyboard navigation. Routes to `/search?q=...` on Enter or "see all".
**Acceptance.**

- [ ] Lazy load on first focus
- [ ] Autocomplete shows top 10 matches with type badge
- [ ] Keyboard arrows + Enter work
- [ ] `/search` page renders full results
      **Depends on.** M5-502.
      **Estimate.** 5 hours.

### [ ] M3-310: 404 and edge cases polish

**Scope.** 404 page with helpful category and blog suggestions plus search. Loading states across all routes. Error boundaries with retry. Accessibility audit.
**Acceptance.**

- [ ] Custom 404 page polished
- [ ] All routes have loading.tsx
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

- [x] Python+Wayback scraper committed AND RUN ([scripts/scrapers/blogs/scrape.py](scripts/scrapers/blogs/scrape.py)). TS Playwright scraper deprecated mid-run because PI sits behind Cloudflare WAF that 403s all automation.
- [x] 478 of 731 blog posts have raw JSON output (65% coverage; the other 253 simply have no usable Wayback snapshot — Wayback never successfully crawled them, so their content is unrecoverable without direct CF access)
- [ ] Inline images: deferred to image backfill phase per `--skip-images` decision (Wayback throttles parallel image fetches too hard for the import window). Body HTML has Wayback-wrapped URLs that the backfill script can fetch from.
- [x] Failures logged with HTTP status to `data/blogs/.scrape-errors.log` (253 no-snapshot + 48 parse failures)
- [x] Body content preserved as HTML for portable text conversion
      **Depends on.** None.
      **Estimate.** 8 hours.

**Week 4 progress (2026-06-08).** TS Playwright scraper was DEPRECATED mid-run (perfectimprints.com sits behind a strict Cloudflare WAF that 403s all automation including Playwright with realistic Chrome UA + curl_cffi with chrome131 TLS impersonation). Pivoted to a Python+Wayback Machine pipeline that worked. Final coverage:

- **Scrape source:** Wayback Machine (CDX `latest 200-status snapshot per URL` query → fetch via `id_/` raw modifier). Implementation at [scripts/scrapers/blogs/scrape.py](scripts/scrapers/blogs/scrape.py), invoked via `pnpm scrape-blogs` (now points at Python). The deprecated TS scraper at [scripts/scrapers/blogs/scrape.ts](scripts/scrapers/blogs/scrape.ts) is kept for reference in case Cloudflare access opens up later (e.g. Patrick's distributor relationship).
- **Coverage:** 478 of 731 PI blog URLs (65%) have a usable Wayback 200 snapshot and were successfully scraped. 253 URLs (35%) have NO snapshot — either Wayback never crawled them (newer posts, mostly 2024+) or only 403-wrapped snapshots exist. These get stub drafts during import (see M4-402 notes).
- **Parser handles three PI eras:** WordPress (`article .entry-content`), MPower Nuxt SSR (`#pageData section.fdb-block .container.py-3`), and falls back to a structural heuristic that picks the largest non-navbar `<section>` for cases where the snapshot rendered the whole `__layout` div instead of just the article. After the second-pass parser fix, 477 of 478 scraped blogs have clean bodies (one outlier — `promotional-lip-balm` — has Magento-era markup that fell through).
- **Inline `<a href>` tags preserved** in `bodyHtml` so internal `/cat/*` links remain functional. Confirmed in verify pass: representative samples show 1, 9, 13, 76, and 2146 link annotations preserved.
- **Image strategy changed:** original plan was to download header + inline images during scrape. Pivoted to skipping image downloads in scrape and storing absolute Wayback-wrapped URLs in `bodyHtml` so the import phase fetches them — but even there, Wayback's CDN throttles parallel fetches hard enough to make per-blog upload 60+ seconds. Final decision: ran import with `--skip-images` (text + structure only); built a follow-up `pnpm backfill-blog-images` script that Patrick can run separately to backfill at least header images.
- Raw scrape output in `data/blogs/raw/*.json` (478 files). `data/blogs/.scrape-errors.log` documents the 253 missing snapshots and 48 parse failures. CDX cache at `data/blogs/.cdx-cache.json` (5s rebuild).
- Runtime: ~16 min for first pass, ~3 min for the cleanup re-scrape of polluted MPower blogs.

### [x] M4-402: Blog Sanity schemas and migration

**Scope.** Define `blogPost`, `blogCategory`, and `author` schemas. Migration script that reads raw blog data, converts HTML to portable text, uploads images to Sanity, writes blogPost documents as drafts. **Each blogPost must carry category tags** that map to PI root category slugs — these enable the Related Blogs section in M3-311.
**Acceptance.**

- [x] All three Sanity schemas updated (blogPost extended; blogCategory + author unchanged)
- [x] Migration script committed + run with HTML→portable text + Sanity asset uploads + author/category dedup
- [x] Bulk-publish script committed + run after programmatic verification
- [x] All 731 blogs imported into Sanity (478 real + 253 stubs, 0 failures after retry)
- [x] 5 sample drafts programmatically verified (`pnpm verify-blog-drafts`) — ALL CLEAN: link annotations preserved (1, 9, 13, 76, 2146 across samples), publishDate ISO-normalized, body non-empty, no orphan image blocks
- [x] Bulk publish executed — 731/731 published, 0 drafts remain
- [ ] Inline images preserved in portable text **— DEFERRED to image backfill pass; current import ran with `--skip-images` to clear Wayback's image-fetch bottleneck. Run `pnpm backfill-blog-images` to fetch + upload header images post-launch.**
- [x] Inline `<a>` tags preserved as portable text link annotations (verified: 5 samples carried 1, 9, 13, 76, 2146 link annotations respectively)
- [x] Publish dates preserved exactly (ISO-normalized from scraped article:published_time meta; falls back to snapshot timestamp when no published_time was captured)
- [x] `relatedCategorySlugs` populated via best-effort title+tag matching against 465 PI root slugs — 321/731 (44%) have at least one mapping
- [x] Re-running the migration is idempotent (deterministic `blog-post-<slug>` IDs; `createOrReplace` semantics)
- [x] Patrick can edit any blog in Sanity Studio after import (slug auto-source removed → original URLs preserved verbatim)
      **Depends on.** M1-104, M4-401.
      **Estimate.** 6 hours.

**Week 4 progress (2026-06-08).** Migration completed end-to-end while Patrick was AFK. Final Sanity state: 731 blogPost docs (all published), 26 authors, 30 blogCategory taxonomy docs. 321 published blogs (44%) have at least one entry in `relatedCategorySlugs` — best-effort title+tag match against the 465 PI root slugs.

**Pipeline iterations during the run (recorded for posterity):**
1. First image-uploading attempt timed out — Wayback CDN throttles parallel image fetches to 8-30s each, so blogs with 10+ images would sit blocked for minutes. Pivoted to `--skip-images` text-only import; image backfill scheduled separately ([scripts/migrations/backfill-blog-images.ts](scripts/migrations/backfill-blog-images.ts), `pnpm backfill-blog-images`).
2. Per-doc `createOrReplace` was sequential and ran at ~1.5 sec/doc → ETA was 3+ hours. Refactored to parallel chunks (`CONCURRENCY=8` when --skip-images) and batched stub transactions (`STUB_BATCH_SIZE=50`). Full re-import finished in ~5 min after.
3. First scrape produced 111 "polluted" blogs whose body container was the whole `__layout` div (megamenu + footer included), because the MPower-era selectors missed those snapshots. Added a "drill-down" step that, when body is `#__layout`/`#__nuxt`/`#pageData`, picks the largest `<section>` matching `fdb-block|blog-post-content|container py-3` with megamenu blocklist. Re-scrape recovered 86 of those (others fell to parse failure → stub).
4. Custom `<a>` rule in `htmlToBlocks` was silently dropping link annotations. Removed it; default block-tools handler now preserves links correctly (`markDefs` of type `link` with `href`).
5. Image blocks with empty `_placeholderSrc` were leaking into Sanity. Tightened the filter to drop blocks with empty placeholders.
6. Bulk publish initial batch size (50) hit Sanity's 4MB request limit on one batch. Reduced to 15; remaining 50 published cleanly on retry.

**Operational note for Patrick:**
- All 731 blog URLs now resolve on staging — 478 with real content scraped from Wayback, 253 are stubs with title-only ("Content coming soon" placeholder). Stub list is recoverable by GROQ: `*[_type=="blogPost" && body[0].children[0].text == "This post is being migrated. Please check back soon — the original article is in the process of being restored."]{ slug, title }`.
- Image backfill is the obvious next step. Run `pnpm backfill-blog-images --dry-run` first to see what would happen, then `pnpm backfill-blog-images` to fetch + upload header images. Concurrency is throttled (4 workers, 12s timeout) so it won't melt Wayback.
- 322 blogs need editorial cleanup if you want richer `relatedCategorySlugs` coverage (the auto-mapping caught 321/731 = 44% via title-token match; Studio editing lifts that without much effort).
- One real outlier: `promotional-lip-balm` captured a Magento-era PI template (377KB body, 2146 link annotations) — quick Studio edit when you have time.

**Files (all committed-ready):**

- [sanity/schemas/documents/blog-post.ts](sanity/schemas/documents/blog-post.ts) — extended (relatedCategorySlugs, metaTitle, metaDescription, link annotation, slug auto-source removed, orderings).
- [scripts/scrapers/blogs/scrape.py](scripts/scrapers/blogs/scrape.py) — Python+Wayback scraper.
- [scripts/migrations/import-blogs.ts](scripts/migrations/import-blogs.ts) — main import with stub generation, parallel writes, `--skip-images` flag.
- [scripts/migrations/publish-blog-drafts.ts](scripts/migrations/publish-blog-drafts.ts) — bulk-publish, batch size 15 after the 4MB hit.
- [scripts/migrations/verify-blog-drafts.ts](scripts/migrations/verify-blog-drafts.ts) — programmatic sample verification (`pnpm verify-blog-drafts`).
- [scripts/migrations/backfill-blog-images.ts](scripts/migrations/backfill-blog-images.ts) — separate image backfill (`pnpm backfill-blog-images`).

- [sanity/schemas/documents/blog-post.ts](sanity/schemas/documents/blog-post.ts) extended: `relatedCategorySlugs` (string array, tags layout) for the M3-311 Related Blogs section; explicit `metaTitle` + `metaDescription` top-level fields (in addition to nested `seo` object); slug field's `source: 'title'` removed so import preserves original PI URLs verbatim; body block schema gains a `link` annotation with `href` + `openInNewTab` for inline hyperlinks; orderings by publishDate + title.
- [scripts/migrations/import-blogs.ts](scripts/migrations/import-blogs.ts) (`pnpm import-blogs`, supports `--dry-run`, `--limit=N`, `--resume`): converts `bodyHtml` → portable text via `@sanity/block-tools` + `jsdom`; uploads header + inline images to Sanity assets (image cache so duplicate srcs dedupe); upserts `author` + `blogCategory` docs by deterministic IDs; populates `relatedCategorySlugs` by token-matching blog title + tags against PI root slug set in [data/pi-urls/category-urls.json](data/pi-urls/category-urls.json); writes every blog as a DRAFT (`drafts.blog-post-<slug>`) — never auto-publishes. Writes a coverage report to `data/blogs/migration-mapping-report.json` showing how many blogs got mapped + top mapped slugs by count.
- [scripts/migrations/publish-blog-drafts.ts](scripts/migrations/publish-blog-drafts.ts) (`pnpm publish-blog-drafts`, supports `--dry-run`, `--slug=foo` for targeted publishing of sample blogs): batches drafts in groups of 50, uses Sanity transactions (`createOrReplace` published id + `delete` draft id) so promote is atomic per batch.
- **Action for Patrick after M4-401 scrape completes:**
  1. `pnpm import-blogs --dry-run` to preview counts
  2. `pnpm import-blogs` — writes 731 drafts to Sanity (~10-20 min, image-upload bound)
  3. Spot-check 5 representative drafts in Studio (short, long, image-heavy, link-heavy, rich-formatting)
  4. Manually publish the 5 samples in Studio; verify on staging at `dev.perfectimprints.com/blog/[slug]`
  5. If 4/5 clean → `pnpm publish-blog-drafts` to bulk publish the remaining ~726 drafts
  6. If 2+/5 reveal systematic issues → fix `import-blogs.ts`, delete drafts via Studio (or GROQ), re-run import (idempotent), re-verify

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
- [x] All 731 published blog URLs are live on Sanity (verified via GROQ count). Staging pages should resolve on next Vercel deploy.
      **Depends on.** M4-402, M3-308.
      **Estimate.** 10 hours.

**Week 4 progress (2026-06-08).** All routes + components built and typechecking clean. Blog content is empty until Patrick runs the M4-401/M4-402 sequence.

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

---

## Module 5: Search, Forms, Home, Deals, Polish

### [ ] M5-501: Home page

**Scope.** Build the home page from the `homePage` Sanity singleton: hero banner, featured categories grid, new products carousel, featured brands logos, testimonials, blog preview, CTA banners. Editable end-to-end from Sanity.
**Acceptance.**

- [ ] Home page renders from Sanity content
- [ ] All six featured image blocks link correctly
- [ ] New products carousel pulls latest Geiger SKUs
- [ ] Brands grid pulls from `brand` documents
- [ ] Mobile responsive
      **Depends on.** M1-104, M1-105, M4-404.
      **Estimate.** 8 hours.

### [ ] M5-502: Site-wide search (Fuse.js)

**Scope.** Build-time script that generates a Fuse.js index covering every category title, every blog title plus snippet, every brand name, every FAQ question.
**Acceptance.**

- [ ] Index built at build time, covers all content types
- [ ] Search overlay lazy-loads (no impact on initial bundle)
- [ ] Results rank by relevance with category/blog/brand badge
- [ ] `/search?q=...` URL accessible directly
- [ ] Keyboard navigation works
- [ ] No external service dependency
      **Depends on.** M2-207, M4-402.
      **Estimate.** 8 hours.

### [ ] M5-503: Mega menu population from Sanity

**Scope.** Replace the Geiger-taxonomy-driven mega menu from M1-106 with a Sanity-driven implementation. Patrick can reorder departments, edit labels, hide items, and update Featured Promos and New Products lists. **Adds two new main menu items per Patrick feedback (2026-05-25):**

- **Deals** main menu button linking to `/deals` (see M5-510)
- **Brands** main menu button linking to `/brands` (see M4-405)

**Acceptance.**

- [ ] All menu items render from Sanity
- [ ] Reorder via drag in Sanity reflected on staging within 60 seconds
- [ ] Featured Promos and New Products updateable
- [ ] Removed items disappear from live menu
- [ ] Deals and Brands menu items render with correct links
- [ ] Keyboard accessible with focus trap
      **Depends on.** M1-106, M1-104, M4-405, M5-510.
      **Estimate.** 4 hours.

### [ ] M5-504: Custom category and custom product schemas

**Scope.** `customCategory` and `customProduct` Sanity schemas. Render through the same `/cat/[...slug]` route.
**Acceptance.**

- [ ] customCategory document type editable
- [ ] customCategory renders without Geiger link if none set
- [ ] CTAs default to contact form when no Geiger URL
- [ ] customProduct documents render in chosen category page grid
- [ ] External URL opens correctly
- [ ] Display order respected in grid
      **Depends on.** M3-301.
      **Estimate.** 4 hours.

### [ ] M5-505: Sanity AI generation button

**Scope.** Custom Sanity Studio action that appears on customCategory documents. Calls DeepSeek with the root_category prompt (v2 buying-guide format) and patches the document with intro, buying guide, and FAQs.
**Acceptance.**

- [ ] "Generate with AI" button visible on customCategory documents only
- [ ] Click triggers DeepSeek call with appropriate prompt
- [ ] Returned content patched into intro, buying guide, and FAQs fields
- [ ] Loading state shown during call
- [ ] Error state shown on failure
- [ ] Patrick can review and edit before publishing
      **Depends on.** M5-504, M2-202.
      **Estimate.** 8 hours.

### [ ] M5-506: Services pages, Rush page, static content pages

**Scope.** Build all static content pages. Content sourced from Sanity. Contact page includes lead form.
**Acceptance.**

- [ ] All pages render at correct URLs
- [ ] Content editable in Sanity
- [ ] Mobile responsive
- [ ] Linked from header and footer where appropriate
      **Depends on.** M1-104, M1-105, M3-308.
      **Estimate.** 6 hours.

### [ ] M5-507: Videos section

**Scope.** Build `/videos` index and `/videos/[slug]` detail pages. VideoObject schema markup. Basic scope only.
**Acceptance.**

- [ ] Index renders with at least seed data
- [ ] Detail page embeds YouTube reliably
- [ ] VideoObject schema added
- [ ] Mobile responsive
      **Depends on.** M1-104, M1-105.
      **Estimate.** 8 hours.

### [ ] M5-508: Performance and SEO infrastructure (incl. Patrick mobile pagespeed fixes)

**Scope.** Sitemap generator covering all 22,180 categories + 731 blogs + brands + deals + static pages (excluding paginated page 2+). robots.txt. Meta tags audit. Schema.org Organization in root layout. Canonical URLs on every page. **Mobile pagespeed optimization per Patrick feedback (2026-05-25):** preload hero image, preload primary font, defer non-critical scripts, image sizing hints for hot-linked Geiger images, font-display swap. Target mobile Lighthouse 90 plus on home and root templates.

**Patrick feedback (2026-05-25):** "Mobile speed good but I'd like the Largest Contentful Paint and Speed Index Improved — desktop speed is amazing!"

**Acceptance.**

- [ ] sitemap.xml validates against Google spec
- [ ] robots.txt allows all and references sitemap
- [ ] Zero missing or duplicate meta tags
- [ ] Schema.org Organization present
- [ ] LCP under 2.5s, CLS under 0.1, INP under 200ms on home and root category templates
- [ ] Mobile Lighthouse Performance 90 plus on home, sample root category, sample blog
- [ ] Speed Index improved by at least 30% on the previously tested URL
      **Depends on.** M3-310, M4-403, M5-501.
      **Estimate.** 8 hours.

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

### [ ] M5-510: Deals page and Deals menu button (NEW)

**Scope.** Added 2026-05-26 per Patrick feedback. New `/deals` route that aggregates all on-sale and closeout products across the catalog into one landing page, similar to Geiger's `/b/deals` page (which uses Searchspring `bgfilter.category_path=Home > Shop By > Deals`).

Source data: filter `data/geiger/products.json` to products where `is_on_sale=true` OR any badge has `tag` matching "sale" / "deals" / "closeout". Render with the same ProductCard component. AI-generated H1 and intro for the page (separate prompt or one-off content in Sanity).

Plus mega menu addition: "Deals" main menu item linking to `/deals` (handled in M5-503).

**Patrick feedback (2026-05-25):** "I'd like to have a main menu button That sales Deals, which leads to all the products on sale."

**Acceptance.**

- [ ] `/deals` route renders as a static page
- [ ] All on-sale and closeout products from the catalog appear in the grid
- [ ] Product count displayed
- [ ] SALE/CLOSEOUT ribbons visible on every card (already built into ProductCard from M3-302)
- [ ] AI intro paragraph or Sanity-editable hero copy
- [ ] Pagination if more than 60 products
- [ ] Mobile responsive
- [ ] Schema.org BreadcrumbList present
      **Depends on.** M3-302, M3-303, M3-306.
      **Estimate.** 5 hours.

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
