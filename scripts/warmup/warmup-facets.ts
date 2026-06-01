/**
 * Post-deploy warmup for on-demand SSG facet pages.
 *
 * The 21,137 facet + 2 compound-facet pages render via on-demand SSG
 * (dynamicParams=true + revalidate=false in app/cat/[...slug]/page.tsx).
 * First hit to each URL after a deploy generates the page and caches it
 * permanently at the edge. Without warmup, cold facets serve in 400-800ms
 * for the first 24-48h. This script pre-hits every facet URL in parallel
 * so visitors only ever see warm pages.
 *
 * Re-running is idempotent: warm hits are cheap and free.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface UrlEntry {
  url: string;
  type: 'root' | 'modifier' | 'facet' | 'compound-facet';
}

interface UrlsFile {
  urls: UrlEntry[];
}

const CONCURRENCY = 10;
const REQUEST_TIMEOUT_MS = 30_000;
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  ''
);

interface Result {
  url: string;
  status: number | 'error';
  ms: number;
  error?: string;
}

async function hit(url: string): Promise<Result> {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${SITE_URL}${url}`, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'perfectimprints-warmup/1.0' },
    });
    return { url, status: res.status, ms: Date.now() - start };
  } catch (err) {
    return {
      url,
      status: 'error',
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(urls: string[]): Promise<Result[]> {
  const results: Result[] = [];
  let cursor = 0;
  let completed = 0;
  const total = urls.length;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= total) return;
      const r = await hit(urls[idx]);
      results.push(r);
      completed++;
      if (completed % 500 === 0 || completed === total) {
        const pct = ((completed / total) * 100).toFixed(1);
        console.log(`[${completed}/${total}] ${pct}% — last: ${r.status} ${r.ms}ms ${r.url}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return results;
}

function main() {
  const file = resolve(process.cwd(), 'data/pi-urls/category-urls.json');
  const data: UrlsFile = JSON.parse(readFileSync(file, 'utf8'));
  const urls = data.urls
    .filter((u) => u.type === 'facet' || u.type === 'compound-facet')
    .map((u) => u.url);

  console.log(`Warming ${urls.length} facet URLs against ${SITE_URL} at concurrency ${CONCURRENCY}`);
  const started = Date.now();

  return runPool(urls).then((results) => {
    const elapsedMs = Date.now() - started;
    const ok = results.filter((r) => r.status === 200);
    const nonOk = results.filter((r) => r.status !== 200);
    const avgMs = Math.round(results.reduce((acc, r) => acc + r.ms, 0) / results.length);
    const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 10);

    console.log('');
    console.log('=== Warmup summary ===');
    console.log(`Total URLs:    ${results.length}`);
    console.log(`200 OK:        ${ok.length}`);
    console.log(`Non-200:       ${nonOk.length}`);
    console.log(`Avg response:  ${avgMs}ms`);
    console.log(`Elapsed:       ${(elapsedMs / 1000 / 60).toFixed(1)}min`);
    console.log('');
    console.log('Slowest 10 URLs:');
    for (const r of slowest) {
      console.log(`  ${r.ms.toString().padStart(5)}ms  ${r.status}  ${r.url}`);
    }
    if (nonOk.length > 0) {
      console.log('');
      console.log(`First 20 non-200s:`);
      for (const r of nonOk.slice(0, 20)) {
        console.log(`  ${r.status}  ${r.url}${r.error ? ` (${r.error})` : ''}`);
      }
    }
    // Non-zero exit if more than 1% failed - signals deploy is in worse shape than expected.
    if (nonOk.length / results.length > 0.01) {
      console.error(`\nWarmup failure rate exceeds 1% (${nonOk.length}/${results.length})`);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
