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

Static-first (hybrid SSG). The headline category surfaces — 465 root pages + 576 modifier pages + 2 compound-facet pages, plus their pagination variants (~1,840 paths total) — render at build time as static HTML and ship in the Vercel deployment. The 21,137 long-tail facet pages render via on-demand SSG (`dynamicParams = true` + `revalidate = false`): the first hit (typically a Googlebot crawl) generates the page and Vercel caches it at the edge permanently until the next deploy. This is a forced deviation from "every page at build time" because pre-building all 22,180 pages plus pagination (~34,857 paths) blows Vercel's per-deployment output budget — Next.js 16 emits ~5 segment artifacts per static page, hitting `ENOSPC` on the build runner. Crawlers and users see identical static HTML once a page is warm. To keep these pages static the `/cat` render path reads NO `searchParams` and makes NO uncached Sanity call (both force Next into dynamic rendering) — faceted filtering runs in a separate dynamic API route called client-side, and all Sanity reads are cache-tagged (see Section 13 "Keeping /cat static" and Section 7 owned-slug precedence). Sanity-managed pages use ISR with on-demand revalidation triggered by Sanity webhooks. See Section 13 and `app/cat/[...slug]/page.tsx` for the implementation, and TASKS.md M3-306 for the incident write-up.

URL preservation is non-negotiable. The 22,180 existing category URLs and 731 blog URLs from GA4 must resolve to the same path on the new site. No 301 redirects for migrated URLs.

Hybrid content model. Bulk AI-generated category pages live as JSON files in the repo. Sanity holds curated categories, custom categories, custom products, blogs, home page, mega menu, FAQs, global settings, and anything Patrick edits.

Data baked at build time. Product catalog and category data are scraped once and committed to the repo as JSON. Production builds never call the Geiger API at runtime. A scheduled monthly rebuild refreshes the data and redeploys.

Outbound links open in the same tab unless noted. Affiliate links to Geiger use the patrickblack.geiger.com host. Links to non-Geiger partner sites use whatever URL is set on the custom product document.

Category CTA rule. A category renders the lead-form CTA instead of the product grid based ONLY on the three `shouldShowEmptyStateCTA` rules: `productSkus.length === 0` (empty-skus, Tier 3/4 fallback), `skuFilterMode === 'full-capped-60'` (slug-token filter failed → off-topic top-60 of a parent department), and manual `forceCTA === true` in the JSON. Categories with real matched SKUs — including fuzzy/override mappings like binoculars, tote-bags, pens — render their product grid. (An exact-match-only "Geiger-menu" gate was tried in M5-504 part 1 and **reverted as too aggressive**: it flipped ~10,694 categories to CTA, including genuine product-bearing ones. The handful of genuinely off-topic categories — e.g. dog-tags, PPE — are fixed by **targeted `categoryOverride` docs** (`forceCTA` / `hiddenSkus`, Section 7), not a site-wide rule.) Audit the CTA split with `pnpm audit:category-rule` → [docs/category-rule-audit.md](docs/category-rule-audit.md); reconcile against Patrick's confirmed old-URL spreadsheet with `pnpm reconcile:missing-urls` → [docs/missing-url-reconciliation.md](docs/missing-url-reconciliation.md).

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
- New products page: `/new-products` (new, weekly Phase G aggregator)
- Rush products aggregator: `/rush-products` (new, weekly Phase H aggregator of Geiger's 24 Hour Rush Products collection; the "Rush Products" header nav item points here)
- Rush products (legacy preserved URL): `/rush-promotional-products`
- Services pages: `/services/[slug]`
- Videos index: `/videos`
- Video detail: `/videos/[slug]`
- Browse-all products page: `/promotional-products` (new, M5-506 — lists all ~7,957 products with Category / Price / Brand / Min-Qty facets, filtered/sorted/paginated entirely server-side so the full catalog never ships to the client; the "Promotional Products" root breadcrumb crumb points here, replacing the old dead `/cat` target). Indexable; filter/sort/page variants are `noindex,follow` + canonical to the clean URL.
- FAQ library: `/faq` (M5-506 — answered FAQs grouped into the 7-category taxonomy as `<details>` accordions + FAQPage JSON-LD. Singular `/faq`, matching the live site, NOT `/faqs`)
- Footer / legal static pages (M5-506, all built on the generic `page` builder, content reproduced from PI's OWN live site): `/about`, `/contact` (includes the lead form), `/sample-policy`, `/shipping-policy`, `/returns`, `/privacy-security`, `/company-core-values`, `/terms`. **Every slug mirrors the live perfectimprints.com URL exactly** (verified against the real footer links) so existing SEO equity / inbound links are preserved — matching the slug beats a redirect. (The original `/privacy` + `/terms` dev stubs were replaced; privacy lives at `/privacy-security` and terms at `/terms`.)

Trailing slashes: match the current site behavior. If GA4 export shows no trailing slash, do not add one.

Canonical host is www.perfectimprints.com. The apex perfectimprints.com redirects to www, configured at the Vercel domain level (set `www.perfectimprints.com` as the project's primary/production domain — Vercel issues the apex→www 308) plus a backup `next.config` `redirects()` rule. **No redirect middleware** — a static site must not run per-request middleware. **Every emitted URL (canonical, OG, Twitter, sitemap, robots `sitemap:`, breadcrumb absolute URLs, JSON-LD `url`/`@id`) derives solely from `NEXT_PUBLIC_SITE_URL`** — production = `https://www.perfectimprints.com` (set in Vercel), staging = `https://dev.perfectimprints.com`. The env value is used verbatim as the origin (only a trailing-slash trim); no string surgery forces or drops `www`, so flipping the env flips every URL. Every page file/SEO helper defaults to the www form when the env is unset.

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

**customCategory.** The single doc type for full per-category control — both **brand-new** category pages and **taking over an existing baked JSON page** (the "push the JSON category pages to Sanity 1 by 1" model). The slug is the key: a published `customCategory` OWNS its `/cat/<slug>` and Sanity wins; otherwise the baked JSON renders. Fields: title (heading), slug, `isCustom`, `targetKeyword` (plural), `heroImage`, `heroCopy`, `introHtml` (portable text — paragraphs), `bodySections` (portable text — buying guide), `faqs[]`, `productSkus[]` (editable Geiger SKU list — searchable product picker, see below), `externalUrl` (optional CTA), `seo`. **Renders at `/cat/<slug>` through the `/cat/[...slug]` route** via [components/category/CustomCategoryView.tsx](components/category/CustomCategoryView.tsx) (hero, intro, product grid, body, FAQs + FAQPage schema, breadcrumb + BreadcrumbList, CTA). No Geiger mapping required. Products = `productSkus[]` + its `customProduct`s (attached via `parentCategory`) + `productPlacement`/`categoryOverride` edits, merged by `mergeCategoryProducts` (removal wins, de-duped, live-resolved). CTA → contact form (`EmptyStateCTA`) when `externalUrl` is blank.

**Push to Sanity (taking over an existing page).** A Studio **tool** ([sanity/tools/push-category-tool.tsx](sanity/tools/push-category-tool.tsx), registered via `tools` in [sanity/sanity.config.ts](sanity/sanity.config.ts)) lets Patrick search all 22,180 slugs (via `category-list.json`) and "Push to Sanity": it GETs [app/api/sanity/push-category/route.ts](app/api/sanity/push-category/route.ts), which reads the baked JSON and returns pre-filled fields (`h1`→title, `metaTitle`/`metaDescription`→`seo`, `introHtml` HTML→portable text, `buyingGuideHtml`+`buyingGuideH2`→`bodySections`, `faqs`, `productSkus`), and creates a **draft** customCategory for Patrick to review. HTML→portable-text conversion is [lib/portable-text/html-to-blocks.ts](lib/portable-text/html-to-blocks.ts). Publishing the draft makes Sanity own the page; **deleting/unpublishing reverts to the baked JSON** (non-destructive, reversible).

**Owned-slug precedence + edited-set gating (performance).** Every Sanity read in the `/cat/<slug>` render path is a **cache-tagged** fetch (via the `useCdn:false` `cachedClient`, `{ next: { tags, revalidate: false } }`), NEVER `no-store` — so the route stays statically prerenderable (see Section 13) while the webhook revalidates edits in seconds. To avoid a Sanity lookup on each of ~22,180 baked pages, the route reads ONE shared tag-cached structure ([lib/sanity/queries/owned-categories.ts](lib/sanity/queries/owned-categories.ts), `getCategoryControlSets` — tag `category-control-sets`) giving two sets: `owned` (published customCategory slugs) and `edited` (`owned` ∪ slugs touched by a `categoryOverride` or `productPlacement`). An `owned` slug renders from Sanity (`getCustomCategoryBySlug`, wins over JSON); only an `edited` slug runs the per-slug `getCategoryOverride` + `getPlacementSkusForCategory` fetches (each tagged `cat:<slug>` — see [lib/sanity/cache-tags.ts](lib/sanity/cache-tags.ts)); **every untouched page renders straight from baked JSON with zero per-page Sanity calls**. Build-time baseline artifact `public/custom-category-slugs.json` ([scripts/build-custom-category-slugs.ts](scripts/build-custom-category-slugs.ts), in `prebuild`) is the offline owned-set fallback (and seeds `generateStaticParams` so owned pages prebuild). The webhook busts `category-control-sets` (membership change) + `cat:<slug>` (that page's content) + `revalidatePath('/cat/<slug>')` on publish/unpublish of a customCategory / categoryOverride / productPlacement (Next 16 2-arg `revalidateTag(tag, 'max')`), so a push/edit goes live within seconds without making the route dynamic.

**Generate with AI** (M5-505, customCategory-only, registered in [sanity/sanity.config.ts](sanity/sanity.config.ts)) — works on both new and pushed docs. POSTs title + `targetKeyword` to [app/api/sanity/generate-content/route.ts](app/api/sanity/generate-content/route.ts) (DeepSeek, server-side `DEEPSEEK_API_KEY`, v2 buying-guide prompt — plural keywords + custom/promotional/branded/personalized/logo/bulk/wholesale derivatives + buyer personas, no "Perfect Imprints" in H1/H2) and patches heading (`title`) + `seo` + `introHtml` + `bodySections` + `faqs` for Patrick to review (loading + error states, never auto-publishes). Manual editing of all fields works equally.

**customProduct.** Products Patrick adds manually — covers non-Geiger vendors and any item he wants to feature beyond the auto-scraped catalog. Fields: title, image, description, `externalUrl` (any vendor; non-Geiger URLs pass through unchanged, Geiger URLs auto-rewrite via `lib/affiliate-url.ts`), parent category reference, display order. Placement controls: `placements.onDeals`, `placements.onNewProducts`, `placements.onRush` (booleans — toggle to surface the item on any of the three aggregators). Commerce fields (all optional, only required for `/deals`, `/new-products`, and `/rush-products` use): `brand`, `lowPrice`, `highPrice`, `msrp`, `minQty`, `productionTime`. Filter-tag fields (optional): `colors[]`, `material` — use the same value names Geiger uses (e.g. "Blue", "Stainless Steel") so the product participates in the Brand/Color/Material filters alongside scraped Geiger products. `badges[]` (multi-select: `new` / `sale` / `closeout`) drives the ribbon on the product card. Used in four places: (1) inside category page product grids via `parentCategory` ref, (2) `/deals` when `placements.onDeals == true`, (3) `/new-products` when `placements.onNewProducts == true`, (4) `/rush-products` when `placements.onRush == true`. Normalization to the `GeigerProduct` shape lives in [lib/sanity/queries/custom-products.ts](lib/sanity/queries/custom-products.ts) (`customProductToGeigerProduct()`); the SKU is synthesized as `custom-<sanity-_id>` so it never collides with real Geiger SKUs.

**categoryOverride.** Per-category curation override (M5-504 part 1), keyed by the `/cat/...` URL slug (`categorySlug` — the path after `/cat/`, e.g. `water-bottles` or `water-bottles/color/blue`; **picked with the searchable single-select `CategorySlugInput`** so selecting writes the exact slug and a typo can't silently target nothing — same picker as `productPlacement`). Fields: `forceCTA` (bool), `forceProducts` (bool), `hiddenSkus[]`, `addedSkus[]` (existing Geiger SKUs), `addedProducts[]` (references to `customProduct`). It is the manual escape hatch on top of the automatic CTA rules (Section 3) — and the **chosen mechanism for fixing off-topic categories** (set `forceCTA` to hide a wrong grid, `hiddenSkus` to prune wrong items, `forceProducts` to surface a category the `full-capped-60` rule suppressed). Render-time precedence (highest first): `forceCTA` → `forceProducts` → original `shouldShowEmptyStateCTA` (empty-skus / full-capped-60 / JSON forceCTA). When products show, `hiddenSkus` (remove) and `addedSkus`/`addedProducts` (prepend) feed the unified resolver `mergeCategoryProducts()` in [lib/sanity/queries/category-overrides.ts](lib/sanity/queries/category-overrides.ts) (added SKUs resolved via `resolveProductsBySku`, custom products via `customProductToGeigerProduct`). The precedence is wired inline in [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx). The Sanity webhook revalidates `/cat/<categorySlug>` on publish (the webhook GROQ projection must include `categorySlug`). No bulk JSON is rewritten — overrides are read at render time. This is the **category-first** editing direction; the **product-first** direction is `productPlacement` (below). Both merge through `mergeCategoryProducts`.

**productPlacement.** Product-side placement (M5-504 Part 2), keyed by a Geiger `sku` (string), the complement to `categoryOverride`. Fields: `sku` (picked with the searchable single-select `ProductSkuInput`, see below), `addToCategories[]` and `removeFromCategories[]` — both arrays of category slugs picked with the searchable `CategoryPicker`. Lets Patrick attach/detach one product to/from many categories. Query in [lib/sanity/queries/product-placements.ts](lib/sanity/queries/product-placements.ts) (`getPlacementSkusForCategory`). The webhook revalidates every `/cat/<slug>` in both lists on publish (projection must include `addToCategories` + `removeFromCategories`).

**Unified category product resolver** (M5-504 Part 3, `mergeCategoryProducts` in [lib/sanity/queries/category-overrides.ts](lib/sanity/queries/category-overrides.ts)). Produces a category's final grid by merging both edit directions: (1) baked `productSkus`, (2) `+ categoryOverride.addedSkus`/`addedProducts`, (3) `+ productPlacement.addToCategories`, (4) `− categoryOverride.hiddenSkus`, (5) `− productPlacement.removeFromCategories`. **Removal wins over add**; de-duped by SKU; all SKUs resolved **live** by `resolveProductsBySku` so placements reference products by SKU and survive the weekly/monthly Geiger re-scrape (a discontinued SKU resolves to nothing). Reuses the lookup layer — no duplication. Both editing entry points reach the same result on `/cat/<slug>`.

**Searchable Studio pickers (category + product).** The 22,180 category pages and ~7,957 catalog products are build-time JSON, not Sanity docs, so normal reference fields can't target them. Two picker modules cover this, both Studio-only, plain React + the `sanity` form API (no `@sanity/ui`):
- **Category** ([sanity/components/CategoryPicker.tsx](sanity/components/CategoryPicker.tsx), hook `useCategoryOptions`): `CategoryPicker` (multi-select → `productPlacement.addToCategories`/`removeFromCategories`) and `CategorySlugInput` (single-select → `categoryOverride.categorySlug`). Source: `category-list.json` (slug + title for all 22,180, from `data/pi-urls/category-urls.json` via `pnpm build:category-list`) **plus** live `customCategory` slugs; supports **create-new** (creates a `customCategory` at that slug).
- **Product** ([sanity/components/ProductPicker.tsx](sanity/components/ProductPicker.tsx), hook `useProductOptions`): `ProductSkuPicker` (multi-select → `customCategory.productSkus`, `categoryOverride.addedSkus`/`hiddenSkus`) and `ProductSkuInput` (single-select → `productPlacement.sku`). Search the catalog by name / SKU / brand and click to add the **SKU** (no more typing numbers from memory). Source: `product-list.json` (sku + name + brand for all ~7,957, from `data/geiger/products.json` via `pnpm build:product-list`).

Both lists are built in `prebuild` and written to **BOTH `public/` (served by the embedded Studio at `/admin3773752`) and `sanity/static/` (served by the standalone `sanity dev` Studio, which does NOT serve Next's `public/`)** — the shared loader [sanity/components/load-json.ts](sanity/components/load-json.ts) (`loadStudioJson`) tries `/<file>` then `/static/<file>`, requires a JSON content-type (rejects SPA index.html fallbacks), and surfaces a clear "couldn't load" message instead of a misleading "no match" when neither resolves. `sanity/static/` is git-ignored (regenerated by `prebuild`). Studio-only — these lists are never loaded by the live site.

**blogPost.** Fields: slug, title, header image, body (rich text / portable text), inline images, author, publish date, updated date, categories reference, `relatedBlogs` (manual override reference array — when set, takes over the "See Related Blogs About …" list on the post page in editor-chosen order; when empty, the post page auto-derives by shared category slugs, newest first), meta title, meta description. Body also accepts an inline `blogProducts` block (see below) so editors can drop a row of product cards between paragraphs the way the legacy MPower blogs did.

**blogProducts (body object).** Insertable anywhere in `blogPost.body` from the Studio insert menu. Fields: optional `heading` (string, rendered as an H2 above the row) and `products` (array of `{ sku?, title?, image?, url? }`). Each product is either SKU-backed (live price/image/affiliate URL pulled from the Geiger catalog at render time) or fully manual (title + image + external URL). SKUs are resolved server-side in [app/blog/[slug]/page.tsx](app/blog/[slug]/page.tsx) via `resolveProductsBySku` (`lib/categories.ts` reads `products.json` from disk, so the lookup cannot run inside the synchronous PortableText renderer) and handed to `BlogBody` as a `Map<string, GeigerProduct>`. SKU-backed entries render via the standard `components/category/ProductCard.tsx`; manual entries render a parallel card and route their URL through `lib/affiliate-url.ts` only when the host is Geiger.

**blogCategory.** Taxonomy. Fields: slug, title, description.

**author.** Fields: name, bio, image.

**homePage.** Singleton. Fields: `heroText` (M5-501 follow-up — the EDITABLE text hero at the top: `eyebrow`/`headline` (H1)/`subheadline`, rendered by [components/home/Hero.tsx](components/home/Hero.tsx); kept text-only — no image — so the LCP element stays text-bound and fast. Seeded with Patrick's exact copy via `pnpm seed-home-content` ([scripts/seed/seed-home-content.ts](scripts/seed/seed-home-content.ts)). The legacy image-based `heroBanner` object is retained collapsed but NOT rendered on the home page; `getHomePage` falls back to its headline/subheadline only if `heroText` is blank), `bannerRowHeading` (H2) + `bannerRowSubheading` (editable section heading rendered directly above the banner row — seeded "Featured Product Categories" / "Seasonal promos your customers and team will love and use right now!"), `bannerRow` (M5-506 — an editable row of up to three equal-size banner images, each `image` + `link` (url) + `alt`, rendered below the hero via [components/home/BannerRow.tsx](components/home/BannerRow.tsx); banners keep their own aspect ratio so uniformity comes from consistently-sized uploads, and an empty array renders nothing. **Pre-filled** from PI's OWN live home page — the Sunglasses / Event Tents / Hats small-banner row — with each image downloaded into a SELF-HOSTED Sanity asset and linked to the equivalent preserved `/cat/<slug>` route (`/cat/sunglasses`, `/cat/canopy-tents`, `/cat/caps`); reproduce with `pnpm seed-home-banners` ([scripts/seed/seed-home-banners.ts](scripts/seed/seed-home-banners.ts)). Patrick can swap any banner in Studio), `valueProps` (Value Pillars — `title` + `body`; **`body` is portable text (rich text), NOT a plain string**, so Patrick can add hyperlinks — e.g. link "Rush Production Available" to `/rush-products`. Links render in **brand red** with underline-on-hover, external links open in a new tab with `rel="noopener noreferrer"`, via the shared `pillarComponents` in [components/home/PillarCard.tsx](components/home/PillarCard.tsx). **Render mode is count-driven (M5-501 Part 6):** ≤3 pillars render as the original static row; **>3 pillars rotate in a carousel** — up to 3 visible at a time on desktop / 1 on mobile, snap-scroll + prev/next + auto-advance (paused on hover/focus, disabled for `prefers-reduced-motion`) via the client [components/home/ValuePillarsCarousel.tsx](components/home/ValuePillarsCarousel.tsx). The `valueProps` validation was relaxed from "exactly 3" to "min 1" so Patrick can add more. `seed-home-content` migrates any legacy string bodies to portable text, preserving the text; the one-off `pnpm fix-pillar-links` ([scripts/migrations/fix-pillar-inline-links.ts](scripts/migrations/fix-pillar-inline-links.ts)) rewrites any pillar body where Patrick pasted **literal `<a href>` HTML** into a real `link` mark — RUN 2026-06-28, fixed the Rush pillar, idempotent), `newProductsHeading` + `rushProductsHeading` (rail headings — the New & Trending rail and the **Rush Production rail** below it, both rendered by [components/home/NewProductsRail.tsx](components/home/NewProductsRail.tsx); the Rush rail is fed by `getRushProducts(12)` from [lib/rush-products.ts](lib/rush-products.ts), same scraped data file as `/rush-products`, no new scrape), `testimonialsHeading` (editable, default "What Our Customers are Saying") + `testimonials` (now a **3-up horizontal carousel** — [components/home/Testimonials.tsx](components/home/Testimonials.tsx) is a client component: snap-scroll showing 3 per view on desktop / 1 on mobile, prev/next + native swipe + auto-advance, dark `bg-brand-ink` styling kept), featured image blocks (six of them), text content sections, brands grid reference.

**megaMenu.** Singleton (`_id: megaMenu`). Drives the live primary navigation (M5-503). Field `items[]` is the ordered top-level menu, left to right. Each item has a `kind`: `link` (plain link — `href`), `dropdown` (flat list — `links[]` of `{label, href}`, e.g. Services), or `megaPanel` (columned panel — `columns[]`, each `{label, href?, nonClickable, links[]}`). A `megaPanel`'s `variant` selects the renderer: `cascade` (hover-reveal columns, "Shop by") or `grid` (full-width grid popover, "All Categories"). Reserved-but-unrendered fields `featured` + `productRefs` are retained for a future featured-products panel. Seed/reset from code with `pnpm seed-mega-menu` (reads `lib/nav-data.ts`); the header reads it via `getMegaMenu()` in [lib/sanity/queries/mega-menu.ts](lib/sanity/queries/mega-menu.ts). Reorder/rename/hide/add/delete in Studio reflects live (revalidated via the Sanity webhook on the layout route). No hard-coded fallback — Sanity is the sole source.

**globalSettings.** Singleton (`_id: globalSettings`). Fields: legacy flat `phoneNumber` (default `800-773-9472`) / `contactEmail` / `mailingAddress` / `hoursOfOperation` (kept only as fallbacks), `contact` group, `socialLinks[]`, footer columns content, copyright text, CTA banner text, plus per-aggregator curation objects:
- **`socialLinks[]` — Sanity-controlled socials (no hardcoded URLs).** Each item: `platform` (dropdown: Facebook / Instagram / LinkedIn / YouTube / X (Twitter) / Pinterest / TikTok / Other), `label` (optional a11y/display name, required for "Other"), `url` (validated http/https), `customIcon` (optional image — used for "Other" or to override the built-in icon), `enabled` (boolean, default true). **`enabled: false` hides the link EVERYWHERE and excludes it from the Organization `sameAs`.** Known platforms render a built-in inline-SVG icon ([components/icons/social-icons.tsx](components/icons/social-icons.tsx), `SocialIcon` + `SOCIAL_ICON_MAP`, keyed by the platform value — keys are duplicated there, not imported, because the standalone Studio bundler can't import this app dir); "Other"/`customIcon` renders the uploaded image; unknown + no icon → a generic globe so nothing breaks. Patrick just picks a platform and pastes the URL.
- **`contact` group — authoritative phone/email/address.** `phones[]` (one or more; first is the primary schema telephone), `email` (validated), `address` object (`street`, `city`, `region`, `postalCode`, `country`). The footer + Organization JSON-LD read from `contact`, falling back to the legacy flat fields only when `contact` is blank.
- **`footerColumns[]` — Sanity-driven footer nav columns (M-SEO3 follow-up).** The three link columns left of Contact (About Us / Popular Links / Customer Service). Each `footerColumn` = `heading` + `links[]` (`link`: `label`, `href`, `external`). `getSiteSettings()` resolves them (keeping only columns with a heading + ≥1 valid link); [components/layout/Footer.tsx](components/layout/Footer.tsx) renders from `footerColumns` when present and **falls back to its hardcoded `NAV_COLUMNS`** when empty, so the footer is never blank. `external` links open in a new tab (`rel="noopener noreferrer"`); internal use `<Link>`. The dedicated **Contact column** (phones/email/address from `contact`, the hours line, Contact Form link) and the **social row** are NOT part of `footerColumns` — they stay separate. Seed idempotently (writes only when empty, never overwrites edits) with `pnpm seed-footer-columns` ([scripts/seed/seed-footer-columns.ts](scripts/seed/seed-footer-columns.ts)) — values mirror `NAV_COLUMNS`, so the live footer is identical after wiring. **Ran 2026-06-28** (wrote 3 columns / 14 links; re-run is a no-op).
- **Read path.** Both the footer ([components/layout/Footer.tsx](components/layout/Footer.tsx)) and the Organization JSON-LD ([components/seo/OrganizationJsonLd.tsx](components/seo/OrganizationJsonLd.tsx) → `organizationSchema(settings)` in [lib/seo/schema-generators.ts](lib/seo/schema-generators.ts)) consume `getSiteSettings()` ([lib/sanity/queries/global-settings.ts](lib/sanity/queries/global-settings.ts)) — React-`cache()`d so they share one fetch, resolves enabled-only socials + custom-icon URLs + contact + footerColumns, mirrors the `getMegaMenu` plain-`client` pattern so `/cat` stays static. The footer renders only enabled socials (new tab, `rel="noopener noreferrer"`, `aria-label`) — no more `#` placeholders. The webhook's `globalSettings` case already `revalidatePath('/', 'layout')`, so edits go live in seconds. Seed contact (and socials, if found) from PI's own site with `pnpm seed-social-contact` ([scripts/seed/seed-social-contact.ts](scripts/seed/seed-social-contact.ts)) — phones `800-773-9472` + `850-200-4020`, email `cs@perfectimprints.com`, address `913 Beal Pkwy NW, Ste A153, Fort Walton Beach, FL 32547`. **No real social URLs were seedable — PI's live footer social icons are all `#` placeholders — so Patrick adds socials in Studio.**
- `dealsPage` for `/deals`: `heading`, `intro`, `metaTitle`, `metaDescription`, `hiddenDealSkus[]` (blocklist — remove scraped products), `pinnedDealSkus[]` (allowlist — promote any existing Geiger SKU to `/deals` even if Geiger's weekly scrape did not include it; resolved against `data/geiger/products.json`).
- `newProductsPage` for `/new-products`: mirror shape with `hiddenNewProductSkus[]` + `pinnedNewProductSkus[]`.
- `rushProductsPage` for `/rush-products`: mirror shape with `hiddenRushSkus[]` + `pinnedRushSkus[]`.

The product list on all three pages is auto-scraped weekly from Geiger (see Section 16 Phase F + Phase G + Phase H). The Sanity layer adds three editorial levers without touching the scraper: hide a scraped SKU, pin an existing Geiger SKU, or add a fully custom non-Geiger product via the `customProduct` document with `placements.onDeals`/`placements.onNewProducts`/`placements.onRush` set. Merge order on each page: custom products → newly-pinned Geiger SKUs → scraped Geiger products. Augmentation logic lives in [lib/products/augment.ts](lib/products/augment.ts) (pure, no I/O); orchestration in [lib/deals.ts](lib/deals.ts) (`getAugmentedDealsData()`), [lib/new-products.ts](lib/new-products.ts) (`getAugmentedNewProductsData()`), and [lib/rush-products.ts](lib/rush-products.ts) (`getAugmentedRushProductsData()`). Custom products participate in the Brand/Color/Material filter sections (their tags are injected into the corresponding facet values' SKU arrays) and the synthetic Category section (via `parentCategory` ref).

**faq.** Reusable FAQ items. Fields: `question`, `answer` (NOT required as of M5-506 — the library is seeded with question stubs and the answer is filled later), `categoryTags` (references to curated/custom categories, for the per-`/cat` Related-FAQs section), and `faqCategory` (M5-506 — the FAQ-library taxonomy: one of 7 ordered categories, canonical list in [lib/faqs/categories.ts](lib/faqs/categories.ts), mirrored inline in the schema because the standalone Studio bundler can't import `lib/`). The **`/faq` library page** ([app/faq/page.tsx](app/faq/page.tsx)) — slug is singular `/faq`, matching the live site — groups ANSWERED faqs (`defined(answer) && answer != ""`) by `faqCategory` into `<details>` accordions (section anchor id = the category value) and emits FAQPage JSON-LD via `faqPageSchema()` in [lib/seo/schema-generators.ts](lib/seo/schema-generators.ts); footer "FAQs" links here. Answered faqs are also in the **live search delta** (`faq` type → `/faq#<category>`; [lib/sanity/queries/faqs.ts](lib/sanity/queries/faqs.ts) → `getAllFaqSearchEntries` → [lib/search/sanity-index.ts](lib/search/sanity-index.ts)); the webhook revalidates `/faq` + the search delta on faq publish. Seed/slot starter questions (answers blank — never fabricated) with `pnpm seed-faqs` (idempotent; slots an existing matching faq into its category instead of duplicating). **Answers** were filled from PI's OWN content (the live FAQ page + the migrated policy pages — Sample Policy, Shipping, Returns, Terms, Contact) and PI's service offerings via `pnpm fill-faq-answers` ([scripts/seed/fill-faq-answers.ts](scripts/seed/fill-faq-answers.ts)), which publishes each answered faq (and preserves any answer Patrick already wrote, e.g. the minimum-order-quantity one); nothing is fabricated. The one question with no PI source — "Do I need an account to place an order?" — was left blank (unpublished draft) for Patrick. Query helpers in [lib/sanity/queries/faqs.ts](lib/sanity/queries/faqs.ts).

**video.** Fields: title, slug, `embedUrl` (single URL covering YouTube/Shorts, Vimeo, Instagram, Facebook — provider auto-detected, no dropdown), optional custom `thumbnail` (image), description, `category` (reference to the shared `blogCategory` taxonomy), publishDate, and an optional `seo` object (the shared `seo` type: Meta Title / Meta Description / OG Image). The detail page prefers `seo` when set and otherwise auto-derives SEO from Title → meta title, Description → meta description, and the thumbnail → social image. Patrick adds a video by pasting a link (embed, never an upload) — the player stays on the source platform; we only store the URL. Embed parsing lives in [lib/video/embed.ts](lib/video/embed.ts) (`parseVideoEmbed()` → `{ provider, embedSrc, aspect }`; Shorts/reels render vertical 9:16, the rest 16:9) and renders via the client [components/videos/VideoEmbed.tsx](components/videos/VideoEmbed.tsx). YouTube/Shorts and Vimeo embed cleanly; Instagram/Facebook are best-effort (their embeds can fail on privacy settings) — set a custom thumbnail and test those. Card thumbnail priority: custom `thumbnail` → YouTube auto (`img.youtube.com/vi/<id>/hqdefault.jpg`) → brand-tinted placeholder. Drives `/videos` (index: card grid + client-side category filter via [components/videos/VideosBrowser.tsx](components/videos/VideosBrowser.tsx)) and `/videos/[slug]` (detail: responsive player + related videos in the same category + VideoObject JSON-LD via `videoObjectSchema()` in [lib/seo/schema-generators.ts](lib/seo/schema-generators.ts)). On-demand SSG (`dynamicParams=true`, `revalidate=false`), webhook revalidates `/videos` + `/videos/<slug>` on publish. Query helpers in [lib/sanity/queries/videos.ts](lib/sanity/queries/videos.ts). Video title + category are in the search index (`video` type, internal route — title weighted, category as a secondary key). M5-507.

**brand.** Fields: name, slug, logo image, optional URL, description. Auto-populated from Geiger products on first scrape (logos scraped from Geiger brand pages in Phase E), manually editable thereafter.

**leadSubmission.** Read-only document type written by the lead form API route. Fields: name, email, phone, company, quantity, comments, source page, timestamp, and `attachments` (array of `file` — optional logo/artwork the visitor uploaded; emailed to Patrick AND stored here as Sanity assets so they're viewable in Studio). The lead form route ([app/api/leads/route.ts](app/api/leads/route.ts)) accepts `multipart/form-data` (optional file uploads — up to 3 files, ≤10MB each / ≤20MB total, types `.pdf/.png/.jpg/.jpeg/.gif/.svg/.ai/.eps`, re-validated server-side), attaches the files to Patrick's email (Nodemailer), and uploads them as Sanity assets (non-fatal if upload/write fails — email still sends). It also verifies a Cloudflare Turnstile token (auto-detect CAPTCHA, no-ops without env keys — see Section 14) alongside the honeypot + rate limit.

**page.** Generic, section-based content page powering the website-builder (M5-506b). Fields: `title`, `slug` (the route segment, e.g. `kitting` → `/services/kitting`), `seo` (reuses the shared `seo` object), and `sections[]` — an ordered array of polymorphic section objects. The array gives Patrick website-builder behavior in Studio: drag-reorder, insert any section type, delete, and **hide-without-deleting** (every section has a `hidden` boolean that the `SectionRenderer` skips). Section types (all in [sanity/schemas/objects/page-sections.ts](sanity/schemas/objects/page-sections.ts), all reusable): `heroBanner` (heading/subheading + optional CTA + banner image; `overlayText` toggles between text-overlaid-on-image and the default text-on-top-with-full-image-below), `richText` (portable text; supports inline links — Geiger links auto-route through `lib/affiliate-url.ts` — and an optional `anchorId` making the section an in-page jump target), `imageText` (vertical stack: heading → full-width image → portable text; never overlays text on the image), `infographic` (full-width image + caption), `iconFeatures` (icon/heading/text columns), `statBanner` (colored stat banner), `cardGrid` (cards with optional image + CTA), `ctaBlock` (heading + buttons), `eventList` (city/venue/date/time rows), `faqAccordion` (Q&A with FAQPage schema). Image fields are paired — a Sanity `image` (preferred) plus an `imageUrl` string fallback; renderers prefer the asset. The type is intentionally generic so it powers BOTH the Services pages AND the footer/legal static pages (M5-506), not just Services. Rendered by slug via `SectionRenderer` ([components/page-sections/](components/page-sections/)); the four Services pages render at the existing `lib/nav-data.ts` Services routes (`/services/kitting`, `/services/company-stores`, `/services/popup-stores`, `/services/custom-products`) through [app/services/[slug]/page.tsx](app/services/[slug]/page.tsx) (on-demand SSG: `dynamicParams=true`, `revalidate=false`, webhook revalidation on publish). The **footer/legal pages** (M5-506 — `/about`, `/contact`, `/sample-policy`, `/shipping-policy`, `/returns`, `/privacy-security`, `/company-core-values`, `/terms`; slugs mirror the live site exactly for SEO preservation) render through the shared [components/page-sections/StaticPage.tsx](components/page-sections/StaticPage.tsx) (`StaticPage` + `staticPageMetadata`) from thin top-level route files; `/contact` additionally renders the lead form in-code. The webhook's `page` case revalidates BOTH `/services/<slug>` and `/<slug>` on publish. Query helpers in [lib/sanity/queries/pages.ts](lib/sanity/queries/pages.ts). Seed Services drafts with `pnpm seed-service-pages` (structure-only placeholder copy); seed the footer pages with `pnpm seed-static-pages` (M5-506 — content reproduced **full and verbatim** from PI's OWN live site / Wayback of the same slugs: Sample Policy + Privacy verbatim; **Shipping/Returns/Core-Values refilled verbatim** in the 2026-06-26 pass — the earlier extraction had condensed them; **Terms of Service now seeds PUBLISHED with the complete verbatim "Terms & Conditions"** — 22 sections, previously a boilerplate draft; the seed also deletes the stale `drafts.page-terms` so the published perspective stays clean. **About** is the one exception: the live `/about` is Cloudflare-blocked and its only Wayback snapshot is a near-empty template — the seed keeps the verified "culture of family" line + PI's own Mission/Vision and drops the prior unverifiable founder/paramedic story; **flag for Patrick to paste current About copy**. A few PI source typos in Terms are preserved verbatim — e.g. "insignifanct", "the sue of its catalog", and a stray editor note in the Disputes clause — flag rather than silently rewrite Patrick's legal text).

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

**HTML entity handling.** Geiger's product names and descriptions contain HTML entities directly in the data (e.g. `4' Dynamo Trifecta Display &amp; Graphics`, `6&quot; Key Card Holder`). These must be decoded centrally at the data loader level (`lib/categories.ts` → `getProductsForCategorySlug`) so every consumer sees clean plain text. Do NOT decode in components individually; decode once at the source. Entities to handle at minimum: `&amp;`, `&quot;`, `&#039;`, `&apos;`, `&lt;`, `&gt;`, `&nbsp;`, `&reg;`, `&trade;`, `&copy;`. **Product `imageUrl`s are decoded too** — Geiger's image URLs in `products.json` carry literal `&amp;` (e.g. `?format=webp&amp;w=275`); a browser decodes that fine inside `<img src>`, but it leaks `&amp;` into `og:image` / `twitter:image` / ItemList `image` and breaks social previews. So `imageUrl` is decoded at the loader (`loadProductsIndex` in `lib/categories.ts`, plus the sibling product indexes in `lib/products/lookup.ts` and `lib/brands.ts`) so EVERY consumer — grid, OG/Twitter image, schema `image` — gets a clean `&` URL (M-SEO3 follow-up).

**Image fallback.** Hot-linked Geiger images may 404 if Geiger removes a product mid-month between auto-rebuilds. ProductCard must include an `onError` handler that swaps the broken image for a clean placeholder (a simple inline SVG or `/public/placeholder-product.svg` with the product name in plain text). The monthly auto-rebuild drops removed products entirely, so the placeholder is only a between-rebuild safety net.

**Per-product attributes (color, material, size) are NOT on the product object.** They only appear in the aggregated facets array. To know which products belong to a facet URL like `/cat/water-bottles/material/stainless-steel`, the pipeline makes a filtered API call per facet URL (Phase C of the scraper). This is the 21,715 calls described in Section 16.

**Affiliate URL rewrite rule:** Replace `https://www.geiger.com/` with `https://patrickblack.geiger.com/` in any scraped Geiger URL before emitting it on the new site. Works for both `/p/` product URLs and `/b/` category URLs.

Source URL: `https://www.geiger.com/p/vinyl-football-510336?pid=208667`
Output URL: `https://patrickblack.geiger.com/p/vinyl-football-510336?pid=208667`

Helper function lives at `lib/affiliate-url.ts` and is the only place this transformation should happen. Never hardcode the transformation in components.

**Product images:** Hot-linked from Geiger's CDN at `imgsirv.geiger.com`. Do NOT download to our origin. Patrick is an authorized Geiger distributor and hot-linking is permitted. Use explicit width and height on every image to prevent CLS. Use `loading="lazy"` on images below the fold.

**Brand logos.** Scraped from Geiger's brand pages (linked from `https://www.geiger.com/c/shop-by-brand`) via Phase E of the scraper. Stored at `data/geiger/brand-logos/{slug}.{webp|png|jpg}`. Used on the brands index page and per-brand pages. Auto-refreshed during monthly rebuild.

**Deals + new-products data.** Geiger's deals (sale + closeout) and the "New Products" feed both turn over fast, so they are NOT included in the monthly Phase B catalog dump. Instead, **weekly** scrapers (`scripts/scrapers/geiger/scrape_deals.py` for Phase F, `scrape_new_products.py` for Phase G — see Section 16) hit Searchspring with the relevant `bgfilter.category_path`, capture products + per-facet-value SKU memberships, and write `data/geiger/deals.json` / `data/geiger/new-products.json` respectively. Both `/deals` and `/new-products` read from those files at build time.

On top of the scraped baseline, Sanity adds three editorial levers per page (via `globalSettings.dealsPage` and `globalSettings.newProductsPage`):
1. **Hide:** `hiddenDealSkus[]` / `hiddenNewProductSkus[]` blocklists — drop a scraped SKU from the grid. Facet counts auto re-derive.
2. **Pin:** `pinnedDealSkus[]` / `pinnedNewProductSkus[]` allowlists — promote any existing Geiger SKU into the page even if the weekly scrape did not include it. Lookup runs against `data/geiger/products.json`.
3. **Add:** `customProduct` docs with `placements.onDeals == true` / `placements.onNewProducts == true` — fully manual non-Geiger products. See Section 7 customProduct.

Hero copy (heading, intro, meta) is also Sanity-controlled. Augmentation pipeline: [lib/products/augment.ts](lib/products/augment.ts) (pure merger) + [lib/products/lookup.ts](lib/products/lookup.ts) (SKU index over products.json) + [lib/deals.ts](lib/deals.ts) / [lib/new-products.ts](lib/new-products.ts) (orchestrators). See M5-510 (deals scrape) and M5-511 (custom + pinned additions) in TASKS.md.

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

**Category meta title = the page H1 (M-SEO3).** Category pages set their meta `<title>` to the on-page H1 (the full descriptive phrase) rather than the shorter templated `metaTitle` — Patrick found category titles too short. `categoryMetaTitle(h1)` in [app/cat/[...slug]/page.tsx](app/cat/[...slug]/page.tsx) appends `| Perfect Imprints` only when the result still fits comfortably (≤ ~60 chars); a long H1 stands alone. The canonical and the on-page H1 are untouched. Applies to root, modifier, and facet pages (baked JSON); customCategory pages keep their own Sanity `seo.metaTitle`.

**Open Graph + Twitter, complete on every page (M-SEO3).** Next merges metadata shallowly per top-level key, so a page that sets `openGraph` REPLACES the layout default entirely. The shared builder `socialMeta()` in [lib/seo/open-graph.ts](lib/seo/open-graph.ts) is spread into each page's metadata so every page emits a full set — `og:title`, `og:description`, `og:image`, `og:url` (= canonical), `og:type` (`website` for home/listings, `article` for blog posts), `og:site_name` (`Perfect Imprints`), `og:image:alt` — plus a `summary_large_image` Twitter card. **Category `og:image` = the first product image** of the category (resolved off `products.json` in `generateMetadata`, no network/Sanity call); CTA-only categories (no products) fall back to the PI logo (`LOGO_OG_IMAGE`, `/logo.svg`). Blog posts use the hero image, brand pages the brand logo, video pages the poster; everything else falls back to the logo. `og:image:alt` always falls back to the title.

Schema types in use:

- Organization (**home + contact pages ONLY** as of M-SEO3 — this is the local-business block carrying address/phone, so it was removed from the root layout and is no longer emitted on categories/blogs/listings; name/url/logo/telephone + `contactPoint`; **`sameAs` = the URLs of the ENABLED `globalSettings.socialLinks` only, `telephone`/`email`/`PostalAddress` from `globalSettings.contact`**; `sameAs`/`address` are omitted when empty rather than fabricated) — `organizationSchema(settings)` in [lib/seo/schema-generators.ts](lib/seo/schema-generators.ts), fed by `getSiteSettings()` via the async [components/seo/OrganizationJsonLd.tsx](components/seo/OrganizationJsonLd.tsx), rendered by [app/page.tsx](app/page.tsx) + [app/contact/page.tsx](app/contact/page.tsx)
- WebSite + `SearchAction` (sitewide, in root layout — enables the Google sitelinks search box; target `/search?q={search_term_string}`) — `websiteSchema()` in [lib/seo/schema-generators.ts](lib/seo/schema-generators.ts) (M5-508)
- CollectionPage (every category page — root/modifier/facet + customCategory — the page represents a product collection) — `collectionPageSchema()` (M-SEO3)
- ItemList (the products shown on a category page: position + name + affiliate url + image; **omitted entirely for CTA-only categories** rather than emitting an empty list) — `itemListSchema()` (M-SEO3)
- BreadcrumbList (every category, blog, video page) — **emitted ONCE** by the shared [components/layout/Breadcrumbs.tsx](components/layout/Breadcrumbs.tsx) component, with **absolute `item` URLs** (relative hrefs are prefixed with the canonical origin; the current-page leaf has no `item`). Schema.org requires `item`/`@id` to be absolute — relative values tripped Google Rich Results' "Invalid URL in field 'id'". `CustomCategoryView` no longer emits its own `breadcrumbSchema` (that was a duplicate); it relies on the same `<Breadcrumbs>` component. The `breadcrumbSchema()` generator stays for any explicit absolute-URL use.
- BlogPosting (every blog article)
- FAQPage (every root category page with FAQs, every customCategory with FAQs, and the `/faq` library)
- Product (within category page grids, summarized)
- VideoObject (every video page)

**Pagination indexing rule (added 2026-05-26 per Patrick feedback).** For paginated category URLs (`/cat/[slug]/page/N`):

- Page 1 is fully indexable, with canonical pointing to itself (clean root URL like `/cat/water-bottles`, NOT `/cat/water-bottles/page/1`)
- Pages 2 and beyond carry a `noindex,follow` meta robots tag AND a canonical pointing back to page 1
- This prevents duplicate-content penalties while still letting Google discover product variations through follow links

Sitemap is auto-generated at build time ([app/sitemap.ts](app/sitemap.ts)) and covers every indexable route — all 22,180 category page-1 URLs, blog posts + blog categories, per-brand + brands index, per-video + videos index, deals/new-products/rush-products, services, the static/legal pages, `/promotional-products`, `/faq`, and home. ~23k URLs sits under Google's 50k-per-file cap, so Next emits a single spec-valid `sitemap.xml` (switch to `generateSitemaps()` to split into an index only if it ever exceeds 50,000). The `noindex` `/search` route, paginated `/page/N` variants (page 2+ is `noindex,follow` + canonical to page 1), and any other `noindex` route are excluded. The build logs per-section counts (`[sitemap] N URLs — static:… category:… …`). **robots.txt** is generated by [app/robots.ts](app/robots.ts) (NOT a static `public/robots.txt`): allows all, disallows `/admin3773752` (obfuscated Studio) + `/api`, references the sitemap. (M5-508)

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

**Revalidation webhook (manual setup, per environment).** Instant freshness for Sanity-managed content (mega menu, global settings, home, services pages, blogs, videos, custom products/categories, and the live search delta) depends on a single GROQ-powered Sanity webhook POSTing to `/api/sanity/revalidate`. This is a **one-time manual setup in the Sanity project** (API → Webhooks), not provisioned by code. **Status (2026-06-21): the staging webhook is created (`dev.perfectimprints.com`, secret set in Vercel); the production webhook is still pending — create it at launch** (`www.perfectimprints.com`, same filter/projection/secret in Vercel Production env). Full steps + the production task: [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md) / TASKS.md M5-512. Without it, content still updates via ISR/on-demand fallback (up to the route's `revalidate` interval), just not instantly.

**Static-path budget.** Vercel's build runner has a hard ceiling on output filesystem inodes — Next.js 16 emits ~5 segment artifacts per static page, and pre-building all 22,180 categories plus pagination (~34,857 paths × 5 ≈ 175k symlinks) fails with `ENOSPC: no space left on device` during Vercel's output-assembly step (incident: first full deploy on 2026-05-31). Mitigation in place on the `/cat/[...slug]` route: `dynamicParams = true` + `revalidate = false`, and `generateStaticParams` returns root + modifier + compound-facet types (+ pagination) **plus the currently-owned customCategory slugs**, giving ~**1,840 static paths**. The 21,137 facet pages serve as on-demand SSG — first hit generates, then cached at the edge permanently until the next deploy (functionally identical to SSG for crawlers). Do NOT widen `PREBUILD_TYPES` in `app/cat/[...slug]/page.tsx` without re-measuring the path-vs-budget ratio.

**Keeping `/cat` static (two things that silently force it dynamic).** Next cannot statically prerender the route if EITHER (a) an uncached Sanity read (`@sanity/client` defaults to `no-store` in Next 16) runs in render, or (b) the page reads `searchParams` (a Dynamic API). Both are avoided: (a) all render-path Sanity reads go through the tag-cached `cachedClient` (Section 7 owned-slug precedence); (b) the page **does not read `searchParams`** — it renders the unfiltered, path-paginated view (static + indexable). Faceted filtering needs server-only membership data, so it runs in the dynamic route [app/api/category-products/route.ts](app/api/category-products/route.ts): the client [components/category/CategoryShell.tsx](components/category/CategoryShell.tsx) detects active filters from the URL, fetches that API, and paginates the result in-browser (path-based `/page/N` pagination stays server-side for the unfiltered SEO view). If you reintroduce `searchParams`/`cookies`/`headers` or an uncached `client.fetch` in the `/cat` render path, the whole route flips back to `ƒ (Dynamic)` and the 22,180 pages lose their static HTML — verify the build shows `/cat/[...slug]` as `●`/SSG, not `ƒ`, after any change here.

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

**Weekly aggregator scrapes:** Three separate GitHub Actions run every Sunday, staggered so they don't collide on the runner / git remote: `scrape-deals.yml` at 23:00 UTC (Phase F → `data/geiger/deals.json`), `scrape-new-products.yml` at 23:30 UTC (Phase G → `data/geiger/new-products.json`), and `scrape-rush-products.yml` at 23:45 UTC (Phase H → `data/geiger/rush-products.json`). Each runs only its Phase script, diffs its single output file, and opens an auto-merge PR if anything changed. Why separate from the monthly job: these feeds turn over within days, not months, and each script finishes in ~1 minute (1 base call + 1 per-facet-value call). All three also expose `workflow_dispatch` for ad-hoc refresh.

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
NEXT_PUBLIC_SITE_URL=https://www.perfectimprints.com
NEXT_PUBLIC_GEIGER_HOST=https://patrickblack.geiger.com
GA4_MEASUREMENT_ID
NEXT_PUBLIC_GTM_ID=GTM-MCQP434P
NEXT_PUBLIC_TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
```

**Cloudflare Turnstile (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`).** The lead form ([components/forms/LeadForm.tsx](components/forms/LeadForm.tsx), used on `/contact` and in the category-page modal) renders a managed/auto-detect Turnstile widget ([components/forms/Turnstile.tsx](components/forms/Turnstile.tsx)) when the public key is set; Cloudflare injects a `cf-turnstile-response` token into the form, and [app/api/leads/route.ts](app/api/leads/route.ts) verifies it against `siteverify` (with the secret key) before sending. **Both keys absent → the widget doesn't render and server verification is skipped (one-line warning logged), so the form still works** (e.g. on staging); the CAPTCHA activates automatically once both are present. Honeypot + 5/IP/hr rate limit stay active regardless. Create a free Turnstile site in Patrick's Cloudflare dashboard to get the keys, then add both in Vercel. Never hardcode keys.

Never commit a `.env` file. Use `.env.example` with empty values as the template.

**Google Tag Manager (`NEXT_PUBLIC_GTM_ID`).** GTM is loaded in the root layout ([app/layout.tsx](app/layout.tsx)) via `@next/third-parties`'s `GoogleTagManager` component (head script, `next/script` default `afterInteractive` strategy → deferred, off the render-blocking path so it does not regress the M5-508 LCP/Speed Index work) plus a manual `<noscript>` iframe as the first child of `<body>` (the component does not emit the noscript fallback). It is **env-driven**: if `NEXT_PUBLIC_GTM_ID` is unset (e.g. staging without analytics) the layout renders NOTHING, so the build never hard-depends on it. Only the GTM container loads — **no individual tags are hardcoded**; Patrick manages GA4, live chat, and every other tag from the GTM dashboard. The raw `<head>` snippet is intentionally NOT pasted — the component is the correct equivalent. Reading `process.env.NEXT_PUBLIC_GTM_ID` is a build-time inlined constant, so `/cat` stays static. M5-513.

## 15. External Services

- **Sanity** for CMS. Project lives under Patrick's Sanity account.
- **Vercel** for hosting. Account is Patrick's.
- **Cloudflare** for DNS only (DNS-only mode, not proxied).
- **DeepSeek** for AI content. API key on Patrick's account, billed to him directly.
- **Gmail SMTP** for transactional email. Uses Patrick's Google Workspace account with an app password. Requires SPF and DKIM records in DNS.
- **Google Search Console and Google Analytics 4** for analytics. Existing GA4 property continues, new GSC property added for new site verification.
- **Google Tag Manager** is the tag container (id `GTM-MCQP434P`, env var `NEXT_PUBLIC_GTM_ID`). Patrick manages GA4, live chat, and other tags from the GTM dashboard — the site only loads the container (deferred via `@next/third-parties`), it does not hardcode individual tags. See Section 14.

## 16. Data Pipeline Rules

Geiger data integration is permitted. Patrick has confirmed (he is a Geiger distributor).

Pipeline runs locally or in scheduled GitHub Actions, never in production runtime.

Throttle: one request per second per worker against the Searchspring API. Use `httpx` HTTP/2 client (and `curl_cffi` for Cloudflare bypass on the main geiger.com hostname) with `tenacity` retry on transient failures.

Checkpointing: save state every 100 requests so partial runs resume. State file at `scripts/scrapers/geiger/.checkpoint/`.

**Six-phase pipeline (A–E monthly, F weekly):**

**Phase A: Taxonomy discovery.** One HTTP GET to a Geiger category page (e.g., `https://www.geiger.com/b/accessories`), parse the mega menu HTML with BeautifulSoup, extract the full category tree with parent-child relationships. Output: `data/geiger/categories.json` (544 categories, 482 leaves). Runtime: minutes.

**Phase B: Product catalog.** For each Geiger leaf category, paginate the Searchspring API with `perPage=60`. Deduplicate by SKU. Output: `data/geiger/products.json` (7,957 unique SKUs, 99.82% of Geiger's total catalog of 7,971). Runtime: 20-40 minutes.

**Phase C: Facet and modifier memberships.** For each of the 21,715 PI URLs that need product membership data (576 modifiers + 21,137 facets + 2 compound facets), one filtered Searchspring API call to capture the SKU list. Output: `data/geiger/facet-memberships.json`. Runtime: 6 hours unattended.

**Phase D: PI-to-Geiger mapping.** Match each of the 465 PI root categories to a Geiger leaf via exact slug match (preferring non-aggregator leaves over `All <X>` aggregators), then fuzzy match with rapidfuzz (WRatio + token_set_ratio, threshold 80), then manual overrides in `scripts/scrapers/geiger/mapping_overrides.json`. Output: `data/mappings/pi-to-geiger.json` (465/465 mapped, 0 unmapped) plus a CSV report. Runtime: seconds.

**Phase E: Brand logo scrape (added 2026-05-26 per Patrick feedback).** Visit `https://www.geiger.com/c/shop-by-brand` to enumerate brand pages, then download the logo image from each brand's page. Store at `data/geiger/brand-logos/{brand-slug}.{webp|png|jpg}`. Output also includes `data/geiger/brands.json` with brand metadata (name, slug, description, logo path, product count cross-referenced from products.json). Runtime: 30-60 minutes. Runs as part of monthly auto-rebuild.

**Phase F: Weekly deals scrape (added 2026-06-13 per Patrick feedback).** Standalone weekly job (`scripts/scrapers/geiger/scrape_deals.py`, `pnpm scrape-deals`) that captures Geiger's current sale + closeout list. Three steps:

1. **Meta** — one call to `https://kfx28d.a.searchspring.io/api/meta/meta.json?siteId=kfx28d` for human-readable facet labels (Color, Brand, Material, etc.).
2. **Base deals** — paginate `category.json?siteId=kfx28d&bgfilter.category_path=Home > Shop By > Deals&resultsFormat=native` to capture product objects + the embedded `facets` array (values + counts but no SKU lists).
3. **Per-facet-value SKU memberships** — one filtered call per facet value (`filter.<field>=<value>` for list facets, `filter.<field>.low/.high` for range facets) to capture which deal SKUs belong to that value. Currently ~40-60 calls per run (under 1 minute at the 1 req/sec throttle).

Output: `data/geiger/deals.json` shaped as `{scrapedAt, totalDeals, products[], facets[{field, label, type, values:[{id, label, count, low, high, type, skus[]}]}]}`. The `skus[]` arrays power accurate client-side filter intersections in the `/deals` filter sidebar (`components/deals/DealsClient.tsx`), so OR-within-section + AND-across-section semantics work without any runtime API call.

`ss_category_hierarchy` is dropped at scrape time; the loader (`lib/deals.ts::getDealsData`) synthesizes a flat top-level "Category" section from `product.category_paths` instead (Geiger's "Shop By" pseudo-department excluded). Patrick can blocklist specific SKUs via `globalSettings.dealsPage.hiddenDealSkus` in Sanity — `applyHiddenSkus` re-derives every facet section's value counts so the sidebar stays consistent with the visible grid.

Runs from `.github/workflows/scrape-deals.yml` on `cron: '0 23 * * 0'` (Sunday 23:00 UTC) + `workflow_dispatch`. Opens an auto-merge PR if and only if `deals.json` actually changed.

**Phase G: Weekly new-products scrape (added 2026-06-16 per Patrick feedback).** Identical pattern to Phase F but for `bgfilter.category_path=Home > Shop By > New Products`. Script: `scripts/scrapers/geiger/scrape_new_products.py` (`pnpm scrape-new-products`). Output: `data/geiger/new-products.json`. Runs from `.github/workflows/scrape-new-products.yml` on `cron: '30 23 * * 0'` (Sunday 23:30 UTC — staggered 30 min after Phase F so they don't collide on the runner). Note: this feed sends `is_new_item` as the string `"Yes"` rather than a boolean, so the normalizer coerces it explicitly. Drives `/new-products`.

**Phase H: Weekly rush-products scrape (added 2026-06-18 per Patrick feedback, M5-506a).** Identical pattern to Phase G but for `bgfilter.category_path=Home > Shop By > 24 Hour Rush Products`. Script: `scripts/scrapers/geiger/scrape_rush_products.py` (`pnpm scrape-rush-products`). Output: `data/geiger/rush-products.json` shaped `{scrapedAt, totalRushProducts, products[], facets[...]}` (~53 products / 1 page today). Runs from `.github/workflows/scrape-rush-products.yml` on `cron: '45 23 * * 0'` (Sunday 23:45 UTC — staggered another 15 min after Phase G), branch `chore/weekly-rush-refresh`. Rush-specific handling: (a) the feed sends `is_new_item` as `"Yes"` (coerced like Phase G); (b) results carry no `badges` array, so no NEW/SALE/CLOSEOUT ribbons; (c) at least one SKU contains a space (e.g. `"501622 1BC"`), preserved as-is; (d) **facet hygiene** — degenerate single-value facets are dropped at scrape time (`_is_degenerate_section`: fewer than 2 values, or one value covers 100% of products). For rush this drops `production_time` (single value "1"), plus any other single-bucket facet (`refine_by`, `pen_style` today). Drives `/rush-products`.

**Sanity augmentation on top of Phase F + G + H (added 2026-06-16, see M5-511 + M5-506a).** `/deals`, `/new-products`, and `/rush-products` all go through an augmentation layer before render — see Section 8 "Deals + new-products data" for the editorial levers. Pipeline modules: [lib/products/augment.ts](lib/products/augment.ts) (pure merger — rebuilds synthetic Category section, injects custom-product filter tags into facet values), [lib/products/lookup.ts](lib/products/lookup.ts) (SKU index over products.json), [lib/sanity/queries/custom-products.ts](lib/sanity/queries/custom-products.ts) (`customProductToGeigerProduct` normalizer). Orchestrators: `getAugmentedDealsData()` / `getAugmentedNewProductsData()` / `getAugmentedRushProductsData()` in their respective lib files. Custom products use synthesized SKUs of the form `custom-<sanity-_id>` so they never collide with Geiger SKUs.

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
- The site-search index is **hybrid** (M5-507 follow-up). The **static bulk** (slow-changing Geiger data: 22,180 categories + ~7,955 products + brands) is generated at build time by the **`prebuild`** script (`pnpm build:search-index` → `public/search-index.json`); it runs automatically before `next build` (the Vercel build command) and makes NO Sanity calls. Running `next build` directly skips it and ships a stale bulk file. The **live delta** (editor-managed Sanity content that turns over between deploys: blogs, videos, custom categories, custom products, and answered FAQs — `faq` type, M5-506) is served by the ISR route [app/api/search-index/route.ts](app/api/search-index/route.ts) — 1-week `revalidate` floor, refreshed within seconds of publish by the Sanity webhook (`revalidatePath('/api/search-index')`). The client ([lib/search/load-index.ts](lib/search/load-index.ts)) fetches both and merges + de-dupes (Sanity-first). Matching stays **client-side Fuse** — the only runtime fetch is to our own ISR route serving a few hundred Sanity docs; still never Searchspring (or any external search service) at runtime. See M5-502 and `scripts/search-index/README.md`.
- Mega menu now renders from the Sanity `megaMenu` singleton via `getMegaMenu()` ([lib/sanity/queries/mega-menu.ts](lib/sanity/queries/mega-menu.ts)); the header no longer reads `lib/nav-data.ts` at render time (M5-503). `lib/nav-data.ts` stays as the **seed reference** — it still builds departments from PI's own slug universe (`data/pi-urls/category-urls.json` + `data/mappings/pi-to-geiger.json`, not Geiger's tree) and exports `SIMPLE_NAV`; `pnpm seed-mega-menu` serializes both into the singleton so the seeded menu is byte-for-byte the previous hard-coded one. After seeding, the menu is Sanity-managed (reorder/rename/hide/add in Studio), not auto-derived from data files. Column labels still mirror Geiger's top-level departments; items/links use PI slugs only; Tradeshow & Events stays a non-clickable header (no PI department-level slug).
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

## 22. Current Project State (Week 5)

Updated: 2026-06-17.

**Module 1 (Data Pipeline): Complete (Phase A-E + weekly F/G).**

- Phase A: 544 Geiger categories, 482 leaves
- Phase B: 7,957 unique SKUs (99.82% of Geiger's 7,971 catalog)
- Phase C: 21,715 non-root URLs processed with 4-tier recovery. 13,968 with products, 7,518 zero, 229 errors
- Phase D: 465 PI roots mapped, 0 unmapped (72 exact + 224 fuzzy + 169 manual)
- Phase E (brand logos): DONE — `data/geiger/brands.json` + `data/geiger/brand-logos/` populated; `/brands` index + `/brands/[slug]` pages live (M4-405)
- Phase F (weekly deals scrape): DONE — `scrape_deals.py` → `data/geiger/deals.json`, wired to `/deals` (M5-510). Weekly GitHub Action `scrape-deals.yml`
- Phase G (weekly new-products scrape): DONE — `scrape_new_products.py` → `data/geiger/new-products.json`, wired to `/new-products`. Weekly GitHub Action `scrape-new-products.yml`
- Phase H (weekly rush-products scrape): DONE — `scrape_rush_products.py` → `data/geiger/rush-products.json` (53 products), wired to `/rush-products` (M5-506a). Weekly GitHub Action `scrape-rush-products.yml` (Sun 23:45 UTC). Degenerate single-value facets dropped at scrape time.

**Module 2 (AI Content): Complete — all 22,180 pages generated, 465 roots on v2 buying-guide format.**

- All 22,180 category JSONs exist in `data/categories/`: 465 roots with v2 buying-guide format (`promptVersion: "root-v2"`, populated `buyingGuideHtml` + `buyingGuideH2`) + 21,715 lite non-roots (modifiers/facets/compound-facets). Full set committed in `91a4b3de`.
- Week 2 demo: 35 root pages generated. Patrick reviewed 2026-05-25 and approved content tone.
- v1 quality pass (dedup-by-Geiger-path selection, 11-entry `EXCLUDED_SLUGS`, depth-aware SKU filter with `full`/`slug-filtered`/`full-capped-60` modes, compound-noun H1 rule, `post_process_lengths()` safety net) applied to the v2 prompt as well. Zero meta-length violations across all 465 roots.
- Buying-guide format delivered: 400-600 word `buyingGuideHtml`, H2 "Custom [Category] Buying Guide", keyword derivatives (custom, promotional, branded, personalized, logo, bulk, wholesale), structured buyer-research content matching the Stadium Seat Cushions blog example. Word-count adherence is stochastic — ~one-third of pages undershoot the 400-word floor by 30-100 words. Tracked for retry-on-validation-fail loop before any future re-runs.

**Module 3 (Category Templates): All 22,180 paths live; lead form delivering in production.**

DONE:

- Routing for all 22,180 paths. Roots + modifiers + compound-facets pre-built (~1,840 paths including pagination); facets on-demand SSG via `dynamicParams=true` (Vercel build budget ENOSPC at ~34k paths, so the 21,137 facets must not be pre-built — do not widen `PREBUILD_TYPES` without re-checking).
- Production ProductCard (image, name, **`Item # <sku>` line under the name — Geiger-style, small/muted; hidden for custom non-Geiger products whose synthetic `custom-<id>` SKU is an internal id, not a catalog number**, price, MOQ, brand badge, NEW/SALE/CLOSEOUT ribbons, affiliate link via `lib/affiliate-url.ts`), with `onError` placeholder fallback for hot-linked Geiger images that 404 between monthly rebuilds. The card is shared everywhere a product grid renders (category pages, custom categories, `/deals`, `/new-products`, `/rush-products`, `/search`, blog product blocks), so the SKU shows on all of them. SKUs that contain a space (e.g. `501014 90A`, `501622 1BC`) render as-is.
- Production ProductGrid, AI content rendering (H1, intro, FAQs, hero alt), breadcrumb, CTA banner ([components/category/CTABanner.tsx](components/category/CTABanner.tsx) — red banner, hardcoded hours **9am to 5pm EST**, a "Call 800-773-9472" button + an **"Email Us" button linking to `/contact`**; the plain email address was removed 2026-06-27, M5-514), 404 page. The bottom **footer SEO text block** ([app/page.tsx](app/page.tsx), `home.textContent`) renders **full content width** (`prose max-w-none`, not the old narrow `max-w-3xl`) with **brand-red, hover-underline hyperlinks** (M5-514).
- Mega menu (`lib/nav-data.ts`) rebuilt 2026-06-01 to read from PI's slug universe. Items grouped under Geiger top-level departments (Apparel, Bags & Totes, etc.) for visual familiarity; all 465 root links resolve. Column headers link to their PI department-equivalent root (`apparel`, `bags`, `drinkware`, `health`, `household`, `office`, `outdoor`, `writing`, `products` for Shop By); Tradeshow & Events column header is non-clickable because PI has no department-level slug for it. **Replaced by Sanity-driven menu in M5-503 (2026-06-17):** the header renders from the `megaMenu` singleton; `lib/nav-data.ts` is retained only as the `pnpm seed-mega-menu` reference.

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
- ✅ Related Blogs section ("Related Blogs About [Category Name]" H2 with up to 8 related blog cards) — wired into root category pages in commit `b33f8333` (2026-06-10). Server-rendered from `relatedCategorySlugs`. 327 of 645 published blogs have at least one mapping; rest hide the section gracefully when zero matches.
- ✅ Lead capture form (M3-308) — `components/forms/LeadForm.tsx` + `LeadFormModal.tsx` post to `/api/leads`, which sends via Gmail SMTP (`lib/email/gmail-smtp.ts`) and writes a `leadSubmission` doc to Sanity (non-fatal if Sanity is down). Honeypot + 5/IP/hr rate limit. Delivering in production as of 2026-06-17 (`GMAIL_APP_PASSWORD` set in Vercel).
- ✅ Lead form file uploads + auto-detect CAPTCHA (Part 7, 2026-06-28). The lead form (contact page + category modal) now takes **optional logo/artwork attachments** (up to 3 files, ≤10MB each / ≤20MB total; `.pdf/.png/.jpg/.jpeg/.gif/.svg/.ai/.eps`; validated client + server). The route switched from JSON to **`multipart/form-data`** (`request.formData()`); files are emailed to Patrick as Nodemailer attachments AND stored on the `leadSubmission` doc's new `attachments` field as Sanity assets (non-fatal — email still sends if upload/write fails). Added a **Cloudflare Turnstile** managed/auto-detect CAPTCHA ([components/forms/Turnstile.tsx](components/forms/Turnstile.tsx)) verified server-side before sending; **no-ops without `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`** (form still works, warning logged), activates automatically once both are set in Vercel. Honeypot + rate limit retained. `/cat` untouched. **⚠️ Patrick: create a free Turnstile site in Cloudflare to get the two keys and add them in Vercel to enable the CAPTCHA.**

**Module 4 (Blogs): Complete (2026-06-15, second re-scrape pass).**

- **645 blogs published** to Sanity with current PI content (current MPower template), 86 hidden stub drafts for confirmed-deleted-on-PI URLs
- Scraped directly from PI via SeleniumBase UC mode (Cloudflare Turnstile bypass) + US-exit VPN — Wayback-based first attempt and the no-scroll second attempt were both discarded as inferior
- **Re-scrape required (2026-06-15)** because the prior scrape didn't scroll, so multi-section listicles got truncated at the first lazy-loaded product grid. The new scraper scrolls to bottom in 800px steps until DOM height stabilises (max 90s per page), filters to `data-block-type="contents"` blocks only (skipping the 12 megamenu navigation fdb-blocks at the top + the footer fdb-block at the bottom), and strips product-grid blocks (sections with 2+ anchors to `/products/` each wrapping an img — see M4-rescrape in TASKS.md). Product grids are added back as the `blogProducts` Studio editing block (M4-406, 2026-06-16) — Patrick inserts these manually post-migration.
- 100% have inline author (~33 unique authors), most have hero image (real MPower CDN), some blogs have YouTube/Vimeo video embeds preserved, ~50% have inline published+updated dates
- 818 inline body images across 645 published blogs after the throttle+retry+`/undefined/`-URL fix in commit `xxxxxxx` (2026-06-15). Earlier import was silently losing ~62% of images to parallel-upload ECONNRESETs and to a bogus skip on URLs containing `/undefined/` (MPower CDN legitimately uses that segment).
- Hero-image dedupe ran twice: asset-ref match (104 docs) for cases where the OG/social image and the body's first image were the same Sanity asset, then a position-based pass (~157 docs) for the common MPower pattern where the OG image is a system-generated `_1200_1200_*.jpg` thumbnail and the body image is the full-resolution descriptive filename — same visual image, different bytes → different Sanity assets, but the dedupe script (`pnpm dedupe-header-images`) drops the first body image when a `headerImage` exists and a body image is found in the first 6 blocks.
- BlogBody renderer drops empty paragraph blocks (PI's Froala editor inserts `<p><br></p>` between every heading + image + paragraph as spacers — rendering them as `<p class="mt-5">` was creating big vertical gaps not present in PI's original look). Paragraph margin tightened `mt-5` → `mt-3`.
- Blog templates live: `/blog`, `/blog/[slug]`, `/blog/cat/[slug]` + pagination variants, vertical sticky social share bar, sidebar with categories + popular links + LeadForm CTA
- Related Blogs section live on root category pages (M3-311)
- M4-406 (2026-06-16): editor controls added on `blogPost`. (a) `blogProducts` body block — insertable anywhere in a blog body, renders a row of `ProductCard`s with live SKU-backed data + manual-card fallback (mirrors the legacy MPower in-body product grids that were stripped during the 2026-06-15 re-scrape). (b) `relatedBlogs` reference array — when populated overrides the "See Related Blogs About …" section under the post in editor-chosen order; when empty, auto-derives by shared category slugs. Schema field `relatedPosts` (fetched but never rendered) was renamed to `relatedBlogs` in the process.
- Raw scrape JSONs archived outside repo at `~/Documents/perfectimprints-archive/blogs-snapshot-2026-06-15/` (16 MB, 645 JSONs). The 2026-06-10 archive is kept for the older Wayback+no-scroll baseline but the 2026-06-15 snapshot supersedes it for any re-import. List of 86 deleted/unrecoverable URLs retained at `data/blogs/.failed-slugs.txt` for delivery handoff. See M4-401 and M4-402 in TASKS.md for the full story.

Week 5:

- ✅ Home page (M5-501, 2026-06-17). Built from the `homePage` Sanity singleton: hero, value pillars, new-products rail, testimonials, brands strip, blog preview, free-text section, CTA banner — all server-rendered; Sanity wins when the singleton is populated. The six featured-category image blocks component (`components/home/FeaturedBlocks.tsx`, fed by `getHomePage().featuredBlocks` with hard-coded fallbacks) is built and ready but currently commented out in `app/page.tsx` — Patrick will enable it when wanted.
- ✅ Home content editable + Patrick's copy (M5-501 Part 1, 2026-06-27). The text hero is now **editable in Studio** via the new `homePage.heroText` group (`eyebrow`/`headline`/`subheadline`) — Patrick previously couldn't find it because the hero text wasn't a discoverable field. Added editable `bannerRowHeading` (H2) + `bannerRowSubheading` rendered above the banner row. **Value Pillars `body` changed plain-string → portable text** so hyperlinks work (was rendering raw code when Patrick tried to link a pillar); links render brand-red, external in a new tab. Home meta title/description set to Patrick's copy (`Custom Promo Products & Branded Apparel by Perfect Imprints` / `Custom promotional products & branded apparel for bulk B2B orders. Shop 22,000+ trending promo items with free art proofs and rush options.`), self-canonical intact. Seed/migrate with `pnpm seed-home-content` (idempotent; fills hero/banner-row blanks only, migrates legacy pillar strings to portable text preserving text). No `/cat` changes; LCP stays text-bound.
- ✅ Home interactive sections (M5-501 Part 6, 2026-06-28, "not critical for launch"). (1) **Fixed the Rush value pillar that rendered literal `<a href="/rush-products">…</a>` code** — `pnpm fix-pillar-links` ([scripts/migrations/fix-pillar-inline-links.ts](scripts/migrations/fix-pillar-inline-links.ts)) rewrites pasted literal-HTML anchors in any `valueProps[].body` into proper portable-text `link` marks; ran it live (fixed the Rush pillar → "24 hour rush promos" is now a real red link) and re-ran to confirm idempotent. (2) **Value Pillars rotate when >3** — shared [components/home/PillarCard.tsx](components/home/PillarCard.tsx); ≤3 → static row (unchanged), >3 → client carousel [ValuePillarsCarousel.tsx](components/home/ValuePillarsCarousel.tsx) (3 per view desktop / 1 mobile, snap-scroll + prev/next + reduced-motion-aware auto-advance). `valueProps` validation relaxed to min-1. (3) **Testimonials → 3-up carousel + editable heading** — new `homePage.testimonialsHeading` (default "What Our Customers are Saying"); [components/home/Testimonials.tsx](components/home/Testimonials.tsx) is now a client carousel (3 per view desktop / 1 mobile, prev/next + swipe + auto-advance, dark styling kept). (4) **Rush Products rail on home** — new `homePage.rushProductsHeading` (default "Rush Production Promotional Products"); reuses `NewProductsRail` (now props-parameterized for subtitle/view-all/background), fed by new `getRushProducts(12)` in [lib/rush-products.ts](lib/rush-products.ts) from the existing `data/geiger/rush-products.json` (no new scrape), placed directly after the New rail, affiliate links via `ProductCard`. Home stays `force-static`; `/cat` untouched.
- ✅ Deals main menu button + `/deals` aggregator page (M5-510, 2026-06-13). "Promotional Products" removed from header nav, "Deals" added after Rush Products. `/deals` is fully static (`force-static`) with a Geiger-style filter sidebar (Category, Color, Price, Production Time, Brand, Min Qty, Material, Refine By, Ounces, Full Color, New Items) — all filtering + pagination is client-side (no URL params, no server roundtrips). Data sourced from `data/geiger/deals.json` produced by the weekly Phase F scrape (see Section 16). Hero copy + SKU blocklist editable via `globalSettings.dealsPage` in Sanity.
- ✅ New Products page + Phase G weekly scrape — `/new-products` aggregator mirrors `/deals`, sourced from `data/geiger/new-products.json` (`scrape_new_products.py`, weekly `scrape-new-products.yml`). Hero copy + SKU levers via `globalSettings.newProductsPage`.
- ✅ Rush Products page + Phase H weekly scrape (M5-506a, 2026-06-18) — `/rush-products` aggregator clones `/new-products`, sourced from `data/geiger/rush-products.json` (`scrape_rush_products.py`, weekly `scrape-rush-products.yml` Sun 23:45 UTC) for Geiger's `Home > Shop By > 24 Hour Rush Products` (~53 products). `force-static`, client-side filters + pagination, breadcrumbs + BreadcrumbList schema. No NEW/SALE/CLOSEOUT ribbons (rush feed has no badges). Degenerate single-value facets dropped at scrape time. Hero copy + SKU levers via `globalSettings.rushProductsPage`; custom products via `customProduct.placements.onRush`. The "Rush Products" header nav item now points at `/rush-products` (was `/rush-promotional-products`); update `lib/nav-data.ts` then re-run `pnpm seed-mega-menu` (or patch the `megaMenu` singleton item) to push it live.
- ✅ Custom + pinned editorial levers on `/deals`, `/new-products`, and `/rush-products` (M5-511 + M5-506a). Three levers per page without touching the scraper: hide a scraped SKU (`hidden*Skus[]`), pin any existing Geiger SKU (`pinned*Skus[]`), or add a fully custom non-Geiger product (`customProduct` with `placements.onDeals`/`placements.onNewProducts`/`placements.onRush`). Augmentation pipeline: `lib/products/augment.ts` + `lib/products/lookup.ts`, orchestrated by `getAugmentedDealsData()` / `getAugmentedNewProductsData()` / `getAugmentedRushProductsData()`.
- ✅ Services pages as an editable page-builder (M5-506b, 2026-06-18). New generic `page` Sanity document type — ordered `sections[]` of polymorphic, individually-hideable section objects (heroBanner, richText, imageText, infographic, iconFeatures, statBanner, cardGrid, ctaBlock, eventList, faqAccordion) — gives Patrick website-builder behavior (reorder / insert / delete / hide) in Studio. Rendered by slug via `SectionRenderer` ([components/page-sections/](components/page-sections/)) at the existing Services dropdown routes (`/services/kitting`, `/services/company-stores`, `/services/popup-stores`, `/services/custom-products`) — no new routes, no nav changes. `dynamicParams=true`, `revalidate=false`, webhook revalidates `/services/<slug>` on publish. Four pages seeded as **drafts** (`pnpm seed-service-pages`) with the section structure/order of the reference layouts but **original placeholder copy + empty image slots** — the source-site marketing copy and infographics were intentionally NOT reproduced; Patrick fills copy/images and publishes. The `page` type is generic and will also power About/Privacy/Terms/Contact (later prompt). Routes added to `app/sitemap.ts`; each page emits title/meta/canonical + BreadcrumbList schema.
- ✅ Videos section (M5-507, 2026-06-21). `/videos` index (card grid + blog-style **client-side** category filter over the shared `blogCategory` taxonomy, newest first) and `/videos/[slug]` detail (responsive player + related videos in the same category + VideoObject JSON-LD). The `video` schema was generalized from YouTube-only to a single `embedUrl` (provider auto-detected) + optional custom `thumbnail`. Embed parsing in [lib/video/embed.ts](lib/video/embed.ts) handles YouTube watch/`youtu.be`/Shorts, Vimeo, Instagram reel/post, and Facebook video/reel, returning `{ provider, embedSrc, aspect }` (Shorts/reels 9:16, rest 16:9); rendered by client [components/videos/VideoEmbed.tsx](components/videos/VideoEmbed.tsx). YouTube/Vimeo embed cleanly; Instagram/Facebook are best-effort (recommend a custom thumbnail + per-link testing). Thumbnail priority: custom → YouTube auto → placeholder. On-demand SSG (`dynamicParams=true`, `revalidate=false`); webhook revalidates `/videos` + `/videos/<slug>` on publish. Detail URLs added to `app/sitemap.ts`. `video` titles added to the search index (`collectVideos()` in the prebuild) + the overlay/`also-matching` groups. Query helpers in [lib/sanity/queries/videos.ts](lib/sanity/queries/videos.ts); `video` is already in the nav (`/videos`). No seed data — Patrick adds videos in Studio.
- ✅ Hybrid search — instant freshness for Sanity content (M5-507 follow-up, 2026-06-21). Search index split into two layers so newly-published Sanity content is searchable without a full rebuild. **Static bulk** (`public/search-index.json`, prebuild): Geiger categories + products + brands only — no Sanity calls, cacheable for a deploy lifetime. **Live delta** ([app/api/search-index/route.ts](app/api/search-index/route.ts)): blogs + videos + custom categories + custom products, assembled by [lib/search/sanity-index.ts](lib/search/sanity-index.ts) (`buildSanitySearchItems()`) from [lib/sanity/queries/](lib/sanity/queries/) (`getAllBlogSearchEntries`, `getAllVideoSearchEntries`, new `getCustomCategorySearchEntries` + `getCustomProductSearchEntries`). The route is ISR with a **1-week `revalidate` floor** (the requested auto-refresh) and is **refreshed within seconds of publish** by the Sanity webhook ([app/api/sanity/revalidate/route.ts](app/api/sanity/revalidate/route.ts) → `revalidatePath('/api/search-index')` for `blogPost`/`video`/`customProduct`/`customCategory`/`curatedCategory`, shared path constant in [lib/search/constants.ts](lib/search/constants.ts)). Client ([lib/search/load-index.ts](lib/search/load-index.ts)) fetches both, merges + de-dupes by `type+url` (Sanity-first so a custom category overrides a bulk slug); the live delta is best-effort (search still works on the static bulk if it's briefly down). Matching stays client-side Fuse — no runtime Searchspring. **Rendering gap closed too:** `/deals`, `/new-products`, `/rush-products` switched from `force-static` to ISR (`revalidate` 1 week + the same webhook), so custom products / pins / hides surface without a rebuild. Custom categories/blogs/videos already rendered from Sanity. Net: add anything in Studio → page live immediately + searchable within seconds, weekly auto-refresh as the safety net.
- ✅ Mega menu fully Sanity-driven (M5-503, 2026-06-17). Header reads the `megaMenu` singleton via `getMegaMenu()` ([lib/sanity/queries/mega-menu.ts](lib/sanity/queries/mega-menu.ts)) and renders the existing components (`ShopByMegaMenu` cascade, `AllCategoriesPopover` grid, `SimpleNavDropdown`, `MobileDrawer`) unchanged, so the live menu is visually/behaviorally identical to the prior hard-coded one. Singleton seeded byte-for-byte from `lib/nav-data.ts` (departments + `SIMPLE_NAV`) via `pnpm seed-mega-menu`. Schema extended with `kind`/`variant`/`columns`. Reorder/rename/hide/add/delete in Studio reflects live — the Sanity webhook handler (`app/api/sanity/revalidate/route.ts`) verifies the HMAC signature and `revalidatePath('/', 'layout')` for `megaMenu`/`globalSettings` changes. No hard-coded fallback. **⚠️ Webhook status (2026-06-21): the GROQ webhook is now created on STAGING (`dev.perfectimprints.com`, secret set in Vercel); PRODUCTION is still pending — create it at launch. Until each environment's webhook exists, that environment's revalidations (mega menu, global settings, home, services pages, search/blog/video/custom-product/category) fall back to ISR/on-demand. Setup steps + production task: [docs/sanity-webhook-setup.md](docs/sanity-webhook-setup.md) / TASKS.md M5-512.**
- ✅ Site-wide search (M5-502 + M3-309, 2026-06-19). Build-time Fuse.js index → `public/search-index.json` (`{ generatedAt, items }`), built by `scripts/search-index/build-index.ts` as the **`prebuild`** step before `next build`. **As of the M5-507 hybrid split this static file holds ONLY the Geiger bulk — ~30,340 entries: 22,180 categories + ~7,955 products + 205 brands (541 KB gzipped).** Blogs, videos, custom categories, and custom products moved to the LIVE delta route (see the hybrid-search bullet below / Section 17). Entry shape is minimal `{ type, title, url, brand?, category?, image? }` — products carry name + brand + raw `geiger_url` (+ a thumbnail `image` for the overlay, added in M5-502b; no description/SKU) and their results link STRAIGHT to the affiliate host (via [lib/affiliate-url.ts](lib/affiliate-url.ts), new tab), never a category page. Answered FAQs are searchable too — they live in the live delta and link to the `/faq` library (M5-506). The header input ([components/forms/SearchBox.tsx](components/forms/SearchBox.tsx)) opens a lazy autocomplete overlay: Fuse.js (dynamic `import`) + the index (fetch) load only on first search, so initial route JS is unaffected ([lib/search/load-index.ts](lib/search/load-index.ts): `loadSearchIndex()` + `search()`, keys weighted title 0.8 / brand 0.2, `threshold 0.32`, `ignoreLocation`). Results are grouped by type (Categories/Products/Brands/Blogs/Videos), arrow-key + Enter nav, Escape/outside-click close. `/search?q=` ([app/search/page.tsx](app/search/page.tsx), `noindex`) is a product-first faceted results page (see M5-502b below). No-results never dead-ends — it shows a lead-form CTA ([components/search/SearchEmptyCTA.tsx](components/search/SearchEmptyCTA.tsx), reuses `LeadFormModal`). No external search service; `app/api/search/route.ts` stays a 501 stub (reserved for a possible future live Searchspring proxy, out of scope). New shared loaders: `getAllProducts()` ([lib/categories.ts](lib/categories.ts)), `getAllBlogSearchEntries()` ([lib/sanity/queries/blogs.ts](lib/sanity/queries/blogs.ts)).
- ✅ Geiger-style faceted search results + grouped overlay (M5-502b, 2026-06-19). `/search` is now a **product-first faceted page** (mirrors Geiger's `/search`): matched products are resolved server-side from the full catalog (`searchProducts()` in [lib/search/server-search.ts](lib/search/server-search.ts), a cached Fuse over `getAllProducts()` — the 9 MB catalog never reaches the client), facets built by [lib/search/build-facets.ts](lib/search/build-facets.ts) drive the existing `/deals` filter sidebar + `ProductGrid` + pagination + a Sort control ([SearchFacetedResults.tsx](components/search/SearchFacetedResults.tsx)). **Facets are limited to Category / Price / Brand / Min Qty** — the only filterable attributes ON the product object; Color/Material/Production Time live only in per-category Searchspring facet arrays (not per-SKU), so they can't be derived for an ad-hoc query without a runtime API. A client-side "Also matching" strip ([SearchAlsoMatching.tsx](components/search/SearchAlsoMatching.tsx)) surfaces matching categories/brands/blogs above the grid. The header overlay now **groups** results (Categories/Products/Brands/Blogs/Videos) with **product thumbnails** + a "See all N results" footer — this added `image` (decoded `imageUrl`) to product index entries (index 563.7 KB gzipped, still well under budget). **Root-category promotion:** `search()` runs a second Fuse over only the ~465 root pages and promotes the best root to the front (gated by score ≤ 0.25 + a word-boundary title match) so a "main" category (e.g. `/cat/water-bottles`) outranks its own modifier/facet children — without hijacking modifier-specific queries ("closeout beer accessories"); root-ness is derived from the `/cat/<slug>` URL shape, no index change. Still zero runtime Searchspring.
- ✅ Instant-navigation loading skeletons (2026-06-20). Added route-level `loading.tsx` for `/cat/[...slug]`, `/search`, and `/brands/[...slug]` (shimmer skeletons in [components/ui/Skeleton.tsx](components/ui/Skeleton.tsx) mirroring each layout). Without a `loading.tsx`, the App Router holds the **old** page frozen until the server render finishes (worse on the on-demand-SSG `/cat` facets and the dynamic `/search`), and automatic `<Link>` prefetch of a dynamic route prefetches nothing — so navigation felt "stuck on click" even in production. The skeletons make navigation transition instantly + show a placeholder while data streams, and they also make `<Link>`/`router.prefetch` effective for the dynamic routes. Search-overlay rows additionally `router.prefetch()` their internal target on hover/focus ([useResultNavigation.ts](components/search/useResultNavigation.ts) → `prefetch`). Perceived-perf only — it does NOT change the on-demand-SSG strategy (that's a forced Vercel build-budget constraint, see Section 13).
- ✅ Mobile Pagespeed improvement (LCP + Speed Index) — M5-508 Part 1 baseline + **Part 8 PageSpeed pass (2026-06-28)**. Part 8 addressed Patrick's red PageSpeed items conservatively, without regressing the M5-508 LCP work or the static `/cat` render: (1) **preconnect + dns-prefetch** for the Geiger image CDN `imgsirv.geiger.com` (and GTM when configured) in [app/layout.tsx](app/layout.tsx) so product images (the category LCP candidate) connect earlier; (2) **Turnstile script → `lazyOnload`** ([components/forms/Turnstile.tsx](components/forms/Turnstile.tsx)) and the **lead-form modal lazy-loaded via `next/dynamic` (`ssr:false`, mount-on-open)** in [EmptyStateCTAButton.tsx](components/category/EmptyStateCTAButton.tsx) + [SearchEmptyCTA.tsx](components/search/SearchEmptyCTA.tsx) — keeps LeadForm + Turnstile + file-validation out of the **static `/cat`** initial bundle and the search overlay (Turnstile no longer ships on form-less pages); (3) **home carousels lazy** (below-the-fold, ssr:false) via [TestimonialsLazy.tsx](components/home/TestimonialsLazy.tsx) + [ValuePillarsCarouselLazy.tsx](components/home/ValuePillarsCarouselLazy.tsx); (4) **forced-reflow fixes** — rAF-batched reads + `ResizeObserver` in [ValuePillarsCarousel.tsx](components/home/ValuePillarsCarousel.tsx) + [Testimonials.tsx](components/home/Testimonials.tsx); (5) **modern `browserslist`** in [package.json](package.json) (`chrome 64 / edge 79 / firefox 67 / opera 51 / safari 12`) to drop legacy polyfills; (6) **`<select>` `aria-label`s** on the category + `/search` sort dropdowns. Product images already request the 275px webp grid variant (no upscale) with width/height + lazy/eager — verified, no change. The mega menu stays SSR'd for nav-link crawlability. `/cat` stays `●`/SSG (baseline build confirmed 1,840 prebuilt paths; the modal split is client-side, adds no `searchParams`/uncached fetch). `pnpm typecheck` clean; full `pnpm build` deferred to Vercel (local builds don't run cleanly on Patrick's machine). See TASKS.md M5-508 Part 8.
- ✅ SEO follow-ups + Sanity footer columns (M-SEO3 follow-up, 2026-06-28). (1) **Breadcrumb JSON-LD uses absolute `item` URLs** and is emitted **once** by the shared `<Breadcrumbs>` component (fixed Google Rich Results' "Invalid URL in field 'id'"); removed the duplicate `breadcrumbSchema` emission from `CustomCategoryView`. (2) **Geiger product `imageUrl`s decoded** (`&amp;` → `&`) at the product loaders (`lib/categories.ts` `loadProductsIndex`, `lib/products/lookup.ts`, `lib/brands.ts`) so `og:image` / `twitter:image` / ItemList `image` are clean and social previews resolve; rendered grids unchanged. (3) **Footer nav columns now Sanity-driven** via `globalSettings.footerColumns` (wired into `getSiteSettings()` + `Footer.tsx`), with the hardcoded `NAV_COLUMNS` as fallback; seeded idempotently via `pnpm seed-footer-columns` (ran 2026-06-28). No `/cat` data-fetch/render changes.
- ✅ SEO schema + meta + Open Graph pass (M-SEO3, 2026-06-27). (1) **Category meta title = the page H1** (full phrase; brand suffix only when it fits) via `categoryMetaTitle()` — canonicals/H1 untouched. (2) **CollectionPage + ItemList** JSON-LD added to category pages (baked + customCategory); ItemList lists the products shown (omitted for CTA-only categories); FAQPage (root + custom w/ FAQs) and BreadcrumbList retained. (3) **Complete Open Graph + Twitter on every page** via the shared `socialMeta()` helper ([lib/seo/open-graph.ts](lib/seo/open-graph.ts)) — category `og:image` = first product image, logo fallback when empty; blog hero / brand logo / video poster elsewhere; always sets site_name + image:alt. (4) **Organization (local) schema restricted to home + contact** — removed from the root layout (was on every page), now rendered only by [app/page.tsx](app/page.tsx) + [app/contact/page.tsx](app/contact/page.tsx); WebSite + SearchAction stays site-wide. No `/cat` data-fetching / Suspense / `loading.tsx` changes — route stays static.

**Already built (just confirming to Patrick):**

- Sale ribbon on product image (top-right corner) — will be visible on closeout pages once full generation completes

**Infrastructure state:**

- GitHub repo: `raoalihamza/perfectimprints` (linked to Vercel)
- Vercel deployment live at `dev.perfectimprints.com` (staging)
- Sanity Studio at `localhost:3333` and `/admin3773752` (the embedded Studio path was obfuscated from `/admin` in M5-506 to cut bot/scanner noise — light obfuscation only, Sanity auth still gates it; `basePath` in [sanity/sanity.config.ts](sanity/sanity.config.ts) + the route folder + the `ChromeGate` check all use the new path). Project ID `ii96lcy9`.
- DeepSeek API key on Patrick's account, working
- Affiliate URLs link to `patrickblack.geiger.com` but that subdomain isn't active yet on Geiger's side — Patrick is chasing them

**Schedule note:** Eid-ul-Adha holiday on Wednesday May 27 and Thursday May 28, 2026. Ali offline those days. Active work resumes Friday May 29.

**Large data files note:** `products.json` (9.6 MB) and `facet-memberships.json` (44.5 MB) currently live in the main repo. Relocation tracked as M5-509.
