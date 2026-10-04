# AUTO-201: server-side generation and placed links, the proof run

Measured 2026-10-05 against the production repo's data (`products.json` and `facet-memberships.json` differ from the local repo's; the brief says to read from production) and the live Sanity dataset. **Three real generations were used, the ticket's maximum; every draft they wrote was deleted in the same run and the deletion verified (`count(*[_id == $id])` = 0 for each).** Everything after the run is an offline re-placement over the three captured bodies: the finder re-read (Sanity and disk, no AI), the placer re-run; no fourth generation.

## 1. The premise, corrected against the data

The brief said the links were found and then nothing happened to them. A read of every AI-generated post and draft in production (29 documents: 13 drafts, 16 published; 2026-10-05) says otherwise:

| | count |
| --- | --- |
| suggestions recorded (`aiSuggestedLinks`) | 125 |
| marked "placed in the body" | 118 |
| marked "not placed: no clean anchor" | 7 |
| documents with at least one link in the body | 29 of 29 |
| documents with exactly the old cap of 5 placed | 12 |
| AI-placed links opening in a new tab | 0 |
| self links | 0 |

The route placed links from the day it shipped (P2-AI-002b, `placeInternalLinks` at a cap of 5), and `openInNewTab: false` is what the blog link shape has always written, so same-tab was already true. **What was wrong was the anchor text.** Of the placed anchors, about a third were single incidental words or fragments: `[events]` to the koozies category page, `[business]` to a hats video, `[campaigns]` to a pepper spray video, `[giveaway]`, `[gift]`, `[creative]`, `[Christmas]` (three times, to three different posts), `[for every]`, `[gift ideas for]`, `[ornaments for]`, `[custom ornaments for]`, `[koozies for]`, `[pepper spray for]`, `[recognition for]`, `[ways to use custom]`, and `[custom pepper spray.]` with the full stop inside the link. Three causes in the placer's `label` policy: a single-word fallback that takes any four-letter label word, n-grams never trimmed of leading or trailing function words, and the finder counting generic words such as "custom" as a match, so a target sharing only "custom" or "business" with the topic still got a link.

Suggestions by kind over those 125: blog 62, video 29, category 22, page 9, landing 3. **All five kinds the finder has come back today**; the brief's "blogs and landing pages only" is not what the code does. Landing pages are rare because only a handful exist (city pages such as `/custom-beach-towels-destin-fl` and `/custom-koozies-destin-fl`), so they match only a topic that names their product.

## 2. The three generations

List template, 1500-word target, the panel's defaults. Times are the whole function (two live drafts reads, the AI, the strips, the links, the create).

| shape | topic | title | words | time |
| --- | --- | --- | --- | --- |
| broad | custom tote bags | 9 Smart Ways Businesses Use Custom Tote Bags for Giveaways and Events | 2,131 | 59.2 s |
| narrow | custom stadium seat cushions | 9 Ways to Use Custom Stadium Seat Cushions for Game Day Giveaways and Corporate Events | 2,229 | 57.8 s |
| question | how to choose custom water bottles for employees | 9 Smart Ideas for How to Choose Custom Water Bottles for Employees | 2,216 | 58.1 s |

Checks on all three: self links 0, duplicate targets 0, new-tab links 0, links in a heading, list item or product strip 0, prices in the body 0.

### 2.1 What the run placed, and what the shipped rules place

The run used the first version of the `topic` policy. It placed 15 links, 10 of them good and 5 the same defect in a new coat: a single word whose target is about something wider than the topic. Each of those five led to a rule, and the shipped rules were re-run over the same three bodies.

**Broad, "custom tote bags".** Run: `[tote bags]` (clear sling video), `[canvas tote]` (mono strap canvas video), `[custom tote bags]` (tote bags video), `[bag]` to `/cat/lunch-bags-boxes-totes`, `[tote]` to `/cat/tote-bags`. Shipped rules, 3 placed:

- `[Custom tote bags]` to `/cat/tote-bags` (category)
- `[Tote bags]` to `/videos/custom-clear-sling-tote-bags-for-events` (video)
- `[canvas tote]` to `/videos/custom-mono-strap-canvas-tote-bags-with-printed-straps` (video)

The category page is now first (the finder's own boost, fed the resolved category; on the run it sat behind `/cat/lunch-bags-boxes-totes` on an alphabetical tie). `[bag]` is gone: that page is about lunch bags, boxes and totes, not about tote bags, so it gets no one-word anchor. Nine other targets found, all tote or bag videos and Halloween bag posts, none with a phrase in the text that was not already spent.

**Narrow, "custom stadium seat cushions".** Run: `[Custom stadium seat cushions]` (guide post), `[stadium seat cushions]` (buying guide post), `[seat cushions]` (category), `[seats]` to `/cat/seat-covers`. Shipped rules, 3 placed:

- `[seat cushions]` to `/cat/seat-cushions` (category)
- `[custom stadium seat cushions]` to `/blog/a-guide-to-custom-stadium-seat-cushions` (blog)
- `[stadium seat cushions]` to `/blog/buying-guide-for-stadium-seat-cushions` (blog)

`[seats]` is gone (seat covers are not seat cushions). Of the 12 found, 7 matched on the word "custom" alone (two beach-towel landing pages, an earbuds video, the custom products page, a Halloween bags post, an aluminium cups video, the water bottles page) and are now neither placed nor recorded on the draft. One intermediate version of the rules produced `[Custom stadium]` to `/cat/stadium-blankets`, cut out of "Custom stadium seat cushions" because the "seat" sat in the next span after the earlier link had split the paragraph; the guard now reads across the whole paragraph.

**Question, "how to choose custom water bottles for employees".** Run: `[custom water bottles for employees]` (wellness page), `[water bottles]` (embossed video), `[water]` to a debossed-bottles video, `[bottles]` to a Stanley tumblers video, `[employees]` to a pepper spray post, `[custom water bottles]` (brand visibility video). Shipped rules, 3 placed:

- `[custom water bottles]` to `/cat/water-bottles` (category)
- `[custom water bottles for employees]` to `/custom-water-bottles-for-employee-wellness-programs` (page)
- `[water bottles]` to `/videos/custom-embossed-water-bottles-for-events-gyms-and-employee-onboarding-kits` (video)

`[water]`, `[bottles]` and `[employees]` are gone. One intermediate version placed `[custom water]` on "A custom water bottle belongs in that kit" because the plural folding turned "bottles" into "bottl" and "bottle" into "bottle", so the singular neighbour was not recognised as the same word; the stemmer is fixed and tested. The six other water bottle videos and posts found have no phrase in the text that "water bottles" or "custom water bottles" had not already taken.

### 2.2 Where the placement reads badly, honestly

- `[Tote bags]` to the clear sling tote bags video and `[water bottles]` to the embossed water bottles video are generic words for specific videos. They are correct and read fine, but a reader cannot tell from the anchor that a sling bag or an embossing method is behind them. The label phrase that would say so ("clear sling tote bags", "embossed water bottles") is not in the text.
- Three links a post, not six. The ceiling is six; the data gives three to four because one phrase carries one link and the finder's other candidates share no topic word or have no phrase in the text. Getting to six without forcing would mean taking anchors from the TEXT (an n-gram around a topic word, "insulated water bottles") rather than the label, which links a looser phrase to a specific page. Not done here; it is the next lever if Patrick wants the count.
- No landing page was linked on any of the three. The six landing pages are city pages; a topic that names their product and city would link them.

### 2.3 The product strips (FIX-900 unchanged)

Nothing in the matcher or the dials changed (`lib/ai/related-products.test.ts` still asserts the dials spelled once in the generator and passed on every call). What the three posts carried:

- Tote bags: 9 of 9 ideas got a strip, 8 of them tote bags (canvas, zippered, non-woven, grocery, laminated, laptop totes). One is FIX-900's class (2): an idea resolved to the shoe-bag category and its strip is a shoe caddy, an urban shoe bag and two gym shoe keytags.
- Stadium seat cushions: 3 of 9 ideas got a strip; two of the three drift by class (2) (an idea resolved to the one-colour hot/cold pack category gave a tissue pack, a web cam cover and a gel bead pack; a "weatherproof" idea gave water-resistant duffels and pouches). Six ideas got no strip at all, the skip rule at work.
- Water bottles: 8 of 9 ideas got a strip, 7 of them bottles (stainless steel, Tritan, aluminium, sport, bike); one is bottle accessories (a bottle cooler, a bendable bottle, a bottle opener).

No one-incidental-word strip (the class FIX-900 removed) appeared on any of the three. The class (2) remainder is as FIX-900 left it and is its own ticket.

## 3. The function, the token, the deadlines, the half-failures

**One function, two callers.** `createBlogDraftFromTopic` (`lib/blog-automation/create-blog-draft.ts`): live drafts read, `generateBlogPost` (the route's body, now `lib/blog-automation/generate-blog-post.ts`), live drafts read again, ONE create through `serverSanityClient()`. The blog-topics route's `generate` action calls it for the tab's button; the scheduler calls it next ticket. `generateBlogPost` itself has exactly two callers, that function and the generate-blog route behind the two Studio document actions, which patch an existing draft and create nothing.

**The write token.** `SANITY_API_TOKEN`, read by `serverSanityClient()` (raw perspective, `apiVersion 2024-10-01`), set in Vercel for both environments and in `.env.local`. The browser path needed Patrick's cookie session, the nonce handshake and a same-origin request; the server path needs the token and nothing else. The mutation is attributed to the token's user, not to Patrick.

**Deadlines.** `BLOG_AI_TIMEOUT_MS` = 150 s on the DeepSeek call (`AbortSignal.timeout`, a timed-out call is a `DeepSeekError` with status 504); `maxDuration` 180 on the generate-blog route and 240 on the blog-topics route (inside every Vercel plan's 300). Measured generations here: 57.8 to 59.2 s end to end.

**Half-failures, traced.**

| what fails | what exists afterwards | what the caller sees |
| --- | --- | --- |
| the first drafts read | nothing | 502, "Nothing was generated" |
| the AI (error or 150 s timeout) | nothing | 502 or 504, the DeepSeek message |
| the answer is thin, incomplete, or carries a price | nothing | 502, try again |
| a draft appeared during the wait (second read) | nothing; the AI spend is lost | 409 naming the draft and saying the call was spent |
| the one create | nothing; the AI spend is lost | 502, "The post was written but the draft could not be saved" |
| the create succeeds, the response is lost | one complete draft | the next pool call shows the topic excluded (AUTO-117) |
| the tab is closed mid-wait | one complete draft (the server carries on) | the same |
| two runs read before either creates | two drafts | the compare-and-set claim, next ticket (AUTO-200 2.4) |
