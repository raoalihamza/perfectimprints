# Phase 2 — AI Content Engine (Architecture)

This is the shared foundation for all Phase 2 AI content features. It is built ONCE (alongside the Blog system, since blogs need all of it) and reused by videos, pages, landing pages, and catalog pages. Do not rebuild these pieces per feature.

## Why a shared engine
Patrick's Phase 2 AI features (blogs, videos, AI pages, landing pages, catalog pages) all need the same four capabilities. Building them once keeps the code small, consistent, and cheap to extend. When a new AI feature is added later, it plugs into this engine.

## The four shared capabilities

### 1. AI generation service
- A single server-side DeepSeek wrapper (reuses `DEEPSEEK_API_KEY`) that takes a structured request (content type, title/topic, keywords, context) and returns structured JSON.
- System prompts bake in the keyword and persona guidance (see CLAUDE.md section 24): plural forms; custom / customized / personalized / logo / printed / branded; B2B personas (marketing directors, human resource directors, safety program managers, business owners); bulk/wholesale framing, not consumer retail.
- Graceful failure: if the key is missing or the call fails, the feature degrades to manual entry, never crashes a page or a publish.
- Output is always saved as a DRAFT for review. Nothing auto-publishes.

### 2. Related-products matcher
- Given a topic, category, or keyword list, returns a ranked set of relevant SKUs to embed (Geiger products + customProducts).
- Match order: by category first, then by keywords (the keyword box the user fills). Manual add/remove is always available on top of the suggestions.
- Reuses the existing product data (`products.json`) and custom product docs; respects the same slugify/normalization used by the filter system.

### 3. Internal-linking engine
- Suggests links to existing blog posts, pages, and category pages relevant to the content being generated.
- Used by blogs (4 to 5 links per post across landing pages, blogs, and category pages) and by the video tool (suggested internal links to blogs, pages, categories).
- Suggestions are surfaced for review; the author confirms/edits before publishing.

### 4. Schema emitter
- Helpers to emit the right structured data per content type: BlogPosting/Article for blogs, VideoObject for videos, and reuse of the existing CustomSchema injector for anything custom.
- All schema is emitted server-side in the render path (no new client code) and follows the existing static-safe pattern.

## How each feature uses the engine

| Feature | Generation | Related products | Internal links | Schema |
|---|---|---|---|---|
| AI Blog (P2-AI-002) | 1,500 to 2,000 words, 2 templates | Yes, by category + manual | Yes, 4 to 5 per post | BlogPosting |
| AI Video (P2-AI-003) | Title, meta title, meta description, 500 to 750-word description | Yes, suggested at bottom | Yes, to blogs/pages/categories | VideoObject |
| AI Pages (P2-AI-004) | Page sections from a title | Optional | Optional | Page/CustomSchema |
| AI Landing pages (P2-AI-005) | Fixed template filled by AI + local landmarks | Yes, by keyword box + manual | Optional | Page/FAQ |
| Catalog pages (P2-CAT-004) | Long-form catalog copy | Optional | Optional | Page |

## Guardrails (same as the rest of the codebase)
- Everything the engine reads from Sanity uses the non-CDN `cachedClient` + a cache tag, and the webhook `revalidateTag`s it. Tag values pass through `sanitizeTagValue()`.
- `/cat` and all routes stay static/SSG. No `searchParams` in render, no uncached reads in the render path.
- Generation is a Studio-side action (like the existing "Generate with AI" on categories); it writes drafts, it does not change the render path's staticness.
- Size the AI usage for volume: blogs target roughly one per day, so keep prompts efficient and cache where possible.

## Build note
Build the foundation (this doc) as part of the Blog task (P2-AI-002 depends on all four capabilities). Videos, pages, landing pages, and catalog AI then reuse it with thin, feature-specific wrappers rather than new engines.
