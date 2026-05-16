# Perfect Imprints Website

## 1. Project Overview

This document outlines the complete plan to rebuild perfectimprints.com as a high-performance, SEO-optimized Next.js website.

The project covers approximately 22,000 category pages, 700 plus blog posts, a redesigned home page, custom services pages, and a Sanity-powered content management system that will allow you to add custom categories, products, and blog posts going forward.

The development window is 40 calendar days. Internally we are targeting completion in 30 working days, with the additional 10 days reserved as buffer for revisions, content review, and launch preparation.

---

## 2. Goals and Success Criteria

The rebuild has four core goals:

**Speed.** The new site will load fast on both desktop and mobile, targeting Core Web Vitals scores in the green for LCP, CLS, and INP across all page templates.

**SEO preservation.** Every URL on the current site will resolve to the same URL on the new site. No 301 redirects will be required for category or blog pages, which protects existing rankings.

**Conversion.** Each category page will guide visitors toward the matching Geiger category through clear calls to action, contextual product images, and a lead capture form. Every product card on every category page links directly to the corresponding product on patrickblack.geiger.com.

**Independence.** Once the site is live, you will be able to add new custom categories, products that link to any external partner, and blog posts entirely through the Sanity dashboard without touching code or paying a developer. New custom categories include a one-click AI content generation button that auto-fills the intro paragraph and FAQs for you.

---

## 3. Technology Stack

The stack is chosen for performance, SEO, and ease of long-term maintenance.

**Frontend framework:** Next.js 15 with the App Router.

**Content management:** Sanity v3, configured with a hybrid model. Top categories, all blogs, the home page, mega menu, FAQs library, and global components live in Sanity. The bulk AI-generated category pages live as committed JSON files in the repository, which keeps Sanity on the free tier and the dashboard fast.

**Hosting:** Cloudflare Pages with the Next.js adapter.

**Domain and DNS:** Cloudflare DNS, already under your control. Development will run on dev.perfectimprints.com, and on launch day the apex domain perfectimprints.com will switch to the new site.

**AI content generation:** DeepSeek-V3 via API for bulk category page content. The API key will be on your account.

**Email delivery:** Gmail SMTP via Nodemailer for lead form submissions, all routed to patrick@perfectimprints.com. You provide a Gmail app password, no third-party email service needed.

**Search:** Client-side fuzzy search using a prebuilt index covering all categories and blog posts. No external search service required, no recurring cost.

**Data pipeline:** Python with httpx for direct API integration with Geiger's product catalog system, plus Playwright for blog content fallback if a clean export from MPower is not available. This combination is faster and more reliable than full HTML scraping.

---

## 4. Site Architecture

### 4.1 URL Structure

All existing URLs are preserved exactly as they appear in the GA4 export.

Category pages remain at perfectimprints.com/cat/[category-slug]. The current site includes both root category URLs like /cat/water-bottles and filtered facet URLs like /cat/water-bottles/material/stainless-steel and /cat/water-bottles/color/blue. All 22,180 of these URLs will be preserved exactly. Blog posts remain at perfectimprints.com/blog/[article-slug]. The home page, blog index, contact, about, privacy, terms, and rush products pages all keep their current paths.

Paginated category pages use clean static URLs (perfectimprints.com/cat/water-bottles/page/2) to preserve SEO link equity.

### 4.2 Page Templates

Five primary templates power the entire site:

The **home page** template renders the hero banner, featured category image blocks, text content sections, and the brands and clients grid sourced from Sanity.

The **category page** template renders breadcrumbs, hero with H1 and lead-in copy, lead capture form, AI-generated body content, a product grid pulled from Geiger with each product card linking to its patrickblack.geiger.com page, a filter sidebar (color, material, brand, price, production time, minimum quantity), sort dropdown, static pagination, why-choose-us blocks, FAQs, related blog posts, and a bottom call-to-action banner.

The **blog index** template renders a hero, intro paragraph, category submenu, and a 3 to 4 column grid of blog cards with header images, titles, dates, and read links.

The **blog article** template renders breadcrumbs, header image, title and metadata, the article body with inline images, a sidebar with blog categories and a contact CTA card, and a related posts grid.

The **content page** template handles About Us, Contact, Privacy, Terms, Rush Products, and Services pages, with flexible Sanity-driven content blocks.

### 4.3 Mega Menu

The main navigation mirrors Geiger's category structure with custom additions. Promotional Products opens to the eight Geiger top-level categories. Custom Apparel, Featured Promos, New Products, Services, Videos, and Blog each have their own dropdowns. The Featured Promos and New Products lists pull dynamically from Sanity so you can rotate them seasonally.

### 4.4 Sanity Content Model

The Sanity dashboard will contain the following document types:

Curated categories (top categories you want to manually edit, including FAQs, custom copy, hero images, and Geiger link mapping).

Custom categories (any new category you create that does not exist on Geiger). These include a one-click "Generate with AI" button in the Sanity editor that auto-fills the intro paragraph and FAQs based on the category name, ready for you to review and publish.

Custom products (with title, image, description, and external URL to any partner site, not just Geiger).

Blog posts (full rich text editor, header image, categories, author, publish date, related posts).

Blog categories (taxonomy for filtering and the blog submenu).

Home page (singleton with all home page sections).

Mega menu (singleton with all menu items, easily reorderable).

Global settings (phone number, contact email, social links, footer columns).

FAQs library (reusable FAQ items that can be attached to any category page).

Videos (title, YouTube URL, category, description, published date).

Brands (logos and names for the brands and clients grid).

Lead form submissions (read-only log of all form submissions for your records).

---

## 5. Content Pipeline

### 5.1 Geiger Data Integration

A Python pipeline integrates directly with Geiger's product catalog API to extract the full category tree, complete product data (names, slugs, images, prices, minimum quantities, badges, materials, colors), and category descriptions. The data is normalized into a structured JSON dataset that maps each Geiger category to its products.

This dataset becomes the source for product images and product cards shown on Perfect Imprints category pages and for building the link map between Perfect Imprints categories and Geiger categories.

Product images are served from Geiger's image CDN, which keeps the site fast and means images update automatically when Geiger updates a product photo.

### 5.2 Category Mapping

Each of the 22,180 Perfect Imprints category URLs from the GA4 export will be mapped to the closest matching Geiger category using a combination of exact slug matching, fuzzy matching, and AI-assisted matching where needed. The full mapping is exported as a CSV for your review before going live.

For the filtered facet URLs like /cat/water-bottles/material/stainless-steel, the pipeline runs targeted queries against Geiger's catalog to pull only the products that match the filter (in this example, only stainless steel water bottles). This ensures every URL shows the most relevant product subset.

### 5.3 AI Content Generation

For each of the 465 root category pages, the AI pipeline generates:

Two to three paragraphs of unique body content covering use cases, target buyers, and product benefits, written for keywords in plural form (custom water bottles, branded tote bags, personalized pens) targeting marketing directors, HR directors, safety managers, and business owners.

A set of three to five FAQs specific to the category, drawn from a curated question bank with category-specific answers.

SEO-friendly meta title and meta description.

Image alt text for each product image on the page.

For the 21,715 filtered facet pages, a lighter content set is generated: a focused intro paragraph specific to that filter combination, SEO meta tags, and a heading optimized for the long-tail keyword.

A sample batch of pages will be generated for your review before the full run.

### 5.4 Monthly Auto-Refresh

After launch, a scheduled job runs on the first of every month to pull the latest product data from Geiger, update prices and product availability, and rebuild the site automatically. New products appear, discontinued products disappear, and prices stay current. You receive an email summary after each refresh with the change stats.

You can also trigger a manual refresh from Sanity at any time if you need an immediate update.

### 5.5 Blog Migration

The first attempt is to export all blogs cleanly from your MPower dashboard at app.mpowerpromo.com. If the export is not available, a Playwright-based scraper will pull every blog post from perfectimprints.com/blog using the URL list in your provided spreadsheet. Each blog post brings over its title, full body content, header image, inline images, publish date, and any author metadata. Posts are then loaded into Sanity where you can edit them freely.

---

## 6. Week-by-Week Schedule

### Week 1: Foundation and Data Pipeline

Project repositories created on Cloudflare Pages and Git. Next.js 15 base configured with App Router, TypeScript, and Tailwind. Sanity studio initialized with all document schemas. Brand theme implemented (red from logo, ink, white, green CTAs). Cloudflare DNS configured to point dev.perfectimprints.com to the staging deployment. Python data pipeline built and the Geiger taxonomy plus product catalog extraction run end-to-end. Blog export attempted from MPower, fallback Playwright scraper prepared if the export fails.

### Week 2: Templates and AI Pipeline

Full data pipeline complete (taxonomy, products, facet-level product membership for all 21,715 filtered URLs, PI-to-Geiger mapping). Category page template built and pixel-matched to your reference layout (with product cards linking to patrickblack.geiger.com, your phone number, and the lead form). Filter sidebar, sort dropdown, and static pagination all functional. Blog article and blog index templates built. AI content generation pipeline integrated with DeepSeek API. Sample batch of root category pages generated and deployed to staging for your review.

**Deliverable:** Working category and blog templates live on staging, plus sample AI-generated category pages for content quality approval.

### Week 3: Bulk Generation and Core Pages

After your approval of the sample, the full batch of all 22,180 category pages is generated and committed. Home page built with all six featured image blocks, brands grid, and CTAs. Global header with logo, search box, phone number, contact link, and full mega menu. Global footer with all four column groups, social icons, and auto-updating copyright. Search functionality (categories and blogs) integrated into the header. About Us, Contact, Privacy, Terms, and Rush Products pages built.

**Deliverable:** All 22,180 category pages live on staging, plus the home page and all global components fully functional.

### Week 4: Sanity Integration and Custom Features

Full blog migration completed and loaded into Sanity. Custom category creation flow tested end-to-end (you create a category in Sanity, click "Generate with AI", review the auto-filled content, and publish, with the page appearing live). Custom product creation flow tested (you add a product with an external partner URL, it appears on the chosen category page). Lead form integrated with Gmail SMTP delivery to patrick@perfectimprints.com. FAQ library populated and linked to category pages. Services pages built (Kitting, Company Stores, Popup Stores, 100 Percent Custom Products). Videos section built with YouTube embed pages.

**Deliverable:** Sanity dashboard fully configured and tested, all custom content workflows working, lead forms delivering to your inbox.

### Week 5: Performance, SEO, and Polish

Sitemap.xml automatically generated covering all categories, blogs, and static pages. Robots.txt configured. Schema markup added for Organization, BlogPosting, FAQPage, BreadcrumbList, and Product. Core Web Vitals tuned (image optimization, font loading, code splitting, preloading). All meta titles and descriptions verified. Internal linking between categories and related blogs validated. Cross-browser testing on Chrome, Safari, Firefox, and Edge. Mobile responsiveness verified on multiple device sizes. Monthly auto-refresh scheduler configured.

**Deliverable:** Production-ready site on staging passing all SEO and performance checks, ready for final review.

### Week 6: Final Review and Launch

You review the full staging site and submit any final revisions. Last revisions implemented. Google Analytics 4 and Search Console connected. DNS cutover plan finalized. Quick training video recorded showing how to add categories, products, and blogs in Sanity, including the new AI generation button. On launch day, perfectimprints.com DNS is updated to point to the new site, the old MPower hosting is decommissioned in your account at your discretion, and Search Console is notified of the change.

**Deliverable:** Live website at perfectimprints.com, training documentation, and 30 days of post-launch support included.

---

## 7. Payment Schedule

Payments are released every Monday based on the milestone delivered in the previous week. The 15 percent upfront payment was already received on May 5, 2026.

| Date               | Payment | Cumulative | Milestone Tied                                            |
| ------------------ | ------- | ---------- | --------------------------------------------------------- |
| May 5, 2026 (paid) | 15%     | 15%        | Project kickoff                                           |
| May 11, 2026       | 15%     | 30%        | Foundation, brand theme on staging, data pipeline started |
| May 18, 2026       | 15%     | 45%        | Data pipeline complete, sample AI pages                   |
| May 25, 2026       | 15%     | 60%        | All 22k pages live on staging, home page complete         |
| June 1, 2026       | 15%     | 75%        | Sanity fully configured, custom flows working             |
| June 8, 2026       | 15%     | 90%        | SEO, performance, schema markup complete                  |
| June 19, 2026      | 10%     | 100%       | Live launch on perfectimprints.com                        |

If a milestone is delayed, the corresponding payment is also delayed until that milestone is delivered.

---

## 8. What You Provide

To keep the project on schedule, the following items are needed from you in the order shown:

**By May 18:** DeepSeek API key on your account (sign up at platform.deepseek.com, an initial top-up of $20 to $40 is sufficient for the full content generation run). Gmail app password for patrick@perfectimprints.com (generated from your Google account security settings) for the lead form to deliver emails to your inbox.

**Ongoing:** Reviews and approvals on sample content batches, staging site reviews, and final launch sign-off.

---

## 9. Risks and Mitigations

**Risk: Geiger API access disrupted mid-run.** Mitigation: data extraction uses respectful throttling (one request per second), runs in batches with checkpointing so a disruption does not lose progress, and Geiger has confirmed permission. If interrupted, the pipeline resumes from the last checkpoint. The final product dataset is stored in our repository, so even if Geiger's API changes after launch, the site continues running and only the monthly refresh job needs to be updated.

**Risk: AI content quality is too generic across thousands of pages.** Mitigation: the prompt template injects category-specific signals (top product names, target keywords, buyer personas), varies opening structure by category type, and the sample batch is reviewed before the full run. If quality is weak on the sample, we adjust the prompts before bulk generation.

**Risk: Sanity free tier limits exceeded.** Mitigation: hybrid architecture (covered in Section 3) keeps Sanity well under the 10,000 document limit by storing bulk pages in the repository.

**Risk: Geiger affiliate subdomain (patrickblack.geiger.com) not yet active at launch.** Mitigation: until Geiger activates your subdomain, product cards will temporarily link to the main geiger.com site so visitors can still complete their purchase. Once your subdomain is live, a one-line configuration change switches all 22,000 plus links over without any redeployment needed.

---

## 10. Out of Scope for This Project

To keep the timeline realistic, the following items are not included in this 40-day build but can be quoted separately afterward:

A native e-commerce checkout on Perfect Imprints itself (your model is to drive traffic to Geiger, so this is intentional).

Product detail pages owned by Perfect Imprints (visitors click product cards directly through to patrickblack.geiger.com, which is the agreed model).

An expanded videos section beyond the basic YouTube embed pages included in scope.

A custom CRM beyond simple lead form email delivery.

Paid ad landing pages or split testing infrastructure.

Migration of any data not currently on perfectimprints.com or geiger.com.

Multi-language or multi-currency support.

---

## 11. Approval

This plan is the working agreement for the project. Once you approve, work begins immediately. Any changes to scope after approval will be discussed and quoted separately before being added.
