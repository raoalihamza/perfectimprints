// Live Sanity search delta (M5-507 follow-up).
//
// Serves the editor-managed slice of the search index — blogs, videos, custom
// categories, custom products — so newly published content is searchable almost
// immediately, without rebuilding the static `public/search-index.json` (which
// only carries the slow-changing Geiger bulk). The client fetches this AND the
// static file and merges them (see lib/search/load-index.ts).
//
// Freshness model (ISR):
//   - `revalidate` = 1 WEEK → the response auto-refreshes weekly even if no
//     webhook ever fires.
//   - The Sanity publish webhook calls `revalidatePath('/api/search-index')` →
//     refresh within seconds of an editor hitting Publish.

import { NextResponse } from 'next/server';
import { buildSanitySearchItems } from '@/lib/search/sanity-index';
import type { SearchIndexFile } from '@/lib/search/types';

// ISR: cache the GET response, auto-refresh weekly, bust on-demand via the
// publish webhook. (Next 16's tag-based revalidation now needs a cache-profile
// arg; path revalidation stays a clean one-liner, so we use ISR + revalidatePath.)
//
// NOTE: `revalidate` is a Next segment config — it MUST be a static literal, not
// a reference/expression (e.g. `7 * 24 * 60 * 60` via a const fails the build
// with "Invalid segment configuration export"). 604800 = 7 days in seconds.
export const revalidate = 604800;

export async function GET() {
  const items = await buildSanitySearchItems();
  const payload: SearchIndexFile = { generatedAt: new Date().toISOString(), items };
  return NextResponse.json(payload);
}
