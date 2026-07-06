/**
 * Smart warmup list builder (cost optimization, 2026-07-06).
 *
 * The warmup used to crawl ALL ~21,139 facet + compound-facet URLs after the
 * monthly rebuild. Those crawls were the main driver of both the Vercel bill
 * (ISR writes — one per generated page) and the Sanity bill (each on-demand
 * render runs the tag-cached control-set read against the live API). Patrick
 * approved Option B ("Smart"): warm only a capped set of the most valuable
 * pages and let the long tail generate on-demand on first visit (which is how
 * on-demand SSG already works — a cold page just serves its first hit at
 * 400-800ms, then caches at the edge until the next deploy).
 *
 * The list is:
 *   1. GUARANTEED: every /cat/ page linked from the mega-menu navigation
 *      (lib/nav-data.ts — the seed source of the Sanity megaMenu singleton).
 *      Nav-reachable pages must never be cold. In practice these are all
 *      root-type pages already prebuilt by generateStaticParams, so this is
 *      a verification step that adds URLs only if that ever stops being true.
 *   2. The top WARMUP_FACET_CAP single-facet pages ranked by SKU count
 *      (/cat/<root>/<facet-type>/<facet-value> — type 'facet' only; the 2
 *      compound-facet pages are prebuilt via PREBUILD_TYPES and multi-segment
 *      combos stay on-demand by design).
 *
 * Everything NOT in this list still renders on-demand and caches — nothing
 * about /cat staticness, freshness, the sitemap, or SEO changes. The sitemap
 * still lists all 22,180 category URLs; this only changes which pages are
 * PRE-generated, not which exist or are indexable.
 *
 * Ranking signal: SKU count per facet URL from data/geiger/facet-memberships.json.
 * It is the best deterministic in-repo proxy for page value (more products =
 * broader page = more likely to rank/get visits). Once real traffic data is
 * available (Cloudflare Web Analytics / Google Search Console), swap the body
 * of rankSingleFacetUrls() for a visits/crawls-based ranking — it is isolated
 * for exactly that reason.
 *
 * Run standalone for the dry-run report: `pnpm warmup:list`
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDepartments, SIMPLE_NAV } from '../../lib/nav-data';

/**
 * How many single-facet pages the warmup pre-generates, ranked by SKU count.
 * Tune after observing a billing cycle (higher = faster long tail, more ISR
 * writes + Sanity reads per monthly warmup; lower = cheaper, more cold first
 * hits). Decision with Patrick 2026-07-06: 3,500.
 */
export const WARMUP_FACET_CAP = 3500;

interface UrlEntry {
  url: string;
  type: 'root' | 'modifier' | 'facet' | 'compound-facet';
}

interface UrlsFile {
  urls: UrlEntry[];
}

interface MembershipsFile {
  memberships: Record<string, string[]>;
}

interface RankedFacet {
  url: string;
  skuCount: number;
}

export interface WarmupList {
  /** Final crawl list: guaranteed nav pages (if any were cold) + top facets. */
  urls: string[];
  /** Everything below, for the dry-run report. */
  stats: {
    oldCount: number;
    newCount: number;
    navTotal: number;
    navPrebuilt: number;
    navAdded: string[];
    selected: RankedFacet[];
    cutoffSkuCount: number;
    firstExcluded: RankedFacet | null;
  };
}

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), relPath), 'utf8')) as T;
}

/**
 * Rank single-facet URLs by value, best first. Currently: SKU count
 * descending (deterministic, in-repo), URL ascending as tie-break so the
 * list is stable across runs. Swap this body for a traffic-based ranking
 * (GSC clicks / CF Analytics visits) once that data exists — keep the
 * signature so callers don't change.
 */
function rankSingleFacetUrls(
  facetUrls: string[],
  memberships: Record<string, string[]>
): RankedFacet[] {
  return facetUrls
    .map((url) => ({ url, skuCount: memberships[url]?.length ?? 0 }))
    .sort((a, b) => b.skuCount - a.skuCount || (a.url < b.url ? -1 : 1));
}

/** All /cat/ hrefs reachable from the mega-menu nav (dedup'd). */
function collectNavCategoryUrls(): string[] {
  const out = new Set<string>();
  for (const dept of getDepartments()) {
    if (dept.href?.startsWith('/cat/')) out.add(dept.href);
    for (const child of dept.children) {
      if (child.href?.startsWith('/cat/')) out.add(child.href);
    }
  }
  // SIMPLE_NAV holds no /cat/ links today (Deals/Brands/Videos/etc), but scan
  // it anyway so a future nav change can't silently leave a category cold.
  for (const item of SIMPLE_NAV) {
    if (item.href.startsWith('/cat/')) out.add(item.href);
    for (const child of item.children ?? []) {
      if (child.href.startsWith('/cat/')) out.add(child.href);
    }
  }
  return [...out].sort();
}

/**
 * URLs already rendered at build time by app/cat/[...slug]/page.tsx
 * generateStaticParams: root + modifier + compound-facet types (mirrors its
 * PREBUILD_TYPES) plus the currently-owned customCategory slugs from the
 * prebuild artifact. Warming these would be a wasted request.
 */
function collectPrebuiltUrls(urls: UrlEntry[]): Set<string> {
  const prebuilt = new Set<string>();
  for (const u of urls) {
    if (u.type === 'root' || u.type === 'modifier' || u.type === 'compound-facet') {
      prebuilt.add(u.url);
    }
  }
  const ownedFile = resolve(process.cwd(), 'public/custom-category-slugs.json');
  if (existsSync(ownedFile)) {
    const owned = JSON.parse(readFileSync(ownedFile, 'utf8')) as { slugs?: string[] };
    for (const slug of owned.slugs ?? []) prebuilt.add(`/cat/${slug}`);
  }
  return prebuilt;
}

export function buildWarmupList(): WarmupList {
  const urlsFile = readJson<UrlsFile>('data/pi-urls/category-urls.json');
  const membershipsFile = readJson<MembershipsFile>('data/geiger/facet-memberships.json');

  // What the OLD warmup would have crawled: every facet + compound-facet URL.
  const oldCount = urlsFile.urls.filter(
    (u) => u.type === 'facet' || u.type === 'compound-facet'
  ).length;

  const prebuilt = collectPrebuiltUrls(urlsFile.urls);

  // Guaranteed inclusions: nav-reachable categories that are NOT prebuilt.
  const navUrls = collectNavCategoryUrls();
  const navAdded = navUrls.filter((url) => !prebuilt.has(url));

  // Top single-facet pages by SKU count. type 'facet' is single-facet by
  // definition (/cat/<root>/<facet-type>/<facet-value>); compound-facets are
  // prebuilt and deeper combos don't exist as static pages.
  const facetUrls = urlsFile.urls
    .filter((u) => u.type === 'facet' && !prebuilt.has(u.url))
    .map((u) => u.url);
  const ranked = rankSingleFacetUrls(facetUrls, membershipsFile.memberships);
  const selected = ranked.slice(0, WARMUP_FACET_CAP);
  const firstExcluded = ranked[WARMUP_FACET_CAP] ?? null;

  const facetSet = new Set(selected.map((f) => f.url));
  const urls = [...navAdded.filter((u) => !facetSet.has(u)), ...selected.map((f) => f.url)];

  return {
    urls,
    stats: {
      oldCount,
      newCount: urls.length,
      navTotal: navUrls.length,
      navPrebuilt: navUrls.length - navAdded.length,
      navAdded,
      selected,
      cutoffSkuCount: selected[selected.length - 1]?.skuCount ?? 0,
      firstExcluded,
    },
  };
}

/**
 * FULL warm list — every category URL in data/pi-urls/category-urls.json
 * (~22,180: roots + modifiers + facets + compound facets). Used ONLY by the
 * explicit "all" scope (the Studio "Warm All Pages" button / a manual
 * `warm_scope: all` dispatch of post-deploy-warmup.yml). The automatic
 * monthly warmup keeps using buildWarmupList() (the capped smart list).
 * Prebuilt pages are included on purpose — a warm hit on a static page is
 * cheap, and "warm everything" should mean everything.
 */
export function buildFullWarmupList(): string[] {
  const urlsFile = readJson<UrlsFile>('data/pi-urls/category-urls.json');
  return urlsFile.urls.map((u) => u.url);
}

/** Old-vs-new report so the selection can be eyeballed before it ships. */
export function printWarmupListReport(list: WarmupList): void {
  const { stats } = list;
  const counts = stats.selected.map((f) => f.skuCount);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;

  console.log('=== Smart warmup list ===');
  console.log(`OLD warmup would crawl: ${stats.oldCount} URLs (all facet + compound-facet)`);
  console.log(
    `NEW warmup will crawl:  ${stats.newCount} URLs (${stats.navAdded.length} nav + ${stats.selected.length} top facets, cap ${WARMUP_FACET_CAP})`
  );
  console.log('');
  console.log(
    `Nav coverage: ${stats.navTotal} nav-linked /cat/ pages found — ${stats.navPrebuilt} prebuilt, ${stats.navAdded.length} added to the warm list → 100% of nav-reachable categories covered (none cold).`
  );
  if (stats.navAdded.length > 0) {
    for (const url of stats.navAdded) console.log(`  nav-added: ${url}`);
  }
  console.log('');
  console.log('Selected single-facet SKU-count distribution:');
  console.log(
    `  min ${counts[counts.length - 1] ?? 0} / median ${median} / max ${counts[0] ?? 0}`
  );
  console.log(`  cutoff (last selected): ${stats.cutoffSkuCount} SKUs`);
  if (stats.firstExcluded) {
    console.log(
      `  first excluded: ${stats.firstExcluded.skuCount} SKUs — ${stats.firstExcluded.url}`
    );
  }
  console.log('');
  console.log('Top 5 selected:');
  for (const f of stats.selected.slice(0, 5)) {
    console.log(`  ${String(f.skuCount).padStart(5)} SKUs  ${f.url}`);
  }
  console.log('Last 5 selected (at the cutoff):');
  for (const f of stats.selected.slice(-5)) {
    console.log(`  ${String(f.skuCount).padStart(5)} SKUs  ${f.url}`);
  }
}

// CLI dry run: `pnpm warmup:list` — prints the report, crawls nothing.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('build-warmup-list.ts')) {
  printWarmupListReport(buildWarmupList());
}
