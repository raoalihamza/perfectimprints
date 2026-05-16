# Perfect Imprints

Rebuild of `perfectimprints.com` as a static, SEO-first content site that funnels traffic to an affiliate Geiger e-commerce subdomain. 22,181 category pages, 731 blog posts, no checkout. See [`CLAUDE.md`](./CLAUDE.md) for architecture and [`docs/development-plan.md`](./docs/development-plan.md) for the 6-week plan.

## Stack

Next.js 16 (App Router) - Sanity v3 - Tailwind CSS - Python data pipeline - Cloudflare Pages. Full breakdown in [`CLAUDE.md` Section 2](./CLAUDE.md).

## Prerequisites

- Node 24 (see `.nvmrc`)
- pnpm 9+
- Python 3.11+ (for the scraper and AI pipeline). `uv` or `venv` both work.

## Getting started

```bash
# 1. Install Node deps
pnpm install

# 2. Copy env template and fill in values (talk to Ali for tokens)
cp .env.example .env.local

# 3. Convert the GA4 URL exports to JSON (one-shot)
pnpm import-urls

# 4. Run dev server
pnpm dev
```

Studio runs separately:

```bash
pnpm sanity:dev
# Studio at http://localhost:3333
```

## Common commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Next dev server at :3000 |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript check (no emit) |
| `pnpm lint` | Lint (currently a no-op by project preference) |
| `pnpm format` | Prettier write |
| `pnpm test` | Vitest unit tests |
| `pnpm sanity:dev` | Sanity Studio on :3333 |
| `pnpm import-urls` | Convert `Category_Pages.xlsx` and `Blog_Links.xlsx` to JSON |
| `pnpm build:search-index` | Generate `public/search-index.json` (stub) |

## Python pipeline

See `scripts/scrapers/geiger/README.md` for setup and run instructions. Quick start:

```bash
cd scripts/scrapers/geiger
python -m venv .venv
source .venv/bin/activate   # PowerShell: .venv\Scripts\Activate.ps1
pip install -e .
cd ../../..
python -m scripts.scrapers.geiger.run --phase a
python -m scripts.scrapers.geiger.run --phase b --limit-categories 5
```

## Folder map

See [`CLAUDE.md` Section 5](./CLAUDE.md) for the full tree. Quick orientation:

- `app/` Next.js routes
- `components/` React components (layout, category, blog, home, ui, seo)
- `lib/` utilities (affiliate URL helper, Sanity client, loaders, SEO helpers)
- `sanity/` Studio config and document schemas
- `scripts/scrapers/geiger/` Phase A + B Python scrapers (Phase C/D stubs)
- `scripts/ai-pipeline/` DeepSeek-V3 content pipeline (stub)
- `scripts/url-import/` Excel -> JSON URL converter
- `data/` build-time JSON inputs and outputs
- `docs/` planning docs and references

## Deployment

Two Cloudflare Pages environments:

- Staging: `dev.perfectimprints.com` on push to `develop`
- Production: `perfectimprints.com` on push to `main`

Build command: `pnpm build`. Cloudflare Pages auto-detects the Next.js adapter.

## Where to find what

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Source of truth for architecture, conventions, naming, brand tokens |
| `TASKS.md` | Ticket sequence (M1-101 through M6-607) |
| `docs/development-plan.md` | Client-facing 6-week plan |
| `docs/internal-plan.md` | Internal 40-day plan |
| `docs/references/client-page-spec.md` | Patrick's original page structure brief |
| `docs/references/category-layout.jpg` | Reference category layout |
| `docs/references/blog-layout.jpg` | Reference blog layout |
