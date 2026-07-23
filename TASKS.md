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
- [x] Runs as part of monthly auto-rebuild (M6-606) — Phase E is its own `scrape-e` job in `monthly-rebuild.yml`
      **Depends on.** M1-108.
      **Estimate.** 4 hours.

**Week 4 progress (2026-06-05).** Done.

- Probe found the A-Z index renders all 191 brand entries inline on a single page: each brand is an `<a href="/b/brand-names#/filter:brand:<NAME>">` wrapping an `<img>` with the logo URL on Geiger's S3 / imgsirv CDN. **No per-brand fetches needed for logos** — the spec's "visit each brand page" step collapses to one HTTP GET + N image downloads.
- [scripts/scrapers/geiger/brand_logos.py](scripts/scrapers/geiger/brand_logos.py): single-fetch index parser + image downloader with 1 req/sec throttle. Wired into `run.py` as `--phase e`. Resumable (skip if file already on disk). Mirrors logos to `public/brand-logos/<slug>.<ext>` so Next.js serves them directly; canonical store under `data/geiger/brand-logos/` is preserved per CLAUDE.md §8.
- HTML-entity decoding (`html.unescape`) applied before slugifying to merge `Cutter &amp; Buck` (products.json) with `Cutter & Buck` (index). Five cross-listed brands merged correctly: cutter-buck, mms, port-co, travis-wells, wp.
- Output: 191 logos downloaded as valid GIFs (verified with `file`), 205 brands in `data/geiger/brands.json` (191 from index + 14 product-catalog-only orphans), 194 brands have ≥1 product in our catalog. Runtime ~3 min.
- Monthly auto-rebuild hook (M6-606) DONE — Phase E runs as the dedicated `scrape-e` job in `.github/workflows/monthly-rebuild.yml`, uploading `brands.json` + `brand-logos/` + `public/brand-logos/` into the assembled monthly PR.

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
- **Parser:** Current MPower template uses `.blog-post-body` (no era-switching needed since we're hitting live PI not Wayback snapshots). PI's "Published: M/D/YYYY Updated: ... Author: ..." metaline below H1 is parsed regex-style for dates + author.
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
3. Scraper extractor pass — the og:title vs H1 issue was fixed by preferring H1 and storing og:title separately as `metaTitle`. The publishDate issue was fixed by parsing PI's inline "Published: M/D/YYYY Updated: ... Author: ..." line below the H1 (regex-driven). Author extracted from the same line — 100% capture rate.
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

- [lib/brands.ts](lib/brands.ts): server-only data loader. Sanity-first via GROQ `*[_type == "brand"]`; falls back to `data/geiger/brands.json` if Sanity returns nothing. Merges per-slug so Sanity-edited `description`/`featured`/logo overrides the static defaults but JSON-only orphans still surface. (Reads through the non-CDN `cachedClient` + `BRANDS_TAG`, wrapped in React `cache()` for per-request dedup — updated in M5-520/Task F so a `featured` toggle revalidates deterministically; the earlier cross-request module memo was removed because it would have masked the webhook bust.)
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

**Part 1 follow-up — content editability + Patrick's copy (2026-06-27).**

- **Hero text now editable.** Added the `homePage.heroText` group (`eyebrow`/`headline` (H1)/`subheadline`) to [sanity/schemas/singletons/home-page.ts](sanity/schemas/singletons/home-page.ts); [components/home/Hero.tsx](components/home/Hero.tsx) renders the eyebrow from it. Patrick previously couldn't locate the hero text to edit it. Hero stays text-only (no image) so the LCP element remains text-bound — no regression of the M5-508 perf work. Legacy `heroBanner` object kept (collapsed) as a back-compat fallback only; not rendered on the home page. Seeded with Patrick's exact copy: eyebrow `BULK PROMOTIONAL EXPERTS SINCE 1999`, H1 `Custom Promotional Products That People Actually Use`, sub `Branded apparel, drinkware, bags, tech, and giveaways … rush options, and free art proofs.`
- **Banner-row heading.** Added editable `bannerRowHeading` (H2) + `bannerRowSubheading`, rendered directly above the banner row by [components/home/BannerRow.tsx](components/home/BannerRow.tsx). Seeded `Featured Product Categories` / `Seasonal promos your customers and team will love and use right now!`
- **Value Pillars hyperlink bug fixed.** Each pillar's `body` changed from a plain string to **portable text** so links work (Patrick's attempt to add a hyperlink had rendered raw code). [components/home/ValuePillars.tsx](components/home/ValuePillars.tsx) renders it through `PortableText` with inline `pillarComponents`: links are **brand red** + underline-on-hover, external links open in a new tab with `rel="noopener noreferrer"`. `getHomePage` normalizes legacy string bodies to portable text so nothing is lost. Patrick can now link "Rush Production Available" → `/rush-products`.
- **Home meta** set to Patrick's exact copy (title `Custom Promo Products & Branded Apparel by Perfect Imprints`, description `Custom promotional products & branded apparel for bulk B2B orders. Shop 22,000+ trending promo items with free art proofs and rush options.`) in [app/page.tsx](app/page.tsx); self-canonical + OG behavior unchanged (OG overhaul is a later part).
- **Seed/migration:** `pnpm seed-home-content` ([scripts/seed/seed-home-content.ts](scripts/seed/seed-home-content.ts)) — idempotent: fills hero + banner-row blanks only (never clobbers Studio edits) and migrates legacy pillar string bodies → portable text, preserving the text.
- No `/cat` changes; `pnpm typecheck` clean. Favicon already done (skipped).

**Part 6 follow-up — home interactive sections (2026-06-28, "not critical for launch").**

- **Rush pillar literal-HTML fix.** Patrick had pasted `<a href="/rush-products">24 hour rush promos</a>` as plain text into the "Rush Production Available" pillar, so it rendered as visible code. New one-off migration `pnpm fix-pillar-links` ([scripts/migrations/fix-pillar-inline-links.ts](scripts/migrations/fix-pillar-inline-links.ts)) scans every `valueProps[].body` block, and for any span containing a literal `<a href="URL">TEXT</a>` rewrites it into a normal span carrying a `link` markDef (handles relative + absolute URLs; only touches spans with the pattern). **Ran it live** (fixed the Rush pillar — now a real brand-red link), then **re-ran to confirm idempotent** ("nothing to change").
- **Value Pillars rotate when >3.** Extracted the card into shared [components/home/PillarCard.tsx](components/home/PillarCard.tsx). [ValuePillars.tsx](components/home/ValuePillars.tsx) renders the original static row for ≤3, and delegates to the new client [ValuePillarsCarousel.tsx](components/home/ValuePillarsCarousel.tsx) for >3 (3 visible/desktop, 1/mobile, snap-scroll + prev/next + auto-advance paused on hover/focus and disabled for `prefers-reduced-motion`). Schema `valueProps` validation relaxed from `length(3)` → `min(1)` so Patrick can add more.
- **Testimonials 3-up carousel + editable heading.** New `homePage.testimonialsHeading` field (default "What Our Customers are Saying", component-level default too → no migration needed). [Testimonials.tsx](components/home/Testimonials.tsx) is now a client carousel: 3 per view on desktop / 1 on mobile, prev/next + native swipe + auto-advance, dark `bg-brand-ink` styling kept.
- **Rush Products rail on home.** New `homePage.rushProductsHeading` (default "Rush Production Promotional Products"). New `getRushProducts(12)` in [lib/rush-products.ts](lib/rush-products.ts) mirrors `getNewProducts` over the existing `data/geiger/rush-products.json` (53 products, no new scrape/network). [NewProductsRail.tsx](components/home/NewProductsRail.tsx) parameterized (subtitle / view-all href+label / background) so the Rush rail reuses its presentation; placed directly after the New rail in [app/page.tsx](app/page.tsx); cards link to affiliate URLs via `ProductCard`.
- Home stays `force-static`; `/cat` untouched; `pnpm typecheck` clean.

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

**Hybrid search — instant freshness follow-up (2026-06-21).** Patrick asked: when content is added in Sanity _after_ a deploy (custom category/product, new/rush/deals additions, blogs, videos), how does it get into the static `search-index.json`? It didn't — the static index is build-time only. Implemented a hybrid:

- **Static bulk** ([scripts/search-index/build-index.ts](scripts/search-index/build-index.ts) → `public/search-index.json`): slimmed to Geiger categories + products + brands only (no Sanity calls). ~30,340 items / 541 KB gzipped.
- **Live delta** ([app/api/search-index/route.ts](app/api/search-index/route.ts)): blogs + videos + custom categories + custom products, built by [lib/search/sanity-index.ts](lib/search/sanity-index.ts) from [lib/sanity/queries/blogs.ts](lib/sanity/queries/blogs.ts) + [videos.ts](lib/sanity/queries/videos.ts) + new [custom-categories.ts](lib/sanity/queries/custom-categories.ts) + new `getCustomProductSearchEntries()` in [custom-products.ts](lib/sanity/queries/custom-products.ts). ISR `revalidate` = 1 week (auto-refresh), busted within seconds of publish by the webhook.
- **Webhook** ([app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts)): `blogPost`/`video`/`customProduct`/`customCategory`/`curatedCategory` now `revalidatePath('/api/search-index')` (shared constant [lib/search/constants.ts](lib/search/constants.ts)) + revalidate the pages those docs render on. (Used `revalidatePath`, not `revalidateTag` — Next 16.2 changed `revalidateTag` to require a cache-profile arg.)
- **Client merge** ([lib/search/load-index.ts](lib/search/load-index.ts)): fetches static + live, merges + de-dupes by `type+url` (Sanity-first); live delta is best-effort.
- **Rendering gap:** `/deals`, `/new-products`, `/rush-products` switched `force-static` → ISR (`revalidate` 1 week + webhook) so Sanity custom products / pins / hides render without a full rebuild. Custom categories/blogs/videos already render from Sanity.
- Verified: `pnpm typecheck` clean; static `build:search-index` rebuilt (30,340 items); live Sanity queries smoke-tested (blogs 645, video 1 w/ category, custom categories 0). **Result: add anything in Studio → page live immediately + searchable within seconds; weekly auto-refresh is the safety net. Matching stays client-side Fuse — still no runtime Searchspring.**

### [x] M5-512: Sanity revalidation webhook setup (manual, per environment)

**Why this exists.** Discovered 2026-06-21 that the Sanity project has **no webhook configured** (API → Webhooks showed `0 of 2`), even though the handler `app/api/sanity/revalidate/route.ts` has been code-ready since M5-503. Until the webhook is created, NONE of the "instant on publish" behavior fires — mega menu / global settings / home / services pages / blogs / videos / custom products / custom categories / the live search delta all fall back to ISR/on-demand (up to a 1-week lag). The handler + the M5-507 hybrid search both depend on this. **This is a manual one-time setup in the Sanity dashboard, not provisioned by code.**

Full step-by-step (URL, filter, projection, secret, testing, troubleshooting): **[docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md)**.

**Status (2026-07-01): DONE on BOTH environments — staging + production webhooks created.**

**Acceptance.**

- [x] **Staging** webhook created → `https://dev.perfectimprints.com/api/sanity/revalidate`, filter + projection per the doc, secret matches Vercel `SANITY_WEBHOOK_SECRET` (Preview env).
- [x] `SANITY_WEBHOOK_SECRET` set in Vercel (Preview/staging) — redeploy done.
- [x] Staging verified end-to-end: publish a video/blog/custom product → webhook Delivery log shows **200 `{revalidated:true}`** and the item appears in search within seconds.
- [x] **Production** webhook created (2026-07-01) → `https://www.perfectimprints.com/api/sanity/revalidate` (same filter/projection/secret + `SANITY_WEBHOOK_SECRET` in Vercel Production env).
- [x] Production verified — customCategory publishes (e.g. `/cat/noise-makers`, `/cat/blenders-shakers`) now reflect edits within seconds instead of waiting for the next deploy.

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

**Part 8 — PageSpeed pass (mobile + desktop, 2026-06-28).** Addressed the red items Patrick flagged in PageSpeed Insights for the home page and a category page (`/cat/backpacks`), without regressing the M5-508 LCP work or the static `/cat` render. Conservative delivery/perf/a11y changes only — no product data / affiliate URL / schema / visible-content changes.

- **Earlier connections (render-blocking + critical chain).** [app/layout.tsx](app/layout.tsx) now emits `<link rel="preconnect">` + `dns-prefetch` for the Geiger image CDN `https://imgsirv.geiger.com` (no `crossOrigin` — plain `<img>` loads) so product images (the category LCP candidate) start downloading sooner, plus preconnect/dns-prefetch for `https://www.googletagmanager.com` (only when `NEXT_PUBLIC_GTM_ID` is set). The existing M5-508 LCP preload + eager/`fetchPriority=high` first-row image are untouched.
- **Async third-party scripts.** GTM still loads via `@next/third-parties` (`next/script` default `afterInteractive`, deferred). [components/forms/Turnstile.tsx](components/forms/Turnstile.tsx) switched `afterInteractive` → **`lazyOnload`** so the Cloudflare script loads at idle, never blocking first paint. Turnstile renders only where the lead form does — and the form/modal is now lazy (below), so the Turnstile script never ships on form-less pages.
- **Reduce unused JS (code-split via `next/dynamic`, `ssr:false`).** The interaction-only lead-form modal (LeadForm + Turnstile + file-validation) is split out of the **static `/cat` initial bundle** and the **search overlay** — [components/category/EmptyStateCTAButton.tsx](components/category/EmptyStateCTAButton.tsx) + [components/search/SearchEmptyCTA.tsx](components/search/SearchEmptyCTA.tsx) now `dynamic(() => import('@/components/forms/LeadFormModal'), { ssr:false })` and only mount it when opened (`{open && <LeadFormModal/>}`). The two below-the-fold home carousels load client-side via thin wrappers [components/home/TestimonialsLazy.tsx](components/home/TestimonialsLazy.tsx) + [components/home/ValuePillarsCarouselLazy.tsx](components/home/ValuePillarsCarouselLazy.tsx) (ssr:false + min-height placeholders to avoid CLS), keeping the value-pillar carousel JS out of the home bundle entirely in the common ≤3-pillar case. The header search overlay already lazy-loads Fuse.js + the index on first focus (unchanged). The mega menu was intentionally **left SSR'd** for nav-link crawlability.
- **Image delivery (~363KiB item).** Verified the existing setup already satisfies it: product `imageUrl`s request `format=webp&thumbnail=275&w=275&h=275` (the 275px grid display size, webp, **not upscaled**); `ProductImage`/`ProductCard` carry explicit `width`/`height` (275×275) + `sizes`; `ProductGrid` keeps only the first 4 cards eager (`fetchPriority=high`) and everything below lazy. No change required.
- **Forced reflow.** [components/home/ValuePillarsCarousel.tsx](components/home/ValuePillarsCarousel.tsx) now batches its scroll-driven arrow measurement inside `requestAnimationFrame` (coalesces bursts, no sync reflow on the scroll hot path) and uses a `ResizeObserver` instead of a window `resize` handler. [components/home/Testimonials.tsx](components/home/Testimonials.tsx) replaced its window-`resize` overflow check with a rAF-batched `ResizeObserver`. Behavior unchanged.
- **Legacy JS.** Added a conservative modern `browserslist` to [package.json](package.json) (`chrome 64 / edge 79 / firefox 67 / opera 51 / safari 12` — Next.js's documented modern baseline) so the compiler skips legacy polyfills/transforms for evergreen browsers while staying broad for B2B (no IE; Safari 12 = 2018).
- **A11y — `<select>` labels.** Added `aria-label="Sort products by"` to the category sort `<select>` ([components/category/SortDropdown.tsx](components/category/SortDropdown.tsx) — its visible `<label>` is `display:none` on mobile, removed from the a11y tree) and to the `/search` sort `<select>` ([components/search/SearchFacetedResults.tsx](components/search/SearchFacetedResults.tsx)). The facet sidebar uses checkboxes (each already `aria-label`ed), not selects.

**Acceptance (Part 8).**

- [x] `/cat/[...slug]` stays SSG — baseline build showed `● /cat/[...slug]` with 1,840 prebuilt paths; changes add no `searchParams`/`cookies`/`headers`/uncached fetch to the render path (the modal split is client-side only), so it remains static. M5-508 LCP preload + eager first-row image intact.
- [x] Render-blocking reduced: GTM stays deferred; Turnstile → `lazyOnload` and only on form pages (form/modal now lazy).
- [x] `preconnect` + `dns-prefetch` added for `imgsirv.geiger.com` (+ GTM when configured).
- [x] Initial JS reduced via `next/dynamic` (ssr:false) on the lead-form modal (/cat + /search) and the home carousels. (Next 16's build table no longer prints a First Load JS column, so the win is architectural — interaction-only/below-fold code removed from the initial bundles — rather than a printed delta; confirm on Vercel.)
- [x] Product images: correct width/height + sizes, below-fold lazy, first row eager, 275px webp variant (no upscale) — already in place, verified.
- [x] Forced-reflow fixed (rAF + ResizeObserver); behavior unchanged.
- [x] Modern `browserslist` set conservatively (no needed support dropped).
- [x] All `<select>`s have an accessible name (aria-label).
- [x] `pnpm typecheck` clean.
- [ ] `pnpm build` — **not run locally** (Patrick: builds don't run cleanly on his machine; verify on the Vercel deploy that `/cat/[...slug]` is still `●`/SSG with unchanged prerender count). Baseline build (before changes) passed and showed `/cat` SSG.
      **Depends on.** M5-508.

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

### [x] M5-514: UI feedback tweaks — footer SEO text full-width + red links; category CTA banner hours + Email Us button (DONE 2026-06-27)

**Scope.** Two additive shared-component tweaks from Patrick's feedback. No `/cat` data changes; route stays static.

**Implementation (2026-06-27).**

- **Footer bottom SEO text full-width + red links.** The bottom SEO text block ([app/page.tsx](app/page.tsx), `home.textContent` PortableText, rendered above the footer CTA banner) was constrained to a narrow `prose ... max-w-3xl` column. Changed to `prose prose-neutral max-w-none` so it spans the full site content width (the surrounding `Container` provides the shared max-width). Added a `seoTextComponents` PortableText override so hyperlinks render in **brand red, underline-on-hover** (`text-brand-red no-underline hover:underline`); external links open in a new tab with `rel="noopener noreferrer"` (mirrors the `ValuePillars` link pattern).
- **Category red CTA banner ([components/category/CTABanner.tsx](components/category/CTABanner.tsx)).** Hours updated `8am to 5pm CT` → **`9am to 5pm EST`**. Removed the plain `mailto:patrick@perfectimprints.com` link and replaced it with an **"Email Us" button linking to `/contact`** (outlined white button consistent with the banner's "Call" button — `border-2 border-white`, hover inverts to white bg / brand-red text). Values are hardcoded in the component (as they were before); no Sanity field drives this banner.

**Acceptance.**

- [x] Footer bottom SEO paragraphs span full content width (not a narrow column); links render brand red with hover underline
- [x] Category CTA banner shows `9am to 5pm EST`; email address replaced with an "Email Us" button linking to `/contact`
- [x] `/cat` unaffected and still static; `pnpm typecheck` clean
      **Depends on.** None.
      **Estimate.** 0.5 hours.

### [x] M5-515: Lead form file uploads + auto-detect CAPTCHA (Part 7, DONE 2026-06-28)

**Scope.** Optional file upload + Cloudflare Turnstile CAPTCHA on the lead form ([components/forms/LeadForm.tsx](components/forms/LeadForm.tsx), used on `/contact` AND in the category-page `LeadFormModal`). "Not critical for launch." No `/cat` rendering changes.

**Implementation (2026-06-28).**

- **Optional file upload.** Added an optional multi-file input to `LeadForm` ("Attach a logo or artwork (optional)") — up to 3 files, `.pdf/.png/.jpg/.jpeg/.gif/.svg/.ai/.eps`, ≤10MB each / ≤20MB total (under Gmail's 25MB ceiling). Validated client-side (count/type/size, inline error, selected-file list with per-file Remove) AND re-validated server-side (never trust the client).
- **Multipart submission.** `LeadForm` now POSTs **`multipart/form-data`** (a `FormData` with the text fields + honeypot + `sourceUrl` + validated files + the injected `cf-turnstile-response` token) instead of JSON; [app/api/leads/route.ts](app/api/leads/route.ts) parses via `request.formData()` (route already `runtime = 'nodejs'`). All existing fields, honeypot, validation, and 5/IP/hr rate limit unchanged.
- **Email + Sanity storage.** Files are attached to Patrick's email as Nodemailer `attachments` ([lib/email/gmail-smtp.ts](lib/email/gmail-smtp.ts), new `LeadEmailAttachment`) AND uploaded as Sanity file assets referenced by a new `attachments` array (`of: [{ type: 'file' }]`) on the `leadSubmission` schema (viewable in Studio). Each file's bytes are read once and reused for both. Asset upload + Sanity write are **non-fatal** (email still sends on failure), like the existing write. With no files, behavior is identical to before.
- **Cloudflare Turnstile (auto-detect CAPTCHA).** New [components/forms/Turnstile.tsx](components/forms/Turnstile.tsx) renders the managed-mode widget when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set (Cloudflare injects the `cf-turnstile-response` token into the form). The route verifies the token against Turnstile `siteverify` with `TURNSTILE_SECRET_KEY` before sending; on failure → 400, no email. **Graceful no-op:** keys absent → widget doesn't render + server verification skipped (one-line `console.warn`), so the form keeps working (e.g. staging); activates automatically once both keys are present. Honeypot + rate limit retained (defense in depth). reCAPTCHA v3 considered; Turnstile chosen (free, privacy-friendly, Cloudflare already runs the site's DNS).

**Env vars (no keys hardcoded; add both in Vercel after creating a free Turnstile site in Patrick's Cloudflare dashboard).**

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public)
- `TURNSTILE_SECRET_KEY` (secret)

**Acceptance.**

- [x] Optional file input on the lead form (contact page + category modal); accepts the listed types; enforces count/size limits client + server; clear errors
- [x] Submission uses `multipart/form-data`; existing fields, honeypot, validation, rate limit still work
- [x] Uploaded files arrive as email attachments; with no files, behavior unchanged
- [x] Files stored on `leadSubmission.attachments` (visible in Studio); upload/write failures non-fatal (email still sends)
- [x] Turnstile widget renders (managed mode) and token verified server-side before sending; honeypot + rate limit retained
- [x] Env vars absent → form still submits (CAPTCHA no-ops) + server warning logged; present → verification enforced
- [x] No keys hardcoded; env vars documented
- [x] `/cat` untouched; `pnpm typecheck` clean (local build skipped per Patrick's standing preference — Vercel builds)
- [x] CLAUDE.md / TASKS.md updated

**Depends on.** M3-308.
**Estimate.** 2 hours.

### [x] M-SEO3b: Breadcrumb absolute URLs + image URL cleanup + Sanity footer columns (DONE 2026-06-28)

**Scope.** Three low-risk follow-ups to M-SEO3. No `/cat` data-fetch / render changes; route stays static.

**Implementation (2026-06-28).**

1. **Breadcrumb JSON-LD → absolute URLs, single emission.** [components/layout/Breadcrumbs.tsx](components/layout/Breadcrumbs.tsx) now prefixes relative crumb hrefs with the canonical origin (`absoluteUrl()`), so every `item`/`@id` is absolute (fixes Google Rich Results "Invalid URL in field 'id'"); the current-page leaf still has no `item`. [components/category/CustomCategoryView.tsx](components/category/CustomCategoryView.tsx) was emitting BreadcrumbList **twice** (its own `breadcrumbSchema` + the `<Breadcrumbs>` component) — removed the explicit call so it's emitted once by the shared component. Visible trail unchanged. `breadcrumbSchema()` generator retained (already absolute via callers).
2. **Decode `&amp;` in Geiger image URLs at the loader.** Geiger's `products.json` image URLs carry literal `&amp;`; fine in `<img>` but leaked `&amp;` into `og:image` / `twitter:image` / ItemList `image` (broke WhatsApp/social previews). Decoded `imageUrl` once at each product-loading index: `loadProductsIndex` in [lib/categories.ts](lib/categories.ts) (category grids, OG, ItemList), [lib/products/lookup.ts](lib/products/lookup.ts) (deals/new/rush pinned SKUs), [lib/brands.ts](lib/brands.ts) (brand grids). Pure string transform on already-loaded data — no new fetch, no async, no `/cat` static impact. Brand logos are local/Sanity assets (no `&amp;`), left as-is.
3. **Footer nav columns Sanity-driven.** `globalSettings.footerColumns` (already in the schema, unwired) is now resolved by `getSiteSettings()` ([lib/sanity/queries/global-settings.ts](lib/sanity/queries/global-settings.ts) — same cached/tagged fetch that returns socials + contact, so `/cat` stays static and the existing webhook revalidation covers it) and rendered by [components/layout/Footer.tsx](components/layout/Footer.tsx). When `footerColumns` is empty, the footer falls back to the hardcoded `NAV_COLUMNS` (retained) so it never renders blank. The Contact column + social row are untouched (not part of `footerColumns`). External links open in a new tab; internal use `<Link>`. Seed script [scripts/seed/seed-footer-columns.ts](scripts/seed/seed-footer-columns.ts) (`pnpm seed-footer-columns`) writes the 3 current columns ONLY when empty (never overwrites Patrick's edits). **Run by Claude Code 2026-06-28**: first run wrote 3 columns / 14 links; second run reported "nothing to change" (idempotent confirmed).

**Acceptance.**

- [x] Category BreadcrumbList `item` values absolute; emitted once (no custom-category duplicate); visible trail unchanged
- [x] `og:image` / `twitter:image` / ItemList `image` URLs contain single `&` (no `&amp;`); product grid images still load
- [x] Footer columns render from `footerColumns`, fall back to hardcoded when empty; Contact + social row unchanged; seeded with current values; identical by default; edits go live via webhook
- [x] `/cat` data fetching/rendering untouched; `pnpm typecheck` clean (local build skipped per Patrick's standing preference — Vercel builds)
- [x] CLAUDE.md / TASKS.md updated

**Depends on.** M-SEO3.
**Estimate.** 1.5 hours.

### [x] M-LAUNCH4: Production www-canonical launch readiness (DONE 2026-06-29)

**Scope.** Make the URL/SEO side consistent for go-live with `https://www.perfectimprints.com` as the canonical production origin (apex → www handled at the Vercel domain level, not in middleware). No `/cat` render changes; route stays static.

**Implementation (2026-06-29).**

1. **Single source of truth audited.** `metadataBase` ([app/layout.tsx](app/layout.tsx)), every canonical/OG/Twitter URL, sitemap entries ([app/sitemap.ts](app/sitemap.ts)), robots `sitemap:` ([app/robots.ts](app/robots.ts)), breadcrumb absolute URLs ([components/layout/Breadcrumbs.tsx](components/layout/Breadcrumbs.tsx)), and all JSON-LD `url`/`@id` ([lib/seo/schema-generators.ts](lib/seo/schema-generators.ts), [lib/seo/open-graph.ts](lib/seo/open-graph.ts)) already derive from one value — `NEXT_PUBLIC_SITE_URL`. Confirmed the env value is used verbatim as the origin (only a trailing-slash trim); no string surgery forces or drops `www`, so flipping the env flips every emitted URL.
2. **Outlier fixed.** [components/seo/CanonicalUrl.tsx](components/seo/CanonicalUrl.tsx) (an unused stub) defaulted to the **non-www** `https://perfectimprints.com`; changed its fallback to `https://www.perfectimprints.com` to match every other file. This was the only code defaulting to a non-www origin. Grep for `dev.perfectimprints` / `*.vercel.app` / non-www `perfectimprints.com` in emitted page output (canonical/OG/schema/sitemap/links): none remain.
3. **robots/sitemap production-correct.** `app/robots.ts` allows all, disallows only `/admin3773752` + `/api`, `sitemap:` = `${SITE_URL}/sitemap.xml` (www origin), no `Disallow: /`. `app/sitemap.ts` prefixes every URL (category, blog, brand, video, static page) with the env origin.
4. **Apex→www = Vercel primary domain (note, not new code).** No redirect middleware added. The existing `next.config.ts` `redirects()` apex→www rule is retained as a backup; the authoritative redirect is set by making `www.perfectimprints.com` the project's primary/production domain in Vercel (covered in the go-live runbook, M6-603/M6-605).
5. **`.env.example` updated** — `NEXT_PUBLIC_SITE_URL=https://www.perfectimprints.com` (production www value) with a comment that staging uses `https://dev.perfectimprints.com`. CLAUDE.md Section 4 (canonical host) + Section 14 env block updated to the www value.

**Acceptance.**

- [x] All emitted URLs (canonical, OG, Twitter, sitemap, robots sitemap line, breadcrumb, JSON-LD url/@id) derive solely from `NEXT_PUBLIC_SITE_URL`
- [x] With the env = `https://www.perfectimprints.com`, no page emits a `dev.` / non-www / `.vercel.app` URL
- [x] `.env.example` documents the production www value (+ staging note)
- [x] `app/robots.ts` production-crawlable (only `/admin3773752` + `/api` disallowed), sitemap line uses www; no `Disallow: /`
- [x] `app/sitemap.ts` emits www URLs
- [x] No redirect middleware added; `/cat` stays static; `pnpm typecheck` clean (local `pnpm build` skipped per Patrick's standing preference — Vercel builds)
- [x] CLAUDE.md / TASKS.md / `.env.example` updated

**Depends on.** M-SEO3, M-SEO3b.

### [x] M-SEO3: SEO schema + meta + Open Graph pass (DONE 2026-06-27)

**Scope.** Patrick's SEO requests across schema + metadata. No `/cat` data-fetching / Suspense / `loading.tsx` changes; route stays static (schema/meta computed from already-loaded data + a local `products.json` disk read, no added uncached fetches).

**Implementation (2026-06-27).**

1. **Category meta title = the on-page H1.** `categoryMetaTitle(h1)` in [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx) sets the meta `<title>` to the H1 (full descriptive phrase), appending `| Perfect Imprints` only when the total stays ≤ ~60 chars; otherwise the H1 alone. Applied to root + modifier + facet (page 1 and page 2+). Canonical + on-page H1 untouched. customCategory keeps its Sanity `seo.metaTitle`.
2. **CollectionPage + ItemList JSON-LD on category pages.** New `collectionPageSchema()` + `itemListSchema()` in [lib/seo/schema-generators.ts](lib/seo/schema-generators.ts). The cat route emits a JSON-LD graph: CollectionPage (always) + ItemList (the products shown on the page — position/name/affiliate-url/image — **omitted for CTA-only categories**, no empty list) + FAQPage (root pages with FAQs — newly emitted; the prior `FAQsAccordion` rendered no schema) via the existing `<Schema>` component. Same added to [components/category/CustomCategoryView.tsx](components/category/CustomCategoryView.tsx) (CollectionPage + ItemList alongside its existing breadcrumb + FAQPage). BreadcrumbList unchanged (still emitted by `<Breadcrumbs>`).
3. **Complete Open Graph + Twitter on every page.** New shared `socialMeta()` helper ([lib/seo/open-graph.ts](lib/seo/open-graph.ts)) spread into each page's metadata so every page carries a full set (title/description/image/url/type/site_name/image:alt + summary_large_image). Category `og:image` = first product image (resolved off `products.json` in `generateMetadata`), logo fallback when empty (`LOGO_OG_IMAGE`). Applied to: home, cat (+ customCategory), blog post/index/category (+ paginated), brands index + brand page (brand logo), deals/new-products/rush-products/rush-promotional-products, promotional-products, faq, videos index + detail, services, static pages (via `staticPageMetadata`), search.
4. **Organization (local) schema restricted to home + contact.** Removed `<OrganizationJsonLd />` from the root layout (it had been on EVERY page); now rendered only by [app/page.tsx](app/page.tsx) + [app/contact/page.tsx](app/contact/page.tsx). WebSite + SearchAction stays site-wide in the layout. Categories/blogs no longer emit the address/phone block; they keep their own page-type schema.

**Acceptance.**

- [x] Category meta titles use the H1 (full phrase); canonicals unchanged
- [x] Category pages emit CollectionPage + ItemList + FAQPage (when FAQs) + BreadcrumbList; CTA-only categories omit empty ItemList
- [x] All pages emit complete OG tags; category `og:image` = first product image, logo fallback when empty
- [x] Organization/local schema only on home + contact; removed from categories/blogs; page-type schemas intact
- [x] `/cat` data fetching/Suspense/loading untouched; `pnpm typecheck` clean (route stays static — no added searchParams/cookies/headers/uncached fetch)
- [x] CLAUDE.md / TASKS.md updated

**Depends on.** None.
**Estimate.** 2 hours.

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

### [x] M5-518: "Replace products" toggle on categoryOverride (Task A, DONE 2026-06-30)

Patrick reported: on an empty/off-topic category like `/cat/beach-towels` (one of the ~65 `full-capped-60` categories where Geiger returns ~60 unrelated fallback SKUs, e.g. bags), he turned on Force Products and added the correct beach-towel SKUs — but the grid then showed his SKUs PLUS the ~60 wrong bags. He needed a way to show ONLY the products he adds. Added a manual opt-in toggle that discards the baked/fallback set for that category. No change to `/cat` static behavior.

- [x] New boolean field `replaceProducts` ("Replace products (show only what I add)") on `categoryOverride`, placed right after `forceProducts`, default `false`, with a non-technical description ([sanity/schemas/documents/category-override.ts](sanity/schemas/documents/category-override.ts)).
- [x] `replaceProducts?: boolean` added to the `CategoryOverrideDoc` interface AND the GROQ `PROJECTION` (actually fetched) in [lib/sanity/queries/category-overrides.ts](lib/sanity/queries/category-overrides.ts).
- [x] `mergeCategoryProducts()` treats baked `productSkus` as empty when `replaceProducts` is true; added SKUs/products + placement adds still apply, hides/removes still apply, removal still wins, de-duped, live-resolved.
- [x] Render precedence in [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx): `forceCTA` → `replaceProducts` (grid when the replaced list is non-empty — overrides the automatic CTA rule incl. `full-capped-60`; else CTA) → `forceProducts` → original `shouldShowEmptyStateCTA`. `allProducts` is now computed before the CTA decision so the non-empty check can drive it.
- [x] Patrick's beach-towels fix: open the Category Override → turn on **Replace products** → add the beach-towel SKUs → Publish → only the beach towels show, the bags are gone (no `forceProducts` needed — a non-empty replaced list shows the grid on its own).
- [x] No webhook change needed (`categorySlug` already projected; `replaceProducts` read via the existing override fetch). `customCategory` pages unaffected (no fallback set to ignore).
- [x] `pnpm typecheck` clean. CLAUDE.md `categoryOverride` section + precedence updated. No data backfill / migration script.
- [x] Non-technical Studio guide ([perfect-imprints-sanity-guide.html](perfect-imprints-sanity-guide.html)) updated: Replace-products field in the Category Override section, the off-topic-fix pointer in the `full-capped-60` warning, and a Common-tasks row.
- [x] No webhook/projection change — `docs/sanity-webhook-setup.md` unchanged (the `categoryOverride` filter + `categorySlug` projection already cover this; `replaceProducts` is read at render time, not needed for revalidation routing).

      **Depends on.** M5-504 part 1 (`categoryOverride` + `mergeCategoryProducts`).

---

### [x] M5-516: Hyperlinks in FAQ answers + video descriptions (rich text) (Task B, DONE 2026-06-29)

Patrick wants to add links inside FAQ answers (e.g. a `/cat/pepper-spray` FAQ) and inside video descriptions (e.g. `/videos/premium-branded-gifts-for-national-doctors-day`). Those fields were plain text. Converted them to Portable Text with link support, render the links, and keep the JSON-LD schema + search using PLAIN TEXT. Migrated existing data. No change to `/cat` static behavior.

- [x] New reusable minimal rich-text type `richAnswer` ([sanity/schemas/objects/rich-answer.ts](sanity/schemas/objects/rich-answer.ts)) — normal paragraphs + bold/italic + the standard link annotation only (no images/headings/lists/product blocks). Registered in [sanity/schemas/index.ts](sanity/schemas/index.ts).
- [x] `faq.answer`, `customCategory.faqs[].a`, and `video.description` switched from `text` → `richAnswer`.
- [x] Shared renderer [components/portable-text/RichAnswer.tsx](components/portable-text/RichAnswer.tsx) — internal paths via `next/link`, external/`#hash`/`mailto:`/`tel:` as `<a>`, Geiger URLs via `lib/affiliate-url.ts`, external http(s) open in a new tab. Tolerates a legacy plain string.
- [x] Plain-text extractor [lib/portable-text/to-plain.ts](lib/portable-text/to-plain.ts) (`portableTextToPlain`) used for FAQPage/VideoObject JSON-LD and the video meta/OG/Twitter descriptions (those stay plain strings). Studio previews use the duplicated `richAnswerToPlain` in the schema object (Studio bundler can't import `lib/`).
- [x] Renders: [components/faqs/FaqList.tsx](components/faqs/FaqList.tsx) (FAQ library), [components/category/FAQsAccordion.tsx](components/category/FAQsAccordion.tsx) (now accepts `string | PortableTextBlock[]` — baked `/cat` JSON answers stay plain strings, customCategory answers render rich), [app/videos/[slug]/page.tsx](app/videos/[slug]/page.tsx).
- [x] `getAnsweredFaqs` filter changed `answer != ""` → `count(answer) > 0` (answer is now an array). `FaqDoc.answer` + `CustomCategoryFaq.a` + `VideoSummary.description` retyped to `PortableTextBlock[]`. Search delta (`getAllFaqSearchEntries`) still indexes the (plain) question; FAQ answer body is not a search field. Video card teaser uses `portableTextToPlain`.
- [x] Push-to-Sanity pre-fill ([app/api/sanity/push-category/route.ts](app/api/sanity/push-category/route.ts)) builds valid Portable Text for `faqs[].a` via new `plainTextToBlocks` ([lib/portable-text/html-to-blocks.ts](lib/portable-text/html-to-blocks.ts)), mirroring the existing `introHtml` conversion.
- [x] Migration `pnpm migrate-richtext-answers` ([scripts/migrations/migrate-richtext-answers.ts](scripts/migrations/migrate-richtext-answers.ts)) — converts existing plain strings to PT (split on blank lines, no auto-linking), idempotent (skips arrays), covers published + drafts. **RUN 2026-06-29: 73 faq answers, 7 video descriptions, 20 customCategory faq items (4 docs). Re-run = 0 changes (idempotent confirmed).**
- [x] `pnpm typecheck` clean. `/cat/[...slug]` render path unchanged (no new `searchParams`/uncached fetch) — stays static.
- Scope note: the page-builder `faqAccordion` answer is left as plain text (not requested) — can get the same `richAnswer` treatment later if wanted. Auto (non-pushed) `/cat` JSON FAQs stay plain; Patrick pushes a page to Sanity to add a link to its FAQ (existing "push to edit" model).

**Follow-up (2026-06-29) — FAQ/Video edits not going live after publish.** Two issues surfaced while Patrick tested editing FAQ answers + video descriptions in Studio:

1. **Webhook filter excluded `faq`.** The revalidate route HANDLES `faq` (→ `revalidatePath('/faq')`), but the live Sanity webhook **Filter** never listed `faq`, so faq publishes sent nothing → `/faq` sat on its 1-week ISR floor. Fix: add `"faq"` to the webhook Filter (Patrick updated the staging webhook live; [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md) corrected — filter now lists every handled type incl. `faq`/`categoryOverride`/`productPlacement`, projection includes `categorySlug`/`addToCategories`/`removeFromCategories`). Production webhook gets the same at launch. **Manual Sanity-dashboard action — no env change.**
2. **CDN propagation race.** `getAnsweredFaqs` + all `lib/sanity/queries/videos.ts` reads used the **CDN** `client` (`useCdn:true`); on a publish the webhook regenerated the page before Sanity's CDN propagated, so it could re-cache the STALE answer until the weekly floor. Fix: switched those reads to the **non-CDN `cachedClient`** with cache tags `FAQS_TAG` (`faqs`) / `VIDEOS_TAG` (`videos`) ([lib/sanity/cache-tags.ts](lib/sanity/cache-tags.ts)); the webhook now `revalidateTag('faqs'|'videos','max')`s on `faq`/`video` publish ([app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts)). Deterministic instant updates; `/faq` stays ISR-static, `/videos` stays force-static/on-demand, `/cat` untouched. `pnpm typecheck` clean. (Takes effect once this branch deploys to the target env — it's a code fix, not a per-edit build; after deploy every Sanity publish is live in seconds.)

**Hotfix (2026-06-30) — prerender crash `Objects are not valid as a React child` on `/cat/belt-buckles` (and every pushed customCategory).** Production builds failed while prerendering owned customCategory pages with `Error: Objects are not valid as a React child (found: object with keys {_key,_type,children,markDefs,style})` — a Portable Text **block** reaching JSX as a raw child. **Root cause:** the Task B _data_ migration (plain string → Portable Text `richAnswer` for `faq.answer` / `customCategory.faqs[].a` / `video.description`) ran against the **shared Sanity dataset**, but a deploy path was building **code that predated Task B's render fixes** — so the migrated Portable Text array hit a render path that still interpolated the answer as a string. **Diagnosis:** rendering the live belt-buckles Sanity doc (introHtml, bodySections, FAQs) through the current components reproduced **no crash** — the fix is shipping Task B's render code together with the migrated data (data + render changes must deploy as one). **Hardening applied:** [components/category/FAQsAccordion.tsx](components/category/FAQsAccordion.tsx) now **always** routes `faq.a` through `<RichAnswer>` (removed the `typeof faq.a === 'string'` branch that could put a value near raw JSX); `RichAnswer` already tolerates `string | PortableTextBlock[]` (legacy plain string → paragraph, rich array → links), so neither shape can reach React as a raw object/array. Verified the other rich surfaces never raw-render: video detail uses `<RichAnswer>` ([app/videos/[slug]/page.tsx](app/videos/[slug]/page.tsx)), FAQ library uses `<RichAnswer>` ([components/faqs/FaqList.tsx](components/faqs/FaqList.tsx)), and all plain-string needs (FAQPage/VideoObject JSON-LD `acceptedAnswer.text`/`description`, meta/OG/Twitter, video card teaser) use `portableTextToPlain(...)`, never the raw blocks. `pnpm typecheck` clean; `/cat/[...slug]` render path unchanged (no new `searchParams`/uncached fetch) — stays static. **Takeaway: always deploy a content-shape migration and its render code in the same release.**

### [x] M5-517: FAQ schema on category pages + custom structured data on any page (Task C, DONE 2026-06-30)

Two related SEO additions. No `/cat` static-render change (every Sanity read in a render path is a cache-tagged fetch with `revalidate:false`, never `no-store`).

**Part 1 — Auto FAQPage schema on auto (JSON) category pages.** Already wired in [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx): root pages with a non-empty `content.faqs` push `faqPageSchema(content.faqs.map(f => ({question:f.q, answer:f.a})))` into the page JSON-LD graph — emitted ONLY when FAQs are present + visible (matches the "FAQs render on root pages only" rule), and NOT on `customCategory` pages (CustomCategoryView emits its own FAQPage). Honest note for Patrick: since 2023 Google only shows the FAQ rich result for gov/health sites, so on a commercial site the schema is valid + present but the rich result likely won't display — still correct to include.

**Part 2 — Custom structured data on any page (no push required).**

- [x] New `customSchema` Sanity document ([sanity/schemas/documents/custom-schema.ts](sanity/schemas/documents/custom-schema.ts), registered in [sanity/schemas/index.ts](sanity/schemas/index.ts)): `pageUrl` (searchable [PageUrlInput](sanity/components/PageUrlPicker.tsx) — searches the all-URL `category-list.json` for `/cat/...` pages AND accepts a manually typed path for any other page; validated: starts with `/`, no domain, no trailing slash except root), optional `label`, and `jsonLd[]` raw blocks **custom-validated at publish as parseable JSON with `@context` + `@type`** (multiple blocks allowed). One doc per page you want to touch — same model as `categoryOverride`, no bulk push.
- [x] Shared async server injector [components/seo/CustomSchemaJsonLd.tsx](components/seo/CustomSchemaJsonLd.tsx) reads the doc(s) for the exact path via the cache-tagged [getCustomSchemaForPath](lib/sanity/queries/custom-schema.ts) (`cachedClient`, tag `customSchema:<path>`, `revalidate:false`), emits each block as a `<script type="application/ld+json">` (escapes `<` to block `</script>` breakout), renders nothing when no match. Dropped into: category route (incl. customCategory path), blog detail, video detail, `StaticPage` (static/legal), home, brands index + per-brand, `/deals`, `/new-products`, `/rush-products`, `/faq`, `/videos`.
- [x] Webhook ([app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts)): `customSchema` → `revalidateTag(customSchema:<pageUrl>,'max')` + `revalidatePath(pageUrl)` on publish/delete; `pageUrl` added to the payload type. [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md) filter + projection updated to include `customSchema` / `pageUrl` (Patrick adds it to the live Sanity webhook — manual dashboard action).
- [x] `pnpm typecheck` clean. `/cat/[...slug]` stays statically prerendered (no new `searchParams`/uncached fetch).
- Note: guided per-type editors (WebApplication, HowTo, Product, Event) can be layered on this raw-block foundation later if Patrick wants them.

### [x] M5-518: Guided + AI schema generation on Custom Schema (Task C-2, DONE 2026-06-30)

Builds on M5-517's `customSchema`. Keeps raw-paste `jsonLd[]` (Option 1) unchanged; adds an AI-assisted path (Option 2) so Patrick doesn't need a 3rd-party generator. Mirrors the customCategory "Generate with AI" flow exactly.

- [x] `customSchema` gains an optional `schemaType` dropdown + optional `aiContext` text ([sanity/schemas/documents/custom-schema.ts](sanity/schemas/documents/custom-schema.ts)). The dropdown is a **curated list excluding the auto-emitted schemas** (FAQPage, Organization, WebSite, BreadcrumbList, VideoObject, CollectionPage, BlogPosting): WebApplication, SoftwareApplication, Product, Service, Offer, HowTo, Article, Event, Review, AggregateRating, ItemList. The `jsonLd[]` description carries the same don't-re-add-those caution.
- [x] New "Generate schema with AI" Studio document action ([sanity/actions/generate-schema-with-ai.tsx](sanity/actions/generate-schema-with-ai.tsx), registered for `customSchema` in [sanity/sanity.config.ts](sanity/sanity.config.ts)) — disabled until a `schemaType` is picked; POSTs `schemaType` + `aiContext` + `pageUrl` to the new route, **appends** the returned block to `jsonLd[]` (keeps existing blocks), never auto-publishes, shows an error dialog + adds nothing on failure.
- [x] New route [app/api/sanity/generate-schema/route.ts](app/api/sanity/generate-schema/route.ts) — DeepSeek (`deepseek-chat`, `response_format: json_object`), reuses server-side `DEEPSEEK_API_KEY` (graceful 500 with a clear "paste manually" message when absent). Prompts for ONE JSON-LD object of the chosen type pre-filled with PI/page context, JSON-only; validates the result is a single object with `@context` + a matching `@type` (handles `@type` arrays), returns it pretty-printed. Rejects unknown/blocked types.
- [x] The generated block is just another `jsonLd[]` entry → editable, removable, publish-validated like a pasted block. Raw-paste (Option 1) untouched.
- [x] **No webhook change** (Task C already added `customSchema`/`pageUrl` to the filter + projection) and **no new env** (reuses `DEEPSEEK_API_KEY`). **No new Sanity read surface** — the existing `CustomSchemaJsonLd` cache-tagged read (`customSchema:<path>`) + the publish webhook already cover generated/edited blocks. Stated explicitly so it's not missed.
- [x] In-repo guide [perfect-imprints-sanity-guide.html](perfect-imprints-sanity-guide.html) gains a "Custom Schema" section (#custom-schema): what it is, works on ANY page without pushing (path-keyed, all-URL picker), the **two ways** (paste raw / pick type + Generate with AI then review + Publish), the duplicate caution, one-doc-per-page. (TOC + section numbers updated; connect-map bullet added.)
- [x] `pnpm typecheck` clean. Render path unchanged / still static (no `/cat` regression).
- Note: guided per-type form editors can still be layered on top of this raw-block + AI foundation later.

**Follow-up fix (Task C-3, 2026-06-30) — injector missed the listing pages.** Testing found a published `customSchema` for `/blog` didn't render: Task C mounted `CustomSchemaJsonLd` only on blog DETAIL (`/blog/[slug]`), not the blog LISTING/pagination/category routes. Mounted the **same** cache-tagged injector (no new read surface, no new tag, no CDN read) on the missed public pages, each passing its exact canonical path:

- [x] `/blog` ([app/blog/page.tsx](app/blog/page.tsx)), `/blog/page/N` ([app/blog/page/[n]/page.tsx](app/blog/page/[n]/page.tsx) → `/blog/page/<n>`), `/blog/cat/<slug>` ([app/blog/cat/[slug]/page.tsx](app/blog/cat/[slug]/page.tsx)), `/blog/cat/<slug>/page/N` ([app/blog/cat/[slug]/page/[n]/page.tsx](app/blog/cat/[slug]/page/[n]/page.tsx)).
- [x] Audit of all other public routes added it where missing: `/promotional-products` ([app/promotional-products/page.tsx](app/promotional-products/page.tsx), keyed to the clean canonical that every filter/sort/page variant canonicalizes back to) and `/services/<slug>` ([app/services/[slug]/page.tsx](app/services/[slug]/page.tsx)).
- [x] Already had it (no double-add): `/cat/...`, `/blog/<slug>`, `/videos` + `/videos/<slug>`, home, `/brands` + `/brands/<slug>`, `/deals`, `/new-products`, `/rush-products`, `/faq`, and all static/legal pages (via the shared `StaticPage` component). Intentionally NOT added: `/search` (noindex), `/rush-promotional-products` (legacy stub, canonical → `/rush-products`), `/style-guide` + `/admin*` (internal).
- [x] **No webhook / env / freshness change** — `customSchema`+`pageUrl` already in the filter/projection (Task C); reuses the existing `customSchema:<path>` cache tag the webhook already busts. All these pages stay statically prerendered / on-demand SSG (the injector adds no `searchParams`/`no-store`). Guide already says "any page" — no guide change needed. `pnpm typecheck` clean.

### [x] M5-519: Twitter Card meta (images on X) for all pages (Task D, DONE 2026-06-30)

Patrick reported shared category/blog links don't populate a preview image on X (Twitter). Meta-tag + image-URL output only — **no Sanity/schema/field/webhook change, no new env** (the handle is a literal), and **`/cat` stays static** (`generateMetadata`-only edits; category social image still resolved off `products.json` at build, no network/Sanity call). Not Studio-facing — no guide change.

- [x] **Full Twitter block from `socialMeta()`** ([lib/seo/open-graph.ts](lib/seo/open-graph.ts)): the helper already returned a `twitter` object; extended it with `twitter:site` + `twitter:creator` = `@perfectimprints` (new exported `TWITTER_HANDLE`). Every page that spreads `socialMeta` (19 page files: category, home, blog index/cat/pagination/post, videos index, faq, brands, deals/new/rush, promotional-products, services, search) now emits `twitter:card=summary_large_image` + `twitter:title` + `twitter:description` + `twitter:image` + `site`/`creator`.
- [x] **Handle set site-wide** on the root-layout `twitter` default ([app/layout.tsx](app/layout.tsx)) so even a page not spreading `socialMeta` carries it. The video DETAIL page ([app/videos/[slug]/page.tsx](app/videos/[slug]/page.tsx)) sets its own inline `twitter` block (its OG type is `video.other`) — re-declared `site`/`creator` there since Next merges `twitter` shallowly and would otherwise drop them. Blog/video twitter blocks NOT regressed (blog routes through `socialMeta`; video keeps its block + now has the handle).
- [x] **Larger social image for X's large card** — new `largeSocialImage()` ([lib/seo/open-graph.ts](lib/seo/open-graph.ts)) rewrites the `thumbnail`/`w`/`h` size params on `imgsirv.geiger.com` URLs from 275 → ~1200 (passes non-Geiger URLs through untouched). Applied in `categoryOgImage()` ([app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx)) so `og:image`/`twitter:image` use the ~1200px variant while the **on-page grid still requests 275px**. `&amp;`→`&` decode at the loader is upstream of this, so the upsized URL stays clean. Blog hero (1200px Sanity) + video poster (1200px) already large enough — unchanged.
- [x] **CTA-only raster fallback (DONE):** `LOGO_OG_IMAGE` now points at a committed raster **`public/og-default.png`** (1200×630) instead of `logo.svg`, because **X does not render SVG card images** (JPG/PNG/WebP/GIF only). Generated by [scripts/seo/generate-og-default.mjs](scripts/seo/generate-og-default.mjs) — Playwright (already in node_modules) renders the PI logo on a white card with a brand-red accent bar; re-run only if the logo/design changes. The video detail page's inline OG/Twitter fallback was switched from `logo.svg` to `LOGO_OG_IMAGE` too. Real product/blog/brand/video images (raster) were already fine.
- [x] **X caching note:** X aggressively caches cards — after deploy, a previously-shared URL may still show the old (no-image) card for a while; sharing a fresh URL or appending a one-off dummy query param confirms the new card. Expected, not a code issue.
- [x] `pnpm typecheck` clean. Working tree left staged for review (not committed). CLAUDE.md OG/Twitter paragraph updated.

### [x] M5-520: Featured brands strip at the top of /brands (Task F, DONE 2026-06-30)

Closes the known gap "Brand `featured` toggle wired in schema but not rendered." Patrick toggled `featured` on a few brands (Owala, Carhartt, Yeti) but nothing happened — the field existed but drove nothing. Render + freshness wiring only; no new fields, no seed/migration. `/cat` untouched; `/brands` stays static/ISR.

- [x] **Featured strip** at the top of [app/brands/page.tsx](app/brands/page.tsx) (above the A–Z grid): a distinct highlighted row (`bg-bg-soft`, brand-red accent + heading) of featured-brand logo cards linking to each `/brands/<slug>`. New `getFeaturedBrands()` ([lib/brands.ts](lib/brands.ts)) returns `featured == true` brands ordered by name. **Renders nothing when none are featured.** Featured brands still also appear in the full A–Z grid below (strip is an additive highlight, not a filter). Server-rendered, consistent with the existing brand-card styling.
- [x] **Freshness:** brand Sanity reads switched from the CDN `client` to the **non-CDN `cachedClient`** with the `BRANDS_TAG` (`brands`) cache tag ([lib/sanity/cache-tags.ts](lib/sanity/cache-tags.ts)); `getAllBrands()` re-wrapped from a cross-request module memo to React `cache()` (per-request dedup only) so a `revalidateTag('brands')` actually re-runs the fetch and the toggle goes live (a persistent memo would have masked it).
- [x] **Webhook:** [app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts) handles `brand` → `revalidateTag('brands','max')` + `revalidatePath('/brands')` (+ `/brands/<slug>` when a slug is present) on publish/delete.
- [x] **Schema:** corrected the `brand.featured` description (was "surface on the home page brands grid" — inaccurate) to describe the `/brands` strip. Guide ([perfect-imprints-sanity-guide.html](perfect-imprints-sanity-guide.html)) Brand section updated.
- [x] **⚠️ MANUAL Sanity step (required):** `brand` was deliberately EXCLUDED from the live webhook **Filter** `_type` list (to save deliveries — same as `faq` originally). It must be ADDED on the **staging webhook now** and the **production webhook at launch**, or toggling `featured` won't revalidate after deploy. Exact Filter (only change is trailing `,"brand"`): `!(_id in path("drafts.**")) && _type in ["megaMenu","globalSettings","homePage","page","blogPost","video","customProduct","customCategory","curatedCategory","faq","categoryOverride","productPlacement","customSchema","brand"]` — Projection unchanged. Documented in [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md).
- [x] `pnpm typecheck` clean. CLAUDE.md `brand` entry + webhook doc updated. Working tree left staged for review (not committed).

### [x] M5-521: Publish brand-new custom pages at top-level `/<slug>` (Issue 2, DONE 2026-07-01)

Patrick published a `page` doc (`/llm-info-perfect-imprints`) but it 404'd — the `page` type only rendered at the 4 hardcoded `/services/<slug>` routes + the 8 fixed footer/legal slugs, so a `page` with an arbitrary slug had no route. Added a top-level dynamic route so any published `page` renders at `/<slug>`, letting Patrick recreate old-site URLs (SEO/ranking). `/cat` + all existing routes stay intact and static.

- [x] **New route** [app/[slug]/page.tsx](app/[slug]/page.tsx): resolves a published `page` by slug (`getPageBySlug`), renders the SAME pipeline as Services/StaticPage (`CustomSchemaJsonLd` + `Breadcrumbs` + BreadcrumbList schema + `SectionRenderer`), `notFound()` when no match. On-demand SSG (`dynamicParams=true`, `revalidate=false`); `generateStaticParams` = `getAllPageSlugs()` minus reserved + Services slugs.
- [x] **Reserved-slug guard.** [lib/reserved-slugs.ts](lib/reserved-slugs.ts) (`RESERVED_SLUGS`) lists every existing top-level/folder route + `api`/`admin3773752` + the 8 fixed static slugs. The route `notFound()`s any reserved slug AND the Services page slugs (derived from `SIMPLE_NAV` — they live under `/services/`, so this prevents a `/kitting` duplicate). Collision reasoning documented in-file: a single-segment `[slug]` catch-all is the lowest-priority match (literal + folder routes always win; multi-segment paths can't reach it), so existing routes are never shadowed — the guard is defence-in-depth + dupe-prevention.
- [x] **Schema validation** ([sanity/schemas/documents/page.ts](sanity/schemas/documents/page.ts)): custom slug rule rejects reserved slugs with "This URL is reserved by the site; choose another slug." Reserved list mirrored inline (standalone Studio bundler can't import `lib/`). Services slugs deliberately NOT in the schema list so existing Services docs stay valid.
- [x] **SEO + sitemap.** `generateMetadata` from `seo` + canonical `${SITE_URL}/<slug>` + `socialMeta()`; indexable (no noindex). [app/sitemap.ts](app/sitemap.ts) adds dynamic page URLs via `getAllPageSlugs()` minus reserved + Services slugs (deduped against services/static — those are reserved so excluded). New `pages:` count in the build log.
- [x] **Freshness.** `getPageBySlug` / `getAllPageSlugs` switched from the CDN `client` to the non-CDN `cachedClient` with `PAGES_TAG` (`pages`) + `pageTag('page:<slug>')` ([lib/sanity/cache-tags.ts](lib/sanity/cache-tags.ts)) — deterministic revalidation (no stale-CDN race), same fix as FAQ/video/brands. This also hardens the existing Services + footer/legal reads. No `no-store`, no `searchParams` — `/services/<slug>` + `/<slug>` stay static/SSG.
- [x] **Webhook.** `page` case now busts `PAGES_TAG` + `page:<slug>` and revalidates `/services/<slug>` + `/<slug>` + `/sitemap.xml` on publish/delete, so a publish is live within seconds. **`page` is ALREADY in both webhook Filters with `slug` projected** (verified in [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md)) — NO manual webhook change needed.
- [x] **Docs.** [perfect-imprints-sanity-guide.html](perfect-imprints-sanity-guide.html) Page section: how to create a brand-new page (Create new → Title + Slug + Sections + SEO → Publish → live at `/<slug>` within seconds), the reserved-slug list + why, AND the explicit **two-step flow** — Step 1 create the page (required; live + in sitemap, NOT in any menu), Step 2 optional link it into nav via a DIFFERENT section (Mega Menu item / Footer column, paste the slug as `href`; no code change; the page works & is Google-findable without Step 2). CLAUDE.md `page` entry + Section 4 URL list + webhook doc updated.
- [x] `/cat` stays static; `pnpm typecheck` clean. Working tree left staged for review (not committed).

### [x] M5-522: Page-builder — inline images in rich text + Video Embed section (2026-07-01)

Follow-up to M5-521. The `page` website-builder had text formatting (headings/sub-headings/paragraphs/bullets/numbered/bold/italic/quotes/links) and images as separate section blocks, but was missing (a) images _inline within a paragraph flow_ and (b) any YouTube/video embed. Added both.

- [x] **Inline images in rich text.** `portableBody` (used by `richText` + `imageText`) now includes `{type:'image'}` in its `of` array ([sanity/schemas/objects/page-sections.ts](sanity/schemas/objects/page-sections.ts)), so an editor can drop a picture between paragraphs. Rendered by a new `types.image` handler in the shared [components/page-sections/portable-text.tsx](components/page-sections/portable-text.tsx) (`urlForImage` → lazy `<img>`, degrades to nothing when no asset).
- [x] **Video Embed section.** New `videoEmbed` object (heading + `url` + caption) reusing the existing `parseVideoEmbed` ([lib/video/embed.ts](lib/video/embed.ts)) + shared client [components/videos/VideoEmbed.tsx](components/videos/VideoEmbed.tsx). Renderer [components/page-sections/VideoEmbedSection.tsx](components/page-sections/VideoEmbedSection.tsx), wired into `SectionRenderer`, registered via `pageSectionSchemas` (auto-added to the schema index). Provider auto-detected (YouTube/Shorts/Vimeo/Instagram/Facebook); embed-only, nothing hosted. Type added to `PageSection` union in [lib/sanity/queries/pages.ts](lib/sanity/queries/pages.ts).
- [x] Guide ([perfect-imprints-sanity-guide.html](perfect-imprints-sanity-guide.html)) section-types table + CLAUDE.md `page` entry updated. `pnpm typecheck` clean. Working tree left staged for review (not committed).

### [x] M5-523: Slash-tolerant internal link hrefs (footer + mega menu) (2026-07-01)

A footer link entered in Sanity as `llm-info-perfect-imprints` (no leading slash) navigated wrong — Next's `<Link>` treats a bare href as a path relative to the current route, not `/llm-info-perfect-imprints`. Made the internal-href resolvers slash-tolerant so Patrick can enter an internal path with or without the leading slash.

- [x] New shared helper [lib/sanity/normalize-href.ts](lib/sanity/normalize-href.ts) (`normalizeHref`): empty → `''`; `http(s)://` / `mailto:` / `tel:` / `#anchor` → untouched; already-`/…` → untouched; bare internal path (`about`, `llm-info-perfect-imprints`) → `/` prepended (trims whitespace first).
- [x] Applied in the footer resolver ([lib/sanity/queries/global-settings.ts](lib/sanity/queries/global-settings.ts) `getSiteSettings()` footer columns) — normalizes internal link hrefs; `external`-flagged links keep their href verbatim (must include full scheme). The label+href non-empty **drop condition is unchanged** — normalizing only fixes bare internal paths, no empty links start rendering.
- [x] Applied in the mega-menu resolver ([lib/sanity/queries/mega-menu.ts](lib/sanity/queries/mega-menu.ts)) for item `href`, dropdown `links[].href`, column `href` + `links[].href`.
- [x] Resolver-only — no Sanity schema change, no webhook/Filter change, no `/cat` render-path change. `pnpm typecheck` clean.
- [x] Guide ([perfect-imprints-sanity-guide.html](perfect-imprints-sanity-guide.html)) footer + mega-menu sections note internal links work with or without the slash (external must be full `https://…`); CLAUDE.md `footerColumns` entry updated. Working tree left staged for review (not committed).

### [x] M5-524: Footer / global-settings + mega-menu freshness fix (stale footer on publish) (2026-07-01)

Confirmed bug: removing a footer link in `globalSettings` and Publishing did NOT update the live footer, even after hard-refresh + cache clear, despite the webhook logging `200 {"revalidated":true,"scope":"layout","type":"globalSettings"}`.

- [x] **Root cause:** `getSiteSettings()` ([lib/sanity/queries/global-settings.ts:188](lib/sanity/queries/global-settings.ts)) read through the plain CDN `client` (`useCdn:true`, [lib/sanity/client.ts:12](lib/sanity/client.ts)) with **no cache tag**. A CDN read serves its own ~60s stale copy AND an untagged fetch is not deterministically busted by `revalidatePath('/', 'layout')`, so the removed link kept rendering. `getMegaMenu()` ([lib/sanity/queries/mega-menu.ts:169](lib/sanity/queries/mega-menu.ts)) had the **identical defect** (add/reorder only appeared to work once the CDN TTL lapsed; a removal was equally stale). Same defect class already fixed for FAQs / videos / brands.
- [x] **Fix (mirrors brands/FAQ/video):** both reads switched to the non-CDN `cachedClient` with a tagged fetch (`{ next: { tags: [TAG], revalidate: false } }`). New tags `SETTINGS_TAG` (`global-settings`) + `MEGA_MENU_TAG` (`mega-menu`) in [lib/sanity/cache-tags.ts](lib/sanity/cache-tags.ts). `getSiteSettings()` keeps React `cache()` for per-request dedup only (no cross-request module memo).
- [x] Webhook ([app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts)) LAYOUT_TYPES branch now `revalidateTag(SETTINGS_TAG,'max')` on `globalSettings` + `revalidateTag(MEGA_MENU_TAG,'max')` on `megaMenu`, **in addition to** the existing `revalidatePath('/', 'layout')`.
- [x] `/cat` stays static — only the client was swapped + tags added; no `no-store`, no `searchParams`. `pnpm typecheck` clean. Local `pnpm build` skipped per standing preference (Vercel builds on deploy); change is the same static-safe pattern as brands/faqs/videos.
- [x] **No Sanity webhook Filter change needed** — `globalSettings` + `megaMenu` are already in the Filter; the fix is entirely code-side (client + tag + `revalidateTag`).
- [x] CLAUDE.md globalSettings "Read path" bullet + megaMenu entry updated. Working tree left staged for review (not committed).

### [x] M5-525: PROD INCIDENT — invalid `x-next-cache-tags` header 500s on `/[...slug]` (2026-07-02)

Live production 5xx starting Jul 02 03:25 UTC (~23 failed req/5min, rising) on route `/[...slug]` with Vercel error **"Invalid x-next-cache-tags header on /[...slug]"**.

- [x] **Root cause.** The root catch-all [app/[...slug]/page.tsx](app/[...slug]/page.tsx) (the multi-segment custom-page route) now matches EVERY unmatched top-level path. For a non-reserved path it runs the **tagged** Sanity fetch `getPageBySlug(slug)` (tag `pageTag(slug)`) — and `CustomSchemaJsonLd` runs `getCustomSchemaForPath('/'+slug)` (tag `customSchemaTag`) — **BEFORE** it `notFound()`s. Bots spray junk URLs (`/wp-login.php`, `%`-encodings, uppercase, dots, unicode); those built a cache tag containing a character invalid in the `x-next-cache-tags` header, so Next/Vercel rejected the header and the route **500'd instead of 404'ing**. Slashes are NOT the culprit — `categoryTag` has shipped `cat:water-bottles/color/blue` for weeks without 500s; it's un-normalized junk chars (and empty values). It surfaced right after the single→multi-segment catch-all conversion because junk paths that previously 404'd at the router now enter the route and run a tagged fetch.
- [x] **Fix — tag-value sanitizer** in [lib/sanity/cache-tags.ts](lib/sanity/cache-tags.ts). New `sanitizeTagValue()`: lowercase, KEEP `/ _ -` (so existing `cat:.../...` + `customSchema:/` tags are **byte-identical → no `/cat` freshness churn**), map every other char-run to a single `-`, trim, length-cap under Next's 256 (hash the tail if it overflows); empty/all-invalid → `''`. `categoryTag` / `pageTag` / `customSchemaTag` now route through it and return `''` for an empty result (never a bare `base:` tag). Verified against real slugs (unchanged) + junk (`wp-login.php`→`page:wp-login-php`, `!!!`→`''`, unicode→stripped, 400-char→203-char capped).
- [x] **`.filter(Boolean)` safety net** at all five slug/path-derived fetch sites so an empty tag can never poison the header: [pages.ts](lib/sanity/queries/pages.ts), [category-overrides.ts](lib/sanity/queries/category-overrides.ts), [custom-categories.ts](lib/sanity/queries/custom-categories.ts), [product-placements.ts](lib/sanity/queries/product-placements.ts), [custom-schema.ts](lib/sanity/queries/custom-schema.ts).
- [x] **Webhook consistency.** [app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts) calls the SAME builders (via a new `bustTag()` that skips `''`), so read + `revalidateTag` tags stay identical — **freshness preserved**, only invalid tags prevented. A valid page/category publish still busts `page:<slug>` / `cat:<slug>` + the shared `PAGES_TAG`/`CATEGORY_CONTROL_TAG`.
- [x] **No** new Sanity field / read surface / webhook Filter / projection / cache tag; `/cat` stays static (sanitizer reads nothing — pure string transform; the reserved short-circuit + `notFound()` for junk still fire, now cleanly as 404). `pnpm typecheck` clean. `/cat/[...slug]` SSG-ness to be confirmed on the Vercel build; 5xx rate should return to 0 after deploy. CLAUDE.md `page` entry updated. Working tree left staged for review (not committed).

### [x] M-SEO4: Favicon quality fix — multi-size ICO + apple-touch-icon (2026-07-07)

From the Google-favicon diagnostic (Patrick: no favicon next to our SERP listing). The site passed Google's hard favicon requirements (crawlable, 200, square, stable URL, `<link rel="icon">` on the homepage), but two quality defects remained; the likely primary cause is re-crawl timing on the week-old www host, so after deploy Patrick/Ali should **request re-indexing of the homepage in GSC** (URL Inspection → Request Indexing) — Google refreshes favicons on its own homepage-recrawl schedule (days to weeks).

- [x] **Defect 1: `public/favicon.ico` was a 32×32-only ICO** — below Google's ">48×48 recommended". Regenerated as a **multi-size ICO (16×16 + 32×32 + 48×48, 32bpp, square frames)** at the SAME stable `/favicon.ico` URL. Rendered fresh from the "P!" mark paths of [public/logo.svg](public/logo.svg) (Playwright Chromium rasterizes the vector at each native frame size — no upscaling of the old 32px icon), keeping the old icon's exact look: white background, ink `#231F20` P, red `#EA2929` exclamation. Frames verified by parsing the ICO (3 frames, square, correct dims/bpp) + pixel-sampling + a visual contact sheet.
- [x] **Defect 2: `/apple-touch-icon.png` 404'd** — [app/layout.tsx](app/layout.tsx) `metadata.icons.apple` referenced a file that never existed in `public/`. Added a real **180×180 `public/apple-touch-icon.png`** (white background — iOS composites black behind transparency), same mark with rounded-corner-safe margins.
- [x] **Optional hi-res icons added:** `public/icon-192.png` + `public/icon-512.png` (same mark), referenced in `metadata.icons.icon` as an array alongside the unchanged `/favicon.ico` entry (`sizes` + `type` set on the PNGs). Head now emits three `<link rel="icon">` + one `<link rel="apple-touch-icon">`, all resolving.
- [x] **Conscious no-ops:** no route/schema/webhook/cache-tag change, no new env var, no Sanity/Studio change (so no `perfect-imprints-sanity-guide.html` update). Pure `public/` static assets + the `metadata.icons` array in [app/layout.tsx](app/layout.tsx). `/cat` and every other route untouched — zero prerender impact.
- [x] `pnpm typecheck` clean. Local `pnpm build` skipped per standing preference (static-asset change; Vercel builds on deploy). **Post-deploy check:** `curl -I` `/favicon.ico` (200, ICO with 48px frame), `/apple-touch-icon.png` (200, 180×180 PNG — no longer 404), `/icon-192.png` + `/icon-512.png` (200); homepage `<head>` shows the icon links. Working tree left staged for review (not committed).

### [x] M-SEO5: /cat CSR-bailout fix — restore full static HTML + image SEO boosters (2026-07-07)

From the favicon/thumbnail diagnostic: every `/cat` page's **prerendered static HTML was the loading skeleton** — no `<h1>`, no product `<img>`, only the layout's WebSite JSON-LD (CollectionPage/ItemList/BreadcrumbList/FAQPage existed only in the RSC flight payload, rendered client-side). Verified live on `/cat/phone-wallets` + `/cat/water-bottles` (`<main>` began with `<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING">`). Pages still indexed/ranked (Google renders JS), but all on-page SEO/image signals were second-wave across ~22k pages — a violation of the "crawlers see full static HTML" premise.

- [x] **Root cause.** `useSearchParams()` called during render in the client tree — [components/category/CategoryShell.tsx](components/category/CategoryShell.tsx) + [FilterSidebar.tsx](components/category/FilterSidebar.tsx) + [SortDropdown.tsx](components/category/SortDropdown.tsx). During static prerender that hook forces a CSR bailout up to the nearest Suspense boundary = the route-level [loading.tsx](app/cat/[...slug]/loading.tsx) (added 2026-06-20 for nav skeletons), so the ENTIRE page body — including the `<Schema>` JSON-LD rendered by the server page — was swapped for the skeleton in the served HTML. **The build still reports `●` static, so the "verify `●`" check never caught it.**
- [x] **Fix (Part A — no UX change, params read post-mount instead of during render).** CategoryShell now owns the URL query as state: reads `window.location.search` in a **post-mount effect** (keyed on `usePathname()` so it re-reads after every committed route transition; `popstate` listener for back/forward; reads guarded against mid-transition mismatch so a cross-category back/forward can't fetch a mismatched slug+query — reproduces the old commit-time `useSearchParams` semantics), and passes `searchKey` + `navigate()` (router.push `scroll:false` + immediate same-path state sync, since `pushState` fires no event) down to FilterSidebar/SortDropdown as props. New pure helper `filterStateFromSearchKey()` in [lib/filter-types.ts](lib/filter-types.ts) (query string → `FilterState`) shared by all three. **Zero `useSearchParams` remain under `components/category` + `app/cat`** (grep-verified). Server prerender + first client render = the unfiltered view → full static HTML (H1, intro, breadcrumbs, buying guide, FAQs, all JSON-LD, product `<img>` grid) AND hydration-safe; deep-linked filters apply right after mount (brief unfiltered flash before "Filtering…", the standard tradeoff). Preserved exactly: single-facet → static-URL navigation (`preferStaticUrl`), multi-facet/query serialization to the ROOT slug URL, sort staying on the current pathname, comma-joined param grammar, client pagination reset, `/api/category-products` fetch + abort, CTA-only rendering. `loading.tsx` kept for genuine nav/on-demand streaming — it just no longer swallows the prerender.
- [x] **Part B — image SEO boosters.** (1) ItemList `image` = `largeSocialImage(p.imageUrl)` (~1200px variant; grid still renders 275px) in [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx) + [CustomCategoryView.tsx](components/category/CustomCategoryView.tsx). (2) `collectionPageSchema` accepts optional `image` ([lib/seo/schema-generators.ts](lib/seo/schema-generators.ts)) — first grid product's large image (custom pages: hero image first), omitted for CTA-only pages. (3) Root layout `robots.googleBot['max-image-preview'] = 'large'` ([app/layout.tsx](app/layout.tsx)); pages setting their own `robots` (`/page/N`, `/search`) override it but are noindex anyway. (4) **Sitemap image entries** ([app/sitemap.ts](app/sitemap.ts)): one representative image per grid-bearing category URL (14,343 of 22,180; CTA-only pages claim none) via new `CategorySlugSummary.imageSkus` ([lib/categories.ts](lib/categories.ts), gated on `shouldShowEmptyStateCTA`) + the memoized products index. Measured cost: **~2.3s warm** (168s cold on Ali's Windows box, but the Vercel build reads the same 22k JSONs in `generateStaticParams` minutes earlier, so the sitemap pass runs from OS cache); build log now prints `(with images:N)`.
- [x] **Guardrails kept.** Server component still never reads `searchParams`/`cookies`/`headers`; no new Sanity read in the render path (Part B reads baked JSON + products.json off disk only); `/cat` stays `●`/on-demand SSG. No Sanity/Studio change → no guide update, no webhook/cache-tag/env change (conscious no-ops).
- [x] `pnpm typecheck` clean. Local `pnpm build` skipped per standing preference. **Post-deploy verification (the REAL gate — `●` alone provably insufficient):** (1) `curl -s https://www.perfectimprints.com/cat/phone-wallets` (+ `/cat/water-bottles`) → raw HTML contains `<h1>`, ~60 product `<img src="https://imgsirv...">` tags, CollectionPage + ItemList + BreadcrumbList (+ FAQPage on roots) `<script type="application/ld+json">` blocks, and NO `BAILOUT_TO_CLIENT_SIDE_RENDERING`; (2) build route table still shows `/cat/[...slug]` `●` with ~1,840 prebuilt paths; (3) in-browser: filter toggles, multi-select, sort, deep-linked filtered URL, back/forward, single-facet static-URL navigation, mobile drawer all behave as before; (4) homepage + `/promotional-products` unchanged; (5) `[sitemap]` build log shows `with images:~14343` and sitemap.xml parses. CLAUDE.md §3 + §13 rewritten (three static-killers + raw-HTML verification requirement) + §11 sitemap/robots notes. Working tree left staged for review (not committed).

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

### [~] M6-606: Monthly auto-rebuild scheduler — IMPLEMENTED (pending live verification)

**Scope.** GitHub Action workflow `.github/workflows/monthly-rebuild.yml` scheduled for the 1st of every month at 00:00 UTC. Runs scraper Phases A, B, C, E (Phase D mapping is stable). Regenerates AI content for new categories. Detects removed products. Email summary to Patrick.
**Acceptance.**

- [x] Workflow file committed — `.github/workflows/monthly-rebuild.yml` rewritten from the TODO stub into a 5-job pipeline (`config` → `scrape-ab` / `scrape-e` / `scrape-c` → `assemble`).
- [x] **6h-per-job limit handled** — split into separate jobs joined by artifacts (no single job runs A+B+C). Phase C runs `--workers 6` (~1h, under the cap) + `--resume` + cached checkpoint so an overrun resumes from the last 100-URL checkpoint. `timeout-minutes: 350` on the C job.
- [x] `workflow_dispatch` with a `phases` subset input (default `A,B,C,E`) so testing can skip the long Phase C (e.g. `A,B,E`).
- [x] AI content regenerated for NEW categories only (`generate_content.py --skip-existing`) — existing pages untouched; cheap no-op while the PI URL set is frozen (safety net for genuinely-new category JSONs).
- [x] Removed Geiger products detected and dropped from category pages — render-time `resolveProducts` already skips missing SKUs; `scripts/monthly/prune-removed-skus.ts` also prunes the baked `productSkus[]` so the committed data + PR diff are explicit.
- [x] Brand logos refreshed if Geiger updated them — Phase E job (`brands.json` + `brand-logos/` + `public/brand-logos/`).
- [x] Opens a PR (branch `monthly-rebuild`, `peter-evans/create-pull-request`) with a change summary (products +/-/price, brands, new/updated category pages) via `scripts/monthly/compute-summary.ts` → `pr-body.md`. **As of M6-608 this PR AUTO-MERGES** as the assemble job's final step (`gh pr merge --squash`, subject `chore(data): monthly catalog rebuild`) — superseding the earlier "deliberately NOT auto-merged" decision, because the warmup gate keys off that merge commit. Patrick still gets the summary email for the record.
- [x] Production build triggers on merge — existing Vercel integration on `main`.
- [x] Email summary to Patrick via Gmail SMTP — `scripts/monthly/send-summary-email.ts` (no-ops with a warning if `GMAIL_*` absent).
- [x] Warmup covered — but **monthly + manual only, no longer per-deploy** (2026-06-30). `post-deploy-warmup.yml` previously fired on every `deployment_status: success` and warmed all ~21K facet URLs each time; with the several-per-week weekly scrape PRs + ordinary commits (none of which change facet pages) that exhausted Vercel's **account-wide free-tier limits**. Fixed: `post-deploy-warmup.yml` dropped its `deployment_status` trigger and became a reusable `workflow_call` engine (+ manual `workflow_dispatch`); a new `.github/workflows/monthly-warmup.yml` listens to `deployment_status`, runs a cheap gate that exits in seconds for everything except the `Production` deploy of the `chore(data): monthly catalog rebuild` merge, and only then calls the warmup against production `www`. So the full 21K warmup runs ONCE after the monthly rebuild ships (where ~21K facets genuinely go cold) and never after weekly/ordinary deploys. On-demand SSG needs no warmup to be correct (cold facets just serve their first hit slower), so this only trades a little long-tail speed after small deploys for removing the recurring cost. Still no explicit warmup step in `monthly-rebuild.yml`.
- [x] **Manual Sanity Studio trigger button** — delivered in **M6-608** as the top-level **Site Refresh** Studio panel (not a `globalSettings` action): Patrick triggers/cancels this workflow (and the three weekly ones) from the Studio.
- [ ] **Live verification** — `pnpm typecheck` clean and `compute-summary.ts` smoke-tested locally. Still to do once secrets are set: (1) `workflow_dispatch` with `A,B,E` → green run + PR opens; (2) full run incl. Phase C to validate the split/checkpoint end-to-end (~6h); (3) confirm the summary email arrives.

**Required GitHub secrets (manual, both repos `raoalihamza/perfectimprints` + `pbnj53/perfectimprints`):** `DEEPSEEK_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` (+ optional `LEAD_EMAIL_TO`/`LEAD_EMAIL_FROM`). No Sanity secrets (content → `data/categories/*.json` only). Actions settings: Read/write + "Allow GitHub Actions to create and approve pull requests" (same as the weekly jobs).
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

### [~] M6-608: Site Refresh Studio panel + workflow auto-merge (IMPLEMENTED, pending PAT + live verification)

**Scope.** A dedicated top-level Sanity Studio section, **"Site Refresh"**, that lets Patrick run the four data-refresh GitHub Actions workflows on demand, see their status, and cancel a run — and a change so every refresh workflow auto-merges its own PR (so a run goes live with no GitHub interaction) while Cancel fully revokes (nothing reaches `main`). Builds on M6-606 (monthly rebuild) and the weekly scrape jobs.

**Acceptance.**

- [x] Separate top-level **Site Refresh** Studio tool ([sanity/tools/site-refresh-tool.tsx](sanity/tools/site-refresh-tool.tsx)) registered in the `tools` array of [sanity/sanity.config.ts](sanity/sanity.config.ts) (a separate tab like Push to Sanity, NOT under globalSettings) — 4 trigger buttons (Refresh New Products / Deals / Rush Products / Full Catalog Rebuild) + per-workflow status line (idle / queued / running / success / failed + last-run time + "view details" GitHub link) + Cancel while running. Plain-language helper text per button.
- [x] Protected API route [app/api/sanity/workflows/route.ts](app/api/sanity/workflows/route.ts) — `GET` (status of all / one), `POST {action:'trigger'|'cancel'}`. Triggers via `workflow_dispatch` (ref `main`; monthly passes `phases: A,B,C,E`), reports status from the latest run, cancels + cleans up. Uses a **server-side fine-grained PAT** `GITHUB_WORKFLOW_TOKEN`; the PAT never reaches the browser. **Auth:** cookie-session-safe handshake (see the dedicated bullet below) — no bearer token exists in this Studio. Repo configurable via `GITHUB_REPO_OWNER`/`GITHUB_REPO_NAME` (default production `pbnj53/perfectimprints`; staging → `raoalihamza/perfectimprints`). Shared registry [lib/site-refresh/workflows.ts](lib/site-refresh/workflows.ts).
- [x] **Auto-merge as the FINAL step** in all four workflows (`scrape-deals.yml`, `scrape-new-products.yml`, `scrape-rush-products.yml`, `monthly-rebuild.yml`) — after `create-pull-request` opens the PR, `gh pr merge --squash --delete-branch --subject '<title>'` (retry loop for mergeability lag), gated on a PR number existing (empty runs skip). Same behaviour for cron or Site Refresh button. **Monthly squash subject held to exactly `chore(data): monthly catalog rebuild`** so `monthly-warmup.yml`'s gate fires. Uses the built-in `GITHUB_TOKEN`.
- [x] **Monthly cron removed** (`monthly-rebuild.yml` is now `workflow_dispatch`-only); weekly scrapes keep their Sunday cron AND are button-triggerable + auto-merging.
- [x] **Cancel = full revoke** — cancels the in-progress run, then closes any open PR from the run's branch and deletes the branch, so `main` is untouched (merge is the workflow's last step). Already-merged runs are reported honestly ("already finished, cannot cancel"). Panel shows "Cancelled — no changes applied."
- [x] **No Sanity webhook/projection change** (stated) — the panel triggers workflows, it adds no rendered content surface; the route is server-only and not in any render path (so `/cat` stays static). `pnpm typecheck` clean.
- [x] Guide ([perfect-imprints-sanity-guide.html](perfect-imprints-sanity-guide.html) §20 "Site Refresh"), CLAUDE.md (Section 13 Site Refresh panel + auto-merge + monthly-cron removal; Section 14 PAT env vars), and `.env.example` updated.
- [ ] **Manual step (Patrick):** create a GitHub fine-grained PAT scoped to the target repo — **Actions: Read & write**, **Pull requests: Read & write**, **Contents: Read & write** — and add `GITHUB_WORKFLOW_TOKEN` (+ `GITHUB_REPO_OWNER`/`GITHUB_REPO_NAME`) in **Vercel env** on BOTH deployments (staging → `raoalihamza/perfectimprints`, production → `pbnj53/perfectimprints`). Confirm repo Actions settings allow PR creation/merge (already set for the weekly jobs).
- [x] **Auth model — cookie-session-safe (2026-06-30, final).** First live tests failed with "Could not read your Studio login / Unauthorized". DevTools confirmed this Studio is **pure cookie-session auth**: `Object.keys(localStorage).filter(k => /auth[_-]?token|sanitysession/i.test(k))` returns `[]` (no JS token) and the client logs the `withCredentials` cookie warning. A bearer/`users/me` scheme (and the interim lazy-token/localStorage-scan/`x-sanity-token` fix) therefore CANNOT work — all that dead code was removed. Replaced with a handshake that mirrors the proven **Push to Sanity** pattern (privileged action via a cookie-authed Sanity write): the panel `createOrReplace`s a random nonce into the **draft** `drafts.siteRefreshAuth` (only a logged-in user with dataset-write grants can write; drafts aren't returned by anonymous/public reads), sends it on every call as `x-refresh-nonce`, and the route reads that nonce with its own server `SANITY_API_TOKEN` (`perspective:'raw'`) + timing-safe compare (+24h freshness; panel re-handshakes on 401). Cross-origin → 403 (Origin guard); anonymous/curl → 401; PAT server-only. Panel gates buttons on `useCurrentUser()` + handshake `ready`. Tradeoff (documented in CLAUDE.md §13): proves "authenticated project member acting from the first-party Studio," not a per-user identity assertion — the strongest gate available with no JS token.
- [ ] **Live verification** (after deploy + PAT set): (1) Site Refresh → Refresh New Products → status running → completes → if changed, PR opens AND auto-merges → Vercel redeploys; (2) trigger + Cancel mid-run → run cancels, no PR merges, branch cleaned up, `main` unchanged, panel says "Cancelled — no changes"; (3) Full Catalog Rebuild button → `monthly-rebuild.yml` runs → on merge the `chore(data): monthly catalog rebuild` commit triggers `monthly-warmup.yml` once against production; (4) confirm the PAT is server-only, a credential-less `curl` to the route is 401, and a cross-origin request is 403.

**Reframes M6-606's "Deliberately NOT auto-merged" + the deferred "Manual Sanity Studio trigger button."** The monthly rebuild now DOES auto-merge (the warmup gate depends on the merge commit title), and the Studio trigger is delivered as this Site Refresh panel (top-level tool) rather than a `globalSettings` action.

**Depends on.** M6-606, plus the weekly Phase F/G/H scrape jobs.
**Estimate.** 6 hours.

### [x] M6-609: Smart capped warmup list (Vercel + Sanity cost optimization) — DONE 2026-07-06

**Scope.** Both the Vercel bill (ISR writes) and the Sanity bill (direct API reads) were driven mainly by the post-deploy warmup crawling all ~21,139 on-demand facet pages every run. Patrick approved Option B ("Smart"): warm only a capped set of the most valuable pages; everything else generates on-demand on first visit then caches (already how on-demand SSG works). Cost-only change — freshness, `/cat` staticness, on-demand generation, the sitemap, and SEO are untouched.

- [x] New [scripts/warmup/build-warmup-list.ts](scripts/warmup/build-warmup-list.ts): builds the warm list as **(1) guaranteed nav coverage** — every `/cat/` page linked from the mega-menu nav (`lib/nav-data.ts`, the megaMenu seed source); verified all 465 are prebuilt roots (0 added), the check adds URLs only if that ever stops being true — **plus (2) the top `WARMUP_FACET_CAP = 3500` single-facet pages by SKU count** from `facet-memberships.json` (type `facet` only — the 2 compound-facets are prebuilt via `PREBUILD_TYPES`; multi-segment combos stay on-demand; prebuilt/owned slugs excluded; deterministic sort with URL tie-break). The ranking function is isolated so SKU count can be swapped for real traffic data (GSC / Cloudflare Analytics) later. `WARMUP_FACET_CAP` is the tuning knob after a billing cycle.
- [x] [scripts/warmup/warmup-facets.ts](scripts/warmup/warmup-facets.ts) consumes `buildWarmupList()` instead of enumerating all facet + compound-facet URLs; crawler pool/summary/1%-failure gate unchanged. New `pnpm warmup:list` dry-runs the list + prints the old-vs-new report without crawling.
- [x] Measured (2026-07-06 data): OLD 21,139 URLs → NEW 3,500. Selected SKU distribution min 104 / median 343 / max 2,105; cutoff 104 SKUs. Validated: all 3,500 are 3-segment single-facet shapes, 0 duplicates, 0 overlap with prebuilt, sorted desc. Total never-cold surface ≈ 1,840 prebuilt + 3,500 warmed; remaining ~16.8K facets cold-start at 400-800ms on first visit then cache — intended.
- [x] Guardrails held: `generateStaticParams`/`PREBUILD_TYPES`/`dynamicParams=true`/`revalidate=false` untouched; no `searchParams`/uncached Sanity reads introduced; sitemap still lists all 22,180 category URLs; warmup trigger (monthly gate + manual dispatch) unchanged — only WHAT it crawls shrank. Workflow comments updated in `post-deploy-warmup.yml` + `monthly-warmup.yml`.
- [x] **Conscious no-ops:** no Sanity functional change, no webhook Filter/Projection change (infra/warmup only); no `perfect-imprints-sanity-guide.html` change (nothing Studio-facing).
- [ ] **Manual step (Patrick/dev, Vercel dashboard — NOT code):** turn off Vercel Observability event collection for the production project (Settings → Observability, disable Observability Plus / event collection; or under Billing if a plan add-on) to drop the "Observability Events" line item. No functional impact on the site.

**Depends on.** M6-606 (monthly warmup gate).

### [x] M6-610: Weekly crons disabled + "Warm All Pages" Site Refresh button — DONE 2026-07-06

**Scope.** Two client-requested cost-control changes: (1) the three weekly scrape workflows no longer fire on Sunday — Patrick refreshes them from the Site Refresh panel when HE wants; (2) a manual "Warm All Pages" button in the Site Refresh panel force-warms ALL ~22,180 category pages on production on demand, with a cost-warning confirm. No render-path change anywhere.

- [x] **Weekly crons disabled (kept re-enable-able).** `schedule:` blocks COMMENTED OUT (not deleted) in [scrape-deals.yml](.github/workflows/scrape-deals.yml), [scrape-new-products.yml](.github/workflows/scrape-new-products.yml), [scrape-rush-products.yml](.github/workflows/scrape-rush-products.yml) with a "disabled on request 2026-07; re-enable by uncommenting" note. `workflow_dispatch: {}` untouched — **the Site Refresh trigger route dispatches via `POST /actions/workflows/<file>/dispatches` (workflow_dispatch), so the panel buttons keep working unchanged.** Scrape logic, diff/PR, and auto-merge steps untouched; `monthly-rebuild.yml` + `monthly-warmup.yml` untouched.
- [x] **Warmup engine gains a `warm_scope` input** ([post-deploy-warmup.yml](.github/workflows/post-deploy-warmup.yml), on BOTH `workflow_call` and `workflow_dispatch`, default `'smart'`) → env `WARMUP_SCOPE` in [scripts/warmup/warmup-facets.ts](scripts/warmup/warmup-facets.ts). `smart` = the M6-609 capped list (unchanged default — `monthly-warmup.yml` passes no `warm_scope`, so the automatic monthly path is byte-identical); `all` = every category URL from `category-urls.json` via new `buildFullWarmupList()` in [scripts/warmup/build-warmup-list.ts](scripts/warmup/build-warmup-list.ts) (~22,180 incl. prebuilt — warm hits on static pages are cheap and "all" should mean all). No new crawler — same pool/summary/1%-failure gate.
- [x] **Registry + route:** new `warm-all` entry in [lib/site-refresh/workflows.ts](lib/site-refresh/workflows.ts) (file `post-deploy-warmup.yml`, inputs `{site_url: production www, warm_scope: 'all'}` — always production; no `branch` since the warmup opens no PR; `RefreshWorkflow.branch` made optional + new `confirmMessage` field). [app/api/sanity/workflows/route.ts](app/api/sanity/workflows/route.ts) Cancel now skips PR/branch cleanup for branch-less workflows (cancel just stops the crawl). Auth/PAT/nonce handshake reused as-is — **no new secret**.
- [x] **Panel UI** ([sanity/tools/site-refresh-tool.tsx](sanity/tools/site-refresh-tool.tsx)): fifth button with the standard status line (idle/queued/running/success/failed + time + "view details" link) and Cancel; `confirmMessage` shows a plain-language cost-warning `window.confirm` BEFORE triggering (run starts only on confirm); helper text explains it's optional and most useful after a Full Catalog Rebuild. Intro copy + the three scrape descriptions updated ("no longer runs automatically").
- [x] **Status polling note:** the panel polls `post-deploy-warmup.yml`'s latest run — `workflow_dispatch` runs list there; the monthly `workflow_call` runs list under `monthly-warmup.yml`, so the two paths don't collide in the status line.
- [x] **Standing rules:** NO Sanity doc/field/read-surface change → no webhook Filter/Projection change, no cache tag (conscious no-op); freshness pattern N/A (no new Sanity read); `/cat` render path untouched (workflow + Studio UI + registry only) — stays `●`/SSG; [perfect-imprints-sanity-guide.html](perfect-imprints-sanity-guide.html) §20 updated (five buttons, schedule off, Warm All Pages + cost warning, when to use); CLAUDE.md §13/§16 updated.
- [x] `pnpm typecheck` clean.
- [ ] **Live verification (after deploy):** (1) GitHub Actions shows no scheduled runs for the three scrapes; Refresh New Products from the panel still scrapes + auto-merges; (2) Warm All Pages → confirm dialog → run starts against `www.perfectimprints.com` with `warm_scope=all` (~22,180 URLs in the log); (3) Cancel mid-run stops it; (4) next monthly rebuild still warms only the capped ~3.5K list; (5) `/cat/[...slug]` still SSG in the Vercel build output.

**Depends on.** M6-608 (Site Refresh panel), M6-609 (smart list / warmup engine).

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

---

# ============================================================

# PHASE 2 — Post-Launch Paid Engagement (Deal closed 2026-07-04)

# ============================================================

**Deal:** $5,500 total, full Phase 2 scope. Weekly payments (Payoneer), late final payment(s) acceptable per agreement. First milestone paid 2026-07-04. Video AI tool added by Patrick post-agreement and included at no extra charge (goodwill; reuses the AI engine).

**Patrick's requested build order (2026-07-04):** AI engine first — Blogs, then Videos, then the other pages — followed by the remaining phases.

**Applies to every Phase 2 content task (per client SEO preferences):** target plural keyword forms for marketing directors, human resource directors, safety program managers, and business owners searching for bulk quantity promotional items. Weave in the modifier terms custom, customized, personalized, logo, printed, branded (e.g. "custom printed water bottles", "branded corporate gifts", "personalized trade show giveaways"). All content is bulk/wholesale B2B oriented, not consumer retail.

**Non-negotiables carried from Phase 1 (apply to all tasks below):**

- `/cat/[...slug]` and all existing routes MUST stay static/SSG. No `searchParams` in `page.tsx`, no uncached Sanity read in the render path.
- Every new Sanity read surface uses the non-CDN `cachedClient` + a cache tag, and the webhook `revalidateTag`s it (freshness pattern).
- Every tag value passes through `sanitizeTagValue()` (invalid tags → 5xx, learned the hard way in M5-525).
- Any functional Sanity change ships with: the manual webhook Filter/Projection steps (staging + production), the freshness pattern, an update to `perfect-imprints-sanity-guide.html`, and end-to-end test steps.
- Prompts end with "Do NOT commit"; developer commits. Staging-first, then promote to production (`pbnj53/perfectimprints`).

---

## Phase 2D — AI Content Engine (BUILD FIRST, per Patrick)

### [x] P2-AI-001: Shared AI content foundation — DONE 2026-07-05 (shipped with P2-AI-002)

Reusable engine that blogs, videos, pages, landing pages, and catalog pages all consume, built once. What shipped:

- **`lib/ai/brand-voice.ts`** (pure) — single source of truth for the CLAUDE.md §24 voice: `BUYER_PERSONA`, the plural keyword-derivative rule, the banned-phrases list, and `brandVoiceSystemBlock()` (persona + plural keywords + banned phrases + B2B-bulk-never-retail + no em-dashes + no "Perfect Imprints" in headings) that every feature composes into its system prompt. The category route (`generate-content`) still carries its own inline copy — deliberately untouched to avoid churn; it can adopt this module later.
- **`lib/ai/deepseek.ts`** (server-side) — `generateJson<T>({system,user,maxTokens?,temperature?})`, one shared DeepSeek wrapper (same endpoint/model/`response_format:{json_object}` as the category route, reuses `DEEPSEEK_API_KEY`). Throws a typed `DeepSeekError` (missing key / HTTP failure / empty body / non-JSON) that callers turn into a clean 500/502 — generation failure degrades to manual entry, never crashes a page or publish. Replaced the never-implemented M5-505 stub that lived at this path (nothing imported it).
- **`lib/ai/related-products.ts`** (server-only, disk) — `matchRelatedProducts({categorySlug?, keywords, limit, includeCustom?})`. Category FIRST (the baked category's curated SKUs via `getProductsForCategorySlug`, ranked by keyword-token overlap on name+brand with naive plural cross-match), then custom products (dynamic import of `getAllCustomProducts` + `customProductToGeigerProduct` — NEW thin read added to `lib/sanity/queries/custom-products.ts` — guarded so an offline/failed Sanity read degrades to Geiger-only), then catalog top-up (`getAllProducts`, only products that actually overlap the keywords, never random padding). Deterministic stable ordering (score desc → shorter name → sku), deduped by SKU.
- **`lib/ai/internal-links.ts`** (server-only) — `suggestInternalLinks({keywords, categorySlug?, excludeSlug?, limit})` returns `{label, href, kind: blog|page|category, reason}[]` from REAL data only: published blogPost titles+slugs (cachedClient, existing `RELATED_BLOGS_TAG`), published `page` titles+slugs (cachedClient, existing `PAGES_TAG`), and the 465 generated root category JSONs on disk (`suggestCategoryLinks`, exported separately for the offline verifier; labels = the page's real H1; the post's own category slug gets a boost). Kinds interleaved round-robin by score so close scores spread across kinds. NO new cache tag — these reads run only inside the force-dynamic generate route (no render surface).
- **`lib/portable-text/build-blog-body.ts`** (pure) — `buildBlogBody(input)` emits valid Portable Text matching `blogPost.body` exactly: normal/h2/h3 blocks, bullet/number list items with `level:1` (what `BlogBody.normalizeBody` expects), `blogProducts` strips (`{_type:'blogProduct', _key, sku}`), unique `_key`s throughout (nextKey pattern from `html-to-blocks.ts`). `strong` + `link` annotations are SUPPORTED via rich inline spans but NOT emitted by the default flow (see the internal-linking assumption below). Deliberately emits no `image`/`embed` blocks — those stay manual inserts.
- **`lib/seo/content-schema.ts`** (pure) — `buildBlogPostingSchema(...)`, extracted verbatim from the inline object in `app/blog/[slug]/page.tsx` (the route now calls it; identical output). Placeholder comment marks where the VideoObject emitter lands in P2-AI-003.
- **Conscious no-ops:** no Sanity webhook Filter/Projection change (`blogPost` already in the Filter with `slug` in the Projection; publishes already bust the search delta + `RELATED_BLOGS_TAG` + revalidate `/blog` + `/blog/<slug>`); no new render-path cache tag (engine reads reuse `RELATED_BLOGS_TAG`/`PAGES_TAG` inside a force-dynamic route only — `/cat` and `/blog` staticness untouched); no new env var (reuses `DEEPSEEK_API_KEY`).

### [x] P2-AI-002: AI Blog system [Patrick priority #1] — DONE 2026-07-05

- **"Generate Blog with AI" Studio document action on blogPost** ([sanity/actions/generate-blog-with-ai.tsx](sanity/actions/generate-blog-with-ai.tsx), registered in [sanity/sanity.config.ts](sanity/sanity.config.ts)) — mirrors the customCategory action exactly (plain React + `useDocumentOperation`, loading label, error dialog, no auto-publish). Patches: `title` (refined), `slug` ONLY if empty (inline slugify — never overwrites an imported slug), `publishDate` ONLY if empty (required field, set to now so the reviewed draft is publishable), `metaTitle`/`metaDescription`/`excerpt`, `body`, `aiSuggestedLinks`. **No fs import graph** — the fully assembled body comes back from the route; the action only fetches + patches.
- **Orchestrator route** [app/api/sanity/generate-blog/route.ts](app/api/sanity/generate-blog/route.ts) (`runtime='nodejs'`, `dynamic='force-dynamic'` — reads products.json from disk + calls DeepSeek, must never be statically evaluated). POST `{title, template, keywords, categorySlug, currentSlug}` → generate structured JSON (brand-voice block + per-template structure rules, `max_tokens` 6000 sized for ~2,000 words) → validate (structure + ≥900-word thin-output floor → clean 502 "click Generate again") → per-strip related products (list: one strip per idea from that idea's `productKeywords`, ~4 SKUs; single: one strip, ~7 SKUs) → `suggestInternalLinks(limit 5)` → `buildBlogBody`. Meta clamped at word boundaries (title ≤60 / description ≤155 / excerpt ≤300, the `post_process_lengths` safety-net idea).
- **Templates:** `list` — intro + 8-12 idea sections, each with an h2 heading, 1-2 paragraphs, and a product strip under the idea; `single` — intro + 4-6 prose sections (optional bullet/number lists in ≤2) + one recommended-products strip at the end. Both 1,500-2,000 words covering practical uses, who can use them, creative giveaway ideas, recommended products; plural keywords + personas + bulk/wholesale framing baked in.
- **blogPost schema:** new collapsible "AI generation (drafting helper — not shown on the live page)" fieldset with Studio-only fields `aiTemplate` (radio: list/single), `aiTopicKeywords` (tags), `aiPrimaryCategorySlug` (the searchable `CategorySlugInput` picker — same component as categoryOverride), `aiSuggestedLinks` (`{label, href, reason}[]`, the suggest-for-confirmation surface). None of these are read by any render path or the webhook.
- **Render path (light):** `app/blog/[slug]/page.tsx` now emits BlogPosting via `buildBlogPostingSchema` (same output); `BlogBody` full-schema verification pass — h1/h5/h6 block styles got minimal renderers (they were schema-legal but unstyled under Tailwind preflight); everything else (h2-h4, blockquote, bullet+number lists, strong/em defaults, link annotation, inline image, embed, blogProducts) confirmed already rendering. No restyling of existing output.
- **Offline verifier:** `pnpm verify:blog-engine` ([scripts/ai-pipeline/verify-blog-engine.ts](scripts/ai-pipeline/verify-blog-engine.ts)) — 22 checks, fully offline (no DeepSeek/Sanity): related-products category-first + keyword-only against the real products.json (existence/dedupe/limit/determinism), disk-only category links resolve to real `data/categories` files, and `buildBlogBody` structural assertions (valid `_type`s, unique keys, listItem level 1, no empty blocks, sku-bearing strips, link/strong marks). 22/22 passing.
- **Guide updated:** "Generate a Blog Post with AI" subsection under the Blog section of `perfect-imprints-sanity-guide.html` (steps, both templates explained, review checklist incl. add header image + place suggested links + set author, draft-only caution).
- **ASSUMPTIONS (as resolved):**
  1. **Daily volume workflow → one-at-a-time, draft-for-review** (create post → Generate → review → Publish, like the category AI flow). No batch/auto-publish; if Patrick wants bulk later, that is a separate wrapper on the same route/engine. **Still stands.**
  2. ~~Internal linking → suggest-for-confirmation, NOT auto-inserted~~ — **FLIPPED in P2-AI-002b (2026-07-06): Patrick confirmed auto-insert.** Links are now placed into the body automatically at the marked call site; `aiSuggestedLinks` still records everything found (annotated placed / not placed).
- **Conscious no-ops** (also listed under P2-AI-001): no webhook change, no new cache tag, no new env var.
- Patrick adds images himself (the AI never fabricates image files or video URLs; the body fully supports manual inline images + embeds). Emits BlogPosting schema. Target ~1 blog/day — one DeepSeek call per post, well within volume.

### [x] P2-AI-002b: Blog word-count control, product-strip relevance + dedup, auto-hyperlinked internal links — DONE 2026-07-06

Three fixes from Patrick's first real generation (the "10 Trade Show Giveaway Ideas" post: ~963 words against a 1,500-2,000 ask; the same four off-topic products — a visor, a tee, a shoe caddy, a cap — repeated under the power-bank, water-bottle, AND tote-bag ideas; links only suggested, not placed):

- **Fix 1 — word-count control.** New Studio field `blogPost.aiWordCount` ("Approximate word count", number; originally default 1700 / validated 1200-2400 — **retuned to default 1500 / 1300-1900 in P2-AI-002c**) in the AI fieldset; the action sends it; the route clamps server-side. New pure module [lib/ai/word-budget.ts](lib/ai/word-budget.ts): the route no longer asks the model for "1,500-2,000 words" (unreliable — that's how 963 happened) but fixes the section count from the target (`listIdeaCount` 8-12 / `singleSectionCount` 4-6), reserves an intro budget (120-180), splits the remainder per section (`buildWordBudget`), and states ALL the numbers in the prompt. The fixed 900-word thin floor became **dynamic** (`THIN_FLOOR_RATIO`; originally 75%, **70% since P2-AI-002c**) → same clean 502 "click Generate again". Guide is honest that it's a target (±~15%), not an exact count.
- **Fix 2 — product-strip relevance + cross-strip dedup.** Four root causes fixed in [lib/ai/related-products.ts](lib/ai/related-products.ts) + the route:
  (a) **per-idea product type (list template):** the model now returns a concrete `productType` (2-4 words, e.g. "power banks") per idea; new `resolveCategoryForKeywords()` maps it to the best generated ROOT category (slug-token overlap, deterministic) and that category becomes the idea's product source (catalog keyword scoring when nothing resolves). `aiPrimaryCategorySlug` is now a **soft fallback only** for list posts (consulted when an idea's own match yields < 2); it stays the primary source for single-focus posts.
  (b) **generic-word stripping:** new `GENERIC_PROMO_WORDS` export in [lib/ai/brand-voice.ts](lib/ai/brand-voice.ts) (custom/customized/personalized/logo/printed/branded/promotional/bulk/wholesale) + stopwords are stripped from BOTH sides before any overlap scoring (products AND category resolution) — those words are in almost every product name, which is exactly why a visor "matched" power banks. They stay in the generated copy; only the matching math ignores them.
  (c) **relevance floor:** `matchRelatedProducts` gains `minScore` (default 1 significant shared token) applied to ALL sources (category SKUs included — category membership alone is not proof, see full-capped-60) and **never tops a strip up with sub-threshold catalog bestsellers**. A strip renders only with ≥ `MIN_STRIP_PRODUCTS` (2, named constant in the route) relevant products, else it is skipped and the idea's text stands alone.
  (d) **cross-strip dedup:** `matchRelatedProducts` gains `exclude: Set<string>`; the route threads one `usedSkus` set through every strip so no product repeats anywhere in the post (custom products included).
- **Fix 3 — auto-hyperlinked internal links (Patrick confirmed the flip).** New pure module [lib/ai/place-internal-links.ts](lib/ai/place-internal-links.ts) (`placeInternalLinks`, called at the marked `buildBlogBody` site in the route): for each of the ≤5 real targets from `suggestInternalLinks`, finds the best anchor phrase (label n-grams longest-first + reason keywords; must contain a significant token) as a case-insensitive word-boundary run inside a NORMAL paragraph (never headings/lists/strips), wraps the FIRST occurrence in a schema-exact `link` annotation (`openInNewTab:false`), one per target/href/phrase, no overlaps, spread across paragraphs (an already-linked paragraph is reused only when nothing else matches), and **skips a target with no clean anchor** rather than forcing an awkward link. `aiSuggestedLinks` still records ALL suggestions, each annotated "(placed in the body)" / "(not placed: no clean anchor found)". `BlogBody` already renders the link annotation — no render change.
- **Verifier:** extended to **37 checks** (was 22), all offline: nonsense query → 0 products; off-topic-keywords+category returns only keyword-matching items; `resolveCategoryForKeywords('custom power banks') === resolveCategoryForKeywords('power banks')` (→ power-banks-chargers); exclude-set disjointness; clamp/budget/section-count math; placement (dupe-href skip, unanchorable skip, casing+text preservation, markDef shape, headings untouched, same-paragraph second pass, cap at 5).
- **Guide updated** (word-count field, auto-placed links wording, per-section strip matching + dedup + may-be-absent note). **Conscious no-ops:** no webhook Filter/Projection change (`aiWordCount` is Studio-only), no new cache tag / render-path change (links are body content BlogBody already renders; matching + budgeting are generation-time only — `/cat`/`/blog` staticness untouched), no new env var.

### [x] P2-AI-002d: Visible progress dialog on all three "Generate with AI" actions — DONE 2026-07-06

Patrick couldn't tell anything was happening after clicking Generate — the button's "Generating…" label is invisible because the document-actions menu closes on click. Fix: shared Studio component [sanity/components/AiProgressDialog.tsx](sanity/components/AiProgressDialog.tsx) (`AiProgressContent` — spinning dashed brand-red circle + per-action message + "fills in automatically" note; plain React, `<style>` keyframes, no @sanity/ui, no server imports) shown via the Sanity action `dialog` while `isGenerating` in ALL THREE actions: `generate-blog-with-ai` (blogPost), `generate-with-ai` (customCategory), `generate-schema-with-ai` (customSchema). The dialog closes itself when generation finishes (dialog → error → false precedence); closing it early only hides it (`hideProgress` state) — the fetch continues and patches the doc. Error dialogs unchanged. Guide updated (both AI subsections mention the spinner window). No route/schema/render change, no webhook change, Studio bundle import graph unchanged (pure React component).

### [x] P2-AI-002c: Blog word-count range + thin-floor tune — DONE 2026-07-06

Patrick kept hitting the "thin post, click Generate again" 502 (e.g. ~1108 words against a 1700 target): DeepSeek reliably lands under target and the 75% floor rejected acceptable posts. Tune, not redesign: **(1)** range 1200-2400 → **1300-1900, default 1500** (schema `initialValue`/validation + action empty-field fallback + route clamp, all via [lib/ai/word-budget.ts](lib/ai/word-budget.ts) constants; `max_tokens` 8000 → **6500**, still clear headroom for a 1,900-word structured JSON response — truncation would surface as a JSON parse error, not the thin floor); **(2)** thin floor `THIN_FLOOR_RATIO` 0.75 → **0.70** (1500 target → 1050-word minimum; the floor only accepts/rejects an already-generated post — generation length is driven by the prompt budgets); **(3)** per-section/total budgets now stated as **"at least N words" minimums** instead of "about N" (models aiming at "about" come in short) with an explicit reach-length-with-substance-not-padding instruction — brand-voice rules unchanged. Verifier updated (38 checks: clamps 1000→1300 / 3000→1900 / default 1500, budget sums to ~1500, floor-is-70% assertion); guide word-count line updated. **Conscious no-ops:** no webhook Filter/Projection change (`aiWordCount` stays Studio-only), no new cache tag / render-path change, no new env var.

### [x] P2-AI-003: AI Video tool [Patrick priority #2, added post-deal, included free] — DONE 2026-07-06

Mostly reuse of the P2-AI-001 engine — a generation action + route + a few fields + one new render section. What shipped:

- **"Generate Video Details with AI" Studio document action on `video`** ([sanity/actions/generate-video-with-ai.tsx](sanity/actions/generate-video-with-ai.tsx), registered in [sanity/sanity.config.ts](sanity/sanity.config.ts)) — mirrors the blog action (plain React + `useDocumentOperation`, AiProgressDialog spinner, error dialog, no auto-publish, **no fs import graph** — the assembled description comes back from the route). Disabled (with a tooltip) until `aiScript` is filled. Patches: `title` (refined), `slug` ONLY if empty (inline slugify), `publishDate` ONLY if empty, `seo.metaTitle`/`seo.metaDescription` (deep-set after `setIfMissing:{seo}` so an existing `ogImage` is never clobbered), `description`, `relatedProducts` (**only when ≥1 product matched** — a zero-match run never wipes a manually curated list), `aiSuggestedLinks` (annotated placed / not placed).
- **Orchestrator route** [app/api/sanity/generate-video/route.ts](app/api/sanity/generate-video/route.ts) (`runtime='nodejs'` + `dynamic='force-dynamic'`, byte-for-byte the generate-blog exports — reads products.json from disk + calls DeepSeek, never statically evaluated). POST `{title?, script, keywords[], embedUrl?, currentSlug?}` → `generateJson` (brand-voice block + video rules: expand the script into a useful long-form description — what the video covers, practical uses, who they suit, soft bulk-order tie-in — NOT an echo of the raw script; returns `title` / `metaTitle` ≤60 / `metaDescription` ≤155 / `descriptionParagraphs` 6-10 paragraphs totalling 500-750 words / `productType` 2-4 concrete words; `max_tokens` 2500, script input capped at 12k chars) → structural validation + lenient thin floor (<400 words → clean 502 "click Generate again") → **description built as richAnswer-LEGAL Portable Text** → internal links auto-placed → one related-products strip. Meta clamped at word boundaries.
- **`lib/portable-text/build-rich-answer-body.ts`** (pure, NEW) — `buildRichAnswerBody(paragraphs)`: emits ONLY `{_type:'block', style:'normal'}` blocks (no h2/h3/lists/images/blogProducts — Studio silently drops schema-illegal blocks) with strong/em + link marks, unique `_key`s; **the link markDef is `{_type:'link', _key, href}` with NO `openInNewTab`** (the richAnswer annotation has no such field — the single biggest gotcha; any stray `openInNewTab` on a span link is dropped here, belt and suspenders).
- **`lib/ai/place-internal-links.ts` parametrized** — new optional `{linkShape: 'blog' | 'richAnswer'}` 4th param: 'blog' (default) keeps `{href, openInNewTab:false}` span links for `buildBlogBody`; 'richAnswer' emits `{href}` only. Same placement rules in both modes (first clean anchor in a normal paragraph, one per target/href/phrase, no overlaps, unanchorable skipped, cap 5). Blog route untouched (default shape).
- **`video` schema:** new collapsible "AI generation (drafting helper)" fieldset with Studio-only `aiScript` (large text), `aiTopicKeywords` (tags), `aiSuggestedLinks` (`{label, href, reason}[]`), plus the RENDERED `relatedProducts` — an array of the shared **`blogProduct`** entry type, which was **promoted from an inline object in `blog-products.ts` to a registered named type** (same `_type: 'blogProduct'` in stored data, so existing blog docs are untouched) and reused for identical SKU resolution + ProductCard rendering.
- **Render:** [app/videos/[slug]/page.tsx](app/videos/[slug]/page.tsx) resolves the strip's SKUs server-side via `resolveProductsBySku` (products.json from disk — the blog page's exact pattern, no `searchParams`, no uncached Sanity read → **`/videos/[slug]` stays on-demand SSG**) and renders a "Featured Custom Promotional Products" section between the description and Related Videos via the new [components/videos/VideoRelatedProducts.tsx](components/videos/VideoRelatedProducts.tsx) (mirrors the BlogBody `blogProducts` renderer: ProductCard for resolved SKUs, the same manual-fallback card for title/image/url entries, Geiger URLs affiliate-rewritten; renders nothing when empty). `relatedProducts` added to the video GROQ projection — rides the existing `cachedClient` + `VIDEOS_TAG` fetch.
- **Product matching is keyword/productType-driven** (`resolveCategoryForKeywords(productType)` → category-first `matchRelatedProducts`, relevance floor, no padding) — the video's Sanity `category` is a `blogCategory` editorial ref, NOT a product category, so it plays no part in matching.
- **Schema/JSON-LD:** VideoObject **reused as-is** (`videoObjectSchema()` in `lib/seo/schema-generators.ts`, already emitted by the video page; its `description` plain-texts the richer AI description automatically). `content-schema.ts` placeholder comment updated to point at it as the canonical emitter.
- **Verifier:** `pnpm verify:blog-engine` extended to **46 checks** (was 38), all offline — new section [10]: `buildRichAnswerBody` emits ONLY normal blocks (no forbidden `_type`s, blanks dropped, unique keys); richAnswer-mode placement (dupe-href + unanchorable skip, text preserved, cap 5) with span links carrying **href only**; built richAnswer markDefs are exactly `{_key,_type,href}` with **no `openInNewTab` key** while blog mode still emits `openInNewTab` (proves the parametrization); video-style product match is sku-backed/relevance-floored/deduped. All 38 existing blog checks stay green.
- **Guide updated:** "Generate Video Details with AI" subsection under the Video section of `perfect-imprints-sanity-guide.html` (steps, auto-placed links wording, related-products row, thumbnail note for Instagram/Facebook, draft-only caution).
- **ASSUMPTIONS:** one-at-a-time draft-for-review (same as blogs, no batch); title optional (the AI derives one from the script when blank); `relatedProducts` refreshed on regenerate but never wiped by a zero-match run.
- **Conscious no-ops:** **no webhook Filter/Projection change** — `video` is already in the Filter and already revalidates `/videos` + `/videos/<slug>` on publish; `relatedProducts` is read in the app's own cached video fetch (not the webhook projection); `aiScript`/`aiTopicKeywords`/`aiSuggestedLinks` are Studio-only. **No new cache tag** — `relatedProducts` rides the existing `VIDEOS_TAG` video fetch. **No new VideoObject emitter** — reuses `videoObjectSchema()`. **No new env var** — reuses `DEEPSEEK_API_KEY`.

### [x] P2-AI-004: AI Page generation [Patrick priority #3, "other pages"] — DONE 2026-07-06

Engine + page-builder reuse — a new reusable section type plus a generation action + route. Per Patrick's choices: **text sections only** (image-dependent sections are skipped; he adds images himself), and **auto internal links + related products both**. What shipped:

- **`productStrip` page section (reusable, NEW)** — added to [sanity/schemas/objects/page-sections.ts](sanity/schemas/objects/page-sections.ts) (+ `pageSectionSchemas`/`pageSectionRefs`, so it's in the page builder's insert menu on ANY page): optional `heading`, `anchorId`, `hidden`, and `products[]` of the shared **`blogProduct`** entry (SKU-backed or manual title/image/url — same entry as blog strips and `video.relatedProducts`). Renderer [components/page-sections/ProductStrip.tsx](components/page-sections/ProductStrip.tsx) (server component, added to `SectionRenderer`'s switch) resolves SKUs **synchronously from disk** via `resolveProductsBySku` (products.json — the blog/video pattern: no `searchParams`, no uncached Sanity read) and renders the shared ProductCard grid, with the same manual-fallback card + affiliate URL rewrite as `VideoRelatedProducts`; renders nothing when empty. **`/services/[slug]`, `app/[...slug]`, and the footer/legal pages all stay SSG.** `ProductStripSection` added to the `PageSection` union in [lib/sanity/queries/pages.ts](lib/sanity/queries/pages.ts) — the `sections[]{ ... }` GROQ spread already carries the new fields, so no projection change. This is also the strip the landing pages (P2-AI-005) will reuse.
- **"Generate Page with AI" Studio document action on `page`** ([sanity/actions/generate-page-with-ai.tsx](sanity/actions/generate-page-with-ai.tsx), registered in [sanity/sanity.config.ts](sanity/sanity.config.ts)) — mirrors the video action (plain React + `useDocumentOperation`, AiProgressDialog spinner, error dialog, no auto-publish, **no fs import graph** — the assembled sections come back from the route). Disabled (with a tooltip) until `title` is filled. Patches: **`sections` APPENDED non-destructively** (`setIfMissing: []` then `insert after sections[-1]` — a populated page is never wiped; re-clicking Generate appends a second set, acceptable for a reviewed draft and stated in the progress dialog + guide), `slug` ONLY if empty (inline slugify), `seo.metaTitle`/`seo.metaDescription` (deep-set after `setIfMissing:{seo}` so an existing `ogImage` is never clobbered), `aiSuggestedLinks` (annotated placed / not placed). **`title` is never overwritten** (it's the input/seed).
- **Orchestrator route** [app/api/sanity/generate-page/route.ts](app/api/sanity/generate-page/route.ts) (`runtime='nodejs'` + `dynamic='force-dynamic'`, byte-for-byte the generate-blog/-video exports). POST `{title, brief?, keywords[], currentSlug?}` → `generateJson` (brand-voice block + page rules: useful B2B copy, plural keywords, honest GENERIC stat framing — never a fabricated precise statistic; returns hero heading/subheading/CTA label, 3-6 `bodySections` `{heading, paragraphs[], listItems?}` totalling ≥600 and ~≤1000 words, `stat`, 3-6 plain-text `faqs`, closing CTA copy, `productType`, `metaTitle` ≤60 / `metaDescription` ≤155; `max_tokens` 4000) → structural validation + lenient thin floor (<450 body words → clean 502 "click Generate again") → internal links auto-placed → **REAL page section objects assembled** with unique `_key`s, in order: `heroBanner` (no image, `overlayText:false` so text-on-top reads right; CTA → `/contact`) → one `richText` per body section (heading in the section's own `heading` field, body built by the new page builder below, bullet `listItems` supported) → `productStrip` (skipped below a 2-product relevance floor, heading "Featured Custom <ProductType>") → `statBanner` (red) → `faqAccordion` (plain-text answers — the page FAQ item is a `text` field, NOT rich text) → `ctaBlock` (button → `/contact`). **`/contact` is a verified real route** (the lead form renders there) — hrefs are never invented; Patrick repoints buttons in Studio. Image-dependent sections (imageText, infographic, iconFeatures, cardGrid) deliberately not generated.
- **`lib/portable-text/build-page-body.ts`** (pure, NEW) — `buildPageBody({paragraphs, list?})`: emits page-`portableBody`-legal Portable Text (normal blocks + bullet/number `listItem` with `level:1`, strong/em + link marks, unique `_key`s, blanks dropped, NO images/blogProducts). **The link markDef is `{_type:'link', _key, href}` with NO `openInNewTab`** — the page builder's `portableBody()` uses the DEFAULT block-editor link annotation, which (like richAnswer) carries href only; any stray `openInNewTab` on a span link is dropped here, belt and suspenders. Section headings are NOT emitted in the body — they go in the richText section's own `heading` field.
- **`lib/ai/place-internal-links.ts`:** `PlacedLinkShape` extended with **`'page'`** (href-only — structurally identical to 'richAnswer'; the explicit value exists so call sites state intent). Placement rules unchanged in all modes; blog default untouched. Page-link suggestions are filtered so the page never links to itself (`currentSlug`).
- **`page` schema:** new collapsible "AI generation (drafting helper)" fieldset with Studio-only `aiBrief` (text), `aiTopicKeywords` (tags), `aiSuggestedLinks` (`{label, href, reason}[]` — same inline object shape as blog/video).
- **Verifier:** `pnpm verify:blog-engine` extended to **56 checks** (was 46), all offline — new section [11]: `buildPageBody` emits only normal-style blocks with bullet `level:1` lists, unique keys, strong marks, and markDefs exactly `{_key,_type,href}` with **no `openInNewTab` key**; 'page' link-shape placement (unanchorable skipped, headings untouched, text intact through `buildPageBody`); a synthetic `productStrip` section has the exact stored shape (`_type:'productStrip'`, `products[]` of keyed `blogProduct` entries with real catalog SKUs); the 2-product strip floor (irrelevant keywords → strip omitted); page product matching is sku-backed/relevance-floored/deduped. All 46 existing blog + video checks stay green.
- **Guide updated:** "Product Strip" row in the page-builder section table + a "Generate Page with AI" subsection (steps, appended-not-overwritten callout, add-images-yourself + CTA-button note, draft-only caution) in `perfect-imprints-sanity-guide.html`.
- **ASSUMPTIONS:** one-at-a-time draft-for-review (same as blogs/videos, no batch); CTA/hero buttons default to `/contact`; re-generate appends rather than replaces (non-destructive by Patrick-safety default).
- **Conscious no-ops:** **no webhook Filter/Projection change** — `page` is already in the Filter and already revalidates `/services/<slug>` + `/<slug>` + the sitemap on publish; `productStrip` fields ride the app's own cached pages GROQ spread (not the webhook projection); `aiBrief`/`aiTopicKeywords`/`aiSuggestedLinks` are Studio-only. **No new cache tag** — the strip rides the existing `PAGES_TAG`/`pageTag` fetch. **No new env var** — reuses `DEEPSEEK_API_KEY`.

### [x] P2-BLOG-CTA: Per-post CTA heading override (verbatim, CTA-only) — DONE 2026-07-06, REWORKED 2026-07-07

The "Order Custom [topic] Today" CTA block on a blog post derives its topic from the post's FIRST category title, so a mini-footballs post filed under "Buying Guides" read "Order Custom Buying Guides Today" with no way for Patrick to fix the wording. **First cut (2026-07-06) got the semantics wrong** — the field was a "topic" token inserted into the fixed template AND shared with the Related Blogs heading, so Patrick typing the full heading produced "Order Custom Order Custom Mini Footballs Today Today" and leaked into "See Related Blogs About …". Reworked 2026-07-07 to Patrick's actual intent:

- **`blogPost.ctaTopic`** (optional string, relabeled **"CTA Heading (optional)"**, placed above Meta Title; schema key kept as `ctaTopic` so any already-saved value survives) — when filled, it is the CTA block's heading **VERBATIM** (no "Order Custom"/"Today" wrapper); blank = the automatic "Order Custom [category] Today" (clearing + republishing reverts). **CTA-only:** the "See Related Blogs About …" heading always uses the automatic category-based topic and ignores this field.
- **Render:** `OrderTodayCTA` ([components/blog/OrderTodayCTA.tsx](components/blog/OrderTodayCTA.tsx)) gained an optional `heading?: string` prop — non-empty renders exactly as-is, else the `Order Custom {topic} Today` template (body copy / button / lead-modal `categoryTitle` unchanged, still the automatic topic). [app/blog/[slug]/page.tsx](app/blog/[slug]/page.tsx) passes `heading={post.ctaTopic?.trim() || undefined}`; `deriveOrderTopic()` reverted to its original automatic form (first category title → title-words fallback) and its single `orderTopic` feeds both components as before. `RelatedBlogsForPost` untouched.
- **Query:** `ctaTopic` stays in the `getBlogPostBySlug` GROQ projection + `BlogPostDetail` type in [lib/sanity/queries/blogs.ts](lib/sanity/queries/blogs.ts) (the single-post page is the only surface rendering these headings). Rides the existing cached blog fetch.
- **No AI pre-fill (removed 2026-07-07):** the `ctaTopic` generation was stripped from both prompt templates + the response in [app/api/sanity/generate-blog/route.ts](app/api/sanity/generate-blog/route.ts) and the patch removed from [sanity/actions/generate-blog-with-ai.tsx](sanity/actions/generate-blog-with-ai.tsx) — the field stays blank unless Patrick types a value.
- **Guide updated:** the Blog section's subsection is now "CTA Heading" (verbatim behavior, CTA-only scope, blank = automatic, no AI pre-fill) + the AI review step notes the AI never fills it.
- **Conscious no-ops:** **no webhook Filter/Projection change** — `blogPost` is already in the Filter and already revalidates `/blog/<slug>` on publish; `ctaTopic` rides the existing cached blog fetch. **No new cache tag, no render-path staticness change** (`/blog/[slug]` stays SSG), **no new env var**.

### [x] P2-BLOG-CTA follow-up: Per-post CTA BODY text override + backfill — DONE 2026-07-13

Patrick request: the CTA heading was editable (`ctaTopic`), but the paragraph under it was hardcoded in `OrderTodayCTA` — make it per-post editable too, and backfill existing published blogs so the current wording is preserved.

- **`blogPost.ctaBody`** (optional `text`, 3 rows, placed directly under CTA Heading) — filled = the CTA paragraph VERBATIM; blank = the default copy. Mirrors the `ctaTopic` pattern (verbatim, CTA-only, blank→default).
- **Shared default constant:** [lib/blog/cta-defaults.ts](lib/blog/cta-defaults.ts) `DEFAULT_CTA_BODY` (pure module — no React/'use client', so a Node script can import it). Both the component fallback AND the backfill script use it, so stored text and rendered default can never drift.
- **Render:** `OrderTodayCTA` ([components/blog/OrderTodayCTA.tsx](components/blog/OrderTodayCTA.tsx)) gained `body?: string` (non-empty → as-is, else `DEFAULT_CTA_BODY`; paragraph now `whitespace-pre-line` so editor line breaks show). [app/blog/[slug]/page.tsx](app/blog/[slug]/page.tsx) passes `body={post.ctaBody?.trim() || undefined}`. **Because the fallback === the pre-existing hardcoded text, every post (published/draft/existing/future) shows the exact same paragraph as before with zero action — nothing breaks without the backfill.**
- **Query:** `ctaBody` added to the `getBlogPostBySlug` GROQ projection + `BlogPostDetail` type in [lib/sanity/queries/blogs.ts](lib/sanity/queries/blogs.ts). Rides the existing cached blog fetch.
- **Backfill (RUN 2026-07-13):** [scripts/migrations/backfill-blog-cta-body.ts](scripts/migrations/backfill-blog-cta-body.ts) (`pnpm backfill-blog-cta-body [--dry-run]`) writes `DEFAULT_CTA_BODY` into every PUBLISHED blogPost with an empty `ctaBody` (idempotent — skips already-set; drafts left alone, they fall back to the same default so a later publish never changes the visible text). Dry-run: 647 published posts scanned, 647 to write, 0 already set. Live run wrote all 647 → each triggers the existing `blogPost` webhook → `/blog/<slug>` revalidates. Purpose: lock the current wording onto each doc + pre-fill the Studio box so Patrick can edit per post.
- **Conscious no-ops:** **no webhook Filter/Projection change** (`blogPost` already covered), no new cache tag, `/blog/[slug]` stays SSG, no new env var, no AI pre-fill. `pnpm typecheck` clean.

### [x] P2-AI-005 (part 1 of 2): AI Local & Topic Landing pages — type, template, route, AI generation — DONE 2026-07-07

The landing-page SYSTEM (Patrick's Phase 2D flagship): the `landingPage` document type, the fixed high-converting template at a top-level `/<slug>`, and the self-serve AI generator with Patrick's must-include-landmarks requirement. **Part 2 (separate prompt, pending): the landing-specific per-page lead form** (Quantity Needed + Date Needed required, per-page `leadRecipient`, customer confirmation email) — until then the template renders the existing Phase 1 `LeadForm` as a working stand-in (emails Patrick + saves a leadSubmission), marked in code for replacement. The actual top-10 city+product pages are CONTENT produced with this tool after Patrick signs off on the combos — part 1 ships the system, not a hardcoded set. What shipped:

- **`landingPage` document type** ([sanity/schemas/documents/landing-page.ts](sanity/schemas/documents/landing-page.ts), registered in the schema index; desk structure auto-lists it). Targeting inputs in a collapsible "AI generation inputs" fieldset: `city`, `state`, `product`, **`landmarks[]` (tags — "the AI will definitely include these", Patrick's confirmed requirement)**, `aiTopicKeywords[]`. AI-generated editable content: `heroHeading`/`heroSubheading`, `localIntro` / `optionsIdeas` / `whyUs` (all three reuse the page-builder `portableBody` field — now exported from [sanity/schemas/objects/page-sections.ts](sanity/schemas/objects/page-sections.ts)), `relatedProducts[]` (shared `blogProduct` entries), `faqs[]` (plain-text q/a, same shape as the page faqAccordion items), `seo`, `aiSuggestedLinks` (collapsed "AI output log" fieldset). Lead config stored now for part 2: `leadRecipient` (email-validated string, `initialValue: patrick@perfectimprints.com`). **Slug reserved-guard mirrored from the `page` schema** (same message; third inline copy of `lib/reserved-slugs.ts` — keep in sync).
- **Fixed template** [components/landing/LandingPageTemplate.tsx](components/landing/LandingPageTemplate.tsx) (server component, static-safe): (1) text hero with a green "Request a Quote" button anchoring to `#quote-form`; (2) `localIntro`; (3) `optionsIdeas` + the related-products strip (reuses the P2-AI-004 **`ProductStrip` renderer** via a synthetic section — SKUs resolve synchronously from disk); (4) fixed-H2 "Why Perfect Imprints" + `whyUs`; (5) FAQs via the page-builder **`FaqAccordion`** (which emits the FAQPage JSON-LD — deliberately NOT double-emitted); (6) the LeadForm stand-in (anchored, `categoryTitle` pre-filled with the product, `sourceUrl=/'<slug>'`) with the part-2 replacement comment. Bodies render through the shared `pagePortableComponents`. A **Service JSON-LD** block (new pure `landingServiceSchema()` in [lib/seo/schema-generators.ts](lib/seo/schema-generators.ts) — product + City/State areaServed + PI as provider, honest/generic, no invented ratings/geo) is emitted when product + city exist.
- **Route integration** in [app/[...slug]/page.tsx](app/[...slug]/page.tsx): **landingPage resolves FIRST**, then the existing `page` fallback unchanged (breadcrumb + `CustomSchemaJsonLd` on both). `generateStaticParams` merges + dedupes landing and page slugs (minus `ROUTE_RESERVED`). **Slug precedence documented: landingPage wins** if a slug is somehow both. Still on-demand SSG (`dynamicParams=true`, `revalidate=false`), no `searchParams`, no uncached read — reads go through [lib/sanity/queries/landing-pages.ts](lib/sanity/queries/landing-pages.ts) (non-CDN `cachedClient`, tags `LANDING_TAG` + `landing:<slug>` via the sanitizer — new builders in [lib/sanity/cache-tags.ts](lib/sanity/cache-tags.ts)).
- **AI generation**: route [app/api/sanity/generate-landing/route.ts](app/api/sanity/generate-landing/route.ts) (`nodejs` + `force-dynamic`, mirrors generate-page) — brand-voice system prompt + landing rules (center product-in-city; **every landmark REQUIRED**, copied exactly; 4-6 optionsIdeas sections covering product options AND city-specific creative uses so no two pages read as thin duplicates; honest generic claims; personas + plural keywords; ≤60/≤155 meta), `maxTokens` 5000, thin floor 500 body words → clean 502 retry. **Landmark enforcement is mechanical, not just prompted**: new pure [lib/ai/landing-landmarks.ts](lib/ai/landing-landmarks.ts) `findMissingLandmarks()` (case/whitespace/apostrophe-tolerant) rejects any result that dropped a landmark with a 502 naming the missing ones. Internal links suggested from real targets and **auto-placed in ONE pass across all three bodies** (compose intro+sections+whyUs → `placeInternalLinks` in `'page'` link-shape → split back on the same boundaries), then bodies built by `buildPageBody` + the new **`buildPageSectionsBody`** ([lib/portable-text/build-page-body.ts](lib/portable-text/build-page-body.ts) — multi-section body with h2 heading blocks IN the body, since `optionsIdeas` is one field, unlike the page builder's per-section heading field). Related products via `resolveCategoryForKeywords` + `matchRelatedProducts` (relevance floor, strip omitted under 2). Self-links filtered via `currentSlug` (covers both page + landing hrefs — both are `/<slug>`).
- **Internal-link engine extended** ([lib/ai/internal-links.ts](lib/ai/internal-links.ts)): kinds now include **`video`** (`/videos/<slug>`, rides `VIDEOS_TAG`) and **`landing`** (`/<slug>`, rides `LANDING_TAG`) alongside blog/page/category — the four Sanity sources refactored into one shared `suggestSanityDocLinks()` (identical scoring; blogs keep `excludeSlug`). The mixing loop extracted as the pure exported **`interleaveScoredSuggestions()`** (same best-head round-robin + rotate; now also **href-deduped** — a `page` and a `landingPage` could theoretically share `/<slug>`) so the verifier exercises landing+video mixing offline. Benefits ALL generators: blogs/videos/pages now also suggest videos + landing pages.
- **Studio action** [sanity/actions/generate-landing-with-ai.tsx](sanity/actions/generate-landing-with-ai.tsx) (registered for `landingPage` in [sanity/sanity.config.ts](sanity/sanity.config.ts)) — plain React + `useDocumentOperation`, AiProgressDialog spinner, error dialog, **no fs import graph** (bodies come back from the route). **Disabled (tooltip) until City + State + Product are filled.** Patches: `slug` only-if-empty (slugified `product-city-state`), `seo.metaTitle`/`seo.metaDescription` deep-set after `setIfMissing` (ogImage preserved), hero/localIntro/optionsIdeas/whyUs/faqs (keyed), `relatedProducts` **only when ≥1 matched** (zero-match never wipes a curated list), `aiSuggestedLinks` (annotated placed / not-placed). **Never overwrites Patrick's inputs** (title, city, state, product, landmarks, leadRecipient). Never publishes.
- **Freshness + webhook**: webhook handler adds a `landingPage` case → `revalidateTag(LANDING_TAG,'max')` + `bustTag(landing:<slug>)` + `revalidatePath('/<slug>')` + `/sitemap.xml`. **⚠️ REQUIRED MANUAL STEP (Ali, both webhooks): `landingPage` must be ADDED to the Sanity webhook Filter `_type` list** — new doc type, neither existing webhook has it. New Filter (only change is the trailing `,"landingPage"`): `!(_id in path("drafts.**")) && _type in ["megaMenu","globalSettings","homePage","page","blogPost","video","customProduct","customCategory","curatedCategory","faq","categoryOverride","productPlacement","customSchema","brand","landingPage"]`. Do staging NOW, production at promotion. Projection unchanged (`slug` already projected). Until added, a landing publish/edit stays silently stale (first-ever visit still renders via on-demand SSG). Documented in [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md).
- **Sitemap**: landing slugs added to [app/sitemap.ts](app/sitemap.ts) (indexable, self-canonical, `landingPages:` count in the build log; `page` URLs deduped against landing URLs — landing wins, matching route precedence).
- **Verifier**: `pnpm verify:blog-engine` extended to **71 checks** (was 56), all offline — new section [12]: `buildPageSectionsBody` (h2 blocks per section, bullet level-1 lists, unique keys, href-only markDefs, headings never linked); `interleaveScoredSuggestions` seeded with landing+video kinds (both appear, capped, href-deduped, score stripped); `findMissingLandmarks` (all-present → empty, dropped → reported, tolerant matching, **word-bounded** — "Destin" not satisfied by "destination" — and **per-segment** — a multi-word landmark never matches across two adjacent blocks); landing product strip (sku-backed/floored/deduped, <2 → omitted); the full synthetic payload mapping (one placement pass across three bodies split back correctly, page-legal PT, plain-text keyed faqs, keyed blogProduct entries). All 56 existing checks stay green.
- **Adversarial review fixes (multi-agent review of the diff, all findings confirmed + fixed same day):** (1) **video self-link regression** — the new `video` link source let a regenerated PUBLISHED video suggest + auto-place a link to itself (`excludeSlug` only filters the blog source); fixed in [app/api/sanity/generate-video/route.ts](app/api/sanity/generate-video/route.ts) with the same self-href post-filter the page/landing routes use (`.filter(s => s.href !== '/videos/<currentSlug>')`). (2) **landing schema now ALSO blocks the four Services slugs** (kitting/company-stores/popup-stores/custom-products) — deliberately stricter than the `page` schema (Services docs ARE page docs; a landingPage has no /services/ render path, so it would publish fine yet 404 everywhere); sitemap's `readLandingPageUrls` filters `SERVICE_SLUGS` too, matching the route's `ROUTE_RESERVED`. (3) **landing `og:image` honors an uploaded `seo.ogImage`** (`buildImageUrl(..., w=1200)` in the landing `generateMetadata` branch — the video route's pattern; previously always fell back to the logo card. NOTE: the pre-existing `page` branch has the same inherited gap, left untouched). (4) **empty-FAQ wipe closed both ends** — the route now 502-retries when < 3 usable FAQs come back (matching the prompt's 3-6 hard limit + the landmark/thin-body enforcement style), and the action patches `faqs` only when non-empty (same guard as `relatedProducts`). (5) **null-safe generation parsing** — the optionsIdeas map + heroSubheading/productType coercions no longer throw an opaque TypeError-as-502 on junk array elements / non-string fields. (6) **`includeCustom: false` for the landing strip** — synthetic `custom-<id>` SKUs can't resolve from products.json at render, so they'd count toward the 2-product floor yet render nothing (NOTE: generate-blog/-video/-page inherit this same behavior — not changed here, tracked as a follow-up). (7) **landmark matching hardened** — word-bounded + per-segment (see the verifier bullet).
- **Guide updated**: new "Landing Pages" section 21 in `perfect-imprints-sanity-guide.html` (create → generate → review-landmarks → publish flow, uniqueness note, quote-form-for-now note, reserved-slug rule, draft-only caution) + TOC + connects-map bullet + common-tasks row (sections renumbered 21-23 → 22-24).
- **ASSUMPTIONS**: one-at-a-time draft-for-review (no batch), matching every other generator; the strip heading is render-derived ("Featured <Product>"); the fixed "Why Perfect Imprints" H2 is template copy (the AI is told not to emit its own heading there); landmark placement is enforced across localIntro + optionsIdeas (localIntro is the prompt's stated home).
- **Conscious no-ops**: webhook **Projection** unchanged (slug already projected) — only the Filter gains `landingPage` (manual). `productStrip` rendering, the page link shape, `build-page-body`, `blogProduct`, and `pagePortableComponents` are all REUSED from P2-AI-004 (no new versions). No new env var (reuses `DEEPSEEK_API_KEY`; the stand-in form reuses Gmail SMTP). No FAQPage double-emit (FaqAccordion already emits it). Part 2 (landing-specific lead form) NOT built here beyond the `leadRecipient` field + the stand-in.

### [x] P2-AI-005 (part 2 of 2): landing lead form — per-page recipient, customer confirmation, editable CTA — DONE 2026-07-07

Landing pages are now COMPLETE. The existing Phase 1 form already had the right fields (Quantity Needed + Date Needed both required, optional artwork upload, Turnstile/honeypot/rate-limit), so part 2 is three focused deltas on top of it — no new form was built:

- **Per-page recipient, resolved SERVER-SIDE (the abuse guard).** [components/forms/LeadForm.tsx](components/forms/LeadForm.tsx) gains an optional `landingSlug` prop → a hidden `landingSlug` field in the POST; **the client never sends a recipient email — only the slug**. [app/api/leads/route.ts](app/api/leads/route.ts) resolves it via the new `getLandingLeadInfo(slug)` ([lib/sanity/queries/landing-pages.ts](lib/sanity/queries/landing-pages.ts) — lightweight `{leadRecipient, product, title}` GROQ through the non-CDN `cachedClient` + `LANDING_TAG`/`landing:<slug>` tags, so a Studio edit re-routes within seconds) and the pure `resolveLandingLeadRouting()` ([lib/leads/landing-lead.ts](lib/leads/landing-lead.ts), NEW): no landing doc (absent/unknown slug, lookup failure) → site default + NO confirmation (the pre-part-2 behavior, byte-for-byte — `sendLeadEmail(payload)` is called with no override); valid stored `leadRecipient` → that recipient (`sendLeadEmail(payload, {to})` — the only signature change to [lib/email/gmail-smtp.ts](lib/email/gmail-smtp.ts), default path untouched) + confirmation; invalid/blank recipient → site default + confirmation (it IS still a landing submission). A forged/unknown slug simply behaves as non-landing — **no open relay is possible by construction** (the resolver has no parameter a client value can reach). Landing submissions also record the resolved destination on the `leadSubmission` doc (new read-only `recipient` "Lead sent to" field in [sanity/schemas/documents/lead-submission.ts](sanity/schemas/documents/lead-submission.ts); non-landing docs unchanged).
- **Customer confirmation email — landing submissions ONLY.** New `sendCustomerConfirmationEmail()` in [lib/email/gmail-smtp.ts](lib/email/gmail-smtp.ts), content built by the pure `buildCustomerConfirmationEmail()` ([lib/leads/landing-lead.ts](lib/leads/landing-lead.ts) — offline-verified): friendly plain-text + HTML copy of the submission (name, looking-for, quantity, date, the page's product, source page) with a follow-up note + the 800 number; `replyTo` = the landing recipient (or the site default) so a customer reply lands with the right person; HTML-escaped user input. Sent AFTER the lead email + lead record; **NON-FATAL** (`try/catch` + log, same policy as the Sanity write) — a confirmation failure never fails the submission. A valid submitter email is already enforced by the route's existing validation. Category/contact forms: unchanged, no confirmation.
- **Editable CTA** ([sanity/schemas/documents/landing-page.ts](sanity/schemas/documents/landing-page.ts)): `heroCtaLabel` (initialValue "Request a Quote") + `leadFormHeading` (blank → "Request a Quote in {City}, {State}") — both in the landing GROQ projection; [components/landing/LandingPageTemplate.tsx](components/landing/LandingPageTemplate.tsx) renders field-or-default (hero button still anchors to `#quote-form`), passes `landingSlug={page.slug}` + `categoryTitle={product}` to the form, and the part-1 "stand-in" comment is gone — this IS the landing form now. [app/api/sanity/generate-landing/route.ts](app/api/sanity/generate-landing/route.ts) returns a DETERMINISTIC `leadFormHeading` pre-fill (the default pattern — no prompt change); the action patches it **only-if-empty** (Patrick's wording never overwritten; `heroCtaLabel` is never touched by the AI).
- **Verifier**: `pnpm verify:blog-engine` extended to **77 checks** (was 71) — new section [13]: the three routing branches (non-landing → default + no confirmation; valid recipient → trimmed recipient + confirmation; invalid/blank → default fallback + confirmation), the abuse guard (only the STORED `leadRecipient` is consulted — smuggled recipient-like fields are ignored; email validation rejects junk), and the confirmation builder (subject + name/looking-for/quantity/date/product/page in text AND html, HTML escaping of user input, generic topic fallback). All 71 existing checks stay green.
- **Guide updated**: the Landing Pages section's "quote form (for now)" callout replaced with "The quote form and its settings" (per-page Lead recipient + server-side lookup note, Hero button label, Quote form heading defaults) + a "Customers get a confirmation email" callout (landing-only; other forms unchanged).
- **Conscious no-ops:** **no webhook Filter/Projection change** (`landingPage` already in the Filter from part 1; the new fields + the recipient lookup ride the existing `LANDING_TAG`/`landing:<slug>` cached fetch). **No new cache tag, no new env var** (reuses Gmail SMTP `GMAIL_USER`/`GMAIL_APP_PASSWORD` + `LEAD_EMAIL_TO`/`LEAD_EMAIL_FROM` defaults and the existing Turnstile setup). **Existing non-landing lead forms unchanged** (category empty-state CTAs + `/contact` still email the site default with no confirmation — verified by the routing branch: no `landingSlug` → `sendLeadEmail(payload)` exactly as before). **No new Company field** (not requested). `/[...slug]` staticness untouched (two plain string fields on the already-cached landing read; `landingSlug` is a prop into the existing client component).

**Remaining (content, not code):** after Patrick signs off on the city×product combos, produce the top 10 priority pages with the generator (by-city: Sylva, Asheville, Waynesville, Bryson City, Franklin NC; Fort Walton Beach, Destin, Navarre, Crestview, Miramar Beach FL; by-topic: screen printed t-shirts, company uniforms, etc.), checking each is genuinely unique.

---

### [x] /videos client-side pagination (Load more) — DONE 2026-07-07

The videos library is growing, so the `/videos` index no longer renders every card at once. **Client-side pagination in [components/videos/VideosBrowser.tsx](components/videos/VideosBrowser.tsx) only** (the M5-507 render-all was fine for a small set): a `PAGE_SIZE = 24` cap (`visibleCount` state) renders `filtered.slice(0, visibleCount)`, a **"Load more"** button (outlined, brand-styled) reveals the next 24 until all are shown (then hides), and a "Showing X of Y videos" indicator sits under the grid. Selecting a category chip resets `visibleCount` to 24 so the newly filtered set starts from its first page; pagination slices the FILTERED list, so Load more works within a category. Empty states unchanged (no-videos message + no-videos-in-category message; no button rendered). Deliberately NOT a `/videos/page/N` route: cards are small metadata (the full list still ships — only the rendered count is capped), every `/videos/<slug>` is already in the sitemap for discovery, and server pagination would fight the client-side category filter.

**Conscious no-ops:** [app/videos/page.tsx](app/videos/page.tsx) unchanged (still `force-static` + 1h ISR, still fetches all via `getAllVideos()` and passes down — no `searchParams`, no new route, `/videos` stays static). No Sanity schema/Studio change → no guide update; no webhook Filter/Projection change; no new cache tag; no sitemap change; no new env var. Pure client-component render capping; `/cat` untouched.

---

## Phase 2A — Custom Product Pages, Form Builder, CTA

### [x] P2-CP-001 (part 1 of 2): Custom product detail pages — type, route, integration — DONE 2026-07-08

Confirmed scope decisions built to exactly: **variants are color-driven** (each color variant carries its own images; clicking a swatch swaps the gallery; **sizes are a listed set only** — no price/image effect), and productPages surface on **New Products + related carousels + search + their own page, NOT inside `/cat`** (no placement/overlay/filter work on category pages).

- **`productPage` document type** ([sanity/schemas/documents/product-page.ts](sanity/schemas/documents/product-page.ts), registered in the schema index) — deliberately SEPARATE from `customProduct` (which stays the link-out card with a required `externalUrl`; productPage has NO external URL). Fieldsets: Basics (title, single-segment slug — slash/uppercase rejected at publish, the `app/[slug]` lesson —, brand), Images & Colors (`colorVariants[]` of `{colorName, swatchHex?, images[≤10 with alt]}` + `defaultImages[]` fallback), Pricing (`pricingTiers[≤5]` of `{minQty, price}` → card low–high derived; `onSale` + `salePercentOff` + `saleExpires`; optional `minQty` else lowest tier), Details (portable-text `description` via the page-builder `portableBody`, `decorationMethods[]`, `sizes[]`, `productionTime`), Filters (material/features/types/madeInUsa/ecoFriendly/closeout — **colors derive from the variants**, no duplicate field; no `badges[]` field — SALE/CLOSEOUT ribbons derive from `onSale`/`closeout`), Related (`relatedCategorySlug` via the searchable `CategorySlugInput`, `relatedKeywords[]`, manual `relatedProducts[]` = blogProduct entries (Geiger SKU / manual) + references to customProduct/productPage), Visibility (`showInNewProducts` default true, shared `seo`). `products` added to `RESERVED_SLUGS` in [lib/reserved-slugs.ts](lib/reserved-slugs.ts) + BOTH schema mirrors (page.ts, landing-page.ts).
- **Normalizers** ([lib/sanity/queries/product-pages.ts](lib/sanity/queries/product-pages.ts)): `productPageToGeigerProduct()` → GeigerProduct with the NEW optional `detailUrl` field (`/products/<slug>`) and synthetic sku **`custom-<_id>`** (same convention as customProduct: never collides with Geiger, ProductCard's Item#-hiding + `augmentAggregator`'s filter-tag injection both line up for free); `productPageAsCustomDoc()` feeds the aggregator's filter injection. All reads non-CDN `cachedClient` + **`PRODUCT_PAGES_TAG`** (`product-pages`) + per-slug `productPage:<slug>` (both through `sanitizeTagValue`).
- **`/products/[slug]` detail page** ([app/products/[slug]/page.tsx](app/products/[slug]/page.tsx)): `generateStaticParams` prebuilds every published slug, **`dynamicParams = true` + `revalidate = false`** — deliberate deviation from the prompt's `dynamicParams=false`: the slug set is runtime-created in Studio (unlike brands' committed JSON), so `false` would 404 every newly-published product until the next deploy; `true` gives on-demand SSG for new slugs (the /services pattern) while everything known at build is still prebuilt static. Renders: breadcrumbs (BreadcrumbList via the shared component), H1 + Sale badge, **color-variant gallery** ([components/products/ProductPageGallery.tsx](components/products/ProductPageGallery.tsx) — client component whose INITIAL render (first color, first image) is what the server prerenders, so the first color's `<img>` tags are in the static HTML; swatch-swap/hover-zoom/lightbox are post-hydration state; **no `useSearchParams`/URL reads anywhere in the render path**), QTY/PRICE tier table, sizes chips, decoration/production/min-qty rows, PortableText description (`pagePortableComponents`), **Get a Quote stand-in** ([components/products/GetQuoteButton.tsx](components/products/GetQuoteButton.tsx) — lazy `LeadFormModal` like EmptyStateCTAButton, marked for the part-2 swap), related carousel, `CustomSchemaJsonLd`, CTABanner. **Product JSON-LD**: name/image/description/brand + `AggregateOffer` (USD low/high from the real tiers, offerCount) — no fabricated availability/ratings/reviews. `generateMetadata`: seo overrides, else title + word-clamped plain description; self-canonical; `socialMeta` with first image at 1200px.
- **ProductCard internal-link branch** ([components/category/ProductCard.tsx](components/category/ProductCard.tsx)): when `product.detailUrl` is set the card is a same-tab `next/link` (no `sponsored` rel); products WITHOUT it (all Geiger + customProduct) keep the exact prior affiliate `<a target=_blank rel="noopener noreferrer sponsored">` markup — backward compatible everywhere the card renders.
- **New Products**: `getAugmentedNewProductsData` accepts `productPageDocs` (normalized cards prepended FIRST — before custom products/pins/scrape — with filter tags injected via the CustomProductDoc-shaped view); [app/new-products/page.tsx](app/new-products/page.tsx) fetches `getProductPagesForNewProducts()` (tagged read, page stays ISR). Home "New & Trending" rail deliberately unchanged (sync scraped-only read — conscious no-op).
- **Search**: productPages join the LIVE delta only ([lib/search/sanity-index.ts](lib/search/sanity-index.ts)) as `product`-type entries with the new `SearchItem.internal` flag; `resultTarget` routes `internal` products to `/products/<slug>` (same tab, prefetchable) instead of the affiliate host (`affiliateUrl` would wrongly host-prefix the relative path). Static prebuilt `search-index.json` untouched. The server-side `/search` faceted page (Geiger-catalog Fuse) does NOT include productPages — conscious no-op; the header overlay covers them.
- **Related matcher**: `matchRelatedProducts` gained opt-in `includeProductPages` (default FALSE — AI-generation strips persist SKU-only blogProduct entries that can't resolve a synthetic `custom-<id>` SKU at render; only live-object consumers like the detail carousel enable it). The detail page's auto top-up passes `includeCustom: false` because `getAllCustomProducts()` is an untagged no-store read that would flip the route dynamic — manual customProduct references still render (they ride the page's own tagged GROQ deref).
- **Freshness/webhook**: `productPage` case in [app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts) busts `PRODUCT_PAGES_TAG` + `productPage:<slug>` + revalidates `/products/<slug>`, `/new-products`, the live search delta route, and `/sitemap.xml`. (The search-delta revalidate IS needed — the route is ISR-cached, not dynamic.) **⚠️ MANUAL step: add `productPage` to the Sanity webhook Filter on staging now + production at promotion** (Projection unchanged — `slug` already projected); exact Filter string in [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md).
- **Sitemap**: all `/products/<slug>` URLs (indexable, priority 0.6) each with the first image as an image entry; `productPages:` count added to the `[sitemap]` build log.
- **Docs**: guide section 22 "Product Pages" (+ TOC, connects-map bullet, common-tasks row; later sections renumbered 23/24/25), webhook doc, CLAUDE.md (Section 4 route, Section 7 type, Section 23 entry).
- **Conscious no-ops / deferred**: no Studio AI action for productPage; no home-rail inclusion; no `/search` faceted-page inclusion; no Category facet bucket for productPages on /new-products (they have no `category_paths`); optional video field on the detail page deferred (the page-builder `videoEmbed` pattern can be added when Patrick asks); prebuild-all is fine while the set is small — if productPages ever reach hundreds, revisit the static-path budget note.
- **Review-pass fixes (same change, pre-stage):** (1) the `relatedProducts` GROQ deref condition keys on `defined(_ref)` — the reference array member is NAMED (`relatedProductRef`) and Sanity stores a named member's `_type` as the member name, NOT `'reference'`, so the original `_type == 'reference'` condition would have silently never dereferenced manual refs; (2) search-thumbnail + sitemap image selection now go through `productPageFirstImage()` (scan all variants, skip asset-less stubs) instead of a `coalesce(variant[0].images[0], …)` that missed images the card/gallery/og:image found; (3) the webhook's `customProduct` branch ALSO busts `PRODUCT_PAGES_TAG` — a customProduct referenced in a productPage's related list is dereferenced inside the productPage-tagged read, so editing/deleting it must refresh `/products/<slug>` (which has `revalidate=false`). Known pre-existing gap (NOT introduced here, verified): live-delta `product` entries (customProduct before, productPage now) show in the header overlay but not on the server-rendered `/search` faceted page (Geiger-catalog Fuse only).
- `pnpm typecheck` clean. NOT committed — staged for review. Raw-HTML gate (H1 + product `<img>` + Product JSON-LD in curl output, no BAILOUT template) must be verified on the Vercel deploy per the manual test steps.

### [x] P2-CP-001 (part 1 review completion): the 3 remaining adversarial dimensions — DONE 2026-07-08

The part-1 review had completed only 3 of 6 dimensions (the rest died at a usage limit). The 3 missing ones were re-run properly over the staged diff:

- **Static-render / prerender safety: NO FINDINGS.** Full render-tree trace attested: every Sanity read in the `/products/[slug]` path is a tagged `cachedClient` fetch; the one dangerous read (`getAllCustomProducts()`, untagged no-store) is verifiably gated off by `includeCustom: false`; no `searchParams`/`cookies()`/`headers()`/render-time URL reads anywhere (gallery initial state is constant → first color's `<img>` in the prerendered HTML; the modal island is `ssr:false` + effects-only); `/new-products` stays ISR; `/cat` provably isolated (no `/cat` module imports any new module; `NewProductsPageBody`'s `lib/new-products` import is type-only). Prior customProduct→`PRODUCT_PAGES_TAG` webhook fix RE-CONFIRMED with every productPage read surface carrying the tag.
- **ProductCard call-site regression: no regressions** across all 13 consumers (diff-compared: non-detailUrl branch byte-identical — href/target/rel/className/inner markup; only /new-products + the /products carousel can carry `detailUrl`; React keys collision-free; `internal` search flag survives JSON/merge/Fuse). One finding **dismissed as the pre-existing `/search` architecture gap** (live-delta `product` entries — customProduct then, productPage now — show in the overlay but not on the server-rendered `/search` faceted page; explicitly out of scope).
- **Page edge cases: 3 minor findings, all confirmed + FIXED** (prior `defined(_ref)` + `productPageFirstImage` fixes RE-CONFIRMED; all 13 scenario groups otherwise attested): (1) a manual related entry whose SKU didn't resolve and that has no URL used to render a card linking to the bare affiliate homepage via `affiliateUrl(null)` — such target-less entries are now SKIPPED (every card in the carousel must link somewhere); (2) the card price range / price line / JSON-LD offers derived from a different tier set than the visible table (uncapped, no minQty check) — new single source of truth `productPageValidTiers()` (minQty>0 + price>0, sorted, capped 5) now drives the table, `productPagePriceRange`, `productPageMinQty`, and the AggregateOffer; (3) two tiers sharing a `minQty` produced duplicate React keys — tier columns now key by index.

### [x] P2-CP-001 (part 2 of 2) / P2-CP-002: dedicated Get a Quote form + lead system — DONE 2026-07-08

Replaces the part-1 LeadForm stand-in on `/products/<slug>` with a dedicated product-quote form, reusing the landing-page lead system (per-slug recipient resolved server-side + customer confirmation + lead record). Required: First/Last/**Company**/Email/Phone/Quantity/Date; optional: Shipping Zip, Comments, artwork upload (same 3-file/10MB validation); Turnstile + honeypot + rate limit unchanged.

- **`productPage.leadRecipient`** (Visibility & SEO fieldset, `initialValue: patrick@perfectimprints.com`, email-validated — mirrors `landingPage.leadRecipient`). Resolved by the new `getProductLeadInfo(slug)` in [lib/sanity/queries/product-pages.ts](lib/sanity/queries/product-pages.ts) (tagged `PRODUCT_PAGES_TAG` + `productPage:<slug>`, so a Studio edit re-routes within seconds of the webhook).
- **Form**: `LeadForm` gained `variant="productQuote"` + `productSlug`/`productTitle` props ([components/forms/LeadForm.tsx](components/forms/LeadForm.tsx)) — adds the Company\* + Shipping Zip row and the Comments textarea, drops the "looking for" textarea (the product IS the subject), relabels the button "Request My Quote" and the success copy; **every change is gated on the variant, so the default form used by the category CTA / contact / landing / blog / search-empty renders byte-identically** (checked: heading/subheading on `LeadFormModal` are new optional props whose defaults are the exact prior strings). [GetQuoteButton](components/products/GetQuoteButton.tsx) opens it with the product context; the modal stays a lazy `ssr:false` client island, so `/products/<slug>` staticness is untouched.
- **Route** ([app/api/leads/route.ts](app/api/leads/route.ts)): optional `productSlug` accepted (client sends ONLY the slug — the recipient AND the product title are resolved server-side from the productPage doc, so a spoofed hidden field can't redirect leads or lie about the product; same abuse guard as landing, sharing `resolveLandingLeadRouting` since the lookup shapes are structurally identical; landing wins if both slugs are somehow present; unknown slug degrades to default behavior). Validation per variant: `lookingFor` required only for non-quote submissions, `company` required only for quotes. Lead email gets a product subject (`Product Quote Request: <title> — <name>`) + Company/Product/Shipping zip/Comments rows (empty rows skipped — non-quote emails byte-identical); customer confirmation reuses `sendCustomerConfirmationEmail` with the quote extras (landing confirmations unchanged — verified by the offline harness, 77/77 passing); `leadSubmission` records `company`/`shippingZip`/`comments`/`productTitle`/`productSlug` + the resolved `recipient`.
- **`leadSubmission` schema**: additive read-only fields (company, shippingZip, comments, productTitle, productSlug); existing records unaffected.
- **Conscious no-ops**: no webhook Filter/Projection change (`productPage` already in the Filter from part 1; `leadRecipient` rides the existing tagged read), no new cache tag, no new env var (Gmail SMTP + Turnstile reused), non-product forms untouched, no representative-SKU hidden field (a productPage has no Geiger catalog SKU; the server-resolved title + slug identify the product).
- `pnpm typecheck` clean; `pnpm verify:blog-engine` 77/77. Staged, not committed.

### [x] P2-CP-002: Get a Quote form + lead system — DONE 2026-07-08 (shipped together with P2-CP-001 part 2, see the entry above)

- Fields: First Name, Last Name, Company, Email, Phone, Shipping Zip, Quantity Needed, Date Needed, Comments. ✓
- Emails the product's editable `leadRecipient` (default patrick@); automatic confirmation email to the customer showing their submission; saved as a lead record in the CMS. On every product page by default. ✓

### [x] P2-CP AI: "Generate Product Details with AI" on productPage — DONE 2026-07-08

The seventh "Generate … with AI" action, same engine + pattern as blog/video/page/landing (Patrick request — reverses the part-1 "no AI action" conscious no-op). **Editorial fields ONLY — it never generates or edits commercial facts** (pricing tiers, images/color variants, sizes, brand, min qty, production time, lead recipient stay Patrick's; his entered material/colors/sizes are passed IN as context so the copy mentions only real attributes, and the prompt forbids inventing specs).

- **Action** ([sanity/actions/generate-product-with-ai.tsx](sanity/actions/generate-product-with-ai.tsx), registered for `productPage` in [sanity/sanity.config.ts](sanity/sanity.config.ts); disabled until `title` is filled; shared `AiProgressDialog` spinner; no fs import graph). POSTs title + brand + Studio-only `aiTopicKeywords` + the factual attributes → patches the draft: **`description`** (page-shape Portable Text with section H2s IN the body via `buildPageSectionsBody` — `description` is the page-builder `portableBody`, one rich-text field, the landing-page pattern; internal links auto-placed with `placeInternalLinks` in href-only `'page'` link shape), **`seo.metaTitle`/`seo.metaDescription`** (deep-set after `setIfMissing` so an existing `ogImage` survives), and **suggestion fields patched ONLY-IF-EMPTY** — `relatedKeywords`, `relatedCategorySlug` (via `resolveCategoryForKeywords` on the AI's `productType`), `decorationMethods` — Patrick's curation is never overwritten; `aiSuggestedLinks` records placed/not-placed. Description + SEO refresh on every click (that's the button's job). Never auto-publishes.
- **Route** ([app/api/sanity/generate-product/route.ts](app/api/sanity/generate-product/route.ts), `nodejs` + `force-dynamic` like every generate route): brand-voice system prompt scoped to product-details copy (3-5 sections, first heading-less, 250-450 words, standard decoration-method vocabulary), `generateJson` (DeepSeek), thin floor 150 words → clean 502 "click Generate again", meta clamped at word boundaries (60/155), `suggestInternalLinks` (max 3; no productPage link source exists so self-links are impossible — `currentSlug` filter kept as belt-and-suspenders).
- **Schema**: collapsed `ai` fieldset on `productPage` (`aiTopicKeywords` tags + read-only-ish `aiSuggestedLinks`), mirroring the video/page fieldsets. Studio-only fields — no render path, webhook, or projection reads them.
- **Conscious no-ops**: no webhook Filter/Projection change (`ai*` fields are Studio-only; the description rides the existing `PRODUCT_PAGES_TAG` read), no new cache tag, no new env var (server-side `DEEPSEEK_API_KEY` reused), no new engine module (pure reuse of P2-AI-001: `generateJson`, brand voice, `suggestInternalLinks`, `placeInternalLinks`, `buildPageSectionsBody`, `resolveCategoryForKeywords`).
- Guide (Product Pages section + the section-8 cross-reference), CLAUDE.md updated. `pnpm typecheck` clean. Staged, not committed.

### [x] P2-CP configurator: product-page configurator + pre-filled Get a Quote form — DONE 2026-07-08

Makes `/products/<slug>` interactive like the Geiger product page and pre-fills the quote from what the customer configured. Reuses the P2-CP-002 lead backend unchanged (per-product recipient + confirmation + record); adds the configurator UI + the selection data flowing into the lead.

- **Schema:** optional `setupCharge` (number, Pricing fieldset) — one-time flat fee added to the on-page ESTIMATE; projected in `FULL_PROJECTION` (rides `PRODUCT_PAGES_TAG`, no webhook change).
- **Shared estimate math** ([lib/products/quote-estimate.ts](lib/products/quote-estimate.ts), pure + client-safe): `estimateForQuantity` (tier with greatest minQty ≤ qty over the SAME sorted `productPageValidTiers()` list the table renders — highlight and math can't disagree; quantities clamp UP to the floor), `minimumQuantity`, deterministic `formatUsd` (explicit en-US locale so SSR/hydration agree), and `buildSelectionSummary` (the deterministic 1-line "Title — Color, Size, N units, Decoration." summary — NOT AI).
- **Selection state** ([components/products/ProductSelectionContext.tsx](components/products/ProductSelectionContext.tsx)): one client provider owns `{colorName, size, decoration, quantity}` with deterministic defaults (first option each + the minimum order quantity = max(explicit `minQty`, lowest tier)); the page's server content passes through as RSC children, so the H1/price/tier table/imgs stay in the prerendered HTML. [ProductPageGallery](components/products/ProductPageGallery.tsx) became **controlled**: the active color follows the shared selection (swatch click = `setColorName`), image-within-color choice stays local (keyed to its variant so color switches show that color's first image — no effect needed); zoom/thumbnails/lightbox unchanged.
- **Configurator** ([components/products/ProductPurchasePanel.tsx](components/products/ProductPurchasePanel.tsx), client island): the QTY/PRICE table with the ACTIVE tier highlighted, a quantity input floored at the minimum (hint shown, estimate always uses the clamped value), size/decoration selects (fixed text when 0/1 option), the selected color echoed, and the live estimate — `qty × unit price (+ setup charge)` — always labeled **"Estimated total — final pricing confirmed in your quote"** (quote-based business, no checkout, never presented as firm). Replaces the server-rendered tier table/sizes/minQty/decoration rows on the page (they now render inside the island — still in the static HTML via SSR); the server keeps H1, price range, sale badge/expiry, production time, description, JSON-LD.
- **Dedicated quote form** ([components/products/ProductQuoteForm.tsx](components/products/ProductQuoteForm.tsx) + `ProductQuoteModal`, lazy `ssr:false`): pre-filled editable Quantity/Color/Size/Decoration + the recalculating estimate + the auto summary; entered from scratch: **First Name\*/Email\*/Date Needed\*** + optional Last Name/Phone/Company/Shipping Zip/Comments/artwork (this required set applies ONLY here — the route relaxes lastName/phone for the productSlug branch and `company` went required→optional vs P2-CP-002). Turnstile + honeypot + rate limit + the multipart POST reused; client still sends ONLY `productSlug` + selections (recipient + title stay server-resolved). Attachment limits/validation extracted to the shared [components/forms/attachment-limits.ts](components/forms/attachment-limits.ts) (identical values) so LeadForm and this form can't drift.
- **LeadForm variant RETIRED:** the P2-CP-002 `variant="productQuote"` + the modal heading/subheading props were removed — [LeadForm](components/forms/LeadForm.tsx)/[LeadFormModal](components/forms/LeadFormModal.tsx) are back to their pre-quote shape (landingSlug kept); `GetQuoteButton.tsx` deleted. Category-CTA / landing / contact / blog / search-empty forms render byte-identical.
- **Backend:** `/api/leads` accepts `selectedColor`/`selectedSize`/`selectedDecoration`/`estimatedTotal` (length-capped display strings; the estimate is a LABELED estimate, never authoritative money); they flow into Patrick's email (a Configuration block: Product/Color/Size/Decoration + Estimated total rows), the customer confirmation, and new read-only `leadSubmission` fields — all skip-when-empty, so landing/category submissions stay byte-identical (offline harness 77/77 still green). **Deviation from the prompt, deliberate:** no separate `selectedQuantity` field — the configurator quantity IS `quantityNeeded` (sent as it, required-validated, shown as the existing Quantity row) rather than duplicating one number in two fields.
- **Conscious no-ops:** no webhook Filter/Projection change, no new cache tag, no new env var; non-product forms unchanged; `/cat` untouched.
- `pnpm typecheck` clean; `pnpm verify:blog-engine` 77/77. Staged, not committed. Raw-HTML gate to verify on deploy: H1 + product `<img>` + tier table + Product JSON-LD present, no BAILOUT template.

### [x] P2-CP-004 (batch 1 of 3): Product page fixes + related content strips + carton fields + GMC JSON-LD + decoration upcharge — DONE 2026-07-09

Patrick's product-page feedback batch (goodwill). All on `/products/<slug>`, which stays prebuilt/static (client islands over server HTML, no URL reads in render; all new Sanity reads tag-cached).

- **Tier UX:** the active QTY/PRICE tier highlight went light-red → **brand green** (`bg-brand-green/15`), and every tier cell is now a **button** — clicking sets the quantity to that tier's `minQty` via `ProductSelectionContext`, and the estimate recalculates through the SAME `estimateForQuantity` (no second price formula; header cells are the keyboard/AT targets with `aria-pressed`, price cells are redundant `tabIndex=-1` duplicates). Copy under Get a Quote → **"We'll quickly confirm exact pricing and inventory."**
- **Description links — "Open in new tab" toggle:** the page-builder `portableBody` link annotation ([sanity/schemas/objects/page-sections.ts](sanity/schemas/objects/page-sections.ts)) now declares `href` + `openInNewTab` (default false) explicitly, so the Studio link popover shows the switch; [components/page-sections/portable-text.tsx](components/page-sections/portable-text.tsx) renders `target="_blank" rel="noopener noreferrer"` when true. **Shared annotation** — page/landing/productPage bodies all get the toggle (accepted). **AI-placed links default to new tab:** the 'page' link-shape in [lib/ai/place-internal-links.ts](lib/ai/place-internal-links.ts) now emits `{href, openInNewTab: true}` and [lib/portable-text/build-page-body.ts](lib/portable-text/build-page-body.ts) carries the flag into markDefs (manual/plain links stay `{href}`); verifier assertions updated ('richAnswer' stays href-only, 'blog' unchanged).
- **Related Videos + Related Blogs strips** below Related Products: manual `relatedVideos[]`/`relatedBlogs[]` reference fields (Related fieldset) come first, topped up by automatic keyword matches via the new `suggestLinksForKind()` export in [lib/ai/internal-links.ts](lib/ai/internal-links.ts) (same scoring as the AI suggestions; suggestions now also carry `docId`). Card data loads through new **order-preserving, tag-cached by-slug queries** — `getVideoSummariesBySlugs` (VIDEOS_TAG) + `getBlogSummariesBySlugs` (non-CDN `cachedClient` + RELATED_BLOGS_TAG) — so a video/blog publish revalidates the strips (both tags already busted by the webhook; **no webhook change**). Manual refs are projected as slugs only (`relatedVideos[]->slug.current`) so the card data always rides the fresh tag. Renders `VideoCard`/`BlogCard` grids, up to 4 each, nothing when empty. The AI action **pre-fills the auto matches as references only-if-empty** (route returns `relatedVideoIds`/`relatedBlogIds`).
- **Carton / logistics fields** (new collapsed Logistics fieldset): `unitsPerCarton`, `cartonWeight` (lbs), `cartonWidth`/`cartonHeight`/`cartonDepth` (in), `fobZip` + optional `fobCity`/`fobState` (manual — no zip→city dataset). Compact muted lines render under production time, only for set values: "500 units per carton" / "16 × 14 × 10 in / 27 lbs per carton" / "Ships from Memphis, TN 38109".
- **Product JSON-LD (GMC-ready):** carton weight/dims + FOB origin emit as **`offers.shippingDetails` (OfferShippingDetails)** — `weight` (LBR) + `width`/`height`/`depth` (INH) QuantitativeValues + `shippingOrigin` (DefinedRegion, US + state + zip). **Deliberately NOT Product-level weight/width/height/depth** — those describe one unit; our fields are carton (package) facts, and emitting a 27 lb carton as the product weight would be wrong. Only set fields emit; no GTIN/MPN/availability/reviews fabricated. Skipped when there are no offers (shippingDetails hangs off the offer).
- **Decoration per-unit upcharge:** `decorationMethods` went `string[]` → array of `{method, upcharge?}` objects (schema `decorationMethod`; **legacy string entries still render/estimate via the `productPageDecorations()` normalizer** in [lib/sanity/queries/product-pages.ts](lib/sanity/queries/product-pages.ts), but show as invalid items in Studio — re-add to edit; only the bamboo-fan-era docs are affected). Estimate stays single-source: `estimateForQuantity(tiers, qty, setupCharge, decorationUpcharge)` in [lib/products/quote-estimate.ts](lib/products/quote-estimate.ts) → `qty × (unitPrice + upcharge) + setup`, with the new `DecorationOption` type + `decorationUpchargeFor()` helper shared by panel + quote form. Selector labels show "(+$0.50/unit)"; the estimate line adds a "+ $0.50/unit decoration" term; the lead POST annotates `selectedDecoration` as "Pad Print (+$0.50/unit)" so the email/record show both (estimatedTotal already includes it; `/api/leads` unchanged). AI decoration suggestions patch as upcharge-less objects.
- **Conscious no-ops:** no webhook Filter/Projection change (`productPage`/`video`/`blogPost` already covered), no new cache tag, no new env var; `/api/leads` untouched; non-product forms and blog/richAnswer link shapes byte-identical.
- `pnpm typecheck` clean; `pnpm verify:blog-engine` 77/77. Staged, not committed. Raw-HTML gate to verify on deploy: H1 + product `<img>` + Product JSON-LD (with shippingDetails when set) + the strips' `<h2>`s present, no BAILOUT template.

### [x] P2-CP-004 (batch 2 of 3): Search by SKU / item number — DONE 2026-07-09

Patrick's request: site search matches products by item number, in addition to name + brand. Search-only — `/cat`, `/products`, and all render paths untouched; product result routing (affiliate vs internal `detailUrl`) unchanged.

- **`SearchItem.sku?`** added ([lib/search/types.ts](lib/search/types.ts)) — only for products with a REAL user-facing item number; synthetic `custom-<id>` ids are deliberately never indexed (noise).
- **Static bulk** ([scripts/search-index/build-index.ts](scripts/search-index/build-index.ts)): every Geiger product's `sku` (spaces preserved — "501014 90A") added. Rebuilt + verified: all 7,955 product entries carry `sku`; index 4.23 MB raw / **571.2 KB gzipped** (was ~564 KB — ~+7.5 KB gz, ~+122 KB raw; far under the 2 MB warn budget).
- **Live delta:** new optional **`sku` "Item / SKU number" field on `productPage`** (Basics fieldset — productPage had NO real item-number field, and its synthetic id is not user-facing, so a schema field was needed for Patrick's own products to be findable by number; guide updated). Flows through `getProductPageSearchEntries` (rides the existing `PRODUCT_PAGES_TAG` read — **no webhook/tag change**) into [lib/search/sanity-index.ts](lib/search/sanity-index.ts). customProduct entries stay sku-less on purpose.
- **Fuse keys:** `{ name: 'sku', weight: 0.5 }` in both the overlay index ([lib/search/load-index.ts](lib/search/load-index.ts)) and the server `/search` page Fuse ([lib/search/server-search.ts](lib/search/server-search.ts), over `GeigerProduct.sku`). Rationale: numeric queries barely match any title, so exact/partial SKU hits rank top naturally; word queries never hit the key, so name/brand relevance is unaffected. `threshold 0.32` + `ignoreLocation` make partial SKUs ("5296…") and the space-suffixed forms both match.
- **UI:** unchanged — rows still show name/brand/thumbnail (the optional item-number-on-row idea was skipped as clutter; the thumbnail + name confirm the match).
- `pnpm typecheck` clean; index builder run + sample-verified. Staged, not committed. Manual test on deploy: search a Geiger item number (e.g. 501004) and the bamboo fan's number once Patrick fills its new Item/SKU field.

### [x] P2-CP-004 (batch 3 of 3): Attach a Product Page to specific categories — DONE 2026-07-09

Patrick can surface a `productPage` inside chosen `/cat/<slug>` grids through the SAME mechanism his Custom Products use: `categoryOverride.addedProducts` now accepts `productPage` references too. `/cat` stays static — the productPage data rides the EXISTING `cat:<slug>`-tagged `getCategoryOverride` read (no new Sanity read, no `searchParams`, no dynamic flip).

- **Schema:** `addedProducts` `to:` extended to `[customProduct, productPage]` ([sanity/schemas/documents/category-override.ts](sanity/schemas/documents/category-override.ts)); description explains both card behaviors.
- **Projection/normalization:** `getCategoryOverride`'s `addedProducts[]->` now branches by `_type` — customProduct keeps its projection; productPage projects the exported `PRODUCT_PAGE_CARD_FIELDS` fragment (single source with every other productPage card read, no drift). New discriminated union `CategoryOverrideAddedProduct`; `mergeCategoryProducts` routes productPage entries through `productPageToGeigerProduct()` → the card carries `detailUrl` and renders as an internal same-tab `/products/<slug>` link via the existing ProductCard branch (Geiger/customProduct cards keep affiliate, byte-identical). Null derefs + slug-less productPages are dropped (never a broken card). Precedence (forceCTA → replaceProducts → forceProducts) untouched.
- **Filter participation:** `buildAddedAttrOverlay` ([lib/filters.ts](lib/filters.ts)) takes the union — productPage entries contribute colors from `colorVariants[].colorName` + material/features/types (slugified to Geiger's value format) + madeInUsa/ecoFriendly/closeout (boolean only; customProduct keeps its CLOSEOUT-badge honor). Both keyed `custom-<_id>`, matching the normalizers. Runs only in the existing override path over the override doc + memberships JSON — no extra read.
- **Freshness (the correctness risk):** two directions. (a) Override edited → `categoryTag(slug)` already busted by the `categoryOverride` webhook case — the attach/detach shows in seconds, unchanged. (b) **The ATTACHED doc edited** → its data is deref'd inside the `cat:<slug>`-tagged read, which the productPage tags do NOT cover — so the webhook's `productPage` branch now runs `findEmbeddingCategorySlugs()` (uncached `references($id)` GROQ over categoryOverrides; slug-deref fallback `$slug in addedProducts[]->slug.current` when the payload has no `_id`) and busts `categoryTag` + `revalidatePath` for every embedding category. **The same lookup was added to the `customProduct` branch** (an override-attached customProduct edit had this exact staleness gap since M5-504 — flagged + fixed; it needs `_id` since customProduct has no slug). Best-effort try/catch: a failed lookup never blocks the rest of the revalidation.
- **⚠️ Manual webhook step (both environments):** add **`_id`** to the webhook **Projection** (`{_id, _type, slug, …}` — [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md) updated). Until then: productPage edits still bust embedding categories via the slug fallback; attached-customProduct edits do NOT (pre-existing behavior, no regression). Filter unchanged (`categoryOverride`/`productPage`/`customProduct` already listed — `productPage` still needs its P2-CP-001 Filter addition if not done yet).
- `pnpm typecheck` clean. Staged, not committed.
- **Manual test plan (deploy):** (1) add the bamboo fan productPage to a categoryOverride's Added Products, publish → card appears on `/cat/<slug>` linking to `/products/...`, participates in Color/Material filters (replaceProducts mode). (2) Edit the fan's title/price, publish → the category reflects it within seconds (after the `_id` projection update; via slug fallback even before). (3) Raw-HTML gate: `curl -s <deploy>/cat/<slug>` → product `<img>` incl. the attached card + CollectionPage/ItemList JSON-LD, no `BAILOUT_TO_CLIENT_SIDE_RENDERING`; build still shows `/cat/[...slug]` `●` with ~1,840 prebuilt paths. (4) Geiger/customProduct cards still affiliate; untouched categories byte-identical (their overrides don't change, and non-override pages never run this code).

### [x] P2-CP-004 follow-up: migrate legacy string decorationMethods — RUN 2026-07-09

Batch 1 changed `productPage.decorationMethods` to `{method, upcharge}` objects; docs created before that held plain strings (fine on the live page via `productPageDecorations()`, but INVALID/uneditable items in Studio). One-off migration [scripts/migrations/migrate-decoration-methods.ts](scripts/migrations/migrate-decoration-methods.ts) (`pnpm migrate-decoration-methods`, default dry-run / `--apply` writes; requires `SANITY_API_TOKEN` — also for the READ, since the scan covers drafts via `perspective:'raw'`).

- **Phase 1 (diagnose) found:** 2 productPages, both PUBLISHED, no drafts — "Custom BamBams Thundersticks" (1 legacy string) + "Custom Bamboo Folding Fan" (4). **Phase 2 (--apply):** 2/2 patched, 5 strings converted to `{_type:'decorationMethod', _key: dm-<slug>-<i> (stable — no re-run churn), method, upcharge: 0}` — `_type` included (omitting it would re-flag the items invalid). Only `decorationMethods` touched; publish state unchanged; already-object entries kept as-is (+ missing `_key`/`_type` back-filled); exact duplicates dropped; method-less objects would be kept + flagged, never silently dropped (none found).
- **Freshness:** the API patch is a dataset mutation, so the Sanity GROQ webhook fires like a Studio publish (if `productPage` is in the Filter) — AND the script posted signed revalidate calls (same HMAC scheme the route verifies) to production for both slugs (`/products/bb-101-bam`, `/products/custom-bamboo-folding-fan`) → both **200**. Re-run verified idempotent ("nothing to migrate").
- No render-path/schema/webhook-config change; script staged, data migrated. Remaining manual check: open either product in Studio and confirm the decoration rows are editable `{method, upcharge}` objects; set real upcharges where they apply.

### [x] P2-CP-004 (batch 4): Product-side "Add to categories" on the productPage form — DONE 2026-07-09

Patrick attaches a Product Page to categories FROM the product form: new **`productPage.addToCategories`** (own "Show on category pages" fieldset, array of string, the existing multi-select `CategoryPicker` verbatim — debounced search over all 22,180 slugs + live customCategories, inline **"Create new category page"** that makes a `customCategory` and selects it). Distinct from `relatedCategorySlug` (carousel only). The batch-3 category-side `categoryOverride.addedProducts` attach stays as the advanced alternative; **a product attached both ways renders once** (both normalize to sku `custom-<_id>`, de-duped in `mergeCategoryProducts`).

- **Render:** new `getPlacedProductPagesForCategory(slug)` ([lib/sanity/queries/product-placements.ts](lib/sanity/queries/product-placements.ts)) — `$slug in addToCategories` over published productPages, projecting the shared `PRODUCT_PAGE_CARD_FIELDS`, returning `{products (normalized, detailUrl → /products/<slug>), overlayDocs (the batch-3 union shape)}`. Merged via the new `mergeCategoryProducts.placedProductPages` input (after override adds, before Geiger; hides/removes still win) in BOTH [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx) (baked + customCategory paths) and [app/api/category-products/route.ts](app/api/category-products/route.ts). Overlay call sites pass `[...override.addedProducts, ...placedPages.overlayDocs]`, so placed pages join the Color/Material/Brand filters + counts in curated (replaceProducts) mode exactly like batch 3 — on a normal Geiger-backed category the card prepends to the grid and behaves like any added custom product (static facet-URL navigation deliberately unchanged, per the M5-504 SEO guardrail).
- **Static-safety / gating:** the read is non-CDN `cachedClient` + `categoryTag(slug)` + `revalidate:false` (NEVER no-store, deliberately NOT `PRODUCT_PAGES_TAG` — that would re-render every placed category on every unrelated productPage publish), and it runs ONLY for "edited" slugs: the control query ([lib/sanity/queries/owned-categories.ts](lib/sanity/queries/owned-categories.ts)) now also collects `productPage.addToCategories[]` (`pagePlacements`), so untouched categories still make zero per-slug Sanity calls. `/cat` stays `●` static — no `searchParams`, no uncached read.
- **Freshness (both directions):** the webhook `productPage` branch busts `categoryTag` + path for the union of the payload's `addToCategories` (product-side) and the batch-3 `references($id)` lookup (category-side), and busts `CATEGORY_CONTROL_TAG` when placements exist (edited-set membership). **Detach caveat:** a plain `addToCategories` projection carries only the AFTER set, so a detached category would stay stale — the documented fix is upgrading the webhook Projection to the **delta-GROQ before()∪after() unions** (`"addToCategories": array::unique([...coalesce(before().addToCategories, []), ...coalesce(after().addToCategories, [])])`, same for `removeFromCategories` — which also fixes the pre-existing identical `productPlacement` detach gap). ⚠️ Manual, both environments — [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md). Until then: attach + content edits fresh in seconds; a detach goes stale only on the detached category.
- `pnpm typecheck` clean. Staged, not committed.
- **Manual test plan (deploy):** (1) bamboo fan → "Add to categories" → search/pick a category + try Create Category on a new slug → publish → card on `/cat/<slug>` linking to `/products/...`, in the Color/Material filters (replaceProducts category). (2) Edit fan title/price → category updates in seconds; detach the slug → stops showing (after the Projection upgrade). (3) Also attach via `categoryOverride.addedProducts` → still one card. (4) Raw-HTML gate: `curl -s <deploy>/cat/<slug>` → placed card `<img>` + CollectionPage/ItemList JSON-LD, no `BAILOUT`; `/cat/[...slug]` still `●` ~1,840 prebuilt.

### [x] P2-CP-003: Bulk Upload Product Pages (CSV/Excel → draft productPages) — DONE 2026-07-10

Patrick creates/updates up to **50 Product Pages per upload** from a spreadsheet instead of building each by hand: a new top-level Studio **"Bulk Upload" tool** ([sanity/tools/bulk-import-tool.tsx](sanity/tools/bulk-import-tool.tsx), registered in `tools` like Site Refresh) with the flow download-template → upload (.csv or .xlsx) → **dry-run Preview** (per-row CREATE / UPDATE / ERROR + plain-language notes + unknown-column warnings + counts, zero writes) → confirm → **Apply** (batches of 5 rows per request with live progress) → per-row results summary. Everything imports as a **DRAFT** — Patrick reviews/edits normally (incl. Generate Product Details with AI) and publishes himself; publishing fires the existing productPage webhook case, so **no webhook/tag/env change** (drafts have no render surface — stated no-op).

- **Column template** (committed sample: [public/templates/product-pages-template.csv](public/templates/product-pages-template.csv), linked from the panel + guide): exact headings, trim + case-insensitive. **Title is the only required column**; a blank cell = "do not set" (an UPDATE never overwrites an existing value with blank). Single-value columns cover basics/pricing flags/lead recipient/related + Add To Categories (comma-separated slugs)/filter tags/logistics; **multi-value fields use numbered columns** — `Size N`, `Tier N Qty`+`Tier N Price` (both required, else skipped w/ warning, max 5), `Decoration N`(+` Upcharge`), `Image N` (default images), `Color N Name`+`Color N Images` (comma-separated URLs)+optional `Color N Swatch` (hex). Unknown headings are listed as warnings, never silently dropped.
- **Parser** ([lib/bulk-import/parse.ts](lib/bulk-import/parse.ts), PURE — no fs/network/Sanity): SheetJS (`xlsx`, moved devDeps→deps + lockfile) reads both .xlsx and CSV buffers (BOM/quoted commas/in-cell newlines); yes-no + `$`-tolerant number coercion, per-row errors vs warnings, blank-row skipping with real spreadsheet row numbers, in-file duplicate-slug detection, 50-row cap. **Upsert key = slug** (explicit `Slug` column, else slugified Title). 12 vitest tests ([lib/bulk-import/parse.test.ts](lib/bulk-import/parse.test.ts)).
- **Doc builder** ([lib/bulk-import/build-doc.ts](lib/bulk-import/build-doc.ts), pure): parsed row + `imageUrl→assetId` map → schema-exact `productPage` shapes (typed array items with stable `_key`s — `pricingTier`/`decorationMethod`/`productColorVariant`; description via `plainTextToBlocks`; auto alt "Title — Color") so imported docs are valid + editable (no legacy-decoration-style "invalid item").
- **Route** ([app/api/sanity/bulk-import/route.ts](app/api/sanity/bulk-import/route.ts), `nodejs`+`force-dynamic`, `maxDuration 300`, 4 MB file cap): `preview` = parse + slug-existence GROQ (raw perspective, drafts + published) + category-slug validation (baked `category-urls.json` + live customCategory slugs; **unknown slugs warn, never auto-create**); `apply` = fetch each image URL (20s timeout, 10 MB cap, image content-type check, **SSRF guard** blocking localhost/private ranges) → `client.assets.upload` (content-hash deduped + per-batch URL cache) → create `drafts.productPage-<slug>` or patch the existing draft (published-only doc → draft copied from published first, so only imported columns change). Best-effort: a failed image drops that image (warning), a failed row fails alone.
- **Auth:** the proven Site Refresh cookie-session nonce scheme, factored into the shared [lib/sanity/studio-nonce-auth.ts](lib/sanity/studio-nonce-auth.ts) (`verifyStudioNonce` + `serverSanityClient`) with its OWN doc `drafts.bulkImportAuth` + `x-import-nonce` header (two panels can't clobber each other; workflows route untouched). Write token stays server-only; cross-origin 403; no-nonce 401.
- **Guide:** new section 23 "Bulk Upload Product Pages" in `perfect-imprints-sanity-guide.html` (flow + full column reference + numbered-pattern explainer + no-duplicates/images-downloaded callouts), TOC + Common-Tasks entries, later sections renumbered 24–26.
- **Verified:** `pnpm typecheck` clean; 19/19 vitest. **Live E2E against the real route + Sanity (dev server, drafts only, then deleted):** no-nonce 401 → preview plan correct (3 create/1 error, unknown column + unknown category slug + missing-Title all flagged) → batched apply created 3 drafts with uploaded image assets/tiers/colors/swatch/alt/decoration-upcharge/2-paragraph description, blank cells absent → re-upload with edited price previewed **3 UPDATE / 0 CREATE**, patched in place, still exactly 3 docs → all test drafts + assets deleted (0 remaining). Panel UI itself needs a browser login — same requests as the E2E, handshake byte-identical to Site Refresh.
- **Leniency pass (2026-07-10, after Ali's real-file test):** (1) unreadable values in OPTIONAL number columns (Min Qty / Setup Charge / Sale Percent Off / Production Time / carton fields) are now **warnings + left unset** instead of row-blocking errors (matching the yes/no columns' severity), and a cell that STARTS with a number is read as that number with a note — `"7 working days"` → 7 days; (2) a row with more filled cells than the file has headings (the unquoted-comma column-shift case, e.g. commas inside an unquoted Description) gets **one clear "wrap that cell in double quotes" error** instead of a cascade of misaligned-value noise (SheetJS pads all rows to the sheet width, so the check compares against the last NON-EMPTY heading). 14 vitest tests; verified Ali's exact 4-product file now previews as 4 CREATEs with only read-as-N-days notes.
- Staged, not committed. Remaining nice-to-have (explicitly out of this pass): Google-Sheet-link input (Patrick exports to CSV/XLSX instead).

### [x] P2-FB-001: Reusable form builder + lead records — DONE 2026-07-11

Patrick builds ANY form himself in Studio — a new **`form`** document type ([sanity/schemas/documents/form.ts](sanity/schemas/documents/form.ts)): `title`, `slug` (the form's stable id), `recipientEmail` (email-validated, default patrick@ — **server-side only**, never in page HTML), `sendCustomerConfirmation` (default true), `intro`, `fields[]` (label + fieldType — shortText/longText/email/phone/number/date/dropdown/checkbox/checkboxGroup/fileUpload — options for dropdown/checkboxGroup w/ min-1 validation, required, placeholder), `submitButtonLabel`, `successMessage`. Rendered by ONE generic client island [components/forms/FormRenderer.tsx](components/forms/FormRenderer.tsx) (+ [FormModal.tsx](components/forms/FormModal.tsx) mirroring LeadFormModal, + [FormModalButton.tsx](components/forms/FormModalButton.tsx) — modal lazy `ssr:false`, the EmptyStateCTAButton pattern). No hardcoded field set — Company/First/Email/etc. are just fields.

- **One lead pipeline, generalized (not forked):** a hidden `formSlug` in the POST branches [app/api/leads/route.ts](app/api/leads/route.ts) into `handleBuilderFormSubmission()` — the form definition (fields, required flags, recipient, confirmation toggle) is **re-resolved from Sanity server-side** (`getFormBySlug`, [lib/sanity/queries/forms.ts](lib/sanity/queries/forms.ts)), required/type/option validation re-runs server-side against it via the pure shared [lib/forms/form-def.ts](lib/forms/form-def.ts) (`fieldName`/`validateAnswers`/`extractContactFields`/`buildAnswerRows` — imported by BOTH the client renderer and the route so the generated input names + rules can never drift), files across all fileUpload fields re-validate under the shared attachment limits, and honeypot + 5/IP/hr rate limit + Turnstile all run exactly like the fixed path. **The client never sends a recipient** (no open relay — same guard as landing/product-quote); every pre-existing form (contact, category CTA, landing, product quote, blog, search-empty) never sends `formSlug`, so the fixed path is byte-identical.
- **Emails:** pure builders in [lib/leads/form-lead.ts](lib/leads/form-lead.ts) (mirrors landing-lead.ts — offline-verifiable): `buildFormLeadEmail` (subject = **form title**: sender; label:value block of all non-empty answers, files attached) + `buildFormConfirmationEmail` (customer copy, sent when the form enables it AND an email field was answered; non-fatal) + `resolveFormLeadRouting`; transport via the new generic `sendBuiltEmail` in [lib/email/gmail-smtp.ts](lib/email/gmail-smtp.ts) (additive — existing senders untouched).
- **Lead records (Part D):** `leadSubmission` gains `formTitle`, `formSlug`, and `answers[]` (`{label, value}` in field order); core name/email/phone/company columns filled by label/type heuristics so the Studio list stays scannable; `recipient` + `attachments` reused. All existing fields/records backward-compatible.
- **Freshness:** new `FORMS_TAG` + `formTag(slug)` in [lib/sanity/cache-tags.ts](lib/sanity/cache-tags.ts) (through `sanitizeTagValue`); all form reads non-CDN `cachedClient` + tagged + `revalidate:false` (never no-store — embedding pages stay static). Webhook `form` case busts both tags + revalidates the four `/services/<slug>` paths; tag invalidation refreshes any OTHER page embedding the form. **⚠️ `form` must be manually ADDED to the Sanity webhook Filter on staging + production** ([docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md) updated with the new Filter string + callout).
- **Static-safety:** the form definition is resolved in async server components (CtaBlock/HeroBanner) via the tagged read and passed as props to the client island; FormRenderer reads no `searchParams`/URL during render (sourceUrl captured post-mount). `/services/<slug>` and every embedding page stay `●` static.
- `pnpm typecheck` clean; offline harness (`pnpm verify:blog-engine`) still green. Staged, not committed.

### [x] P2-FB-002: Four service forms — DONE 2026-07-11

Four `form` docs seeded as **DRAFTS** (`pnpm seed-service-forms` → [scripts/seed/seed-service-forms.ts](scripts/seed/seed-service-forms.ts); skips any already-PUBLISHED form, never clobbers) with Patrick's exact fields: **Kitting** (`kitting-quote`), **Company Stores** (`company-stores-quote` — incl. the yes/no current-store checkbox), **100% Custom Products** (`custom-products-quote` — incl. the photo/sketch fileUpload), **Pop-Up Stores** (`popup-stores-quote` — incl. the ship-to-individuals vs bulk dropdown). Common block on all four: Company Name/First Name/Phone/Email required, Last Name optional; all email patrick@perfectimprints.com + send the customer confirmation; button label "Request a Quote".

- **Button wiring:** new optional `formSlug` on ctaBlock buttons + `ctaFormSlug` on heroBanner ([sanity/schemas/objects/page-sections.ts](sanity/schemas/objects/page-sections.ts)); [components/page-sections/CtaBlock.tsx](components/page-sections/CtaBlock.tsx) + [HeroBanner.tsx](components/page-sections/HeroBanner.tsx) are now async server components that resolve the form (tag-cached) and render `FormModalButton` — an unresolved/unpublished form slug **falls back to the button's link** (`/contact`), so the CTA never dead-ends. The seed script also PATCHES the four live service `page` docs (published + drafts): every ctaBlock button labeled "Request a Quote" gets its service's `formSlug` (idempotent — already-wired buttons untouched); `seed-service-pages.ts`'s `QUOTE_CTA` became per-service `quoteCta(formSlug)` so future re-seeds carry it.
- **Run order (manual):** `pnpm seed-service-forms` → review + PUBLISH each form in Studio → buttons flip from the /contact link to the popup form (webhook Filter addition required for edit freshness, see P2-FB-001).
- **Manual test plan (staging):** (1) `/services/kitting` → Request a Quote → Kitting form with exactly its fields → submit → lead email to patrick@ with all answers, customer confirmation, leadSubmission with answers[] + formTitle; repeat on 100% Custom incl. the file upload. (2) Edit the Kitting form in Studio (add a field / change recipient) → live form reflects in seconds (needs the `form` Filter entry). (3) Build a brand-new test form + wire it to any page button → renders + submits via the same renderer. (4) Contact / product-quote / landing forms byte-identical. (5) Build output: `/services/[slug]` still `●` static, no CSR bailout.

### [x] P2-STRIP-001: Product Pages + Custom Products in every product strip — DONE 2026-07-11 (goodwill / no charge)

Patrick feedback: the product strips (blog body `blogProducts`, page-builder `productStrip`, `landingPage.relatedProducts`, `video.relatedProducts`) only took a Geiger SKU / manual card — he couldn't add his own Product Pages or Custom Products, even though `productPage.relatedProducts` already accepted those references (P2-CP-001). Now all four strips accept them.

- **Schema:** the four strip arrays share ONE `of` definition — `productStripEntryMembers` in [sanity/schemas/objects/blog-products.ts](sanity/schemas/objects/blog-products.ts) (`blogProduct` + the NAMED `relatedProductRef` reference to `customProduct`/`productPage`, same member name as productPage's own carousel) — so the strips can never drift. Existing SKU/manual entries untouched.
- **Projections:** the shared `STRIP_PRODUCT_ENTRIES_PROJECTION` ([lib/sanity/strip-product-entries.ts](lib/sanity/strip-product-entries.ts) — a PURE module: types + fragment + `isStripRefEntry`, no server-only poison) derefs refs in place inside each surface's EXISTING read (blog `body[]` re-projection, pages `sections[]` productStrip conditional, landing + video `relatedProducts[]`). Keys on `defined(_ref)`, NOT `_type == 'reference'` (the P2-CP-001 named-member gotcha); deliberately does NOT project `sku` off a productPage so the pages' SKU-collection passes never mistake a ref for a SKU entry. No new fetch, no `no-store` — all four routes stay SSG.
- **Renderers:** [BlogBody](components/blog/BlogBody.tsx), [ProductStrip](components/page-sections/ProductStrip.tsx), [VideoRelatedProducts](components/videos/VideoRelatedProducts.tsx) route ref entries through `stripRefToGeigerProduct()` ([lib/sanity/queries/strip-entries.ts](lib/sanity/queries/strip-entries.ts), server-only) → the shared ProductCard: productPage = INTERNAL `/products/<slug>` card (`detailUrl`, same tab), customProduct = affiliate/external card. Dangling refs (null), a productPage missing its slug, or a customProduct missing its externalUrl are DROPPED (never a broken card / bare-affiliate-homepage link); refs de-dup by synthetic sku within a strip; SKU/manual entries render byte-identically. Landing rides ProductStrip unchanged.
- **Freshness:** the ref data lives inside the EMBEDDER's read (blog CDN read / `page:<slug>` / `landing:<slug>` / `videos` tag), which a productPage/customProduct edit didn't bust — the webhook's `productPage` + `customProduct` branches now also run `findEmbeddingContentDocs()` (`references($id)` over blogPost/page/landingPage/video, slug-deref fallback for productPage) and per-type bust: blogPost → `/blog/<slug>` path; video → `videos` tag + paths; landing → `landing:<slug>` + `/<slug>`; page → `page:<slug>` + both candidate paths. Category-side busting (P2-CP-004) untouched. Mapping documented in [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md); no Filter/Projection change beyond the already-recommended `_id`.
- **AI unchanged:** generation still pre-fills SKU entries only; including productPages in AI matching noted as a possible follow-up, not done.
- Guide updated in all five places (blog body, blog AI, page-builder Product Strip table + AI page, video, landing, productPage "where it shows up"). `pnpm typecheck` clean, `verify:blog-engine` 77/77, vitest 21/21.

### [x] P2-FIX: AI-generated customCategory FAQs invalid in Studio (string vs richAnswer) — FIXED + MIGRATED 2026-07-12

Patrick report: every "Generate with AI" category showed "Invalid property value" on all 5 FAQs (Studio: "must be of type richAnswer … current value (string)"). Root cause: `customCategory.faqs[].a` became rich text in M5-516/Task B, but the M5-505 Studio action still patched DeepSeek's plain-string answer verbatim. Live pages were unaffected (`<RichAnswer>` tolerates both shapes) — only Studio validity/editability broke.

- **Audit (all FAQ writers):** Generate-with-AI action → customCategory `richAnswer` = **MISMATCH (the bug)**; push-category route → already converts via `plainTextToBlocks` = match; `fill-faq-answers.ts` seed → `faq.answer` richAnswer as string = **stale mismatch** (would also crash re-run on `.trim()` of migrated arrays); generate-page `faqAccordion.items[].answer` + generate-landing `faqs[].answer` are plain `text` fields by schema = correct as-is (left alone); generate-video already uses `buildRichAnswerBody`; curatedCategory FAQs are references = N/A.
- **Fix 1:** [sanity/actions/generate-with-ai.tsx](sanity/actions/generate-with-ai.tsx) converts each answer with `plainTextToBlocks(f.a)` (the proven same-field converter from the push route / Task B migration — richAnswer-legal `normal` blocks, splits multi-paragraph answers) before patching. Same copy, new shape. Route response unchanged (transport stays strings).
- **Fix 2:** [scripts/seed/fill-faq-answers.ts](scripts/seed/fill-faq-answers.ts) re-run-safe: existing-answer check via `portableTextToPlain` (tolerates both shapes), all writes converted to blocks, existing PT answers passed through untouched.
- **Migration RUN (2026-07-12, not committed as data):** re-ran the idempotent `scripts/migrations/migrate-richtext-answers.ts` — dry-run diagnosed **24 string FAQ items across 5 customCategory docs** (published: Custom Metal Coffee Mugs, Custom Matches; drafts: Bulk Trade Show, Custom Wooden Ornaments, + the Mugs draft); `faq.answer` 0/74 and `video.description` 0/49 already clean. Live run converted all 24 (published + drafts, `_key`s/order preserved, only `faqs` touched); re-run dry-run confirms 0 remaining.
- **Freshness:** rendered text is identical either way (same plain text through `<RichAnswer>` + `portableTextToPlain`), and Sanity GROQ webhooks fire on API mutations too, so the published-doc patches triggered the normal `cat:<slug>` revalidation. Verified live `/cat/matches`: FAQs render, single FAQPage JSON-LD with full answer text.
- Conscious no-ops: no schema change, no new doc type → no webhook Filter/Projection change, no new cache tag/env. `pnpm typecheck` clean, `verify:blog-engine` 77/77.

### [x] P2-CTA-001: CTA bar on product-bearing category/facet pages — DONE 2026-07-12

- On all category and facet pages that show products (including deeper facet pages), placed directly below the products and above the FAQs.
- Copy: "Not finding the exact [CATEGORY NAME] you're looking for? We have other options. Contact us and we'll search through our database of over 1,000,000 promotional items." Category name inserted automatically; wording editable by Patrick.
- Button opens the existing "Find Products for Me" form (same handling as the no-product pages).

**Shipped:**

- **Editable wording:** new `globalSettings.categoryCtaBar` object (`enabled` kill switch + `heading`/`body`/`buttonLabel`), Patrick's confirmed copy as both schema `initialValue`s AND **code-level defaults** in [lib/sanity/queries/global-settings.ts](lib/sanity/queries/global-settings.ts) (`CATEGORY_CTA_BAR_DEFAULTS`) — the singleton already exists in production, and `initialValue` never retro-fills an existing doc, so without code defaults the bar would render nothing until typed in. Blank field → default copy; hiding is the `enabled` toggle's job (deliberate deviation from "blank hides" — blank on the live doc is the launch state and MUST render Patrick's copy). `{category}` token in heading/body is replaced with the category name at render (`/\{category\}/g`); token removed → copy renders without it. Documented in field descriptions + guide.
- **Component:** [components/category/CategoryCtaBar.tsx](components/category/CategoryCtaBar.tsx) — async SERVER component (copy is in the static HTML), slim bordered bar (text left, button right on desktop; visually distinct from both `EmptyStateCTA` and `CTABanner`). Button = the existing [EmptyStateCTAButton](components/category/EmptyStateCTAButton.tsx) with a new optional `label` prop (default keeps the old text — the empty-state block renders byte-identically), so it opens the same lazy `ssr:false` `LeadFormModal` with `categoryTitle` + `sourceUrl` → identical lead flow (email + `leadSubmission`). Renders nothing when `enabled` is false.
- **Placement:** baked route [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx) — after `<CategoryShell>`, before FAQs, gated `!showCTA && sidebar` (exact negation of the EmptyStateCTA branch → a CTA-mode page NEVER gets a second CTA); [components/category/CustomCategoryView.tsx](components/category/CustomCategoryView.tsx) — directly after the ProductGrid container, gated `products.length > 0`. Facet/filter pages are the same route → automatic. After client-side filtering empties the grid the bar stays — correct ("not finding it? contact us"). Renders on all paginated pages too (they show products).
- **Freshness + ZERO extra cost:** the read is `getSiteSettings()` — already React-`cache()`d per request and performed by the layout `<Footer>` in the SAME render, so the bar adds **no additional Sanity fetch to any page** and cannot flip `/cat` off static (non-CDN `cachedClient`, `SETTINGS_TAG`, `revalidate:false`, no searchParams/hooks). Webhook: existing `globalSettings` case (`revalidateTag(SETTINGS_TAG,'max')` + `revalidatePath('/','layout')`) covers it — **no webhook Filter/Projection change (conscious no-op, confirmed in code)**.
- **Blast radius (flagged as required):** publishing ANY `globalSettings` edit invalidates every cached page site-wide, including all ~22k `/cat` pages — but this was **already true before this task**: every page's cache entry carries `SETTINGS_TAG` via the layout Footer's `getSiteSettings()` read, and the webhook additionally calls `revalidatePath('/','layout')`. The CTA bar adds zero NEW blast radius, which is also why a dedicated cache tag for the CTA copy was evaluated and rejected: the pages would still be invalidated through `SETTINGS_TAG`/the layout revalidate on the same publish, so a separate tag buys nothing. Pages regenerate lazily on next request (on-demand SSG) — acceptable, Patrick edits globalSettings rarely; the cost profile of a globalSettings publish is unchanged.
- **Prerender-risk gate (MUST verify on deploy — typecheck/`●` can't prove it):** curl the deployed `/cat/water-bottles` raw HTML → contains the CTA bar copy + H1 + product `<img>` + ItemList JSON-LD, NO `BAILOUT_TO_CLIENT_SIDE_RENDERING`; `/cat/belt-buckles` (CTA-mode) shows ONLY the EmptyStateCTA; route table `/cat/[...slug]` still `●` with unchanged prebuilt count.
- Conscious no-ops: no new cache tag, no new env var, no webhook change, no `/api/leads` change. Guide (Global Settings section + connects list + quick-reference table) updated. `pnpm typecheck` clean.

### [x] P2-CTA-001 extension: CTA bar on video pages (generic wording) — DONE 2026-07-12 (goodwill / no charge)

Patrick request: video pages show a related-products strip but no lead CTA. Heading verbatim from Patrick: **"Need help choosing the right Promotional Products? We're here."**

- **Pre-build check (required by the prompt):** `/videos/[slug]` does NOT render `<CTABanner>` — the page previously had **no CTA at all** (breadcrumbs → H1 → embed → description → products strip → related videos → end). So no near-duplicate-heading conflict with CTABanner's "Need help choosing the right {title}? We're here." — that banner appears only on category pages, which use the `{category}` bar higher up. **Video page CTAs after this change, top to bottom: the new bar only.**
- **Settings:** new `globalSettings.videoCtaBar` (enabled/heading/body/buttonLabel) directly under `categoryCtaBar` in Studio, clearly labelled. Defaults (schema `initialValue` + code `VIDEO_CTA_BAR_DEFAULTS` in [lib/sanity/queries/global-settings.ts](lib/sanity/queries/global-settings.ts) — same existing-singleton rationale as the category bar): Patrick's heading verbatim; body trimmed to "Contact us and we'll search through our database of over 1,000,000 promotional items." (the category body's "We have other options…" opener reads wrong after "Need help choosing…" — editable); button "Find Products for Me". Both bars resolve through one `resolveCtaBar()` helper.
- **ONE shared component, no fork:** [components/category/CategoryCtaBar.tsx](components/category/CategoryCtaBar.tsx) gained `variant: 'category' | 'video'` (selects which settings copy) and `inline` (bare bar without the page `<Container>`, self-carrying `mt-10`, for the video article's max-w-4xl column — a disabled bar leaves no spacing artifact). No `{category}` on video pages: if the token is typed into the video copy anyway it substitutes a generic "promotional products", never a raw token. Category call sites unchanged (default variant/wrapper → byte-identical render).
- **Placement:** [app/videos/[slug]/page.tsx](app/videos/[slug]/page.tsx) — below the `VideoRelatedProducts` strip (the page's "products", mirroring the category grid placement), ABOVE Related Videos (the ask belongs with the products, and above the exit-navigation grid it's seen before the visitor clicks away). Deliberately rendered even when the strip is empty — that's exactly when a visitor needs a next step. Button passes `categoryTitle={video.title}` + `sourceUrl=/videos/<slug>` → same `LeadFormModal`, identical lead (email + `leadSubmission`), video title as context.
- **Static-safety + freshness:** same story as the category bar — the read is the layout-Footer-deduped `getSiteSettings()` (non-CDN `cachedClient` + `SETTINGS_TAG`, `revalidate:false`), zero extra Sanity fetches, no searchParams/hooks → `/videos/[slug]` stays SSG. Webhook: existing `globalSettings` case covers it (no Filter/Projection change — conscious no-op). Blast radius: a globalSettings publish already invalidates every page site-wide (layout Footer's `SETTINGS_TAG` + `revalidatePath('/','layout')`); video pages were already inside that set — nothing new.
- **Deploy gate:** curl a deployed `/videos/<slug>` raw HTML → contains "Need help choosing the right Promotional Products?" + the H1, no `BAILOUT_TO_CLIENT_SIDE_RENDERING`; category pages still render the `{category}` wording.
- Conscious no-ops: no new cache tag, no new env var, no webhook change, no `/api/leads` change, CTABanner/EmptyStateCTA untouched. Guide updated (Video CTA Bar section + quick-reference row). `pnpm typecheck` clean.

---

## Phase 2C — Geiger Digital Catalog Lead Pages

### [x] P2-CAT-000: Catalog product sync (data layer) — DONE 2026-07-15

- **What shipped:** the data layer for the catalog lead pages — a scraper capturing each Geiger catalog's product set + facet SKU memberships + flipbook/PDF metadata into `data/geiger/catalogs.json`, a dispatch-only workflow, and a **"Refresh Catalogs"** button in the Site Refresh panel. Pages/forms/menu/AI come in the next prompts.
- **Scraper:** [scripts/scrapers/geiger/scrape_catalogs.py](scripts/scrapers/geiger/scrape_catalogs.py) (`pnpm scrape-catalogs`) — mirrors the Phase F deals pattern (meta.json labels → paginate base listing → one filtered call per facet value for `skus[]`, degenerate single-value facets dropped like Phase H). In-file `CATALOGS` config, 7 entries with STABLE slugs (`ideas`, `green-guide`, `womens-collection`, `holiday-guide`, `usa-made`, `retail-collective`, `trend-talk`) — the later Sanity catalog docs key off them.
- **Three source modes:** `category` (category.json + `bgfilter.category_path` — Ideas `Home > Shop By > Ideas` 203, Green Guide `Home > Shop By > Green Guide` 54), `search` (search.json + `q=` — Women's Collection 88, Holiday Guide 87), and the new `filter` mode for USA Made: **search.json + `bgfilter.refine_by=Made in the USA`** → the CLEAN 611-product set Patrick approved (verified identical to `filter.refine_by=...`; `bgfilter.` keeps the degenerate refine_by facet out of the sidebar, matching the other scrapers' convention; deliberately NOT the literal SHOP NOW `q=made in the usa` search, ~641 noisy). Full product objects stored (not bare SKUs) so catalog pages render products newer than `products.json`.
- **Manual-only catalogs:** Retail Collective + Trend Talk 2026 have NO product source (`source: null`, `products: []`) — Patrick curates their products in Studio (his call); they still ship in the file with their external flipbook `browseUrl`s so all 7 render from one place.
- **Catalog asset metadata (5 internal viewers):** each run re-parses `https://patrickblack.geiger.com/c/<viewer-slug>` for the embedded yupub share link (`my.yupub.com/?tid=<uuid>` — tids NOT hardcoded, Geiger re-uploads new editions under new tids), then calls `https://api.yupub.com/?task=get_me&tid=<tid>` (returns XML: `<doc filename filesize totalPageNumber baseURL>`) and records `pdf: {tid, url (baseURL/filename), filename, filesize, pages, baseUrl}` — `baseUrl` is the CloudFront prefix for `Leaf_N.jpg` page images (landing-page photos later). **NON-FATAL by design:** any asset failure keeps the previous catalogs.json values (or null), warns loudly, and the product refresh continues — plus a small blanket retry, since curl_cffi DNS hiccups (seen once against api.yupub.com) bypass the client's httpx-only tenacity retry.
- **Output:** `data/geiger/catalogs.json` — `{scrapedAt, catalogs:[{slug, title, source, browseUrl, pdf, totalProducts, products[], facets[]}]}` (deals-shaped facets). ~1.9 MB — sits fine next to `products.json` (9.6 MB) / `facet-memberships.json` (44.5 MB); it's a build-time `fs` read like `deals.json`, never shipped to the client.
- **Workflow:** [.github/workflows/scrape-catalogs.yml](.github/workflows/scrape-catalogs.yml) — **workflow_dispatch only** (yearly cadence, no cron per the 2026-07-06 policy), diffs `catalogs.json`, opens the auto-merge PR on branch `chore/catalog-refresh` (merge is the final step so Cancel leaves main untouched). Registry entry `catalogs` in [lib/site-refresh/workflows.ts](lib/site-refresh/workflows.ts) → the panel button appears with zero panel-code changes. Guide updated (Site Refresh section: six buttons).
- **BrowseUrl host:** internal viewers emit `https://patrickblack.geiger.com/c/<slug>` (affiliate host, never www.geiger.com — Section 18).

### [x] P2-CAT-001: Catalog lead pages — the `catalogPage` doc type + the two routes (prompt 2 of 4) — DONE 2026-07-15 (staged for review)

- **What shipped:** the new `catalogPage` Sanity document type and the two pages it drives per catalog: the PUBLIC landing page `/shop-by-theme/<slug>` (indexed, in the sitemap) and the GATED product page `/shop-by-theme/<slug>/catalog` (noindex, excluded from the sitemap, never in a menu — reached only via the link the prompt-3 form will email). The lead form + email delivery is P2-CAT-002 (prompt 3); AI generation is P2-CAT-004 (prompt 4).
- **Doc type** ([sanity/schemas/documents/catalog-page.ts](sanity/schemas/documents/catalog-page.ts), registered in the schema index): Basics (`title`, single-segment `slug` — slash/uppercase rejected at publish, the app/[slug] lesson; `catalogKey` — which `data/geiger/catalogs.json` entry supplies the synced products + Browse link; `browseCatalogUrl` — optional override, the default resolves from the data file at render); Landing content (`heroHeading`/`heroSubheading`/`heroImage`, `body` = the page-builder `portableBody` with inline sized images, `ctaHeading`/`ctaButtonLabel`, `seo`); Gated products (`addedSkus` via `ProductSkuPicker`, `addedProducts` refs to `customProduct`/`productPage` — the categoryOverride union, `hiddenSkus`); Gated strips (`relatedKeywords`, `relatedBlogs`/`relatedVideos` refs). `shop-by-theme` added to `RESERVED_SLUGS` (lib + the page + landingPage schema mirrors) so no other doc can collide with the route.
- **Loader** [lib/catalogs.ts](lib/catalogs.ts) mirrors `lib/deals.ts` for the multi-catalog file: parse-once Map keyed by catalog slug, entity decode, `applyHiddenSkus` + facet re-derive, and `getAugmentedCatalogData({catalogKey, addedSkus, addedProducts, hiddenSkus})` running the SAME `augmentAggregator` lane as /deals//new-products (productPage adds ride `productPageToGeigerProduct` + `productPageAsCustomDoc` so they render internal-link cards AND join the filter tags; empty synced base = manual-only catalogs render from adds alone). Facet shape is deals-shaped, so the client reuses `DealsFacetSection`/`applyDealsFilters` re-exported as `Catalog*` aliases.
- **Public landing** ([app/shop-by-theme/[slug]/page.tsx](app/shop-by-theme/[slug]/page.tsx)): prebuild-all + `dynamicParams=true`/`revalidate=false` (the /products pattern), hero → long-form body (`pagePortableComponents`) → 3 CTAs (top/middle/end via [components/catalogs/CatalogCta.tsx](components/catalogs/CatalogCta.tsx) — **placeholder buttons linking to /contact, each marked `M3 prompt 3: open catalog lead form`**, `catalogSlug`+`placement` already plumbed) → a static 4-product peek from the scraped set. Full SEO: H1-derived or seo meta, canonical, socialMeta (ogImage → hero → first product), CollectionPage JSON-LD, BreadcrumbList, `CustomSchemaJsonLd`, sitemap entry.
- **Gated page** ([app/shop-by-theme/[slug]/catalog/page.tsx](app/shop-by-theme/[slug]/catalog/page.tsx)): `robots {index:false, follow:false}` + NOT in the sitemap (honesty: hidden from Google, not auth). BROWSE CATALOG button (override else scraped viewer link, new tab), the /deals-style grid via [components/catalogs/CatalogProductsClient.tsx](components/catalogs/CatalogProductsClient.tsx) — which REUSES `DealsFilterSidebar` + the deals `ClientPagination` + `applyDealsFilters` directly (no fork; both are prop-generic) — and Related Blogs/Videos strips resolved exactly like `/products/<slug>` (manual refs first, `suggestLinksForKind` top-up, card data via the tag-cached `getBlogSummariesBySlugs`/`getVideoSummariesBySlugs`). Empty product set (manual-only catalog before adds) renders a friendly note, never the misleading "no filters match" state.
- **Freshness:** all catalogPage reads via non-CDN `cachedClient` + `CATALOG_PAGES_TAG` + `catalog-page:<slug>` ([lib/sanity/queries/catalog-pages.ts](lib/sanity/queries/catalog-pages.ts), tags through `sanitizeTagValue`). Webhook `catalogPage` case busts both tags + both paths + `/sitemap.xml`; `findEmbeddingContentDocs` extended with `catalogPage` (+ an `addedProducts[]->slug` fallback) so an edit to a referenced productPage/customProduct refreshes the embedding catalog pages; the blog/video strips ride the already-busted `RELATED_BLOGS_TAG`/`VIDEOS_TAG` (no webhook change needed for those). **⚠️ MANUAL: add `catalogPage` to the Sanity webhook Filter on staging now + production at promotion** — exact string in [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md).
- **Static-safety:** both routes read no `searchParams`, make no uncached fetch; filter/paginate state is in-memory client state over baked JSON (the /deals model), so the shell + first render + strips are full static HTML. USA Made (~611 products) is the biggest payload — same order as /deals' full grid, paginated client-side at 60/page.
- **Guide:** new section 25 "Catalog Pages (Shop-by-Theme lead pages)" in perfect-imprints-sanity-guide.html (sections renumbered).
- Patrick's original scope said "10 catalogs"; the Phase I scrape found 7 live themed catalogs — more can be added by extending the scraper's `CATALOGS` list + creating a catalogPage.

### [x] P2-CAT-002: Catalog CTA form + email-gated delivery (prompt 3 of 4) — DONE 2026-07-15 (staged for review)

- **Reuse decision (Option 1):** the catalog lead form is a normal seeded builder `form` doc — **"Catalog Request"**, slug `catalog-request` (`CATALOG_FORM_SLUG` in [lib/leads/catalog-lead.ts](lib/leads/catalog-lead.ts)) — First/Last/Company/Phone/Email required + optional Comments, recipient patrick@, opened by the three landing CTAs via the standard `FormModalButton` island. The ENTIRE builder pipeline is reused (renderer, modal, spam stack, server-side re-validation, lead email, `answers[]` record); nothing was forked. Seed: `pnpm seed-catalog-form` ([scripts/seed/seed-catalog-form.ts](scripts/seed/seed-catalog-form.ts)) — writes a DRAFT, skips if published, Patrick publishes to flip the CTAs from the /contact fallback to the popup. **⚠️ NOT yet run against live** — run it, then publish the form.
- **The catalog-slug plumb-through:** `FormModalButton`/`FormModal`/`FormRenderer` gained a generic **`hiddenFields?: Record<string,string>`** prop (values set into the POST before `formSlug`/`sourceUrl` so they can never override those); [components/catalogs/CatalogCta.tsx](components/catalogs/CatalogCta.tsx) passes `{catalogSlug}` and the landing page resolves the form ONCE via the tag-cached `getFormBySlug` (FORMS_TAG rides the existing `form` webhook case — no new webhook surface) and shares it across the three CTA instances. Unpublished form → /contact link fallback (never dead-ends).
- **Email-gated delivery (the core):** the `/api/leads` builder branch reads the hidden `catalogSlug`, validates it SERVER-SIDE against a published catalogPage (`getCatalogLeadInfo` in [lib/sanity/queries/catalog-pages.ts](lib/sanity/queries/catalog-pages.ts) — tagged `CATALOG_PAGES_TAG`/`catalog-page:<slug>`, both already busted by the prompt-2 webhook case; **`catalogPage` is already in the webhook Filter from prompt 2 — no Filter change**), and on a match: (1) the lead email + `leadSubmission` gain a first "Catalog" answer row + `catalogTitle`/`catalogSlug` record fields (schema extended); (2) **the customer receives the gated-link email** — `buildCatalogConfirmationEmail` (pure, [lib/leads/catalog-lead.ts](lib/leads/catalog-lead.ts)): greeting by first name, thanks-for-requesting-`<title>`, a green button + raw link to `https://<site>/shop-by-theme/<slug>/catalog` (built server-side from the same `NEXT_PUBLIC_SITE_URL` constant the sitemap uses), **cc = the resolved lead recipient** (`sendBuiltEmail` gained an optional `cc`), replacing the generic summary confirmation for catalog submissions. NON-FATAL (lead email + record already happened); only sent to a `isValidEmail` address (the whole point — and the email field is required + format-validated anyway). It sends REGARDLESS of the form's `sendCustomerConfirmation` toggle — it is the deliverable, not a courtesy copy, so a Studio toggle can't silently break delivery. Unknown/forged slug → plain builder-form behavior; **no client-supplied recipient exists anywhere** (the recipient is always the form doc's stored address).
- The gated page remains reachable directly by URL (noindex, not auth — the agreed design; the email is the only advertised entry point).

### [x] P2-CAT-003: "Shop By Theme" mega-menu dropdown — DONE 2026-07-15 (script staged; not yet run)

- **Choice: static seed via a TARGETED patch script**, not the full-menu re-seed and not render-time resolution. [scripts/seed/seed-shop-by-theme-menu.ts](scripts/seed/seed-shop-by-theme-menu.ts) (`pnpm seed-shop-by-theme-menu`) queries the PUBLISHED `catalogPage` docs and upserts ONE `kind:'dropdown'` menuItem (key `item-shop-by-theme`, label "Shop by Theme", links = `/shop-by-theme/<slug>` LANDING pages only, title-ordered) into the `megaMenu` singleton — replace-in-place if present (position kept), else inserted after "Deals". **It never touches any other item**, so Patrick's menu edits survive (unlike `pnpm seed-mega-menu`, which createOrReplace's the WHOLE singleton from code and therefore DROPS this item — re-run this script after any full re-seed). Patches the draft too when one exists (else publishing the draft would drop the item). Zero published catalogPages → exits without writing (no dead links). Why static over dynamic: the menu is a Sanity-singleton Patrick edits in Studio; a render-time catalogPage lookup would diverge from that model for 7 rarely-changing links. Tradeoff (documented in the guide): a newly published catalog is NOT auto-added — Patrick adds the link in Studio or re-runs the script. The patch fires the existing `megaMenu` webhook case, so the header updates in seconds; **⚠️ NOT yet run** — run after the catalog pages are published (dry-run verified: exits cleanly with 0 published docs today).

### [x] P2-CAT-004: AI generation for new catalog pages + catalog photo helper (prompt 4 of 4) — DONE 2026-07-15 (staged for review)

- **"Generate Catalog Page with AI"** ([sanity/actions/generate-catalog-with-ai.tsx](sanity/actions/generate-catalog-with-ai.tsx) → [app/api/sanity/generate-catalog/route.ts](app/api/sanity/generate-catalog/route.ts), `nodejs`+`force-dynamic`, registered for `catalogPage` in [sanity/sanity.config.ts](sanity/sanity.config.ts); needs `title`). Pure P2-AI-001 engine reuse mirroring generate-page/-landing: brand voice + `generateJson`, a 3-6-section 600-1000-word body ask (thin floor 450 → clean 502 "click Generate again"), internal links auto-placed in 'page' shape, ONE page-legal Portable Text body via `buildPageSectionsBody` (H2s IN the body — `catalogPage.body` is a single portableBody), meta clamped ≤60/≤155 at word boundaries. **Grounding:** when `catalogKey` resolves in catalogs.json, ~12 REAL product names from that catalog are fed to the prompt (names only — the prompt forbids inventing specs/prices; manual-only/unknown keys degrade to purely thematic copy). **Patch policy:** hero heading/subheading + body + seo meta REFRESHED every run; `relatedKeywords` + `aiSuggestedLinks` only-if-empty; slug only-if-empty from the title; never publishes. **HARD BOUNDARY (the productPage/landing rule, stated in the route header):** editorial content ONLY — never `catalogKey`, addedSkus/addedProducts/hiddenSkus, the browse link, or any commercial fact. New Studio-only `ai` fieldset on catalogPage (`aiTopicKeywords`/`aiBrief`/`aiSuggestedLinks`) — read by NO render path or webhook. **Conscious no-ops:** no webhook Filter/Projection change (no new doc type; `catalogPage` already in the Filter from prompt 2), no new cache tag, no new env var (`DEEPSEEK_API_KEY` reused, server-side).
- **Catalog photos, both options:** (b) manual upload was already in place (the `heroImage` field + inline sized images in the `body` portableBody) — confirmed + documented; (a) **`pnpm fetch-catalog-images <slug>|--all [--limit N]`** ([scripts/catalogs/fetch-catalog-images.ts](scripts/catalogs/fetch-catalog-images.ts)) downloads a catalog's `<pdf.baseUrl>/Leaf_N.jpg` page rasters (the Phase I metadata) into the GITIGNORED `tmp/catalog-images/<slug>/` (idempotent resume, 300ms polite delay, per-page + per-catalog skip-and-warn — the CloudFront URLs are undocumented vendor internals; wholesale 404 → "re-run `pnpm scrape-catalogs`" hint). Patrick flips through, picks the good pages, uploads via the normal image fields — the helper deliberately does NOT auto-insert into docs or bulk-upload to Sanity (photo choice is editorial). Retail Collective + Trend Talk (`pdf: null`, external flipbooks) skip with a "supply by screenshot" message. **Smoke-tested live:** `green-guide --limit 2` downloaded 2 real page JPEGs (~300 KB each); `retail-collective` printed the skip message.

### [x] P2-CAT-005: Landing-page related strips + https email link + button rename (Patrick feedback) — DONE 2026-07-18 (staged for review)

- **Related Blogs + Related Videos on the PUBLIC landing page** (`/shop-by-theme/<slug>`), at the very bottom below the end "Want the full catalog?" CTA — the indexed SEO surface Patrick asked for. The gated page's exact resolution + markup was **extracted into the shared server component [components/catalogs/CatalogRelatedContent.tsx](components/catalogs/CatalogRelatedContent.tsx)** (manual `relatedBlogs`/`relatedVideos` refs first, keyword top-up via `suggestLinksForKind`, card data via the order-preserving tag-cached `getVideoSummariesBySlugs`/`getBlogSummariesBySlugs`, up to 4 each, renders NOTHING when empty) and both routes now render it — one catalog, one consistent set, shown in both places. NOT a fork: the gated page's inline `resolveRelatedContent` + strip JSX moved into the component verbatim; the gated page's behavior is unchanged. **Static-safe:** all reads ride the existing `RELATED_BLOGS_TAG`/`VIDEOS_TAG` tag-cached fetches (already webhook-busted on blog/video publish) — no new tag, no webhook change, the landing route stays `●` statically prerendered.
- **Confirmation-email link forced to https.** Patrick reported the live "Your <Catalog> catalog is ready" email linked `http://` (redirecting to https) — the gated URL is built from `NEXT_PUBLIC_SITE_URL`, used verbatim, so a scheme-less or `http://` env value leaks straight into the email. Fix: `gatedCatalogUrl()` in [lib/leads/catalog-lead.ts](lib/leads/catalog-lead.ts) now normalizes its base through a defensive `httpsOrigin()` — trims trailing slashes, strips any `http(s)://` prefix, and re-prepends `https://` (host untouched, so staging keeps `dev.` and the env still controls the host; empty value falls back to `https://www.perfectimprints.com`). Both email links (the green button AND the raw "copy this link" line) derive from the one `catalogUrl` input, so both are covered; the text-version footer link was already https. The email can no longer regress to `http://` even with an imperfect env var. **⚠️ Also verify the production Vercel `NEXT_PUBLIC_SITE_URL` is exactly `https://www.perfectimprints.com`** — if it's mis-set, canonicals/sitemap/OG URLs (which deliberately use the env verbatim) would be affected too; the code fix protects the email regardless.
- **Gated-page button renamed** "BROWSE CATALOG" → **"BROWSE INTERACTIVE CATALOG"** ([app/shop-by-theme/[slug]/catalog/page.tsx](app/shop-by-theme/[slug]/catalog/page.tsx) — hardcoded label, not Studio-editable; href/behavior unchanged).
- Guide updated (landing page now lists the strips; both-pages wording on the related-content field; new button name). `pnpm typecheck` clean.

### [x] TURNSTILE-1: Turnstile siteverify failure-mode hardening + telemetry marker (Cloudflare "siteverify isn't being called" warning) — DONE 2026-07-24 (staged for review)

- **Diagnosis: the code was NOT missing siteverify.** [app/api/leads/route.ts](app/api/leads/route.ts) already POSTed every submission's `cf-turnstile-response` to `https://challenges.cloudflare.com/turnstile/v0/siteverify` (with `remoteip`) and gated BOTH handler paths (fixed forms + builder forms) on `success === true`, before any email/Sanity work. All three form clients ([components/forms/LeadForm.tsx](components/forms/LeadForm.tsx), [components/forms/FormRenderer.tsx](components/forms/FormRenderer.tsx), [components/products/ProductQuoteForm.tsx](components/products/ProductQuoteForm.tsx)) mount [components/forms/Turnstile.tsx](components/forms/Turnstile.tsx) and POST the raw form `FormData`, so the injected token always reaches the route. **The Cloudflare dashboard warning therefore means `TURNSTILE_SECRET_KEY` is not set in production Vercel** — the widget renders (public key IS set → tokens generated → dashboard traffic), but `verifyTurnstile` hits its deliberate no-secret skip and never calls siteverify. Config fix in Vercel, not a code gap.
- **Code changes (2 files):** (1) [components/forms/Turnstile.tsx](components/forms/Turnstile.tsx) — added `data-action="turnstile-spin-v2"` (Cloudflare's telemetry marker; cosmetic). (2) `verifyTurnstile` in [app/api/leads/route.ts](app/api/leads/route.ts) — explicit failure-mode policy: **fail OPEN with a loud `[leads] TURNSTILE MISCONFIGURED/UNREACHABLE` error log on CONFIGURATION errors** (secret unset, `invalid-input-secret`/`missing-input-secret` from siteverify, siteverify unreachable/non-2xx — a config mistake must never silently swallow Patrick's leads), **fail CLOSED (400) on ACTUAL verification failures** (no token while configured, or siteverify rejecting the token). Previously network errors and a wrong secret both failed closed — a mis-pasted secret would have killed every lead. Honeypot + rate limit unchanged; no other handler behavior touched. Localhost/preview without keys: widget doesn't render, verification skipped — dev still works.
- **Validated:** dummy-token probe against siteverify with the `.env.local` secret returned `error-codes: ["invalid-input-response"]` → the secret is VALID (a wrong secret returns `invalid-input-secret`). `pnpm typecheck` clean.
- **⚠️ MANUAL (Ali, Vercel):** set `TURNSTILE_SECRET_KEY` (value from Cloudflare dashboard / local `.env.local`) in the **Production** env of the production project (+ Preview/staging if the CAPTCHA should be active there; `NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAADsCtEppOmFL6gvv` must be set alongside wherever the widget should render). Redeploy. Post-deploy check: submit a test lead on www — it should succeed — and confirm the Cloudflare Turnstile analytics start showing siteverify calls / the dashboard warning clears within a day. Also confirm the widget's 5 registered hostnames cover `www.perfectimprints.com`, `perfectimprints.com`, `dev.perfectimprints.com`, `localhost`, `127.0.0.1` (couldn't be verified via API from here — the available token lacks Turnstile read scope).

---

## Phase 2 — feeds.perfectimprints.com (SEPARATE PROJECT / NEW REPO)

### [ ] P2-FEEDS-000: feeds.perfectimprints.com rebuild — NOTE: this is a NEW, SEPARATE project

- Rebuild all 101 pages of feeds.perfectimprints.com from scratch (similar text, images, CTAs; styled to match Perfect Imprints; exact design match not required).
- Remove all Gushwork branding/references from the footer. One general contact form (First, Last, Company, Phone, Email, Comments).
- AI-readable schema on every page (purpose is to feed AI platforms). Ability to generate new pages in the same format with AI.
- **Build as its own Next.js project + repo + Vercel project on the feeds subdomain. It is NOT part of the main `perfectimprints` repo.** Give it its own CLAUDE.md/TASKS.md when it starts.

---

## Phase 2 — On Hold

### [~] P2-IMG-001: Image license metadata (Google Search Console) — ON HOLD

- Image license/creator/copyright structured data per Google's image-license-metadata guidelines. Patrick is still deciding; not included in the $5,500 scope. Scope and quote separately when he confirms (estimated $300 to $700).
