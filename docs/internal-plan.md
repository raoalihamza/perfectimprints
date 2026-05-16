# Internal Development Plan

**Project:** Perfect Imprints rebuild
**Developer:** Ali Hamza Rao
**Client:** Patrick Black (perfectimprints.com)
**Contract:** $6000 fixed via Fiverr (15% paid May 5, 2026)
**Today:** May 15, 2026
**Patrick's expected launch:** June 19, 2026 (final 10% payment date)
**Internal realistic launch:** July 9, 2026 (1 week internal buffer)

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
- ~350-500 categories, ~20-40k products
- Searchspring API (siteId=`kfx28d`) ke through scrape hoga

**3. patrickblack.geiger.com (affiliate target)**

- Geiger ne Patrick ke liye banaya hai (ya banayega — Patrick ne email mein bola "they haven't created my site yet")
- Same URL structure as geiger.com, sirf `www` → `patrickblack`
- Hamare product cards yahin link karenge, Patrick ko commission milti hai

**Hamara kaam:** New PI banao jo old PI ke 22,180 URLs preserve kare, Geiger ke products dikhaye (scraped), aur product card click karne pe user ko patrickblack.geiger.com pe le jaye.

PI pe product detail pages NAHI bani. Patrick ne confirm kiya. Hum sirf SEO funnel + content layer hain.

---

## 1. Locked Decisions (Ab Yeh Sab Final)

| Decision              | Choice                                     | Reason                                          |
| --------------------- | ------------------------------------------ | ----------------------------------------------- |
| Pagination URL        | Static `/cat/[slug]/page/N`                | SEO friendly, link equity preserve              |
| AI content depth      | Lite-on-facets (465 full + 21,715 lite)    | Cost $35-50, balanced quality                   |
| Sanity AI button      | **Option A: Build it (8 hours)**           | Patrick will create custom categories regularly |
| Per-facet membership  | **Option A: 1 API call per facet (~6h)**   | Bulletproof accuracy                            |
| Product detail scrape | **NO**                                     | PI pe detail pages nahi hain, saves 40+ hours   |
| Module structure      | **6 modules** (M1+M2 merged)               | Less artificial separation                      |
| Data refresh strategy | **One-time scrape + monthly auto-rebuild** | Industry standard, no live API dependency       |

---

## 2. Tech Stack Lock

```
Framework:     Next.js 15 App Router + TypeScript strict
Styling:       Tailwind CSS
CMS:           Sanity v3 (hybrid model)
Hosting:       Vercel
DNS:           Cloudflare (DNS-only mode)
AI:            DeepSeek-V3 via API (Patrick's key)
Email:         Gmail SMTP via Nodemailer (Patrick's app password)
Search:        Fuse.js client-side, prebuilt JSON index
Scraper:       Python (httpx HTTP/2 + tenacity + tqdm + orjson + beautifulsoup4 + rapidfuzz)
Package mgr:   pnpm
Node:          20 LTS+
```

**Brand tokens:**

- `--color-brand-red: #E11F1E` (logo SVG se extract kiya)
- `--color-brand-ink: #231F20`
- `--color-brand-green: #16A34A` (green CTAs jaisa reference site mein hai)
- `--color-brand-white: #FFFFFF`

---

## 3. URL Counts Confirmed

| Source              | Raw Rows | Valid URLs | Notes                                               |
| ------------------- | -------- | ---------- | --------------------------------------------------- |
| Category_Pages.xlsx | 22,213   | **22,180** | 22 blog taxonomy URLs + 10 GA4 header rows stripped |
| Blog_Links.xlsx     | 823      | **731**    | 82 taxonomy/pagination URLs stripped                |

Of 22,180 valid category URLs:

- **465** root categories (`/cat/water-bottles`)
- **21,715** facet pages (`/cat/water-bottles/material/stainless-steel`)
- 36 unique facet types: supplier (4875), color (3193), material (2847), brand (2711), feature (1920), etc

---

## 4. Geiger Searchspring API Reference (Important)

API endpoint: `https://kfx28d.a.searchspring.io/api/search/category.json`

Key params:

- `siteId=kfx28d`
- `bgfilter.category_path=Home > Drinkware > Water Bottles`
- `resultsFormat=native`
- `page=N`
- `perPage=100`
- Optional `filter.[field]=[value]` for facet filtering

Response structure:

- Full product objects: sku, name, brand, low_price, high_price, msrp, min_qty, imageUrl, description, category_path[], badges, is_new_item, is_on_sale, product_type_unigram
- Facets array: aggregated counts per facet value
- Pagination metadata
- Sort options

**Critical limitation:** Per-product color/material/size attributes Geiger ke product object pe NAHI hain. Yeh sirf aggregated facets array mein milte hain. Iska matlab: har facet URL ke liye humein separate filtered API call karni padegi to capture SKU membership. Yeh exactly Module 1 ka Phase C scrape hai.

---

## 5. Affiliate URL Rewrite Rule

Jab bhi koi Geiger link emit karte hain, yeh transformation lagao:

```ts
const affiliateUrl = (geigerUrl: string): string =>
  geigerUrl.replace('https://www.geiger.com/', 'https://patrickblack.geiger.com/');
```

Works for both `/p/` product URLs aur `/b/` category URLs.

Source URL: `https://www.geiger.com/p/vinyl-football-510336?pid=208667`
Output URL: `https://patrickblack.geiger.com/p/vinyl-football-510336?pid=208667`

Helper sirf `lib/affiliate-url.ts` mein hoga. Components mein hardcode nahi karna.

---

# Modules

## Module 1: Foundation + Data Pipeline

**Total: ~50 hours | Weeks 1-2 (May 15 - May 28)**

### Sub-module 1A: Project Scaffold (8h)

- Next.js 15 App Router + TypeScript strict + Tailwind init
- pnpm setup, Node 20+
- Repo structure:
  ```
  /app                # Next.js routes
  /components         # React components
  /lib                # utilities, sanity client, data loaders
  /data
    /categories       # AI-generated content JSON
    /geiger           # Scraped Geiger data
    /mappings         # PI-to-Geiger mapping
  /sanity             # Sanity studio config + schemas
  /scripts
    /scrapers/geiger  # Python scraper
    /ai-pipeline      # DeepSeek content generation
    /search-index     # Fuse index builder
  /public             # Static assets
  /docs               # Internal docs
  ```
- ESLint, Prettier, Husky pre-commit
- Tailwind config with brand tokens (red, ink, green, white)
- GitHub repo + branch protection (`main` + `develop`)
- GitHub Actions: typecheck + lint + build on PR

### Sub-module 1B: Vercel Staging (4h)

- Connect repo to Vercel
- Native Next.js support (no adapter needed)
- Point `dev.perfectimprints.com` to staging deployment via Cloudflare CNAME (DNS-only mode)
- Verify HTTPS works (Vercel handles cert issuance automatically)
- Env vars setup in Vercel dashboard

### Sub-module 1C: Sanity Studio Bootstrap (6h)

- Sanity v3 project under Patrick's account
- Initial schemas (M5 mein expand karenge):
  - `homePage` (singleton)
  - `globalSettings` (singleton)
  - `megaMenu` (singleton)
- Studio embedded at `/admin` route in Next.js
- Patrick test login
- Webhook setup for ISR revalidation
- Env vars: `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_TOKEN`, `SANITY_WEBHOOK_SECRET`

### Sub-module 1D: Global Layout Components (8h)

- Header component (logo, mega menu skeleton, phone `800-773-9472`, contact link)
- Footer (4 columns, social links, address, copyright auto-year)
- Mega menu shell (hardcoded structure for now, Sanity-driven in M5)
- Brand button styles, typography scale, spacing tokens
- `/style-guide` route for visual review

### Sub-module 1E: Python Scraper Development (16h)

Path: `scripts/scrapers/geiger/`

Files:

```
config.py          # siteId, base URLs, throttle settings, output paths
client.py          # httpx HTTP/2 client + tenacity retry + 1 req/sec throttle
discover.py        # Phase A: parse Geiger mega menu HTML, extract category tree
products.py        # Phase B: Searchspring API pagination per Geiger leaf
memberships.py     # Phase C: per-facet API call for 21,715 PI facet URLs
mapping.py         # Phase D: fuzzy-match 465 PI roots to Geiger leaves
run.py             # entrypoint with --phase 1|2|3|4|all flag
checkpoint.py      # resumable runs, save state every N requests
requirements.txt
README.md
```

Dependencies: httpx, tenacity, tqdm, orjson, beautifulsoup4, rapidfuzz

**Phase A: Taxonomy discovery (~minutes)**

- One HTTP GET to `https://www.geiger.com/b/accessories` (ya koi bhi category)
- BeautifulSoup se mega menu parse
- Extract all ~350-500 category nodes with parent-child relationships
- Output: `data/geiger/categories.json`

**Phase B: Product catalog (~20-40 min)**

- For each Geiger leaf category, hit Searchspring API
- `perPage=100`, paginate until end
- Deduplicate by SKU
- Output: `data/geiger/products.json` (~20-40k products)

**Phase C: Facet memberships (~6 hours unattended)**

- For each of 21,715 PI facet URLs, ek filtered Searchspring API call
- `bgfilter.category_path=...` + `filter.[type]=[value]`
- Capture SKU list per facet URL
- 1 req/sec throttle = ~6 hours total
- Checkpointing every 100 calls so resume kar saken
- Output: `data/geiger/facet-memberships.json`

**Phase D: PI mapping (~10 min compute)**

- Map 465 PI roots to Geiger leaves
- Strategy: exact slug match → fuzzy match (rapidfuzz) → AI fallback for unresolved
- AI fallback uses DeepSeek with one-shot category matching prompt
- Output: `data/mappings/pi-to-geiger.json`
- CSV report with confidence scores for manual review

### Sub-module 1F: First Full Scrape Run (8h)

- Run all 4 phases end-to-end
- Generate all 4 JSON outputs
- Summary stats report: total products, categories, unmapped PI URLs
- Commit data files to repo (yeh repo mein rehne wala data hai, not gitignored)

**Acceptance criteria for M1:**

- [ ] `dev.perfectimprints.com` accessible with brand-styled empty home
- [ ] Patrick Sanity mein login kar sakta hai, home page text edit, staging pe reflect ho
- [ ] All 4 scraper phases run successfully
- [ ] `data/geiger/products.json` has 20k+ products
- [ ] `data/mappings/pi-to-geiger.json` resolves 450/465+ PI roots
- [ ] Unmapped roots documented for manual review

---

## Module 2: AI Content Generation

**Total: ~35 hours | Week 3 (May 29 - June 4)**

### Sub-module 2A: DeepSeek Client Setup (4h)

- API client at `scripts/ai-pipeline/deepseek_client.py`
- Retry logic, rate limit handling
- Token counter for cost tracking
- Env var: `DEEPSEEK_API_KEY`
- Cost reporting per batch

### Sub-module 2B: Prompt Templates (6h)

**`prompts/root_category.txt`** — full body template for 465 root categories

- Output: SEO H1, meta title (under 60 chars), meta description (under 155 chars), 2-3 paragraph intro, 5 FAQs with answers, hero alt text
- Variation injection (30% open with use case, 30% target buyer, 30% material angle, 10% seasonal)
- Persona context: marketing directors, HR directors, safety managers, business owners
- Plural keywords baked in (custom water bottles, branded tote bags, personalized pens)
- Geiger product names injected for natural product mentions

**`prompts/facet_category.txt`** — lite template for 21,715 facet pages

- Output: SEO H1, meta title, meta description, 1 short intro paragraph (60-80 words)
- No FAQs (root pages se inherit if needed)
- Facet-specific keyword phrase ("stainless steel water bottles", "pink yardsticks", etc)

### Sub-module 2C: Content Generation Pipeline (8h)

- `scripts/ai-pipeline/generate_content.py`
- Reads PI URL list from spreadsheet + mapping
- For each URL: load Geiger context, call DeepSeek, save output JSON
- Resumable (skip URLs that already have output)
- Quality logging: flag short/erroneous outputs
- Dry-run mode for prompt testing
- Per-batch cost report

### Sub-module 2D: Generation Run + Review (10h)

**Step 1: 465 roots first**

- Generate all root category content (~$10-15)
- Spot-check 20 random outputs with Patrick
- Adjust prompts if tone/accuracy issues

**Step 2: 21,715 facets**

- After Patrick approval, run full facet generation (~$20-25)
- Monitor cost, success rate, quality
- Spot-check 50 random samples post-run

### Sub-module 2E: Content Storage (7h)

- Output structure: `data/categories/[encoded-slug].json`
- Slash converted to `__` in filename (e.g., `water-bottles__material__stainless-steel.json`)
- Schema per file:
  ```json
  {
    "url": "/cat/water-bottles/material/stainless-steel",
    "h1": "...",
    "metaTitle": "...",
    "metaDescription": "...",
    "introHtml": "...",
    "faqs": [{ "q": "...", "a": "..." }],
    "heroAltText": "...",
    "productSkus": ["SKU1", "SKU2", ...]
  }
  ```
- productSkus pulled from Phase C facet memberships

**Acceptance criteria for M2:**

- [ ] All 22,180 content JSON files generated
- [ ] Patrick approves quality from spot-check
- [ ] Total DeepSeek spend under $50
- [ ] All files committed to repo

---

## Module 3: Category Page Templates

**Total: ~80 hours | Weeks 4-5 (June 5 - June 18)**

### Sub-module 3A: Page Routing (6h)

- Dynamic route `/app/cat/[...slug]/page.tsx`
- `generateStaticParams()` reads PI URL list, generates all 22,180 static paths
- Loader function: Sanity-first (curated/custom category), then JSON fallback, then 404
- Type-safe slug parsing

### Sub-module 3B: Product Card Component (6h)

- Displays: hot-linked Geiger CDN image, name, brand badge, price range, MOQ, "New"/"Sale" badges
- Click opens patrickblack.geiger.com in new tab
- Hover state (subtle elevation)
- Responsive: 4 cols desktop, 2 cols tablet, 1 col mobile
- Loading skeleton state

**Image strategy:** Hot-link from `imgsirv.geiger.com` (Geiger's CDN). NO download. Patrick Geiger ka distributor hai, hot-linking allowed. Saves 5-15GB build size.

### Sub-module 3C: Product Grid (5h)

- 60 products per page default
- Skeleton loading state
- Empty state when zero match
- Lazy loading below fold

### Sub-module 3D: Filter Sidebar (16h)

- Sticky on desktop, collapsible drawer on mobile
- Facet sections rendered from Geiger data: Category (subcategories), Color, Material, Brand, Price range, Production time, Min Qty range
- Counts shown next to each facet value
- Multi-select within a facet
- **Filter logic:**
  - Single facet match (user adds Color=Pink on `/cat/water-bottles`) → check if static URL `/cat/water-bottles/color/pink` exists → navigate to it. Otherwise query param `?color=pink`
  - Multi-facet (Color=Pink AND Material=Plastic) → always query params, because 22,180 static URLs sirf single-facet combinations cover karte hain
- "Clear all filters" button

### Sub-module 3E: Sort Dropdown (3h)

Options:

- Best Sellers (default)
- Price Low to High
- Price High to Low
- MOQ Low to High
- Newest

Client-side sort over loaded SKU list (no server call).

### Sub-module 3F: Static Pagination (6h)

- URL pattern: `/cat/[slug]/page/N`
- Previous, page numbers, Next buttons
- 60 products per page
- Prefetching for adjacent pages
- All pagination URLs in sitemap

### Sub-module 3G: Page Layout Assembly (10h)

- Breadcrumb (Home > Department > Category > Subcategory)
- H1 + intro paragraph from AI content
- Product grid with filter sidebar
- FAQs accordion (root pages only)
- Lead capture form embedded
- CTA banner
- Schema.org markup: BreadcrumbList, FAQPage (root only), Product (for grid)
- Reference layout match: `sample-category-layout.jpg`

### Sub-module 3H: Lead Capture Form (10h)

- Fields: Name, Email, Company, Phone, Quantity needed, Message
- Client component with inline validation
- POST to `/app/api/leads/route.ts`
- Route handler uses Nodemailer + Gmail SMTP
- Sends to `patrick@perfectimprints.com`
- Writes `leadSubmission` document to Sanity for record
- Honeypot field + basic rate limiting
- Success/error toast states
- Env vars: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `LEAD_EMAIL_TO`

### Sub-module 3I: CTA Banner (3h)

- Reusable component, content editable in Sanity globalSettings
- Default: "Need help finding the right product? Call 800-773-9472 or request a quote"
- Used at bottom of category pages and blog pages

### Sub-module 3J: Polish + Edge Cases (15h)

- 404 page (helpful suggestions)
- Loading states
- Error boundaries
- Mobile responsiveness pass (375, 768, 1280)
- Accessibility pass (keyboard nav, aria labels)
- Performance pass on sample pages

**Acceptance criteria for M3:**

- [ ] `/cat/water-bottles` renders correctly with products + filters + sort + pagination
- [ ] `/cat/water-bottles/material/stainless-steel` shows correct filtered subset
- [ ] Filter sidebar navigates to static URL when match exists, query param otherwise
- [ ] Lead form delivers email to Patrick within 30 seconds
- [ ] All 22,180 pages successfully build (Next.js build completes without errors)
- [ ] Lighthouse > 85 on sample category pages
- [ ] Mobile responsive on all breakpoints

---

## Module 4: Blog System

**Total: ~30 hours | Week 6 (June 19 - June 25)**

### Sub-module 4A: Blog Scrape (8h)

- Attempt clean export from MPower dashboard first
- If fails: Playwright fallback scraper for 731 URLs
- Per blog: title, body HTML, header image, inline images, publish date, author, category tags
- Output: `data/blogs/raw/[slug].json` + images at `data/blogs/images/`

### Sub-module 4B: Blog Sanity Schemas (6h)

- `blogPost` schema (title, slug, hero image, body portable text, author, publish date, categories, related posts, meta tags)
- `blogCategory` schema (slug, title, description)
- `author` schema (name, bio, image)
- Migration script: import scraped blogs as Sanity drafts
- Patrick reviews and publishes

### Sub-module 4C: Blog Templates (10h)

- Blog index `/blog`: featured posts, category filter, search, 3-4 column card grid, pagination at 24 posts
- Blog post `/blog/[slug]`: breadcrumbs, hero image, title + metadata, article body, sidebar with categories + contact CTA, related posts grid
- Blog category `/blog/cat/[slug]`: filtered listing
- Match reference: `sample-blog-layout.jpg`
- Schema.org BlogPosting markup

### Sub-module 4D: Sanity Content Management (6h)

- FAQ library schema
- Brand schema (Geiger sub-brands: Carhartt, Igloo, Nike, etc — populated from products.json)
- Patrick can author new blog from Sanity, appears on site after publish
- ISR revalidation working

**Acceptance criteria for M4:**

- [ ] All 731 blogs render with original URLs preserved
- [ ] Patrick can author + publish from Sanity
- [ ] Blog search + category filter functional
- [ ] No broken images or missing content

---

## Module 5: Search, Forms, Home, Polish

**Total: ~40 hours | Week 7 (June 26 - July 2)**

### Sub-module 5A: Home Page (8h)

- Hero (Sanity-editable)
- Featured categories grid
- New products carousel (auto-populated from latest Geiger scrape)
- Featured brands logos
- Testimonial section
- Blog preview section
- CTA banners
- All content from Sanity homePage singleton

### Sub-module 5B: Site-wide Search (Fuse.js) (8h)

- Build-time index generation
- Index covers: 22,180 categories + 731 blogs + brands + FAQs
- `/public/search-index.json`
- Header search bar with autocomplete dropdown
- `/search?q=...` results page
- Lazy load Fuse + index on first interaction
- Fuzzy matching on title, description, keywords

### Sub-module 5C: Mega Menu Population (4h)

- Replace hardcoded shell with Sanity-driven structure
- Patrick can reorder departments, edit labels, hide items
- Default state matches Geiger's mega menu structure

### Sub-module 5D: Custom Category/Product Schemas + AI Button (10h)

- `customCategory` schema in Sanity (for PI-only categories not on Geiger)
- `customProduct` schema (PI-only products with external URL field)
- Render through same `/cat/[...slug]` route, Sanity wins over JSON when slug matches
- **AI generation button:** Sanity Studio action at `/sanity/actions/GenerateWithAI.tsx`
  - Button labeled "Generate with AI" on customCategory document
  - Click triggers Sanity Studio action → custom API route `/app/api/sanity/generate-content/route.ts`
  - Backend calls DeepSeek with root_category prompt template
  - Auto-fills intro paragraph + 5 FAQs into document
  - Patrick reviews and publishes

### Sub-module 5E: Performance Pass (6h)

- next/image where possible (for non-Geiger images: logo, hero, blog images)
- Hot-linked Geiger images get `loading="lazy"` + explicit dimensions to prevent CLS
- Prefetch links on hover
- Bundle analysis, code splitting
- Defer non-critical scripts
- Target Lighthouse > 90 on home + category + blog templates

### Sub-module 5F: SEO Infrastructure (4h)

- `sitemap.xml` generator: 22,180 categories + 731 blogs + static pages + paginated category pages
- Split into multiple files if > 50k URLs
- `robots.txt`: allow all, reference sitemap
- Meta tags audit script (zero missing, zero duplicate)
- Schema.org Organization (root layout)
- Canonical URLs on every page

**Acceptance criteria for M5:**

- [ ] Home page complete + editable from Sanity
- [ ] Search finds categories/blogs/brands within 300ms
- [ ] Sitemap validates against Google spec
- [ ] Lighthouse > 90 on home + 3 sample category pages
- [ ] Patrick can create custom category with AI-generated content from Sanity

---

## Module 6: QA, Migration, Launch

**Total: ~25 hours | Week 8 (July 3 - July 9)**

### Sub-module 6A: URL Audit (4h)

- Automated check: all 22,180 + 731 + static URLs return 200
- 404 handling for invalid URLs (helpful suggestions, search prompt)
- Old `/blog/cat/` taxonomy URLs (82 of them): decide redirect or 404
- Build a check script that crawls staging and reports any 404/500

### Sub-module 6B: Cross-browser Testing (5h)

- Chrome, Firefox, Safari, Edge on desktop
- iOS Safari, Chrome Android on mobile
- Filter sidebar drawer, mega menu, forms all work
- Document results at `/docs/qa-matrix.md`

### Sub-module 6C: Pre-launch Setup (4h)

- Google Search Console verification (both staging + production hostnames)
- Google Analytics 4 setup (preserve existing GA4 property)
- Events: lead form submit, search usage, outbound clicks to Geiger
- Production Vercel env vars set
- Sanity webhook pointing to production
- Launch runbook at `/docs/launch-runbook.md`

### Sub-module 6D: Final Scrape Refresh (3h)

- One last scraper run for fresh data
- Generate fresh AI content for any newly added Geiger categories
- Final production build

### Sub-module 6E: DNS Cutover (3h)

- Lower DNS TTL day before to 300 seconds
- Cutover during low-traffic window (early morning ET)
- Repoint perfectimprints.com apex to Vercel via Cloudflare DNS
- SPF + DKIM records for Gmail SMTP
- Monitor for 24 hours
- Submit updated sitemap to Search Console

### Sub-module 6F: Monthly Auto-Rebuild Scheduler (4h)

- GitHub Action workflow `.github/workflows/monthly-rebuild.yml`
- Scheduled: 1st of every month at 00:00 UTC
- Steps:
  1. Run Python scraper (Phases A, B, C — Phase D mapping stable after first run)
  2. Regenerate AI content for any new categories
  3. Commit data changes
  4. Trigger Vercel production build
  5. Email Patrick summary stats (products count delta, new categories, etc)
- Manual trigger button in Sanity for ad-hoc refresh

### Sub-module 6G: Training + Handover (2h)

- Screen-capture video walkthrough (under 20 min)
- Topics: add curated category, custom category with AI button, custom product, blog post, edit home page, edit mega menu
- Quick-reference notes at `/docs/sanity-quickstart.md`

**Acceptance criteria for M6:**

- [ ] Live at perfectimprints.com
- [ ] Zero 404s on 22,180 + 731 + static URLs
- [ ] Lead form working in production
- [ ] Monthly auto-rebuild verified (manual trigger test)
- [ ] Patrick signs off

---

# Time + Payment Summary

| Module                        | Hours   | Weeks | End Date         |
| ----------------------------- | ------- | ----- | ---------------- |
| 1: Foundation + Data Pipeline | 50      | 1-2   | May 28           |
| 2: AI Content Generation      | 35      | 3     | June 4           |
| 3: Category Page Templates    | 80      | 4-5   | June 18          |
| 4: Blog System                | 30      | 6     | June 25          |
| 5: Search/Forms/Home/Polish   | 40      | 7     | July 2           |
| 6: QA/Migration/Launch        | 25      | 8     | July 9           |
| **Total**                     | **260** | **8** | **July 9, 2026** |

**Rate analysis:**

- $6000 / 260 hours = $23/hr effective
- Original $6000 / 240 hours = $25/hr
- Slight reduction acceptable given expanded scope already absorbed

**Payment vs reality:**

- Patrick's payment schedule ends June 19 with launch payment
- Internal launch target: July 9 (3 weeks past)
- **Risk:** Final 10% payment might be held if launch slips past June 19
- **Mitigation:** Front-load critical milestones, deliver staging-ready by June 19, give Patrick walkthrough, get him excited. Last 3 weeks (June 19 - July 9) are polish + launch coordination. If Patrick wants to launch earlier with known polish caveats, doable.

---

# Patrick Dependencies (Yeh Sab Pending)

| Item                                                           | Required By                      | Status  |
| -------------------------------------------------------------- | -------------------------------- | ------- |
| DeepSeek API key (he creates account at platform.deepseek.com) | Week 2 end (before M2)           | Pending |
| Gmail app password (for Nodemailer SMTP)                       | Week 3 end (before M3 lead form) | Pending |
| Exact green hex shade confirmation                             | Week 1 (style guide review)      | Pending |
| Lead form "from" address preference (patrick@ vs leads@)       | Week 3                           | Pending |
| Image fallback policy (when Geiger lacks image)                | Week 4                           | Pending |
| Sample content approval (465 root pages)                       | Week 3 mid                       | Pending |
| Mega menu structure final review                               | Week 7                           | Pending |
| Final staging review                                           | Week 8 start                     | Pending |

---

# Risks (Internal View)

**1. Searchspring API changes during 8-week build**

- Likelihood: Low
- Impact: Phase B + C scrape ko adapt karna padega
- Mitigation: One-time scrape + monthly auto-rebuild approach — agar API change hua, hum scraper update karke phir run karenge. Production site live data pe dependent nahi hai.

**2. 21,715 facet API calls fail mid-run**

- Likelihood: Medium
- Impact: Phase C resumable hai, checkpointing every 100 calls
- Mitigation: Worst case ~6 hours dobara run

**3. AI content quality unacceptable on facets**

- Likelihood: Low (lite template, simple intro)
- Impact: Rerun with adjusted prompts (~$20)
- Mitigation: 50 sample review pehle full run se

**4. Launch slips past June 19**

- Likelihood: Medium-High
- Impact: Final 10% payment delayed
- Mitigation: Communicate early with Patrick, show staging readiness mid-July, get him to agree to slight delay for quality

**5. Geiger affiliate subdomain not ready at launch**

- Likelihood: Medium (Patrick's email said "they haven't created my site yet")
- Impact: Affiliate links broken
- Mitigation: Use `www.geiger.com` as fallback until `patrickblack.geiger.com` live. Simple env var swap on launch day (NEXT_PUBLIC_GEIGER_HOST).

**6. Vercel build timeout on 22,180 + 731 pages**

- Likelihood: Medium
- Impact: Failed deploys
- Mitigation: Test build times early in M1. If too slow, switch to incremental static regeneration for facet pages, keeping roots fully static.

**7. Video section scope creep (Patrick wants expanded video)**

- Likelihood: High (Patrick mentioned this in writing)
- Impact: 20-30 extra hours not budgeted
- Mitigation: Scope it separately, quote as add-on after launch. Don't absorb silently.

---

# Out of Scope (Internal Reminder)

Yeh sab v1 mein nahi hai. Post-launch quote separately:

- Product detail pages on PI
- Cart/checkout
- User accounts/authentication
- Real-time Geiger sync (we use monthly rebuild)
- Per-product imprint/decoration data display
- **Video section expansion** (Patrick wants this — scope separately, charge $XXX)
- Custom CRM integration
- Paid ad landing pages
- A/B testing infrastructure
- Multi-language/multi-currency

---

# Daily Working Rhythm

- Mon-Fri: 30-35 hours/week sustained pace
- Sat: 8 hours catch-up + planning
- Sun: off
- WhatsApp Patrick weekly with status updates
- Push to staging end of every working day
- Patrick can review staging anytime
