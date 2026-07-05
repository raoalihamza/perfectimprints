# Perfect Imprints — Phase 2 Development Order (Internal)

Dev-facing build sequence for Phase 2. This is the order we implement in, with dependencies noted, so each Claude Code prompt is written in the right order. No pricing here (see the quote for that). Deal: $5,500 full scope, closed 2026-07-04. Patrick's stated order: AI engine first (Blogs, then Videos, then other pages), then the rest.

Rules carried from Phase 1 apply to every item: `/cat` and all routes stay static, the freshness pattern (non-CDN `cachedClient` + cache tag + webhook `revalidateTag`), tags through `sanitizeTagValue()`, functional Sanity changes ship with webhook steps (staging + production) + guide update + test steps, prompts end with "Do NOT commit", staging-first then promote to production. Content follows the keyword/persona guidance (plural forms; custom / customized / personalized / logo / printed / branded; marketing directors, human resource directors, safety program managers, business owners; bulk B2B, not retail).

---

## Stage 1 — AI Content Engine (Patrick's first priority)

Build the shared foundation once (it ships with the Blog task since blogs need all of it), then each feature reuses it with a thin wrapper. Full architecture in `docs/phase-2-ai-engine.md`.

### 1.1 Shared AI foundation  (ticket P2-AI-001)
Built together with the Blog. Four reusable capabilities:
- AI generation service (DeepSeek wrapper, structured JSON, graceful failure, draft-only output).
- Related-products matcher (category first, then keywords; Geiger + customProducts; manual add/remove).
- Internal-linking engine (suggest links to blogs, pages, category pages).
- Schema emitter (BlogPosting/Article, VideoObject, reuse CustomSchema injector).
- Keyword/persona guidance baked into system prompts.

### 1.2 AI Blog system  (P2-AI-002)  [depends on 1.1]
- Generate from a title, saved as a DRAFT for review. 1,500 to 2,000 words.
- Content: practical uses of the promotional items for the topic, businesses/organizations that can use them, creative giveaway ideas, recommended related products.
- Two templates: (a) list-style ("10 Ideas ...") with a product strip under each idea; (b) single-category focus with one product strip.
- Related products by category + manual add/remove. Internal links 4 to 5 per post (landing pages, blogs, category pages). Patrick adds images. BlogPosting schema. Target ~1 blog/day.

### 1.3 AI Video tool  (P2-AI-003)  [depends on 1.1, mostly reuse]
- Paste a video script + a video link.
- Generate: video title, meta title, meta description, long-form description (500 to 750 words).
- Suggest internal links to blogs, pages, categories. Add suggested related products at the bottom.
- Emit VideoObject + relevant video schema. Draft for review. Wires into the existing `video` document.

### 1.4 AI Page generation  (P2-AI-004)  [depends on 1.1]
- "Generate with AI" inside the page builder, drafting page sections from a title (mirrors the existing AI category generation).

### 1.5 AI Local & Topic Landing pages  (P2-AI-005)  [depends on 1.1]
- Fixed template (hero, trust, problem, options, why us, lead form, FAQ) filled by AI.
- AI researches local landmarks + city context (by-city: Sylva, Asheville, Waynesville, Bryson City, Franklin NC; Fort Walton Beach, Destin, Navarre, Crestview, Miramar Beach FL). By-topic: screen printed t-shirts, company uniforms, etc.
- Keyword box before generating to steer product matching; related products auto by keyword + manual override.
- Per-page lead form (saved as lead record + emailed, editable recipient).
- Deliver top 10 priority pages + a self-serve generator so Patrick makes more. Each page genuinely unique (no thin/duplicate content across city x topic).

---

## Stage 2 — Custom Product Pages, Forms, CTA

The form/lead system here is reused by later stages, so build it in this stage.

### 2.1 Custom product detail pages  (P2-CP-001)
- New route `/products/<slug>` (reserved segment, collision guard like `app/[slug]`).
- Description, tiered pricing (up to 5 columns, per product), up to 10 images with zoom + thumbnail strip, optional video.
- Related-products carousel (same category, Geiger + custom, auto + manual add/remove).
- "Get a Quote" button in place of Add to Cart. Product schema + sitemap. Indexable.

### 2.2 Get a Quote form + lead system  (P2-CP-002)
- Fields: First Name, Last Name, Company, Email, Phone, Shipping Zip, Quantity Needed, Date Needed, Comments.
- Emails Patrick (editable recipient) + automatic customer confirmation showing their submission + lead record in CMS. Default on every custom product page.

### 2.3 Bulk upload custom products  (P2-CP-003)
- Import from a Google Sheet link (or CSV). Up to 10 image-URL columns + pricing tiers + fields. ~50 per upload. Same SKU updates (no duplicate).

### 2.4 Reusable form builder  (P2-FB-001)
- Build tailored forms for any page: choice of fields, spam protection, confirmation message, automatic customer confirmation email, lead records, editable recipient.

### 2.5 Four service forms  (P2-FB-002)  [depends on 2.4]
- Kitting, Company Stores, 100% Custom Products, Pop-Up Stores. Open from the "Request a Quote" button on each service page. Fields differ per form (GET EXACT FIELDS FROM PATRICK before building; he needs time to decide).

### 2.6 CTA bar on product-bearing category/facet pages  (P2-CTA-001)
- On all category/facet pages that show products (including deeper facet pages), below the products and above the FAQs.
- Copy: "Not finding the exact [CATEGORY NAME] you're looking for? We have other options. Contact us and we'll search through our database of over 1,000,000 promotional items." Auto category name, editable wording. Button opens the existing "Find Products for Me" form.

---

## Stage 3 — Geiger Digital Catalog Lead Pages

### 3.1 Ten catalog lead pages  (P2-CAT-001)
- One long-form, SEO-optimized lead page per catalog under shop-by-theme (10 catalogs). Content + photos sourced from the digital catalogs (Patrick has rights). Multiple CTAs (top, middle, bottom).

### 3.2 Catalog CTA form + email-gated delivery  (P2-CAT-002)
- Form (First, Last, Company, Phone, Email, optional Comments) emailed to Patrick + lead record. Automatic email to the customer with the catalog link (cc Patrick) so it only goes to a valid email.

### 3.3 Shop By Theme mega-menu dropdown  (P2-CAT-003)
- Add a Shop By Theme dropdown to the main menu linking the catalog pages.

### 3.4 AI generation for new catalog pages  (P2-CAT-004)
- Let Patrick AI-generate new catalog lead pages as Geiger releases new catalogs each year.

---

## Stage 4 — feeds.perfectimprints.com (SEPARATE PROJECT + scrape)

This is a NEW, standalone project (own repo + Vercel + the feeds subdomain), not part of the main perfectimprints repo. Build it last.

### 4.1 Scrape the existing feeds.perfectimprints.com  (part of P2-FEEDS-000)
- Scrape all 101 existing pages (text, images, CTAs, structure) as the source content to rewrite from. Patrick owns the site; recreate from scratch rather than copy the old build.

### 4.2 Rebuild the 101 pages from scratch
- Similar text, images, and CTAs, styled to match Perfect Imprints (exact design match not required). Remove all Gushwork branding/references from the footer.
- One general contact form (First, Last, Company, Phone, Email, Comments).
- AI-readable schema on every page (the site's purpose is to feed AI platforms and lead people to Perfect Imprints).

### 4.3 AI page generation for the feeds site
- Ability to generate new pages in the same format with AI.
- Give this project its own CLAUDE.md / TASKS.md when it starts.

---

## On Hold (not in this build)

- **Image license metadata (Google Search Console)** — Patrick is still deciding. Not in the $5,500 scope. Scope separately if he confirms.

---

## Clarifications to collect from Patrick before the relevant stage
- 2.5 four service forms: exact fields per form.
- 2.1 product pages: confirm tiered-pricing breaks + related-SKU source.
- 1.5 landing pages: approved landmark details (accuracy), the keyword box inputs, and which top 10.
- 3.1 catalog pages: exact photo sourcing + email volume for the auto-send.
- 1.2 blog: confirm the daily volume workflow and whether internal linking is auto-applied or suggested for confirmation.

## Build note
Follow this order top to bottom. Within Stage 1, 1.1 must exist before 1.2 to 1.5 (they reuse it). Within Stage 2, 2.4 (form builder) should exist before 2.5. Each item becomes one Claude Code prompt (sometimes two: a diagnostic first if a bug's cause is unclear, then the fix). Write prompts per the format in the handoff doc.
