# AUTO-209: the title in the picture

Written 2026-10-18. The build is described in CLAUDE.md (Section 7, the blogPost entry "The post's title is on the picture"; Section 23, AUTO-209) and the record of the work in TASKS.md (AUTO-209). This report holds the measurements and the judgements, and the Part 6 recommendation for Patrick.

## 1. Spend

4 blog generations of the 4 allowed (the proofs). 14 images of the 25 allowed: 10 for the before-and-after of the room rule (Part 3), 4 for the proofs; 0 refused, 0 retried. About 650 vision calls on the cheap model (the layout call over 94 archived pictures and 5 "before" pictures, two transcription passes over the composites at phone width, 120 product photos for Part 6, 9 ordering reads, the chain's own reads and close looks). About USD 2.4 in all. Every proof draft and both of its pictures were deleted through the shipped removal rule (kept while referenced, removed after); 0 remain.

## 2. The vocabulary, and why that size

Four shapes: `band` (a flat strip across the full width, top or bottom), `corner` (a solid block flush with a corner, its inner corner a large curve), `panel` (a full-height side panel, its inner edge bowed), `open` (no shape; the title on a calm area over a gradient exactly as strong as that area needs). Twelve placements; six fills (navy, brand red, a dark green, teal, charcoal, white). 48 shaped looks before the open ones, over a photograph that is different every time, so 730 posts a year do not look stamped; every shape is a rectangle, a rounded rectangle, a bowed rectangle or a gradient, which the renderer draws reliably. More shapes would need more geometry to keep the letters inside them and would buy little the photographs do not already vary.

The model ranks three placements and three fills for each picture; code takes the first half the time, the second three times in ten, the third twice in ten, by the post's seed. Asked for one placement it put a band at the top on 42 of 94 pictures and the blog came out stamped; with the ranked pick, over the same 94: band 54 (top 42, bottom 12), open 28, corner 11, panel 1; the model's own FIRST choice was open on 64, band 14, corner 12, panel 4, and what moved its choices onto bands was the product guard (the archive pictures were composed edge to edge, so a corner or a panel covered the product on 46 and 27 of them). On the five pictures composed WITH the room rule, the result was panel, open, open, open, open; on the four proofs, panel, panel, corner, corner.

## 3. Readable, and good: two numbers

Readable: 94 of 94 archived composites, reduced to 343 px (a header on a phone) and transcribed back by the vision model character for character. Minimum measured contrast 5.02:1 (the open placements), 4.76:1 or better on every shape (the red fill with white text is the lowest).

Good, by my eye, which is not the ground truth: of the 94 archived composites, about 54 read as a designed header (a corner or a panel where the picture had room, the title on a calm wall, a band where the picture has a plain top); about 31 are acceptable but plain (a flat band over a picture that left no room, which every archived picture is, and the reason Part 3 exists); 9 I would redo (the 7 last-resort placements that cover 13 to 26% of the product, and 2 bands that crop the product's top). Of the 9 live pictures composed under the shipped chain (5 after the room rule, 4 proofs), 9 read as designed headers; the koozies open-left over grass is the one I would look at twice.

## 4. The room rule, before and after

Five topics generated twice, once with the planner and the image model composing as before and once told to keep one third of the frame calm (left, right or top, rotated per post):

| topic | before (no room) | after (room) |
| --- | --- | --- |
| custom tote bags | every placement covered the product; corner-bottom-right at 26% cover, over the bag | panel-left, charcoal |
| custom koozies | band-top | open-left |
| promotional measuring cups | open-top | open-top |
| custom first aid kits | every placement covered the product; band-bottom at 17% cover | open-right |
| custom keychains | open-top | open-top |

All 10 pictures passed the check first time. Whether a composition built around empty space looks worse is Ali's call; the pairs are in the gallery under `part3`.

## 5. The ordering, proven with the real check

The same tote picture, three reads each: untitled, passes 3 of 3; with our title and logo drawn on, refused 3 of 3 ("a logo or brand mark (Perfect Imprints logo at bottom right) and a brand, company name or contact detail in text"); the deliberate ACME PLUMBING 555-0100 picture, refused 3 of 3. So the check cannot see the titled picture, and in the chain it never does: every read and the close look run on the untitled bytes, the layout call runs beside the close look, and the title is drawn only after all of them pass. `lib/blog-automation/title-on-picture.test.ts` drives the real chain with fakes and fails if that order moves.

## 6. The six cases

1. A picture Patrick uploaded: never titled. Only the AI step composes; the redraw route refuses any asset without the site's upload marker; the button needs a `titleOnImage` to appear.
2. A post with no picture: nothing to title.
3. A hot-linked supplier photo: never composed (the composite would be our own file carrying a Geiger image). Shown in the gallery anyway: on its own square the layout scales and the title is 33 px, too small; a 16:9 crop or a white frame reads as a product listing beside a catalogue shot with a sample imprint.
4. Generate another header image runs the whole chain and redoes the title. Redraw title on header image (new, shown only when the title moved) redraws on the kept untitled copy with no model call: 7.5 s live, same placement.
5. A long title: the 75-character title fits the wide placements at 60 px; narrow placements are skipped when it does not fit them; no line ends on "for", "a", "of"; no word stands alone on a middle line.
6. Phone: see section 3; the `phone/` folder of the gallery holds every composite at 343 px.

## 7. The real product photos (Part 6), measured only

120 Geiger product photos sampled at random (seed 20261018): 110 carry a named sample imprint, 9 a placeholder ("YOUR LOGO", a date, a slogan), 1 none. So "pull the real photos so the picture shows a branded item" means publishing an invented company's logo on about 110 posts in 120, and a real one on about 17.

The blocker, confirmed. The model asked "is this a real organisation?" answered yes 42, unsure 54, no 14. By hand, about 18 of its 42 yeses are real (Wells Fargo Home Mortgage, Swarovski Optik, the Milwaukee Journal Sentinel, Great Lakes Cheese, AdvoCare, Liberty Media, MidSouth Bank, Unity Bank & Trust, Great Lakes Cheese, Play It Again Sports, Buckman, a county EMA, a county food pantry) and the rest are invented (Ellis College, IELTS College, Quantum Financial, Infinity Securities, Nextcom, Upshot Marketing, Authentic Vintage Apparel); its noes are mostly right (Searsport University, O'Lantern National Bank, Omniston Corporation). The invented imprints are designed to look like real local businesses, so a model that must decide "real or not" is guessing, and guessing wrong both ways: it would let through about six invented names for every ten it passed, and refuse real ones. The real-brand rate among named imprints is about 15%, in line with AUTO-206's 3 of 24.

A list of real brand names: the real ones here are a county emergency agency, a food pantry, a regional bank, a cheese maker, a sports resale chain, a home-mortgage division; a list of the world's companies (tens of thousands of entries, maintained by someone, forever) carries almost none of them, and would still pass "Hillsdale Bank" because nobody can say it is not a bank somewhere. A list of real brands cannot be built or maintained to a standard a published post can rest on.

The square problem: with a title on it, a square supplier photo in a wide header reads worse, not better: the title fills the empty half and the bare catalogue shot with its sample imprint fills the other, and the whole reads as a product listing.

Recommendation, for Ali to put to Patrick: do not pull the real photos into the header. Their point is the printed logo, and that logo is an invented company's on about nine photos in ten and a real company's on the tenth, with no way to tell which; publishing a real bank's logo on a post about koozies is a complaint waiting to happen, and publishing an invented one is a picture of a product sold to nobody. The honest version of "an actual branded item" is one Patrick already owns: a photograph of his own work (the portfolio) or a product page's own photo with a real customer's permission, placed by hand on the posts where it fits. The generated picture with the title on it is the header; the product rows below it are where the real items live.

## 8. The time budget, redone

`HEADER_IMAGE_BUDGET_MS` 90 to 100 s. Added after the accepted picture: the layout call beside the close look (2.1 s median, 3.7 s worst over 94, capped at 8 s; at most 2.7 s beyond the close look's 5.3 s worst), the drawing (0.7 s median, 1.3 s worst warm, about 2.5 s more the first time a function instance loads the WebAssembly: 4 s worst), the larger upload (the titled PNG about 1.7 MB beside the untitled copy, in parallel: about 2 s more). AUTO-207's two sums, 85.5 and 88.5 s, become 94.2 and 97.2 s; 100 holds both. The routes hold: generate-blog-image 120 s; blog-topics 150 + 3 + 100 + 3 = 256 s inside 270; the cron writer about 260 inside 300. The title never costs the picture: with no time left it is stored untitled with a note.

## 9. Where the pictures are

`C:/Users/aliha/Documents/perfectimprints-archive/auto-209-images/index.html`: 117 pictures, each at full size and at 343 px, in five groups: `proof` (the four real drafts, with the untitled copy and the live redraw), `part3` (the room rule before and after), `archive` (the 94 AUTO-206 / AUTO-207 pictures with titles composed on), `square`, `ordering`. The harness, every record and the Part 6 survey are in `auto-209-harness`.
