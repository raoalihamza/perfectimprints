# Sanity revalidation webhook — setup guide

The site relies on **one** GROQ-powered Sanity webhook that POSTs to a Next.js
route on every publish. That route ([app/api/sanity/revalidate/route.ts](../app/api/sanity/revalidate/route.ts))
verifies the signature and revalidates the affected pages + the live search
delta so editor changes go live **within seconds** instead of waiting for the
ISR fallback.

> **Status (2026-06-21):** the route handler is code-ready, but the webhook was
> **not yet created** in the Sanity project (API → Webhooks showed `0 of 2`).
> Until it exists, revalidation does not fire and content refreshes only via the
> slower fallbacks below. Create it using the steps here — staging first,
> production at launch.

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
| **Filter** | `!(_id in path("drafts.**")) && _type in ["megaMenu","globalSettings","homePage","page","blogPost","video","customProduct","customCategory","curatedCategory"]` |
| **Projection** | `{_type, slug}` |
| **HTTP method** | `POST` |
| **HTTP headers** | none (Sanity adds the signature header automatically) |
| **API version** | latest (leave default) |
| **Secret** | the same string set as `SANITY_WEBHOOK_SECRET` in Vercel |
| **Enable** | on |

### Why the filter

- `!(_id in path("drafts.**"))` → fire only on **publish**, not on every draft
  autosave.
- `_type in [...]` → only the document types the route actually handles, so we
  don't waste webhook deliveries on `leadSubmission`, `brand`, `faq`, etc.

### Why the projection

The route only reads `_type` and `slug.current`. `{_type, slug}` keeps the
payload tiny while still giving the handler everything it needs.

## Production webhook (do at launch)

Create a **second** webhook identical to the above except:

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
| 200 but content still stale | You're looking at a browser/CDN-cached copy; hard-refresh. The search delta also has a small browser cache. |
| Nothing fires on publish | Webhook filter excludes the type, or the webhook is disabled, or it points at the wrong environment URL. |

## Related

- Handler: [app/api/sanity/revalidate/route.ts](../app/api/sanity/revalidate/route.ts)
- Shared route path constant: [lib/search/constants.ts](../lib/search/constants.ts)
- Live search delta: [app/api/search-index/route.ts](../app/api/search-index/route.ts)
- CLAUDE.md Section 13 (Deployment) + Section 17 (search conventions)
