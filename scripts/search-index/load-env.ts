/**
 * Side-effect module: load `.env.local` into process.env at import time.
 *
 * Must be imported BEFORE any module that reads Sanity env vars at evaluation
 * time (notably `lib/sanity/client.ts`, which constructs its client on import).
 * ESM evaluates dependencies in import order, so listing this first in
 * `build-index.ts` guarantees the vars are set before the Sanity client loads.
 *
 * On Vercel the env vars are already present in process.env, so this is a no-op
 * there; it only matters for direct `pnpm build:search-index` runs.
 */

import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = path.resolve(__dirname, '../..', '.env.local');

if (fs.existsSync(ENV_PATH)) {
  for (const rawLine of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
