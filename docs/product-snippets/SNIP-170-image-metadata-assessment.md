# SNIP-170: image information for Google, assessment and decision

Date: 2026-08-28. The final piece of the Product Snippets and image metadata milestone.

**Outcome in one line: the site emits no image licence metadata, because none of the four fields Google requires can be filled from what this business actually knows, and the one field that is about usage terms rather than authorship is the one Patrick explicitly declined.** No usage terms page is needed. The decision is now enforced in code so it cannot be quietly reversed by someone trying to satisfy a validator.

---

## How this was verified

- **Code and data** read from the production repo `C:\Users\aliha\Documents\Github\patrick-perfectimprints\perfectimprints`. Sanity counts read live, read-only, through the query API with the project's own token; **no Sanity document was created, modified or deleted**.
- **Google's guidance** fetched 2026-08-28 from `developers.google.com` and quoted inline. Nothing about Google's rules in this document is from memory.
- **Live pages** fetched 2026-08-28 from `https://www.perfectimprints.com`: `/cat/water-bottles`, `/brands/bic`, `/deals`, `/new-products`, `/rush-products`, `/promotional-products`. Their JSON-LD was parsed, every image URL extracted, and all 299 unique URLs probed over the network.
- **Not verified**: Google Search Console figures (no GSC access from this environment), and whether any individual photograph is in fact Patrick's own work rather than a supplier's (nothing on the site records it, which is the finding).

---

## 1. What Google's feature actually is, and what it is worth

Source: `developers.google.com/search/docs/appearance/structured-data/image-license-metadata`, read 2026-08-28.

The markup is an `ImageObject`. **`contentUrl` is required, plus at least one of `creator`, `creditText`, `copyrightNotice` or `license`.** `acquireLicensePage` is recommended.

The documented benefit is display only, and is quoted here rather than paraphrased:

> "When you specify image metadata, Google Images can show more details about the image, such as who the creator is, how people can use an image, and credit information."

> "providing licensing information can make the image eligible for the Licensable badge, which provides a link to the license and more detail on how someone can use the image."

> "Google does not guarantee that structured data or IPTC photo metadata will show up in search results."

**No ranking benefit is claimed anywhere on that page.** The whole feature is: a credit line and a Licensable badge shown inside Google Images.

**Updating SNIP-000's traffic assessment rather than repeating it.** SNIP-000 judged that image search brings little traffic to a B2B promotional products business. That judgement is unchanged, and the reason is now sharper than "image search is small". The feature's only outputs are a credit line and a licensing badge. Neither is a buying signal for a marketing director sourcing 500 branded water bottles: the person who clicks a Licensable badge is looking for a photograph, not for promotional products. So even a fully populated, fully honest implementation would have had a business value close to zero here, and the honest implementation is not available anyway. **Weight was never the constraint** (measured in section 6) and must not be offered as the reason.

---

## 2. What images the site has, and where they come from

| Source | Count | Host | Who made it | Does the site know? |
|---|---|---|---|---|
| Geiger catalog product photos (`products.json`) | 8,185 records, 8,185 unique URLs, 100% with an image | `imgsirv.geiger.com` (hot-linked) | The individual supplier, per Patrick | **No** |
| Deals feed | 12 | same | same | No |
| New Products feed | 289 | same | same | No |
| Rush Products feed | 73 | same | same | No |
| Catalog feeds (`catalogs.json`) | 1,043 records, 998 unique URLs | same | same | No |
| Brand logos | 191 files (205 brand records; 14 have no logo) | self-hosted `/brand-logos/`, scraped from Geiger | The brand whose mark it is | Inferable from the brand name only |
| Sanity image assets (Patrick's uploads) | **2,281 total assets** | `cdn.sanity.io` | **Unknown** | **No** |
| Perfect Imprints' own marks | `logo.svg`, `og-default.png`, `placeholder-product.svg` | self-hosted | Perfect Imprints | Yes |

Breakdown of the 2,281 Sanity assets across published documents (live query, 2026-08-28):

| Where | Count |
|---|---|
| Blog post header images | 638 of 654 published posts |
| Blog body inline images | 792 |
| `productPage` colour variant images | 326 |
| `productPage` default images | 133 |
| `seo.ogImage` across all types | 23 |
| `customProduct` images | 1 of 1 published |
| `customCategory` hero images | 1 of 20 published |
| `video` custom thumbnails | 0 of 97 published |

Plus section images on 23 published `page` docs, 6 `landingPage` docs and 2 `catalogPage` docs, which are counted inside the 2,281 total.

**The Geiger catalog product photo is the dominant case by an order of magnitude** and it is the one that appears on every product surface, so it decides the answer.

---

## 3. What image information the site already emits

Established by scanning every `.ts`/`.tsx` file under `app/`, `components/` and `lib/`:

- **`ImageObject` appears exactly once in the whole codebase**: the Organization publisher logo inside `BlogPosting` (`lib/seo/content-schema.ts:61`), carrying `url` and nothing else.
- **`creditText`, `copyrightNotice`, `acquireLicensePage`: zero occurrences.**
- **`license` as a JSON-LD key: zero occurrences.**
- `contentUrl` appears only in `VideoObject` (FIX-830), never for an image.
- `creator` appears four times and none is schema.org: three are the Twitter `creator` handle, one is the PDF document `creator` metadata.

So the site emits **no image licence metadata at all today**, which matches what SNIP-000 recorded.

Images are already referenced as plain URLs in: the `Product.image` of every ItemList entry on the ten live product surfaces, the `Product.image` array on `/products/<slug>` (up to 10, forced to jpg at 1200px by FIX-830), `BlogPosting.image`, `VideoObject.thumbnailUrl`, `Organization.logo`, `og:image` and `twitter:image` on every page, and the sitemap image entries for categories and product pages.

**Those URLs are in good health.** All **299** unique structured-data image URLs across the six fetched live pages were probed: **299 of 299 returned HTTP 200 with a real image**, content types `image/webp` (242), `image/jpeg` (55), `image/avif` (2). Every one of those three is on Google's supported list for structured data images, so nothing needs a format fix. This confirms SNIP-000's finding that the FIX-830 AVIF worry is dead.

---

## 4. Which images could honestly carry which fields

Patrick's account, verbatim:

> "With a majority of the images, they come from the individual suppliers. Distributors like me and Geiger have permission to use them on our side or for presentations."

> "I don't want people approaching me about licensing images."

**Permission to use is not ownership.** That distinction is what decides each field.

### `creator`: "the photographer or organization that produced the image"

Not knowable. Nothing in `products.json` or any feed records a photographer or a source supplier; the `brand` field is the product's brand, which is not the same thing and is null on roughly 84% of catalog records anyway. Nothing in Sanity records it either, which was checked directly rather than assumed: no image field in any of the 20 document types and 10 object types defines a photographer, creator, credit, copyright or licence field. Naming Perfect Imprints would claim credit for a supplier's photograph. **Omit.**

### `creditText`: "the name of the person and/or organization that is credited for the image when it's published"

Nothing on this site credits anyone for any image today, because nobody knows whom to credit. Patrick's own wording is "a majority" come from suppliers, so a blanket credit would be wrong on an unknown subset and definitely wrong on the majority. **Omit.**

### `copyrightNotice`: "the copyright notice for claiming the intellectual property for this photograph"

This is the most dangerous of the four. Patrick has said plainly that the images belong to the suppliers. An emitted Perfect Imprints copyright notice would be a machine-readable false claim of intellectual property in tens of thousands of places. **Omit.**

### `license`: "a URL to a page that describes the license governing an image's use"

This is the only field that is about terms rather than authorship, and it is the only one where the business genuinely knows something. It still fails, for two independent reasons.

**First, it is the badge trigger, and the badge is the invitation Patrick declined.** Google: `license` is what makes an image "eligible for the Licensable badge, which provides a link to the license and more detail on how someone can use the image". Its entire function is to advertise the image as licensable and route the viewer towards finding out how. That is exactly what "I don't want people approaching me about licensing images" rules out. Omitting `acquireLicensePage` while keeping `license` does not remove the invitation; it only removes the second link.

**Second, it would be inaccurate even if Patrick changed his mind.** Perfect Imprints may use these photographs; it has no right to state terms in them for anyone else. Any page we could honestly write would have to say "we cannot license this to you, and we do not know which manufacturer can", which is not a licence. Badging an image "Licensable" in Google Images and then landing the clicker on a page that denies it is misleading to that person.

Google's own structured data policies say the same thing from the other direction (`developers.google.com/search/docs/appearance/structured-data/sd-policies`, read 2026-08-28):

> "Don't use structured data to deceive or mislead users. Don't impersonate any person or organization, or misrepresent your ownership, affiliation, or primary purpose."

> Do not mark up "content that is not visible to readers of the page."

Both apply. A credit or copyright line we invent is a misrepresentation of ownership, and there is no credit line visible beside any image on this site to mark up in the first place. **Omit.**

### The consequence

All four qualifying fields are omitted, so `contentUrl` is the only true statement left, and **an `ImageObject` carrying only `contentUrl` is not eligible for anything Google lists.** It would be strictly more bytes than the plain URL string already emitted, in exchange for nothing. **The correct implementation is to emit nothing, and that is what shipped.**

### Cases considered separately and still rejected

- **Brand logos (191).** `creditText: "BIC"` on the BIC logo is arguably true and unambiguous. Rejected: it is a machine-readable statement about a third party's trademark, published from our page, with no copyright string and no licence to accompany it, in exchange for a credit line on a logo nobody searches Google Images for. The risk is small but real and the value is zero.
- **Patrick's own `productPage` images (459).** He uploads them, but for a promotional products distributor those are realistically supplier photography of the same goods. Nothing records otherwise. Same answer as the catalog.
- **Blog images (1,430).** 792 of the inline ones were migrated from the old MPower site during the M4 blog work; provenance unknown for all of them.
- **Perfect Imprints' own marks (logo, OG card, placeholder).** These are the one class where creator, credit and copyright are all genuinely known. Rejected on value: the logo is already emitted as `Organization.logo`, adding a credit to it delivers nothing, and a Licensable badge on a company logo would be actively wrong.

---

## 5. Is a usage terms page needed?

**No, and one should not be built.** A usage terms page only has a job if `license` is emitted, and `license` is not emitted.

Recorded for completeness, because the question was asked: if Patrick ever did want one, it would have to state that the product photographs are supplied by the manufacturers of the products shown, that Perfect Imprints is an authorised Geiger distributor and uses them with permission to present those products, and that Perfect Imprints neither owns them nor can grant rights in them. **That wording is a business and legal decision for Patrick, not ours, and no wording has been invented or committed here.** Note that publishing such a page and pointing `license` at it would still produce the Licensable badge and therefore the enquiries he declined, so the recommendation stands: do not.

---

## 6. What the alternative would have cost

Measured against the real live HTML, so weight is on the record and cannot be used as a substitute reason. The counterfactual applied is the full upgrade: every `Product.image` string replaced by an `ImageObject` with `contentUrl`, `license`, `acquireLicensePage`, `creditText`, `copyrightNotice` and an Organization `creator`.

| Page | Items | ItemList JSON before → after | Per item | Document raw | gzip | brotli |
|---|---|---|---|---|---|---|
| `/new-products` | 60 | 32,207 → 49,607 B (+54.0%) | +290 B | 957,577 → 974,977 (+1.82%) | +187 B | +49 B |
| `/cat/water-bottles` | 60 | 30,952 → 48,352 B (+56.2%) | +290 B | 526,478 → 543,878 (+3.30%) | +187 B | −31 B |
| `/promotional-products` | 60 | 30,019 → 47,419 B (+58.0%) | +290 B | 493,387 → 510,787 (+3.53%) | +368 B | +76 B |
| `/rush-products` | 60 | 31,633 → 49,033 B (+55.0%) | +290 B | 478,188 → 495,588 (+3.64%) | +245 B | −13 B |

**The block would grow by more than half, and the page would barely notice**: the added text is near-identical on every item, so it compresses to under 0.4 KB gzip and occasionally to less than nothing in brotli. **Weight was not the constraint. Honesty was.**

**Actual cost of what shipped: zero bytes.** No page's markup changed.

---

## 7. Two real image findings, reported and deliberately not acted on

Both are outside this task's guardrail "do not change which image is chosen, its size, or its format". They are Ali's and Patrick's call.

### Finding 1: the structured-data image for Patrick's own products is 400px when 1200px exists

`largeSocialImage()` (`lib/seo/open-graph.ts`) upsizes `imgsirv.geiger.com` URLs to ~1200px and **passes every other host through unchanged**. Sanity-hosted products are normalised at `width(400).fit('max')` (`lib/sanity/queries/product-pages.ts:289` and `lib/sanity/queries/custom-products.ts:214`), so that 400px URL is what reaches the JSON-LD.

Measured on live `/new-products`, where all 60 products are Patrick's own `productPage` docs: **60 of 60 structured-data images are `?w=400`**, and the underlying assets are 1500x1500 and 1600x1600. Requesting `?w=1200` on the same asset returns a real 1200x1200 JPEG (101,169 B vs 15,989 B). Live `/cat/water-bottles` has one such item among 59 Geiger ones.

For contrast, the Geiger side is already correct: `?thumbnail=1200&w=1200&h=1200` returns the master image unresized (measured: 555x555 on five of six samples, 2000x2000 on the sixth, byte-identical to the no-parameter URL), because the host does not upscale. So the 1200 request means "give me the largest you have", which is right.

**Recommendation**: give `schemaImageUrl()` in `lib/seo/product-list-schema.ts` a Sanity branch that rewrites `w=` to 1200 for `cdn.sanity.io` URLs, exactly as `largeSocialImage` does for Geiger. One function, all ten surfaces, nothing rendered changes. Not done here because the guardrail forbids changing an image's size.

### Finding 2: blog posts and brand pages have no image entry in the sitemap

`app/sitemap.ts` attaches an image to category entries (M-SEO5) and to `/products/<slug>` entries, and to nothing else. 638 published blog posts have a header image and 191 brands have a logo; none of them appears in the image sitemap. This is sitemap work rather than structured data work and belongs in its own task.

---

## 8. What shipped

Two code files plus documentation. No markup change, no bytes added to any page.

1. **`lib/seo/image-metadata.test.ts`** (new, 16 cases). Records the decision as executable fact rather than prose. It asserts that the shared serializer emits `image` as a plain URL string; that `creditText`, `copyrightNotice` and `acquireLicensePage` appear in no source file under `app/`, `components/` or `lib/`; that no source file emits a schema.org `license` key; that `ImageObject` appears in exactly one place, the publisher logo, carrying only a `url`; that `/products/<slug>` still builds plain image URLs; and that **no Sanity schema defines an image provenance field**, the data fact the whole decision rests on, asserted rather than asserted-in-prose, so that adding one breaks this test and forces the decision to be revisited on purpose.

   **Proven to bite, not just to pass.** Injecting the full `ImageObject` upgrade into the serializer failed 8 of the 16 cases; adding a `creator` field to `blogPost` failed the provenance case. Both injections were reverted.

   **The source scan strips comments first**, and that detail is load-bearing. The serializer documents this decision by naming the very fields it refuses to emit, so a naive text scan flags its own reasoning. The scan therefore reads what a file EMITS, not what it says about what it does not, through a small string-aware scanner that is itself unit-tested so a `//` inside a URL cannot swallow the rest of a line and silently weaken the guard.

2. **`lib/seo/product-list-schema.ts`**, header comment only, under the existing "WHAT IS DELIBERATELY OMITTED" section, so the next person to read the serializer finds the reasoning where the field would go. No behaviour change.

3. **`CLAUDE.md`** section 11 (a new paragraph under the ItemList entry, beside the SNIP-100 to SNIP-160 record) and **`TASKS.md`** (the SNIP-170 entry). No Studio-facing change, so `perfect-imprints-sanity-guide.html` is deliberately untouched.

---

## 9. Verification

- `pnpm typecheck`: **clean**.
- Full suite: **28 files, 435 tests, all passing** (baseline 27 files / 419 tests, measured by removing the new file and re-running; 16 new cases).
- **The guard is proven to bite, not merely to pass.** Injecting the full `ImageObject` upgrade into the serializer failed 8 of the 16 cases; adding a `creator` field to `blogPost` failed the provenance case. Both injections were reverted and the suite re-run clean.
- **The emitted markup is provably unchanged.** The only non-test source edit is 14 lines inside an existing block comment. Beyond inspection: the serializer was run from `HEAD` and from the working tree over 400 real catalog products, and the output is **byte-identical, 232,258 B each**.
- **Google's own validator, from rendered production HTML, 0 errors and 0 warnings on all 16 pages**, covering the ten live product surfaces plus the product detail page and the blog listing:

| Page | Surface | Entities | Errors | Warnings |
|---|---|---|---|---|
| `/cat/water-bottles` | baked category | CollectionPage, ItemList(60), FAQPage, BreadcrumbList, WebSite | 0 | 0 |
| `/cat/tote-bags/page/2` | category pagination | same, ItemList(60) | 0 | 0 |
| `/cat/sunglasses` | customCategory | same, ItemList(54) | 0 | 0 |
| `/brands/bic` | brand page | ItemList(55), BreadcrumbList, WebSite | 0 | 0 |
| `/deals` | aggregator | ItemList(12), BreadcrumbList, WebSite | 0 | 0 |
| `/new-products` | aggregator | ItemList(60), BreadcrumbList, WebSite | 0 | 0 |
| `/rush-products` | aggregator | ItemList(60), BreadcrumbList, WebSite | 0 | 0 |
| `/promotional-products` | server-paginated catalog | ItemList(60), BreadcrumbList, WebSite | 0 | 0 |
| `/blog/20-best-experiential-tradeshow-giveaways` | blog body strips | BlogPosting, ItemList(48), BreadcrumbList, WebSite | 0 | 0 |
| `/blog` | blog listing | CollectionPage, ItemList(12), WebApplication, BreadcrumbList, WebSite | 0 | 0 |
| `/videos/custom-halloween-trick-or-treat-bags-for-your-business` | video strip | VideoObject, ItemList(4), BreadcrumbList, WebSite | 0 | 0 |
| `/custom-water-bottles-for-employee-wellness-programs` | page-builder strip | ItemList(8), FAQPage, BreadcrumbList, WebSite | 0 | 0 |
| `/custom-beach-towels-destin-fl` | landing page strip | Service, ItemList(8), FAQPage, BreadcrumbList, WebSite | 0 | 0 |
| `/` | home rails | Organization, ItemList(12), ItemList(12), WebSite | 0 | 0 |
| `/shop-by-theme/green-guide` | catalog landing preview | CollectionPage, ItemList(4), BreadcrumbList, WebSite | 0 | 0 |
| `/products/1785-illini` | product detail | Product, BreadcrumbList, WebSite | 0 | 0 |

- **Zero image metadata fields on any of the 16.** The one `ImageObject` present anywhere is the `BlogPosting` publisher logo on the blog post, which is the site's own mark and carries only `url`.
- **All 299 unique structured-data image URLs across six live surfaces resolve**: HTTP 200 with a real image, 242 WebP / 55 JPEG / 2 AVIF, all on Google's supported list.
- **Staticness.** 15 of the 16 pages carry no `BAILOUT_TO_CLIENT_SIDE_RENDERING` marker. `/` carries exactly one, and it is **pre-existing and unrelated to this work**: its fallback markup is `min-h-[420px] bg-brand-ink`, the deliberate `ssr:false` loading placeholder of `TestimonialsLazy` (M5-508 Part 8), scoped to that one below-the-fold carousel. The home page's `<h1>`, its 96 Geiger product images and both ItemLists are all present in the static HTML.
- **Page weight before and after: identical**, because no markup changed. The counterfactual cost of the alternative is measured in section 6.
- Zero em-dashes.
- **No Sanity document touched. No schema change, no Studio-facing change (so no guide update). No webhook, Filter, Projection, cache tag, env var or dependency change. Nothing became dynamic; nothing renders differently.**
