# AUTO-202: header images and the fields the engine never filled, the proof run

Measured 2026-10-05 against the production repo's data and the live Sanity dataset. **Three real blog generations were used (the ticket's maximum) and six images (of the fifteen allowed): one text-only probe of the image model, one image per draft, one comparison on the cheaper lite model, and one regenerate on the second draft after a rule change.** Every draft, every uploaded image asset and the day's image counter document were deleted at the end and the deletion verified (`count(*[_id == $id])` = 0 for each). The images are saved outside the repos at `C:\Users\aliha\Documents\perfectimprints-archive\auto-202-images\`.

## 1. Cost, measured

| call | model | prompt tokens | image tokens | time | USD |
| --- | --- | --- | --- | --- | --- |
| probe, text only (plain water bottles) | gemini-3.1-flash-image | 62 | 1,120 | 9.7 s | 0.067 |
| draft 1, custom coolers, 4 reference photos | gemini-3.1-flash-image | 1,402 | 1,120 | 15.1 s | 0.068 |
| draft 2, custom pedometers, 4 reference photos | gemini-3.1-flash-image | 1,385 | 1,120 | 13.7 s | 0.068 |
| draft 3, foam footballs, 2 reference photos | gemini-3.1-flash-image | 873 | 1,120 | 11.0 s | 0.068 |
| comparison, draft 1's prompt and photos | gemini-3.1-flash-lite-image | 4,850 | 1,120 | 7.2 s | 0.035 |
| regenerate, draft 2 with the topic-word rule | gemini-3.1-flash-image | 1,397 | 2,240 | 21.0 s | 0.135 |

Prices from https://ai.google.dev/gemini-api/docs/pricing (page dated 2026-10-01): flash-image USD 0.50 per million input tokens and USD 60 per million image output tokens ("$0.067 per 1K image"); lite-image USD 0.25 and USD 30 ("$0.0336 per 1K resolution image", 1K only). A 1K 16:9 picture is 1,376 x 768 and 1,120 image tokens on both. The two models count reference photos differently (flash about 258 tokens a photo, lite 1,120), which is why the lite request's prompt is larger; the input side is under a fifth of a cent either way. **One anomaly:** the regenerate call was billed 2,240 image tokens for one 1,376 x 768 picture, twice every other call; the response carried one image part. So the per-picture cost is usually 6.7 cents and can be 13.4. The vision check that reads every picture back runs on `gemini-3.5-flash-lite` (PORT-171 measured about 1,900 prompt tokens for a 1,024 px photo, about a tenth of a cent).

**Images used in this session: 6. Spend: about USD 0.44 on images, plus three DeepSeek posts at about half a cent each.** At two posts a day with no retries: 730 pictures, about USD 49 a year on flash-image (USD 25 on lite-image). The cap of 20 pictures a day bounds a runaway day at about USD 1.40.

Deprecations page (https://ai.google.dev/gemini-api/docs/deprecations): `gemini-3.1-flash-image` and `gemini-3-pro-image` released 2026-05-28, "No shutdown date announced"; `gemini-2.5-flash-image` "October 2, 2026" (already gone); the three preview image models have passed their dates; `gemini-3.1-flash-lite-image` is not on the page. The models page lists all three current image models as Stable.

## 2. The three drafts

List template, 1,500-word target, the panel's defaults, Global Settings untouched (so: source AI, library empty, no default author, no default categories).

| topic | ranking page | title | words | time | author | related slugs | categories | image |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| custom coolers | /cat/coolers | 9 Creative Ways to Use Custom Coolers for Business Giveaways and Events | 2,232 | 91.7 s | Patrick Black | coolers | none (setting blank) | AI, 15.1 s, passed the check |
| custom pedometers | /cat/pedometers | 9 Creative Ways to Use Custom Pedometers for Corporate Wellness and Beyond | 2,554 | 91.4 s | Patrick Black | pedometers | none | AI, 13.7 s, passed the check |
| foam footballs | /videos/promotional-foam-mini-footballs-brand-interaction | 9 Foam Footballs Promotional Ideas for Bulk Orders and Branded Giveaways | 1,990 | 66.7 s | Patrick Black | none (the topic ranks with a video) | none | AI, 11.0 s, passed the check |

Every draft was created complete in one write; the notes on each said exactly what was left empty and why ("no categories: Global Settings names no default categories"; for the third, "no related category slug: the topic does not rank with a category page"). The strips: coolers 9 strips / 36 SKUs, all coolers; pedometers 7 strips / 24 SKUs, the first four clips (see 3.2); foam footballs 1 strip / 3 entries (two foam footballs and one Product Page reference).

### 2.1 The pictures, honestly

- **Coolers (publishable):** four cooler bags on a picnic table in a park, a grey soft cooler, a blue cylinder cooler, a black cooler with cup holders, a green and black backpack cooler, matching the four reference products (Coleman 9-Can Soft-Sided Cooler, Cooler Caddy Jr, Hard Top Cooler, Backpack Cooler) in shape and colour; blank, no text, no logo, people out of focus behind. The lite-model picture of the same prompt is the same four coolers on an office counter, equally clean, a little flatter.
- **Pedometers, first picture (clean but wrong product):** a desk scene with a house-shaped blue clip, two triangle clips, an oval clip and two red magnet clips, no text, no logo, the laptop behind blank. The model drew exactly what it was given, and what it was given was clips, because the post's first strips were clips (section 3.2). The no-text and no-logo rules held; the "only the referenced products" rule held; the references were the fault.
- **Pedometers, regenerated after the rule change (publishable):** three pedometers on a desk, a blue clip pedometer, a green one with a display, a purple wristband tracker, plus a boxed one; no text on the displays beyond blank screens, no logo, the laptop blank.
- **Foam footballs (publishable):** brown foam footballs on a tray and red-and-white two-tone foam footballs on a conference table, no text, no logo, people out of focus.
- **The text-only probe:** five plain bottles on a desk, perfect, and an Apple mark on the laptop behind them. That picture is why the prompt names laptops, phones, cups and clothing explicitly and why every picture is read back for logos.

The check (`gemini-3.5-flash-lite` reading each picture for readable text and logos) passed all five chain pictures on the first attempt; no retry was spent.

## 3. What the run taught, and what changed because of it

### 3.1 The prompt's three rules held on every chain picture

No text, no logo (including on background devices), nothing beyond the references. The probe, made BEFORE the prompt named background devices, drew the Apple mark; none of the five pictures made with the shipped prompt did. The check is the second line, and it never had to fire.

### 3.2 A reference must carry a topic word (added mid-run)

The pedometers post's first four strip products were "Ad Clip", "Oval Clip", "House Clip" and "Power Clip": the FIX-900 drift class the matcher still has (its category branch resolved "clip" ideas to a clips page). Sent as "the actual products the post recommends", they produced a faithful picture of clips. The fix is in `pickReferenceProducts(products, max, topic)`: a strip product is a reference only when its name carries one of the topic's product words (the topic's words minus promo words and filler, stemmed by a trailing s, so "custom pedometers" gives `pedometer`); with none left, the prompt describes the item the title names instead and the outcome notes say so. On the real pedometers draft the rule skipped the clips and picked the four pedometer-named products further down its strips, and the regenerated picture is pedometers. On the coolers and footballs drafts the rule changes nothing (every reference carries "cooler" or "football"). This does not fix the strips themselves; that is FIX-900's remaining half.

### 3.3 The relatedCategorySlugs signal, re-measured on the live pool

`tmp/auto-202/measure-ranking-root.ts` (deleted after the run) built the same uncached pool the route builds: 4,386 topics, 2,215 usable. **1,354 usable topics (61.1%) rank with a `/cat/` page; every one of the 1,354 yields a value that passes `relatedCategorySlugProblem`; 1,346 name one of the 465 generated roots** (the eight that do not: local-custom-socks, infusers, sewing-kits, ponchos, rolling-papers, colanders-strainers, pages the picker would not offer, dropped). 262 distinct roots, the top ones sports-balls 48, water-bottles 42, coolers 38, balloons 34, pens 30. A read of 50 sampled rows (the ten biggest and every fortieth after) found every root right for its search: "promotional footballs" at /cat/sports-balls/size/mini gives sports-balls, "imprinted bike bottles" at /cat/water-bottles/activity/biking gives water-bottles, "contractor calendars" at /cat/calendars/industry/contractor gives calendars, "custom poms with tokens" at /cat/pom-poms/search/ gives pom-poms. AUTO-200's 1,234 of 2,233 is the same signal on an earlier day's pool. The other 39% rank with videos, product pages, the home page, /rush-products, /industry/ pages or /brands/: those get nothing, by design.

### 3.4 The author

653 of 661 published posts carry an author. "Patrick Black" (`author-patrick-black`) is on 287 of them and on 13 of the 13 AI-generated posts that have one (the other three were published with none); a second "Patrick Black" document (`094ce285-...`) is on 7, "Perfect Imprints" on 134, Sarah Garcia 70, Laiba Siddiqui 56. So the default is `author-patrick-black`, overridable in Global Settings, written only when the document exists.

### 3.5 The categories: no honest rule, measured

587 of 661 published posts have a category; 579 have exactly one, 8 have two. Promotional Product Ideas holds 274 of the 587; then beach-promotional-items 38, marketing 36, school-spirit-items 36, christmas 35, sports-and-outdoor 27, awareness 23, food-promotional-items 16, halloween 15, seasonal-and-holiday 15, medical 14, custom-apparel 13, technology 13 (a document whose id says drinkware), office-and-desktop 11; 16 of the 39 categories hold nothing. A title-word rule for thirteen theme categories, measured against Patrick's own assignments:

| category | his posts | rule predicts | right | precision | recall |
| --- | --- | --- | --- | --- | --- |
| halloween | 15 | 19 | 15 | 79% | 100% |
| beach-promotional-items | 38 | 41 | 29 | 71% | 76% |
| christmas | 35 | 43 | 29 | 67% | 83% |
| food-promotional-items | 16 | 6 | 4 | 67% | 25% |
| custom-apparel | 13 | 26 | 11 | 42% | 85% |
| school-spirit-items | 36 | 32 | 13 | 41% | 36% |
| awareness | 23 | 15 | 5 | 33% | 22% |
| medical | 14 | 26 | 8 | 31% | 57% |
| office-and-desktop | 11 | 13 | 4 | 31% | 36% |
| sports-and-outdoor | 27 | 47 | 12 | 26% | 44% |
| seasonal-and-holiday | 15 | 22 | 3 | 14% | 20% |
| marketing | 36 | 46 | 5 | 11% | 14% |
| technology | 13 | 15 | 1 | 7% | 8% |

The misses are not fixable by better words: he files "10 Ideas for Using Halloween Trick or Treat Bags" under Promotional Product Ideas, "Church Christmas Ornaments: A Youth Group Fundraiser" under christmas and not school spirit, "Top 5 Appreciation Gifts For Healthcare Workers" under ideas and not medical. Of 102 numbered-list titles, 56 sit in Promotional Product Ideas and the rest across 16 categories. A root-slug to category map exists for a handful of roots (school-spirit to school-spirit-items 97% of 36, outdoor to sports-and-outdoor 100% of 27, apparel to custom-apparel 92% of 13, ornaments to christmas 78% of 23) but covers few topics and still files the rest by guess. **So nothing is derived; the field stays Patrick's, with one lever: `defaultCategories` in Global Settings, blank by default.** The cost of blank is one click per draft; the cost of a wrong guess at two a day is a category page full of posts that do not belong on it.

### 3.6 What a filled draft looks like against an empty one

Before AUTO-202 (every one of the 14 AI drafts AUTO-200 counted): title, slug, meta, excerpt, body with strips and links, the AI fields, the topic record; no header image, no author, no categories, no related slugs. After, the coolers draft as stored: the same plus `author` (Patrick Black), `relatedCategorySlugs: ["coolers"]`, `headerImage` (a 1,376 x 768 asset with alt text); `categories` absent because the setting is blank. The one field still empty is the one with no honest rule.

### 3.7 The review, and what it changed

A five-lens adversarial review (rendering mode, security and cost, the hard rules, logic, tests), each finding judged by two independent skeptics, confirmed ten defects in the first cut; all are fixed in the same change. The ones that matter to the money and the promises: the 70 second budget was stated but enforced only on the generation (now every effect after the reservation runs under a deadline); a cap slot was reserved before the Gemini key was known to exist (now the key is checked first and no slot is spent); the reference photos were fetched before the cap (now the cap comes first and the photos are fetched in parallel, once); the product-photo fallback ignored the topic rule and the site-wide hide list (now it obeys both); "Generate another header image" could replace an upload with a product thumbnail when the AI failed (now a fallback only fills an empty slot); the second duplicate check sat before the image, widening the double-draft window (now it is the last step before the create, and a refused draft's picture is deleted); the three buttons did not share a lock (they do); a hot-linked Geiger photo reached the BlogPosting JSON-LD uncredited (the JSON-LD now carries the asset only). The regenerate proof picture (section 2.1) was made under the first cut's order; the chain's output is unchanged by the reordering, only what happens when something fails.

## 4. Is a generated draft publishable without Patrick touching it?

**With Global Settings as they are today: almost.** It has its text, strips, links, meta, excerpt, slug, author, header image and (for six topics in ten) its related category slug; it has no blog category, so it would appear on the blog index and its detail page but under no /blog/cat/ page, and its "Order Custom ... Today" heading would fall back to the title. **With one setting filled once (Default categories = Promotional Product Ideas): yes, for the fields.** What remains is judgement, not fields: reading the post, looking at the picture, and the FIX-900 drift class in the strips, which this ticket does not touch.
