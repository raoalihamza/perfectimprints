# AUTO-203: make the images real and the titles different (2026-10-08)

Code complete, staged in all three repos, not committed, not deployed. One deploy.

## 1. Generations, images and cost

| What | Count | Cost |
| --- | --- | --- |
| Blog generations (DeepSeek, the real `createBlogDraftFromTopic` path) | 4 | about USD 0.02 |
| Images generated (1,120 image tokens each) | 5 | USD 0.335 |
| Image calls that returned no picture (NO_IMAGE) | 1 | 0 image tokens billed |
| Scene plans (gemini-3.5-flash-lite, text) | 5 | about USD 0.002 |
| Read-back checks (gemini-3.5-flash-lite, vision) | 5 | about USD 0.004 |
| Search-grounding probes (text only, no image) | 3 | about USD 0.001 |

A fifth harness launch (the first tote bags attempt) wrote an empty log and created no draft; the process died before its first line, so whether it reached DeepSeek could not be read back. Every draft (4), every uploaded header asset (4) and the day's `blogImageAiUsage` counter were deleted and verified gone. The cleanup's belt query also removed one unreferenced generated-header asset uploaded earlier that day by Ali's own "Generate another header image" test; no document referenced it, so no post lost a picture. The pictures and records are at `C:\Users\aliha\Documents\perfectimprints-archive\auto-203-images\`.

## 2. The planner

**What it reads:** the post's title, its topic (the search it was written for) and the names of its reference products (the strip products carrying a topic word, the AUTO-202 rule). **What it writes:** the surface the product sits on or attaches to, the room or place, who is in frame, two to four things around it, the text that genuinely belongs on the product, and what would be physically wrong.

**Model:** `GEMINI_MODEL` (gemini-3.5-flash-lite), the vision model the check already uses, through the new text-only `generateJsonFromText`. Measured on the five plans of this run: 350 to 510 tokens, 1.3 to 2.1 s, about USD 0.0004 each.

**Search:** not available and not used. Google's pricing page (read 2026-10-08) lists Grounding with Google Search as "Not available" on the standard tier of every Gemini 3.x model, and offers it only on a Priority tier of 3.7 and 3.8 Flash (5,000 free a month, then USD 14 per 1,000). A probe with `tools: [{google_search: {}}]` attached answered HTTP 200 with no `groundingMetadata` on 3.5 Flash-Lite and on 3.5 Flash, so the tool is silently ignored; 3.5 Flash also spent 984 thinking tokens and cut its own answer off at the 1,024-token limit. The lite model with no search answered the magnet case correctly on the first probe (surface "the side of a stainless steel refrigerator", avoid "laying flat on a horizontal table or being held up in a person's hand"). Search was not worth building, and the code comment on `generateJsonFromText` says why.

**Physically possible, enforced three ways:** the planner is told the rule with examples; its `avoid` line goes into the image prompt as "Physically wrong, and not to be shown"; and the read-back check asks whether the product is somewhere it could not physically be, which refuses the picture and retries once with the problem named. The pure chain test drives the magnet-on-wood refusal through that retry.

**Cost per picture now:** planner 0.0004 + check 0.0008 + image 0.067, about USD 0.068; about USD 50 a year at two posts a day (AUTO-202 said 49).

## 3. The magnet image

Topic "promotional calendar magnets", the case that failed twice. The planner chose "the front of a stainless steel refrigerator in a bright kitchen", product text "2027 calendar grid", avoid "hanging on a wooden cabinet, glass door, or drywall where magnets do not stick". The picture (9.8 s, 3 reference photos, passed the check first time): three calendar magnets, a magnetic memo pad with a pen and a dry-erase monthly calendar, all on a stainless steel refrigerator door, a toaster and a succulent on the counter beside it. **Publishable: a magnet on metal, carrying a calendar.** The month names read; the day numbers inside the twelve small grids are soft at 1K, which is noted below.

## 4. The titles

Patrick's six, 2026-10-08:

- 9 Custom Wine Openers
- 9 Promotional Footballs Ideas
- 9 Promotional Measuring Cups
- 9 Promotional Ornaments
- 9 Custom Sunscreen Giveaway Ideas
- 9 Custom Koozie Ideas

The four of this run, each from the real generation path with Draft style on "Chosen from the topic":

| Topic | Title | Shape | Words | Time |
| --- | --- | --- | --- | --- |
| promotional calendar magnets | Promotional Calendar Magnets: A Buyer's Guide for Bulk Orders | guide | 2,217 | 58.9 s |
| how many promotional pens should i order | How Many Promotional Pens Should I Order for Events? | question | 1,756 | 54.8 s |
| how to order custom tote bags in bulk | How to Order Custom Tote Bags in Bulk for Your Business | how-to | 2,409 | 52.0 s |
| custom rubber ducks | 8 Ways Custom Rubber Ducks Boost Branding and Morale | list of 8 | 1,648 | 81.4 s |

Under the new rules Patrick's six would become: wine openers a guide; footballs, measuring cups and ornaments lists of 10; sunscreen giveaways a list of 9; koozies a list of 7.

## 5. How the shape is chosen, and how the body stays consistent

`chooseTitleShape` in `lib/blog-automation/blog-shape.ts` reads the words of the search: a question word or a trailing question mark gives a question title; "how to" gives a how-to; vs, or, compared, difference give a comparison; ideas, ways, giveaways, tips, examples, trends give a numbered list; guide, buying, choose, best, bulk, wholesale, types, sizes, cheap, pricing, minimum, materials give a buyer's guide. A plain product topic suits a list and a guide equally, and only there a stable hash of its own sorted product words decides, so the same topic always gets the same shape and the blog index alternates (24 plain product topics measured: 13 lists, 11 guides). Nothing is random, and a how-to is never written for a topic that is not a how-to.

The number follows the topic the same way: `ideaCountFor` moves the word budget's count by a stable offset of -2 to +3 from the same words, inside 6 to 12 (7 to 12 at 1,500 words).

The body matches the title by construction: `templateForShape` maps a list to the list template (one "Idea N:" section per number, a product strip under each) and the other four shapes to the single template, whose section guidance is written per shape (a guide's considerations; a question answered in the first section's first sentence; "Step N:" headings for a how-to; a comparison whose last section chooses). The title's number IS the section count: `repairListTitleNumber` sets it to the sections the model actually wrote. Then `titleProblem` refuses a guide or comparison starting with a number, a how-to not starting with "How to", a list with no number, a question without its mark (repaired first), a title that drops the topic's product words, or one over 75 characters; and the generator refuses a title that normalises to one of the 661 published posts or the current drafts, or whose slug is an existing address. The slug still follows the title. The proof run's how-to body is Step 1 through Step 4; the question post's first section is "How to Calculate the Right Quantity for Your Event or Campaign"; the list post has exactly eight ideas under an eight-way title.

## 6. The deliberate brand test

An image was asked for directly: a calendar magnet on a refrigerator carrying the business name "Acme Plumbing" and the phone number "555-0100" in bold across its top. The model drew it, crisply. The chain's check read it back and answered `brandText: true, brandTextSeen: "ACME PLUMBING 555-0100"` on the first read (2.97 s), so `imageCheckProblem` refuses it as "a brand, company name or contact detail in text" with the product's own text allowed, and as that plus "readable text" under the old blanket rule. Readable product text can be had without brand risk, so the blanket rule is replaced; it comes back only when the planner is unavailable.

## 7. Build or prerender risk

None found. Every change is in server modules, in routes that are `nodejs` and `force-dynamic`, in the pure shape module, in the Studio tab and in the schema. No render path, query, projection, cache tag, webhook or env var changed; `/cat/[...slug]` and `lib/seo/indexing-policy.ts` are untouched; the matcher and the link placer are untouched. The blog-topics route's 240 s still holds: the planner adds about 2 s inside the unchanged 70 s image budget.

## 8. Found on the way

- The image model can answer with no picture at all (finish reason NO_IMAGE, once in four here, on a tote bag scene). The chain now retries that once, a second cap slot reserved; before this it fell straight to the product photo.
- The deliberately branded test picture had a crisper 12-month grid than the chain's magnet picture: told to render "generic placeholder content", the model draws an approximate grid. Reported, not changed; the hero renders at 1400 wide and the month names read.
- The planner put the tote bags in a farmhouse kitchen with a person blurred behind; physically fine and it passed, but an office counter would suit a B2B post better. The prompt says "a business or everyday setting"; tightening it to business settings is a one-line follow-up if Patrick prefers.
- The plain FNV-1a hash's low bits clumped every topic onto 9 or 11 ideas; an avalanche step fixed it before anything shipped.
- Git Bash rewrites a `/cat/pens` script argument into `C:/Program Files/Git/cat/pens`, which is why the four proof drafts show "no related category slug"; the pure rule gives `['pens']` for `/cat/pens` and the tab sends the page as JSON, so the site is unaffected.
- A `\b` inside a bash heredoc Python script becomes a backspace in the written TypeScript; it silently broke the product-text scrub once and was caught by a control-character scan. Scripts are written through the editor tool now.
- Since AUTO-202 Ali set a default blog category (Promotional Product Ideas) in Global Settings: every proof draft carried it.

## 9. Ali's steps

1. Review the staged diff in any of the three repos, commit, deploy once.
2. After the deploy, open the Blog Topics tab: Draft style should read "Chosen from the topic". Generate one question-shaped topic and one plain product topic and read the two titles side by side.
3. Open each draft and look at the header image: the product where it lives.
4. On the calendar magnets draft Ali already has, press Generate another header image once: the magnets should be on a refrigerator or a filing cabinet.
5. In Vercel's function logs, each `[header-image]` block now carries a `plan surface=...` line before the `attempt=` line.
6. Nothing in Google Cloud changes.
