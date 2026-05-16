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
| Hosting         | Cloudflare Pages with Next.js adapter                                       |
| DNS             | Cloudflare                                                                  |
| AI content      | DeepSeek-V3 via API                                                         |
| Email           | Gmail SMTP via Nodemailer                                                   |
| Search          | Fuse.js with prebuilt JSON index                                            |
| Data pipeline   | Python with httpx HTTP/2, tenacity, beautifulsoup4, rapidfuzz, orjson, tqdm |
| Package manager | pnpm                                                                        |
| Node            | 20 LTS or higher                                                            |

## 3. Architecture Principles

Static-first. Every category page renders at build time as static HTML. Sanity-managed pages use ISR with on-demand revalidation triggered by Sanity webhooks.

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
- Category pagination: `/cat/[slug]/page/[n]` (static URLs for SEO)
- Blog index: `/blog`
- Blog post: `/blog/[slug]` (731 posts)
- Blog category: `/blog/cat/[slug]`
- Rush products: `/rush-promotional-products`
- Services pages: `/services/[slug]`
- Videos index: `/videos`
- Video detail: `/videos/[slug]`
- About, contact, privacy, terms, FAQs, sample policy, shipping, returns: keep paths exactly as they appear in the GA4 export.

Trailing slashes: match the current site behavior. If GA4 export shows no trailing slash, do not add one.

The full URL list with classification lives at `data/pi-urls/category-urls.json` (built by `pnpm import-urls`). Every component that needs to enumerate URLs reads from there.

## 5. Folder Layout

```
/app                Next.js App Router routes
/components         Reusable React components
/lib                Utilities, Sanity client, scraper output loaders, affiliate URL helpers
/data               Committed JSON for bulk pages
  /categories       One file per AI-generated category page (encoded slug as filename)
  /geiger           Scraped Geiger data: categories.json, products.json, facet-memberships.json
  /mappings         pi-to-geiger.json
  /blogs            Raw blog scrape output (pre-Sanity migration)
/sanity             Sanity studio config and schemas
  /schemas          Document type definitions
  /components       Custom Studio components (including AI generate button)
  /actions          Custom Studio actions
/scripts            Build-time and one-off scripts
  /scrapers/geiger  Python scraper (config.py, client.py, discover.py, products.py, memberships.py, mapping.py, run.py, checkpoint.py)
  /scrapers/blogs   Python Playwright blog scraper
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

**customCategory.** New categories Patrick creates that do not exist on Geiger. Same shape as curatedCategory plus an `isCustom` flag. Includes a custom Studio action "Generate with AI" that calls DeepSeek with the root category prompt template and auto-fills the intro paragraph and FAQs fields for Patrick to review.

**customProduct.** Products Patrick adds manually. Fields: title, image, description, external URL, parent category reference, display order. Used inside category page product grids when present.

**blogPost.** Fields: slug, title, header image, body (rich text / portable text), inline images, author, publish date, updated date, categories reference, related post references, meta title, meta description.

**blogCategory.** Taxonomy. Fields: slug, title, description.

**author.** Fields: name, bio, image.

**homePage.** Singleton. Fields: hero, featured image blocks (six of them), text content sections, brands grid reference.

**megaMenu.** Singleton. Fields: ordered list of menu items, each with label, link, optional dropdown items. Default state matches Geiger's mega menu structure.

**globalSettings.** Singleton. Fields: phone number (default `800-773-9472`), contact email, social links, footer columns content, copyright text, CTA banner text.

**faq.** Reusable FAQ items. Fields: question, answer, category tags.

**video.** Fields: slug, title, YouTube URL, description, category, publish date.

**brand.** Fields: name, logo image, optional URL. Auto-populated from Geiger products on first scrape, manually editable thereafter.

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
- `perPage=100` (max)
- `filter.[field]=[value]` (optional, for facet filtering)

Response includes full product objects (sku, name, brand, low_price, high_price, msrp, min_qty, imageUrl, description, category_path[], badges, is_new_item, is_on_sale, product_type_unigram), aggregated facets array with counts, pagination metadata, and sort options.

**Per-product attributes (color, material, size) are NOT on the product object.** They only appear in the aggregated facets array. To know which products belong to a facet URL like `/cat/water-bottles/material/stainless-steel`, the pipeline makes a filtered API call per facet URL (Phase C of the scraper). This is the 21,715 calls described in Section 16.

**Affiliate URL rewrite rule:** Replace `https://www.geiger.com/` with `https://patrickblack.geiger.com/` in any scraped Geiger URL before emitting it on the new site. Works for both `/p/` product URLs and `/b/` category URLs.

Source URL: `https://www.geiger.com/p/vinyl-football-510336?pid=208667`
Output URL: `https://patrickblack.geiger.com/p/vinyl-football-510336?pid=208667`

Helper function lives at `lib/affiliate-url.ts` and is the only place this transformation should happen. Never hardcode the transformation in components.

**Product images:** Hot-linked from Geiger's CDN at `imgsirv.geiger.com`. Do NOT download to our origin. Patrick is an authorized Geiger distributor and hot-linking is permitted. Use explicit width and height on every image to prevent CLS. Use `loading="lazy"` on images below the fold.

**Category mapping:** Each PI root category maps to one Geiger category via `data/mappings/pi-to-geiger.json`. Categories with no good match link to the closest Geiger top-level category. If absolutely nothing matches, fall back to `https://patrickblack.geiger.com/`.

**Affiliate subdomain fallback:** Until Geiger activates `patrickblack.geiger.com`, the affiliate host is configurable via `NEXT_PUBLIC_GEIGER_HOST`. Default value is `https://patrickblack.geiger.com`. If Geiger has not activated the subdomain by launch, set this to `https://www.geiger.com` temporarily.

## 9. AI Content Pipeline

Source of truth for what each category page needs: the entry in `data/mappings/pi-to-geiger.json` plus the corresponding Geiger category data in `data/geiger/`.

**Three-tier generation** based on URL type from `data/pi-urls/category-urls.json`:

For the **465 root category pages** (`/cat/[slug]`, type=`root`), generate:

- SEO H1
- Meta title (under 60 characters)
- Meta description (under 155 characters)
- Two to three paragraphs of body content
- Five FAQs with answers
- Hero image alt text

For the **576 modifier pages** (`/cat/[root]/[modifier]`, type=`modifier`), generate:

- SEO H1 incorporating both the root category and the modifier (e.g. "Closeout Water Bottles", "Eco-Friendly Tote Bags", "Custom Pens With No Minimum")
- Meta title and meta description tuned to the modifier intent (sale/closeout = price-sensitive, no-minimum = small-order buyers, eco-friendly = sustainability-conscious, etc)
- One short intro paragraph (60-80 words) explaining what makes this subset different (lower MOQ, sale pricing, eco materials, faster production)
- No FAQs

For the **21,137 facet category pages** (`/cat/[root]/[type]/[value]`, type=`facet`), generate:

- SEO H1 optimized for the long-tail keyword
- Meta title (under 60 characters)
- Meta description (under 155 characters)
- One short intro paragraph (60-80 words)
- No FAQs (root pages handle this)

For the **2 compound facet pages** (type=`compound-facet`), use the same lite template as facets, with the H1 incorporating both filter dimensions.

Prompt templates live at `scripts/ai-pipeline/prompts/`:

- `root_category.txt` for the full root template
- `modifier_category.txt` for the modifier lite template
- `facet_category.txt` for the standard facet lite template (also used for compound facets)

All templates inject:

- Top product names from Geiger
- Target keywords (always plural form: custom water bottles, branded tote bags, personalized pens)
- Buyer personas (marketing directors, HR directors, safety managers, business owners)

Root prompt varies opening structure to avoid sameness:

- 30 percent open with use cases
- 30 percent open with target industry or buyer
- 30 percent open with material or quality angle
- 10 percent open with seasonal or trending angle

Sample 465 root pages are generated first and reviewed before running the 21,715 lighter pages (576 modifiers + 21,137 facets + 2 compound).

Output is written to `data/categories/[encoded-slug].json` with a fixed schema:

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

Never overwrite a Sanity document, only the JSON files. DeepSeek is called build-time only, never at runtime.

**Sanity AI button:** customCategory documents have a "Generate with AI" Studio action that POSTs to `/app/api/sanity/generate-content/route.ts`. The route calls DeepSeek with the root_category prompt and the customCategory's title and target keyword, then returns the generated intro and FAQs. The Studio action patches the document fields with the result. Patrick reviews and publishes.

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

Sitemap is auto-generated at build time, split into multiple files if it exceeds 50,000 URLs. Robots.txt allows all, references the sitemap.

Internal linking: every root category page links to at least three related category pages and three related blog posts. Every blog post links to at least one category page in its body where contextually relevant.

## 12. Performance Targets

- LCP under 2.5 seconds on 4G
- CLS under 0.1
- INP under 200 milliseconds
- Initial JS bundle under 100 KB compressed for static category and blog pages

Geiger CDN images include explicit width and height attributes to prevent CLS. Non-Geiger images use Next.js Image component with responsive sizes, AVIF and WebP output, and lazy loading below the fold. Above-the-fold images use priority loading.

Fonts loaded with `font-display: swap` and preloaded for the main font weight. No more than two font weights total across the site.

## 13. Deployment

Cloudflare Pages, two environments:

- Staging: `dev.perfectimprints.com`, deploys on every push to `develop` branch
- Production: `perfectimprints.com`, deploys on every push to `main` branch

Build command: `pnpm build`
Output directory: handled by Cloudflare Next.js adapter

DNS cutover plan: lower TTL on existing perfectimprints.com records 48 hours before launch. On launch day, repoint apex to Cloudflare Pages production.

**Monthly auto-rebuild:** A GitHub Action runs on the 1st of every month at 00:00 UTC. Workflow steps:

1. Run Python scraper Phases A, B, C (Phase D mapping is stable after first run)
2. Regenerate AI content for any new Geiger categories
3. Commit data changes to repo on a `monthly-rebuild` branch
4. Open auto-merge PR to `main`
5. Cloudflare Pages production build triggered on merge
6. Email Patrick a summary report (products added, removed, price changes, new categories)

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
- **Cloudflare Pages** for hosting. Account is Patrick's.
- **DeepSeek** for AI content. API key on Patrick's account, billed to him directly.
- **Gmail SMTP** for transactional email. Uses Patrick's Google Workspace account with an app password. Requires SPF and DKIM records in DNS.
- **Google Search Console and Google Analytics 4** for analytics. Existing GA4 property continues, new GSC property added for new site verification.

## 16. Data Pipeline Rules

Geiger data integration is permitted. Patrick has confirmed (he is a Geiger distributor).

Pipeline runs locally or in scheduled GitHub Actions, never in production runtime.

Throttle: one request per second per worker against the Searchspring API. Use `httpx` HTTP/2 client with `tenacity` retry on transient failures.

Checkpointing: save state every 100 requests so partial runs resume. State file at `scripts/scrapers/geiger/.checkpoint/`.

**Four-phase pipeline:**

**Phase A: Taxonomy discovery.** One HTTP GET to a Geiger category page (e.g., `https://www.geiger.com/b/accessories`), parse the mega menu HTML with BeautifulSoup, extract the full category tree with parent-child relationships. Output: `data/geiger/categories.json`. Runtime: minutes.

**Phase B: Product catalog.** For each Geiger leaf category, paginate the Searchspring API with `perPage=100`. Deduplicate by SKU. Output: `data/geiger/products.json`. Runtime: 20-40 minutes.

**Phase C: Facet and modifier memberships.** For each of the 21,715 PI URLs that need product membership data (576 modifiers + 21,137 facets + 2 compound facets), one filtered Searchspring API call to capture the SKU list. Output: `data/geiger/facet-memberships.json`. Runtime: 6 hours unattended.

For **modifier URLs** (search, no-minimum, closeout, production-time, eco-friendly, material), the Searchspring filter mapping is:

- `search` → no extra filter (returns the same products as the root, used as a search-landing variant)
- `no-minimum` → `filter.min_qty[lt]=25` (or similar low threshold; verify with sample call)
- `closeout` → `filter.is_on_sale=true` or a closeout badge filter
- `production-time` → `filter.production_time[lt]=5` (rush production)
- `eco-friendly` → `filter.eco_friendly=true` (or matching badge)
- `material` (1 URL only) → low priority, treat as root for now

For **compound facet URLs** (2 of them), send multiple `filter.[type]=[value]` params in one call.

**Phase D: PI-to-Geiger mapping.** Match each of the 465 PI root categories to a Geiger leaf via exact slug match, then fuzzy match with rapidfuzz, then AI fallback via DeepSeek for the remainder. Output: `data/mappings/pi-to-geiger.json` plus a CSV report with confidence scores. Runtime: minutes.

For blog migration, attempt clean export from MPower dashboard at `app.mpowerpromo.com` first. If that fails, use the Playwright-based fallback scraper at `scripts/scrapers/blogs/` against perfectimprints.com using the URL list at `data/blogs/blog-urls.txt`.

## 17. Conventions

- Server Components are the default. Use `'use client'` only where state, effects, or browser APIs are needed.
- Data fetching happens in Server Components, never in client components except via the Next.js Route Handler API.
- Forms post to App Router Route Handlers under `/app/api/`.
- All TypeScript is strict mode. No `any` without an inline justification comment.
- Sanity queries use GROQ in dedicated query files under `/lib/sanity/queries/`.
- All user-facing copy lives in Sanity or in JSON data files. No hardcoded marketing strings in components.
- Image alt text is required, not optional. Lint rule enforces it.
- Affiliate URL transformation lives only in `lib/affiliate-url.ts`. Never inline the replace.
- Commit messages follow Conventional Commits.

## 18. Never Do

- Do not introduce 301 redirects for any URL that exists in the GA4 export.
- Do not put bulk AI-generated content into Sanity. Hybrid model only.
- Do not use the geiger.com host in any link emitted by this site. Always rewrite to the affiliate host via `lib/affiliate-url.ts`.
- Do not download Geiger images to our origin. Hot-link from `imgsirv.geiger.com` with explicit dimensions.
- Do not call DeepSeek at runtime for bulk pages. Generation is build-time only. The Sanity AI button is the one runtime exception, and it only runs when Patrick clicks it.
- Do not call the Searchspring API at runtime in production. Data is baked at build time.
- Do not use Server Actions for the lead form. Use a Route Handler so we have explicit control over response codes and email delivery errors.
- Do not add e-commerce features (cart, checkout, inventory).
- Do not add user accounts or authentication. The site is fully public.
- Do not add tracking scripts beyond GA4 unless Patrick approves in writing.
- Do not block the main thread with the search index. Lazy load Fuse and the index on first user interaction.

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
- Logo: `/public/logo.svg` (brand red `#E11F1E`, ink `#231F20`)
- PI category URL list: `/data/pi-urls/category-urls.json` (22,180 valid URLs: 465 roots + 576 modifiers + 21,137 facets + 2 compound facets)
- PI blog URL list: `/data/pi-urls/blog-urls.json` (731 valid blog post URLs)
- Geiger source: `https://www.geiger.com/`
- Geiger Searchspring API: `https://kfx28d.a.searchspring.io/api/search/category.json`
- Affiliate target host: `https://patrickblack.geiger.com/`

## 21. Open Questions Resolved

All five major architectural questions resolved as of May 15, 2026:

1. **Pagination URL pattern:** Static `/cat/[slug]/page/N` (SEO friendly).
2. **AI content depth:** Lite-on-facets. Full body plus 5 FAQs on 465 root pages, meta plus 1 short intro paragraph on 21,715 non-root pages (576 modifiers + 21,137 facets + 2 compound).
3. **Sanity AI button:** Build it (Option A, approximately 8 hours of work). Custom Studio action on customCategory documents calling DeepSeek to auto-fill intro and FAQs.
4. **Per-facet membership scrape:** One Searchspring API call per facet URL (Option A). 21,715 calls at 1 req/sec is approximately 6 hours unattended.
5. **Product detail scraping:** No. PI does not have product detail pages. Searchspring API alone provides all data needed for product cards.

Remaining pending items (track in TASKS.md):

- Exact green hex shade confirmation
- Lead form "from" address (patrick@ direct vs leads@ alias)
- Image fallback policy when Geiger lacks an image
- Old site cutover timing (parallel period or immediate decommission)
