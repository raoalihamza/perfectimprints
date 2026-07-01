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
| `page` | `/services/<slug>` |
| `blogPost` | `/blog`, `/blog/<slug>`, **live search delta** (`/api/search-index`) |
| `video` | `/videos`, `/videos/<slug>`, **live search delta** |
| `customProduct` | `/deals`, `/new-products`, `/rush-products`, **live search delta** |
| `customCategory`, `curatedCategory` | `/cat/<slug>`, **live search delta** |
| `faq` | `/faq`, **live search delta** (+ busts the `faqs` cache tag) |
| `video` | (rows above) **also busts the `videos` cache tag** |
| `categoryOverride` | `/cat/<categorySlug>` (needs `categorySlug` in the projection) |
| `productPlacement` | each `/cat/<slug>` in `addToCategories` + `removeFromCategories` (needs those in the projection) |
| `customSchema` | the doc's `pageUrl` page (+ busts the `customSchema:<pageUrl>` cache tag) — needs `pageUrl` in the projection |
| `brand` | `/brands` + `/brands/<slug>` (+ busts the `brands` cache tag) — drives the Featured Brands strip + A–Z grid. **Originally excluded from the Filter — must be added (see below).** |

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
| **Filter** | `!(_id in path("drafts.**")) && _type in ["megaMenu","globalSettings","homePage","page","blogPost","video","customProduct","customCategory","curatedCategory","faq","categoryOverride","productPlacement","customSchema","brand"]` |
| **Projection** | `{_type, slug, categorySlug, pageUrl, addToCategories, removeFromCategories}` |
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
  `categoryOverride` / `productPlacement` when M5-504 landed, and **`brand` when
  the Featured Brands strip shipped (Task F)** — it was deliberately excluded
  originally to save deliveries, but `/brands` now depends on the `featured`
  flag. A handled type left out of this filter silently never revalidates.)

> **⚠️ Manual step for an EXISTING webhook (Task F):** if your staging /
> production webhook was created before the Featured Brands strip, its Filter
> still omits `brand`. Edit the webhook in Sanity → API → Webhooks and paste the
> updated Filter above (the only change is the trailing `,"brand"`). Do this on
> **staging now** and on **production at launch**. Projection is unchanged —
> `brand`'s `_type` + `slug` are already covered. Until you do this, toggling a
> brand's **Featured** flag will NOT refresh `/brands`.

### Why the projection

The route reads `_type` + `slug.current` for most types, plus `categorySlug`
(for `categoryOverride`), `addToCategories` / `removeFromCategories` (for
`productPlacement`), and `pageUrl` (for `customSchema`). Including those keeps the
payload small while still giving the handler everything it needs; unused fields
are simply absent for other types.

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
