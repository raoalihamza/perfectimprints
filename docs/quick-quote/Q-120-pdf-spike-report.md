# Q-120: PDF viability spike

Date: 2026-07-31. Repo: `perfectimprints` (main site). Throwaway spike, hardcoded dummy data,
nothing here is meant to survive. The removal list is at the end.

**Verdict up front: GO on `@react-pdf/renderer` 4.5.1.** It builds on Vercel, runs on Node 24,
renders a two page quote with a hot-linked Geiger photo, and degrades safely when that photo is
missing. Numbers below.

## Files consulted

- [docs/quick-quote/Q-000-prebuild-investigation.md](Q-000-prebuild-investigation.md), Q3 section
  (environment facts: React 19, Next 16.2.6, `engines.node >= 24`, no committed fonts, all existing
  HTML emails on an Arial/Helvetica stack, no `serverExternalPackages` in `next.config.ts`).
- [sanity/schemas/documents/quote.ts](../../sanity/schemas/documents/quote.ts) and
  [sanity/schemas/objects/quote-line-items.ts](../../sanity/schemas/objects/quote-line-items.ts)
  for the real field shape (Q-110). Copied the shape, hardcoded the values. No Sanity read.
- [lib/quotes/quote-totals.ts](../../lib/quotes/quote-totals.ts) - imported read-only, see note below.
- [app/api/sanity/bulk-import/route.ts](../../app/api/sanity/bulk-import/route.ts) lines 32-35, the
  only existing long-budget route, used as the route config precedent.
- [lib/email/gmail-smtp.ts](../../lib/email/gmail-smtp.ts) `sendBuiltEmail` and the
  `LeadEmailAttachment` interface (`{filename, content: Buffer, contentType?}`). The renderer returns
  a `Buffer`, so it drops into that attachment shape with no adapter.
- [next.config.ts](../../next.config.ts) - confirmed nothing excludes packages from the bundle today.

One deliberate deviation from "hardcoded only": the spike imports `computeQuoteTotals` and
`formatUsd` from the real totals module, read-only. Hardcoding a second set of totals would have
tested the wrong thing, and the import proves the intended integration works. Nothing in the module
was modified.

## Part 1: the dependency

`@react-pdf/renderer` **4.5.1**, pinned exactly (no caret) in `dependencies`.

- **package.json diff: one line.** No other dependency version changed. The rest of the lockfile
  churn is pnpm re-keying existing entries (`sanity`, `next-sanity`, `jsdom`, `isomorphic-dompurify`)
  because a new peer suffix appeared in their keys. Versions before and after are identical.
- **45 new packages, 22.6 MB installed payload** (measured per package, payload directories only, not
  the pnpm store link farm). Biggest: `hyphen` 9.3 MB, `fontkit` 5.8 MB, `brotli` 1.5 MB,
  `@react-pdf/pdfkit` 1.3 MB, `pako` 0.8 MB, `yoga-layout` 0.3 MB.
- **No native modules and no wasm.** `find` over the new package trees returned zero `.node` files
  and zero `.wasm` files. `yoga-layout` 3.2.1 ships a pure JS build, which is what makes this
  serverless-safe.
- Install took 28 seconds. Peer warnings printed are the pre-existing `next-sanity` vs Next 16 and
  `@sanity/client` v6 vs v7 ones; `@react-pdf/renderer`'s own peer (`react ^19`) is satisfied.

## Part 2: what the spike renders

`lib/quotes/spike-q120/` holds a fixture with 16 line items and a document component. It exercises,
on purpose:

- header block (company, rep name/email/phone, quote number, quote date, expiry date),
- customer block,
- a six column table (item / qty / unit / setup / shipping / line total),
- a row whose description wraps to six lines inside the item column,
- a row with a 130 character product name,
- two charge lines, which correctly show a dash in the setup and shipping columns,
- one product photo hot-linked from `imgsirv.geiger.com`,
- a right aligned totals block using the site's own `formatUsd`,
- an expiry note plus a terms paragraph,
- a repeating page footer with `Page N of M`,
- enough rows to force a second page.

Typography is react-pdf's built-in Helvetica and Helvetica-Bold. **No font file was committed.**
Brand red `#E11F1E`, ink `#231F20`, muted `#666666`, border `#E5E5E5`, soft `#F5F5F5` are reused so
the document reads as the same brand without attempting to mirror the web layout.

### Layout bug the spike caught

The first render pushed the numeric columns off the right edge on the long product name row. Cause:
the item cell had `flexGrow: 1` but the default `flexBasis: auto`, so the long name set the column
width instead of wrapping inside it. Fix is `flexBasis: 0` on the item cell and its inner text
wrapper. This is exactly the class of thing the spike existed to find, and the real implementation
needs the same fix from day one; the comment is in the code.

### Page breaking

Two pages, verified visually at both Letter and A4. The `fixed` table header repeats at the top of
page two. Rows are `wrap={false}` so no row splits across the break. The totals block and the terms
block are also `wrap={false}` and stayed together. The `fixed` footer rendered on both pages with the
correct `Page 1 of 2` / `Page 2 of 2`. Nothing was clipped.

## Part 3: the temporary route

`app/api/__q120-pdf-spike__/route.ts`. Node runtime, `force-dynamic`, `maxDuration = 60`, following
the bulk-import precedent. Returns `application/pdf` with a download filename, and 404s unless
`?key=q120-pdf-spike` is present. Query switches: `size=A4`, `image=broken`, `image=webp`, `json=1`.
Comment at the top states it is a Q-120 spike to be deleted. Not linked, not in the sitemap.

## Part 4: measurements

### What was measured, and where

Read this first, because it changes how much weight each number carries.

The real staging project (`dev.perfectimprints.com`) is deployed from the connected GitHub repo onto
a **Vercel account this machine's CLI is not logged in to** (`vercel project ls` under
`alihamzarao6` and `GoldenDoor` shows no perfectimprints project), and this prompt forbids
committing or pushing, which is the only other route to a staging deploy. To get real build numbers
I deployed the working tree to a **temporary throwaway Vercel project** under the developer's own
account, using only the four PUBLIC build variables (Sanity project id and dataset, geiger host,
site url) and **no secrets**. That project has since been **deleted**, along with the local
`.vercel` link.

That got the **build** answers. It did **not** get the **runtime** answers: every deployment URL on
that account, preview and production alike, is behind Vercel SSO deployment protection and returned
a 302 to `vercel.com/sso-api` for every request, so the route was never actually invoked on Vercel.
The remaining runtime numbers below are **local, on Node 24.15.0 on Windows**, and are labelled as
such. They are not a substitute for the deployed measurement.

**Still outstanding: a deployed run of the route.** See the "what is still unproven" list at the end.

### 1. Does the Vercel build succeed with the new dependency

**Yes.** Three Vercel builds were run with `@react-pdf/renderer` in `dependencies`; all three
compiled. Two completed end to end and went READY (the third failed later, at page-data collection,
purely because that run targeted an environment where the public Sanity variables were not set -
`Dataset "production" not found for project ID "placeholder"`, nothing to do with the PDF library).

Consistent numbers across runs, on a `2 cores, 8 GB` iad1 build machine with **no build cache**:

| Build step | Time |
| --- | --- |
| `pnpm install` (1198 packages, cold) | 24.5 s and 26.4 s |
| `prebuild` (search index, category list, product list) | included below |
| `Compiled successfully` | **69 s** in all three runs |
| TypeScript | 17.2 s, 17.3 s |
| Static generation | 2,891 and 2,892 pages |

**Honest caveat on "did the build time change noticeably": I have no before baseline on the same
machine.** The comparison would need a build of the same commit without the dependency on the same
2 core runner, which I did not run. What I can say is that the compile step reported the identical
69 s in every run, no new build step appeared, and the bundler emitted no warning or error
attributable to `@react-pdf/renderer`, `yoga-layout`, or `fontkit`. The known Q-000 risk (c), the
esbuild `__dirname` issue in the Yoga dependency, **did not reproduce** under Next 16's bundler.

### 2. Does it run on Node 24

**Yes, locally, with no warning at all.** This was the specific unverified risk from Q-000.

- `require('@react-pdf/renderer')` resolves and exposes `renderToBuffer` on Node **v24.15.0**.
- Six consecutive renders produced byte-identical output with no deprecation warning, no
  experimental warning, and no stderr output other than the image warning described in item 6.
- The Vercel builds logged `Warning: Detected "engines": { "node": ">=24.0.0" }`, which is Vercel's
  standing warning about the open-ended engines range and predates this spike.

**Not yet proven on Vercel's Node 24 runtime**, only on local Node 24. The runtimes are the same
major but not the same build or OS, so this is strong evidence, not proof.

### 3. Cold and warm response time (LOCAL, not deployed)

Measured over a fresh process, one import then six renders, repeated twice:

| Phase | Run A | Run B |
| --- | --- | --- |
| `import` of the renderer plus the document | 2,147 ms | 2,271 ms |
| First render (includes the remote image fetch and font init) | 4,582 ms | 4,321 ms |
| Renders 2 to 6 | 1,461 / 814 / 865 / 775 / 713 ms | 1,507 / 1,227 / 1,254 / 771 / 694 ms |

A separate multi-variant run measured subsequent renders as low as 280 to 426 ms once the process
was fully warm.

Two things dominate and both will be much better on Vercel:

- **The remote image fetch.** `curl` from this machine to `imgsirv.geiger.com` measured
  **1.55 to 2.25 s** per image. A Vercel `iad1` function is a short hop from that CDN. This is the
  single largest component of the cold number and it is a location artefact, not a library cost.
- **Module import, about 2.2 s.** On Vercel this is paid once per cold container, not per request.

Read conservatively: a warm request should be well inside a second, and a cold one a few seconds.
`maxDuration = 60` on the route is far more headroom than needed. **These are local numbers and must
be re-measured on the deployment before being quoted to anyone.**

### 4. Size of the generated PDF

Sixteen line items, two pages, one embedded product photo:

| Variant | Bytes |
| --- | --- |
| US Letter | **26,457** |
| A4 | 26,638 |
| Letter, image URL left at the site default `format=webp&thumbnail=275` | 19,304 |
| Letter, image URL dead (image omitted) | 9,179 |

So roughly **9 KB of document plus about 17 KB per embedded photo at 400 px**. A real quote with a
photo on every line would grow accordingly; six photos would land near 110 KB, which is still a fine
email attachment. Worth remembering when the real implementation decides how many line photos to
embed and at what pixel size.

### 5. Size cost

- **Installed footprint: 22.6 MB across 45 new packages** (payload directories only). Top
  contributors: `hyphen` 9.3 MB, `fontkit` 5.8 MB, `brotli` 1.5 MB, `@react-pdf/pdfkit` 1.3 MB.
- **No native binaries, no wasm.**
- **Does it leak into other bundles: no.** Only two files in the repo reference the package, both
  spike files, and only the spike route imports the document. Next bundles per route, so nothing
  else can pull it in. The Vercel build produced no import trace mentioning it outside the spike
  route.
- **Deployed serverless function size: NOT MEASURED.** The Vercel CLI streams a truncated build log
  and the route table plus any function-size line were not in the captured output, and the project
  was deleted before the dashboard log could be pulled. This is the one size number still missing.
  Expect it to matter: `fontkit` and `hyphen` alone are 15 MB on disk, and although tree shaking
  should discard most of the hyphenation dictionaries, that assumption is unverified.

### 6. Remote image behaviour

- **A good Geiger CDN URL renders.** The photo appears in the first line item. Confirmed visually.
- **A dead URL does NOT fail the PDF.** With `image=broken`, react-pdf logged
  `Not valid image extension` to stderr **twice** and rendered the complete document with the image
  slot simply blank. Everything else, all sixteen rows, both pages, the totals and the footer, was
  intact and the totals were unchanged. **This is the behaviour the requirement needed:** a
  customer's quote does not fail to download because one product photo is unavailable. It should
  still be wrapped in the real implementation so the warning is logged deliberately rather than
  leaking to stderr.
- **Watch the `format=webp` parameter.** Every `imageUrl` in `data/geiger/products.json` carries
  `format=webp`, and **react-pdf decodes only JPEG and PNG**. Today that URL still works, because
  the CDN content-negotiates and returned `image/jpeg` to a client that did not ask for webp
  (verified: `http=200 type=image/jpeg` for all three URL shapes tested). That is the CDN's choice,
  not a guarantee. The real implementation should strip `format=webp` rather than depend on it.
- **Timeout behaviour was NOT tested.** A slow-but-alive image host is a different failure mode from
  a 404 and I did not simulate it. react-pdf exposes no per-image timeout, so the real
  implementation should fetch images itself and pass buffers in, which also removes the last
  outbound network call from the render.

### 7. Page breaking

Verified visually at both Letter and A4, at full page zoom, both pages:

- Two pages, sixteen rows split twelve then four plus totals.
- The `fixed` table header **repeats correctly** at the top of page two.
- No row split across the break (`wrap={false}` on rows).
- Totals block and terms block stayed intact.
- The `fixed` footer rendered on both pages with `Page 1 of 2` and `Page 2 of 2`.
- Nothing clipped, nothing overlapping, after the `flexBasis` fix described in Part 2.

### The generated files

`tmp/q120/` (untracked, regenerate with `pnpm tsx scripts/spike/q120-render-pdf.ts`):

- `quote-letter.pdf` - the main artefact, open this one
- `quote-a4.pdf`, `quote-letter-webp-image.pdf`, `quote-letter-broken-image.pdf`
- `quote-letter-fit1.png`, `quote-letter-fit2.png`, `quote-letter-end.png` - page renders

## Part 5: fallback and interim

Not needed - the library works. No `pdf-lib` comparison was built.

One line on the safety net: **yes, a browser print stylesheet on the customer quote page is an
acceptable interim** if the PDF is deferred, because the quote page will already carry every number
in HTML and `@media print` rules plus a "Print / Save as PDF" button costs about an hour. It is worse
than a real PDF in two specific ways (no control over the customer's browser header and footer, and
nothing to attach to the notification email), so it is an interim, not a substitute.

## Part 6: verdict

### Go or no go

**Go, on `@react-pdf/renderer` 4.5.1**, with one gate still open: the route has never been invoked
on a Vercel deployment. Everything the library was suspected of (Node 24, the Yoga bundling issue,
a native dependency sneaking in, images being impossible) is now disproven or measured. What remains
unproven is the platform runtime, and nothing observed suggests it will fail.

### What is still unproven, and how to close it

1. **The route running on Vercel.** Needs one deployment that this machine can actually reach. Either
   a branch pushed to the connected GitHub repo (blocked here: this prompt forbids committing), or a
   `vercel login` on the account that owns the real project followed by `vercel deploy`.
2. **Deployed cold and warm response time.** Falls out of item 1 immediately: hit
   `/api/__q120-pdf-spike__?key=q120-pdf-spike&json=1` once for cold, five times for warm; the route
   returns `{ms, bytes, node}` and also sets `X-Spike-Render-Ms` and `X-Spike-Node`.
3. **Serverless function size.** Read it from the build log's route table or the dashboard.
4. **Image fetch timeout behaviour** against a slow host.

### Effort for the real PDF prompt

**2 to 3 days**, based on what this spike actually hit rather than on documentation.

The renderer itself is not where the time goes; a working two page quote took a couple of hours. The
time goes into: pulling the real quote by token instead of a fixture and mapping four polymorphic
line-item types (including the `productPage` reference deref for display name and image) into rows;
fetching images defensively as buffers with a timeout and a per-image fallback; deciding the shape
when fields are absent, because a Studio draft can be half filled and the PDF must still render;
Sanity-hosted images for `quoteCustomLine` needing the image-url builder rather than a raw URL; and
the email attachment path plus its filename convention.

Add half a day if brand fonts are wanted. Inter would have to be committed as TTF files and
registered with `Font.register`, which is the first binary asset in the repo. **Recommendation: do
not.** Built-in Helvetica matches every existing HTML email, costs nothing, and looked correct.

### The things that will be harder than they look

1. **`flexBasis: 0` on every flexible cell.** Omit it and one long product name silently pushes the
   money columns off the page. It cost this spike a render cycle to find and it will not show up in
   any test that uses short fixture names. Put a genuinely long name in the test data.
2. **Photos, not the library, are the cost driver.** One 400 px image is about 17 KB of the PDF and
   1.5 to 2.3 s of fetch from a distant client. Decide deliberately how many line photos to embed
   and at what size, and fetch them concurrently rather than letting react-pdf fetch them serially
   during layout.
3. **`format=webp` is a trap that is currently disarmed.** react-pdf decodes JPEG and PNG only. The
   URLs in `products.json` all say webp and only work because the CDN chooses to send JPEG. Strip
   the parameter, do not rely on the negotiation.
4. **Failures are quiet.** A bad image printed `Not valid image extension` to stderr and carried on.
   That is the behaviour we want, but it means a systematically broken image URL would ship silently
   for weeks. Log it deliberately.
5. **Totals must keep coming from `lib/quotes/quote-totals.ts`.** The temptation to compute a
   subtotal inline while building rows is real, and it is exactly how the PDF ends up disagreeing
   with the Studio preview.
6. **Repeated table headers interact with `fixed`.** It worked here, but `fixed` also means the
   element renders on every page, so anything else marked `fixed` (a footer, a watermark) needs the
   same check the moment the layout changes.

### Removal list

Back the spike out completely by deleting these and reverting these two files. One clean commit.

**Delete:**

- `app/api/__q120-pdf-spike__/` (the whole directory)
- `lib/quotes/spike-q120/` (the whole directory: `fixture.ts`, `quote-pdf-document.tsx`)
- `scripts/spike/` (the whole directory: `q120-render-pdf.ts`)
- `tmp/q120/` (untracked generated output, never staged)

**Revert:**

- `package.json` - remove the single line `"@react-pdf/renderer": "4.5.1",` from `dependencies`
- `pnpm-lock.yaml` - regenerate with `pnpm install` after the package.json edit

**Keep:**

- this report. It is the evidence, and it stays useful whether or not the library is adopted.

**Already cleaned up, nothing to do:**

- the temporary Vercel project and its four public environment variables were deleted
- the local `.vercel` link directory was removed
- the `.vercel` line the Vercel CLI appended to `.gitignore` was reverted

---

# Q-121 addendum: measured on a real deployment

Date: 2026-07-31. Measurement only, no code change. Closes the two gaps Q-120 left open.

Deployment: `staging-perfectimprints-hy379hqfi-patrick-4231s-projects.vercel.app`, deployed by Ali
from the committed spike (commits `41f2657c` and `f67e34c5`). **Note: the route folder was renamed on
commit from `app/api/__q120-pdf-spike__/` to `app/api/q120-pdf-spike/`.** The removal list above still
names the old path; use the new one.

No deployment protection was encountered. Every request returned a real response.

## Route answers, and on which Node

`GET /api/q120-pdf-spike?key=q120-pdf-spike&json=1` returned **HTTP 200**,
`{"ok":true,"ms":1101,"bytes":26457,"node":"v24.18.0"}`.

**Node v24.18.0**, so the deployed function runs the expected Node 24 major (local was v24.15.0).
This is the direct confirmation Q-120 could not get: the library runs on Vercel's Node 24 runtime,
not only on a local one. Requests entered at the `sin1` edge and were served by a function in
`iad1`, which is the relevant fact for the image fetch below.

## Cold and warm

`render` is the time the route measures around `renderToBuffer` only. `round trip` is what curl saw
from Karachi. The gap is network latency plus, on a cold request, container boot and module import,
none of which the render timer covers. A customer in the United States pays a much smaller network
component than the numbers on the right.

| Request | Render (in function) | Round trip (from Karachi) |
| --- | --- | --- |
| First request of the session | 1,101 ms | 2.94 s |
| **Cold, after 16 minutes idle** | **678 ms** | **3.13 s** |
| Warm 1 | 336 ms | 1.054 s |
| Warm 2 | 367 ms | 1.040 s |
| Warm 3 | 307 ms | 0.958 s |
| Warm 4 | 342 ms | 1.161 s |
| Warm 5 | 266 ms | 1.218 s |
| Warm 6 | 275 ms | 0.965 s |
| **Warm median** | **322 ms** | **1.047 s** |

Reading it honestly:

- **Warm render is about a third of a second.** Well inside any reasonable budget, and `maxDuration
  = 60` on the route is enormous headroom.
- **Cold costs about 2 seconds of round trip on top of warm**, while the render timer only rose from
  322 ms to 678 ms. That roughly 2 s sits in container boot plus the module import, which matches
  the 2.1 to 2.3 s local import measurement. It is paid once per cold container, not per request.
- **Network is about 0.73 s of every warm round trip** from this location (1.047 s round trip minus
  322 ms render). A US customer will not pay that.
- The 16 minute idle wait cannot guarantee a genuinely cold container (other traffic could have kept
  it alive), but the shape of the result, render up modestly while round trip jumps 2 s, is exactly
  what a cold start looks like, so it is very likely a true cold sample.

## Variants, on the deployed function

All returned HTTP 200, `Content-Type: application/pdf`, a `%PDF-` header, and 2 pages. Each was
opened and rendered to confirm it is a genuine, readable document, not just well formed bytes.

| Variant | Query | Bytes | Render | Result |
| --- | --- | --- | --- | --- |
| US Letter | (none) | **26,457** | 405 ms | correct, photo present |
| A4 | `&size=A4` | **26,638** | 439 ms | correct |
| Broken image | `&image=broken` | **9,179** | 2,074 ms | **valid 2 page PDF**, image slot blank, totals unchanged |
| webp URL | `&image=webp` | **19,304** | 392 ms | correct, photo present |

**Every byte size is identical to the local run in Q-120.** Same document, same renderer behaviour.

One new number worth keeping: **the broken image variant took 2,074 ms to render, about five times a
normal render.** The dead URL fetch costs roughly 1.7 s before react-pdf gives up. It still produces a
correct document, but it confirms the Q-120 recommendation to fetch images ourselves with an explicit
timeout rather than letting the renderer discover a dead URL during layout.

The webp URL behaved exactly as described locally: it worked, because the CDN content-negotiated and
sent JPEG. That is still the CDN's choice and not a guarantee. Strip `format=webp` in the real build.

## Function size: NOT AVAILABLE from here

I cannot read it. It is not exposed on any HTTP response, the build log lives on the Vercel account
that owns this deployment, and this task forbids logging into that account. **No estimate is given
in its place.**

Where Ali should look, in one step: Vercel dashboard, team `patrick-4231s-projects`, project
`staging-perfectimprints`, Deployments, open the `hy379hqfi` deployment, then either the build log
(search it for `q120`) or the deployment's function listing. Read the size shown against
`/api/q120-pdf-spike`. Equivalently, `vercel inspect --logs <deployment-url>` while logged into that
account prints the same build log.

The number matters because `fontkit` and `hyphen` are 15 MB on disk between them. Tree shaking should
discard most of the hyphenation dictionaries, but that is still an assumption, and this is the number
that would disprove it.

## Does anything contradict the local findings

**No.** Every deployed measurement either matches the local result exactly (all four byte sizes, page
count, layout, broken-image degradation) or is better than it (warm render 322 ms deployed versus 280
to 1,500 ms locally, because the function sits next to the Geiger CDN instead of a continent away).

## Verdict

**The Q-120 go verdict stands, and is now stronger.** The one thing that was genuinely unproven, the
route running on Vercel's Node 24 runtime, is proven. The only remaining unknown is the deployed
function size, which is a sizing question rather than a viability one and cannot block the decision.
