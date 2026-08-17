# SNIP-000 — Product Snippets Diagnostic

Date: 2026-08-17. Diagnostic only — **no code, schema, config, or page was changed**. The only file written is this report.

## How this was verified

- **Code**: read from the production repo `C:\Users\aliha\Documents\Github\patrick-perfectimprints\perfectimprints` (HEAD `fd8ad4ee`). Parts of the code inventory were read in the staging clone at `C:\Users\aliha\Documents\Github\perfectimprints`; a recursive `diff` of `app/`, `components/`, and `lib/` between the two clones found **zero differing files**, and md5 checksums of the key files cited below (`lib/seo/schema-generators.ts`, `app/cat/[...slug]/page.tsx`, `lib/product-types.ts`, `data/geiger/products.json`, `deals.json`, `new-products.json`, `rush-products.json`, `data/pi-urls/category-urls.json`) are byte-identical. The one checksum mismatch (`data/categories/tote-bags.json`) was inspected: identical content (same 176 SKUs, same `generatedAt`), formatting-only difference. File lists of `data/categories/` (22,180 files) are identical.
- **Live pages**: `https://www.perfectimprints.com/cat/water-bottles`, `/cat/caps`, `/cat/pens`, `/cat/tote-bags` fetched 2026-08-17; their JSON-LD extracted and measured. Image URLs from the markup probed with HEAD requests.
- **Google guidance**: fetched from `developers.google.com` on 2026-08-17, cited inline. Nothing in this report about Google's rules is from memory.
- **Not verified** (and why): live Sanity document counts (published customCategory/productPage/catalogPage docs — no committed artifact is current); the count of blog posts carrying product strips (lives only in Sanity — see §E); what the *old* site's markup emitted (the old site is gone; the 2,000–3,000 May figure is taken as given from GSC); GSC's current numbers (no GSC access from this environment).

---

## Executive summary

1. **The gap is real and precisely located.** Price, brand, SKU, and min-quantity are already loaded, already printed as visible text on every product card, and are dropped on the floor at the one function that builds the structured data. Only `/cat` pages (and the couple of Sanity-owned category pages) emit any per-product markup at all — a 3-field `ListItem` (name, url, image). Eleven other product surfaces (Deals, New, Rush, Brands, /promotional-products, blog strips, video strips, home rails, shop-by-theme, landing strips) emit **nothing** per product.
2. **The weight problem is much smaller than feared.** Measured on the live `/cat/tote-bags`: the honest full-product upgrade adds **~12 KB raw to a 470 KB page (+2.5%)** and roughly **+2–3.4 KB gzip / +1.3 KB brotli on a ~51–71 KB transfer (+2–4%)**. The "doubling" figure is reproducible only if per-product `description` is included — which I recommend against (it alone triples the block). This is inline text: no render-blocking resource, no image, no script execution — it does not move LCP/CLS/INP in any mechanism Lighthouse measures.
3. **No surface needs a new data read.** Every surface already holds fully-materialized product objects at render time. Nothing needs a new Sanity read; the `/cat` static path is not at risk from the data side.
4. **Expectation flag (Patrick decision):** Google's own documentation says product **rich results** support only pages "that focus on a single product… 'shoes in our shop' is not a specific product." Adding markup to category pages makes the data machine-readable and should restore GSC product-item *counts* (which is what was lost), but Google does not promise rich snippets from category pages. This must be said before the build, not after.
5. **Deals is the wrong first surface.** It has 12 products, no pagination, no existing ItemList, and its sale-price premise is false in the data (`msrp` is a byte-for-byte alias of `high_price` on all 7,957 catalog records — there is no "was/now" price anywhere). Recommendation: pilot on **/brands/[slug]** (205 static pages, real `/page/N` pagination, brand always present), then `/cat` — see §F.

---

## A. What is emitted today, everywhere

**Search method** (run by a read-only sweep of the repo): grep for `application/ld+json`, `jsonLdHtml`, `dangerouslySetInnerHTML` (18 files, 9 real emitters); grep for `itemListSchema|collectionPageSchema|productSchema|buildMinimumOrderOffer` (5 call sites); grep for `ProductCard|ProductGrid|ProductStrip|ProductsRail` (36 files → 17 rendering surfaces); then read of every route file found plus the generators `lib/seo/schema-generators.ts`, `lib/seo/content-schema.ts`, `lib/products/product-schema.ts`, `lib/seo/json-ld.ts`.

**The one per-product generator on any listing page** is `itemListSchema()` at `lib/seo/schema-generators.ts:136-149`. Its input type (`:124-129`) is `{ name; url; image? }` — three fields; nothing else *can* be passed. Each entry is a bare `ListItem` (`position, name, url, image?`), **not** a nested `Product`. No offers, price, currency, availability, brand, sku, description, or rating.

Verified against the live site: `/cat/caps` and `/cat/tote-bags` each serve one combined block `[CollectionPage, ItemList(60 items, keys @type/position/name/url/image), FAQPage]` plus `WebSite` and `BreadcrumbList`.

### Surface inventory

| Surface | Route file | JSON-LD today | Pages | Products/page |
|---|---|---|---|---|
| Baked category pages | `app/cat/[...slug]/page.tsx:457-482` | CollectionPage + **ItemList (3-field)** + FAQPage (roots) + BreadcrumbList | 22,180 total; **14,351 grid-bearing** (emit ItemList), 7,829 CTA-only (no ItemList — correct); ~27,071 URLs incl. `/page/N` | 60 (`PRODUCTS_PER_PAGE`, `lib/product-types.ts:7`); mean 78.1 SKUs per grid category, 4,860 categories ≥60 |
| Sanity customCategory | same route → `components/category/CustomCategoryView.tsx:70-109` | CollectionPage + ItemList (3-field) + FAQPage + BreadcrumbList | committed artifact `public/custom-category-slugs.json` lists 2 slugs (2026-06-25 snapshot); live count not verifiable offline | whole hand-picked grid, unpaginated |
| `/deals` | `app/deals/page.tsx` | **Breadcrumb only** — no CollectionPage, no ItemList | 1 | 12 total (`data/geiger/deals.json`, scraped 2026-07-05) |
| `/new-products` | `app/new-products/page.tsx` | **Breadcrumb only** | 1 | 60 of 340 in server HTML (client pagination) |
| `/rush-products` | `app/rush-products/page.tsx` | **Breadcrumb only** | 1 | 60 of 73 |
| `/promotional-products` | `app/promotional-products/page.tsx:88-119` | **Breadcrumb only** — the site's largest collection (7,957 products) has no CollectionPage | 1 indexable (variants noindex) | 60, server-paginated |
| `/brands/[slug]` | `app/brands/[...slug]/page.tsx:161-197` | **Breadcrumb only** — no ItemList, and no `Brand` schema despite name/logo/description in hand | 205 (`data/geiger/brands.json`), all prebuilt, + `/page/N` | 60 |
| `/shop-by-theme/[slug]` | `app/shop-by-theme/[slug]/page.tsx:117-143` | CollectionPage + Breadcrumb, **no ItemList** | ~7 (published Sanity docs; count not verifiable offline) | 4 preview cards |
| `/shop-by-theme/[slug]/catalog` | `.../catalog/page.tsx` | Breadcrumb only — **noindex, correctly skipped** | ~7 | 60/client page |
| `/search` | `app/search/page.tsx` | none — **noindex, correctly skipped** | — | 60 of ≤300 |
| Blog posts w/ product strips | `app/blog/[slug]/page.tsx` + `components/blog/BlogBody.tsx:108-203` | BlogPosting + Breadcrumb; **strip products in zero markup** | 731 posts; strip count not verifiable offline (§E) | uncapped array |
| Video pages w/ strips | `app/videos/[slug]/page.tsx` + `components/videos/VideoRelatedProducts.tsx` | VideoObject + Breadcrumb; strip in zero markup | 71 published | uncapped |
| Home rails | `app/page.tsx:68-99` | Organization + WebSite; rails in zero markup | 1 | 12 + 12 |
| Landing/page/services strips | `components/page-sections/ProductStrip.tsx` | Service/FAQPage/Breadcrumb; strip in zero markup | varies (Sanity) | uncapped |
| `/products/[slug]` | `app/products/[slug]/page.tsx:447-489` | **Full honest Product** (FIX-830): name, url, ≤10 jpg images, description, brand, sku, Offer with price/eligibleQuantity/UnitPriceSpecification/availability/itemCondition/return policy/shippingDetails | ~86 docs per FIX-830 audit; live count in Sanity | 1 (+8-card related grid, no markup) |

**Plainly: which have what Google wants?** Only `/products/[slug]` — the 43 items GSC still sees. The `/cat` ItemList has name/url/image and nothing commercial. Every other surface has nothing at all. Meanwhile `components/category/ProductCard.tsx` renders price (`:112-114`), min qty (`:115-117`), brand (`:83-87`), and Item # (`:106-108`) as visible text on all of them.

Two pre-existing correctness observations (facts, not changes):

- **ItemList URLs point off-site.** `app/cat/[...slug]/page.tsx:470` sets `url: affiliateUrl(p.geiger_url)` → `patrickblack.geiger.com`. On 14,351+ pages the listed items are declared to live on a third-party host. Defensible for the affiliate model, but any nested `Product`/`offers.url` escalates that claim — decision item, §F/§G.
- **Some ListItems have no product URL at all**: on live `/cat/pens` and `/cat/water-bottles`, override-added custom products render `url: "https://patrickblack.geiger.com"` (the bare homepage — `geiger_url` is null and the affiliate helper falls back). Today that's a link; inside a `Product` node it would be a wrong offer URL. The serializer must guard this.

## B. The weight problem — measured

**Page measured**: live `https://www.perfectimprints.com/cat/tote-bags` (baked root, full 60-product grid, `slug-filtered`, 176 SKUs), fetched 2026-08-17. Cross-checked on `/cat/caps` and `/cat/water-bottles` (within ±7%).

**Current state** (live measurements):

| | raw bytes | share of page |
|---|---|---|
| Whole HTML document | 470,114 | 100% |
| All JSON-LD (WebSite + CollectionPage + ItemList + FAQPage + Breadcrumb) | 19,122 | 4.1% |
| The ItemList alone (60 items) | 16,118 | 3.4% |
| Transfer size, gzip / brotli (as served by Vercel) | 70,966 / 51,264 | — |

**Duplication fact**: the string `"itemListElement"` appears **twice** in the served HTML — once in the rendered `<script type="application/ld+json">` and once inside the embedded RSC flight payload Next.js ships for hydration. Every byte of JSON-LD is therefore paid ~twice in raw HTML. This is already true today and applies equally to any growth. There is no clean way to avoid it in App Router (the script tag is server-component output, which is serialized into the flight stream).

**What the full upgrade weighs** — rebuilt from the repo's own data (`data/categories/tote-bags.json` page-1 SKUs resolved against `data/geiger/products.json`, entity-decoded, affiliate-rewritten), 60 items per variant:

| ItemList variant (per copy) | raw bytes | vs current |
|---|---|---|
| Current (`position, name, url, image`) | 16,118 | — |
| + nested `Product` with `sku`, conditional `brand`, `AggregateOffer{priceCurrency, lowPrice, highPrice}` | 22,101 | +37% |
| + `eligibleQuantity` (min qty, `QuantitativeValue`) | 26,938 | +67% |
| + per-product `description` | 50,192 | **3.1×** |

The arithmetic behind "roughly doubles": average catalog description is 451 chars; ×60 items ×JSON escaping ≈ +28 KB per copy. **The doubling only happens if description is included.** Without it:

| Recommended variant (no description, with min-qty) | figure |
|---|---|
| Delta per copy | +10,820 bytes |
| Delta per page (×2 copies: script + flight) | **+21.6 KB raw = +4.6% of a 470 KB page** |
| Without `eligibleQuantity` | +12.0 KB raw = +2.5% |
| Compressed delta (measured by recompressing the grown document) | ≤ +3.4 KB gzip on 71 KB (+4.8% worst case); **+1.3 KB brotli on 51 KB (+2.5%)** — brotli's large window dedupes the two copies; Vercel serves brotli to every modern browser |

**Does it reach the visitor or only the crawler?** It reaches everyone. These pages are static HTML; the same bytes are served to Googlebot and to a phone. Serving crawler-only markup would require UA-sniffing (cloaking — against Google's guidelines) or middleware (banned by this site's architecture, CLAUDE.md §4). However, the *kind* of weight matters: this is inline text in the initial document. It adds no request, no render-blocking resource, no script execution, no layout work. It slightly lengthens HTML download/parse (~1–3 KB compressed on a 4G connection ≈ single-digit milliseconds). Patrick's mobile-speed complaint is about image/JS-driven metrics; this change is not the same lever and will not measurably move LCP/CLS/INP. Numbers, not adjectives: +2.5% transfer on the document, 0 new requests, 0 KB new JavaScript.

**Ways to keep it down, with costs:**

1. **Drop `description`** (recommended): saves ~56 KB/page raw vs the naive full shape. Cost to Google: description is a *recommended* (not required) product-snippet property; the /products pages carry it where it matters.
2. **Conditional emission** (recommended): `brand` only when present (15.4% of catalog — see §C), `sku` only for real SKUs, offer omitted when no price. Cost: none — this is honesty, and it saves bytes on the 84.6% brandless items (already reflected in the figures above).
3. **Cap the list** (e.g., first 20 of 60): saves ~⅔ of the delta. Cost: directly works against the stated goal (restoring the 2–3k product count in GSC — fewer items per page = fewer items read), and the saved ~14 KB raw is not worth it at these percentages.
4. **Skip `eligibleQuantity`**: saves 9.7 KB/page. Cost: the price range can be read as a per-one-unit price, which the FIX-830 precedent in `lib/products/product-schema.ts` treats as materially false for this business. Recommend keeping it.
5. **Emit page 1 only**: already the natural behavior — each `/page/N` document carries only its own 60; pages 2+ are `noindex,follow` anyway.

**Google's guidance on list size** (fetched, not from memory): the carousel/ItemList doc (`developers.google.com/search/docs/appearance/structured-data/carousel`) requires "at least two ListItem elements," states **no maximum**, and says "Make sure that the carousel structured data is complete and contains all the items that are listed on the page." Note also that carousel rich results apply only to Course/Movie/Recipe/Restaurant — **not products** — so ItemList on these pages is discovery/context markup, not a rich-result trigger (see §G risk 1).

**Recommendation (with the numbers behind it)**: full nested Product **without description**, with conditional brand/sku, `AggregateOffer` low/high, and `eligibleQuantity`. Cost: **+21.6 KB raw (+4.6%), ~+1.3–3.4 KB compressed (+2.5–4.8%) per category page, zero new requests/JS**. That is not a page-speed event; the mitigation that matters is field discipline (no description), not item caps.

## C. Where the product data comes from

**The shape**: every card surface renders from one interface, `GeigerProduct` (`lib/product-types.ts:14-38`): `sku, name, brand, low_price, high_price, msrp, min_qty, imageUrl, description, category_paths, badges, is_new_item, is_on_sale, product_type_unigram, geiger_url, detailUrl?`. Verified against disk: the union of keys across **all 7,957** records in `data/geiger/products.json` (and all records in `deals.json`, `new-products.json`, `rush-products.json`, `catalogs.json`) is exactly those 15 scraped fields. There is no second, richer product object on any listing path.

**Per-surface source and the new-read question** — the load-bearing answer:

| Surface | Product objects at render | Source | Needs a NEW read? |
|---|---|---|---|
| `/cat` baked | `pageData.products` (line 410) via `mergeCategoryProducts` → `resolveProductsBySku` → sync `fs` read of `products.json` | disk | **No** — the existing ItemList `.map()` at `app/cat/[...slug]/page.tsx:468` already iterates the full objects; the change is purely which fields the map keeps |
| `/cat` customCategory | same merge path (`:273`) | disk + existing tagged Sanity reads | **No** |
| `/deals`, `/new-products`, `/rush-products` | full array server-side before the client grid | own JSON file + existing tagged Sanity reads | **No** |
| `/brands/[slug]` | `paginateProducts` over `loadProductsByBrandSlug` | disk | **No** |
| `/promotional-products` | `result.products` server-side | disk | **No** (route already dynamic — reads `searchParams`) |
| Home rails | `getNewProducts(12)` / `getRushProducts(12)` sync fs | disk | **No** |
| Blog/video/page strips | `resolveProductsBySku` + refs already dereferenced in the existing tagged GROQ | disk + existing reads | **No** |
| `/shop-by-theme/*` | `getCatalogPreviewProducts` / `getAugmentedCatalogData` | disk + existing reads | **No** |

**No surface needs a new Sanity read, and none should be added.** On `/cat` specifically, the render path's Sanity surface stays exactly what it is today (`getCategoryControlSets` + the edited-set-gated per-slug reads); the product fields are all on disk and already in scope. The static-route constraint is therefore an implementation discipline (don't add an uncached read while doing the work), not a data requirement.

**Pricing — what honestly exists** (measured over all 7,957 records):

- `low_price`/`high_price` non-null on 100%; `low_price === high_price` on **0** records — the catalog is always a genuine range (volume-tier endpoints: cheapest at top tier, dearest at min qty).
- **`msrp === high_price` on 7,957 of 7,957 records.** `msrp` is a byte-for-byte alias; it is not a list price and must never be emitted as one (no strike-through, no `priceValidUntil`, no discount claim — there is no was/now material anywhere, including on /deals).
- A bare single `price` is **not supportable** — there is no defensible single number. The honest offer is `AggregateOffer { priceCurrency: "USD", lowPrice, highPrice }`, ideally qualified with min qty. (`offerCount` is unknowable — tier counts aren't in the data — so it is omitted; Google lists it as recommended, not required, for AggregateOffer per the product-snippet doc.)
- The `/products/[slug]` `buildMinimumOrderOffer()` is **not reusable** here — it needs `pricingTiers` + `setupCharge`, which exist only on Sanity productPage docs.

**Availability: does not exist.** No stock/orderability field in any scraped file (verified by key-union across every record). The only availability in the codebase is the editor-typed `productPage.availability`, not projected on any card path. → **Omit** `availability` everywhere on list surfaces. Google's Offer requires `price` + `priceCurrency`; availability is recommended, and inventing `InStock` for 7,957 third-party items would be fabrication.

**Brand: conditional.** 1,222 of 7,957 (15.4%) have a brand; `/brands/[slug]` guarantees it; /deals has 3 of 12. Emit `Brand` only when present.

**Identifier**: `sku` present on 100%; 1,350 (17%) contain a space (`"501014 90A"`) — fine as schema.org `sku` free text, never to be slugified or used in an `@id`. **Synthetic `custom-<sanity-id>` SKUs (customProduct/productPage normalizers) must be suppressed** — the codebase already treats them as private in four places (e.g. `ProductCard.tsx:59-60`). GTIN/MPN: absent everywhere; omit (same position as FIX-830).

**Must be omitted rather than invented**: availability, GTIN/MPN, single unit price, `msrp`-as-list-price, ratings/reviews (no review data exists anywhere in the repo), `priceValidUntil`, per-product color/material/size (only in per-category facet arrays, never per-SKU). Safe constants that *could* ride along at near-zero cost: `itemCondition: NewCondition` and the site-level return-policy/shipping constants already codified in `lib/products/product-schema.ts` — optional, not required.

**Freshness caveat on prices (flag for Patrick)**: `products.json` was scraped **2026-05-21** and `deals.json` **2026-07-05**; the monthly rebuild is manual-only (no cron). The emitted prices would be exactly as stale as the prices already printed on the cards — internally consistent, but a stale price in machine-readable form is a stronger statement than one in pixels. A rebuild-cadence decision belongs before the site-wide rollout.

## D. Images

**Emitted today**: more than the ticket assumed. The `/cat` ItemList already carries an `image` per item — `largeSocialImage(p.imageUrl)` (`app/cat/[...slug]/page.tsx:471`), the ~1200px Geiger variant — verified in the live markup of all four fetched pages. The sitemap also already carries one image entry per grid-bearing category (M-SEO5), and `og:image`/`twitter:image` use the same upsized URL. The eleven no-markup surfaces emit no image markup because they emit no markup at all.

**What could be added and from where**: for the no-markup surfaces, the same `imageUrl` field (non-null on **100%** of 7,957 catalog records) via the same `largeSocialImage()` upsizing — no new source needed. For `/brands/[slug]`, additionally the brand logo (`brand.logoUrl`, self-hosted) if a `Brand` block is added.

**Scale**: ~7,957 unique catalog product images (hot-linked from `imgsirv.geiger.com`, permitted — Patrick is an authorized distributor; per his instruction, nothing in this work invites licensing images *from* him). Referenced across ~14,351 grid categories × up to 60 per page-1, plus the aggregators; plus 205 brand logos; plus Sanity assets on custom products. The markup references URLs — it moves no image bytes.

**The format question (checked specifically, and the answer is good news)**: live probes of the actual markup URLs —

| URL pattern | plain client | with `Accept: image/avif,image/webp` |
|---|---|---|
| `imgsirv.geiger.com/...?format=webp&thumbnail=1200...` (caps, tote-bags markup) | `image/jpeg` | `image/webp` |
| `imgsirv.geiger.com/...?thumbnail=1200` (no format param) | `image/jpeg` | `image/avif` |
| `cdn.sanity.io/...jpg?w=400&fit=max` (custom-product items) | `image/jpeg` | `image/jpeg` |

Google's current documentation (`developers.google.com/search/docs/appearance/google-images`, fetched 2026-08-17) states verbatim: *"Google Search supports images referenced in the src attribute of img in the following file formats: BMP, GIF, JPEG, PNG, WebP, SVG, and AVIF."* **AVIF is now on the supported list** — Google's list has moved since the FIX-830 product-page work assumed AVIF was unsupported. Every format the category markup can serve (JPEG/WebP/AVIF by negotiation) is supported. **No image-format fix is needed on category pages**, and the FIX-830 `format('jpg')` forcing on /products, while now unnecessary per current docs, is harmless and needs no change.

**Weight added by images**: none beyond §B's figures — the image URL string (~110–130 bytes/item) is already inside the current 16.1 KB ItemList and stays the same size in the upgraded one.

One hygiene item the build must include: the aggregator loaders (`lib/deals.ts`, `lib/new-products.ts`, `lib/rush-products.ts`, `lib/catalogs.ts` `readScraped`/`readCatalogsFile`) decode `name`/`description` but **not `imageUrl`** — all 12 + 340 + 73 scraped image URLs still carry literal `&amp;` at render time, currently masked by a local patch in `ProductCard.tsx:15` (contradicting the decode-at-the-loader rule, CLAUDE.md §8). Emitting those URLs into JSON-LD without the loader fix would reintroduce the exact `&amp;`-in-schema bug M-SEO3 fixed for `og:image`. The `/cat` path is unaffected (its loader decodes).

## E. The blog — three gaps, verified against today's code

**Gap 1 — index/pagination/category pages describe nothing: CONFIRMED.** All four routes (`app/blog/page.tsx`, `app/blog/page/[n]/page.tsx`, `app/blog/cat/[slug]/page.tsx`, `app/blog/cat/[slug]/page/[n]/page.tsx`) emit only BreadcrumbList (+ the empty-by-default `CustomSchemaJsonLd`). No Blog/CollectionPage/ItemList of posts, while `/cat` already does exactly this for products. **Work: SMALL** — the generators (`collectionPageSchema`, `itemListSchema`, `<Schema>`) exist and the post summaries (title/slug/headerImage) are already fetched on each route; ~10 lines per route behind one pure helper. Only decisions: `Blog` vs `CollectionPage`, and whether to bother on `/page/N` variants, which are `noindex` and carry little value.

**Gap 2 — product strips invisible to Google: CONFIRMED.** `app/blog/[slug]/page.tsx` resolves strip SKUs server-side (`:111-117`) and `BlogBody.tsx:108-203` renders them as real ProductCards; the page's only authored schema is `buildBlogPostingSchema` (`lib/seo/content-schema.ts:33-53`), which has no product-aware input at all. **The "14 posts" count is not verifiable offline** — strips are authored in Sanity; the closest committed figure is a different metric (18 of the 645 raw scrape files had legacy grids *stripped* during migration). **Work: MEDIUM** — four entry shapes with four URL rules (Geiger SKU/affiliate, productPage/internal, customProduct/external, manual/arbitrary), and the resolution logic lives inside the PortableText renderer, so the right fix extracts a shared resolver used by both render and schema. Recommend the 3-or-full-field ItemList shape consistent with whatever §F lands for categories.

**Gap 3 — dateModified is really datePublished: CONFIRMED in code.** `lib/seo/content-schema.ts:41`: `dateModified: input.updatedDate || input.publishDate`. The GROQ projects only the editor-typed optional `updatedDate` (`lib/sanity/queries/blogs.ts:187`); `_updatedAt` is never projected. When `updatedDate` is empty, Google is served `dateModified === datePublished`. **The "about half" claim is supported for the migrated corpus**: 309 of 645 committed raw files (47.9%) had no updated date, and the importer only writes truthy values; the live Sanity state is not verifiable offline. **Work: SMALL** (project `_updatedAt`, add a fallback) — but with a judgment call: `_updatedAt` bumps on *any* write (a re-tag, an AI-field edit), so it can assert freshness for unchanged content. The honest alternative is backfilling real `updatedDate` values in Sanity — a data task, not code. Related observations found in passing: `article:modified_time` OG is simply absent on those posts (an inconsistency with the JSON-LD assertion), and `app/sitemap.ts:233` stamps every blog URL's `lastModified` as build-time `now` — worth folding into the same piece.

## F. Where to start

**What's special/awkward about /deals** (the proposed starting surface):

1. **12 products** (`totalDeals: 12`, scraped 2026-07-05). Page 1 *is* the whole list; the pagination component renders nothing (`totalPages <= 1`). The central design question of this build — what a paginated ItemList describes — cannot even be exercised there.
2. **No existing ItemList/CollectionPage to extend** — /deals is *behind* /cat, not a lighter version of it.
3. **The sale-price premise is false in the data**: `msrp === high_price` on every record; only 7 of 12 deals are `is_on_sale`, 2 carry no badge at all; `brand` is present on 3 of 12. There is no sale-Offer to model, so the one thing Deals looked special for doesn't exist.
4. Its render model (client-side filtered aggregator over one JSON file, client pagination, ISR-weekly) shares almost nothing structural with `/cat` (server path-pagination, on-demand SSG, `revalidate=false`, override pipeline, CTA branch, 22,180 routes).

**Does it transfer?** Partially. It would teach the per-item honesty guards (null price/brand/image, `custom-` SKU suppression, bare-homepage URLs) and the AggregateOffer shape — real, reusable. It teaches nothing about the questions that make `/cat` hard: paginated ItemList semantics, weight at 60×14,351, static-generation constraints, the CTA branch, the override pipeline. You'd validate the easy half on the smallest surface on the site.

**My recommendation — a different starting point**: **/brands/[slug]**, then `/cat` as piece two.

- 205 pages, all prebuilt static, server-side `/page/N` pagination at 60/page — it exercises **everything** `/cat` needs (the paginated-ItemList decision, per-page weight at real grid sizes, static-render discipline, the same `GeigerProduct` serializer) at ~1% of the blast radius.
- `brand` is guaranteed non-null there, image URLs are already decoded, and there are zero Sanity reads on the product path.
- It's currently at zero (no ItemList at all), so it also closes one of the empty surfaces while proving the pattern.
- The deliverable of the first piece is really the **shared serializer**: one pure function (`GeigerProduct → ListItem{Product}` with all the guards) + unit tests, living next to `itemListSchema()`. Where it debuts matters less than that everything after reuses it; brands is the debut that rehearses `/cat` honestly.
- If a single-page pilot is still preferred for optics, `/promotional-products` (1 page, 60/page over 7,957, already dynamic) is the second-best rehearsal; /deals is the worst of the candidates.

`/cat` should be piece two, not piece five — it is the only surface that moves the 2,000–3,000 number, and §B/§C establish it needs no new reads and costs +2.5–4.8% transfer.

**Verification once a piece exists** (applies to every surface):

- *Automatic*: build output still shows `●` static for the touched routes **plus** a curl of the deployed page confirming raw HTML contains `<h1>`, product `<img>` tags, and the new JSON-LD with no `BAILOUT_TO_CLIENT_SIDE_RENDERING` (the M-SEO5 rule — the marker alone is insufficient); a script that extracts every JSON-LD block and validates JSON.parse + required keys per item (the SNIP scripts can live beside the Q-1xx verification scripts); byte-size assertion (delta within the §B envelope); zero `custom-` SKUs and zero `&amp;` in any emitted URL; validator run against `validator.schema.org` (the FIX-830 precedent, 0 errors) for one page per surface type (root/modifier/facet/custom/CTA-only, page 1 and page 2).
- *Human*: Google Rich Results Test on 3–5 representative live URLs (it exercises Google's actual parser, which the schema validator does not); then GSC's product-item counts watched over the following weeks — that is the number Patrick is paying to restore, it moves on Google's crawl schedule, and nobody can promise its slope (see §G risk 1).

## G. Risks, ranked

1. **Google's behavior is uncertain where it matters most (expectation risk — highest).** Google's product-snippet doc states verbatim: *"product rich results only support pages that focus on a single product (or multiple variants of the same product). For example, 'shoes in our shop' is not a specific product"* (`developers.google.com/search/docs/appearance/structured-data/product-snippet`, fetched 2026-08-17), and carousel rich results don't include products at all. What is documented to be restored: machine-readable product data and (very likely, matching the old site's behavior) GSC product-item counts. What is *not* promised by Google: rich snippets rendered from category pages. The May 2–3k figure was presumably counted from exactly this kind of category-page markup on the old site (not verifiable — the old site is gone). **This needs Patrick's eyes before the build, phrased as: "this restores what Google reads, not necessarily what Google displays."**
2. **Turning a static route dynamic (highest technical severity, fully avoidable).** Not required by the data (§C — zero new reads). The risk is purely implementation drift: an uncached Sanity read, a `searchParams` touch, or a render-time `useSearchParams()` under `/cat` silently destroys 22,180 static pages (the M-SEO5 failure mode). Mitigation: the serializer is a pure function over objects already in scope; the §F verification (curl the raw HTML) catches it before it ships.
3. **Breaking markup that currently validates.** `/cat`'s CollectionPage+ItemList and the 43 `/products` items pass today. All emission must stay on `jsonLdHtml()` (the single-escape rule, FIX-830 task 4); nested Product introduces per-item conditionals where an unguarded null (price-less custom product, bare-homepage URL, synthetic SKU) yields invalid or false items at scale. Mitigation: guards + unit tests + validator runs per surface before rollout.
4. **Hard to undo at scale — bounded but real.** The 21,137 on-demand-SSG facet pages cache at the edge permanently until the next deploy. A bad emission is fixed by revert + redeploy (one action), but the redeploy makes every facet cold again (the warmup story, with its known Vercel/Sanity cost) — so mistakes cost a rebuild cycle, not a page-by-page cleanup. Roll out in the §F order so mistakes are caught on 205 pages, not 14,351.
5. **Stale prices in machine-readable form.** Catalog prices date from 2026-05-21; the rebuild is manual-only. Emitting them doesn't create the staleness (the cards already show it) but formalizes it. Decision for Patrick: rebuild cadence before the `/cat` rollout (§C).
6. **The off-site offer URL.** Asserting `Product.offers.url` at `patrickblack.geiger.com` from perfectimprints.com pages is a stronger claim than today's bare ListItem url. Recommend emitting the affiliate URL (it is the truth of the funnel — it's where a buyer transacts) but as a deliberate, recorded decision; the fallback is omitting `offers.url` and keeping the offer priced but unaddressed.
7. **Weight** — last, on the evidence: +2.5–4.8% per page transfer with the recommended field set, no new requests, no JS. The only way this becomes a page-speed story is if `description` sneaks in (3.1×) — keep it out.

---

## Decisions needed (yes/no, with recommendations)

| # | Decision | Owner | Recommendation |
|---|---|---|---|
| 1 | Accept the expectation framing: this restores what Google *reads* (GSC counts), not documented rich-result display from category pages | Patrick | Present before build; proceed on that basis |
| 2 | Field set: nested Product without description, conditional brand/sku, AggregateOffer + eligibleQuantity | Requester | Yes (numbers in §B) |
| 3 | Emit the affiliate host as the offer/product URL | Patrick | Yes — it's the real transaction destination; record it as deliberate |
| 4 | First surface: /brands/[slug] pilot → /cat second (not /deals) | Requester | Yes (§F) |
| 5 | Rebuild cadence for price freshness before the /cat rollout | Patrick | Re-enable a scheduled Full Catalog Rebuild, or accept ~monthly-manual staleness knowingly |
| 6 | Blog gap 3: `_updatedAt` fallback vs backfilling real `updatedDate` in Sanity | Patrick | Backfill is more honest; fallback is one line — fine to do both (fallback now, backfill when convenient) |
