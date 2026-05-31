# Internal Development Plan

**Project:** Perfect Imprints rebuild
**Developer:** Ali Hamza Rao
**Client:** Patrick Black (perfectimprints.com)
**Contract:** $6000 fixed via Fiverr (15% paid May 5, 2026)
**Today:** May 26, 2026 (Week 3 start)
**Patrick's expected launch:** June 19, 2026 (final 10% payment date)
**Internal realistic launch:** July 9, 2026 (3 week internal buffer)

> Yeh internal doc hai. Client ke saath share nahi karna. Roman Urdu mix mein hai jaisa main soch ke kaam karta hoon. Client wala professional version `development-plan.md` mein hai.

---

## 0. Project Model (Pehle Yeh Clear Rakho)

Teen websites involved hain:

**1. perfectimprints.com (OLD PI, replace ho rahi hai)**

- Patrick ki existing live site
- URL pattern: `/cat/[slug]` aur `/cat/[root]/[facet-type]/[facet-value]`
- 465 root categories + 21,715 facet pages = **22,180 total category URLs**
- 731 blog articles
- Yeh sab URLs preserve karne hain SEO equity ke liye
- Old PI ke products discard kar rahe hain (different supplier brands, hum Geiger pe shift kar rahe hain)

**2. geiger.com (data source, scrape karna hai)**

- Alag company hai
- URL pattern: `/b/[slug]` for categories, `/p/[slug]-[id]` for products
- ~544 categories, ~7,957 unique SKUs (verified 2026-05-24)
- Searchspring API (siteId=`kfx28d`) ke through scrape hoga
- Brand index at `https://www.geiger.com/c/shop-by-brand` (static HTML, ~200-300 brands)

**3. patrickblack.geiger.com (affiliate target)**

- Geiger ne Patrick ke liye banaya hai (ya banayega)
- Patrick confirmed 2026-05-25: subdomain NOT yet active on Geiger's side, chasing them
- Same URL structure as geiger.com, sirf `www` → `patrickblack`
- Hamare product cards yahin link karenge, Patrick ko commission milti hai

**Hamara kaam:** New PI banao jo old PI ke 22,180 URLs preserve kare, Geiger ke products dikhaye (scraped), aur product card click karne pe user ko patrickblack.geiger.com pe le jaye.

PI pe product detail pages NAHI bani. Patrick ne confirm kiya. Hum sirf SEO funnel + content layer hain.

---

## 0.5 Current State (Snapshot as of 2026-05-26, Week 3 Start)

Yeh section live update hota rahega project ke through.

**Where we are:** Week 3 start. Week 2 demo delivered Sunday May 25. Patrick approved content quality and gave green light for full 22,180-page generation. Eid-ul-Adha holiday Wed May 27 + Thu May 28, work resumes Friday May 29.

**What's done:**

- Module 1 complete: 544 Geiger categories, 7,957 SKUs, 21,715 non-root URLs processed, 465/465 PI roots mapped
- Phase C: 13,968 URLs with products, 7,518 zero, 229 errors. Tier 1+2 recovery applied (3,434 URLs recovered)
- Module 2 Week 2 demo: 35 top root pages generated, $0.065 total cost across 4 rounds
- Module 3 Week 2 demo: production category page template — routing, ProductCard, ProductGrid, AI content, FAQs, CTA banner, 404. Build clean (52 static pages, 0 errors)
- Week 2 demo delivered to Patrick Sunday May 25 with 5 sample URLs on `dev.perfectimprints.com`
- Patrick reviewed Monday May 26 — content tone APPROVED, full generation GREEN-LIT
- Infrastructure: Vercel, Sanity Studio, DeepSeek API all working

**Patrick's Week 2 demo feedback (acceptance recorded 2026-05-25):**

Quick fixes (Week 3):

- HTML entity bug in product titles (`&amp;`, `&quot;`)
- Image fallback when Geiger image 404s
- H2 "Custom [Category] Buying Guide" above bottom text
- Buying-guide format content (400-600 words, keyword derivatives, structured sections like Stadium Seat Cushions blog)
- Full 22,180 page content generation
- Pagination with noindex on page 2+

Scope additions (Weeks 4-5):

- "Minimum Quantity" filter (Patrick's addition, useful for small-order buyers)
- "Search within this category" input in filter sidebar
- Context-specific filters (apparel/drinkware/tech show extra filters)
- Related Blogs section ("Related Blogs About [Category]" H2 with up to 8 blog cards)
- Brands main menu button + `/brands` index + `/brands/[slug]` per-brand pages
- Brand logos scrape (Patrick chose Option 1: auto-scrape)
- Deals main menu button + `/deals` aggregator page
- Mobile pagespeed improvement (LCP + Speed Index)

Already built (just confirming to Patrick):

- Sale/Closeout ribbon on product images — will show on closeout pages once full generation completes
- Monthly auto-rebuild — already planned as M6-606
- Image fallback policy — Tier 1-4 recovery chain already in place, plus new onError handler tracked in M3-302

**What's planned for Week 3 (May 29 - June 4):**

Day 1 (Friday May 29):

- HTML entity fix in `lib/categories.ts` (loader-level)
- Image fallback `onError` handler in ProductCard
- H2 `Custom [Category] Buying Guide` component addition
- Upgrade `root_category.txt` prompt to buying-guide v2 format
- Delete existing 35 demo JSONs, regenerate with v2
- Patrick spot-check 2-3 outputs

Day 2-3 (Sat-Sun May 30-31):

- Generate remaining 430 root pages with v2 prompt
- Build out facet + modifier prompt templates
- Generic `generate_content.py` pipeline

Day 3-5 (Mon-Wed June 1-3):

- Generate all 21,715 non-root pages
- Static pagination with noindex on page 2+
- Patrick payment request for Week 3

Day 5 (Wed June 4):

- Week 3 review with Patrick

**Eid schedule:**

- Wed May 27 — Eid Day 1, fully offline
- Thu May 28 — Eid Day 2, fully offline
- Fri May 29 — resume work

**Patrick payment status:**

- Week 2 payment request sent post-demo with Eid bonus ask (polite, "no pressure")
- Patrick acknowledged Eid neutrally — bonus decision is his, no follow-up on bonus from our side
- Week 3 payment request to be sent normally without Eid mention

**Big data files note:** `products.json` (9.6 MB) and `facet-memberships.json` (44.5 MB) in main repo. Relocation tracked as M5-509.

---

## 1. Locked Decisions (Ab Yeh Sab Final)

| Decision              | Choice                                       | Reason                                                             |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Pagination URL        | Static `/cat/[slug]/page/N`                  | SEO friendly, link equity preserve                                 |
| Pagination indexing   | **Page 1 indexable, page 2+ noindex**        | Patrick request 2026-05-25, prevents duplicate content             |
| AI content format     | **Buying-guide v2 on roots, lite on facets** | Patrick request 2026-05-25, 400-600 words with keyword derivatives |
| Sanity AI button      | Build it (Option A, 8 hours)                 | Patrick will create custom categories regularly                    |
| Per-facet membership  | 1 API call per facet (~6h)                   | Bulletproof accuracy                                               |
| Product detail scrape | **NO**                                       | PI pe detail pages nahi hain                                       |
| Module structure      | 6 modules (M1+M2 merged)                     | Less artificial separation                                         |
| Data refresh strategy | One-time scrape + monthly auto-rebuild       | Industry standard                                                  |
| Hosting               | **Vercel** (not Cloudflare Pages)            | Edge Runtime incompatible with Sanity Studio                       |
| Brand logos           | **Scrape from Geiger** (Patrick choice)      | Patrick said "I'd never be able to manually add that many logos"   |
| HTML entity decoding  | **Loader level only** (`lib/categories.ts`)  | Single source of truth, components stay clean                      |
| Image fallback        | **Tier 1-4 recovery + per-image onError**    | Two layers: data-side + render-side                                |

---

## 2. Week-by-Week Plan

**Week 1 (May 15-21):** Foundation + Module 1 scaffold. DONE.
**Week 2 (May 22-28):** Module 1 completion + Week 2 demo (35 sample pages). DONE. Demo Sun May 25.
**Week 3 (May 29-Jun 4):** Buying-guide prompt upgrade + full 22,180 page generation + pagination.
**Week 4 (Jun 5-11):** Filters (with Min Qty, search-within, context-specific) + sort + lead form + blog migration + brand scrape + brand pages + related blogs section.
**Week 5 (Jun 12-18):** Home page + search + Deals page + mega menu Sanity wiring + mobile pagespeed + schema markup.
**Week 6 (Jun 19-25):** QA + URL audit + cross-browser + DNS prep + monthly auto-rebuild + training.

Patrick's expected launch: June 19. Internal realistic: July 9 (3 week buffer for revisions, scope absorption, polish).

---

## 3. Module 1: Foundation + Data Pipeline (~50h total)

### Sub-module 1A: Project Scaffold (8h) — DONE

- Next.js 15 App Router + TypeScript strict + Tailwind + pnpm
- Folder structure per CLAUDE.md Section 5
- ESLint, Prettier, Husky pre-commit
- GitHub repo + branch protection

### Sub-module 1B: Vercel Staging (4h) — DONE

- Connect repo to Vercel
- `dev.perfectimprints.com` CNAME via Cloudflare DNS (DNS-only mode)
- HTTPS auto-issued, env vars set

### Sub-module 1C: Sanity Studio Bootstrap (6h) — DONE

- Sanity v3, Project ID `ii96lcy9`, dataset `production`
- Embedded at `/admin` + standalone at `localhost:3333`
- Initial schemas: homePage, globalSettings, megaMenu (singletons)
- Webhook for ISR revalidation

### Sub-module 1D: Global Layout Components (8h) — DONE

- Header, Footer, mega menu shell (M5-503 will wire to Sanity)
- Brand button styles, typography, spacing tokens
- `/style-guide` route

### Sub-module 1E: Python Scraper Development (16h) — DONE

Path: `scripts/scrapers/geiger/`

Files:

```
config.py          # siteId, base URLs, throttle settings
client.py          # httpx HTTP/2 + curl_cffi for Cloudflare bypass
discover.py        # Phase A: parse mega menu, extract category tree
products.py        # Phase B: Searchspring API pagination per leaf
memberships.py     # Phase C: per-facet API call + 4-tier recovery
mapping.py         # Phase D: fuzzy-match 465 PI roots to Geiger
brand_logos.py     # Phase E: NEW (Week 4) — brand logo scrape
mapping_overrides.json
run.py             # entrypoint with --phase flag
checkpoint.py
requirements.txt
README.md
```

**Phase A: Taxonomy discovery (~minutes)** — DONE. 544 categories, 482 leaves.

**Phase B: Product catalog (~20-40 min)** — DONE. 7,957 unique SKUs.

**Phase C: Facet memberships (~6 hours)** — DONE. 13,968 with products, 7,518 zero, 229 errors. Tier 1+2 recovery applied (3,434 URLs recovered).

**Phase D: PI mapping (~10 min)** — DONE. 465/465 mapped, 0 unmapped.

**Phase E: Brand logo scrape (NEW, scheduled Week 4)**

- Added 2026-05-26 per Patrick feedback
- Visit `https://www.geiger.com/c/shop-by-brand` (static HTML A-Z index)
- For each brand link, follow to brand page and download logo image
- Output: `data/geiger/brand-logos/{slug}.{webp|png|jpg}` + `data/geiger/brands.json`
- Brand metadata includes name, slug, logo path, product count from products.json
- Runtime: 30-60 min
- Runs as part of monthly auto-rebuild

### Sub-module 1F: First Full Scrape Run (8h) — DONE

Full reports at `docs/scrape-results.md`. 482 leaves, 7,957 SKUs, 465/465 mapped, 14,433 URLs with real grids.

**Acceptance criteria for M1: ALL MET**

- [x] dev.perfectimprints.com accessible
- [x] Patrick can log into Sanity, edit, see changes
- [x] All 4 scraper phases run successfully (Phase E scheduled Week 4)
- [x] 7,957 products in products.json (99.82% of Geiger's 7,971)
- [x] 465/465 PI roots resolved

---

## 4. Module 2: AI Content Generation (~38h total, +3h for buying-guide v2 upgrade)

### Sub-module 2A: DeepSeek Client Setup (4h) — DONE

- Client at `scripts/ai-pipeline/deepseek_client.py`
- Retry logic, cost tracking, dry-run mode
- DeepSeek V3 pricing: input $0.27/M tokens, output $1.10/M tokens
- Mini-batch ran at $0.00105 per page (much lower than original $0.025 estimate)

### Sub-module 2B: Prompt Templates (6h base + 3h v2 upgrade)

**`prompts/root_category.txt` v1 — DONE 2026-05-24**

- Generated 35 demo pages for Week 2
- Patrick approved content quality 2026-05-25
- Requested upgrade to buying-guide format

**`prompts/root_category.txt` v2 — buying-guide format (Week 3 Day 1-2)**

Added 2026-05-26 per Patrick feedback. New output structure:

- SEO H1, meta title, meta description (same as v1)
- **`introHtml`** (1-2 paragraphs, 150-250 words) — hero intro above grid
- **`buyingGuideHtml`** (400-600 words) — structured buying guide below grid
- **`buyingGuideH2`** = `Custom [Category Name] Buying Guide` — explicit H2 string
- 5 FAQs with answers
- Hero alt text

Buying guide sections required:

1. What buyers should look for when ordering this category
2. Materials, build quality, durability considerations
3. Common use cases and which buyer personas each fits
4. Decoration and customization options (screen print, embroidery, laser engraving, full-color, debossing)
5. Quantity guidance and MOQ context
6. Tips to avoid common buying mistakes

Keyword derivatives to inject naturally throughout buying guide:

- `custom [category]`, `promotional [category]`, `branded [category]`, `personalized [category]`, `logo [category]`, `bulk [category]`, `wholesale [category]`

Reference tone: `https://www.perfectimprints.com/blog/buying-guide-for-stadium-seat-cushions`

**`prompts/modifier_category.txt`** — Week 3, lite template for 576 modifier pages

- Per modifier intent (closeout/sale/no-minimum/production-time/eco-friendly/search/material)
- H1 combining root + modifier, meta, 1 short intro (60-80 words)
- No FAQs, no buying guide

**`prompts/facet_category.txt`** — Week 3, lite template for 21,137 facets + 2 compound

- H1 long-tail keyword, meta, 1 short intro paragraph (60-80 words)
- No FAQs, no buying guide

### Sub-module 2C: Content Generation Pipeline (8h)

`scripts/ai-pipeline/generate_content.py` — Week 3

- Reads PI URL list + mapping
- Per URL: load Geiger context, select template by type, call DeepSeek, save JSON
- Resumable, dry-run, per-batch cost report
- `post_process_lengths()` safety net (truncate at word boundary) applied to every output

### Sub-module 2D: Week 2 Mini-batch (5h) — DONE

Top 35 root categories by Geiger product count. Generated 2026-05-24 for Sunday May 25 demo. $0.065 cumulative cost across 4 rounds. EXCLUDED_SLUGS final list has 11 entries. SKU filtering uses 3 modes: `full`, `slug-filtered`, `full-capped-60`. Compound-noun H1 rule + HARD LIMIT reinforcement added to prompt.

### Sub-module 2E: Week 3 Full Generation (Week 3, ~15h active + 8-12h wall)

Step 1: Regenerate 35 demo pages with v2 buying-guide prompt

- Delete all existing JSONs at `data/categories/`
- Run mini-batch script with v2 prompt
- Patrick spot-checks 2-3 outputs for new format
- Cost: ~$0.10 (heavier content per page)

Step 2: Generate remaining 430 root pages

- Run generic pipeline on the other 430 root URLs
- Cost: ~$1.30

Step 3: Generate 21,715 non-root pages

- Run on modifier + facet + compound facet URLs
- Cost: ~$22-25 (heaviest batch, mostly lite content)

**Total Week 3 generation cost estimate:** ~$25 (was $50 budget, 50% savings due to DeepSeek pricing)

**Acceptance criteria for M2:**

- [x] DeepSeek client working
- [x] Root v1 prompt delivered for Week 2 demo
- [ ] Root v2 prompt with buying-guide format delivered
- [ ] 35 demo pages regenerated with v2, Patrick approved
- [ ] Remaining 430 root pages generated
- [ ] All 21,715 non-root pages generated
- [ ] Zero schema violations, zero length violations
- [ ] Cost under $30 total

---

## 5. Module 3: Category Page Templates (~85h total, +5h for Patrick additions)

### Sub-module 3A: Page Routing (6h)

- `/app/cat/[...slug]/page.tsx` with `generateStaticParams`
- Loader: Sanity → JSON fallback → 404
- Tier 3 (parent-root grid with explanatory header) at template layer
- Tier 4 (homepage CTA) at template layer

**Phase 3.1 status (Week 2 demo): PARTIAL.** 35 root slugs wired in. Full 22,180 paths pending M2-206.

### Sub-module 3B: Product Card (6h base + 3h Week 3 additions) — SUBSTANTIALLY DONE

Hot-linked Geiger CDN image, name, brand badge, price, MOQ, NEW/SALE/CLOSEOUT badges, affiliate URL via helper.

**Phase 3.1 status: DONE for Week 2 demo.**

**Week 3 additions per Patrick feedback (2026-05-25):**

1. **HTML entity decoding** at loader level in `lib/categories.ts::getProductsForCategorySlug`
   - Decode: `&amp;`, `&quot;`, `&#039;`, `&apos;`, `&lt;`, `&gt;`, `&nbsp;`, `&reg;`, `&trade;`, `&copy;`
   - Centralized so all consumers get clean strings
2. **Image fallback `onError` handler** in ProductCard
   - When Geiger CDN returns 404 for a product image (between monthly rebuilds), swap to placeholder
   - Use `/public/placeholder-product.svg` or inline SVG with product name text
   - Monthly auto-rebuild handles full product removal, this is the between-rebuild safety net

### Sub-module 3C: Product Grid (5h)

Responsive 4/3/2/1 cols. 60 products per page (pagination logic in M3-306).

**Phase 3.1 status (Week 2 demo): PARTIAL.** All products in one view for demo. 60/page in Week 3.

### Sub-module 3D: Filter Sidebar (18h, was 16h, +2h for Patrick additions)

Sticky on desktop, drawer on mobile. Patrick filter list confirmed 2026-05-25.

**Universal filters:**

- Category (subcategories within current root)
- Color
- Material
- Brand
- Price range
- Production Time
- **Minimum Quantity (NEW, Patrick's addition)** — Range buckets: 1-25, 26-50, 51-100, 101-250, 251-500, 500+
- New Items toggle
- Made in USA / Eco-Friendly / Deals (refine_by tags)
- Full Color Print

**Context-specific filters (render only on matching category):**

- Apparel: Gender, Sleeve Length, Apparel Style
- Drinkware: Ounces
- Tech: USB Size
- Writing Instruments: Pen Style

**"Search within this category" input (NEW, Patrick addition 2026-05-25):**

- At top of filter sidebar
- Debounced 150ms, filters loaded product grid by name match
- No server round-trip
- Resets when filters change

**Filter URL logic:**

- Single facet match with existing static URL → navigate to that URL
- Single facet without static URL → query param (`?color=blue`)
- Multi-facet → always query params

**Phase 3.1 status: DEFERRED.** Implemented Week 4 after full generation completes.

### Sub-module 3E: Sort Dropdown (3h)

Best Sellers (default), Price Low-High, Price High-Low, MOQ Low-High, Newest. Client-side sort.

**Phase 3.1 status: DEFERRED to Week 4.**

### Sub-module 3F: Static Pagination (6h)

URL pattern `/cat/[slug]/page/N`. 60 products per page. Previous/Next/numbered buttons. Adjacent page prefetch.

**Patrick feedback addition (2026-05-25): Page 2+ non-indexable.**

- Page 1: indexable, canonical points to clean root URL (`/cat/water-bottles` NOT `/cat/water-bottles/page/1`)
- Page 2+: `noindex,follow` meta robots tag + canonical pointing to page 1
- Only page 1 URLs in sitemap

**Phase 3.1 status: Week 3.**

### Sub-module 3G: Page Layout Assembly (10h)

**Order on root pages:**

1. Breadcrumb
2. H1
3. Hero intro (`introHtml`)
4. Filter sidebar + product grid + sort + pagination
5. **H2 "Custom [Category] Buying Guide"** (NEW, Patrick)
6. **Buying guide content** (`buyingGuideHtml`) (NEW, Patrick)
7. FAQs accordion
8. **Related Blogs section** (NEW, Patrick) — see Sub-module 3K
9. Lead capture form
10. CTA banner

Schema.org markup: BreadcrumbList, FAQPage (root only), Product (within grid).

**Phase 3.1 status (Week 2 demo): PARTIAL.** Breadcrumb, H1, intro, grid, FAQs, CTA done. Buying guide, related blogs, lead form, schema deferred to Week 3-4.

### Sub-module 3H: Lead Capture Form (10h)

Name, Email, Company, Phone, Quantity, Message. POST to `/app/api/leads/route.ts`. Nodemailer + Gmail SMTP to patrick@perfectimprints.com. leadSubmission document in Sanity. Honeypot + rate limit.

**Phase 3.1 status: DEFERRED to Week 4.** Week 2 demo uses phone + email CTA banner.

### Sub-module 3I: CTA Banner (3h)

Reusable, editable in Sanity globalSettings. Default: "Need help finding the right product? Call 800-773-9472 or request a quote".

**Phase 3.1 status: PARTIAL.** Hardcoded version (phone + email) built for Week 2 demo. Sanity wiring in Module 5.

### Sub-module 3J: Polish + Edge Cases (15h)

404 page, loading states, error boundaries, mobile responsiveness (375/768/1280), accessibility, performance pass.

**Phase 3.1 status: PARTIAL.** Basic 404 built. Full polish Phase 3.4 / Module 5.

### Sub-module 3K: Related Blogs Section (4h) — NEW

Added 2026-05-26 per Patrick feedback. Component `components/category/RelatedBlogsSection.tsx`.

- H2: `Related Blogs About [Category Name]`
- Up to 8 blog cards, blogs tagged with matching category
- Card: thumbnail, title, excerpt (120 chars), date, link to `/blog/[slug]`
- Hidden if zero matches
- Server component, no client fetch
- Renders only on `type=root` pages, below buying guide section

Depends on M4-402 (blog migration with category tags).

**Acceptance criteria for M3:**

- [ ] `/cat/water-bottles` renders correctly with all sections
- [ ] `/cat/water-bottles/material/stainless-steel` shows correct filtered subset
- [ ] Filter sidebar with Min Qty + search-within + context-specific filters
- [ ] Page 1 indexable, page 2+ noindex
- [ ] Lead form delivers email within 30 seconds
- [ ] All 22,180 pages successfully build
- [ ] Lighthouse > 85 on sample category pages
- [ ] Mobile responsive on all breakpoints

---

## 6. Module 4: Blog System + Brand Pages (~36h, +6h for brand pages)

### Sub-module 4A: Blog Scrape (8h)

Attempt clean export from MPower at `app.mpowerpromo.com`. If fails, Playwright fallback for 731 URLs. Per blog: title, body HTML, header image, inline images, date, author, category tags. Output: `data/blogs/raw/[slug].json` + images.

### Sub-module 4B: Blog Sanity Schemas + Migration (6h)

`blogPost`, `blogCategory`, `author` schemas. Migration script: raw HTML → portable text, upload images, write drafts. **Each blogPost carries category tags mapping to PI root slugs** (needed for Related Blogs section M3-311 / 3K).

### Sub-module 4C: Blog Templates (10h)

`/blog` (index), `/blog/[slug]` (article), `/blog/cat/[slug]` (category filter). Reference: `sample-blog-layout.jpg`. BlogPosting schema markup.

### Sub-module 4D: FAQ Library + Brand Schema (6h)

`faq` schema for reusable FAQ items. `brand` schema auto-populated from `data/geiger/brands.json` (Phase E output). Logos imported from `data/geiger/brand-logos/` into Sanity assets.

### Sub-module 4E: Brand Index + Per-Brand Pages (6h) — NEW

Added 2026-05-26 per Patrick feedback.

**`/brands` route (static index)**

- All brands grouped A-Z, similar to Geiger's `/c/shop-by-brand`
- Each brand: logo + link to `/brands/[slug]`
- Generated from `data/geiger/brands.json`
- Anchor links for A-Z scroll

**`/brands/[slug]` route (per-brand)**

- H1 like "Custom [Brand] Promotional Products"
- Brief AI-generated intro about the brand
- Full product grid filtered to that brand
- Same ProductCard, affiliate links through normally

Mega menu addition (handled in M5-503): "Brands" main menu item linking to `/brands`.

**Acceptance criteria for M4:**

- [ ] All 731 blogs render with original URLs preserved
- [ ] Patrick can author + publish from Sanity
- [ ] Blog search + category filter functional
- [ ] `/brands` and `/brands/[slug]` pages live
- [ ] Brand logos display correctly
- [ ] Related Blogs section data flow working

---

## 7. Module 5: Search, Forms, Home, Deals, Polish (~51h, +5h for Deals page)

### Sub-module 5A: Home Page (8h)

Sanity-driven hero, featured categories, new products carousel, brands grid, testimonials, blog preview, CTA banners. From `homePage` singleton.

### Sub-module 5B: Site-wide Search (Fuse.js) (8h)

Build-time index. Covers 22,180 categories + 731 blogs + brands + FAQs. `/public/search-index.json`. Header search bar with autocomplete. `/search?q=...` results page. Lazy load Fuse + index on first interaction.

### Sub-module 5C: Mega Menu Population (4h + new menu items)

Replace hardcoded shell with Sanity-driven structure. **Adds two new main menu items per Patrick (2026-05-25):**

- **Deals** link to `/deals` (see Sub-module 5H)
- **Brands** link to `/brands` (see Sub-module 4E)

### Sub-module 5D: Custom Category/Product Schemas + AI Button (10h)

`customCategory` and `customProduct` Sanity schemas. AI generation button calls DeepSeek with **v2 buying-guide prompt** to auto-fill intro + buying guide + FAQs.

### Sub-module 5E: Performance Pass (8h, was 6h)

Per Patrick feedback (2026-05-25): mobile LCP + Speed Index improvements.

- Preload hero image with `<link rel="preload" as="image">`
- Preload primary font (Inter)
- Defer non-critical scripts
- Hot-linked Geiger images with explicit dimensions + sizing hints
- Bundle analysis, code splitting
- Target mobile Lighthouse 90 plus on home + root templates
- Target Speed Index improvement 30%+ on previously tested URL

### Sub-module 5F: SEO Infrastructure (4h)

Sitemap generator (22,180 categories + 731 blogs + brands + deals page + static, ONLY page 1 for paginated). Robots.txt. Meta tags audit. Schema.org Organization. Canonical URLs.

### Sub-module 5G: Large Data File Relocation (6h)

Move `products.json` (9.6 MB) and `facet-memberships.json` (44.5 MB) out of main repo. Three options to evaluate. Documented at `docs/decisions/data-file-storage.md`.

### Sub-module 5H: Deals Page + Menu Button (5h) — NEW

Added 2026-05-26 per Patrick feedback.

**`/deals` route (static landing page)**

- Aggregates all on-sale and closeout products from `data/geiger/products.json`
- Filter logic: `is_on_sale=true` OR badge tag in [`sale`, `deals`, `closeout`]
- Same ProductCard, SALE/CLOSEOUT ribbons visible
- AI-generated H1 and intro OR Sanity-editable hero copy
- Pagination if more than 60 products
- Mobile responsive
- BreadcrumbList schema

Mega menu addition (handled in 5C): "Deals" main menu item.

**Acceptance criteria for M5:**

- [ ] Home page complete + editable
- [ ] Search finds categories/blogs/brands within 300ms
- [ ] Sitemap validates
- [ ] Lighthouse > 90 mobile on home + 3 sample category pages
- [ ] Patrick can create custom category with AI-generated buying-guide content
- [ ] Large data files relocated
- [ ] `/deals` page live with proper aggregation

---

## 8. Module 6: QA, Migration, Launch (~26h)

### Sub-module 6A: URL Audit (4h)

All 22,180 + 731 + brands + deals + static URLs return 200. Custom 404 with suggestions.

### Sub-module 6B: Cross-browser Testing (5h)

Chrome, Firefox, Safari, Edge on desktop. iOS Safari, Chrome Android on mobile. 375/768/1280/1920 viewports.

### Sub-module 6C: Pre-launch Setup (4h)

GA4, GSC verification, event tracking (lead form, search, outbound clicks). Production env vars. Launch runbook.

### Sub-module 6D: Final Scrape Refresh (3h)

Run scraper Phases A, B, C, E one last time. Regenerate AI content for any new categories. Final production build.

### Sub-module 6E: DNS Cutover (3h)

Lower TTL 48h prior. Add SPF + DKIM for Gmail. Repoint apex day-of. Submit sitemap. Monitor 24h.

### Sub-module 6F: Monthly Auto-Rebuild Scheduler (4h)

GitHub Action 1st of every month, 00:00 UTC. Runs Phases A, B, C, E. Regenerates new AI content. Detects removed products. Email summary to Patrick. Manual trigger in Sanity.

### Sub-module 6G: Training + Handover (2h)

Screen-capture under 20 min. Quick-reference notes at `/docs/sanity-quickstart.md`.

**Acceptance criteria for M6:**

- [ ] Live at perfectimprints.com
- [ ] Zero 404s on all URLs
- [ ] Lead form working in production
- [ ] Monthly auto-rebuild verified
- [ ] Brand logos refreshing on monthly rebuild
- [ ] Patrick signs off

---

## 9. Time + Payment Summary (UPDATED 2026-05-26)

| Module                            | Hours   | Weeks | End Date         |
| --------------------------------- | ------- | ----- | ---------------- |
| 1: Foundation + Data Pipeline     | 54      | 1-4   | (Phase E Week 4) |
| 2: AI Content Generation          | 38      | 2-3   | June 4           |
| 3: Category Page Templates        | 89      | 2-5   | June 18          |
| 4: Blog System + Brand Pages      | 36      | 4     | June 11          |
| 5: Search/Forms/Home/Deals/Polish | 51      | 5     | June 18          |
| 6: QA/Migration/Launch            | 26      | 6     | June 25          |
| **Total**                         | **294** | **6** | **June 25**      |

**Rate analysis (revised):**

- Original budget: $6000 / 266 hours = $22.55/hr
- New scope: $6000 / 294 hours = $20.40/hr
- Scope additions absorbed: ~28 hours
- Cost savings on Module 2 (DeepSeek): ~$25 vs $50 budget (~$25 saved)
- Net impact: still profitable, no client conversation needed about scope creep

**Scope additions tracked since contract signing:**

1. Sub-module 2D-prime mini-batch (5h) — Week 2 demo
2. Sub-module 5G data file relocation (6h) — added 2026-05-24
3. **Phase E brand logo scrape (4h)** — added 2026-05-26
4. **Sub-module 4E brand index + per-brand pages (6h)** — added 2026-05-26
5. **Sub-module 5H deals page + menu button (5h)** — added 2026-05-26
6. **Sub-module 3K related blogs section (4h)** — added 2026-05-26
7. **Minimum Quantity filter + search-within-category (2h)** — added 2026-05-26
8. **Mobile pagespeed extra optimization (2h)** — added 2026-05-26
9. **Buying-guide v2 prompt upgrade (3h)** — added 2026-05-26

Total scope addition: 37 hours. Absorbed into the $6000 contract.

**Payment vs reality:**

- Patrick's payment schedule ends June 19 with launch payment
- Internal launch target: June 25 (1 week past)
- **Risk:** Final 10% payment might be held if launch slips past June 19
- **Mitigation:** Front-load critical milestones, deliver staging-ready by June 19, give Patrick walkthrough early. Last week is QA + polish + launch coordination.
- **Week 2 demo (May 25):** Delivered. Patrick approved content quality. Confidence built.

---

## 10. Patrick Dependencies (Track Status)

| Dependency                             | Status            | Notes                       |
| -------------------------------------- | ----------------- | --------------------------- |
| DeepSeek API key                       | RECEIVED          | Working as of Week 2        |
| Gmail app password                     | PENDING           | Needed for M3-308 lead form |
| Sanity account                         | DONE              | Project under Patrick       |
| Vercel account                         | DONE              | Patrick's account           |
| GA4 measurement ID                     | PENDING           | Needed for M6-603           |
| Final green hex shade                  | PENDING           | OQ-4                        |
| Lead form "from" address               | PENDING           | OQ-1                        |
| Old site cutover plan                  | PENDING           | OQ-3                        |
| **patrickblack.geiger.com activation** | PENDING ON GEIGER | Patrick chasing them        |

---

## 11. Risk Log (Track Throughout)

| Risk                                                          | Likelihood | Impact | Mitigation                                                                    |
| ------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------- |
| Geiger doesn't activate patrickblack.geiger.com before launch | MEDIUM     | LOW    | Env var `NEXT_PUBLIC_GEIGER_HOST` allows temporary fallback to www.geiger.com |
| Patrick wants more scope additions Week 4-5                   | MEDIUM     | MEDIUM | 28h already absorbed; if more, propose post-launch quote separately           |
| Large data files cause Vercel build issues                    | LOW        | HIGH   | M5-509 relocation planned, has 3 fallback options                             |
| Buying-guide v2 prompt quality not great                      | LOW        | MEDIUM | Spot-check with Patrick after 35 regen before running on 22,145               |
| Mobile pagespeed targets not hit                              | LOW        | LOW    | Sub-module 5E has 8h budgeted, multiple optimization avenues                  |
| Blog migration discovers MPower export not available          | MEDIUM     | LOW    | Playwright fallback already budgeted                                          |
