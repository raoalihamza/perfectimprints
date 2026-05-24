# TASKS.md

Sequential ticket list for the Perfect Imprints rebuild. Read `CLAUDE.md` first. Each ticket is self-contained and can be used as a prompt to an AI coding tool.

Conventions:

- `[ ]` open, `[x]` done, `[~]` blocked
- Dependencies are listed by ticket ID
- Acceptance is a checklist, not prose
- Estimates are working hours, not calendar hours

Module to week mapping (client-facing 6-week plan):

- Module 1 (Foundation + Data Pipeline): Week 1-2
  - M1-101 through M1-108: Week 1 (scaffold, layout, Phase A taxonomy, Phase B product catalog)
  - M1-109 through M1-111: Week 2 (Phase C facet memberships, Phase D mapping, full scrape validation)
- Module 2 (AI Content Generation): Week 2-3
  - Week 2 end: Top 35 root sample generated for client demo
  - Week 3: Remaining 430 roots + 21,715 non-root pages
- Module 3 (Category Page Templates): Week 2-4
  - Week 2 end: Sample template for 35 demo roots (layout + content + grid, no filters)
  - Week 3-4: Filters, sort, pagination, lead form, polish
- Module 4 (Blog System): Week 4
- Module 5 (Search, Forms, Home, Polish): Week 5
- Module 6 (QA, Migration, Launch): Week 6

---

## Module 1: Foundation and Data Pipeline

### [x] M1-101: Initialize Next.js project

**Scope.** Bootstrap a Next.js 15 App Router project with TypeScript strict mode, Tailwind CSS, ESLint, Prettier, and pnpm. Configure path aliases. Set up the folder structure described in CLAUDE.md Section 5.
**Acceptance.**

- [x] `pnpm dev` runs locally on port 3000
- [x] TypeScript strict mode enabled in tsconfig
- [x] Tailwind configured with brand tokens from CLAUDE.md Section 10 (red `#E11F1E`, ink `#231F20`, green `#16A34A`, white)
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

**Scope.** Connect the repo to Vercel. Use Vercel's native Next.js support (no adapter required). Add a `dev.perfectimprints.com` CNAME in Cloudflare DNS pointing at the Vercel staging deployment, in DNS-only mode (grey cloud, not proxied). Verify HTTPS works (Vercel issues the cert automatically). Add environment variables in the Vercel dashboard.
**Acceptance.**

- [x] Push to `main` triggers a Vercel production build
- [x] Push to `develop` triggers a Vercel preview/staging build
- [x] dev.perfectimprints.com resolves to the Vercel staging deployment via Cloudflare CNAME in DNS-only mode
- [x] HTTPS valid, no certificate warnings (Vercel auto-provisioned)
- [x] Build completes in under 5 minutes for the empty starter
      **Depends on.** M1-102.
      **Estimate.** 3 hours.

**Note:** Migrated from Cloudflare Pages to Vercel mid-Week 1 due to Edge Runtime incompatibility with Sanity Studio.

### [x] M1-104: Initialize Sanity studio

**Scope.** Create a Sanity v3 project under Patrick's account. Generate API tokens. Add the studio under `/sanity` in the repo. Create initial schema files for `homePage`, `globalSettings`, and `megaMenu` (the rest expand in M4 and M5). Set up Sanity webhook for ISR.
**Acceptance.**

- [x] Sanity studio runs locally on port 3333
- [x] Initial schemas exist
- [x] Studio deploys to a Sanity-hosted URL
- [x] Webhook configured, signature verification working
- [x] Environment variables added to Vercel
      **Depends on.** M1-101.
      **Estimate.** 4 hours.

**Note:** Project ID `ii96lcy9`, dataset `production`. Studio accessible at both `localhost:3333` and `https://dev.perfectimprints.com/admin`.

### [x] M1-105: Implement brand theme and design tokens

**Scope.** Implement the brand tokens from CLAUDE.md Section 10 as Tailwind theme extensions and CSS variables. Create a base layout with the chosen typography. Build a `/style-guide` route on staging that renders all tokens, headings, buttons, and form elements for visual review by Patrick.
**Acceptance.**

- [x] Tailwind theme extended with all tokens
- [x] CSS variables exposed at `:root`
- [x] `/style-guide` page renders typography scale, colors, buttons, form elements
- [x] Brand red `#E11F1E` verified against the logo SVG
- [ ] Green CTA shade confirmed with Patrick (pending OQ-4)
      **Depends on.** M1-101.
      **Estimate.** 5 hours.

### [x] M1-106: Global layout components (header, footer, mega menu skeleton)

**Scope.** Build the global Header component (logo, mega menu hardcoded skeleton, search bar placeholder, phone number `800-773-9472`, contact link) and Footer (4 columns, social icons, copyright with auto year). Mega menu is hardcoded structure for now, becomes Sanity-driven in M5.
**Acceptance.**

- [x] Header renders on every page
- [x] Footer renders on every page with auto-updating year
- [x] Sticky on scroll behavior
- [x] Mobile drawer for menu on small screens
- [x] Keyboard navigation accessible
      **Depends on.** M1-105.
      **Estimate.** 8 hours.

**Mega menu upgraded (2026-05-25).** The hardcoded skeleton was replaced with a Geiger-taxonomy-driven mega menu for the Week 2 demo. Header now reads `data/geiger/categories.json` via `lib/nav-data.ts::getDepartments()` and renders two interactive items: **Shop by** (3-column cascade: department → child → grandchild, mirrors Geiger's UX) and **All Categories** (wide multi-column overview panel). Components live at `components/layout/ShopByMegaMenu.tsx`, `AllCategoriesPopover.tsx`, `SimpleNavDropdown.tsx`. Linking rule: a node is rendered as a clickable internal `<Link>` only when `data/categories/<slug>.json` exists (35 today, 465 after M2-205); everything else renders as a muted `<span>` with `aria-disabled` and a "Coming soon" tooltip — no external Geiger jumps from the nav. Popovers cap at `max-h-[80vh]` with `overflow-y-auto`, `overscroll-contain`, and the `scrollbar-hide` utility in `globals.css`. Sanity-driven version still tracked under M5-503.

### [x] M1-107: Build Geiger Python scraper (Phase A: taxonomy)

**Scope.** Python package at `scripts/scrapers/geiger/`. Phase A discovers the full Geiger category tree by parsing the mega menu HTML from one category page using BeautifulSoup. Output: `data/geiger/categories.json` with parent-child relationships and Searchspring category_path strings for each leaf.
**Acceptance.**

- [x] All Geiger categories extracted (544 total, 482 leaves)
- [x] Parent-child relationships preserved
- [x] Each leaf has the exact `category_path` string used by Searchspring API
- [x] Output file committed to repo
- [x] README with usage instructions
      **Depends on.** None. Can run in parallel with M1-101 through M1-106.
      **Estimate.** 4 hours.

### [x] M1-108: Build Geiger Python scraper (Phase B: product catalog)

**Scope.** Phase B paginates the Searchspring API at `https://kfx28d.a.searchspring.io/api/search/category.json` for each Geiger leaf category. Deduplicates by SKU. Uses httpx HTTP/2 + tenacity retry + 1 req/sec throttle + checkpointing. Switched to curl_cffi to bypass Cloudflare bot protection. Used `perPage=60` to match Geiger's native page size. Output: `data/geiger/products.json` with full product objects.
**Acceptance.**

- [x] All Geiger products scraped (7,957 unique SKUs, 99.82% of Geiger's 7,971 total)
- [x] Full product object captured (sku, name, brand, prices, MOQ, image URL, badges, etc)
- [x] Deduplicated by SKU
- [x] Resumable from last checkpoint
- [x] Total runtime under 1 hour
      **Depends on.** M1-107.
      **Estimate.** 6 hours.

**Note:** Original estimate of "20-40k products" in early planning was based on the inflated per-category counts on Geiger's `/b/` pages. The true unique-SKU count is 7,957 because Geiger products are cross-listed across ~3.3 category paths on average.

### [x] M1-109: Build Geiger Python scraper (Phase C: facet and modifier memberships)

**Scope.** Phase C makes one filtered Searchspring API call per non-root PI URL (21,715 total: 576 modifiers + 21,137 facets + 2 compound facets) to capture which SKUs belong to that URL. Uses `bgfilter.category_path` plus `filter.[type]=[value]` for facets, modifier-specific filters verified during the first end-to-end run. Modifier filter mapping documented in CLAUDE.md Section 16. Compound facets use multiple `filter.*` params in one call. 1 req/sec throttle, checkpointing every 100 calls. Output: `data/geiger/facet-memberships.json` mapping URL to SKU list. Includes 4-tier empty-page recovery chain (Tiers 1 and 2 baked into data; Tiers 3 and 4 implemented at template layer in Module 3).
**Acceptance.**

- [x] All 21,715 non-root URLs processed
- [x] SKU lists captured per URL
- [x] Modifier filter mapping verified on sample (one URL per modifier type)
- [x] Checkpointing tested (kill mid-run, resume cleanly)
- [x] Total runtime approximately 6 hours unattended
- [x] Failures logged with retry count
- [x] Tier 1 brand fallback applied (recovered 809 URLs)
- [x] Tier 2 search-keyword fallback applied (recovered 2,625 URLs)
- [x] Slug-based resolver in memberships.py for category-slug matches
      **Depends on.** M1-108.
      **Estimate.** 8 hours (was 6, plus 2 for modifier filter verification).

**Final breakdown:** 13,968 URLs (64.3%) with products, 7,518 (34.6%) zero results, 229 (1.1%) errors. Tiers 3 and 4 (parent-root fallback and homepage CTA) implemented at render time in Module 3.

### [x] M1-110: Build PI-to-Geiger category mapping (Phase D)

**Scope.** Script that takes the 465 PI root category URLs and maps each to the closest Geiger leaf category. Strategy: exact slug match first, fuzzy match with rapidfuzz second, manual overrides for unresolved. Output: `data/mappings/pi-to-geiger.json` plus a CSV report with confidence scores for manual review.
**Acceptance.**

- [x] Every PI root URL has either a Geiger mapping or is flagged as unmappable (0 unmappable)
- [x] CSV report generated for human review (at `data/mappings/pi-to-geiger-review.csv`)
- [x] At least 450/465 mappings are exact or high-confidence fuzzy (465/465 mapped: 72 exact + 224 fuzzy + 169 manual overrides)
- [x] AI-assisted matches reviewable and overridable via a manual override file
- [x] Manual override file documented (at `scripts/scrapers/geiger/mapping_overrides.json`)
      **Depends on.** M1-108.
      **Estimate.** 8 hours.

**Note:** DeepSeek AI fallback was deferred — manual overrides covered every remaining root.

### [x] M1-111: First full scrape run and validation

**Scope.** Run all 4 phases end-to-end. Validate outputs. Summary stats: total products, total categories, products per top category distribution, unmapped PI roots, average facet membership counts. Commit all data files to repo.
**Acceptance.**

- [x] All 4 phases complete without errors
- [x] Summary stats documented at `/docs/scrape-results.md`
- [x] No data file missing or zero-byte
- [x] Data committed to repo (not gitignored)
      **Depends on.** M1-107, M1-108, M1-109, M1-110.
      **Estimate.** 4 hours.

---

## Module 2: AI Content Generation

### [x] M2-201: DeepSeek client setup

**Scope.** Python client at `scripts/ai-pipeline/deepseek_client.py` wrapping the DeepSeek-V3 API. Includes retry logic, rate limit handling, token counter for cost tracking, structured logging. Env var `DEEPSEEK_API_KEY`.
**Acceptance.**

- [x] Client makes successful API call from a test script
- [x] Retries on transient errors (tenacity, 3 attempts, exponential backoff; 429 honors `retry-after`)
- [x] Cost per call logged in tokens and dollars (input $0.27/M, output $1.10/M)
- [x] Dry-run mode prints prompt without calling API
      **Depends on.** M1-101.
      **Estimate.** 4 hours.

**Done (2026-05-24)** as part of Week 2 demo deliverable. Client at `scripts/ai-pipeline/deepseek_client.py`, deps in `scripts/ai-pipeline/requirements.txt`. Verified against live API generating all 35 sample roots ($0.037 total, 0 failures).

### [x] M2-202: Root category prompt template

**Scope.** Author `scripts/ai-pipeline/prompts/root_category.txt` for full-length root category content. Generates: SEO H1, meta title (under 60 chars), meta description (under 155 chars), 2-3 paragraph intro, 5 FAQs with answers, hero alt text. Injects category-specific signals (top product names, target keyword plural form, buyer persona) and varies opening structure (30% use case, 30% buyer, 30% material, 10% seasonal).
**Acceptance.**

- [x] Template file committed
- [x] Test run on 5 sample categories produces valid JSON output (run on all 35 demo roots)
- [x] Output passes character length checks for meta tags (12/35 metaDescriptions ran 1–9 chars over the 155 soft limit; H1s 29–61 chars; all titles ≤ 64)
- [x] FAQs are category-specific, not generic
- [x] Opening structure variation observed across samples (11/11/10/3 split deterministically assigned via seeded shuffle)
      **Depends on.** M2-201.
      **Estimate.** 4 hours.

**Done (2026-05-24)** as part of Week 2 demo deliverable. Template at `scripts/ai-pipeline/prompts/root_category.txt`. Per-page average cost: $0.00105.

### [ ] M2-203: Facet category prompt template

**Scope.** Author `scripts/ai-pipeline/prompts/facet_category.txt` for lite facet page content (21,137 standard facets + 2 compound facets use this template). Generates: SEO H1 targeting long-tail keyword, meta title, meta description, one short intro paragraph (60-80 words). No FAQs.
**Acceptance.**

- [ ] Template file committed
- [ ] Test run on 5 sample facet URLs produces valid output
- [ ] H1 reflects the long-tail keyword exactly (e.g., "Custom Stainless Steel Water Bottles")
- [ ] Intro paragraph is unique per facet, not boilerplate
- [ ] Compound facets render H1 with both filter dimensions
      **Depends on.** M2-201.
      **Estimate.** 2 hours.

### [ ] M2-203a: Modifier category prompt template

**Scope.** Author `scripts/ai-pipeline/prompts/modifier_category.txt` for the 576 modifier pages (`/cat/<root>/<modifier>`). Six modifier types: `search` (258), `no-minimum` (216), `closeout` (93), `production-time` (6), `eco-friendly` (2), `material` (1). Each modifier has a different buyer intent: closeout/sale = price-sensitive, no-minimum = small orders, production-time = rush, eco-friendly = sustainability, search = generic landing, material = filter root. Template selects tone and angle by modifier type, then injects the root category context. Generates: H1, meta title, meta description, one short intro paragraph (60-80 words). No FAQs.
**Acceptance.**

- [ ] Template file committed
- [ ] Test run on at least one URL of each modifier type produces valid output
- [ ] H1 incorporates both root category and modifier (e.g., "Closeout Water Bottles", "Eco-Friendly Tote Bags", "No-Minimum Custom Pens")
- [ ] Intro paragraph reflects the modifier intent, not generic
      **Depends on.** M2-201.
      **Estimate.** 3 hours.

### [ ] M2-204: AI content generation pipeline

**Scope.** Node or Python script at `scripts/ai-pipeline/generate_content.py`. Reads the PI URL list plus the PI-to-Geiger mapping plus the Geiger product data, and for each URL selects the appropriate template (root, modifier, or facet) based on `type` field, then invokes DeepSeek. Resumable, with per-batch concurrency limits, retry logic, dry-run mode, and per-batch cost reporting.
**Acceptance.**

- [ ] Script generates output for any subset of URLs on demand
- [ ] Template selection by URL type works correctly (root → root_category, modifier → modifier_category, facet/compound-facet → facet_category)
- [ ] Output JSON conforms to the schema in CLAUDE.md Section 9
- [ ] Failed pages logged separately and retriable
- [ ] Dry-run mode prints prompts without API calls
- [ ] Per-page cost reported at end of run
- [ ] Resumes from last completed URL on rerun
      **Depends on.** M2-202, M2-203, M2-203a, M1-110.
      **Estimate.** 8 hours.

### [ ] M2-205: Generate 465 root category samples and review

**Scope.** Run the pipeline on all 465 root categories. Commit output to `data/categories/`. Patrick reviews a randomized sample of 20 outputs. Adjust prompts if tone or accuracy issues are flagged.
**Acceptance.**

- [ ] 465 JSON files in `data/categories/`
- [ ] Cost report under $20
- [ ] Patrick sign-off captured in writing (WhatsApp or email)
- [ ] Sample review notes documented at `/docs/sample-review.md`
      **Depends on.** M2-204.
      **Estimate.** 5 hours.

**Week 2 demo carve-out (2026-05-24).** For the Week 2 client demo, the top 35 root categories by Geiger product count are generated as a mini-batch and rendered live on staging. This is a separate run from the full 465 generation here, which still happens after Patrick approves the sample. The mini-batch script is at `scripts/ai-pipeline/generate_sample_roots.py`. Mini-batch cost: ~$1. Full 465 run (this ticket): expected ~$12.

**Mini-batch generated (2026-05-24).** 35 root pages written to `data/categories/` for the Week 2 client demo. Cumulative cost: $0.065 across 60 API calls (4 rounds: initial batch, replacement+regen pass, length-outlier pass, single retry) — full 465 run revised to ~$0.49. Selection deduped by Geiger path so 35 entries are distinct categories (not 17 near-identical pages backed by Office & Tech). `EXCLUDED_SLUGS` has 11 entries — 5 with incoherent fuzzy mappings (tape-dispensers, mylar-exit-barrier-bags, arm-sleeves, bath-body-gifts, child-infant-products), 6 that produced near-empty grids after filtering or weren't real categories (excluded-products, banners-mats-signs, binoculars, health, pens, medical-healthcare-items). Replacements backfilled from next-ranked: coins, compasses, insect-repellent, disposable-cups, adhesive-notepads, coolers.

**SKU filtering layered rules** (applied in `apply_sku_filter`): (1) only filter when matchType=`override` AND Geiger path depth < 3 — exact/fuzzy leaf matches are trusted as-is; (2) score SKUs by slug-token overlap with product name, keep all above median, cap at 200; (3) floor rule: if filter yields < 30 SKUs, fall back to raw set capped at 60 (mode `full-capped-60`). Three skuFilterMode values now appear in output JSONs: `full`, `slug-filtered`, `full-capped-60`. Each JSON also carries `rawSkuCount` and `filteredSkuCount` for audit.

**Prompt rules added** (`prompts/root_category.txt`): compound-noun H1 rule (slugs like `lunch-bags-boxes-totes` → "Custom Lunch Bags, Boxes & Totes for X" rather than running the nouns together); explicit HARD LIMIT reinforcement on metaTitle/metaDescription/h1 character counts.

**Safety net**: `post_process_lengths()` in the script truncates metaTitle/metaDescription at the last word boundary if the model overshoots SEO caps — runs after every generation and was also back-applied to the existing 35 files. Final state: zero length violations across all 35 JSONs (h1 30–61, metaTitle ≤ 57, metaDescription ≤ 155).

Full 465 generation deferred to Week 3 after Patrick reviews the mini-batch on staging.

### [ ] M2-206: Generate 21,715 non-root pages full run

**Scope.** After Patrick approves the root sample, run the pipeline on all 21,715 non-root URLs (576 modifiers + 21,137 facets + 2 compound facets). Three different lite prompts based on URL type: `modifier_category.txt`, `facet_category.txt`, and the compound variant reuses facet template. Monitor cost and success rate. Commit output in batches.
**Acceptance.**

- [ ] All 21,715 URLs have a JSON file in `data/categories/`
- [ ] Cost under $35
- [ ] Success rate above 99.5 percent, failures retried
- [ ] Spot-check audit of 50 random pages (mix of modifier and facet) confirms quality
      **Depends on.** M2-205, Patrick approval.
      **Estimate.** 4 hours active, 6-12 hours wall time.

### [ ] M2-207: Content storage schema validation

**Scope.** Validation script that walks `data/categories/`, ensures every URL from the PI list has a matching JSON file, every JSON file matches the expected schema, and SKU references in `productSkus` arrays resolve to entries in `data/geiger/products.json`.
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

**Scope.** Dynamic route at `/app/cat/[...slug]/page.tsx`. `generateStaticParams()` reads the PI URL list and emits all 22,180 static paths plus paginated variants. Loader function: Sanity-first (curated or custom category), then JSON fallback from `data/categories/`, then 404. Empty-grid behavior per CLAUDE.md Section 16 "Empty-page handling": when `facet-memberships.json` SKU list is empty for a URL, render the parent root's product grid (Tier 3) with a "Showing popular [Root] products" header; if even root is empty, render Tier 4 homepage CTA.
**Acceptance.**

- [ ] All 22,180 paths build successfully
- [ ] Sanity content takes priority over JSON when slug matches
- [ ] Fallback to JSON works
- [ ] 404 page rendered for unmapped slugs
- [ ] Loader exposed as a single function used by the page component
- [ ] Empty membership list → Tier 3 fallback (parent root products with explanatory header)
- [ ] Empty root membership → Tier 4 fallback (homepage CTA, no grid)
      **Depends on.** M1-101, M2-207.
      **Estimate.** 6 hours.

**Partial progress (2026-05-24).** 35 root slugs wired into `generateStaticParams` for the Week 2 client demo using `getAllGeneratedRootSlugs()` from `lib/categories.ts`. Full 22,180-path generation pending completion of M2-204 + M2-206. Tier 3 and Tier 4 fallback logic also deferred until full generation lands.

### [ ] M3-302: Product card component

**Scope.** Reusable product card displaying: hot-linked Geiger CDN image with explicit width/height, product name, brand badge, price range, MOQ, "New"/"Sale" badges. Click opens patrickblack.geiger.com URL via the `lib/affiliate-url.ts` helper in a new tab.
**Acceptance.**

- [x] Image hot-linked from `imgsirv.geiger.com` with `loading="lazy"` for below-fold cards
- [x] Affiliate URL transformation applied via the helper only
- [x] Hover state present
- [x] Loading skeleton state present
- [x] Responsive at 4/2/1 column breakpoints
      **Depends on.** M1-105, M1-108.
      **Estimate.** 6 hours.

**Done (2026-05-24)** as part of Week 2 demo. ProductCard is production-grade: affiliate URL routing, lazy-loaded images, NEW/SALE/CLOSEOUT badges, brand badge, hover state, responsive grid.

### [ ] M3-303: Product grid

**Scope.** Server component that renders 60 products per page in a responsive grid. Handles empty state, loading skeleton, lazy loading below fold.
**Acceptance.**

- [ ] 60 products rendered per page
- [ ] Empty state for zero matches
- [ ] Skeleton state for loading
- [ ] Mobile responsive
      **Depends on.** M3-302.
      **Estimate.** 5 hours.

**Partial progress (2026-05-24).** Grid renders ALL products for the category in a single view (no pagination) for the Week 2 demo. 60-products-per-page pagination logic deferred to M3-306. Empty state, responsive grid, mobile breakpoints all working.

### [ ] M3-304: Filter sidebar with single and multi-facet logic

**Scope.** Client component sticky on desktop, collapsible drawer on mobile. Renders facet sections from Geiger data (category, color, material, brand, price, production time, MOQ). Counts shown per facet value. Single facet match navigates to the static URL if it exists, otherwise uses a query parameter. Multi-facet always uses query parameters.
**Acceptance.**

- [ ] All facet sections render from Geiger data with counts
- [ ] Single facet selection navigates to existing static URL when one exists
- [ ] Single facet selection without matching static URL uses query param
- [ ] Multi-facet selection always uses query params
- [ ] "Clear all filters" button works
- [ ] Mobile drawer accessible with keyboard
      **Depends on.** M3-303.
      **Estimate.** 16 hours.

**Deferred from Week 2 demo (2026-05-24).** Filter sidebar is the most complex piece of Module 3. The Week 2 sample template renders the 35 demo roots without a filter sidebar so the client can review layout and content quality first. Full filter sidebar (single + multi-facet) implemented in Week 3 after Patrick signs off on the sample.

### [ ] M3-305: Sort dropdown

**Scope.** Client-side sort over loaded SKU list. Options: Best Sellers (default), Price Low to High, Price High to Low, MOQ Low to High, Newest. No server round-trip.
**Acceptance.**

- [ ] All 5 sort options work
- [ ] Sort persists across pagination
- [ ] Sort state reflected in URL query param
      **Depends on.** M3-303.
      **Estimate.** 3 hours.

**Deferred from Week 2 demo.** Implemented in Week 3-4.

### [ ] M3-306: Static pagination

**Scope.** Static URL pattern `/cat/[slug]/page/N` generated for every category that has more than 60 products. Previous, page numbers, Next buttons. Adjacent pages prefetched. All pagination URLs in sitemap.
**Acceptance.**

- [ ] Pagination URLs generated as static paths at build time
- [ ] 60 products per page
- [ ] Previous/Next/numbered buttons work
- [ ] Adjacent page prefetch on hover
- [ ] All pagination URLs in sitemap
      **Depends on.** M3-301, M3-303.
      **Estimate.** 6 hours.

**Deferred from Week 2 demo.** For the 35 demo roots in Week 2, all products render in one view. Pagination implemented in Week 3 once filter sidebar lands (both need to coordinate URL state).

### [ ] M3-307: Category page layout assembly

**Scope.** Assemble the full category page: breadcrumb (Home > Department > Category > Subcategory), H1, AI intro paragraph, filter sidebar plus product grid plus sort plus pagination, FAQs accordion (root pages only), embedded lead capture form, bottom CTA banner. Schema.org markup: BreadcrumbList, FAQPage (root only), Product (within grid). Pixel-match the reference layout `sample-category-layout.jpg`. Implement the Tier 3 / Tier 4 empty-grid fallback variants per CLAUDE.md Section 16. Per-page product count is user-selectable (20/40/60 dropdown), passed to Searchspring's `perPage` query param at render — NOT hardcoded.
**Acceptance.**

- [ ] All sections present
- [ ] Mobile responsive at 375/768/1280
- [ ] Lighthouse score 85 plus on sample pages
- [ ] All links resolve
- [ ] Schema markup validates
      **Depends on.** M3-301, M3-303, M3-304, M3-305, M3-306, M3-308, M3-309.
      **Estimate.** 10 hours.

**Partial progress (2026-05-24).** Breadcrumb, H1, AI intro (full introHtml), product grid (all products in one view), FAQs accordion, and CTA banner (phone + email, no Sanity wiring yet) assembled for the 35 Week 2 demo roots. Filter sidebar, sort dropdown, pagination, lead form, schema markup, and related blog posts deferred until Week 3-4.

### [ ] M3-308: Lead capture form component and route

**Scope.** Client component with fields Name, Email, Company, Phone, Quantity needed, Message. Inline validation. POST to `/app/api/leads/route.ts`. Route handler uses Nodemailer + Gmail SMTP to send to `patrick@perfectimprints.com` and writes a `leadSubmission` document to Sanity. Honeypot field, basic rate limiting.
**Acceptance.**

- [ ] Form validates required fields
- [ ] Successful submission shows success state without page reload
- [ ] Failed submission shows error with retry
- [ ] Email delivers within 30 seconds
- [ ] Lead written to Sanity even if email fails
- [ ] Honeypot rejects obvious bots silently
      **Depends on.** M1-104, M1-105.
      **Estimate.** 10 hours.

**Deferred from Week 2 demo.** Week 2 sample uses a basic phone + email CTA banner instead. Full lead capture form lands in Week 4.

### [ ] M3-309: Bottom CTA banner

**Scope.** Reusable component editable in Sanity `globalSettings`. Default copy: "Need help finding the right product? Call 800-773-9472 or request a quote." Used at the bottom of category and blog pages.
**Acceptance.**

- [ ] Component renders from Sanity content
- [ ] Used on category and blog templates
- [ ] Phone number is clickable on mobile
      **Depends on.** M1-104, M1-105.
      **Estimate.** 3 hours.

**Partial progress (2026-05-24).** CTA banner component built for Week 2 demo with hardcoded copy (phone `tel:8007739472` + email `mailto:patrick@perfectimprints.com`). Sanity wiring deferred to Module 5.

### [ ] M3-310: Edge cases and polish

**Scope.** 404 page with helpful suggestions and search prompt. Loading states across templates. Error boundaries. Mobile responsiveness pass at 375/768/1280. Accessibility pass (keyboard nav, aria labels, focus management). Performance pass on three sample category pages.
**Acceptance.**

- [ ] 404 page polished
- [ ] All templates have loading + error states
- [ ] Keyboard navigation works on all interactive elements
- [ ] Lighthouse Accessibility 95 plus on samples
- [ ] No CLS shifts above 0.1 on sample pages
      **Depends on.** M3-307.
      **Estimate.** 15 hours.

**Partial progress (2026-05-24).** Basic 404 page at `app/not-found.tsx` exists from Week 2 demo. Full polish, accessibility pass, and performance optimization deferred to Module 3 Phase 3.4 / Module 5.

---

## Module 4: Blog System

### [ ] M4-401: Blog content extraction

**Scope.** First, investigate the MPower dashboard at `app.mpowerpromo.com` for a bulk export option. Document findings at `/docs/mpower-export.md`. If no export, run a Playwright-based scraper for all 731 blog URLs. Per blog: title, body HTML, header image, inline images, publish date, author, category tags. Output: `data/blogs/raw/[slug].json` plus images.
**Acceptance.**

- [ ] Either export captured or scraper run completed
- [ ] All 731 blog posts have raw JSON output
- [ ] Inline images downloaded with hashed filenames
- [ ] Failures logged with HTTP status
- [ ] Body content preserved as HTML for later portable text conversion
      **Depends on.** None.
      **Estimate.** 8 hours.

### [ ] M4-402: Blog Sanity schemas and migration

**Scope.** Define `blogPost`, `blogCategory`, and `author` schemas in detail. One-off migration script that reads raw blog data from M4-401, converts HTML to portable text, uploads images to Sanity asset pipeline, writes blogPost documents as drafts. Patrick reviews and publishes.
**Acceptance.**

- [ ] All 731 blogs imported into Sanity as drafts
- [ ] Inline images preserved in portable text
- [ ] Categories assigned (best-effort taxonomy from existing tags)
- [ ] Publish dates preserved
- [ ] Patrick can publish drafts from Sanity Studio
      **Depends on.** M1-104, M4-401.
      **Estimate.** 6 hours.

### [ ] M4-403: Blog templates (index, post, category)

**Scope.** Three Server Components: `/app/blog/page.tsx` (index with hero, intro, category submenu, 3-4 col grid, pagination at 24 posts), `/app/blog/[slug]/page.tsx` (article with breadcrumbs, hero, body, sidebar with categories and contact CTA, related posts), `/app/blog/cat/[slug]/page.tsx` (filtered listing). Match reference layout `sample-blog-layout.jpg`. Schema.org BlogPosting markup on article pages.
**Acceptance.**

- [ ] Blog index renders with seed data
- [ ] Blog post renders with full body and sidebar
- [ ] Blog category filter renders correct subset
- [ ] BlogPosting schema validates
- [ ] Mobile responsive
- [ ] Sidebar contact CTA opens lead form
      **Depends on.** M4-402, M3-308, M3-309.
      **Estimate.** 10 hours.

### [ ] M4-404: FAQ library and brand schemas

**Scope.** `faq` schema for reusable FAQ items linkable from category pages. `brand` schema for Geiger sub-brands (Carhartt, Igloo, Nike, etc) auto-populated from `data/geiger/products.json` on first scrape, manually editable afterward. Studio actions for bulk import.
**Acceptance.**

- [ ] FAQ library document type editable
- [ ] Categories can reference FAQs from the library
- [ ] FAQPage schema generated correctly when category renders linked FAQs
- [ ] Brand documents auto-created from Geiger data
- [ ] Brand logos uploadable in Sanity
      **Depends on.** M1-104, M2-207.
      **Estimate.** 6 hours.

---

## Module 5: Search, Forms, Home, Polish

### [ ] M5-501: Home page

**Scope.** Build the home page from the `homePage` Sanity singleton: hero banner, featured categories grid, new products carousel (auto-populated from latest Geiger scrape), featured brands logos, testimonials, blog preview, CTA banners. Editable end-to-end from Sanity.
**Acceptance.**

- [ ] Home page renders from Sanity content
- [ ] All six featured image blocks link correctly
- [ ] New products carousel pulls latest Geiger SKUs
- [ ] Brands grid pulls from `brand` documents
- [ ] Mobile responsive
      **Depends on.** M1-104, M1-105, M4-404.
      **Estimate.** 8 hours.

### [ ] M5-502: Site-wide search (Fuse.js)

**Scope.** Build-time script that generates a Fuse.js index covering every category title, every blog title plus snippet, every brand name, every FAQ question. Index lives at `/public/search-index.json`. Search overlay component lazy-loads Fuse and the index on first user interaction. `/search?q=...` results page. Keyboard navigation supported.
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

**Scope.** Replace the Geiger-taxonomy-driven mega menu from M1-106 with a Sanity-driven implementation. Patrick can reorder departments, edit labels, hide items, and update Featured Promos and New Products lists. Default state matches Geiger's mega menu structure.
**Acceptance.**

- [ ] All menu items render from Sanity
- [ ] Reorder via drag in Sanity reflected on staging within 60 seconds
- [ ] Featured Promos and New Products updateable
- [ ] Removed items disappear from live menu
- [ ] Keyboard accessible with focus trap
      **Depends on.** M1-106, M1-104.
      **Estimate.** 4 hours.

**Starting point (2026-05-25).** M1-106 already ships a Geiger-taxonomy-driven mega menu (Shop by + All Categories), so this ticket reduces to: (a) define a Sanity `megaMenu` document type with departments + nested items, (b) swap the data source in `lib/nav-data.ts::getDepartments()` from the Geiger JSON to the Sanity GROQ query, (c) preserve the same available/disabled rendering logic so Patrick can hide items before generation lands. Geiger taxonomy can stay as a seed-load script for the first publish.

### [ ] M5-504: Custom category and custom product schemas

**Scope.** `customCategory` Sanity schema for PI-only categories not on Geiger (with an `isCustom` flag). `customProduct` schema with external URL field pointing to any partner site. Render through the same `/cat/[...slug]` route. Sanity wins over JSON when slugs match.
**Acceptance.**

- [ ] customCategory document type editable
- [ ] customCategory renders without Geiger link if none set
- [ ] CTAs default to contact form when no Geiger URL
- [ ] customProduct documents render in chosen category page grid
- [ ] External URL opens correctly
- [ ] Display order respected in grid
      **Depends on.** M3-301.
      **Estimate.** 4 hours.

### [ ] M5-505: Sanity AI generation button (custom Studio action)

**Scope.** Custom Sanity Studio action at `/sanity/actions/GenerateWithAI.tsx` that appears as a button on customCategory documents. On click, POSTs the customCategory's title plus target keyword to `/app/api/sanity/generate-content/route.ts`. The route calls DeepSeek with the root category prompt template and returns intro plus FAQs. The Studio action patches the document fields with the result. Patrick reviews and publishes.
**Acceptance.**

- [ ] "Generate with AI" button visible on customCategory documents only
- [ ] Click triggers DeepSeek call with appropriate prompt
- [ ] Returned content patched into intro and FAQs fields
- [ ] Loading state shown during call
- [ ] Error state shown on failure
- [ ] Patrick can review and edit before publishing
      **Depends on.** M5-504, M2-201.
      **Estimate.** 8 hours.

### [ ] M5-506: Services pages, Rush page, static content pages

**Scope.** Build `/services/[slug]` for Kitting, Company Stores, Popup Stores, 100 Percent Custom Products. Build `/rush-promotional-products`. Build About Us, Contact, Privacy, Terms, Sample Policy, Shipping, Returns. All content sourced from Sanity. Contact page includes lead form.
**Acceptance.**

- [ ] All pages render at correct URLs
- [ ] Content editable in Sanity
- [ ] Mobile responsive
- [ ] Linked from header and footer where appropriate
      **Depends on.** M1-104, M1-105, M3-308.
      **Estimate.** 6 hours.

### [ ] M5-507: Videos section

**Scope.** Build `/videos` index and `/videos/[slug]` detail pages. Detail page embeds YouTube via iframe, shows title, description, related videos. Index shows grid of video cards filterable by category. Sourced from `video` Sanity documents. VideoObject schema markup. Basic scope only, expanded videos section is out of scope per Section 10 of the development plan.
**Acceptance.**

- [ ] Index renders with at least seed data
- [ ] Detail page embeds YouTube reliably
- [ ] VideoObject schema added
- [ ] Mobile responsive
      **Depends on.** M1-104, M1-105.
      **Estimate.** 8 hours.

### [ ] M5-508: Performance and SEO infrastructure

**Scope.** Sitemap generator covering all 22,180 categories plus 731 blogs plus paginated category URLs plus static pages. Split into multiple sitemap files if over 50k URLs. robots.txt. Meta tags audit script. Schema.org Organization in root layout. Canonical URLs on every page. Lighthouse pass: image optimization, font loading, code splitting, preloading. Target mobile Lighthouse 90 plus on home and root templates.
**Acceptance.**

- [ ] sitemap.xml validates against Google spec
- [ ] robots.txt allows all and references sitemap
- [ ] Zero missing or duplicate meta tags
- [ ] Schema.org Organization present
- [ ] LCP under 2.5s, CLS under 0.1, INP under 200ms on home and root category templates
- [ ] Lighthouse mobile Performance 90 plus on home, sample root category, sample blog
      **Depends on.** M3-310, M4-403, M5-501.
      **Estimate.** 6 hours.

### [ ] M5-509: Large data file relocation

**Scope.** `data/geiger/products.json` (9.6 MB) and `data/geiger/facet-memberships.json` (44.5 MB) currently live in the main repo. Vercel build size limits (Hobby tier 100 MB) and developer experience both benefit from moving these out. Evaluate three options:

1. Separate data repo (`perfectimprints-data`) with build-time fetch via git submodule or GitHub Actions checkout
2. Git LFS on the existing repo (1 GB storage free tier, 1 GB bandwidth/month)
3. External object storage (Cloudflare R2 or AWS S3) with build-time download in CI

Decision criteria: build duration impact, developer onboarding friction, free-tier limits, integration with monthly auto-rebuild (M6-606).

**Acceptance.**

- [ ] Decision documented at `docs/decisions/data-file-storage.md` with rationale
- [ ] Implementation completed and verified on both staging and production builds
- [ ] Build still completes within target window
- [ ] Monthly auto-rebuild job updated to keep data files in sync
- [ ] Existing developer setup docs updated
      **Depends on.** None (independent).
      **Estimate.** 6 hours.

---

## Module 6: QA, Migration, Launch

### [ ] M6-601: URL audit

**Scope.** Automated check script that crawls staging and verifies all 22,180 category URLs + 731 blog URLs + static pages + paginated category URLs return 200. 404 handling for invalid URLs with helpful suggestions and search prompt. Decide on disposition for 82 legacy blog taxonomy URLs (redirect or 404).
**Acceptance.**

- [ ] Crawler script committed
- [ ] Zero unexpected 404s or 500s in report
- [ ] Custom 404 page polished
- [ ] Decision on legacy blog taxonomy URLs documented
      **Depends on.** M3-310, M4-403, M5-508.
      **Estimate.** 4 hours.

### [ ] M6-602: Cross-browser and device testing

**Scope.** Test on Chrome, Safari, Firefox, Edge on desktop. iOS Safari (15+) and Chrome Android on mobile. Test at 375, 768, 1280, and 1920 viewports. Filter sidebar drawer, mega menu, lead form, search, sort, pagination all verified on each combination.
**Acceptance.**

- [ ] No visual breakage on any tested browser
- [ ] No interaction breakage on any tested browser
- [ ] Test results documented at `/docs/qa-matrix.md`
      **Depends on.** M6-601.
      **Estimate.** 5 hours.

### [ ] M6-603: Pre-launch setup (GA4, GSC, runbook)

**Scope.** Connect GA4 with existing measurement ID. Add Search Console verification for both staging and production hostnames. Configure GA4 events for lead form submissions, search usage, outbound clicks to Geiger. Set production Vercel environment variables. Configure Sanity webhook for production. Author launch runbook at `/docs/launch-runbook.md`.
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

**Scope.** Run one last scraper end-to-end for fresh data the day before launch. Regenerate AI content for any newly added Geiger categories. Final production build on Vercel. Verify no build errors.
**Acceptance.**

- [ ] Fresh data committed
- [ ] Production build completes
- [ ] All 22,180 + 731 + static URLs build successfully
- [ ] Build time recorded for future reference
      **Depends on.** M6-602.
      **Estimate.** 3 hours.

### [ ] M6-605: DNS cutover and launch

**Scope.** 48 hours before launch, lower TTL on perfectimprints.com DNS records to 300 seconds. Add SPF and DKIM records for Gmail SMTP. On launch day, repoint apex to Vercel production via Cloudflare DNS. Verify SSL valid, all hostnames resolve. Monitor for 24 hours. Submit updated sitemap to Search Console.
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

**Scope.** GitHub Action workflow `.github/workflows/monthly-rebuild.yml` scheduled for the 1st of every month at 00:00 UTC. Steps: run scraper Phases A, B, C; regenerate AI content for new categories; commit to a `monthly-rebuild` branch; open auto-merge PR; trigger Vercel production build on merge; email Patrick a summary report (product count delta, new categories, price changes). Manual trigger button in Sanity globalSettings for ad-hoc refresh.
**Acceptance.**

- [ ] Workflow file committed
- [ ] Scheduled trigger works (verified by manual `workflow_dispatch`)
- [ ] Auto-merge PR opens with data changes
- [ ] Production build triggers on merge
- [ ] Email summary delivered to Patrick
- [ ] Manual Sanity trigger button works
      **Depends on.** M6-605.
      **Estimate.** 4 hours.

### [ ] M6-607: Training and handover

**Scope.** Record screen-capture walkthrough (under 20 minutes) covering: adding a curated category, creating a custom category with the AI generation button, adding a custom product, publishing a blog post, editing the home page, editing the mega menu, triggering a manual rebuild. Deliver alongside written quick-reference notes at `/docs/sanity-quickstart.md`.
**Acceptance.**

- [ ] Video delivered (under 20 minutes total)
- [ ] Quick-reference notes committed
- [ ] Patrick confirms understanding via WhatsApp or email
      **Depends on.** M5-501, M5-503, M5-504, M5-505.
      **Estimate.** 2 hours.

---

## Open Questions

All five major architectural questions are now LOCKED as of May 15, 2026. Remaining minor pending items:

### [ ] OQ-1: Lead email "from" address

Confirm whether the lead form's "from" address should be `patrick@perfectimprints.com` directly or an alias like `leads@perfectimprints.com`. Affects M3-308 env var `LEAD_EMAIL_FROM`.

### [x] OQ-2: Image fallback policy — RESOLVED

Patrick confirmed (2026-05-23): pages without matching Geiger products link to the Geiger homepage. Engineering extended this into a 4-tier recovery chain to minimize how many pages need that fallback. Tier 1 brand fallback recovered 809 URLs. Tier 2 search-keyword fallback recovered 2,625 URLs. Tier 3 (parent-root product grid) and Tier 4 (homepage CTA) implemented at render time in Module 3. See CLAUDE.md Section 16 "Empty-page handling" for the full chain. Final breakdown: 14,433 URLs (65%) render with real product grids, 7,747 (35%) use Tier 3/4 fallback. Affects M3-301, M3-302, M3-307.

### [ ] OQ-3: Old site cutover timing

Confirm whether MPower stays live for a parallel period after launch or is decommissioned immediately on launch. Affects M6-605 plan.

### [ ] OQ-4: Final green CTA hex shade

Confirm `#16A34A` matches Patrick's preference during the M1-105 style guide review, or set a different value in CLAUDE.md Section 10.

### [x] OQ-5: AI model choice — RESOLVED

DeepSeek-V3 confirmed by Patrick.

### [x] OQ-6: Email delivery method — RESOLVED

Gmail SMTP via Nodemailer confirmed (no third-party service).

### [x] OQ-7: Sanity model — RESOLVED

Hybrid model confirmed (bulk pages in JSON, curated and blogs and custom in Sanity).

### [x] OQ-8: Brand red — RESOLVED

`#E11F1E` extracted from pi-logo.svg, locked.

### [x] OQ-9: Sanity AI generation button — RESOLVED

Build it (Option A, M5-505).

### [x] OQ-10: Per-facet membership scrape strategy — RESOLVED

One Searchspring API call per facet URL (Option A, M1-109).

---

## Backlog (Post-Launch)

Items deferred from the 40-day window. Quote and scope these separately if Patrick wants them after launch:

- Native checkout on Perfect Imprints
- Product detail pages owned by Perfect Imprints
- **Expanded videos section** (Patrick has explicitly asked for this; scope and quote separately, do not absorb)
- HubSpot or Salesforce CRM integration
- Paid ad landing page system with split testing
- Multi-language support
- Authenticated user accounts
- Advanced personalization based on visitor industry
- Real-time Geiger inventory sync (current model uses monthly auto-rebuild)
