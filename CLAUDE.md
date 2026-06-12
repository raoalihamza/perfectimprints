# CLAUDE.md

Project context for Perfect Imprints website rebuild. Read this before any task.

## 1. Project

Rebuild perfectimprints.com as a static, SEO-first content site that funnels traffic to a Geiger e-commerce subdomain. 22,180 category pages (465 roots, 576 modifiers, 21,137 facets, 2 compound facets) and 731 blog posts. Not an e-commerce site. No checkout, no cart, no product detail pages owned by this site. Outbound links only.

Production domain: `perfectimprints.com`
Staging domain: `dev.perfectimprints.com`
Affiliate target: `https://patrickblack.geiger.com/`
Geiger source: `https://www.geiger.com/` (data source only, never emitted in links)

## 2. Stack

| Layer           | Choice                                                                      |
| --------------- | --------------------------------------------------------------------------- |
| Framework       | Next.js 15, App Router, TypeScript strict                                   |
| Styling         | Tailwind CSS                                                                |
| CMS             | Sanity v3 (hybrid model, see Section 7)                                     |
| Hosting         | Vercel (Next.js native platform)                                            |
| DNS             | Cloudflare (DNS-only mode, CNAME to Vercel)                                 |
| AI content      | DeepSeek-V3 via API                                                         |
| Email           | Gmail SMTP via Nodemailer                                                   |
| Search          | Fuse.js with prebuilt JSON index                                            |
| Data pipeline   | Python with httpx HTTP/2, tenacity, beautifulsoup4, rapidfuzz, orjson, tqdm |
| Package manager | pnpm                                                                        |
| Node            | 20 LTS or higher                                                            |

## 3. Architecture Principles

Static-first (hybrid SSG). The headline category surfaces — 465 root pages + 576 modifier pages + 2 compound-facet pages, plus their pagination variants (~1,840 paths total) — render at build time as static HTML and ship in the Vercel deployment. The 21,137 long-tail facet pages render via on-demand SSG (`dynamicParams = true` + `revalidate = false`): the first hit (typically a Googlebot crawl) generates the page and Vercel caches it at the edge permanently until the next deploy. This is a forced deviation from "every page at build time" because pre-building all 22,180 pages plus pagination (~34,857 paths) blows Vercel's per-deployment output budget — Next.js 16 emits ~5 segment artifacts per static page, hitting `ENOSPC` on the build runner. Crawlers and users see identical static HTML once a page is warm. Sanity-managed pages use ISR with on-demand revalidation triggered by Sanity webhooks. See Section 13 and `app/cat/[...slug]/page.tsx` for the implementation, and TASKS.md M3-306 for the incident write-up.

URL preservation is non-negotiable. The 22,180 existing category URLs and 731 blog URLs from GA4 must resolve to the same path on the new site. No 301 redirects for migrated URLs.

Hybrid content model. Bulk AI-generated category pages live as JSON files in the repo. Sanity holds curated categories, custom categories, custom products, blogs, home page, mega menu, FAQs, global settings, and anything Patrick edits.

Data baked at build time. Product catalog and category data are scraped once and committed to the repo as JSON. Production builds never call the Geiger API at runtime. A scheduled monthly rebuild refreshes the data and redeploys.

Outbound links open in the same tab unless noted. Affiliate links to Geiger use the patrickblack.geiger.com host. Links to non-Geiger partner sites use whatever URL is set on the custom product document.

## 4. URL Structure

All preserved exactly. Slug formats already determined by the existing site. Total: 22,180 valid category URLs and 731 blog posts (verified via `pnpm import-urls` against GA4 export).

Category URL breakdown:

- Home: `/`
- Category root: `/cat/[slug]` (**465** root categories, 1 segment after `/cat/`)
- Category modifier: `/cat/[root]/[modifier]` (**576** modifier pages, 2 segments). Six modifier types observed: `search` (258), `no-minimum` (216), `closeout` (93), `production-time` (6), `eco-friendly` (2), `material` (1)
- Category facet: `/cat/[root]/[facet-type]/[facet-value]` (**21,137** standard facet pages, 3 segments, 36 facet types)
- Category compound facet: `/cat/[root]/[type1]/[value1]/[type2]/[value2]` (**2** compound facet pages, 5 segments, two filter dimensions)
- Category pagination: `/cat/[slug]/page/[n]` for any category with more than 60 products (60 per page). Page 1 lives at the clean URL `/cat/[slug]` and is canonical to itself. Pages 2+ live at `/cat/[slug]/page/N`, carry `noindex,follow`, and canonical back to page 1. `/cat/[slug]/page/1` 308-redirects to the clean URL. Out-of-range `/page/N` returns 404. Only page 1 URLs appear in the sitemap. Build-time generation: pagination variants for root + modifier + compound-facet categories only (~797 paths); facet pagination renders via on-demand SSG with the parent facet page (see Section 3).
- Blog index: `/blog`
- Blog post: `/blog/[slug]` (731 posts)
- Blog category: `/blog/cat/[slug]`
- Brand index: `/brands` (new, added 2026-05-26 per Patrick feedback)
- Brand page: `/brands/[slug]` (new, per-brand product listings)
- Deals page: `/deals` (new, aggregator of all on-sale/closeout products)
- Rush products: `/rush-promotional-products`
- Services pages: `/services/[slug]`
- Videos index: `/videos`
- Video detail: `/videos/[slug]`
- About, contact, privacy, terms, FAQs, sample policy, shipping, returns: keep paths exactly as they appear in the GA4 export.

Trailing slashes: match the current site behavior. If GA4 export shows no trailing slash, do not add one.

Canonical host is www.perfectimprints.com. The apex perfectimprints.com 301-redirects to www. Configured in next.config redirects() and at the Vercel domain level.

The full URL list with classification lives at `data/pi-urls/category-urls.json` (built by `pnpm import-urls`). Every component that needs to enumerate URLs reads from there.

## 5. Folder Layout

```
/app                Next.js App Router routes
/components         Reusable React components
/lib                Utilities, Sanity client, scraper output loaders, affiliate URL helpers
/data               Committed JSON for bulk pages
  /categories       One file per AI-generated category page (encoded slug as filename)
  /geiger           Scraped Geiger data: categories.json, products.json, facet-memberships.json, brands.json, brand-logos/
  /mappings         pi-to-geiger.json
  /blogs            Raw blog scrape output (pre-Sanity migration)
/sanity             Sanity studio config and schemas
  /schemas          Document type definitions
  /components       Custom Studio components (including AI generate button)
  /actions          Custom Studio actions
/scripts            Build-time and one-off scripts
  /scrapers/geiger  Python scraper (config.py, client.py, discover.py, products.py, memberships.py, mapping.py, brand_logos.py, run.py, checkpoint.py)
  /scrapers/blogs   Python SeleniumBase UC-mode blog scraper (scrape_sbase.py)
  /ai-pipeline      DeepSeek content generation (deepseek_client.py, generate_content.py, prompts/)
  /search-index     Search index builder
/public             Static assets (logo, favicons, search-index.json)
/docs               Internal docs (this file lives here too)
```

## 6. Naming Conventions

- Files and folders: kebab-case
- React components: PascalCase
- TypeScript interfaces and types: PascalCase
- Sanity document types: camelCase
- JSON data files in /data/categories: filename matches the URL slug with slashes replaced by `__`, dot-json extension (e.g., `water-bottles__material__stainless-steel.json`)
- Environment variables: SCREAMING_SNAKE_CASE, prefixed by service (e.g., `SANITY_PROJECT_ID`, `DEEPSEEK_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`)

## 7. Sanity Content Model

Document types and what each holds:

**curatedCategory.** Top-tier categories Patrick wants to manually edit. Fields: slug, title, hero copy, body sections, FAQs reference, hero image, mapped Geiger URL, related blog post references, meta title, meta description.

**customCategory.** New categories Patrick creates that do not exist on Geiger. Same shape as curatedCategory plus an `isCustom` flag. Includes a custom Studio action "Generate with AI" that calls DeepSeek with the root category prompt template and auto-fills the intro paragraph, buying guide, and FAQs fields for Patrick to review.

**customProduct.** Products Patrick adds manually. Fields: title, image, description, external URL, parent category reference, display order. Used inside category page product grids when present.

**blogPost.** Fields: slug, title, header image, body (rich text / portable text), inline images, author, publish date, updated date, categories reference, related post references, meta title, meta description.

**blogCategory.** Taxonomy. Fields: slug, title, description.

**author.** Fields: name, bio, image.

**homePage.** Singleton. Fields: hero, featured image blocks (six of them), text content sections, brands grid reference.

**megaMenu.** Singleton. Fields: ordered list of menu items, each with label, link, optional dropdown items. Default state matches Geiger's mega menu structure plus Deals link and Brands link.

**globalSettings.** Singleton. Fields: phone number (default `800-773-9472`), contact email, social links, footer columns content, copyright text, CTA banner text.

**faq.** Reusable FAQ items. Fields: question, answer, category tags.

**video.** Fields: slug, title, YouTube URL, description, category, publish date.

**brand.** Fields: name, slug, logo image, optional URL, description. Auto-populated from Geiger products on first scrape (logos scraped from Geiger brand pages in Phase E), manually editable thereafter.

**leadSubmission.** Read-only document type written by the lead form API route. Fields: name, email, phone, company, quantity, comments, source page, timestamp.

Bulk AI-generated category pages are NOT in Sanity. They live as JSON in `/data/categories/`. When a curatedCategory or customCategory exists in Sanity with the same slug, Sanity wins.

## 8. Geiger Integration

**Data source:** Geiger uses Searchspring as its product search and category engine. Site ID is `kfx28d`. API endpoint:

```
https://kfx28d.a.searchspring.io/api/search/category.json
```

Key parameters:

- `siteId=kfx28d` (constant)
- `bgfilter.category_path=Home > Drinkware > Water Bottles` (category path with spaces and `>` separator)
- `resultsFormat=native`
- `page=N` (1-indexed)
- `perPage=60` (Geiger's native page size; what we use to match Geiger pagination exactly)
- `filter.[field]=[value]` (optional, for facet filtering)

Response includes full product objects (sku, name, brand, low_price, high_price, msrp, min_qty, imageUrl, description, category_path[], badges, is_new_item, is_on_sale, product_type_unigram), aggregated facets array with counts, pagination metadata, and sort options.

**Actual catalog size:** ~7,957 unique SKUs (verified 2026-05-24 via no-filter Searchspring query returning 7,971 total; our Phase B captured 99.82% of that). Note that summing per-category counts on Geiger's `/b/` pages produces inflated totals (around 13,500) because the average Geiger product appears in approximately 3.3 category paths (cross-listed across Apparel, Shop By > Brand Names, Shop By > Collections, etc). The 7,957 figure is the true unique-SKU count, not the sum of category page totals.

**HTML entity handling.** Geiger's product names and descriptions contain HTML entities directly in the data (e.g. `4' Dynamo Trifecta Display &amp; Graphics`, `6&quot; Key Card Holder`). These must be decoded centrally at the data loader level (`lib/categories.ts` → `getProductsForCategorySlug`) so every consumer sees clean plain text. Do NOT decode in components individually; decode once at the source. Entities to handle at minimum: `&amp;`, `&quot;`, `&#039;`, `&apos;`, `&lt;`, `&gt;`, `&nbsp;`, `&reg;`, `&trade;`, `&copy;`.

**Image fallback.** Hot-linked Geiger images may 404 if Geiger removes a product mid-month between auto-rebuilds. ProductCard must include an `onError` handler that swaps the broken image for a clean placeholder (a simple inline SVG or `/public/placeholder-product.svg` with the product name in plain text). The monthly auto-rebuild drops removed products entirely, so the placeholder is only a between-rebuild safety net.

**Per-product attributes (color, material, size) are NOT on the product object.** They only appear in the aggregated facets array. To know which products belong to a facet URL like `/cat/water-bottles/material/stainless-steel`, the pipeline makes a filtered API call per facet URL (Phase C of the scraper). This is the 21,715 calls described in Section 16.

**Affiliate URL rewrite rule:** Replace `https://www.geiger.com/` with `https://patrickblack.geiger.com/` in any scraped Geiger URL before emitting it on the new site. Works for both `/p/` product URLs and `/b/` category URLs.

Source URL: `https://www.geiger.com/p/vinyl-football-510336?pid=208667`
Output URL: `https://patrickblack.geiger.com/p/vinyl-football-510336?pid=208667`

Helper function lives at `lib/affiliate-url.ts` and is the only place this transformation should happen. Never hardcode the transformation in components.

**Product images:** Hot-linked from Geiger's CDN at `imgsirv.geiger.com`. Do NOT download to our origin. Patrick is an authorized Geiger distributor and hot-linking is permitted. Use explicit width and height on every image to prevent CLS. Use `loading="lazy"` on images below the fold.

**Brand logos.** Scraped from Geiger's brand pages (linked from `https://www.geiger.com/c/shop-by-brand`) via Phase E of the scraper. Stored at `data/geiger/brand-logos/{slug}.{webp|png|jpg}`. Used on the brands index page and per-brand pages. Auto-refreshed during monthly rebuild.

**Category mapping:** Each PI root category maps to one Geiger category via `data/mappings/pi-to-geiger.json`. Categories with no good match link to the closest Geiger top-level category. If absolutely nothing matches, fall back to `https://patrickblack.geiger.com/`.

**Affiliate subdomain status:** Until Geiger activates `patrickblack.geiger.com`, the affiliate host is configurable via `NEXT_PUBLIC_GEIGER_HOST`. Default value is `https://patrickblack.geiger.com`. If Geiger has not activated the subdomain by launch, set this to `https://www.geiger.com` temporarily. Patrick confirmed (2026-05-25) that Geiger has not activated the subdomain yet; this is being chased on Geiger's side.

## 9. AI Content Pipeline

Source of truth for what each category page needs: the entry in `data/mappings/pi-to-geiger.json` plus the corresponding Geiger category data in `data/geiger/`.

**Three-tier generation** based on URL type from `data/pi-urls/category-urls.json`:

### Root category pages (465 total, `type=root`)

Format: **Buying guide** style (upgraded 2026-05-26 per Patrick feedback on the Week 2 demo).

Generated fields:

- SEO H1 (40-70 chars)
- Meta title (under 60 characters)
- Meta description (under 155 characters)
- **Hero intro (1-2 paragraphs, 150-250 words)** rendered at the top of the page above the product grid. Sets context and persona.
- **Bottom buying guide content (400-600 words)** rendered under an H2 titled `Custom [Category Name] Buying Guide`. Structured as a buyer-research piece covering:
  - What buyers should look for when ordering this category
  - Materials, build quality, durability considerations
  - Common use cases and which buyers each fits (corporate events, trade shows, employee gifts, safety programs, etc.)
  - Decoration and customization options (screen print, embroidery, laser engraving, full-color, debossing, etc.)
  - Quantity guidance and MOQ context
  - Tips to avoid common buying mistakes
- **Five FAQs** with answers (50-100 words each), specific to the category
- Hero image alt text (60-120 chars, includes keyword)

**Keyword derivative injection.** The bottom buying guide must naturally include multiple plural keyword variations across its 400-600 words:

- `custom [category]`
- `promotional [category]`
- `branded [category]`
- `personalized [category]`
- `logo [category]` or `logo-printed [category]`
- `bulk [category]`
- `wholesale [category]`

Goal is natural, non-stuffed integration. Patrick's buying guide reference at `https://www.perfectimprints.com/blog/buying-guide-for-stadium-seat-cushions` shows the target tone and structure.

### Modifier pages (576 total, `type=modifier`, `/cat/[root]/[modifier]`)

- SEO H1 incorporating both the root category and the modifier (e.g. "Closeout Water Bottles", "Eco-Friendly Tote Bags", "Custom Pens With No Minimum")
- Meta title and meta description tuned to the modifier intent (sale/closeout = price-sensitive, no-minimum = small-order buyers, eco-friendly = sustainability-conscious, etc.)
- One short intro paragraph (60-80 words) explaining what makes this subset different (lower MOQ, sale pricing, eco materials, faster production)
- No FAQs, no buying guide section (those live on root pages)

### Facet pages (21,137 standard + 2 compound, `type=facet|compound-facet`)

- SEO H1 optimized for the long-tail keyword
- Meta title (under 60 characters)
- Meta description (under 155 characters)
- One short intro paragraph (60-80 words)
- No FAQs, no buying guide section

For compound facet pages, the H1 incorporates both filter dimensions.

### Prompt templates

Located at `scripts/ai-pipeline/prompts/`:

- `root_category.txt` — buying-guide format root template (promptVersion `root-v2`)
- `modifier_category.txt` — modifier lite template
- `facet_category.txt` — facet lite template (also used for compound facets)

All templates inject:

- Top product names from Geiger (slug-token relevance filtered to stay on-topic)
- Target keywords (always plural form)
- Buyer personas (marketing directors, HR directors, safety managers, business owners)

Root prompt varies hero intro opening structure to avoid sameness across 465 pages:

- 30 percent open with use cases
- 30 percent open with target industry or buyer
- 30 percent open with material or quality angle
- 10 percent open with seasonal or trending angle

### Phased generation

- **Phase 2.1 (Week 2 end, COMPLETE):** Top 35 root categories generated as a demo sample. Patrick approved content tone on 2026-05-25 with the buying-guide upgrade as a follow-up.
- **Phase 2.1b (2026-06-01, COMPLETE):** v1 demo quality pass — `scripts/ai-pipeline/generate_sample_roots.py` rebuilt with: dedup-by-Geiger-path selection so 35 entries are 35 distinct categories; `EXCLUDED_SLUGS` list (11 entries) for incoherent fuzzy mappings and PI admin artifacts; depth-aware SKU filter (see below); compound-noun H1 rule in `prompts/root_category.txt`; `post_process_lengths()` safety net that truncates metaTitle/metaDescription at a word boundary when the model overshoots SEO caps. Cumulative cost across all rounds: $0.065 for 60 calls. Zero length violations across all 35 outputs.
- **Phase 2.2 (COMPLETE):** Upgraded `root_category.txt` to buying-guide format (`promptVersion: "root-v2"`) and regenerated the 35 demo pages. Patrick spot-checks pending Pause Point 3 sign-off.
- **Phase 2.3 (COMPLETE):** All 465 PI root pages generated with v2 buying-guide format (`buyingGuideHtml` + `buyingGuideH2` populated). Committed in `91a4b3de`.
- **Phase 2.4 (COMPLETE):** All 21,715 non-root pages (576 modifiers + 21,137 facets + 2 compound facets) generated using their lite templates. Committed in `91a4b3de`.

### SKU filter rules (applied in `apply_sku_filter`)

PI-to-Geiger mappings sometimes point a root slug at a broad parent department (`business-card-holders` → `Home > Office & Technology`, 1738 SKUs), which would drown the product grid in unrelated items. The pipeline applies a three-tier rule at generation time and persists the result in the output JSON:

1. **`full`** — applied when `matchType ∈ {exact, fuzzy}` OR Geiger path depth ≥ 3. The full subtree SKU list is trusted as-is.
2. **`slug-filtered`** — applied when `matchType == override` AND depth < 3. Each candidate SKU is scored by token overlap between the category slug and the product name. Keep all SKUs scoring above the median, capped at 200.
3. **`full-capped-60`** — fallback when `slug-filtered` would leave fewer than 30 SKUs (single-digit grids look broken). Use the raw set capped at 60.

Three fields in the output JSON record the decision: `skuFilterMode`, `rawSkuCount`, `filteredSkuCount`.

### Output schema

Written to `data/categories/[encoded-slug].json`:

```json
{
  "url": "/cat/water-bottles",
  "type": "root|modifier|facet|compound-facet",
  "h1": "...",
  "metaTitle": "...",
  "metaDescription": "...",
  "introHtml": "...",
  "buyingGuideHtml": "...",
  "buyingGuideH2": "Custom Water Bottles Buying Guide",
  "faqs": [{ "q": "...", "a": "..." }],
  "heroAltText": "...",
  "productSkus": ["SKU1", "SKU2", ...],
  "skuFilterMode": "full|slug-filtered|full-capped-60",
  "rawSkuCount": 1738,
  "filteredSkuCount": 56,
  "generatedAt": "ISO timestamp",
  "model": "deepseek-chat",
  "promptVersion": "root-v2",
  "openingStyle": "use_case|buyer|material_quality|seasonal"
}
```

Note: `introHtml` holds the hero intro (above product grid). `buyingGuideHtml` holds the longer bottom content (under the H2 `buyingGuideH2`). Modifier and facet types only populate `introHtml`; the buyingGuide\* fields are null for those.

Never overwrite a Sanity document, only the JSON files. DeepSeek is called build-time only, never at runtime.

**Sanity AI button:** customCategory documents have a "Generate with AI" Studio action that POSTs to `/app/api/sanity/generate-content/route.ts`. The route calls DeepSeek with the root_category prompt and the customCategory's title and target keyword, then returns the generated intro, buying guide, and FAQs. The Studio action patches the document fields with the result. Patrick reviews and publishes.

## 10. Brand Tokens

Defined as Tailwind theme extensions and CSS variables.

| Token                  | Value     | Use                                                    |
| ---------------------- | --------- | ------------------------------------------------------ |
| `--color-brand-red`    | `#E11F1E` | Primary brand color, logo, accents, headings, dividers |
| `--color-brand-ink`    | `#231F20` | Body text, footer background                           |
| `--color-brand-green`  | `#16A34A` | CTA buttons, success states                            |
| `--color-brand-white`  | `#FFFFFF` | Page background                                        |
| `--color-text-primary` | `#1A1A1A` | Body copy                                              |
| `--color-text-muted`   | `#666666` | Captions, metadata                                     |
| `--color-border`       | `#E5E5E5` | Dividers, card borders                                 |
| `--color-bg-soft`      | `#F5F5F5` | Section backgrounds                                    |

Brand red `#E11F1E` and ink `#231F20` extracted from `pi-logo.svg`. Confirm exact green shade with Patrick during style guide review on staging.

Typography: system font stack with Inter as the preferred web font. Headings semibold or bold. Body 16px on mobile, 17px on desktop. Line height 1.6 for body, 1.2 for headings.

Buttons: green primary CTA (`--color-brand-green`), outlined dark secondary, no rounded-full pills, 6px to 8px radius.

## 11. SEO Requirements

Every page must have:

- Unique title and meta description
- Canonical URL
- Open Graph and Twitter card metadata
- Schema markup appropriate to the page type

Schema types in use:

- Organization (sitewide, in root layout)
- BreadcrumbList (every category, blog, video page)
- BlogPosting (every blog article)
- FAQPage (every root category page with FAQs)
- Product (within category page grids, summarized)
- VideoObject (every video page)

**Pagination indexing rule (added 2026-05-26 per Patrick feedback).** For paginated category URLs (`/cat/[slug]/page/N`):

- Page 1 is fully indexable, with canonical pointing to itself (clean root URL like `/cat/water-bottles`, NOT `/cat/water-bottles/page/1`)
- Pages 2 and beyond carry a `noindex,follow` meta robots tag AND a canonical pointing back to page 1
- This prevents duplicate-content penalties while still letting Google discover product variations through follow links

Sitemap is auto-generated at build time, split into multiple files if it exceeds 50,000 URLs. Robots.txt allows all, references the sitemap. **Only page 1 URLs appear in the sitemap**; paginated variants are excluded.

Internal linking: every root category page links to at least three related category pages and three related blog posts. Every blog post links to at least one category page in its body where contextually relevant.

## 12. Performance Targets

- LCP under 2.5 seconds on 4G
- CLS under 0.1
- INP under 200 milliseconds
- Initial JS bundle under 100 KB compressed for static category and blog pages

Geiger CDN images include explicit width and height attributes to prevent CLS. Non-Geiger images use Next.js Image component with responsive sizes, AVIF and WebP output, and lazy loading below the fold. Above-the-fold images use priority loading. Hero category image (first product card or category banner) is preloaded via `<link rel="preload" as="image">` for fastest LCP.

Fonts loaded with `font-display: swap` and preloaded for the main font weight. No more than two font weights total across the site.

## 13. Deployment

Vercel, two environments:

- Staging: `dev.perfectimprints.com`, deploys on every push to `develop` branch
- Production: `perfectimprints.com`, deploys on every push to `main` branch

Build command: `pnpm build`
Output: handled by Vercel's native Next.js support

**Static-path budget.** Vercel's build runner has a hard ceiling on output filesystem inodes — Next.js 16 emits ~5 segment artifacts per static page, and pre-building all 22,180 categories plus pagination (~34,857 paths × 5 ≈ 175k symlinks) fails with `ENOSPC: no space left on device` during Vercel's output-assembly step (incident: first full deploy on 2026-05-31). Mitigation in place on the `/cat/[...slug]` route: `dynamicParams = true` + `revalidate = false`, and `generateStaticParams` returns only root + modifier + compound-facet types (+ pagination), giving **1,840 static paths**. The 21,137 facet pages serve as on-demand SSG — first hit generates, then cached at the edge permanently until the next deploy (functionally identical to SSG for crawlers). Do NOT widen `PREBUILD_TYPES` in `app/cat/[...slug]/page.tsx` without re-measuring the path-vs-budget ratio.

**Post-deploy warmup.** Cold facets serve at 400-800ms on first hit while the on-demand SSG renders; warm ones serve under 200ms from edge cache. To avoid the 24-48h cold window after every deploy, `.github/workflows/post-deploy-warmup.yml` fires on `deployment_status` (success) and pre-hits all 21,139 facet + compound-facet URLs at concurrency 10 (~30-60min). Target host is read from the deployment's `environment_url`, so the workflow auto-targets `dev.perfectimprints.com` today and `www.perfectimprints.com` once production goes live without any config change. The workflow also exposes `workflow_dispatch` (defaults to staging) for ad-hoc warmup; locally `pnpm warmup` runs the same script (`scripts/warmup/warmup-facets.ts`) and reads `NEXT_PUBLIC_SITE_URL` for its target. Monthly auto-rebuild (M6-606) must trigger this workflow as its last step — without it, the monthly redeploy reintroduces the cold-facet window every 30 days.

DNS is managed by Cloudflare (DNS-only mode, no proxy). DNS cutover plan: lower TTL on existing perfectimprints.com records 48 hours before launch. On launch day, repoint apex to Vercel production via Cloudflare DNS.

**Monthly auto-rebuild:** A GitHub Action runs on the 1st of every month at 00:00 UTC. Workflow steps:

1. Run Python scraper Phases A, B, C, E (Phase D mapping is stable after first run; Phase E refreshes brand logos)
2. Regenerate AI content for any new Geiger categories
3. Detect and drop removed products from existing category pages
4. Commit data changes to repo on a `monthly-rebuild` branch
5. Open auto-merge PR to `main`
6. Vercel production build triggered on merge
7. Email Patrick a summary report (products added, removed, price changes, new categories)

Manual rebuild trigger lives in Sanity Studio as a custom action on globalSettings.

## 14. Environment Variables

Required at build and runtime:

```
SANITY_PROJECT_ID
SANITY_DATASET
SANITY_API_TOKEN
SANITY_WEBHOOK_SECRET
DEEPSEEK_API_KEY
GMAIL_USER=patrick@perfectimprints.com
GMAIL_APP_PASSWORD
LEAD_EMAIL_TO=patrick@perfectimprints.com
LEAD_EMAIL_FROM=patrick@perfectimprints.com
NEXT_PUBLIC_SITE_URL=https://perfectimprints.com
NEXT_PUBLIC_GEIGER_HOST=https://patrickblack.geiger.com
GA4_MEASUREMENT_ID
```

Never commit a `.env` file. Use `.env.example` with empty values as the template.

## 15. External Services

- **Sanity** for CMS. Project lives under Patrick's Sanity account.
- **Vercel** for hosting. Account is Patrick's.
- **Cloudflare** for DNS only (DNS-only mode, not proxied).
- **DeepSeek** for AI content. API key on Patrick's account, billed to him directly.
- **Gmail SMTP** for transactional email. Uses Patrick's Google Workspace account with an app password. Requires SPF and DKIM records in DNS.
- **Google Search Console and Google Analytics 4** for analytics. Existing GA4 property continues, new GSC property added for new site verification.

## 16. Data Pipeline Rules

Geiger data integration is permitted. Patrick has confirmed (he is a Geiger distributor).

Pipeline runs locally or in scheduled GitHub Actions, never in production runtime.

Throttle: one request per second per worker against the Searchspring API. Use `httpx` HTTP/2 client (and `curl_cffi` for Cloudflare bypass on the main geiger.com hostname) with `tenacity` retry on transient failures.

Checkpointing: save state every 100 requests so partial runs resume. State file at `scripts/scrapers/geiger/.checkpoint/`.

**Five-phase pipeline:**

**Phase A: Taxonomy discovery.** One HTTP GET to a Geiger category page (e.g., `https://www.geiger.com/b/accessories`), parse the mega menu HTML with BeautifulSoup, extract the full category tree with parent-child relationships. Output: `data/geiger/categories.json` (544 categories, 482 leaves). Runtime: minutes.

**Phase B: Product catalog.** For each Geiger leaf category, paginate the Searchspring API with `perPage=60`. Deduplicate by SKU. Output: `data/geiger/products.json` (7,957 unique SKUs, 99.82% of Geiger's total catalog of 7,971). Runtime: 20-40 minutes.

**Phase C: Facet and modifier memberships.** For each of the 21,715 PI URLs that need product membership data (576 modifiers + 21,137 facets + 2 compound facets), one filtered Searchspring API call to capture the SKU list. Output: `data/geiger/facet-memberships.json`. Runtime: 6 hours unattended.

**Phase D: PI-to-Geiger mapping.** Match each of the 465 PI root categories to a Geiger leaf via exact slug match (preferring non-aggregator leaves over `All <X>` aggregators), then fuzzy match with rapidfuzz (WRatio + token_set_ratio, threshold 80), then manual overrides in `scripts/scrapers/geiger/mapping_overrides.json`. Output: `data/mappings/pi-to-geiger.json` (465/465 mapped, 0 unmapped) plus a CSV report. Runtime: seconds.

**Phase E: Brand logo scrape (added 2026-05-26 per Patrick feedback).** Visit `https://www.geiger.com/c/shop-by-brand` to enumerate brand pages, then download the logo image from each brand's page. Store at `data/geiger/brand-logos/{brand-slug}.{webp|png|jpg}`. Output also includes `data/geiger/brands.json` with brand metadata (name, slug, description, logo path, product count cross-referenced from products.json). Runtime: 30-60 minutes. Runs as part of monthly auto-rebuild.

For **modifier URLs** (search, no-minimum, closeout, production-time, eco-friendly, material), the Searchspring filter mapping is (verified during the first end-to-end Phase C run, 2026-05-22):

| PI modifier                | Searchspring filter             | Notes                                                                                                    |
| -------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `search`                   | no extra filter                 | Treated as a search-landing variant of the root                                                          |
| `no-minimum`               | `filter.min_qty.high=24`        | Items needing fewer than 25 units. Range filters use `.low`/`.high` suffixes, NOT bracketed `[lt]`       |
| `closeout`                 | `filter.refine_by=Deals`        | `filter.is_on_sale=true` returned 0 across all categories; `Deals` is the only "on sale" refine_by value |
| `production-time`          | `filter.production_time.high=5` | Rush items (1–5 day production)                                                                          |
| `eco-friendly`             | `filter.refine_by=Eco Friendly` | Best when the root mapping is also `Home > Shop By > Eco-Friendly > <child>` where one exists            |
| `material` (1 PI URL only) | no extra filter                 | Treat as a landing variant of the root                                                                   |

For **compound facet URLs** (2 of them), send multiple `filter.[type]=[value]` params in one call. The request must use a list of tuples, not a dict, to preserve duplicate keys.

**Searchspring vocabulary gotchas:**

- `filter.refine_by` has only 3 valid values: `Made in the USA`, `Eco Friendly`, `Deals`.
- Numeric fields require integer values (`filter.production_time=5`, not `=5 Days`).
- Range syntax uses dotted suffix: `filter.<field>.low=N`, `filter.<field>.high=N`.
- Brand filter values use human-readable form: `filter.brand=Vineyard Vines` (not the slug).

**Slug-based resolver.** Many PI facet URLs map to a dedicated Geiger category SLUG instead of a filter combination. The resolver in `scripts/scrapers/geiger/memberships.py::resolve_slug_match` tries children-of-root name match, then `<value>-<root>` / `<root>-<value>` / bare `<value>` slug candidates restricted to the same top-level Geiger branch.

**Empty-page handling (zero-result PI URLs).** Patrick confirmed (2026-05-23) that PI URLs with no Geiger match should link to the Geiger homepage. To minimize how many pages need that fallback, Phase C includes a 4-tier recovery chain:

1. **Tier 1 — brand fallback** (`--retry-brands`). Recovered 809 URLs.
2. **Tier 2 — search-keyword fallback** (`--retry-search`). Recovered 2,625 URLs.
3. **Tier 3 — parent-root fallback** (Module 3 template logic). Renders parent root's product grid with explanatory header.
4. **Tier 4 — Geiger homepage CTA** (Module 3 template logic, last resort).

**Final Phase C breakdown:** 13,968 with products (64.3%), 7,518 zero (34.6%), 229 errors (1.1%). Plus 465 roots (all mapped). Overall: 14,433 URLs (65%) render with real product grids, 7,747 (35%) use Tier 3/4 fallback at render time.

**Blog migration (completed 2026-06-10).** PI is geo-blocked from Pakistan at the Cloudflare WAF and CF Turnstile escalates to interactive challenge on any rapid sequential automation. The working stack is **SeleniumBase UC mode + system-wide US/EU VPN** (Cloudflare WARP, ProtonVPN — *not* a browser-extension VPN like Browsec). Implementation at [scripts/scrapers/blogs/scrape_sbase.py](../scripts/scrapers/blogs/scrape_sbase.py); see [scripts/scrapers/blogs/README.md](../scripts/scrapers/blogs/README.md) for prereqs. Final coverage: 649 of 731 blogs scraped + published to Sanity; 82 verified-deleted URLs preserved at `data/blogs/.failed-slugs.txt` for delivery handoff. MPower export was investigated and ruled out — no usable bulk-export option in their admin. Tried-and-failed shortcuts: cloudscraper, curl_cffi chrome131, Playwright stealth (all fail under Turnstile escalation).

## 17. Conventions

- Server Components are the default. Use `'use client'` only where state, effects, or browser APIs are needed.
- Data fetching happens in Server Components, never in client components except via the Next.js Route Handler API.
- Forms post to App Router Route Handlers under `/app/api/`.
- All TypeScript is strict mode. No `any` without an inline justification comment.
- Sanity queries use GROQ in dedicated query files under `/lib/sanity/queries/`.
- All user-facing copy lives in Sanity or in JSON data files. No hardcoded marketing strings in components.
- Image alt text is required, not optional. Lint rule enforces it.
- Affiliate URL transformation lives only in `lib/affiliate-url.ts`. Never inline the replace.
- HTML entity decoding lives only in `lib/categories.ts`. Never decode in components individually.
- Mega menu data lives in `lib/nav-data.ts` and is built from PI's own slug universe (`data/pi-urls/category-urls.json` + `data/mappings/pi-to-geiger.json`), not Geiger's tree. Column labels mirror Geiger's top-level departments for visual familiarity; items and links use PI slugs only. Replaced by Sanity-driven menu in M5-503.
- Commit messages follow Conventional Commits.

## 18. Never Do

- Do not introduce 301 redirects for any URL that exists in the GA4 export.
- Do not put bulk AI-generated content into Sanity. Hybrid model only.
- Do not use the geiger.com host in any link emitted by this site. Always rewrite to the affiliate host via `lib/affiliate-url.ts`.
- Do not download Geiger images to our origin EXCEPT brand logos which are intentionally cached during Phase E.
- Do not call DeepSeek at runtime for bulk pages. Generation is build-time only. The Sanity AI button is the one runtime exception.
- Do not call the Searchspring API at runtime in production. Data is baked at build time.
- Do not use Server Actions for the lead form. Use a Route Handler.
- Do not add e-commerce features (cart, checkout, inventory).
- Do not add user accounts or authentication.
- Do not add tracking scripts beyond GA4 unless Patrick approves in writing.
- Do not block the main thread with the search index.
- Do not index paginated category pages (page 2+). Add `noindex,follow` + canonical to page 1.

## 19. Definition of Done

A page or feature is done when:

- TypeScript compiles with zero errors
- Lighthouse mobile score is 90 or above for Performance, Accessibility, Best Practices, SEO (root templates) or 85 plus (facet pages)
- All images have alt text
- All meta tags are present and unique
- Internal links resolve, no 404s in the build report
- Screenshots from staging match the reference layouts in `/docs/references/`
- Patrick has signed off if the page is in his review list

## 20. References

- Reference category layout: `/docs/references/category-layout.jpg`
- Reference blog layout: `/docs/references/blog-layout.jpg`
- Reference buying guide format: `https://www.perfectimprints.com/blog/buying-guide-for-stadium-seat-cushions`
- Logo: `/public/logo.svg` (brand red `#E11F1E`, ink `#231F20`)
- PI category URL list: `/data/pi-urls/category-urls.json` (22,180 valid URLs)
- PI blog URL list: `/data/pi-urls/blog-urls.json` (731 valid blog post URLs)
- Geiger source: `https://www.geiger.com/`
- Geiger Searchspring API: `https://kfx28d.a.searchspring.io/api/search/category.json`
- Geiger brand index: `https://www.geiger.com/c/shop-by-brand`
- Affiliate target host: `https://patrickblack.geiger.com/`

## 21. Open Questions Resolved

All five major architectural questions resolved as of May 15, 2026:

1. **Pagination URL pattern:** Static `/cat/[slug]/page/N`. Page 1 indexable, page 2+ noindex + canonical to page 1 (per Patrick feedback 2026-05-26).
2. **AI content depth:** Lite-on-facets. Buying-guide format on 465 root pages (400-600 words + 5 FAQs + keyword derivatives, upgraded 2026-05-26), meta plus 1 short intro paragraph on 21,715 non-root pages.
3. **Sanity AI button:** Build it. Custom Studio action on customCategory documents calling DeepSeek to auto-fill intro, buying guide, and FAQs.
4. **Per-facet membership scrape:** One Searchspring API call per facet URL (~6 hours unattended).
5. **Product detail scraping:** No. PI does not have product detail pages.

Remaining pending items (track in TASKS.md):

- Exact green hex shade confirmation (OQ-4)
- Lead form "from" address (OQ-1)
- Old site cutover timing (OQ-3)

## 22. Current Project State (Week 4 end)

Updated: 2026-06-10.

**Module 1 (Data Pipeline): Complete (Phase A-D).**

- Phase A: 544 Geiger categories, 482 leaves
- Phase B: 7,957 unique SKUs (99.82% of Geiger's 7,971 catalog)
- Phase C: 21,715 non-root URLs processed with 4-tier recovery. 13,968 with products, 7,518 zero, 229 errors
- Phase D: 465 PI roots mapped, 0 unmapped (72 exact + 224 fuzzy + 169 manual)
- Phase E (brand logos): NOT yet run — scheduled Week 4 (M1-112)

**Module 2 (AI Content): v1 content generated for all 22,180 pages. Buying-guide v2 upgrade still pending.**

- All 22,180 category JSONs exist in `data/categories/`: 465 roots with v2 buying-guide format (`promptVersion: "root-v2"`, populated `buyingGuideHtml` + `buyingGuideH2`) + 21,715 lite non-roots (modifiers/facets/compound-facets). Full set committed in `91a4b3de`.
- Week 2 demo: 35 root pages generated. Patrick reviewed 2026-05-25 and approved content tone.
- v1 quality pass (dedup-by-Geiger-path selection, 11-entry `EXCLUDED_SLUGS`, depth-aware SKU filter with `full`/`slug-filtered`/`full-capped-60` modes, compound-noun H1 rule, `post_process_lengths()` safety net) applied to the v2 prompt as well. Zero meta-length violations across all 465 roots.
- Buying-guide format delivered: 400-600 word `buyingGuideHtml`, H2 "Custom [Category] Buying Guide", keyword derivatives (custom, promotional, branded, personalized, logo, bulk, wholesale), structured buyer-research content matching the Stadium Seat Cushions blog example. Word-count adherence is stochastic — ~one-third of pages undershoot the 400-word floor by 30-100 words. Tracked for retry-on-validation-fail loop before any future re-runs.

**Module 3 (Category Templates): All 22,180 paths live; filters + lead form still pending.**

DONE:

- Routing for all 22,180 paths. Roots + modifiers + compound-facets pre-built (~1,840 paths including pagination); facets on-demand SSG via `dynamicParams=true` (Vercel build budget ENOSPC at ~34k paths, so the 21,137 facets must not be pre-built — do not widen `PREBUILD_TYPES` without re-checking).
- Production ProductCard (image, name, price, MOQ, brand badge, NEW/SALE/CLOSEOUT ribbons, affiliate link via `lib/affiliate-url.ts`), with `onError` placeholder fallback for hot-linked Geiger images that 404 between monthly rebuilds.
- Production ProductGrid, AI content rendering (H1, intro, FAQs, hero alt), breadcrumb, CTA banner (phone + email), 404 page.
- Mega menu (`lib/nav-data.ts`) rebuilt 2026-06-01 to read from PI's slug universe. Items grouped under Geiger top-level departments (Apparel, Bags & Totes, etc.) for visual familiarity; all 465 root links resolve. Column headers link to their PI department-equivalent root (`apparel`, `bags`, `drinkware`, `health`, `household`, `office`, `outdoor`, `writing`, `products` for Shop By); Tradeshow & Events column header is non-clickable because PI has no department-level slug for it. To be replaced by Sanity-driven menu in M5-503.

**PATRICK FEEDBACK FROM WEEK 2 DEMO** (scheduled across Weeks 3-5):

Week 3:

- ✅ HTML entity decoding bug in product titles (`&amp;`, `&quot;`) — fixed at loader level in `lib/categories.ts` via `lib/text-utils.ts::decodeHtmlEntities`
- ✅ Image fallback when Geiger image 404s — `onError` handler in `components/category/ProductImage.tsx` swapping to `/public/placeholder-product.svg`
- ✅ H2 "Custom [Category] Buying Guide" above bottom text — `buyingGuideH2` field populated in all 465 root JSONs; H2 rendered in `app/cat/[...slug]/page.tsx` on root pages only
- ✅ Buying-guide format content (longer, keyword derivatives) — `root_category.txt` v2 prompt landed; all 465 roots have `promptVersion: "root-v2"` and populated `buyingGuideHtml`. Word-count adherence is stochastic (~one-third of pages under target by 30-100w); add retry-on-validation-fail loop before any future re-runs.
- ✅ Full 22,180-page content generation — 465 roots (v2 buying-guide) + 21,715 lite non-roots all in `data/categories/`
- ✅ Pagination with noindex on page 2+ — M3-306 done 2026-05-31. `/cat/[slug]/page/N` URLs with 60 products per page, Prev/Next/numbered nav with adjacent-page prefetch, page 1 canonical to clean URL, pages 2+ emit `noindex,follow` + canonical back to page 1, `/page/1` 308-redirects to clean URL, out-of-range → 404. Sitemap at `/sitemap.xml` (22,921 URLs: 10 static + 22,180 category page-1 + 731 blog) excludes paginated variants entirely. First Vercel deploy hit `ENOSPC` at 34,857 static paths (Next.js 16 segment-artifact explosion); mitigated by switching facet pages to on-demand SSG — see Section 3 and Section 13.

Week 4:

- Filter sidebar with new "Minimum Quantity" filter (Patrick's addition)
- "Search within this category" input above filter sidebar
- Context-specific filters (apparel/drinkware/tech show extra filters when relevant)
- Brand logos scrape (Phase E)
- Brands tab in main menu + `/brands` index + `/brands/[slug]` per-brand pages
- ✅ Related Blogs section ("Related Blogs About [Category Name]" H2 with up to 8 related blog cards) — wired into root category pages in commit `b33f8333` (2026-06-10). Server-rendered from `relatedCategorySlugs`. 338 of 649 published blogs have at least one mapping; rest hide the section gracefully when zero matches.
- Lead capture form

**Module 4 (Blogs): Complete (2026-06-10).**

- **649 blogs published** to Sanity with current PI content (current MPower template), 82 hidden stub drafts for confirmed-deleted URLs
- Scraped directly from PI via SeleniumBase UC mode (Cloudflare Turnstile bypass) + US-exit VPN — Wayback-based first attempt produced inferior content and was discarded
- 100% have inline author (33 unique authors), 98% have hero image (real MPower CDN), 39 blogs have YouTube/Vimeo video embeds preserved, 52% have published+updated dates
- Blog templates live: `/blog`, `/blog/[slug]`, `/blog/cat/[slug]` + pagination variants, vertical sticky social share bar, sidebar with categories + popular links + LeadForm CTA
- Related Blogs section live on root category pages (M3-311)
- Raw scrape JSONs archived outside repo at `~/Documents/perfectimprints-archive/blogs-snapshot-2026-06-10/`. List of 82 deleted URLs retained at `data/blogs/.failed-slugs.txt` for delivery handoff. See M4-401 and M4-402 in TASKS.md for the full story.

Week 5:

- Deals main menu button + `/deals` aggregator page
- Mega menu fully Sanity-driven
- Mobile Pagespeed improvement (LCP + Speed Index)

**Already built (just confirming to Patrick):**

- Sale ribbon on product image (top-right corner) — will be visible on closeout pages once full generation completes

**Infrastructure state:**

- GitHub repo: `raoalihamza/perfectimprints` (linked to Vercel)
- Vercel deployment live at `dev.perfectimprints.com` (staging)
- Sanity Studio at `localhost:3333` and `/admin`. Project ID `ii96lcy9`.
- DeepSeek API key on Patrick's account, working
- Affiliate URLs link to `patrickblack.geiger.com` but that subdomain isn't active yet on Geiger's side — Patrick is chasing them

**Schedule note:** Eid-ul-Adha holiday on Wednesday May 27 and Thursday May 28, 2026. Ali offline those days. Active work resumes Friday May 29.

**Large data files note:** `products.json` (9.6 MB) and `facet-memberships.json` (44.5 MB) currently live in the main repo. Relocation tracked as M5-509.
