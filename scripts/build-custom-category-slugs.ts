/**
 * Build-time owned-slug baseline for the push-to-Sanity precedence
 * (M5-504 push flow).
 *
 *   pnpm build:custom-category-slugs   (also runs in `prebuild`)
 *
 * Writes public/custom-category-slugs.json = { generatedAt, slugs[] } listing
 * every published `customCategory` slug. The render path (lib/sanity/queries/
 * owned-categories.ts) prefers a tag-cached live Sanity query and uses this file
 * as the offline/build fallback. Best-effort: on any Sanity error it writes an
 * empty list rather than failing the build.
 */
import './search-index/load-env';

import fs from 'node:fs';
import path from 'node:path';
import { client } from '../lib/sanity/client';

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT, 'public', 'custom-category-slugs.json');

async function main(): Promise<void> {
  let slugs: string[] = [];
  try {
    const res = await client.fetch<string[]>(
      `*[_type == "customCategory" && defined(slug.current)].slug.current`,
    );
    slugs = (res ?? []).filter((s): s is string => typeof s === 'string' && s.length > 0).sort();
    console.log(`Owned customCategory slugs: ${slugs.length}`);
  } catch (err) {
    console.warn(
      `! Could not query Sanity for owned slugs (${err instanceof Error ? err.message : 'unknown'}). Writing empty list.`,
    );
    slugs = [];
  }

  const payload = { generatedAt: new Date().toISOString(), slugs };
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload), 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_FILE)}`);
}

main().catch((err) => {
  // Never fail the build on this — write an empty baseline and move on.
  console.warn(`! build-custom-category-slugs failed: ${err}`);
  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), slugs: [] }), 'utf8');
  } catch {
    /* ignore */
  }
});
