# AUTO-200: what Stage 2 actually costs

Measured 2026-10-03 against the production repo (`pbnj53/perfectimprints`, HEAD `123c4d37`), its production `.env.local`, the live Sanity dataset and today's Search Console pool. Read only: no file in either repo changed, no Sanity document written, no AI route called, no DataForSEO or Ubersuggest call, nothing deployed. The nine files Stage 2 touches are byte-identical in the production and staging repos (md5 compared).

Every number below is a count from this run, not a quote from an older report, unless it says otherwise.

## 0. The short answer

Server-side generation is a small job, and AUTO-116 is the reason. The scheduler is a medium job whose idempotency AUTO-117's record does NOT fully close on its own. The missing fields are a bigger deal than they sound and one of them is silently broken on the 11 posts Patrick has already filled in by hand. Product drift is still bad on every topic-generated draft. Email already exists. The preview button and the header image are the two items that do not fit in the price.

Honest total for everything promised: 10 to 13 working days. The $1,000 buys about 7 to 8 by the Stage 1 yardstick (AUTO-100 to AUTO-124 was eleven tickets for $1,300). Recommendation: build the automation core (Parts 1, 2, 3, the two missing fields, retry, digest) inside the $1,000; defer the preview button and the header image, and do the cheap half of the drift fix only. Section 7 has the order and the groups.

## 1. Server-side generation, the gate

### 1.1 Is the engine still headless?

Yes, and more so than AUTO-000 found. `app/api/sanity/generate-blog/route.ts` is a pure content generator: `POST { title, template, keywords[], categorySlug?, currentSlug?, wordCount? }` returns `{ title, metaTitle, metaDescription, excerpt, body, suggestedLinks }` (route.ts:5-6, 59-68, 371-378). It contains no `patch.execute` and no Sanity write at all. Its only coupling to the Studio is the FIX-850 nonce guard as the first statement of `POST` (route.ts:203-209), which checks a draft document `drafts.generateAuth` written by a signed-in Studio session.

What changed since AUTO-000: FIX-850 added the nonce guard (2026-09-02); FIX-871 made the strips store `custom-<id>` results as references; nothing else. The `patch.execute` AUTO-000 named lives in the Studio action, `sanity/actions/generate-blog-with-ai.tsx:160` and `:182`, not in the route.

### 1.2 What the panel does today, press to draft

`sanity/tools/blog-topics-tool.tsx:705-795` (`generateDraft`):

1. Live re-read of drafts and posts that record a topic, through the cookie-authed Studio client (line 711, `WRITTEN_TOPICS_QUERY`). A failed read stops the generation (lines 712-721).
2. If the topic already has a draft, or is excluded, a `window.confirm` (lines 726, 732).
3. POST to `/api/sanity/generate-blog` through `authFetch` with `{ title: titleCase(topic.query), template, keywords: [topic.query], wordCount: 1500 }` (lines 745-749). The template comes from a panel toggle whose default is `'list'` (line 319).
4. `client.create` of ONE document, `drafts.<uuid>`, carrying title, slug (`slugifyTitle(aiTitle)`), meta, excerpt, body, `aiSuggestedLinks`, `aiTemplate`, `aiTopicKeywords: [topic.query]`, `aiWordCount` and `sourceTopic` (lines 760-776).

Browser-only parts and why: the two `window.confirm`s (a human decision), the Studio client that writes the draft (it carries Patrick's cookie session, so the browser never holds a token), and the nonce fetch. Everything else is a plain function call with no DOM in it.

### 1.3 What has to move, and is it smaller than AUTO-115 assumed?

Smaller. Before AUTO-116 the panel created an empty draft, called the AI, patched the draft and deleted it on failure: four writes with state in the browser between them. AUTO-116 collapsed that to "call the AI, then one `create`" (lines 692-700 of the panel comment say so). So the server-side version is: the generator's body plus one `create`. Concretely:

- Move route.ts lines 217-378 (title through response assembly) into a server function, say `lib/blog-automation/generate-blog-post.ts`, taking the same inputs and returning the same object. The route keeps its guard and body parsing and calls it. Zero behaviour change for the Studio action.
- Add `createBlogDraftFromTopic(topic, opts)` in a server-only module: `readWrittenTopicSources()` (already server-only, `lib/blog-automation/written-topics.ts:70`), the generate call, `buildSourceTopicRecord` (`lib/blog-automation/topic-pool.ts`, already exported), then one `create` through `serverSanityClient()` (`lib/sanity/studio-nonce-auth.ts:69-85`, already `perspective: 'raw'`, already carries `SANITY_API_TOKEN`). The document shape is the panel's lines 760-776 verbatim, plus what the panel today leaves blank (Section 4).
- The panel calls that function through a new action on the blog-topics route (`{ action: 'generate', key }`), behind the same nonce guard the route already has (`app/api/sanity/blog-topics/route.ts:107-113`), and drops its own `client.create`. The two `confirm`s stay in the browser and become a `force: true` flag on the request.

### 1.4 The write token

`SANITY_API_TOKEN` is in Vercel for both environments (the written-topics read on the live panel proves it) and in `.env.local`. Two server clients already wrap it: `serverSanityClient()` (nonce-auth.ts:69, raw perspective, used for reads AND documented as usable for writes) and `getSanityWriteClient()` (`lib/sanity/write-client.ts:17`, used by the leads and quote routes). A server write needs nothing the browser path has: no nonce, no cookie, no Origin. What it loses is Patrick's identity on the mutation (the Studio client writes as him; the token writes as the token's user). The draft's `sourceTopic.recordedAt` and the run log (Section 2.4) are what say "the scheduler did this".

### 1.5 Does it break the panel's button?

No, if the move is done as above: one function, two callers (panel action and scheduler). The test in `app/api/sanity/blog-topics/route.test.ts` already drives the real POST with fakes; a `generate` action joins it. The hazard to avoid: leaving the panel's `client.create` in place beside a server create, which is the two-code-paths outcome the brief warns about. Delete it.

### 1.6 Size

About 300 lines moved, 150 to 200 added (function, route action, panel call, tests). One deploy, zero manual Sanity step (no new type). 1 to 1.5 days. This is the prerequisite for everything else in Stage 2 and should be the first deploy.

One thing to fix while there: none of the generate routes sets `maxDuration` (`grep maxDuration app` finds only quote-pdf 60, blog-topics 180, bulk-import 300, generate-portfolio 60). Under Fluid compute the default is 300 s on Hobby and Pro alike (Vercel functions limits page, read 2026-10-03), so today's 50 to 70 s generations are safe, but the scheduler route should set it explicitly rather than inherit.

## 2. The scheduler

### 2.1 Where it runs

What exists: eight GitHub workflows, all `workflow_dispatch` (every cron commented out or removed, `.github/workflows/scrape-*.yml:4-11`, `monthly-rebuild.yml:63-81`), no `vercel.json` (the file does not exist), so no Vercel cron anywhere. The repo's Actions secrets hold `DEEPSEEK_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` and deliberately NO Sanity token (CLAUDE.md Section 13, "No Sanity secrets").

Options measured against a one-to-two-minute generation:

| Where | Time limit | Auth | Needs |
| --- | --- | --- | --- |
| Vercel cron to a route in this app | Function `maxDuration`: 300 s default and maximum on Hobby, 800 s on Pro (Vercel limits page) | Vercel sends `Authorization: Bearer <CRON_SECRET>` when that env var is set | A `vercel.json` `crons` entry, one new env var. Hobby: 100 crons, ONCE PER DAY each, fired within a 59-minute window; Pro: per minute. |
| GitHub Actions `schedule` | 6 h per job | Repo secrets | Adding `SANITY_API_TOKEN`, `GSC_SERVICE_ACCOUNT_JSON_B64`, `DEEPSEEK_API_KEY` to Actions on BOTH repos; a tsx runner that rebuilds the pool from scratch each run (60 s, 46 Search Console requests) because it cannot read the app's data cache |
| Sanity scheduled publishing | n/a | n/a | Publishes an existing draft at a time; does not generate. Could be the "publish mode" half, not the engine |

What fits: the Vercel cron. It reaches the cached pool snapshot (`getCachedTopicPoolSnapshot`, `lib/blog-automation/cached-topic-pool.ts:144`) for free, the live drafts read, the settings read and the write client, all in one process that already holds every secret. The GitHub route would re-pull Search Console on every run and put a Sanity write token into Actions, which this project has refused so far. Plan caveat, unverifiable from the repo: Patrick's Vercel plan is not recorded anywhere; on Hobby a cron can fire once a day and lands anywhere within the hour, which is fine for this job.

### 2.2 One run of two, or two runs of one

Two runs of one, as two cron entries at different hours (works on Hobby, which allows 100 daily crons). Reasons: a generation is 50 to 70 s and a run of two is 2 to 3 minutes against a 300 s ceiling with retries inside it; one failure then costs one post, not both; and the second run's live re-check sees the first run's draft, so the pair cannot write the same topic even when the snapshot has not changed. The daily cap (Section 3) is then "how many runs may write today", checked against the run log, not against a counter inside one run.

### 2.3 The live re-check

It exists and is the right shape: `readWrittenTopicSources()` is `cache: 'no-store'`, raw perspective, one GROQ query (written-topics.ts:76). AUTO-117 measured 1.1 to 1.5 s from Pakistan; from a Vercel function it will be less. The scheduler calls it, picks a topic from the cached snapshot that the live read does not cover, generates, then calls it AGAIN immediately before the create (another run or Patrick may have written it during the 60 s). A failed read must mean "write nothing", exactly as the panel does (panel lines 712-721).

### 2.4 Idempotency, and whether AUTO-117's record closes it

Partly. The record (`sourceTopic`, keyed by `queryTopicKey` recomputed at read time) makes a draft visible to the next run within a second of its creation, so two runs an hour apart cannot duplicate. It does NOT close two OVERLAPPING runs: both read the drafts before either creates, both see nothing, both create. AUTO-117 said so ("run one scheduler instance at a time (two overlapping runs could both read before either creates)"). Two triggers that make overlap real: a Vercel cron retried after a timeout, and Patrick pressing Generate in the panel at the moment the cron fires.

What closes it: a compare-and-set claim before generation. The pattern already exists twice: `allocateQuoteNumber` in `lib/quotes/numbering.ts` and the PORT-170 usage counter in `lib/portfolio/ai-usage.ts`, both an invisible unregistered document patched with `ifRevisionId`. A `blogAutomationRun` document per UTC day holding the topic keys claimed today, claimed BEFORE the AI is called (so a failed generation still holds the claim until the run releases it), gives one winner per topic per day and is also the daily cap's counter and the digest's source. About 120 lines plus tests, and it is the piece Stage 2 cannot skip.

### 2.5 The deleted-draft case

Agreed behaviour: deleting a draft removes the record, the topic returns to Usable, the next run writes it again (`app/api/sanity/blog-topics/route.test.ts` asserts the return). Options, not chosen:

1. Leave it. Patrick ticks Block when he deletes a draft he does not want again (what the guide tells him today). Cheapest; relies on him remembering.
2. The run log remembers. The `blogAutomationRun` documents from 2.4 are never deleted, so a topic claimed in the last N days is skipped even if its draft is gone. A deleted draft returns to the PANEL at once but the SCHEDULER leaves it alone for N days. Keeps Ali's decision for the panel, changes it only for the machine. Small.
3. Delete writes a block. A Studio document action on blogPost drafts ("Delete and block topic") that unsets the draft and inserts a `scope: 'topic'` negative keyword in the same transaction. Medium; adds a button Patrick has to choose over the stock Delete.
4. The scheduler never re-writes a topic it has written itself, ever, by reading the run log without a window. Simplest rule, but a topic deleted by mistake can then only be regenerated by hand.

### 2.6 Half-failures

- AI answered, write failed: nothing exists but the claim in the run log (2.4). The run releases the claim on a write failure and the next run tries again; the DeepSeek spend is lost (about half a cent, Section 5.1). Today's panel has the same shape and prints "No draft was created" (panel line 785).
- Write succeeded, the run then failed (digest, revalidate): the draft exists and is recorded; the next run sees it through the live read. Nothing to do.
- Timeout mid-generation: Vercel returns 504, the function is killed; the claim stands until released or expires. The claim needs a time-to-live (say 15 minutes) so a killed run does not hold a topic all day.

## 3. The settings and the switches

### 3.1 Where they live

`globalSettings.blogAutomation` is already an object (not a bare array) precisely so these become sibling fields with no migration (`sanity/schemas/singletons/global-settings.ts:557-563`). `globalSettings` is in the webhook Filter in both environments, so no dashboard step. Confirmed.

New fields: `enabled` (boolean, default off), `postsPerDay` (integer, 0 to 2 or more), `mode` (`draft` default or `publish`), `defaultAuthor` (reference to `author`, see 4.1), `digestRecipient` (email, default patrick@). Resolver: `resolveBlogAutomation` (`lib/sanity/queries/global-settings.ts:325-337`) grows four lines each.

### 3.2 Does a scheduler read settings the way a page does?

Yes, with one caveat. `getSiteSettings()` is React `cache()` plus a `cachedClient.fetch` tagged `SETTINGS_TAG` with `revalidate: false` (global-settings.ts:35, 479). In a route handler the tagged fetch goes through Next's data cache exactly as it does in a render, and the `globalSettings` webhook branch busts `SETTINGS_TAG` (`app/api/sanity/revalidate/route.ts:334-336`), so a switch flipped in Studio reaches the cron route within seconds. The blog-topics route already reads settings this way (route.ts:166). The caveat: the off switch must be read at the START of the run and again before the write, because a run can span a minute and Patrick may flip it during that minute.

### 3.3 Publish mode

Draft mode is the panel's behaviour today. Publish mode means the scheduler creates the PUBLISHED document (id without `drafts.`) and must itself do what the Studio does on Publish:

- `publishDate`: AUTO-116 moved the stamp into the Studio's Publish action (`sanity/actions/stamp-publish-date.tsx`), which a server write bypasses. The scheduler sets it. Without it the post has no date and the blog list sorts it to the end.
- The webhook fires on any mutation regardless of source, so a published post gets `blogPostTag(slug)` + `/blog/<slug>` (revalidate route.ts:210-213), `BLOG_LIST_TAG` + `/blog` + `/sitemap.xml` (lines 381-383) and the search delta (line 409). Nothing to add.
- Feeds: the site has no RSS or Atom feed (no file under `app/` or `lib/` mentions rss, atom or feed.xml; the one grep hit is `gsc-client.ts`, unrelated). So publish mode changes nothing about feeds because there are none.
- The CTA body: the 2026-07-13 backfill wrote `ctaBody` onto every published post; a scheduler-published post would render the code default, which is the same text. Fine.

### 3.4 Size

Half a day for the fields, resolver, tests and guide section. Publish mode adds the stamping and the author, a quarter day. Both ride the scheduler deploy.

## 4. The missing fields

### 4.1 Measured

Published posts (anonymous GROQ, 2026-10-03):

| | count |
| --- | --- |
| Published posts | 660 |
| with `categories` | 587 |
| with `relatedCategorySlugs` | 336 |
| with a header image | 645 |
| with an author | 653 |
| Published AI posts (`aiTemplate` set) | 15, of which 13 have categories, 6 have relatedCategorySlugs, 15 have a header image, 13 have an author |
| Drafts (token read) | 101, of which 14 are AI drafts never published: 3 with categories, 0 with relatedCategorySlugs, 0 with a header image, 4 with an author |

The "23 already generated from a topic" are the 23 written sources (11 never-published drafts, 12 published by keyword, 4 carrying `sourceTopic`). The 15 published ones got categories, images and an author because Patrick added them by hand before publishing. The 14 drafts have none of it, and the engine has never written any of these fields (route.ts:371-378 returns none; the panel create at lines 760-776 sets none).

A generated post without `categories` renders (the page guards every use: `app/blog/[slug]/page.tsx:77-78, 114`) but appears under no `/blog/cat/<slug>` page. A post without an author renders without the "Author:" line (page.tsx:204). A post without `relatedCategorySlugs` appears on no category page's Related Blogs section (`lib/sanity/queries/related-blogs.ts:22-24`).

**Found, not asked: the 6 AI posts and 5 others that DO have `relatedCategorySlugs` are invisible anyway.** The query matches `$slug in relatedCategorySlugs` where `$slug` is the bare root slug the category page passes (`app/cat/[...slug]/page.tsx:562`, `rootSlug`). 325 posts store bare slugs (`["ornaments"]`); 11 posts, every one filled in by Patrick since July, store paths: `/cat/ornaments`, `/cat/ornaments/theme/christmas`, `/cat/bags/theme/halloween`, `/cat/candy?price-min=10`. None of those 11 can ever match. The field accepts any string (blog-post.ts:160-167, no validation) and its description says "root category slugs" without an example. Fix is two lines in the query (strip a `/cat/` prefix and anything after the first `/` or `?`) or a normaliser on both sides, plus a validation message. Must ship with Stage 2 or the scheduler's own values follow whichever convention the brief picks and half the posts stay dark.

### 4.2 Is the ranking page a usable signal?

For `relatedCategorySlugs`, yes, measured today over the 2,233 usable topics (harness run from the production repo, same builder as the route):

| Ranking page of the usable topic | count |
| --- | --- |
| `/cat/` root | 719 |
| `/cat/` facet | 495 |
| `/cat/` modifier | 23 |
| `/cat/` URL not in the 22,180 list | 121 |
| `/products/` | 675 |
| `/videos/` | 49 |
| home | 45 |
| other (brands, facets pages, industry, theme, rush) | 106 |

1,237 of 2,233 usable topics (55%) rank with a `/cat/` page that is in `category-urls.json`, and 1,234 of those resolve to one of 237 distinct roots (top: sports-balls 48, water-bottles 42, coolers 37, balloons 33, pens 31, koozies 26, sunglasses 25). Among the 929 usable 90-day topics, 605 (65%) have such a page. So `relatedCategorySlugs = [rootSlug of the ranking page]` is correct for over half the pool with no AI, and a root facet URL gives the root for free. For the other 45% (products, videos, home), `resolveCategoryForKeywords(topic.query)` in `lib/ai/related-products.ts` already maps a phrase to a root and is what the strips use; it is the fallback.

For `categories` (the blog taxonomy), no. The 39 `blogCategory` documents are editorial, not product categories: 274 of 587 categorised posts sit in `promotional-product-ideas`, then `beach-promotional-items` 38, `marketing` 36, `school-spirit-items` 36, `christmas` 35; 16 categories have zero posts. No mapping from a root slug to a blogCategory exists anywhere. The honest options: (a) every generated post gets `promotional-product-ideas` plus `christmas`/`halloween`/`beach-promotional-items` when the topic's words say so (a 10-line rule); (b) Patrick keeps assigning by hand, which he has done on 13 of 15. Recommend (a) as the default with the field editable, and say so to Patrick.

### 4.3 Product drift, re-measured

Still bad, on every one of the five topic-generated drafts of 2026-09-28/29 (strips read with the token and resolved against `products.json`):

- "custom koozies": strip 1 is coolers and a trunk organiser, strip 2 is four laptop sleeves, strips 3 and 4 are cooler bags and a 54-quart Coleman; koozies only appear from strip 5.
- "custom sunscreen": strip 5 has a lint stick and two hockey sticks, strip 6 four bottle bags and wine totes, strip 7 a golf kit and a pet ID kit, strip 8 three carabiners, strip 9 golf accessories.
- "promotional measuring cups": stadium cups, party cups, a highlighter, notebook sets, a bone-shaped pen, two shaped pencils.
- "custom wine openers": multi-tools, jar openers, two infant bodysuits, a flashlight.
- "promotional ornaments": the best of the five, but strip 3 is four photo frames.

The published "custom printed sunglasses" post (AUTO-115's) is clean: 32 of 32 resolved products are sunglasses. The difference is the topic: one Geiger shelf covers sunglasses; "sunscreen", "koozies" and "wine openers" do not resolve to a single clean root, so the per-idea `productType` ("golf kits", "bottle bags") drives `resolveCategoryForKeywords` and then the catalog top-up at `STRIP_MIN_SCORE = 1` (route.ts:55), where one shared token ("stick", "bottle", "kit", "cup") is enough. FIX-871 changed how strips are STORED, not how they are matched, so it did not touch this.

The dials named by AUTO-000 are still the dials: `MIN_STRIP_PRODUCTS = 2` (route.ts:50) and `STRIP_MIN_SCORE = 1` (route.ts:55). Cheap half: raise the catalog top-up floor to 2 shared significant tokens while leaving the category branch at 1, so a strip is skipped rather than filled with hockey sticks; the text still stands. Measure on these five drafts before and after. Deeper half: pass the post's own topic tokens as a second gate on every idea strip (a koozie post's "cooler bags" idea is on-topic, its "laptop sleeves" idea is not). The deeper half needs a day of measurement; the cheap half is a quarter day.

Two published strips also carry dead SKUs (524800 and 527734 on the sunglasses post, no longer in `products.json`): the resolver drops the card, so the row is one shorter. The monthly prune only touches category JSON, never post strips. Reported, not sized.

### 4.4 `replacementBySku`

Still true: the three `matchRelatedProducts` calls in the route pass `hiddenSkus` and no `replacementBySku` (route.ts:279-286, 291-298, 328-334); the matcher's docstring says the generate routes do not pass it (related-products.ts:81-89). Does it matter: only for SKUs a published product page claims through `replacesGeigerSkus`. The hide side already works (the claimed SKU is in `siteWideHiddenSkus()`), so a claimed Geiger product is never persisted; what is lost is that Patrick's own page is not offered in its place in a NEW strip. One claimed SKU exists live today. Fix is passing `getHiddenProductContext().replacementBySku` through, a quarter day including the test; the FIX-871 helper already stores the result correctly.

### 4.5 Sizes

`relatedCategorySlugs` from the ranking page plus the slug-format fix: half a day. `categories` rule (a): quarter day plus Patrick's yes. Author: `defaultAuthor` setting, quarter day (covered in 3.1). Drift, cheap half: quarter day; deeper half: 1 day. `replacementBySku`: quarter day.

## 5. The parts nobody has looked at

### 5.1 Retry

None exists. `generateJson` (`lib/ai/deepseek.ts:45-96`) is one `fetch` with no timeout and no `AbortSignal`; a hung DeepSeek call runs until the function's 300 s. The route returns 502 for three things: a structurally invalid answer (route.ts:242-247), a thin post under 70% of target (lines 252-261), and any `DeepSeekError` (lines 380-386); the Studio and the panel tell Patrick to click again. How often: not measurable, because nothing records failures (no log store, no Vercel log access from here). The one recorded case is the 963-word first run (TASKS.md:1896). The four drafts of 2026-09-29 were created at 18:14:27, 18:15:15, 18:15:40 and 18:15:55, which means Patrick fired them in parallel from the panel and all four succeeded.

What a retry would retry: the AI call, once, on the two retryable classes (thin, structurally invalid, and 5xx/network from DeepSeek), with a 120 s timeout on each attempt so two attempts fit in 300 s. Not retried: a 4xx from DeepSeek (key, quota) or a failed Sanity write (next run). Half a day including the timeout.

Cost per attempt: `deepseek.ts:15` sends model `deepseek-chat`. DeepSeek's pricing page (read 2026-10-03) lists only `deepseek-flash` and `deepseek-v4-pro` and does not mention `deepseek-chat`; the changelog's last statement about it (2025-12-01) maps it to V3.2 non-thinking, and it worked on 2026-09-29. At flash-class prices (0.15 to 0.30 USD per million input, 0.60 to 1.20 output) a post of roughly 2,500 input and 5,000 output tokens is under a cent; two posts a day is about USD 5 a year. The alias question is a finding for Section 8.

### 5.2 The morning email

Exists. `lib/email/gmail-smtp.ts` holds a Nodemailer Gmail transporter (`GMAIL_USER` + `GMAIL_APP_PASSWORD`, lines 37-40, throws when missing) and a generic `sendBuiltEmail({ to, cc?, replyTo?, subject, text, html, attachments? })` (lines 194-220) that the form-builder, catalog and quote emails already use; `scripts/monthly/send-summary-email.ts` sends the rebuild digest the same way. The credentials are in both Vercel environments (the leads route works). The digest is a pure builder (subject, text, html) over the day's run-log documents plus one `sendBuiltEmail`, sent by a third cron entry in the morning or by the second run of the day. Half to one day. No new service, no new secret.

### 5.3 The preview button

Nothing exists. No `draftMode`, no preview route, no presentation tool: `sanity.config.ts` loads `visionTool` only (line 33), the preview client was deleted in Q-175 (`lib/sanity/client.ts:16-22`), and `/blog/[slug]` is `dynamicParams = true` + `revalidate = false` reading the `published` perspective only (page.tsx:40-41). A real-page preview of a DRAFT needs: a route that enables Next `draftMode()` with a secret, a tokened raw-perspective read in the blog page when draft mode is on (and only then, or the static contract of every `/blog/<slug>` breaks), a Studio action that opens the URL, and a test proving the published render is byte-identical with draft mode off. `next-sanity` 9.8 is already installed and has the helpers. 1.5 to 2 days, and it is the one Stage 2 item that touches a static render path. Defer unless Patrick asks for it by name; the body is readable in Studio and the AUTO-116 Fill button lets him edit before publishing.

### 5.4 The header image

The engine has never set `headerImage` (0 of 14 AI drafts have one; all 15 published AI posts got theirs by hand). Options, not chosen:

| Option | Per post | Build | Notes |
| --- | --- | --- | --- |
| Gemini image generation on the existing key | Nano Banana 2 Lite about USD 0.034 per 1K image, Nano Banana 2 USD 0.045 to 0.151, Pro USD 0.134 (Google pricing page, read 2026-10-03; no free tier). Two posts a day: USD 25 to 110 a year | New call in `lib/ai/gemini.ts` (image output, not vision), upload bytes as a Sanity asset, alt text. 1 to 1.5 days | Generic AI imagery, not Patrick's product photos; a second model constant and cap |
| Category-keyed library | 0 | A Sanity type or settings array mapping root slug to an uploaded image, picked by the post's `relatedCategorySlugs[0]`, falling back to a generic set. Half a day of code | Patrick supplies the images: 237 roots appear among usable topics today, so at least a few dozen to be useful |
| Patrick's own method (ChatGPT with his photos) | His time | Nothing | Stays manual; the digest can list drafts without an image |
| Geiger product photo | 0 | Small | Not allowed: `headerImage` is a Sanity asset, so this means downloading a Geiger image to our origin, which Section 18 forbids except brand logos. Hot-linking would need a new URL field and a page change |

## 6. What Stage 1 changed

### 6.1 Today's figures (production repo, 2026-10-03)

| | |
| --- | --- |
| Topics | 4,420 (2,358 from 90 days, 2,062 added by 16 months) |
| Usable | 2,229 (2,233 before the 4 blocks) |
| Excluded | 2,187: shared tokens 706, ranking page 677, both 779, already written 15, already ranking 10 to 15 (differs between runs with the live drafts) |
| Blocked | 4 |
| With a search volume figure | 1,635 terms with a figure, 592 looked up with no figure, 0 failed; 2,226 of 2,229 usable topics have a current figure, 3 cannot be sent |
| Written sources | 23 (11 never-published drafts, 4 recorded, 19 by keyword) |
| Published posts | 660; drafts 101 |
| Pool build | 51 to 65 s in three runs today (AUTO-121 measured 57.6 to 93.2) |
| Cache entry | 959,912 bytes packed against the 1.6 MB budget; 0 topics trimmed |
| Embedding | 4,420 topics against the 3,000 cap: 1,420 without closest-wording figures |

The brief's 4,413 is 4,420 today; 2,229 usable holds. The volume file was committed after AUTO-124 (`--commit` has run: 1,635 figures, balance USD 50.19), which the AUTO-124 paragraph in CLAUDE.md predates.

### 6.2 Does anything behave differently at 4,420?

The cache fits with 40% headroom. Build time is unchanged. The embedding cap now leaves 1,420 topics without figures, as AUTO-121 designed. Panel responsiveness at 4,420 rows was not measured here (it needs a browser; AUTO-121 did not measure it either). A scheduler reads the same snapshot and is indifferent to the row count; it only ever picks one topic.

### 6.3 Older findings now wrong or stale

- AUTO-000's 196 uncovered catalogue roots: AUTO-100 corrected it to 374 to 389; stands.
- AUTO-000's "the only Studio coupling is one patch.execute": there is none in the route; the coupling is the nonce guard, added after AUTO-000.
- AUTO-115's "generation and the patch run in the browser": the patch is now a single create after the AI answers (AUTO-116), which is what makes Part 1 small.
- AUTO-117's "zero of 659 published posts carries sourceTopic": still true (0 of 660); 4 drafts carry it.
- The AUTO-124 paragraph's "`--commit` was never run": it has been.
- The pool counts in AUTO-110 (2,423 topics, 1,000 usable) and AUTO-119 (2,392, 967) describe the 90-day pool before the 16 months; today's 90-day usable is 929.

### 6.4 Half-done, or things a scheduler would break

- The panel's `template` toggle defaults to `'list'` and the scheduler has no toggle; it needs a rule (list by default; single when the topic resolves to one clean root, say).
- `titleCase(topic.query)` is the title sent to the AI; the AI returns its own title. Fine, but the scheduler should keep the same call so drafts look the same whichever path made them.
- The engine never sets `author`, so published-mode posts show no author line; 7 published posts already have none.
- `stamp-publish-date` is Studio-only (Section 3.3).
- `relatedCategorySlugs` format mismatch (Section 4.1) means the scheduler's values must be bare root slugs or the query must normalise; decide once.

### 6.5 Found, nobody asked

1. The 11 hand-filled `/cat/...` related-category values that match nothing (4.1).
2. `deepseek-chat` is absent from DeepSeek's pricing page (5.1). It still answers, but a model name that no longer appears in the price list is one to re-check before a scheduler depends on it twice a day. Also sent by `generate-content`, `generate-schema` and the Python pipeline.
3. Dead SKUs in published strips are never pruned (4.3).
4. The link suggester used for Related Videos on product pages scores on raw title tokens with no stop-word stripping (`lib/ai/internal-links.ts:63-81`): on the 660 posts, 654 match at least one video and 633 match four, but with reasons like "custom, your", "for, and", "custom, that". The guard strips generics before calling it (`detectorInput`); the product page does not. This decides the Related Videos strip's design (Section 9).
5. A `/cat/` ranking page is a strong `relatedCategorySlugs` signal (4.2), which nobody had measured.

## 7. The order and the honest price

### 7.1 Dependencies

1. Server-side generation (Part 1): everything else needs it.
2. Run-log claim + settings fields (2.4, 3.1): the scheduler needs both to be safe and switchable.
3. Scheduler, draft mode (2.1 to 2.3, 2.6), retry (5.1), missing fields `relatedCategorySlugs` + author + slug-format fix (4.1, 4.2), `replacementBySku` (4.4), cheap drift dial (4.3): the first real automation.
4. Digest (5.2), publish mode (3.3), `categories` rule (4.2 after Patrick's answer), deleted-draft option (2.5 after Ali's choice).
5. Deferred: preview (5.3), header image (5.4), deep drift fix (4.3).

### 7.2 Deploys

- Deploy A: Part 1 only, with the panel switched to the server path. Visible change to Patrick: none. Lets a week of panel use prove the server write before anything runs unattended.
- Deploy B: settings fields, run log, cron route in DRAFT mode with `enabled` defaulting to off, retry, the two missing fields, slug-format fix, `replacementBySku`, drift dial. Needs `CRON_SECRET` in Vercel and a `vercel.json`. Patrick turns it on from Studio.
- Deploy C: digest, publish mode, `categories` rule, deleted-draft option.
- Separate line: Related Videos (Section 9).

### 7.3 Total

Days, from the sizes above: A 1 to 1.5; B 4.5 to 6 (scheduler 2 to 3, run log and settings 1, retry 0.5, fields and fixes 1 to 1.5); C 1.5 to 2.5; deferred items 3 to 4.5. Everything promised: 10 to 13 days. Without the deferred items: 7 to 10.

Is "mostly assembly of proven parts" still honest? For Deploy A and most of B, yes: the generator, the live read, the settings read, the write client, the webhook, the mailer and the compare-and-set pattern all exist. It was never honest for the preview button (no preview machinery exists and it touches a static route) or the header image (no image generation exists, and the cheapest option needs Patrick's photos), and the brief's own list puts both inside the $1,000. So: the core is a $1,000 job; the full list is not.

### 7.4 What to cut or defer

Defer the preview button and the header image, and do only the cheap drift dial. That brings the work to 7 to 10 days, which is the price. Of the two deferred, the header image is the one Patrick will feel first (every scheduler draft has none), and the library option is the one that costs him nothing per post; it is worth a separate conversation with a price.

## 8. The Related Videos strip ($350, separate)

What exists to reuse: the product page's pattern, `app/products/[slug]/page.tsx:300-331` (`suggestLinksForKind('video', keywords, 4)` plus `getVideoSummariesBySlugs`, rendered with `VideoCard`, lines 675-680), the `VIDEOS_TAG`-tagged read so a video publish refreshes every host without a webhook change, and 130 published videos (114 with categories).

What it does not give: relevance. Measured today on the 660 published titles against the 130 video titles, the raw matcher gives 654 posts a match and 633 posts four matches, and the most-matched videos are the generic ones ("best promotional products for business buyers" matched 167 posts, "for women" 145) on shared words like "custom", "for", "and", "that". A strip built that way would show the same five videos on most posts. The strip needs the generics stripped (the `NON_SIGNIFICANT_MATCH_WORDS` set the guard and the product matcher already use) and a floor of one significant shared token, so a post with no genuinely related video shows nothing. Expect coverage to drop a long way from 654; that is the honest number, and the manual `relatedVideos[]` field is how Patrick fills the gaps.

Size: a `relatedVideos[]` reference field on blogPost (manual first, auto top-up), the strip under the post above the Order Today CTA, the stripped-token scoring, a measurement pass over the 660 titles before and after, tests. 1 to 1.5 days. It needs no backfill: every one of the 655 existing posts gets the strip at render, and the posts are `revalidate = false`, so a `BLOG_LIST_TAG`-style bust or a redeploy is what makes them re-render once. It is independent of Stage 2 and should be its own deploy, so a Related Videos regression can never be confused with a scheduler one.

## 9. What could not be verified

- Patrick's Vercel plan (Hobby or Pro) and whether Fluid compute is on for the project: not in the repo, not accessible without logging in. Both plans allow daily crons and a 300 s default duration under Fluid compute, so the design does not depend on it.
- How often generation fails in production: nothing records it.
- What `deepseek-chat` maps to today and what it costs: DeepSeek's pricing page no longer names it.
- Panel responsiveness at 4,420 rows: needs a browser.
- AUTO-000, AUTO-115 and AUTO-120 reports: not in either repo (only AUTO-100, 110, 117, 119, 121, 123 are under `docs/blog-automation`), so their figures are quoted from the brief and from TASKS.md, not re-read.

## 10. Git status

Production repo (`patrick-perfectimprints/perfectimprints`): clean after the run; the measurement harness lived in `tmp/auto-200/` and was deleted. Staging repo (working directory): clean apart from this report, a new untracked file at `docs/blog-automation/AUTO-200-stage-2-sizing.md`. No tracked file changed in either repo, no commit, no push.
