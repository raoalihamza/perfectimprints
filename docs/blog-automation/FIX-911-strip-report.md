# FIX-911: Make the strips match the post

Measured and built 2026-10-10. Data: the production repo (`data/geiger/products.json`, 8,200 records, the 2026-09-22 rebuild; 465 roots) and the live Sanity dataset, read only. Nothing in Sanity was written: no document, no draft, no counter. Three real generations were made (one DeepSeek call each, no image), through `generateBlogPost`, which never writes, so there was no draft to delete.

## 1. The whole-pool number

FIX-910 judged 107 product strips the matcher had made, in 12 AI list posts, and found 51 of them drifted. Those same 107 ideas were replayed here, post by post with the generator's own used-product accumulation, through the code as it stood and through FIX-911.

| the 107 ideas | right | mixed | wrong | no strip | drifted (mixed + wrong) | strips shown | drifted share of strips shown |
| --- | --- | --- | --- | --- | --- | --- | --- |
| as stored in Sanity (the strips FIX-910 judged) | 56 | 18 | 33 | 0 | **51 of 107** | 107 | 48% |
| re-run through the code before FIX-911 (FIX-900 dials, slug-only resolver) | 58 | 9 | 22 | 18 | **31 of 107** | 89 | 35% |
| re-run through FIX-911 | 67 | 4 | 7 | 29 | **11 of 107** | 78 | 14% |

**51 of 107 became 11 of 107.** Of the other 96, 67 are right and 29 have no strip. Counted in products rather than strips: 419 shown as stored, 162 of them off-topic (39%); 345 and 99 (29%) through the old code; 301 and 35 (12%) through FIX-911.

Against the code before FIX-911, idea by idea: 9 wrong strips and 3 mixed ones became right, 1 empty idea gained a right strip, 9 wrong or mixed strips became empty. Going the other way: 3 right strips became empty and 1 became mixed, each because an earlier idea in the same post is now right and used the products first (two generic-heading hat ideas after six hat ideas that now show hats; "liquid measuring cups" after "measuring spoon sets" took the spoons); 1 mixed strip became wrong ("wine opener multi-tools", section 9). **No right strip was replaced by a wrong one.**

### How a strip was judged

One explicit key per idea, written from the idea and its post before any variant was run: a pattern for "this product is the idea's product" (a koozie idea accepts koozies, can coolers, bottle coolers and can holders, and refuses "12-Can Cooler Bag" and a Koozie-brand tumbler). A strip is right when every product passes, wrong when none does, mixed otherwise. The same key judged the stored strips, the old code and the fix. Applied to the stored strips it gives 51 drifted, FIX-910's own number, and agrees with FIX-910's hand verdict on 105 of the 107 (it calls one koozie strip mixed for the tumbler, and one football strip right that FIX-910 called mixed). The key is strict: a hard drinking cup under a measuring-cups idea is off, and so is a soccer stress ball under a football idea.

### Where the gain came from

The same replay with one rule removed at a time:

| | right | drifted | no strip |
| --- | --- | --- | --- |
| FIX-911 as shipped | 67 | 11 | 29 |
| without product-name evidence (the slug rules alone, everything else kept) | 64 | 15 | 28 |
| with "can" back in the filler list | 65 | 13 | 29 |
| without the product-noun rule on the scans | 65 | 16 | 26 |

## 2. What was built

**The resolver reads product names.** `resolveCategoryForKeywords` used to score root slug words only. Its rules now live in the pure `lib/ai/category-resolver.ts`, over an index of every root's slug and the names of the products the root actually shows:

1. Exact: a slug that carries every word of the phrase. Unchanged.
2. A slug names the phrase's tail, two words or more ("test tote bags" to tote-bags, "spf lip balm" to lip-balm).
3. Product names carry the phrase's tail, two words or more: at least 2 products, and at least 10% of the root's list, the largest share winning. "foam can coolers" has no slug; "can coolers" is in 33 of the koozies root's 76 names (43%). The hard-cooler root is second, with 26 of 78 (its "12-Can" cooler bags), so that answer is won on a margin; a 995-product department with 57 such names is at 6% and is not a candidate.
4. A root the phrase names outright (its whole slug is in the phrase), the one furthest right first, refused when its own products do not carry the word.
5. The head word names exactly one root, and that root's products carry it.
6. Otherwise no category.

Across the 107 ideas the category was chosen by rule 1 for 17, rule 2 for 9, rule 3 for 11, rule 4 for 34, rule 5 for 2, and 34 have no category. The answer differs from the old resolver's on 33 of the 107.

**What a root "actually shows".** 137 of the 465 roots are curated in Sanity and 94 replace their baked list (caps: 0 baked products, 73 curated; wine-openers: 60 baked, 3 curated). Reading that per root costs about 420 Sanity requests. `lib/sanity/queries/category-evidence.ts` reads all of it in one request (68 KB, 1.4 to 1.9 s from Pakistan) and `lib/ai/category-evidence.ts` applies the same membership rules the category page applies. Checked against the real per-root lists: identical for 408 of the 414 roots that show a grid; the other 6 differ only by the six site-wide hidden products, which the evidence deliberately ignores. The index is memoised for five minutes per server instance. Without Sanity (the offline verifier, a unit test) it falls back to the baked lists.

**A root whose page shows the lead form gives no evidence.** 51 roots hold a list their own category page refuses to show: the `full-capped-60` lists (the top 60 of a parent department) and the roots Patrick has set to Force CTA. Four of them (hot-sauce, coffee-tea-cocoa, food-beverage, collapsible-bottles) hold the same 59 drinkware items, and read as evidence they answered "sport and bike bottles" with hot-sauce. The page's own precedence is applied (Force CTA, then Replace products, then Force products, then the baked rule).

**"can" is a product word.** It was in the filler list as the modal verb. 111 product names carry it. For product matching only, it is now a word; the blog topic guard, the link placer and the header-image rule keep the shared list.

**The product noun on the scans (`scanMustCarry`).** A product drawn from a whole collection (custom products, product pages when a caller asks for them, the catalogue) must carry the idea's last product word. FIX-900's floor asks for two shared words, and "glow" and "dark" are two: glow-in-the-dark tattoos cleared it under a football idea. The category branch is never filtered by it.

**`matchIdeaStrip`.** The list branch's per-idea matching was moved, unchanged apart from the two things above, into an exported function in `lib/blog-automation/generate-blog-post.ts`, so the measuring harness replays stored posts through the shipped code. The numbers in section 1 are that function's.

**The prompt was not touched.** FIX-910 expected one to three right strips to empty on form-factor phrasings ("sunscreen packets") and proposed asking the model for a product noun. Under rule 4 those phrasings keep their category ("sunscreen packets", "sunscreen tubes", "sunscreen sticks" all resolve to sunscreen, "lunch boxes" to its root), so nothing was lost and nothing was added to the generation prompt. `lib/blog-automation/blog-shape.ts`, the title rules, the scene planner and the image rules are byte-identical; `header-image.ts` and its tests are untouched and pass.

## 3. The 14 "no root" strips, re-measured

| | |
| --- | --- |
| The catalogue holds no such product at all | 8: gift cards (one "Gift Card Box"), cassette tape items, neon signs, polaroid cameras, test tubes, test strips, checklists, test prep books. Four of the eight are from the "9 Creative Test Giveaway Ideas" draft, a literal test topic. |
| The catalogue holds it under other words | 2: "test kits" (27 first aid and wellness kits), "safety themed cups" (12 measuring cups and spoons) |
| Reachable | 4: glass soda bottles, and the three football ideas |

Outcome under FIX-911: 2 right (glass soda bottles: three glass bottles from the catalogue; mini foam footballs: three foam footballs), 1 wrong (gift cards still resolves to the `cards` root, which is playing cards), 11 with no strip. Through the old code the same 14 gave 0 right, 9 drifted, 5 empty.

**The sports-balls question, answered by reading the root.** `/cat/sports-balls` exists, and it is not a football category. Its baked list is `full-capped-60`: 59 products that are the top of a 967-product department (a carabiner, a cooler tote, a BBQ set, banners, tent kits, temporary tattoos), none named football. The two footballs on it are Patrick's own product pages, added by an override; the page itself shows the lead form. The page Search Console ranks, `/cat/sports-balls/size/mini`, is a 299-product facet with four football names. The whole catalogue has 15 football-named products, 9 of them footballs or football stress items, plus Patrick's two. So the three football strips were rightly counted as "no root": the label FIX-910 wrote beside them (sports-balls) was the place they should have lived, and they do not live there. **The 14 did not shrink much. 8 of them have nothing in the catalogue to show.**

## 4. The top-up and the generic heading

**The catalogue top-up (10 strips).** FIX-900's dial had already emptied five of the ten. Measured on the new resolver:

| | right | drifted | no strip | off-topic scanned products |
| --- | --- | --- | --- | --- |
| top-up as it was (FIX-900 floor) | 65 | 16 | 26 | 19 |
| no top-up when a category resolved | 66 | 14 | 27 | 16 |
| no catalogue at all | 63 | 9 | 35 | 0 |
| **the product-noun rule (shipped)** | **67** | **11** | **29** | **6** |

Stopping the catalogue outright removes the drift and leaves 63 right strips where the shipped rule has 67 (the trucker hats, the glass bottles and the foam footballs have no category of their own and come from the catalogue). The noun rule keeps those and removes most of the rest. Of the ten top-up strips: 2 right, 1 mixed ("boxed wine opener sets": the noun is "sets", so a wine gift set and a wine tumbler set pass), 1 wrong, 6 empty.

**The generic heading (4 strips).** "Pick the Perfect Color Combination", "Design Something Fun", "Enhance the Unboxing Experience", "Plan Your Order", all in the trucker-hat post, which has a primary category (caps). Two now show hats through that primary category, and two have no strip because the hats ran out. In a topic-generated post, which has no primary category, such a phrase resolves to nothing, its noun ("packaging", "breaks") is on no product, and there is no strip. No rule was built for it: no strip is what the code already does.

**Curation (3 strips).** Not a fault. measuring-cups is Patrick's Replace products list of 11; a nine-idea measuring-cups post asks for about 36. The honest result is a short post, not a wrong one: under FIX-911 that post is 3 right, 2 wrong, 4 empty where the stored one was 1 right, 8 drifted.

## 5. The filler list

| word | product names carrying it | what it is there |
| --- | --- | --- |
| can | 111 | a noun: "KOOZIE Can Cooler", "12-Can Cooler Bag" |
| top | 65 | a part or a garment: "Flip Top Cap", "Table Top Billboard", "Scrub Top" |
| with | 533 | a preposition: "Lanyard with Plastic..." |
| the | 248 | "The North Face", "On The Go" |
| and | 119 | "Lid and Straw" |
| for | 21 | "Pouch for 4" |
| best | 10 | "Best Selling" |
| your, our, from, how | 9, 1, 1, 1 | incidental |
| that, this, are, will, why, what, ideas, idea | 0 | |

Only "can" was changed, and only for product matching: with it stripped, "can coolers" was scored as "coolers" on both sides. Putting it back as filler costs 2 right strips on the pool. "top" is the one other word that names things, and it was left: none of the 107 ideas uses it, and in a topic ("top promotional products") it is the adjective. The generic promo words are not product words either: "custom" is in 88 names, "printed" in 14, "logo" in 11.

## 6. The nine callers

All nine run when content is generated. None is in a render path (a test asserts no page file calls the resolver). Nothing already stored changes: a strip is stored as SKUs and references in the document, and the resolver is not consulted when a page renders.

| caller | what it uses the answer for | what changes |
| --- | --- | --- |
| `generate-blog-post.ts`, the idea strips | the category each list idea's strip is drawn from | the measured change above; also passes the product noun |
| `generate-blog-post.ts`, the link category | the post's own category page, boosted for the link finder | a can coolers topic now boosts /cat/koozies instead of /cat/coolers |
| `generate-video/route.ts` | the video's related-products strip | new resolver; no noun rule (it matches on several keywords) |
| `generate-page/route.ts` | the page's product strip and link category | new resolver |
| `generate-catalog/route.ts` | the link category | new resolver |
| `generate-product/route.ts` | the suggested `relatedCategorySlug`, patched only if empty | new resolver. The field is read at render by `/products/<slug>` for the related carousel, so FUTURE product pages get a better category; no stored value changes |
| `generate-landing-content.ts` | the landing page's product strip and link category | new resolver |
| `resolve-draft-fields.ts` | the header-image LIBRARY lookup by root slug | new resolver |
| `generate-blog-image/route.ts` | the same lookup for the Studio button | new resolver |

Each of them now awaits the resolver (it reads Sanity). On 155 test phrases the answer is the same as before for 118, becomes "no category" for 23 (the incidental-word answers: yoga-items for cassette tapes, yard-signs for neon signs, pre-roll-tubes for test tubes, food-gifts for "executive gifts"), changes root for 13, and one phrase that had no answer gets one ("hats" to caps, where 13 products are named hat). On the 2,227 search terms in the volume file: a category for 1,420 (exact 248, slug tail 284, names 159, named 663, head 66) and none for 807.

## 7. Three real generations

The model's own `productType` strings, which no stored post carries. Topic 1 is the can coolers case, topic 2 the footballs case, topic 3 a post that was already right.

| topic | ideas | strips | right | drifted | no strip |
| --- | --- | --- | --- | --- | --- |
| custom can coolers | 11 | 11 | 10 | 1 | 0 |
| promotional footballs | 10 | 4 | 3 | 1 | 6 |
| custom printed sunglasses | 7 | 7 | 7 | 0 | 0 |
| all three | 28 | 22 | 20 | 2 | 6 |

The two drifted: the can coolers post has one Koozie-brand tumbler among 44 products; the footballs post's "football stress balls" idea shows a plain, a soccer and a baseball stress ball, because the stress-reliever idea above it used the four football ones. The old resolver would have sent 9 of the 11 can cooler ideas to the hard-cooler and bottle-opener roots, "mini plastic footballs" to plastic-vinyl and "inflatable footballs" to beach-balls-inflatables. Every strip is in the appendix.

The six empty football ideas are the catalogue, not the matcher: mini autograph, composite, mini plastic, inflatable and youth-size footballs, and football keychains. The image rule still fires as a second guard: for the footballs post it would take four football photos and refuse the eight water-bottle and plain stress-ball products; for the can coolers post it refuses seven products whose names do not say cooler.

The can coolers post placed no internal link. The finder returned 12 targets, 5 of them matched on a topic word; none had a clean anchor in the text. Seven of the twelve were matched on "custom" and "can", the verb ("How Booster Clubs Can Raise Big Money..."). That is the link finder's own word list, which this ticket did not touch.

## 8. The AI posts that already exist

32 AI blog documents today: 17 published, 15 drafts that were never published (FIX-910 counted 16 and 16; one has been published since; the brief's 24 is an older count). 18 list posts, 13 single-topic, 141 product strips. The 107 matcher-made list strips sit in 12 of them:

| | posts | strips | drifted as stored |
| --- | --- | --- | --- |
| published | 3 | 29 | 7 (the koozies post 6, the employee appreciation post 1, the sunglasses post 0) |
| drafts | 9 | 78 | 44 |

**The fix repairs none of them.** A strip is stored in the post's body as product entries; the resolver runs when a post is generated. A test asserts that no page file calls it.

**What a repair would take.** Three ways, cheapest first:

- By hand, for the three published posts: 7 strips, in Studio, a few minutes.
- A script that re-matches only the product rows: for each list idea, the heading (the "for ..." cut makes a heading usable as the phrase) through `matchIdeaStrip`, replacing only that row's products, dry run first. No AI call, no image, no text touched. About half a day to build and test. On the replay above the three published posts would go from 22 right and 7 drifted to 22 right, 5 drifted and 2 empty, and the nine drafts from 34 right and 44 drifted to 45 right, 6 drifted and 27 empty.
- Regenerate: about half a cent of DeepSeek per post and 6.7 cents if the header image is redrawn, about 90 cents for all twelve, and it replaces the body, so anything Patrick edited is lost. Reasonable for the nine drafts, not for the three published posts.

## 9. What is still wrong, and why

The 11 drifted strips of the 107:

- **Two products in one phrase (2).** "wine opener multi-tools" resolves to multi-function-tools, "sunscreen golf packs" to golf-packs. The last words name a real category; the post is about the first.
- **A word with two meanings (3).** "gift cards" resolves to the playing-cards root; "magnetic note pads" to mouse-pads ("magnetic" does not fold to "magnets"); "neoprene bottle sleeves" is topped up with laptop sleeves from the catalogue.
- **The idea drifted from its own post (2).** "stainless steel cups" and "cups for gift sets" in the measuring-cups post show drinking cups, which is what the words say.
- **The right category holds other things (3).** The koozies root holds bottle bags and a Koozie-brand tumbler (2 mixed strips); the sunglasses root holds a "Trade Show Lanyard" that outranks sunglasses for "trade show sunglasses".
- **A generic noun (1).** "boxed wine opener sets": "sets".

The 29 with no strip: 7 have no product, or one, in the whole catalogue; 3 had theirs used by an earlier idea; the other 19 are products the catalogue holds under words the phrase does not share. The clearest of those: the keychains root is 75 products named "Key Tag" (two ideas), "corkscrew" against "wine opener" (four), "kits" (two).

## 10. Measured and not built

- **The two closed roads, re-measured on this pipeline.** Raising the floor inside a category to two shared words: 36 right, 65 empty; 33 of the 56 stored-right strips gone. Product names as a gate (a root must hold two products naming the whole phrase): 41 right, 57 empty; 28 of the 56 gone, FIX-910's number exactly. Tests now fail if either returns (each was broken on purpose to see them fail).
- **Preferring the post's own category.** 65 right, 12 drifted, 30 empty: no gain. In a small category it only moves the same three wine openers to a different idea.
- **Ranking carriers of the noun first inside a category.** 9 drifted, and 2 right strips emptied; it puts "lip balm in white tube" above sunscreens for "sunscreen tubes" and bucket hats above recycled trucker caps.
- **Scanning all of Patrick's product pages for every idea**, at one shared word: 19 drifted (santa hats under every hat idea, glow sticks under sunscreen sticks). At the catalogue floor with the noun rule: no verdict changes, one product added, and it would give "mini plastic footballs" Patrick's own two football pages. That second form is a one-line change and a decision for Ali and Patrick (section 12).
- **The thresholds.** A share of 5% or 20% instead of 10%: 12 drifted either way. Three products instead of two: 11.

## 11. Found, not asked

- **A list post asks for more products than a narrow category holds.** Nine ideas at four products is 36. Patrick's wine-openers list is 3, measuring-cups 11, sunscreen 23; the catalogue has 9 footballs. The empties in those posts are arithmetic. The shape chooser (AUTO-203) picks a list or a guide from the topic's words; it does not look at how many products the topic has. A guide carries one row of up to seven.
- **The link finder matches the verb "can".** Seven of twelve targets for the can coolers topic. The placer drops them, so nothing wrong was linked, but they take the finder's slots.
- **"imprinted" and "imprint" are not in the generic promo list.** "custom imprint" and "imprint for you" (brand searches) resolve to the matches root, where product names carry the word. The list is shared with the topic guard, so it was not changed here.
- **`getAllGeneratedRootSlugs` was read on every resolver call**: a listing of 22,000 files and 465 JSON reads, ten times per list post. The index now does it once per five minutes.
- **The FIX-910 report was never in the repo.** It and the 107 labelled inputs survived only in a temp folder from that session. The harness, the inputs, the judging key and every output of this run are archived at `C:\Users\aliha\Documents\perfectimprints-archive\fix-911-harness\`.
- **The "9 Creative Test Giveaway Ideas" draft** is still in the dataset and is 9 of the 107.

## 12. Not verified

- The 107 inputs are FIX-910's reconstructions and hand-written phrases, not the model's own strings. The three generations are the only real ones, and they are three.
- The key is one reader's standard. It is strict where FIX-910's reading was sometimes lenient, and it is the same for every row of every table.
- The single-topic template (13 posts, one strip each) was not judged: its inputs cannot be reconstructed. It takes the new resolver and "can", not the noun rule.
- The index build was timed from a laptop in Pakistan, not on Vercel.
- The other four generators (video, page, landing, product) were not generated against. Their change is the resolver's answer, measured on the phrase lists in section 6.

## Appendix

### A. Every one of the 107, post by post

Stored = the strip as it sits in Sanity. Today = the same idea through the code before FIX-911. "(off)" marks a product the key refuses.


**12 Employee Appreciation Gift Ideas for Every Budget** (published, primary category awards-recognition)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| water bottles | right | right | **right** | water-bottles, exact [water bottles] | 25 oz Infusion Water Bottle; The 16 oz Sport Pint Water Bottle; 27 oz Hermosa Aluminum Water Bottle; 32 oz Baltic Collection Water Bottle |
| tote bags | right | right | **right** | tote-bags, exact [tote bags] | Tote Bag; The Oak Tote Bag; The Zeus Tote Bag; The Eros Tote Bag |
| notebooks and journals | right | right | **right** | journals-notebooks, exact [notebooks journals] | 5X7 Journal Notebook; 3X5 Journal Notebook; 5X7 Journal Notebook W/Pen Loop; Aqua Journal Combo |
| power banks | right | right | **right** | power-banks-chargers, exact [power banks] | Flash Power Bank; UL Keychain Power Bank; PEP 4000 mAh Power Bank; Power Play 10K Power Bank |
| branded apparel | right | right | **right** | apparel, exact [apparel] | Pacific Poncho; Performer Jacket; Classic Rugby Shirt; Signal Hi-Vis Jacket |
| desk accessories | right | no strip | **no strip** | unique-desk-accessories, exact [desk accessories] | no strip |
| tech gadgets | right | no strip | **no strip** | none | no strip |
| coffee mugs | right | right | **right** | coffee-mugs, exact [coffee mugs] | 16 oz Corkcicle Coffee Mug; 16 oz Glass Bistro Coffee Mug; 10 oz Haworth Glass Coffee Mug; Soup Mug |
| stress relievers | right | right | **right** | stress-relievers-balls, exact [stress relievers] | Van Stress Reliever; Pig Stress Reliever; Car Stress Reliever; Cow Stress Reliever |
| lunch bags | right | right | **right** | lunch-bags-boxes-totes, exact [lunch bags] | Budget Lunch Bag; Day Trip Lunch Bag; Adventure Lunch Bag; 6 Pack Cooler Lunch Bag |
| umbrellas | right | right | **right** | umbrellas, exact [umbrellas] | Stick Umbrella; Steal Umbrella; Element Umbrella; Patriot Umbrella |
| gift cards | wrong | wrong | **wrong** | cards, named [cards] 14 names | (off) Playing Card Set; (off) Card Game Assortment; (off) Playing Cards In Case; (off) Playing Cards In Case |

**9 Best Retro-Style Promotional Products for Events and Giveaways** (draft)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| vinyl record coasters | right | right | **right** | coasters, named [coasters] 35 names | Slate Coaster; Stone Coaster; 1 Piece Coaster; Neoprene Coaster |
| arcade keychains | right | no strip | **no strip** | none | no strip |
| tote bags | right | right | **right** | tote-bags, exact [tote bags] | Tote Bag; The Oak Tote Bag; The Zeus Tote Bag; The Eros Tote Bag |
| retro sunglasses | right | right | **right** | sunglasses, named [sunglasses] 35 names | Retro Sunglasses; Retro Specs; RB-N Sunglasses; Promo Sunglasses |
| lunch boxes | right | right | **right** | lunch-bags-boxes-totes, exact [lunch boxes] | Lunch Tote; Retro Lunch Box; Budget Lunch Bag; Ombré Lunch Tote |
| cassette tape shaped items | wrong | no strip | **no strip** | none | no strip |
| neon signs | wrong | wrong | **no strip** | none | no strip |
| polaroid style cameras | wrong | no strip | **no strip** | none | no strip |
| glass soda bottles | wrong | wrong | **right** | none | 1 Quart Glass Milk Bottle With Lid; 21 oz Rawlins Glass Bottle w/ Bamboo Lid; Vinglace Wine Bottle Insulator @ 2 Glass Gift Set |

**10 Custom Richardson Trucker Hats: The Complete Buying Guide** (draft, primary category caps)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| richardson 112 snapback trucker caps | right | right | **right** | caps, tail-names [trucker caps] 16 names | Richardson Snapback Trucker Cap; Richardson Trucker Cap; Richardson Trucker Snapback; Snapback Meshback Trucker Cap |
| low profile trucker caps | right | right | **right** | caps, tail-names [trucker caps] 16 names | Richardson Low Profile Trucker Cap; Unstructured Low Profile Trucker Mesh Cap; Structured Low Profile Rounded Baseball Cap; Structured Low Profile Performance Mesh Baseball Cap |
| garment washed trucker hats | wrong | wrong | **right** | none | Merrimack Hat Co. Colt Trucker; Econscious Eco Trucker Organic/Recycled Hat |
| recycled trucker hats | mixed | right | **right** | none | Richardson Recycled Trucker Cap; RPET Boonie Hat; Foam Trucker Cap; Berkley Bucket Hat |
| camo washed trucker hats | mixed | right | **right** | none | Richardson Camo Washed Trucker Cap; Richardson Garment Washed Trucker; Rainbow Trucker Cap; Sublimated Bucket Hat |
| foamie trucker snapback hats | mixed | right | **right** | none | Richardson Foamie Trucker Snapback; Youth Port Authority Snapback Trucker Cap; Coal Pines 6-Panel Hat; Soft Acrylic Beanie Hat |
| trucker hat color combinations | mixed | right | **right** | none | Carhartt Acrylic Knit Hat; Cotton Bucket Hat with Trim; TravisMathew Cruz Trucker Cap; The Hauler Classic Trucker Cap |
| trucker hat decoration methods | right | right | **right** | none | Wanderlust Packable Bucket Hat; Sublimated Reversible Bucket Hat; Sportsman Pigment Dyed Trucker Cap; Double Nickle Trucker Meshback Cap |
| fun trucker hat designs | wrong | right | **right** | none | Roadster Trucker Cap with Sandwich; Titleist Tour Performance Golf Hat; The North Face Ultimate Trucker Cap; Reversible All Over Print Bucket Hat |
| custom hat packaging | mixed | right | **no strip** | none | no strip |
| trucker hat pricing breaks | mixed | right | **no strip** | none | no strip |

**9 Creative Test Giveaway Ideas for Your Next Event** (draft)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| test tubes | wrong | no strip | **no strip** | none | no strip |
| test strips | wrong | no strip | **no strip** | none | no strip |
| test drive checklists | wrong | wrong | **no strip** | none | no strip |
| test prep books | wrong | wrong | **no strip** | none | no strip |
| test pens | right | right | **right** | pens, named [pens] 344 names | Lobo Pen; Hulo Pen; Fiji Pen; Dart Pen |
| test kits | mixed | no strip | **no strip** | none | no strip |
| test tote bags | right | right | **right** | tote-bags, tail-slug [tote bags] | Tote Bag; The Oak Tote Bag; The Zeus Tote Bag; The Eros Tote Bag |
| test notebooks | right | right | **right** | journals-notebooks, head [notebooks] 30 names | 5X7 Journal Notebook; 3X5 Journal Notebook; 5" X 7" Havana Notebook; 6" x 8.5" Bari Notebook |
| test drive keychains | mixed | no strip | **no strip** | none | no strip |

**9 Ways Businesses Use Custom Printed Sunglasses for Promotions and Safety** (published)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| trade show sunglasses | right | mixed | **mixed** | sunglasses, named [sunglasses] 35 names | (off) 1/2" Double-Thick Cotton Trade Show Lanyard with Plastic Option Y Converter; RB-N Sunglasses; Retro Sunglasses; Promo Sunglasses |
| safety sunglasses | right | right | **right** | sunglasses, named [sunglasses] 35 names | Malibu Sunglasses; Panama Sunglasses; Bamboo Sunglasses; Sun Ray Sunglasses |
| summer sunglasses | right | right | **right** | sunglasses, named [sunglasses] 35 names | Sun Fun Sunglasses; Aviator Sunglasses; Rubberized Sunglasses; Neon Bright Sunglasses |
| golf tournament sunglasses | right | wrong | **right** | sunglasses, named [sunglasses] 35 names | Nike Chance Sunglasses; Two Tone Matte Sunglasses; Rainbow Malibu Sunglasses; Cobra Recycled Sunglasses |
| hotel sunglasses | right | right | **right** | sunglasses, named [sunglasses] 35 names | Two-Tone Malibu Sunglasses; Mirrored Malibu Sunglasses; Patriotic Malibu Sunglasses; Youth Rubberized Sunglasses |
| music festival sunglasses | right | right | **right** | sunglasses, named [sunglasses] 35 names | Nike Skylon Ace Sunglasses; Full Color Malibu Sunglasses; Crystalline Malibu Sunglasses; Reflective Rimless Sunglasses |
| fitness sunglasses | right | right | **right** | sunglasses, named [sunglasses] 35 names | Malibu Sunglasses - Wood Grain; Velvet Touch Malibu Sunglasses; Rubberized Mirrored Sunglasses; Gatsby Recycled Frame Sunglasses |
| dealership sunglasses | right | right | **right** | sunglasses, named [sunglasses] 35 names | Zander Recycled Frame Sunglasses; Malibu Sunglasses - Tortoise Shell; Nike Circuit Polorized Sunglasses; Black Frame Tinted Lense Sunglasses |

**9 Custom Wine Openers for Business Gifting and Branded Giveaways** (draft)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| waiter's corkscrews | right | no strip | **no strip** | none | no strip |
| wine opener multi-tools | wrong | mixed | **wrong** | multi-function-tools, tail-slug [multi tools] | (off) Hammer Multi-Tool; (off) Chipper Multi-Tool; (off) Gripper Multi-Tool; (off) Cocktail Multi Tool |
| wooden handle wine openers | wrong | no strip | **right** | wine-openers, tail-slug [wine openers] | Tuscany Wine Opener; The Curve Wine Opener; Waiters's Wine Opener |
| wine opener keychains | wrong | no strip | **no strip** | wine-openers, named [wine opener] 3 names | no strip |
| rabbit style corkscrews | wrong | no strip | **no strip** | none | no strip |
| wine opener and stopper sets | right | mixed | **right** | wine-stoppers, named [wine stopper] 5 names | Wine Stopper; Wood Wine Stopper; Metal Wine Stopper; Vacuum Wine Stopper |
| wine openers with flashlights | wrong | no strip | **no strip** | wine-openers, exact [wine openers] | no strip |
| boxed wine opener sets | mixed | mixed | **mixed** | wine-openers, named [wine opener] 3 names | (off) Wine Gift Set; 4 Piece Bamboo Wine Tool Set; Executive Wine Collectors Set; (off) Napa Stemless Wine Tumbler Set |

**9 Promotional Ornaments for Bulk Business Gifting and Branded Giveaways** (draft)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| logo ornaments | right | right | **right** | ornaments, exact [ornaments] | Wood Ornament; Slate Ornament; Metal Ornament; Wooden Ornament |
| laser engraved wood ornaments | right | right | **right** | ornaments, tail-names [wood ornaments] 6 names | Custom Laser Cut Wood Ornament; Wood Ornament - 3"W x 3"H; Layered Wood Ornament: Tree; Layered Wood Ornament - Snowflake |
| photo frame ornaments | wrong | wrong | **right** | ornaments, named [ornaments] 56 names | Ceramic Ornament; Stocking Ornament; Confetti Ornament; Blossom Kit Ornament |
| snow globe ornaments | right | right | **right** | ornaments, named [ornaments] 56 names | Magnetic Snow Globe Ornament; Snow Globe Custom Christmas Ornaments; Slate Round Ornament; Holiday Glitz Ornament |
| metal ornaments | right | right | **right** | ornaments, named [ornaments] 56 names | Holiday Charm Ornament; Hammered Glass Ornament; Beveled Glass Ornaments; Oval Jade Glass Ornament |
| acrylic ornaments | right | right | **right** | ornaments, named [ornaments] 56 names | Acrylic Holiday Ornament; Intrepid Acrylic Ornament; Custom Shape Acrylic Holiday Ornaments - up to 6 sq. inches; Custom Shape Acrylic Holiday Ornaments - up to 9 sq. inches |
| personalized ornaments | right | right | **right** | ornaments, exact [ornaments] | Hand Blown Glass Ornament; Mirror Ornament - Hexagon; Flat Shatterproof Ornament; Shatter Resistant Ornament |
| ornament sets | right | right | **right** | ornaments, named [ornament] 56 names | Mini Campfire Mug Ornament; Chrome Round Disk Ornament; 3" Hand Blown Glass Ornament; Treat Filled Holiday Ornament |
| gift ornaments | right | right | **right** | ornaments, named [ornaments] 56 names | Ornament With Custom Window Box; Dazzling Round Pop Out Ornament; Felt Holiday Christmas Ornament; Mitten Holiday Christmas Ornament |

**9 Custom Sunscreen Giveaway Ideas for Trade Shows and Outdoor Teams** (draft)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| spf lip balm | right | right | **right** | lip-balm, tail-slug [lip balm] | Chap Ice SPF 15 Lip Balm; SPF 15 Lip Balm in White Tube; SPF 15 Lip Balm in Black Tube; Value SPF 15 Broad Spectrum Lip Balm |
| sunscreen packets | right | right | **right** | sunscreen, named [sunscreen] 13 names | 4Oz Sunscreen Spray; 8Oz Sunscreen Spray; 2 Oz Sunscreen Spray; .5 oz SPF 30 Sunscreen |
| sunscreen tubes | right | right | **right** | sunscreen, named [sunscreen] 13 names | 1.9 oz Duo Bottle SPF 30 Sunscreen + SPF 15 Lip Balm in Black Tube + Carabiner; 1 Oz Squeeze Pouch Sunscreen; SPF 30 Sunscreen in Jumbo Sunstick; SPF 50+ All Natural Sunscreen Stick |
| sunscreen spray | right | right | **right** | sunscreen, tail-names [sunscreen spray] 3 names | 1 oz SPF 30 Sunscreen with Carabiner; 1 oz SPF 30 Sunscreen in Clear Round Bottle; SPF 30 Mineral Sunscreen Tottle w/Carabiner 1.5 fl oz; 1.9 oz SPF 30 Sunscreen in Clear Bottle with Carabiner |
| sunscreen sticks | mixed | no strip | **no strip** | sunscreen, named [sunscreen] 13 names | no strip |
| sunscreen bottles | wrong | no strip | **no strip** | sunscreen, tail-names [sunscreen bottles] 3 names | no strip |
| beach and pool kits | mixed | no strip | **no strip** | none | no strip |
| sunscreen with carabiner | mixed | right | **right** | sunscreen, exact [sunscreen] | Tropical SPF 30 Broad Spectrum Sunscreen Tottle 1.5 fl oz w/Carabiner; SPF 15 Lip Balm in White Tube with Hook Cap and Carabiner |
| sunscreen golf packs | wrong | wrong | **wrong** | golf-packs, tail-slug [golf packs] | (off) Golf Buddy; (off) Gold Golf Kit; (off) Golf Ball Caddy; (off) Golf/Sports Towel |

**9 Promotional Measuring Cups: Creative Giveaway Ideas for Bulk Buyers** (draft)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| kitchen conversion chart measuring cups | right | right | **right** | measuring-cups, tail-slug [measuring cups] | Cook's Choice One-Cup Measuring Cup; Cook's Choice Two-Cup Measuring Cup; Measuring Spoon Set; 7-Piece Measuring Set |
| collapsible silicone cups | mixed | wrong | **no strip** | none | no strip |
| stainless steel cups | mixed | wrong | **wrong** | stadium-cups, tail-names [steel cups] 3 names | (off) 16 oz Steel Chill Cup; (off) 16 oz Recyclable Steel Chill-Cups; (off) 16 oz Chill Steel Party Cup- 24hr Service; (off) 24 oz Stadium Cup |
| safety themed cups | wrong | wrong | **no strip** | none | no strip |
| cups for gift sets | wrong | wrong | **wrong** | stadium-cups, exact [cups] | (off) 17 oz Stadium Cup; (off) 12 oz Mood Stadium Cup; (off) 17 oz Mood Stadium Cup; (off) 22 oz Mood Stadium Cup |
| adjustable measuring cups | wrong | right | **right** | measuring-cups, tail-slug [measuring cups] | Adjustable Measuring Spoon; 4 Way Measuring Spoon; Sliding Measuring Spoon; Wooden Measuring Spoons |
| measuring spoon sets | wrong | wrong | **right** | measuring-cups, tail-names [measuring spoon sets] 2 names | Kitchi Magnetic Measuring Spoon Set; Swivel-It Measuring Spoon; 4-Pc. Stainless Steel Measuring Spoons |
| liquid measuring cups | wrong | right | **no strip** | measuring-cups, tail-slug [measuring cups] | no strip |
| novelty measuring cups | wrong | no strip | **no strip** | measuring-cups, tail-slug [measuring cups] | no strip |

**9 Custom Koozie Ideas for Trade Shows, Employee Gifts, and Client Appreciation** (published)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| collapsible can coolers | wrong | wrong | **right** | koozies, tail-names [can coolers] 33 names | Collapsible KOOZIE Can Cooler; Koozie Collapsible Slim Can Cooler; Deluxe Collapsible  KOOZIE Can Cooler; Collapsible Neoprene KOOZIE Can Cooler |
| neoprene bottle sleeves | wrong | wrong | **wrong** | none | (off) Reversible Neoprene Laptop Sleeve; (off) 1 oz Sanitizer in Trapezoid Bottle w/ Sleeve; (off) Full Color 15" Recycled Neoprene Laptop Sleeve; (off) Full Color Neoprene Lip Balm Sleeve Pocket Keychain |
| foam can coolers | wrong | wrong | **right** | koozies, tail-names [can coolers] 33 names | Reversible Can Cooler; KOOZIE Duo Can Cooler; NFC Connect Can Cooler; Koozie Slim Can Cooler |
| stainless steel can coolers | wrong | wrong | **right** | koozies, tail-names [can coolers] 33 names | Koozie Cork Can Cooler; KOOZIE Woody Can Cooler; American Made Can Cooler; Original KOOZIE Can Cooler |
| embroidered koozies | right | right | **right** | koozies, named [koozies] 22 names | KOOZIE Magnetic Can Cooler; Zip-Up Bottle KOOZIE Cooler; Britepix KOOZIE Can Cooler; Bottle Opener KOOZIE Can Cooler |
| sublimated koozies | right | right | **right** | koozies, named [koozies] 22 names | Snuggy Dye-Sublimated Can Cooler; Koozie Magnetic Slim Can Cooler; Collapsible KOOZIE Bottle Cooler; Koozie britePix Slim Can Cooler |
| bottle opener koozies | mixed | mixed | **mixed** | koozies, named [koozies] 22 names | (off) Bottle Bag; Zipper Bottle Cooler; (off) Kangaroo Bottle Pouch; (off) Intrepid Water Bottle Pouch |
| zip-up koozies | right | right | **mixed** | koozies, named [koozies] 22 names | KOOZIE Glow-in-the-Dark Can Cooler; (off) 13 oz KOOZIE Triple Vacuum Tumbler; Koozie britePix Jersey Can Cooler; KOOZIE Two-Tone Collapsible Can Cooler |
| leather koozies | mixed | mixed | **right** | koozies, named [koozies] 22 names | Koozie Heather Collapsible Slim Can Cooler; Koozie Slim Collapsible Neoprene Can Cooler |

**9 Promotional Footballs Ideas for Game-Day Giveaways and Branded Events** (draft)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| mini foam footballs | right | mixed | **right** | none | 7" Foam Football; Mini Mood Stress Football; 7" Two-Toned Foam Football |
| full-size composite footballs | mixed | mixed | **no strip** | none | no strip |
| stress relief footballs | right | right | **right** | none | Football Stress Ball; Football Stress Reliever; Football Stress Reliever - 24hr Service |
| footballs with tee sets | wrong | wrong | **no strip** | none | no strip |
| glow in the dark footballs | wrong | wrong | **no strip** | none | no strip |

**9 Ways to Use Promotional Calendar Magnets for Business Marketing** (draft)

| idea phrase | stored | today | FIX-911 | category now, and why | the strip now |
| --- | --- | --- | --- | --- | --- |
| calendar magnets | right | right | **right** | magnets, named [magnets] 43 names | Calendar House Magnet; 2027 Calendar Round Corner Magnet; 2027 Memo Board Calendar W/Magnet; Church Magnet |
| magnetic note pads | wrong | wrong | **wrong** | mouse-pads, head [pads] 18 names | (off) Soft Mouse Pad; (off) NoWire Mouse Pad; (off) Flexible Desk Pad; (off) Aluminum Mouse Pad |
| safety reminder magnets | right | right | **right** | magnets, named [magnets] 43 names | 4" House Magnet; Info-Mag Magnet; 3" Circle Magnet; 4" Circle Magnet |
| photo frame magnets | wrong | wrong | **right** | magnets, named [magnets] 43 names | Ambulance Magnet; 2-in-1 Pop Magnet; 4X6 Schedule Magnet; Business Card Magnet |
| business card magnets | right | right | **right** | business-card-holders, tail-names [business card magnets] 7 names | Large Business Card Magnet; Business Card Magnet with 50 Sheet Notepad; 20 Mil 4-Color Process Business Card Magnet; 20 Mil Jumbo 4-Color Process Business Card Magnet |
| sports schedule magnets | right | right | **right** | magnets, named [magnets] 43 names | Pennant Sports Magnet; Baseball Sports Magnet; Basketball Sports Magnet; Volleyball Sports Magnet |
| appointment reminder magnets | right | right | **right** | magnets, named [magnets] 43 names | Power Magnet - Square; 3" X 3" Square Magnet; Helmet Car Sign Magnet; Show Some Emotion Magnet |
| magnetic shopping lists | mixed | mixed | **no strip** | none | no strip |
| magnetic clips and chip clips | right | right | **right** | none | 4" Chip Clip; 2" Magnetic Memo Clip; Magnetic Rip 'n' Clip Bag Clip; Jumbo Magnetic Memo Holder / Clip |

### B. The three real generations, every strip against its heading


**Topic "custom can coolers": "11 Ways Custom Can Coolers Work for Your Business"** (11 ideas, 1688 words, 63 s)

| idea heading | the model's productType | category, and why | the strip |
| --- | --- | --- | --- |
| Idea 1: Trade Show Giveaways That Get Carried Around | collapsible can coolers | koozies, tail-names [can coolers] 33 names | Collapsible KOOZIE Can Cooler; Koozie Collapsible Slim Can Cooler; Deluxe Collapsible  KOOZIE Can Cooler; Collapsible Neoprene KOOZIE Can Cooler |
| Idea 2: Employee Appreciation Gifts for Milestones | neoprene can coolers | koozies, tail-names [can coolers] 33 names | Koozie Slim Collapsible Neoprene Can Cooler; Reversible Can Cooler; KOOZIE Duo Can Cooler; NFC Connect Can Cooler |
| Idea 3: Safety Program Rewards for Heat Stress Prevention | foam can coolers | koozies, tail-names [can coolers] 33 names | Koozie Slim Can Cooler; Koozie Cork Can Cooler; KOOZIE Woody Can Cooler; American Made Can Cooler |
| Idea 4: Client Thank-You Gifts That Stay on the Desk | leather can coolers | koozies, tail-names [can coolers] 33 names | Original KOOZIE Can Cooler; KOOZIE Magnetic Can Cooler; Britepix KOOZIE Can Cooler; Beer Blizzard Can Cooler Combo |
| Idea 5: Company Picnics and Summer Events | can coolers with bottle opener | koozies, tail-names [can coolers] 33 names | Bottle Opener KOOZIE Can Cooler; Zipper Bottle Cooler; Zip-Up Bottle KOOZIE Cooler; Snuggy Dye-Sublimated Can Cooler |
| Idea 6: Golf Tournament and Charity Event Favors | bottle and can coolers | koozies, tail-names [can coolers] 33 names | Koozie Magnetic Slim Can Cooler; Collapsible KOOZIE Bottle Cooler; Koozie britePix Slim Can Cooler; American Made Thumbs Up Can Cooler |
| Idea 7: Real Estate and New Homeowner Gifts | custom koozies | koozies, exact [koozies] | KOOZIE Glow-in-the-Dark Can Cooler; 13 oz KOOZIE Triple Vacuum Tumbler; Koozie britePix Jersey Can Cooler; KOOZIE Two-Tone Collapsible Can Cooler |
| Idea 8: Brewery, Bar, and Restaurant Promotions | neoprene koozies | koozies, named [koozies] 22 names | Kolder Kaddy Velvet Neoprene; Kolder Kaddy Metallic Neoprene; Liam Burlap-Neoprene Can Insulator; Slim Full Color Neoprene Can Holder |
| Idea 9: Fitness Centers and Sports Team Fundraisers | can coolers with carabiner | koozies, tail-names [can coolers] 33 names | American Made Full Color Can Cooler; American Made Peace Fingers Can Cooler; Full Color Pointy Ears Scuba Can Cooler; 12 oz YETI Rambler Colster Can Cooler |
| Idea 10: Employee Onboarding and Welcome Kits | personalized can coolers | koozies, tail-names [can coolers] 33 names | Basecamp Chilly Slim Insulated Can Cooler; The Puffy Can Cooler, by Puffin Drinkware; Koozie Heather Collapsible Slim Can Cooler; 12 oz Yeti Rambler Colster Slim Can Cooler |
| Idea 11: Customer Loyalty and Referral Programs | wholesale can coolers | koozies, tail-names [can coolers] 33 names | 12 oz Urban Peak Bedrock Trail Vacuum Can Cooler; Golf Can Holder; Pint Size Cooler Wrap; Liam Can Insulator Suede-Ish |

Links placed: none. Reference photos the image step would take (topic words ["cooler"]): Collapsible KOOZIE Can Cooler; Koozie Collapsible Slim Can Cooler; Deluxe Collapsible  KOOZIE Can Cooler; Collapsible Neoprene KOOZIE Can Cooler; strip products refused as references: 7.

**Topic "promotional footballs": "10 Promotional Footballs That Score Big for Bulk Buyers"** (10 ideas, 2796 words, 51 s)

| idea heading | the model's productType | category, and why | the strip |
| --- | --- | --- | --- |
| Idea 1: Mini Autograph Footballs for Client Appreciation | mini autograph footballs | none | no strip |
| Idea 2: Foam Footballs for Trade Show Crowds | foam footballs | none | 7" Foam Football; 7" Two-Toned Foam Football |
| Idea 3: Stress Reliever Footballs for Employee Desks | stress reliever footballs | none | Football Stress Reliever; Football Stress Reliever - 24hr Service; Football Stress Ball; Mini Mood Stress Football |
| Idea 4: Full-Size Composite Footballs for Safety Incentives | composite footballs | none | no strip |
| Idea 5: Mini Plastic Footballs for School Fundraisers | mini plastic footballs | none | no strip |
| Idea 6: Inflatable Footballs for Pool and Beach Promotions | inflatable footballs | none | no strip |
| Idea 7: Football Stress Balls for Financial Services Giveaways | football stress balls | stress-relievers-balls, tail-slug [stress balls] | Stress Ball; Soccer Stress Ball; Baseball Stress Ball; Molecool Stress Ball |
| Idea 8: Youth-Size Footballs for Community Sports Sponsorships | youth-size footballs | none | no strip |
| Idea 9: Football Keychains for Year-Round Brand Impressions | football keychains | none | no strip |
| Idea 10: Football Water Bottles for Game-Day Hydration Stations | football water bottles | water-bottles, tail-slug [water bottles] | 25 oz Infusion Water Bottle; The 16 oz Sport Pint Water Bottle; 27 oz Hermosa Aluminum Water Bottle; 32 oz Baltic Collection Water Bottle |

Links placed: [mini footballs] to /blog/custom-mini-footballs-with-logo-ideas; [Promotional footballs] to /blog/lets-get-loud-four-promotional-football-items-your-company-needs-for-football-season. Reference photos the image step would take (topic words ["football"]): 7" Foam Football; 7" Two-Toned Foam Football; Football Stress Reliever; Football Stress Reliever - 24hr Service; strip products refused as references: 8.

**Topic "custom printed sunglasses": "7 Custom Printed Sunglasses for Events, Crews, and Client Gifts"** (7 ideas, 2008 words, 56 s)

| idea heading | the model's productType | category, and why | the strip |
| --- | --- | --- | --- |
| Idea 1: Trade Show Booth Giveaways That Pull a Crowd | promotional sunglasses | sunglasses, exact [sunglasses] | RB-N Sunglasses; Retro Sunglasses; Promo Sunglasses; Malibu Sunglasses |
| Idea 2: Safety Programs for Outdoor Crews and Job Sites | safety sunglasses | sunglasses, named [sunglasses] 35 names | Panama Sunglasses; Bamboo Sunglasses; Sun Ray Sunglasses; Sun Fun Sunglasses |
| Idea 3: Employee Appreciation and Onboarding Kits | logo sunglasses | sunglasses, exact [sunglasses] | Aviator Sunglasses; Rubberized Sunglasses; Neon Bright Sunglasses; Nike Chance Sunglasses |
| Idea 4: Client Gifts for Realtors, Agents, and Advisors | branded sunglasses | sunglasses, exact [sunglasses] | Two Tone Matte Sunglasses; Rainbow Malibu Sunglasses; Cobra Recycled Sunglasses; Two-Tone Malibu Sunglasses |
| Idea 5: Golf Outings, Charity Tournaments, and Fundraisers | custom sunglasses | sunglasses, exact [sunglasses] | Mirrored Malibu Sunglasses; Patriotic Malibu Sunglasses; Youth Rubberized Sunglasses; Nike Skylon Ace Sunglasses |
| Idea 6: Resort, Hospitality, and Travel Promotions | promotional sunglasses | sunglasses, exact [sunglasses] | Full Color Malibu Sunglasses; Crystalline Malibu Sunglasses; Reflective Rimless Sunglasses; Malibu Sunglasses - Wood Grain |
| Idea 7: Retail Promotions, Grand Openings, and Company Stores | custom printed sunglasses | sunglasses, exact [sunglasses] | Velvet Touch Malibu Sunglasses; Rubberized Mirrored Sunglasses; Gatsby Recycled Frame Sunglasses; Zander Recycled Frame Sunglasses |

Links placed: [sunglasses] to /cat/sunglasses; [custom printed sunglasses] to /blog/9-ways-businesses-use-custom-printed-sunglasses-for-promotions-and-safety. Reference photos the image step would take (topic words ["sunglasse"]): RB-N Sunglasses; Retro Sunglasses; Promo Sunglasses; Malibu Sunglasses; strip products refused as references: 0.
