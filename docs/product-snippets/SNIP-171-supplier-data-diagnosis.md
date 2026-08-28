# SNIP-171: is there supplier data we can honestly credit? Diagnosis only

Date: 2026-08-28. **Diagnosis only. No code, schema, config, data file or Sanity document was changed. The only file written is this report.**

This re-opens SNIP-170 on two specific challenges. **One of them was right to be raised and the other turns out to change the reasoning without changing the answer.** Both are set out below with the evidence.

---

## Verdict up front

| Challenge | Verdict |
|---|---|
| **1. Supplier data may exist in the live API** | **Does not exist.** Geiger's Searchspring defines 17 facet fields site wide and none is supplier, vendor or manufacturer. A `filter.supplier=` query is silently ignored. The committed data discards 11 API fields and **not one of them carries provenance**. SNIP-170's conclusion holds, and is now proven against the live API rather than inferred from disk. |
| **2. Patrick's own product pages are entirely his** | **Half right, and the half that is wrong is the decisive half.** He owns the *upload*; the evidence says he does not own the *photograph*. Across all 463 images on his 153 published product pages, **zero** carry any signature of original photography, and 42% carry the document's own supplier item number in the filename. **SNIP-170 was too broad in its reasoning** (it said "unknown") and **correct in its conclusion** (it said "do not claim"). |
| **Net** | Nothing new can be emitted honestly. The reasoning is now much better evidenced, and one field is closer to possible than SNIP-170 implied. See section 7. |

---

## How this was verified, and exactly what was called

**Searchspring, 5 read only calls**, all GET, all with the pipeline's own User-Agent from `scripts/scrapers/geiger/config.py`:

1. `GET /api/search/category.json?siteId=kfx28d&resultsFormat=native&perPage=5&page=1` (returned 60 results regardless of perPage) - the global no-filter query the Phase B top-up uses. HTTP 200, 123,667 B.
2. `GET /api/search/category.json?siteId=kfx28d&bgfilter.category_path=Home > Writing Instruments > Pens&resultsFormat=native&perPage=60&page=1` - a real category query, which is what returns the `facets` array. HTTP 200, 121,768 B.
3. `GET /api/meta/meta.json?siteId=kfx28d` - the metadata endpoint listing every facet field the site defines. HTTP 200, 2,678 B.
4. Call 2 repeated **with `filter.supplier=hubpens` added**. HTTP 200, 121,768 B.
5. Call 2 repeated **unchanged**, as the control for call 4. HTTP 200, 121,768 B.

**No scrape workflow, catalog rebuild or write of any kind was triggered.**

**Sanity query API, 24 read only calls** (GROQ over the `production` dataset with the project's existing token). **No document was created, modified or deleted.**

**Google documentation**, fetched 2026-08-28 and quoted verbatim inline: the image metadata reference, the search gallery, and the structured data introduction.

**Repo files read** (production repo, no writes): `scripts/scrapers/geiger/config.py`, `products.py`, `memberships.py`, `data/pi-urls/category-urls.json`, `data/geiger/products.json`, `data/geiger/brands.json`, `data/geiger/facet-memberships.json`, and three baked category JSONs.

**Not verified**: whether any individual photograph was in fact taken by or commissioned by Perfect Imprints. Nothing in any system records it; section 5 explains what the filenames indicate instead, which is the strongest available evidence but is evidence, not a record.

---

## Part 1: supplier data in the live API

### 1.1 A complete product record, field by field

Every key on a full record from call 1, nothing summarised:

| Key | Type | Value (truncated) |
|---|---|---|
| `sku` | string | `505589` |
| `name` | string | `Javalina Executive Pen` |
| `description` | string | `A perennial customer favorite! Made of plastic...` |
| `low_price` | string | `0.45` |
| `high_price` | string | `0.53` |
| `msrp` | string | `0.53` |
| `price` | string | `0.45` |
| `min_qty` | string | `250` |
| `imageUrl` | string | `https://imgsirv.geiger.com/master/105589/web/105589_1.jpg?format=webp&amp;thumbnail=275...` |
| `thumbnailImageUrl` | string | identical to `imageUrl` |
| `url` | string | `/p/javalina-executive-pen-505589?pid=178844` |
| `item_link` | string | `javalina-executive-pen-505589` |
| `item_num` | array | `["505589"]` |
| `uid` | string | `178844` |
| `id` | string | `ff18afe9c572e782c84888f9e9dea6ae` |
| `category_path` | array | `["Home > Writing Instruments", "Home > Writing Instruments > Pens", ...]` |
| `ss_category_hierarchy` | array | `["Home>Shop By>Senior Citizens", "Home>Writing Instruments>Pens>Budget Pens", ...]` |
| `product_type_unigram` | string | `pen` |
| `intellisuggestData` | string | Searchspring click-tracking token |
| `intellisuggestSignature` | string | Searchspring click-tracking token |

Across 120 records from calls 1 and 2 the union is **26 keys**. The six not on the record above are `brand`, `badges`, `is_new_item`, `is_on_sale`, `low_reg_price`, `high_reg_price`, all partial.

**There is no supplier field. There is no vendor field. There is no manufacturer field. There is no field of any kind describing who produced the photograph.**

### 1.2 Coverage of the fields that do exist

Measured on the 60 records of the Pens category query (call 2):

| Field | Coverage |
|---|---|
| `sku`, `name`, `description`, `imageUrl`, `low_price`, `high_price`, `msrp`, `min_qty`, `url`, `category_path`, `ss_category_hierarchy`, `product_type_unigram`, `item_num`, `uid`, `id` | 60/60, **100%** |
| `badges` | 16/60, 27% |
| `is_new_item` | 16/60, 27% |
| `brand` | **10/60, 17%** |
| `is_on_sale` | 1/60 on the global query, 2% |
| `low_reg_price` / `high_reg_price` | 3/120, **2.5%** |

`brand` is the only attribution-shaped field in the entire response and it is present on a **minority** of records. It also describes the product's brand, not the photograph's author.

### 1.3 Every facet field the site defines

Call 3, the meta endpoint, returns the definitive list. **17 fields:**

`apparel_gender`, `apparel_sleeve_length`, `apparel_style`, `brand`, `category`, `colors`, `drinkware_size`, `full_color`, `is_new_item`, `low_price`, `material`, `min_qty`, `pen_style`, `production_time`, `refine_by`, `ss_category_hierarchy`, `usb_size`

**None is supplier, vendor, manufacturer, source, photographer, credit, copyright, creator or licence.** The Pens category query independently returned 12 facets, a subset of the same list.

### 1.4 Does a supplier filter work anyway?

Call 4 sent `filter.supplier=hubpens` on top of the Pens category query. Call 5 was the identical query without it.

| | totalResults | response bytes | filterSummary |
|---|---|---|---|
| With `filter.supplier=hubpens` | 465 | 121,768 | `[]` |
| Control, no filter | 465 | 121,768 | `[]` |

**Byte-for-byte identical. The filter is silently ignored** - not rejected with an error, simply not recognised. Searchspring reports no active filter in `filterSummary`.

This matters because `scripts/scrapers/geiger/memberships.py:47` contains `"supplier": "supplier"` in `FACET_FIELD_MAP`, and the comment above that map already anticipated it: *"PI facet types not in this map fall through to the verbatim slug... and may return zero results."* The supplier entry is an optimistic guess that has never resolved anything.

### 1.5 What the committed data discards

`normalize_product()` in `scripts/scrapers/geiger/products.py:137` keeps **15** of the 26 keys. The **11 discarded**:

| Discarded field | What it is | Provenance value |
|---|---|---|
| `id` | Searchspring internal document hash | none |
| `uid` | Geiger internal product id (the `pid=` in the URL) | none |
| `intellisuggestData` | Searchspring click-tracking token | none |
| `intellisuggestSignature` | Searchspring click-tracking token | none |
| `item_link` | URL slug fragment, already inside `url` | none |
| `item_num` | array form of the SKU | none |
| `price` | byte-for-byte alias of `low_price` | none |
| `thumbnailImageUrl` | byte-for-byte alias of `imageUrl` | none |
| `ss_category_hierarchy` | the hierarchy facet, a second view of `category_path` | none |
| `low_reg_price` | pre-sale regular price, 2.5% coverage | none |
| `high_reg_price` | pre-sale regular price, 2.5% coverage | none |

**The challenge was that the committed files might be a reduced projection of a richer response. They are a reduced projection, and the reduction discards nothing about provenance.** The only substantive loss is `low_reg_price`/`high_reg_price` on 2.5% of records, which is a pricing matter and not this task's.

### 1.6 Where the supplier facet pages actually get their data

This is the part worth reading, because the pages look like supplier pages and are not.

**The URLs are PI's own legacy URLs.** `data/pi-urls/category-urls.json` holds **4,875 URLs containing `/supplier/`**, all typed `facet`, across **164 distinct supplier slugs** (`rupt`, `sm`, `adline`, `ss`, `goldstar`, `pcna`, `hit`, `koozie`, `tran`, `srcg` and 154 more). These came from the old site's GA4 export and are preserved under the URL-preservation rule. They are not Geiger URLs and Geiger has no equivalent.

**Only 1 of the 164 slugs (`koozie`) matches any known Geiger brand slug** in `data/geiger/brands.json`.

**The products on those pages come from a keyword search, not from supplier data.** Since `filter.supplier` does nothing, these URLs came back with zero products from the main Phase C pass and were filled by the **Tier 2 search fallback** (`_process_search_fallback` and `_build_search_query`, `memberships.py:586` and `:571`), which deslugifies the URL tokens into a full-text query, calls Searchspring's search endpoint, and keeps SKUs whose category path starts with the PI root's Geiger path. **4,563 of 4,827 supplier URLs in `facet-memberships.json` have products this way (95%).**

**The result is demonstrably wrong attribution.** From `data/categories/pens__supplier__hubpens.json`, rendered at `/cat/pens/supplier/hubpens` under the H1 *"Custom Hubpens Pens for Bulk Orders"*:

- 298 SKUs; 34 (11%) carry a brand.
- Those brands are **BIC (10), Pilot (10), uni-ball (5), Paper Mate (4), Pentel (4), 3M Post-it (1)**.
- **Not one product is attributed to HubPens.** The second SKU on the page is `Bic® Round Stic® Pen`, brand `BIC`.

The same shape appears on `/cat/apparel/supplier/ss` (300 SKUs, showing Port Authority, Harriton and Nike items) and `/cat/drinkware/supplier/pcna` (299 SKUs). The 298-300 counts are the search fallback's own ceiling, 5 pages of 60.

**So the supplier slug in the URL describes neither the products on the page nor the photographs of them.** Treating it as a credit source would put "HubPens" on a photograph of a BIC pen.

---

## Part 2: Patrick's own images

### 2.1 Counts

All figures are **published documents only**, drafts excluded, from live GROQ queries on 2026-08-28.

| Where | Documents | Sanity-hosted image assets |
|---|---|---|
| `productPage` | **153** published, **153 (100%)** carry at least one image | **463** (325 in colour variants, 138 default), 388 unique filenames, mean 3.0 per document |
| `customProduct` | 1 published, 1 with an image | 1 |
| `blogPost` header images | 640 | 640, 591 unique |
| `blogPost` body inline images | - | 792 |
| `page` section images | 1 | 1 |
| `landingPage` hero images | 0 | 0 |
| `catalogPage` hero images | 0 | 0 |
| `customCategory` hero images | 1 | 1 |
| `brand` logos in Sanity | 193 of 207 brand docs | 193 |
| **`sanity.imageAsset` total in the dataset** | - | **2,290** |

**Two corrections to SNIP-170's figures**, both from counting per document rather than trusting a GROQ `math::sum` over an object projection, which silently under-reported:

- productPage images: SNIP-170 said 326 variant + 133 default = 459. **The accurate figure is 463** (325 + 138), across **153** published docs, not the 151 it reported.
- Brand logos: SNIP-170 described them as the 191 files on disk. **193 of the 207 brand documents also hold a Sanity image asset.** Same logos, second copy.

**Nothing anywhere records where an image came from.** Confirmed twice: no Sanity schema defines a photographer, creator, credit, copyright or licence field on any image (SNIP-170's structural test still asserts this), and **0 of the 463 productPage assets have Sanity's own `source` field populated**.

### 2.2 Are they actually his? The filename evidence

This is the question that decides Challenge 2, and the answer is legible in the assets themselves.

Across all **463** productPage image assets:

| Signal | Count | Share |
|---|---|---|
| Camera-style filenames (`IMG_`, `DSC_`, `DSCN`, `PXL_`, `_MG_`, `photo`, `Screenshot`) | **0** | **0%** |
| Filenames containing the document's own SKU | **195** | **42%** |
| Supplier-catalogue-style filenames (letter code + digits + separator) | 190 | 41% |
| Perfectly square images | 371 | 80% |
| Dimensions 1200x1200 or 1500x1500 | 69 of the 72 sampled | - |

**Not one of 463 images carries the filename signature of a photograph somebody took.** What they carry instead:

- **Supplier item codes with variant tokens**: `hat539ea-red-santa-light-up-cowboy-hat-bk-logo-2023.jpg`, `hat561ea_santa_cowboy_hat_white_trim_model.jpg`, `13FD12153_Tangerine_Imprint.jpg`, `89_13HF1215_PLAR_Silver-Reflective_51386.jpg`.
- **A supplier artwork template**: `12GB1216_4_SpookyBlackPumpkinsHalloweenBag_TEMPLATE.jpg`.
- **32-character uppercase hex hashes**, the export convention of a digital asset management system: `02C6D6C5119F5A0C3C04C1957C23DBB7.jpg` and dozens more.
- **Catalogue high-res suffixes**: `3Cubes_c690_americana_hr.jpg`.
- **Files re-saved through several systems**: `SLM160-TDSVU19-43550858-1.jpg`, `SDS152-47455272-jpg-jpg-(1).jpg`, and one with `-jpg` repeated eight times.
- **Uniform square dimensions** (80%), which is a catalogue standard. A camera or phone does not produce uniformly square 1200x1200 output.

**The 39 pages branded "Perfect Imprints" or "Exclusive" are not an exception.** They show the same pattern: `1785_01.default.avif`, `PLDS01W-160-GSM-Birdseye-Mesh-SamplesPLDS01W-1.jpg`, `SLMY160-TDSVU19-43550858-1-jpg-jpg...`, plus hex-hash DAM exports. **"Perfect Imprints" there is a private-label product brand, not a photography credit.** Only 54 of 153 (35%) carry any brand value at all; the distinct values are Perfect Imprints, BamBams, Bic, U Brands, Kolder Kaddy, Fan-ta-STICKS, Post-It and Exclusive.

**One blog header image is confirmed third-party licensed stock**: `adobestock_319427928_720.jpg`. That is a single concrete case where a Perfect Imprints copyright claim would be flatly false and where Adobe Stock's own licence governs the image. Blog images otherwise carry editorial names (`custom-thundersticks-creative.jpg`, `employee-appreciation-gifts.jpg`) with **1** camera-style name in 640 and **116** carrying the old MPower site's `_1200_1200_<hash>` thumbnail pattern, meaning they were migrated from the old site rather than created for this one.

### 2.3 What can and cannot be determined

**Can be determined**: he uploaded them; the files are overwhelmingly supplier catalogue assets by naming convention, dimensions and content-hash pattern; at least one blog image is licensed stock; nothing recorded anywhere states an author.

**Cannot be determined**: which specific supplier produced any given photograph, whether any individual image was in fact commissioned by Perfect Imprints, and what licence terms each supplier attached. Filename evidence is strong and consistent but it is inference, not a record. **Only Patrick can convert it into a record**, and only per image or per supplier.

---

## Part 3: what could be said honestly, by image group

Google's definitions, quoted from the reference (read 2026-08-28):

- `creator`: *"The creator of the image. This is usually the photographer, but it may be a company or organization (if appropriate)."*
- `creditText`: *"The name of the person and/or organization that is credited for the image when it's published."*
- `copyrightNotice`: *"The copyright notice for claiming the intellectual property for this photograph. This identifies the current owner of the copyright for the photograph."*
- `license`: *"A URL to a page that describes the license governing an image's use."*

### Group A: Geiger catalog photographs (about 9,600 images, `imgsirv.geiger.com`)

| Field | Verdict |
|---|---|
| `creditText` | **No.** The only attribution-shaped field is `brand`, present on 17% of records, and it names the product's brand, not the image's publisher-credit. The supplier slugs are legacy PI URL tokens, unverified against the products, and shown wrong in section 1.6. |
| `creator` | **No.** No candidate value exists at all. |
| `copyrightNotice` | **No.** Patrick has said these belong to the suppliers; naming Perfect Imprints would be a false ownership claim in tens of thousands of places. |
| `license` | **No.** See the conflict in section 3.1. |

### Group B: Patrick's productPage images (463 images, 153 pages)

| Field | Verdict |
|---|---|
| `creditText` | **Closest to possible of anything on the site, and still not available today.** He publishes these images, so a credit line is a defensible concept here in a way it is not for Group A. But the evidence says the photographs are supplier assets, so crediting "Perfect Imprints" would credit the wrong party, and the correct party is unknown per image. **If Patrick can name the supplier per product, or confirm per product that PI commissioned the photography, this becomes emittable.** That is a data-entry decision, not a code problem. |
| `creator` | **No, unless Patrick confirms per image.** Google's own wording is "usually the photographer". Zero of 463 filenames indicate PI-originated photography. |
| `copyrightNotice` | **No.** Google's wording is explicit: it "identifies the current owner of the copyright for the photograph". Uploading a supplier's file does not transfer copyright. |
| `license` | **No.** He may use these images; he cannot state terms in them for others. Plus section 3.1. |

### Group C: blog and page images (1,433 images)

All four **no**. Provenance is unknown, 116 headers were migrated from the old site, and at least one is Adobe Stock, whose licence is Adobe's to state and not ours.

### Group D: brand logos (191 on disk, 193 in Sanity)

`creditText` naming the brand is arguably true for a brand's own logo. Rejected on value and risk: it is a machine-readable statement about a third party's trademark, published from our page, with no copyright string and no licence beside it, for a credit line on a logo nobody image-searches. `creator`, `copyrightNotice`, `license`: **no**.

### Group E: Perfect Imprints' own marks (`logo.svg`, `og-default.png`, `placeholder-product.svg`)

**The one group where all four fields are genuinely known.** Rejected on value: the logo is already emitted as `Organization.logo`, a credit adds nothing, and a Licensable badge on a company logo would be actively wrong.

### 3.1 The `license` conflict, which is Patrick's to decide

**What the field does, sourced.** Google: *"providing licensing information can make the image eligible for the Licensable badge, which provides a link to the license and more detail on how someone can use the image"*, and *"you must include the `license` property for your image to be eligible to be shown with the Licensable badge."*

**So yes: emitting `license` is exactly what produces the badge, and the badge's stated function is to tell people how they can use the image and link them onward.** Patrick has said, verbatim, *"I don't want people approaching me about licensing images."*

**This is a conflict, and it is his call, not ours.** The trade off, stated plainly:

- **Emit `license`**: images become eligible for a Licensable badge in Google Images. That is the only route to the badge. It advertises the images as licensable and invites the enquiries he declined. It would also be inaccurate here, because he cannot grant rights in a supplier's photograph.
- **Do not emit it**: no badge, no enquiries, and no inaccurate claim. This is the current state and the recommendation.

There is no configuration that gives the badge without the invitation. Omitting `acquireLicensePage` removes the second link, not the badge.

---

## Part 4: what it is actually worth

**The benefit is display only.** Google's search gallery describes structured data as: *"Google uses structured data to understand the content on the page and show that content in a richer appearance in search results, which is called a rich result."* The structured data introduction frames rich results the same way: *"Adding structured data can enable search results that are more engaging to users and might encourage them to interact more with your website, which are called rich results."*

**No ranking effect is documented.** Neither the image metadata reference, the search gallery, nor the structured data introduction claims one. And the feature page states: *"Google does not guarantee that structured data or IPTC photo metadata will show up in search results."*

**The image metadata feature's entire output** is: a credit line and a Licensable badge shown inside Google Images.

### Would emitting on Patrick's 153 product pages alone be worth doing?

**Scale is not the objection.** 153 pages is a perfectly reasonable place to do careful work, and SNIP-170's implicit "it is only worth it at scale" framing was not the real argument.

**The objection is that the premise does not hold: the fields are not defensible on those 153 pages either.** Zero of 463 images show a signature of original photography, 42% carry the supplier's item number in the filename, and copyright does not transfer on upload. Emitting `creator` or `copyrightNotice` there would be the same false claim as anywhere else, just in fewer places.

**What it would be worth if the premise were fixed**: a credit line in Google Images on 153 product pages, no ranking effect, no guarantee of display, and no Licensable badge unless `license` is also emitted with the conflict in 3.1 attached. **That is a small return for a per-product data-entry exercise**, and Patrick should decide whether it is worth his time knowing the return is that modest.

---

## Part 5: where SNIP-170 holds and where it was too broad

**Holds, and is now better proven:**

- No supplier data exists. SNIP-170 inferred this from the committed files and the Sanity schemas. It is now confirmed against the live API, the meta endpoint and a direct filter test.
- `copyrightNotice` and `creator` cannot be claimed for any group except PI's own marks.
- The `license` conflict is real and unchanged.
- No usage-terms page is needed, because no `license` is emitted.

**Too broad, and worth correcting:**

1. **SNIP-170 treated all images identically. They are not identical.** Group B is a materially different case from Group A: Patrick publishes those images himself, on his own pages, with no supplier ambiguity about *who put them there*. That distinction was flattened and should not have been.
2. **SNIP-170 said provenance was "unknown". That was weaker than the truth.** It is not unknown, it is *strongly indicated*: the filenames, dimensions and hash patterns positively identify supplier catalogue assets. The stronger statement supports the same conclusion and should have been made.
3. **`creditText` on Group B is closer to possible than SNIP-170 implied.** It is blocked by a missing data point Patrick could supply, not by a rule of nature. SNIP-170 presented all four fields as equally impossible; they are not.
4. **Two counts were wrong**: 463 productPage images across 153 documents, not 459 across 151; and 193 brand logos exist in Sanity as well as the 191 on disk.
5. **The "160 pages is too few to matter" implication was the wrong argument** and is retracted. The right argument is that the fields are not true on those pages either.

---

## Part 6: what could be built, and what still cannot

**Can be built today: nothing.** No field is emittable on any group without either a false claim or the licensing conflict.

**Could be built if Patrick supplies one data point.** If he can state, per product page or per supplier, who should be credited for the photograph, then `creditText` on Group B becomes honest and emittable. That needs a new optional Sanity field on `productPage`, which is a schema change and therefore his decision, with the manual webhook Filter implications that carries. **Estimated return: a credit line in Google Images on up to 153 pages, no ranking effect, no guaranteed display.** He should weigh that against the data-entry cost before anyone builds the field.

**Still cannot be built, at any effort:**

- Anything on the ~9,600 Geiger catalog images. There is no supplier data to credit and the supplier URL slugs are provably wrong about their own products.
- `copyrightNotice` anywhere except PI's own marks. Uploading does not transfer copyright.
- `creator` anywhere it would name Perfect Imprints for a supplier's photograph.
- `license` anywhere, unless Patrick reverses his position on licensing enquiries **and** acquires the right to state terms in images he does not own. Both are required, not either.

---

## Part 7: decisions for Patrick

1. **Do you want to be credited on your product page images, and if so, as whom?** If the answer is "credit the supplier", we need the supplier name per product. If it is "credit Perfect Imprints", that is a claim about photographs the filenames say came from suppliers, and it needs to be one you are comfortable making. **Trade off: a credit line in Google Images on 153 pages, no ranking benefit, against a per-product data-entry job.**
2. **The Licensable badge.** It is the only thing `license` buys, and it exists to invite the licensing enquiries you said you did not want. **Trade off: visibility in Google Images against enquiries you have declined, on images you cannot license.** Recommendation: leave it off. Nothing is being lost that you wanted.
3. **The 4,875 supplier facet pages show products that are not from the supplier named in the URL and the H1.** That is outside this task and nothing was changed, but `/cat/pens/supplier/hubpens` heading "Custom Hubpens Pens" over ten BIC pens is worth knowing about independently of image metadata. Flagging it, not fixing it.
