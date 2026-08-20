# HIDE-000 — Why hidden SKUs still appear. Diagnosis.

**Date:** 2026-08-19
**Repo:** production (`pbnj53/perfectimprints`), branch `main`, HEAD `4604f4ae`
**Status:** diagnosis only. No code changed, no Sanity document changed, nothing deployed.

Every Sanity read below used the **GET query endpoint**, which cannot mutate. Live pages were
fetched with `curl` against `www.perfectimprints.com`.

---

## 1. Answer in one paragraph

Patrick is right that the products still show, and he is right to expect otherwise. But the cause
is more specific — and more fixable — than "hiding does not reach related products".

The page he named has **no hand-picked related products at all** (`relatedProducts` is `null`).
Its Related Products strip is generated automatically from `relatedCategorySlug`, which is set to
**`bags/theme/halloween`** — the exact category page where he hid those SKUs. The matcher reads
that category's **baked JSON file straight off disk** and never consults Sanity, so it rebuilds
its list from the pre-curation data and hands back the products he removed.

In other words: the product page is pulling from his curated category **while ignoring the
curation of that category**. The category page itself is correct; the strip is a second,
independent reader of the same category that skipped the filter.

---

## 2. Reproduction — what is actually true

### 2.1 Do the three SKUs appear on that page? Yes — and there is a fourth.

`GET https://www.perfectimprints.com/products/soft-loop-halloween-trick-or-treat-bags` -> HTTP 200.

The page has exactly **one** product grid, under the `<h2>Related Products</h2>` heading. It holds
8 cards. Tracing each back to `data/categories/bags__theme__halloween.json`:

| # | SKU | On the hide list? |
|---|---|---|
| 1 | `521794` | no |
| 2 | **`519423`** | **yes** |
| 3 | `506342 10B` | no |
| 4 | `514536 10A` | no |
| 5 | `514537 10A` | no |
| 6 | **`529488`** | **yes** |
| 7 | **`505998 60P`** | **yes** |
| 8 | **`501920 61G`** | **yes** |

**Correction to the report: it is four of eight, not three.** `501920 61G` is on the same hide
list as the three Patrick named and is also on the page. Half that strip is products he believes
he removed. (The fifth SKU on the halloween hide list, `517662 60A`, is not in the current baked
file, so it does not surface here.)

All 8 cards come from that category's baked list — no other source contributed. Verified in
`app/products/[slug]/page.tsx:241-251`.

### 2.2 Do they appear anywhere else on that page? No.

Related Products is the only product grid. The other sections are Related Videos, Related Blogs
and the CTA bar. The extra matches for each SKU in the raw HTML are the React server-component
payload restating the same cards, not a second visible placement.

### 2.3 Are they hidden from site search today? Yes — search works correctly.

`globalSettings.siteSearch.hiddenSkus` holds **7** SKUs, including all three he named plus
`501920 61G`. Live `/search` results:

| Query | Products returned | Exact SKU present as a card |
|---|---|---|
| `519423` | 21 | **no** |
| `529488` | 29 | **no** |
| `505998` | 7 | **no** |

Each result set contains only fuzzy neighbours (`519425`, `529428`, `505948`...). The raw HTML
does contain the query string — echoed in the heading, the search box and the canonical URL — so
a naive text count looks like a false positive. It is not. **Search hiding is behaving exactly as
designed.**

### 2.4 Are they hidden from their category pages? Yes.

`/cat/bags/theme/halloween` is owned by a published `customCategory` ("Custom Halloween Bags for
Bulk Orders", 16 hand-picked SKUs) with a `categoryOverride` on the same slug hiding 5.

- Live page renders **28** product cards. None of the four hidden SKUs appear anywhere in the HTML.
- `/api/category-products?slug=bags/theme/halloween` returns **28** products, none hidden.

Page and filter API agree, which is the invariant `mergeCategoryProducts` exists to guarantee.

`/cat/bags` also does not show them, but **that is not hiding** — that override has
`replaceProducts: true`, so the baked list is discarded entirely. Worth stating precisely, because
it looks like a hide and is not one.

### 2.5 One part of the description does not hold

Patrick said he hid the SKUs "from the category and from site search". Both are true. But the
implication that hiding is only failing on related products is too narrow — section 4 shows the
same gap on six other surfaces, and section 6 shows 36 further SKUs hidden from a category that
are still fully searchable, which is the same defect pointing the other way.

---

## 3. Where a SKU can be hidden — the six controls

| # | List | Studio location | Reaches | Does **not** reach | Applied |
|---|---|---|---|---|---|
| 1 | `categoryOverride.hiddenSkus` | Category Override -> *Hidden SKUs* | that **one** `/cat/<slug>` page + `/api/category-products` for it | every other surface, incl. other categories | render time, via `mergeCategoryProducts` |
| 2 | `globalSettings.siteSearch.hiddenSkus` | Global Settings -> *Site Search* | header autocomplete, `/search` grid + facets, "Also matching" | everything that is not search | read time |
| 3 | `dealsPage.hiddenDealSkus` | Global Settings -> *Deals Page* | `/deals` | home rails, everywhere else | render time |
| 4 | `newProductsPage.hiddenNewProductSkus` | Global Settings -> *New Products Page* | `/new-products` | **home page New rail**, everywhere else | render time |
| 5 | `rushProductsPage.hiddenRushSkus` | Global Settings -> *Rush Products Page* | `/rush-products` | **home page Rush rail**, everywhere else | render time |
| 6 | `catalogPage.hiddenSkus` | each Catalog Page | that one gated catalog page | everything else | render time |

Nothing is applied at build time — every list is read-time or render-time, so edits take effect on
publish without a redeploy. **That is the good news for any fix.**

Sources: `lib/search/hidden-skus.ts`, `lib/sanity/queries/category-overrides.ts:148-190`,
`lib/deals.ts:76`, `lib/new-products.ts:82`, `lib/rush-products.ts:77`, `lib/catalogs.ts:141`.

### Which list are Patrick's SKUs actually in?

All four are in **both** list 1 (via the `bags/theme/halloween` override) and list 2 (site search).
He used the two controls that exist and used them correctly. There is no third control that would
have covered the product page — **he did not miss a setting; the setting does not exist.**

---

## 4. Every surface that can show a Geiger product

Found by enumerating importers of `ProductCard` and every call site of `resolveProductsBySku`,
then reading each route. 16 surfaces:

| Surface | How products are chosen | Hiding applied today | Would hiding make sense? |
|---|---|---|---|
| `/cat/<slug>` (baked + owned) | baked SKUs + overrides | **yes** — list 1 | yes |
| `/api/category-products` | same merge | **yes** — list 1 | yes |
| **`/products/<slug>` Related Products** | auto match + manual picks | **no** | **yes — this is the report** |
| `ProductStrip` (pages, landing pages) | hand-picked SKUs | **no** | editor's call — section 5 |
| Blog body product strips | hand-picked SKUs | **no** | editor's call — section 5 |
| `/videos/<slug>` related products | hand-picked SKUs | **no** | editor's call — section 5 |
| `/deals` | weekly scrape | yes — list 3 | yes |
| `/new-products` | weekly scrape | yes — list 4 | yes |
| `/rush-products` | weekly scrape | yes — list 5 | yes |
| **Home New rail** | `getNewProducts(12)` | **no** | **yes — bug, 4.1** |
| **Home Rush rail** | `getRushProducts(12)` | **no** | **yes — bug, 4.1** |
| Gated catalog pages | synced + added, minus hidden | yes — list 6 | yes |
| `/brands/<slug>` | brand field on product | **no** | probably yes |
| `/promotional-products` | whole catalog | **no** | probably yes |
| Search (overlay, `/search`, "Also matching") | Fuse match | yes — list 2 | yes |
| Sitemap category images | first resolvable SKU | **no** | minor; a hidden product can still be a category's sitemap image |

### 4.1 A second, independent bug found on the way

`app/page.tsx:68-69` calls `getNewProducts(12)` / `getRushProducts(12)`. Both
(`lib/new-products.ts:166`, `lib/rush-products.ts:144`) call the augmented getter with empty
pins and **never call `applyHiddenSkus`**. So a SKU hidden from `/new-products` still appears in
the home page rail.

**No live impact today** — all three aggregator hide lists are currently empty — but the control
is silently inert and will mislead the first time Patrick uses it. Cheap to fix, independent of
everything else.

---

## 5. The conflict Patrick has to rule on — and it is already live

A site-wide hide would collide with SKUs he **deliberately placed**. This is not hypothetical:

| Hidden SKU | Also deliberately placed in | Would a global hide remove it? |
|---|---|---|
| `508673` | `sports-balls/activity/football` override -> **`addedSkus`** | yes |
| `508673` | 2 blog product strips — *Mini Footballs Buying Guide*, *Mini Footballs As A Simple School Fundraiser* | yes |
| `501920 61G` | video *Custom Mini Recycled Mesh Beach Bags for Beach Resorts* -> `relatedProducts` | yes |
| `501920 61G`, `505998 60P`, `519423`, `529488` | customCategory **`bags/theme/halloween`** -> `productSkus` | yes |
| `515615 33A` | customCategory **`beach-balls-inflatables`** -> `productSkus` | yes |

`508673` is the sharpest case: Patrick **hid it from `sports-balls/size/mini` and added it to
`sports-balls/activity/football`** — two opposite decisions about the same product, on purpose.
A blunt global hide would overrule him.

The halloween rows are subtler. Those four SKUs are in the customCategory's own `productSkus`
*and* hidden by the override on the same slug — hand-picked, then hidden, and the hide wins
(`mergeCategoryProducts` applies removal last). That is working correctly, but it means "is it in
`productSkus`?" is **not** a safe proxy for "Patrick wants this shown".

**Decision needed (D1):** when a SKU is globally hidden but hand-picked on a specific page, which
wins? My recommendation: **the explicit pick wins, the automatic match loses.** A hand-picked
product is a decision about one page; a hide list is a default. Reversing that would silently
strip 3 live documents today. This also matches how the category layer already behaves: added
products survive unless hidden *on that same page*.

---

## 6. Scale — how much is hidden today

| List | Entries |
|---|---|
| `siteSearch.hiddenSkus` | **7** |
| `categoryOverride.hiddenSkus` | **43** across 7 categories: `diner-restaurant-mugs` 20, `beach-towels` 13, `bags/theme/halloween` 5, `balloons` 2, `face-masks` 1, `koozies` 1, `sports-balls/size/mini` 1 |
| deals / new-products / rush / catalog | **0** (all empty) |
| **Union of all lists** | **43 distinct SKUs** |

Two facts that read Patrick's intent better than anything he said:

1. **Every one of the 7 search-hidden SKUs is also hidden from a category.** The search list is a
   strict subset. He has never once hidden something from search alone — search hiding is always a
   follow-up to a category hide. He is using two controls to express one intent: *get rid of this.*
2. **36 SKUs are hidden from a category but are still fully searchable.** The same gap, pointing
   the other way, and he has probably not noticed.

This is strong evidence that the per-surface model does not match how he works.

---

## 7. Options

### Option A — extend the existing search list to more surfaces

Rename it in Studio and apply it to related products, strips, brands, `/promotional-products`.

- **Cost:** small. Roughly one filter call per surface.
- **Breaks:** the field is documented and named as *search* visibility. Repurposing it silently
  changes what 7 existing entries do. Anyone who ever used it for search-only loses that.
- **Verdict:** cheapest, but it redefines a control Patrick already filled in. That is the exact
  "silently alters his existing lists" risk.

### Option B — a new, genuinely site-wide hide list (recommended)

Add a new `globalSettings.hiddenProducts.skus` meaning *never show this product anywhere it is
chosen automatically.* Existing lists keep their exact current meaning.

- **Cost:** moderate but low-risk. Applied at roughly 8 surfaces.
- **Breaks:** nothing. Every existing list keeps its meaning; the new list starts empty.
- **Migration:** offer Patrick a one-time copy of the 43 category-hidden SKUs into it — **as an
  explicit, reviewable step, never automatic**, because of the `508673` football case.
- **Verdict:** matches his mental model without rewriting decisions he already made.

### Option C — leave the lists separate, fix the labelling only

Reword each field so the reach is obvious, and fix the two clear bugs (product-page related
products, home rails).

- **Cost:** smallest.
- **Breaks:** nothing.
- **Verdict:** honest but leaves him maintaining 43 SKUs across 6 lists by hand. Not sufficient on
  its own — though the wording work is worth doing **regardless of which option is chosen**.

### Recommendation

**Option B, plus the labelling from Option C, plus the two standalone bug fixes.** Even under
Option B, the product-page related-products bug deserves its own fix first — see section 8.

---

## 8. The narrowest fix, which I would ship first either way

Independent of D1 and of Option B: **`matchRelatedProducts` should respect the category it is
pulling from.**

`lib/ai/related-products.ts:211-215` calls `getProductsForCategorySlug()`
(`lib/categories.ts:155-159`), a pure disk read of the baked JSON. When a caller passes a
`categorySlug`, the honest behaviour is to return what that category *actually shows* — i.e. to go
through `mergeCategoryProducts`, the one function both existing category paths already share.

That single change fixes Patrick's reported page **exactly**, with no new Sanity field, no new
concept, and no decision required from him — because he already curated that category and the
strip simply was not reading his curation.

**Caveat to verify before building:** `matchRelatedProducts` also runs inside the AI generation
routes, which are `force-dynamic`, and inside `/products/<slug>`, which is static. Routing it
through `mergeCategoryProducts` adds a Sanity read to the static route. That read is already
tag-cached (`cat:<slug>`), which is what keeps `/cat` static today, so it should be safe — **but
per CLAUDE.md section 13 this must be confirmed by curling the deployed page and checking the raw
HTML still contains the H1, the product `<img>` tags and the JSON-LD, not just that the build
shows the static marker.**

---

## 9. Feasibility notes

**Does a site-wide hide need a new data read?** No — and this is the important finding.
`app/layout.tsx:114` renders `<Footer />`, which calls `getSiteSettings()`
(`components/layout/Footer.tsx:60`). That function is React-`cache()`d for per-request dedup and
reads through the non-CDN `cachedClient` with `SETTINGS_TAG` and `revalidate: false`
(`lib/sanity/queries/global-settings.ts:31, 305`). **Every page on the site already loads this
document, once, on every render.** A hide list living there costs zero extra Sanity fetches and
cannot flip a static route dynamic — the same reasoning that let `CategoryCtaBar` ship.

**Is render-time hiding possible everywhere?** Yes. Nothing bakes a product list into the
deployment. `resolveProductsBySku` is synchronous and disk-only, so it cannot read Sanity itself —
the hidden set must be passed in from the async server component that calls it. Every call site
is already an async server component, except `ProductStrip` and `VideoRelatedProducts`, which are
synchronous server components whose SKUs are resolved by their parent page — so the filter belongs
in the parent, where the settings are already in hand.

**Does anything endanger a static route?** Only the section 8 caveat above.

---

## 10. What I need from Patrick

| | Question | My recommendation |
|---|---|---|
| **D1** | When a product is globally hidden but hand-picked on one page, which wins? | **The hand-picked entry wins.** Otherwise we silently strip 3 live documents, including a football he deliberately added to one category after hiding it from another. |
| **D2** | Should one "hide everywhere" list replace the per-surface lists, or sit alongside them? | **Alongside.** Replacing them would change what his 43 existing entries do. |
| **D3** | Copy the 43 existing category-hidden SKUs into the new global list? | **Offer it as a reviewable list he approves, not an automatic migration** — `508673` proves at least one is a deliberate per-page decision. |
| **D4** | Should hiding also cover `/brands/<slug>` and `/promotional-products`? | **Yes** — both are automatic catalog listings, the same class as search. |
| **D5** | Should a hidden product still be allowed as a category's sitemap image? | **No**, but low priority. |

Two things need no decision and can ship immediately: the **product-page related-products fix**
(section 8) and the **home-rail hide fix** (4.1).

---

## Appendix — verification log

| Claim | Evidence |
|---|---|
| 4 of 8 related cards are hidden SKUs | fetched live page; cards traced to `data/categories/bags__theme__halloween.json` |
| That page hand-picks nothing | Sanity: `productPage.relatedProducts` = `null`, `relatedCategorySlug` = `bags/theme/halloween` |
| Matcher ignores Sanity | `lib/ai/related-products.ts:211-215` -> `lib/categories.ts:155-159` |
| Search hides correctly | live `/search` for all 3 queries; exact SKU absent from every card list |
| Category hides correctly | live page 28 cards, 0 hidden; `/api/category-products` 28, 0 hidden |
| `/cat/bags` absence is `replaceProducts`, not hiding | Sanity `categoryOverride` for `bags` |
| Search list is a subset of category lists | set comparison over both; search minus category = empty |
| 36 hidden-from-category SKUs still searchable | same comparison, other direction |
| Home rails skip hides | `app/page.tsx:68-69`; `lib/new-products.ts:166`; `lib/rush-products.ts:144` |
| Settings already read on every page | `app/layout.tsx:114`, `components/layout/Footer.tsx:60`, `lib/sanity/queries/global-settings.ts:305` |
| Conflicting placements | GROQ over `blogPost.body`, `video.relatedProducts`, `customCategory.productSkus`, `categoryOverride.addedSkus` |

**Not verified:** whether `/brands/<slug>` and `/promotional-products` show these four SKUs in
practice — all four carry no `brand`, so brand pages cannot list them, and `/promotional-products`
paginates past them. The code path was read instead: neither applies any hide list.

**Concurrent work in the same working tree — read this before trusting `git status`.** Another
process was editing this repo while this diagnosis ran. At the start of the investigation two
files were modified and unstaged (`app/cat/[...slug]/page.tsx`,
`components/category/CustomCategoryView.tsx`). By the end, five files were modified **and staged**
— those two plus `CLAUDE.md`, `TASKS.md` and `lib/seo/product-list-schema.ts` — all with
modification timestamps a couple of minutes into this session. That is the SNIP-110 ItemList
schema work, unrelated to hiding, and **none of it was done by this task.** This diagnosis
created exactly one file, `docs/hide-000-hidden-sku-reach-diagnosis.md`, and changed nothing else.
Worth confirming that other task finished cleanly before acting on either.

**Unrelated observation:** there are two `categoryOverride` documents for `resistance-bands`,
which the duplicate guard is meant to prevent. Per CLAUDE.md, `getCategoryOverride` orders by
`_updatedAt desc` so the most recently edited one wins, but the second document is dead weight and
its edits will appear to do nothing. Worth a look; unrelated to this report.
