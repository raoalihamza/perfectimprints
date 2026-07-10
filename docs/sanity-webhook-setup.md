# Sanity revalidation webhook — setup guide

The site relies on **one** GROQ-powered Sanity webhook that POSTs to a Next.js
route on every publish. That route ([app/api/sanity/revalidate/route.ts](../app/api/sanity/revalidate/route.ts))
verifies the signature and revalidates the affected pages + the live search
delta so editor changes go live **within seconds** instead of waiting for the
ISR fallback.

> **Status (2026-07-01):** BOTH webhooks are now created —
> **staging** (`https://dev.perfectimprints.com/api/sanity/revalidate`) and
> **production** (`https://www.perfectimprints.com/api/sanity/revalidate`) —
> each with a matching `SANITY_WEBHOOK_SECRET` in the corresponding Vercel env
> (Preview / Production) and the same filter + projection. Publishes now
> revalidate in seconds on both environments. The sections below are retained as
> the reference for the filter/projection/secret and for recreating a webhook.

## What the webhook drives

| Document type | What gets revalidated on publish |
| --- | --- |
| `megaMenu`, `globalSettings` | The whole layout (`/`, `layout`) — header/footer/CTA on every page |
| `homePage` | `/` |
| `page` | `/services/<slug>`, `/<slug>` (top-level custom pages via `app/[slug]`), `/sitemap.xml` (+ busts the `pages` cache tag + `page:<slug>`) — needs `slug` in the projection (already present) |
| `landingPage` | `/<slug>` (local/topic landing pages via `app/[...slug]`, P2-AI-005), `/sitemap.xml` (+ busts the `landing-pages` cache tag + `landing:<slug>`) — needs `slug` in the projection (already present). **NEW type — must be ADDED to the Filter (see below).** |
| `blogPost` | `/blog`, `/blog/<slug>`, **live search delta** (`/api/search-index`) |
| `video` | `/videos`, `/videos/<slug>`, **live search delta** |
| `customProduct` | `/deals`, `/new-products`, `/rush-products`, **live search delta** |
| `customCategory`, `curatedCategory` | `/cat/<slug>`, **live search delta** |
| `faq` | `/faq`, **live search delta** (+ busts the `faqs` cache tag) |
| `video` | (rows above) **also busts the `videos` cache tag** |
| `categoryOverride` | `/cat/<categorySlug>` (needs `categorySlug` in the projection) |
| `productPage` / `customProduct` (attached to categories) | every `/cat/<slug>` whose `categoryOverride.addedProducts` references the edited doc (P2-CP-004 batch 3 — `references($id)` lookup; needs `_id` in the projection, with a slug-deref fallback covering `productPage` only) |
| `productPage` (product-side "Add to categories") | every `/cat/<slug>` in the doc's `addToCategories` + the `category-control-sets` tag (P2-CP-004 batch 4 — needs `addToCategories` in the projection as the **before ∪ after union** so detaches bust too) |
| `productPlacement` | each `/cat/<slug>` in `addToCategories` + `removeFromCategories` (needs those in the projection) |
| `customSchema` | the doc's `pageUrl` page (+ busts the `customSchema:<pageUrl>` cache tag) — needs `pageUrl` in the projection |
| `brand` | `/brands` + `/brands/<slug>` (+ busts the `brands` cache tag) — drives the Featured Brands strip + A–Z grid. **Originally excluded from the Filter — must be added (see below).** |
| `productPage` | `/products/<slug>`, `/new-products`, **live search delta**, `/sitemap.xml` (+ busts the `product-pages` cache tag + `productPage:<slug>`) — needs `slug` in the projection (already present). **NEW type (P2-CP-001) — must be ADDED to the Filter (see below).** |
| `form` | the four `/services/<slug>` pages (+ busts the `forms` cache tag + `form:<slug>` — tag invalidation also refreshes ANY other page whose CTA embeds the form) — needs `slug` in the projection (already present). **NEW type (P2-FB-001) — must be ADDED to the Filter (see below).** |

"Live search delta" = the `/api/search-index` ISR route that carries the
Sanity-managed slice of site search (blogs, videos, custom categories, custom
products). See CLAUDE.md Section 17 + the M5-507 hybrid notes.

## Without the webhook (current fallback)

Nothing is broken, just not instant:

- **Pages** generate on first visit (on-demand SSG) or refresh on their ISR
  interval (`/deals`, `/new-products`, `/rush-products`, `/videos` = 1 week).
- **Live search delta** auto-refreshes on its 1-week `revalidate` floor.
- **Static search bulk** (Geiger categories/products/brands) refreshes only on a
  deploy (`pnpm build` → prebuild).

The webhook turns "up to a week" into "a few seconds."

## Prerequisites — the shared secret

The route rejects unsigned/mis-signed requests. The **same** secret must exist
in two places:

1. **Vercel** → Project → Settings → Environment Variables →
   `SANITY_WEBHOOK_SECRET` = `<random string>` (set for **Production** and
   **Preview**). Redeploy after adding so the new env is picked up.
2. **The Sanity webhook's "Secret" field** (step below) = the *same* string.
3. (Optional, for local testing) `.env.local` → `SANITY_WEBHOOK_SECRET=<same>`.

Generate one with:

```bash
openssl rand -hex 32
```

Mismatch → the route returns **401 Invalid signature**. Missing in Vercel → **500**.

## Create the webhook

Sanity → **API → Webhooks → Create webhook**. The Free plan includes 2 webhooks
(one for staging, one for production).

| Field | Value |
| --- | --- |
| **Name** | `Revalidate Next.js (staging)` |
| **URL** | `https://dev.perfectimprints.com/api/sanity/revalidate` |
| **Dataset** | `production` |
| **Trigger on** | ✅ Create  ✅ Update  ✅ Delete |
| **Filter** | `!(_id in path("drafts.**")) && _type in ["megaMenu","globalSettings","homePage","page","blogPost","video","customProduct","customCategory","curatedCategory","faq","categoryOverride","productPlacement","customSchema","brand","landingPage","productPage","form"]` |
| **Projection** | `{_id, _type, slug, categorySlug, pageUrl, "addToCategories": array::unique([...coalesce(before().addToCategories, []), ...coalesce(after().addToCategories, [])]), "removeFromCategories": array::unique([...coalesce(before().removeFromCategories, []), ...coalesce(after().removeFromCategories, [])])}` |
| **HTTP method** | `POST` |
| **HTTP headers** | none (Sanity adds the signature header automatically) |
| **API version** | latest (leave default) |
| **Secret** | the same string set as `SANITY_WEBHOOK_SECRET` in Vercel |
| **Enable** | on |

### Why the filter

- `!(_id in path("drafts.**"))` → fire only on **publish**, not on every draft
  autosave.
- `_type in [...]` → only the document types the route actually handles, so we
  don't waste webhook deliveries on `leadSubmission`, `author`, etc.
  (Keep this list in sync with the types handled in
  [app/api/sanity/revalidate/route.ts](../app/api/sanity/revalidate/route.ts) —
  `faq` was added when the `/faq` library shipped,
  `categoryOverride` / `productPlacement` when M5-504 landed, **`brand` when
  the Featured Brands strip shipped (Task F)** — it was deliberately excluded
  originally to save deliveries, but `/brands` now depends on the `featured`
  flag — and **`landingPage` when the local landing pages shipped (P2-AI-005)**.
  A handled type left out of this filter silently never revalidates.)

> **⚠️ Manual step for an EXISTING webhook (Task F):** if your staging /
> production webhook was created before the Featured Brands strip, its Filter
> still omits `brand`. Edit the webhook in Sanity → API → Webhooks and paste the
> updated Filter above (the only change is the trailing `,"brand"`). Do this on
> **staging now** and on **production at launch**. Projection is unchanged —
> `brand`'s `_type` + `slug` are already covered. Until you do this, toggling a
> brand's **Featured** flag will NOT refresh `/brands`.

> **⚠️ Manual step for an EXISTING webhook (P2-AI-005, landing pages):**
> `landingPage` is a NEW document type — both existing webhooks were created
> before it, so their Filters omit it. Edit **each** webhook in Sanity → API →
> Webhooks and paste the updated Filter above (the only change vs. the previous
> filter is the trailing `,"landingPage"`). Do this on **staging now** and on
> **production when P2-AI-005 promotes**. Projection is unchanged — the handler
> only needs `_type` + `slug`, both already projected. Until you do this,
> publishing or editing a landing page will NOT refresh `/<slug>` or the
> sitemap (the page still appears on its first-ever visit via on-demand SSG,
> but later edits stay silently stale until the next deploy).

> **⚠️ Manual step for an EXISTING webhook (P2-CP-001, product pages):**
> `productPage` is a NEW document type — both existing webhooks were created
> before it, so their Filters omit it. Edit **each** webhook in Sanity → API →
> Webhooks and paste the updated Filter above (the only change vs. the previous
> filter is the trailing `,"productPage"`). Do this on **staging now** and on
> **production when P2-CP-001 promotes**. Projection is unchanged — the handler
> only needs `_type` + `slug`, both already projected. Until you do this,
> publishing or editing a Product Page will NOT refresh `/products/<slug>`,
> `/new-products`, search, or the sitemap (a brand-new product still appears on
> its first-ever visit via on-demand SSG, but later edits stay silently stale
> until the next deploy).

> **⚠️ Manual step for an EXISTING webhook (P2-FB-001, form builder):**
> `form` is a NEW document type — both existing webhooks were created before
> it, so their Filters omit it. Edit **each** webhook in Sanity → API →
> Webhooks and paste the updated Filter above (the only change vs. the previous
> filter is the trailing `,"form"`). Do this on **staging now** and on
> **production when P2-FB-001/002 promotes**. Projection is unchanged — the
> handler only needs `_type` + `slug`, both already projected. Until you do
> this, editing a form in Studio (adding a field, changing the recipient or
> wording) will NOT refresh the rendered form OR the submit route's cached copy
> — the old definition (including the old recipient) keeps serving until the
> next deploy.
> categories):** add **`_id`** to the Projection (the updated Projection above —
> the only change is the leading `_id,`). When a `productPage` or
> `customProduct` that is attached to category grids via
> `categoryOverride.addedProducts` is edited, the handler looks up the
> embedding overrides with `references($id)` and busts each `cat:<slug>` tag so
> the category pages refresh. Without `_id`: **productPage** edits still work
> via a slug-deref fallback (`$slug in addedProducts[]->slug.current`), but an
> attached **customProduct** edit (no slug field) will NOT refresh its embedding
> category pages until something else busts them. Do this on **staging now**
> and on **production when batch 3 promotes**. Adding `_id` is harmless for
> every other type.

> **⚠️ Manual step for an EXISTING webhook (P2-CP-004 batch 4, product-side
> "Add to categories"):** upgrade the Projection's `addToCategories` /
> `removeFromCategories` to the **before() ∪ after() unions** shown above.
> Plain `addToCategories` only carries the CURRENT (after) value, so
> **detaching** a category from a `productPage.addToCategories` (or a
> `productPlacement`) would not bust the detached category's tag — the removed
> product would keep showing there until an unrelated event refreshed that page
> (`revalidate:false` pages never self-refresh). The delta-GROQ union includes
> the before-publish slugs, so attach, detach, and content edits ALL bust the
> right `cat:<slug>` tags. `coalesce(..., [])` keeps create/delete events (where
> `before()`/`after()` is null) working. Do this on **staging now** and on
> **production when batch 4 promotes**. Until then, attaches + edits work;
> detaches go stale on the detached category only.

### Why the projection

The route reads `_type` + `slug.current` for most types, plus `categorySlug`
(for `categoryOverride`), `addToCategories` / `removeFromCategories` (for
`productPlacement` AND — batch 4 — `productPage.addToCategories`, both as
before/after unions so detaches bust too), `pageUrl` (for `customSchema`), and
`_id` (for the `references($id)` lookup that busts category pages embedding an
edited `productPage`/`customProduct` via `categoryOverride.addedProducts` —
P2-CP-004 batch 3). Including those keeps the payload small while still giving
the handler everything it needs; unused fields are simply absent for other
types.

## Production webhook (✅ created 2026-07-01)

The production webhook is a **second** webhook identical to the above except:

| Field | Value |
| --- | --- |
| **Name** | `Revalidate Next.js (production)` |
| **URL** | `https://www.perfectimprints.com/api/sanity/revalidate` |

Same filter, projection, and secret (the production `SANITY_WEBHOOK_SECRET` in
Vercel must match this webhook's Secret).

## Test it

1. Deploy the current branch to the target environment (so the route + handled
   types are live).
2. Create the webhook with a matching secret.
3. In Studio, **publish** a video / blog / custom product.
4. Sanity → API → Webhooks → the webhook → **Delivery** log should show
   **200 OK** with a JSON body like `{ "revalidated": true, "paths": [...] }`.
5. On the site, open the search box — the new item appears within seconds; new
   custom products show on `/deals`, `/new-products`, `/rush-products`.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Delivery shows **401** | Secret mismatch between the webhook and Vercel — re-set both to the same value, redeploy. |
| Delivery shows **500** (`Webhook secret not configured`) | `SANITY_WEBHOOK_SECRET` missing in Vercel for that environment. Add it, redeploy. |
| Delivery shows **200** but `{ "revalidated": false }` | The published `_type` isn't handled (expected for types outside the table above). |
| 200 but content still stale | First hard-refresh (browser cache). FAQ + video reads go through the **non-CDN** `cachedClient` + a cache tag (`faqs` / `videos`) the webhook busts, so those update deterministically; other reads on the `client` (CDN) can lag a few seconds while Sanity's CDN propagates. |
| Nothing fires on publish | Webhook filter excludes the type, or the webhook is disabled, or it points at the wrong environment URL. |

## Related

- Handler: [app/api/sanity/revalidate/route.ts](../app/api/sanity/revalidate/route.ts)
- Shared route path constant: [lib/search/constants.ts](../lib/search/constants.ts)
- Live search delta: [app/api/search-index/route.ts](../app/api/search-index/route.ts)
- CLAUDE.md Section 13 (Deployment) + Section 17 (search conventions)
