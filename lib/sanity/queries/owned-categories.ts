import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import { cachedClient } from '@/lib/sanity/client';
import { CATEGORY_CONTROL_TAG } from '@/lib/sanity/cache-tags';

/**
 * Category-control sets for the `/cat/<slug>` render (M5-504 hybrid restore).
 *
 * Two small slug sets, read via a single **cache-tagged** Sanity fetch (tag
 * `category-control-sets`, NOT `no-store`) so it does not force the route
 * dynamic and the webhook can refresh it in seconds:
 *   - `owned`  — slugs with a published `customCategory`. Sanity OWNS these
 *     `/cat/<slug>` pages and wins over baked JSON.
 *   - `edited` — `owned` ∪ slugs touched by a `categoryOverride`, a
 *     `productPlacement`, or a `productPage.addToCategories` placement
 *     (P2-CP-004 batch 4). Only these pages run the per-slug override/placement
 *     fetches; every untouched baked page renders from JSON with zero Sanity.
 *
 * The build-time `public/custom-category-slugs.json` artifact is the offline
 * owned-set fallback (and seeds `generateStaticParams`).
 */

// Re-export so existing webhook imports keep working (legacy alias).
export const OWNED_CATEGORY_SLUGS_TAG = CATEGORY_CONTROL_TAG;

const SLUGS_FILE = path.join(process.cwd(), 'public', 'custom-category-slugs.json');

export interface CategoryControlSets {
  owned: Set<string>;
  edited: Set<string>;
}

interface ControlQueryResult {
  owned: string[];
  overrides: string[];
  placementsAdd: string[];
  placementsRemove: string[];
  pagePlacements: string[];
}

const CONTROL_QUERY = `{
  "owned": *[_type == "customCategory" && defined(slug.current)].slug.current,
  "overrides": *[_type == "categoryOverride" && defined(categorySlug)].categorySlug,
  "placementsAdd": *[_type == "productPlacement"].addToCategories[],
  "placementsRemove": *[_type == "productPlacement"].removeFromCategories[],
  "pagePlacements": *[_type == "productPage"].addToCategories[]
}`;

const clean = (list: string[] | undefined): string[] =>
  (list ?? []).filter((s): s is string => typeof s === 'string' && s.length > 0);

let _fileCache: Set<string> | null = null;
function readOwnedFileFallback(): Set<string> {
  if (_fileCache) return _fileCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(SLUGS_FILE, 'utf8')) as { slugs?: string[] };
    _fileCache = new Set(parsed.slugs ?? []);
  } catch {
    _fileCache = new Set();
  }
  return _fileCache;
}

/**
 * Owned slugs from the build artifact only (no network). Used by
 * `generateStaticParams` so currently-owned pages prebuild.
 */
export function getOwnedSlugsFromFile(): string[] {
  return [...readOwnedFileFallback()];
}

/** Both control sets in one shared cache-tagged read. Falls back to the static file when Sanity is down. */
export async function getCategoryControlSets(): Promise<CategoryControlSets> {
  try {
    const res = await cachedClient.fetch<ControlQueryResult>(
      CONTROL_QUERY,
      {},
      { next: { tags: [CATEGORY_CONTROL_TAG], revalidate: false } },
    );
    const owned = new Set(clean(res?.owned));
    const edited = new Set<string>(owned);
    for (const s of [
      ...clean(res?.overrides),
      ...clean(res?.placementsAdd),
      ...clean(res?.placementsRemove),
      ...clean(res?.pagePlacements),
    ]) {
      edited.add(s);
    }
    return { owned, edited };
  } catch {
    const owned = readOwnedFileFallback();
    // Offline: only owned slugs are known; override/placement can't apply
    // without Sanity anyway, so `edited` == `owned`.
    return { owned, edited: new Set(owned) };
  }
}

/** Convenience: just the owned set (Sanity-wins precedence). */
export async function getOwnedCategorySlugs(): Promise<Set<string>> {
  return (await getCategoryControlSets()).owned;
}
