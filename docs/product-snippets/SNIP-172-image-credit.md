# SNIP-172: image metadata, using the credit that is actually true

Date: 2026-08-28. Follows SNIP-170 (the decision to emit nothing) and SNIP-171 (the diagnosis that re-tested it).

**Outcome in one line: every product photograph Geiger serves now carries a credit naming Geiger, and `creator`, `copyrightNotice` and `license` are still emitted nowhere on the site, on any surface, for any image.**

---

## 1. What changed, and what did not

SNIP-170 treated Google's four qualifying fields as one decision. They are not one decision, and separating them is the whole of this task.

| Field | What it asserts | Verdict | Why |
|---|---|---|---|
| `creator` | We made this image | **Never emitted** | Zero of the 463 images on Patrick's product pages carry a camera-style filename; the catalog records no photographer at all. Naming Perfect Imprints would claim a supplier's work. |
| `copyrightNotice` | We own this image | **Never emitted** | Patrick has said the images belong to the suppliers. On the Adobe Stock blog header it would additionally contradict a paid licence. |
| `license` | Here are the terms | **Never emitted** | It is the only trigger for Google's Licensable badge, whose documented purpose is to route viewers into licensing enquiries. Patrick declined those in as many words, and we cannot grant rights in a photograph we do not own. |
| `creditText` | This is who is credited when it is published | **Emitted, where a true credit exists** | Google's own definition is an attribution, not an ownership claim, and for Geiger-served images the credit is a fact the URL itself carries. |

Google requires `contentUrl` plus **at least one** of the four, so `creditText` alone makes the markup eligible. Quoted from the reference (`developers.google.com/search/docs/appearance/structured-data/image-license-metadata`, read 2026-08-28):

> "creditText: The name of the person and/or organization that is credited for the image when it's published."

> "If you're using structured data to specify an image, you must include the `license` property for your image to be eligible to be shown with the Licensable badge."

The second quote is the one that matters most here: **omitting `license` is what guarantees no badge and therefore no enquiries.** That is not a side effect, it is the design.

---

## 2. The credit, and why it is true

**Every product photograph on this site is served by Geiger, from Geiger's own image host.** Measured 2026-08-28 over every scraped record in all five catalog data files:

| File | Records | Images on `imgsirv.geiger.com` |
|---|---|---|
| `products.json` | 8,185 | 8,185 |
| `catalogs.json` | 1,043 | 1,043 |
| `new-products.json` | 289 | 289 |
| `rush-products.json` | 73 | 73 |
| `deals.json` | 12 | 12 |
| **Total** | **9,602** | **9,602 (100%)**, 8,186 unique URLs, **no second host anywhere** |

Perfect Imprints is an authorised Geiger distributor and hot-links those assets with permission (CLAUDE.md section 8). So "this image is credited to Geiger" says where the published asset comes from. It is checkable by anyone who reads the URL, and it claims neither authorship nor ownership.

**The credit is derived from the host, never from a stored field.** There is nothing for anyone to fill in, nothing to keep in step with anything else, and nothing that can quietly go stale. It also fails safe: an image from a host we have not verified silently gets no credit rather than inheriting a wrong one.

### What Google's example looks like, for shape

```json
{
  "@context": "https://schema.org/",
  "@type": "ImageObject",
  "contentUrl": "https://example.com/photos/1x1/black-labrador-puppy.jpg",
  "creditText": "Labrador PhotoLab",
  "license": "https://example.com/license"
}
```

A bare organisation name is the documented shape, which is why the credit is `"Geiger"` and not a sentence. The `license` line in Google's example is exactly the line this site does not emit.

### What is actually emitted

Before, on every product surface:

```json
"image": "https://imgsirv.geiger.com/master/101032/web/101032_1.jpg?format=webp&thumbnail=1200&w=1200&h=1200"
```

After, for a Geiger-served image only:

```json
"image": {
  "@type": "ImageObject",
  "contentUrl": "https://imgsirv.geiger.com/master/101032/web/101032_1.jpg?format=webp&thumbnail=1200&w=1200&h=1200",
  "creditText": "Geiger"
}
```

Google confirms `image` accepts this shape directly. From the merchant listing reference, read 2026-08-28: **"Type: Repeated `ImageObject` or `URL`"**. And `contentUrl` is the join key, so nesting is the intended use: *"Google uses `contentUrl` to determine which image the photo metadata applies to."*

The URL itself is byte-for-byte the one that was emitted before. Nothing about which image is chosen, its size or its format changed.

---

## 3. Crediting the brand was the obvious idea, and the data says no

The proposal put to this task was: credit the brand where a product has one, and the source where it does not. **The second half holds. The first half does not, and the reason is in the data rather than in principle.**

`brand` is present on **1,569 of 9,602 records (16.3%)** across **210 distinct values**. It describes the brand of the **product**, not the source of the **photograph**, and reading it as a credit line breaks in four ways that are visible in the values themselves:

- **It would credit a company that does not exist.** `Oakely` appears on 2 records, alongside `Oakley` on 4. A machine-readable credit naming "Oakely" is simply false.
- **It would credit a firm that made neither the product nor the picture.** `MAGSAFE` is an Apple trademark for a magnetic attachment standard; the item is a charger from some other maker.
- **It would credit one organisation under two names.** KOOZIE/Koozie, OGIO/Ogio, YETI/Yeti, JanSport/Jansport, ShedRain/Shedrain, RocketBook/Rocketbook, Fill It Forward/Fill IT Forward, plus `Otter Box`, `Port & Co` and `Travis & Wells` in non-canonical forms.
- **Some values are product lines, not organisations at all**: `Souvenir`, `AWARE`, `FOAM`, `Hip`, `Reach`, `Wink`.

And structurally, even where the value is a clean brand name, it answers a different question. The brand of the product is already emitted, correctly, as `Product.brand`. Google separates `brand` from image credit precisely because they are not the same claim.

**A single host-derived credit is both truer and consistent.** It says the same thing about every image from the same source, which is what a credit line is for.

---

## 4. What gets no credit, and why that is the rule working

Anything not served by Geiger keeps the plain URL string it has always had.

| Image source | Count | Credited | Why |
|---|---|---|---|
| Geiger catalogue photos | 9,602 records, 8,186 unique URLs | **Yes, "Geiger"** | Served by Geiger, verifiable from the URL |
| Patrick's own `productPage` uploads | 463 images on 153 published pages | No | He owns the upload, not the photograph |
| `customProduct` image | 1 published | No | Same |
| Blog header images | 640 | No | Provenance unknown; 116 migrated from the old MPower site |
| Blog inline images | 792 | No | Same |
| Page, landing and catalog section images | small | No | Same |
| Brand logos | 191 on disk, 193 in Sanity | No | Not present in any JSON-LD at all, so there is nothing to attach metadata to |
| Video thumbnails | YouTube-hosted | No | Third-party platform asset |
| Perfect Imprints' own marks | logo, OG card, placeholder | No | Already emitted as `Organization.logo`; a credit on your own logo adds nothing |

**Patrick's own uploads are the case worth being explicit about, because they look like the one place a credit would be easy.** SNIP-171 established that they are supplier catalogue assets rather than his own photography: of 463 images, **zero** carry a camera-style filename (`IMG_`, `DSC_`, `PXL_`, `Screenshot`), **42% carry the document's own supplier item number in the filename**, 41% follow a supplier catalogue naming convention, and 80% are perfectly square, which is a catalogue standard and not what a camera produces. Crediting "Perfect Imprints" would credit the wrong party, and the right party is unknown per image.

**Nothing in Sanity records it either, and that was re-verified rather than assumed.** A read-only query over **all 2,290 `sanity.imageAsset` documents** in the production dataset on 2026-08-28: **0 have a `source` object and 0 have a `creditLine`.** The 1,814 that carry a `title` carry a migration label ("Blog inline custom-basketballs"), not a credit.

### The excluded images, named

**`adobestock_319427928_720.jpg`** is the header image of `/blog/reason-to-consider-work-at-home-earbuds`, and it reaches structured data as `BlogPosting.image`. It is licensed stock: the terms are Adobe's to state and the credit is Adobe's contributor's, neither of which this site knows. A read-only scan of all 2,290 Sanity image assets for the filename signatures of eighteen stock libraries (Adobe Stock, Shutterstock, iStock, Getty, Depositphotos, Dreamstime, 123RF, Alamy, Pexels, Unsplash, Freepik, Vecteezy, Bigstock, Canstock, Envato and generic `stock-photo` forms) returned **exactly one match**, that file.

**It is excluded by the host rule rather than by a special case**, which is the safest way for an exclusion to work: nobody has to remember it, and the next stock image someone uploads is excluded on the same day it is uploaded. Verified on the rendered page: 0 credits emitted.

---

## 5. Where the change lives

**One rule, one module, one call site.** `lib/seo/image-credit.ts` decides the credit; `lib/seo/product-list-schema.ts` is the only file that imports it, at the single point where the serializer already built its image URL. Every one of the ten live product surfaces routes through that serializer, so they all gained the credit together and none of them grew image handling of its own. A test asserts that the module has exactly one importer, so it cannot quietly acquire a second.

The host check parses the URL rather than matching a substring, so `https://evil.test/?x=imgsirv.geiger.com`, `https://imgsirv.geiger.com.evil.test/x.jpg` and `https://imgsirv.geiger.com@evil.test/x.jpg` are all correctly not Geiger. Any host under `geiger.com` counts, not just the `imgsirv` one every catalog record uses today, because the affiliate host is equally Geiger-served.

### Considered and deliberately not done

- **`CollectionPage.image`** on `/cat/<slug>` and `/shop-by-theme/<slug>` is emitted by a different generator and stays a plain string. It is not an oversight: measured on all four live pages that emit one, **the CollectionPage image URL is always identical to one of the Product images in the ItemList on the same page**, and Google joins image metadata by `contentUrl`. The credit for that exact image is therefore already in the same document, and a second copy would add bytes and say nothing new.
- **`/products/<slug>`** builds its own image array (FIX-830). Every image on it is a Sanity upload, so there is no credit to add, and it keeps returning plain URLs.
- **`VideoObject.thumbnailUrl`** and **`Organization.logo`** are untouched for the reasons in the table above.

---

## 6. What it cost

Measured against the real live HTML of every surface, with **both** JSON-LD copies counted (the `<script>` tag and the RSC flight payload), by applying the exact transform the code applies.

**59 bytes per credited item in the script tag, 69 in the flight payload (escaping inflates it), so 128 bytes per item on the page.**

| Page | Credited items | Raw before | Raw after | Raw delta | gzip delta | brotli delta |
|---|---|---|---|---|---|---|
| `/cat/water-bottles` | 59 | 526,478 | 534,030 | **+7,552 (+1.43%)** | +181 | +90 |
| `/cat/tote-bags/page/2` | 60 | 496,552 | 504,232 | +7,680 (+1.55%) | +214 | +177 |
| `/promotional-products` | 60 | 493,430 | 501,110 | +7,680 (+1.56%) | +318 | +16 |
| `/rush-products` | 60 | 478,188 | 485,868 | +7,680 (+1.61%) | +221 | +21 |
| `/brands/bic` | 55 | 468,065 | 475,105 | +7,040 (+1.50%) | +240 | +46 |
| `/cat/sunglasses` | 54 | 498,581 | 505,493 | +6,912 (+1.39%) | +390 | +134 |
| `/blog/20-best-experiential-tradeshow-giveaways` | 47 | 581,096 | 587,112 | +6,016 (+1.04%) | +332 | -44 |
| `/` (two home rails) | 24 | 358,752 | 361,824 | +3,072 (+0.86%) | +73 | +90 |
| `/deals` | 12 | 267,623 | 269,159 | +1,536 (+0.57%) | +116 | +60 |
| `/custom-beach-towels-destin-fl` | 8 | 259,657 | 260,681 | +1,024 (+0.39%) | +70 | +44 |
| `/custom-water-bottles-for-employee-wellness-programs` | 8 | 255,920 | 256,944 | +1,024 (+0.40%) | +69 | +58 |
| `/shop-by-theme/green-guide` | 4 | 257,547 | 258,059 | +512 (+0.20%) | +67 | +62 |
| `/new-products` | **0** | 959,729 | 959,729 | **0** | 0 | 0 |
| `/products/1785-illini` | **0** | 275,640 | 275,640 | **0** | 0 | 0 |
| `/videos/custom-halloween-...` | **0** | 244,809 | 244,809 | **0** | 0 | 0 |
| `/blog` | **0** | 258,056 | 258,056 | **0** | 0 | 0 |
| `/blog/reason-to-consider-work-at-home-earbuds` | **0** | 279,482 | 279,482 | **0** | 0 | 0 |

**On the wire this is under 0.4 KB per page**, because the added text is identical on every item and compresses to almost nothing. That is consistent with SNIP-170's measurement of the full five-field alternative (about 290 bytes per item raw, under 0.4 KB gzip); this credit is a fifth of that per item.

**The five pages costing zero are the proof the rule is doing what it says.** `/new-products` renders 60 of Patrick's own product pages and gains nothing. `/products/1785-illini` and the video strip are all Sanity uploads. `/blog/reason-to-consider-work-at-home-earbuds` is the Adobe Stock page.

**Weight was never the reason for any decision here, in either direction, and must not be offered as one.** The reason is honesty.

---

## 7. Verification

- **`pnpm typecheck`: clean.**
- **Full suite: 28 files, 459 tests, all passing** (baseline 28 files / 435 tests; 24 net new cases in the rewritten guard).
- **Google's own validator, from rendered HTML, on every surface: 0 errors, 0 warnings.** The 17 pages cover all ten product surfaces plus the product detail page, both blog listing shapes, a blog post with strips, the Adobe Stock blog post, the video strip, the page-builder strip, the landing strip, the home rails and the catalog landing preview.
- **`creator`, `copyrightNotice`, `license`, `acquireLicensePage` and `Licensable` appear on no page.** Swept **3,126 live URLs**: **every one of the 2,221 non-facet URLs in the sitemap** (all 465 category roots, all 576 modifiers, both compound facets, all 652 blog posts, all 39 blog categories, all 206 brands, all 94 videos, all 150 product pages, all services, static, landing and shop-by-theme pages, and the home page), plus **900 of the 21,139 `/cat` facet URLs** spread evenly, plus 4 pagination and filter variants that are not in the sitemap. **0 pages containing any of the five needles.** One URL failed with a transient network error and returned HTTP 200 clean on retry; every other response was 200. **The facet tail is sampled rather than swept in full, deliberately**: those 21,139 pages are on-demand SSG, so fetching all of them would warm roughly 17,000 cold pages and bill Vercel for it, which is exactly the drain the project's capped warmup exists to avoid. Everything that is prebuilt or ISR-cached, and therefore free to fetch, was swept in full. The same sweep over the reconstructed post-change HTML of all 17 surfaces: **0 occurrences of any of them**, and the credit present on exactly the pages expected.
- **Staticness unchanged.** One CSR bailout marker exists across all 3,126 live pages, on `/`, and it is pre-existing and unrelated: the `ssr:false` loading placeholder of `TestimonialsLazy` (M5-508 Part 8), documented in SNIP-170. The change adds no read, no `searchParams` and no uncached fetch, and the serializer is still a pure function.
- **The guard is proven to bite, not merely to pass.** Four violations were injected and each was caught, then reverted: adding `license` to the credited ImageObject (5 failures), crediting Sanity-hosted images as "Perfect Imprints" (14), emitting `copyrightNotice` from the serializer (4), and adding a `creditText` field to a Sanity schema (1). The suite was re-run clean after each.
- **No Sanity document was created, modified or deleted.** All Sanity access was read-only GROQ. No schema change, no Studio-facing change, no webhook, Filter, Projection, cache tag, env var or dependency change. Nothing renders differently and nothing became dynamic.

---

## 8. The one policy line with any tension, stated rather than hidden

Google's structured data policies include:

> "Don't mark up content that is not visible to readers of the page."

No credit line is printed beside any image on this site. That line is worth naming rather than ignoring, and here is why it does not apply:

**Google's own equally-valid route for this exact feature is invisible by construction.** From the image metadata reference: *"There are two ways that you can add photo metadata to your image. You only need to provide Google with one form of information... [Structured data] or [IPTC photo metadata: IPTC photo metadata is embedded into the image itself]."* Metadata embedded inside a JPEG is not visible to a reader of the page, so the visibility rule cannot mean "print the credit on the page" for image credit metadata, or the feature's second documented mechanism would contradict its own policy. The entity being described, the image, **is** on the page.

The judgement call is stated so it can be reversed in one line if Patrick or Google ever disagrees: deleting the `creditText` from `lib/seo/image-credit.ts` returns every surface to plain URL strings.

---

## 9. For Patrick

1. **Nothing is being claimed that is not true.** The site now says "credited to Geiger" on product photographs Geiger serves. It does not say Perfect Imprints took them, does not say Perfect Imprints owns them, and does not offer them for licence.
2. **No Licensable badge, and no licensing enquiries.** That was the thing you declined, and the field that produces it is not emitted. This is enforced by a test, not by intention.
3. **Your own product page images carry no credit**, because the evidence says the photographs came from suppliers, and crediting Perfect Imprints for a supplier's photograph is the one thing worth avoiding. **If you can tell us who should be credited on those** (per product, or per supplier), that is the one missing fact, and the rule is written so it can be extended to read it. It is your call whether the return is worth the data entry: a credit line in Google Images on 153 pages, no ranking benefit, and no guarantee Google shows it.
4. **Two findings from SNIP-170 are still open and still yours to decide**, both outside this task's remit: the structured-data image for your own products is requested at 400px when 1200px versions exist, and blog posts and brand pages carry no image entry in the sitemap.
