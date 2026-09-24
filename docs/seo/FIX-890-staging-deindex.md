# FIX-890: Get the staging site out of Google

Written 2026-09-24. Code complete, staged, not committed, not deployed.

## 1. What each host emitted before the change

Fetched 2026-09-24 with a plain GET (User-Agent `Mozilla/5.0 (compatible; FIX-890 check)`).

| Check | `www.perfectimprints.com` (production) | `dev.perfectimprints.com` (staging) |
| --- | --- | --- |
| `/robots.txt` | 200. `Allow: /`, `Disallow: /admin3773752`, `Disallow: /api`, `Host: https://www.perfectimprints.com`, `Sitemap: https://www.perfectimprints.com/sitemap.xml` | 200. Identical rules, `Host: https://dev.perfectimprints.com`, `Sitemap: https://dev.perfectimprints.com/sitemap.xml` |
| `/` status | 200 | 200 |
| `/` robots meta | none (only `googlebot: max-image-preview:large`) | none (same) |
| `/` canonical | `https://www.perfectimprints.com` | `https://dev.perfectimprints.com` |
| `/` og:url | `https://www.perfectimprints.com` | `https://dev.perfectimprints.com` |
| `/` title and H1 | `Custom Promo Products & Branded Apparel by Perfect Imprints` / `Custom Promotional Products That People Actually Use` | identical |
| `/cat/water-bottles` | 200, no robots meta, canonical `https://www.perfectimprints.com/cat/water-bottles`, H1 `Custom Water Bottles for Branded Promotions & Events` | 200, no robots meta, canonical `https://dev.perfectimprints.com/cat/water-bottles`, identical H1 |
| `/blog/buying-guide-for-stadium-seat-cushions` | 200, no robots meta, canonical on www, H1 `Buying Guide for Stadium Seat Cushions` | 200, no robots meta, canonical on dev, identical H1 |
| `X-Robots-Tag` header | none on any of the four | none on any of the four |
| `/sitemap.xml` | 200, 23,412 URLs, every `<loc>` on www | 200, 23,409 URLs, every `<loc>` on dev |
| HTML size, `/cat/water-bottles` | 534,461 bytes | 534,187 bytes |

Conclusion: the two hosts serve the same site. Staging is a full duplicate, self-canonicalised, with a complete sitemap and nothing telling Google to stay out. AUTO-100's finding stands.

## 2. The signal

`NEXT_PUBLIC_SITE_URL` is set per Vercel project (production `https://www.perfectimprints.com`, staging `https://dev.perfectimprints.com`). The canonicals above prove the two deployments resolve it differently at runtime. The site does not normalise the scheme in code the way the feeds repo does; it uses the env value verbatim with a trailing-slash trim in about forty separate `SITE_URL` constants (CLAUDE.md Section 4 records this as deliberate). The one existing place that branches on the value is the cross-origin guard in `lib/sanity/studio-nonce-auth.ts`, which parses it with `new URL()` and compares origins. The new check follows that: parse, take the host name, compare hosts.

`VERCEL_ENV` is not used and must not be. Staging is its own Vercel project (its own repo, `pbnj53/staging-perfectimprints`, deploying its own `main`), so its deployments are that project's production deployments and `VERCEL_ENV` is `production` there too. Nothing in the repo reads it, and a test now fails if anything starts to.

The rule, in `lib/seo/indexing-policy.ts`, is: a page is `noindex` only when the host of `NEXT_PUBLIC_SITE_URL` is one of the listed non-production hosts (today exactly `dev.perfectimprints.com`). Missing, empty, unparseable, and any host not on that list stay indexable. This is deliberately NOT "anything that is not production is noindex": under that rule a typo in the production project's variable would de-index the real site. The production host is spelled once, as `PRODUCTION_HOST`, and a test asserts it never appears in the non-production list.

## 3. What changed

- `app/layout.tsx`: the site-wide `robots` metadata is `noindex, nofollow` on staging and byte-identical to before on production (the M-SEO5 `max-image-preview:large` hint only).
- `next.config.ts`: on staging only, one extra rule adds `X-Robots-Tag: noindex, nofollow` to every response. On production the header list is unchanged.
- `app/robots.ts`: staging keeps `Allow: /` and the two existing disallows, and drops the `Sitemap:` and `Host:` lines. No blanket `Disallow: /`, and the file says why.
- `app/sitemap.ts`: staging returns an empty `<urlset>`, before any Sanity read.

Canonical: staging keeps its self-canonical. Pointing it at production alongside a `noindex` sends Google two signals that argue with each other (one says "this page is a copy of X, consolidate to X", the other says "drop this page"), and Google's own guidance is not to combine them. The `noindex` is the removal instruction and needs no help; a cross-host canonical would also have meant changing the forty `SITE_URL` sites that feed og:url and JSON-LD, for no gain.

## 4. Deploy order

The code lands in all three repos so they stay identical. Deploy staging first; hold production until staging has been seen to behave.

1. Commit in all three repos (already staged).
2. Push the staging repo. Wait for the Vercel build.
3. Check staging (PowerShell):

```powershell
(Invoke-WebRequest https://dev.perfectimprints.com/robots.txt -UseBasicParsing).Content
(Invoke-WebRequest https://dev.perfectimprints.com/ -UseBasicParsing).Headers['X-Robots-Tag']
(Invoke-WebRequest https://dev.perfectimprints.com/cat/water-bottles -UseBasicParsing).Content -match '<meta name="robots" content="([^"]*)"' | Out-Null; $Matches[1]
(Invoke-WebRequest https://dev.perfectimprints.com/sitemap.xml -UseBasicParsing).Content
```

Expected: robots.txt with `Allow: /` and NO `Sitemap:` line; header `noindex, nofollow`; meta `noindex, nofollow`; a sitemap that is an empty `<urlset>`.

4. Push the production repo. Wait for the build. Check production (this is the check that matters):

```powershell
(Invoke-WebRequest https://www.perfectimprints.com/robots.txt -UseBasicParsing).Content
$r = Invoke-WebRequest https://www.perfectimprints.com/cat/water-bottles -UseBasicParsing
$r.Headers['X-Robots-Tag']
($r.Content -match '<meta name="robots"')
($r.Content -match '<meta name="googlebot" content="max-image-preview:large"')
($r.Content -match '<link rel="canonical" href="https://www.perfectimprints.com/cat/water-bottles"')
((Invoke-WebRequest https://www.perfectimprints.com/sitemap.xml -UseBasicParsing).Content -split '<loc>').Count - 1
```

Expected: robots.txt unchanged (with the `Sitemap:` line); NO `X-Robots-Tag` header (empty output); `False` for a robots meta; `True` for the googlebot hint; `True` for the canonical; a sitemap count in the low twenty-three thousands. If production shows a `noindex` anywhere, revert the production repo's commit and push immediately; the cause can only be the production project's `NEXT_PUBLIC_SITE_URL` reading `dev.perfectimprints.com`, which the Vercel dashboard confirmed it does not.

## 5. Search Console: getting the 1,386 pages out

What the code does: once staging is deployed, every page Google recrawls answers `noindex, nofollow` in both the HTML and the HTTP header, and Google drops that page from the index on that crawl. Code cannot make Google recrawl faster, and it cannot remove a page Google has not yet recrawled. That is what the steps below are for.

Which property: `dev.perfectimprints.com` has no property of its own. It does not need one. The domain property `sc-domain:perfectimprints.com` covers every subdomain, which is how AUTO-100 saw the staging pages in the first place, and both tools below work from it. (A URL-prefix property for `https://dev.perfectimprints.com/` would add URL Inspection's "Request indexing", which forces a recrawl of one URL at a time; not worth creating for 1,386 URLs.)

1. **Temporary removal, the same day as the staging deploy.** In the domain property: Removals, New request, "Remove all URLs with this prefix", prefix `https://dev.perfectimprints.com/`. This hides every staging URL from results within about a day. It does NOT de-index anything: it is a curtain that lasts about six months, and the pages stay in the index behind it. Its job is to stop staging competing with production immediately, while the `noindex` does the real removal underneath.
2. **Let the `noindex` do the removal.** Nothing to click. Google recrawls indexed pages on its own schedule, faster for pages it thinks matter and slower for the long tail. Realistic expectation: the pages Google crawls often (the home page, the root categories, the blog index) drop within days; the bulk of the 1,386 within four to eight weeks; a tail of rarely crawled facet pages can take three months or more. Do not add `Disallow: /` to speed this up; it does the opposite.
3. **Watch two things.** (a) Domain property, Pages report (Indexing), filter by URL containing `dev.perfectimprints.com`: the "Excluded by noindex tag" count should rise and the indexed count should fall. (b) A `site:dev.perfectimprints.com` search, remembering that the temporary removal hides results even while they are still indexed, so the Pages report is the truthful one.
4. **When the six-month removal expires** the curtain lifts. By then the Pages report should show zero indexed staging pages. If it does not, renew the removal request and keep waiting; the `noindex` keeps working regardless.
5. **The `Disallow: /`, if ever.** Safe only when the Pages report has shown zero indexed pages for `dev.perfectimprints.com` for a few weeks. It is not required: a host whose every page says `noindex` stays out of Google indefinitely, and the disallow would only save Google's crawl budget on a site nobody is meant to find. The recommendation is to leave it out permanently, and the comment in `app/robots.ts` says so. If it is added later, it is one `disallow: '/'` on the staging branch of that file and nothing else.

## 6. Is anything else exposed

Looked at DNS, the Vercel verification records, the code, and the hosts themselves.

- `_vercel.perfectimprints.com` carries exactly four `vc-domain-verify` records: `perfectimprints.com`, `www.perfectimprints.com`, `dev.perfectimprints.com`, `feeds.perfectimprints.com`. Nothing else is verified with Vercel on this zone.
- `perfectimprints.com` (apex) answers `301` to `https://www.perfectimprints.com/`. Not a duplicate.
- `feeds.perfectimprints.com` is the separate feeds project: its own title (`Custom Promotional Products Resource Hub`), its own H1, self-canonical on feeds, its own `robots.txt` (`Disallow: /admin5182946`, a different Studio path), and `/cat/water-bottles` returns 404 there. It is meant to be indexed and it is not a copy of this site.
- `staging.`, `preview.`, `beta.`, `test.`, `new.`, `shop.`, `app.` and `dev.feeds.` do not resolve.
- **One more host does serve the staging build: `staging-perfectimprints.vercel.app`**, the staging project's default Vercel alias. It answers 200 with canonical `https://dev.perfectimprints.com` and no `noindex`. Because the decision is made from the staging project's own `NEXT_PUBLIC_SITE_URL`, this alias gets the same `noindex` header and meta from this change with nothing extra to do. It has no Search Console impressions to worry about (its canonical already points at dev) but it is now covered either way.
- The production project's `.vercel.app` alias could not be found by guessing and is not in DNS (it never would be). Whatever it is, it serves the production build with canonicals pointing at www, so it is a canonical-handled duplicate, not an indexed competitor. Vercel also sets `X-Robots-Tag: noindex` on preview deployment URLs by default.

## 7. What was not changed

`/cat/[...slug]` rendering and data, every page's canonical, every `SITE_URL` constant, the sitemap's content on production, no Sanity document, no env var, no Vercel setting, no `.gitignore`, no CI file. The change is one new module, one new test file, four consumer edits, this document, and the entries in CLAUDE.md and TASKS.md.
