# Search Index Builder

Generates the Fuse.js index that powers site-wide search (M5-502 / M3-309).
Output: `public/search-index.json`, shaped `{ generatedAt, items: SearchItem[] }`.

```bash
pnpm build:search-index
```

Runs automatically as the `prebuild` step before `next build` (see `package.json`).

## What's indexed

Each entry is intentionally minimal — `{ type, title, url, brand? }` (see
[`lib/search/types.ts`](../../lib/search/types.ts)).

| type       | source                                                       | title           | url                          | link behavior                          |
| ---------- | ------------------------------------------------------------ | --------------- | ---------------------------- | -------------------------------------- |
| `category` | `getAllGeneratedCategorySlugs()` + `getCategoryContent()`    | H1 / metaTitle  | internal `/cat/...`          | SPA navigation                         |
| `product`  | `getAllProducts()` (`data/geiger/products.json`)             | product name    | raw `geiger_url` (+`image`)  | affiliate URL, **new tab** (see below) |
| `brand`    | `data/geiger/brands.json`                                    | brand name      | `/brands/<slug>`             | SPA navigation                         |
| `blog`     | `getAllBlogSearchEntries()` (published Sanity `blogPost`)    | post title      | `/blog/<slug>`               | SPA navigation                         |
| `faq`      | _deferred_                                                   | —               | —                            | —                                      |

- **Products store name + brand + `geiger_url` + `image`.** No description or SKU.
  `image` is the entity-decoded thumbnail URL, used only for the overlay's grouped
  product suggestions (M5-502b). `geiger_url` is the raw (often relative `/p/...`)
  Geiger path; it is rewritten to the affiliate host via
  [`lib/affiliate-url.ts`](../../lib/affiliate-url.ts) at click time (so it respects
  `NEXT_PUBLIC_GEIGER_HOST`) and opens in a new tab. Product results never route
  to a category page.
- **Brands** are read straight from `brands.json` rather than `getAllBrands()`
  because that loader is `import 'server-only'` and throws outside an RSC bundle.
  `brands.json` already holds the full ~205 catalog brands.
- **FAQs are in the live delta.** The `/faq` library page (M5-506) now exists, but
  answered FAQs are Sanity-managed editor content, so they are served by
  `app/api/search-index` (live delta), not baked here. `collectFaqs()` stays a no-op.
- **Blogs are best-effort.** If Sanity is unreachable the build logs a warning and
  ships the index without blogs rather than failing. On Vercel the Sanity env vars
  are present, so blogs are always included there.

## Two consumers (M5-502b)

This index powers two things, and the heavier one does NOT use it:

1. **Header overlay** ([components/forms/SearchBox.tsx](../../components/forms/SearchBox.tsx))
   — client-side Fuse over this index, grouped into Categories / Products / Brands /
   Blogs with product thumbnails. This is what the index is for.
2. **`/search` results page** ([app/search/page.tsx](../../app/search/page.tsx))
   — the product grid is resolved **server-side from the full catalog**
   (`searchProducts()` in [lib/search/server-search.ts](../../lib/search/server-search.ts),
   a cached Fuse over `getAllProducts()`), NOT from this index, because the index
   intentionally omits the fields needed to render product cards and facets
   (price, MOQ, category paths). Facets (Category / Price / Brand / Min Qty) are
   built from the matched products by [lib/search/build-facets.ts](../../lib/search/build-facets.ts).
   Only the page's "also matching categories/brands/blogs" strip reads this index
   (client-side). Either way: no runtime Searchspring (CLAUDE.md §18).

## Size (measured 2026-06-19, after M5-502b added product thumbnails)

| metric    | value                  |
| --------- | ---------------------- |
| items     | 30,985                 |
| raw       | 4.19 MB                |
| gzipped   | **563.7 KB**           |

Well under the ~2 MB gzipped budget, so the index ships as a **single file**.
The browser fetches it once on first search and module-caches it; Fuse.js is
pulled via dynamic `import()` only when a query runs, so neither the index nor
Fuse touches the initial route bundle.

If the gzipped size ever crosses ~2 MB (e.g. catalog growth), shard by type —
load the `category` + `product` shard on first search and keep the small
`brand` + `blog` (+ future `faq`) shard always-available — rather than bloating
one file. The builder prints raw + gzipped bytes on every run and warns past the
threshold.
