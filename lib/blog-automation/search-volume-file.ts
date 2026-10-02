/**
 * The server-side read of the committed search-volume file (AUTO-123).
 * SERVER ONLY (node:fs); the panel never imports it, it receives the parsed
 * file in the route's `pool` response. Like build-topic-pool.ts it imports
 * nothing from next/*, so the script reads the same file the same way.
 *
 * The file is read from `data/blog-automation/search-volumes.json` under
 * `process.cwd()`, the exact shape lib/categories.ts uses for
 * `data/geiger/products.json`, which the dynamic /api/category-products
 * route reads at request time in production; so the path is one Vercel's
 * function tracing already carries for this repo.
 *
 * A missing file reads as null. A damaged file (not JSON, not an object) is
 * logged once and reads as null too: the panel then shows "not looked up" on
 * every row and works exactly as it did before the column existed. A read
 * can never throw into the route.
 *
 * Memoised per module with a cheap mtime check, so a deployed function reads
 * the file once and a local `pnpm dev` sees a refreshed file without a
 * restart.
 */

import fs from 'node:fs';
import path from 'node:path';

import { SEARCH_VOLUME_FILE, parseSearchVolumeFile, type SearchVolumeFile } from './search-volume';

const ROOT = process.cwd();
const FILE = path.join(ROOT, ...SEARCH_VOLUME_FILE.split('/'));

let memo: { mtimeMs: number; file: SearchVolumeFile | null } | null = null;
let warned = false;

/** The absolute path the route and the script read and write. */
export function searchVolumeFilePath(): string {
  return FILE;
}

/** The parsed file, or null when it is missing or unreadable. Never throws. */
export function readSearchVolumeFile(filePath: string = FILE): SearchVolumeFile | null {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    if (filePath === FILE) memo = null;
    return null;
  }
  if (filePath === FILE && memo && memo.mtimeMs === mtimeMs) return memo.file;
  let file: SearchVolumeFile | null;
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw || typeof raw !== 'object' || !('terms' in (raw as object))) throw new Error('not a search-volume file (no "terms")');
    file = parseSearchVolumeFile(raw);
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error(`[search-volume] ${filePath} could not be read; the panel shows every topic as not looked up: ${err instanceof Error ? err.message : String(err)}`);
    }
    file = null;
  }
  if (filePath === FILE) memo = { mtimeMs, file };
  return file;
}

/** Tests only: forget the memo. */
export function resetSearchVolumeFileForTests(): void {
  memo = null;
  warned = false;
}
