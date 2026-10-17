/**
 * The orphan header-picture sweep, by hand (AUTO-208 Part 8; FIX-920's plan).
 *
 *   pnpm auto:sweep-orphans              dry run: lists what would be removed, removes nothing
 *   pnpm auto:sweep-orphans -- --commit  removes them, re-counting references before each delete
 *
 * NO FLAG MEANS DRY RUN (the PORT-141 pattern); `--dry-run` wins over
 * `--commit`. The same module the digest firing runs weekly
 * (lib/blog-automation/orphan-sweep.ts): only generated header pictures
 * (AUTO-207's rule), only with no referencing document in the raw
 * perspective, only older than 24 hours. The ids, filenames and URLs are
 * written to data/.local/orphan-sweep-<timestamp>.json before anything is
 * deleted, because an asset delete cannot be undone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@sanity/client';
import { sweepOrphanHeaderImages, sweepSentence } from '../../lib/blog-automation/orphan-sweep';

function loadEnvLocal(): void {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const commit = args.includes('--commit') && !args.includes('--dry-run');
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId || !token) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_TOKEN are needed (in .env.local).');
  const client = createClient({ projectId, dataset, apiVersion: '2024-10-01', token, useCdn: false, perspective: 'raw' });

  const t0 = Date.now();
  const report = await sweepOrphanHeaderImages(client, { commit, log: (l) => console.log(l) });
  console.log(`\n${commit ? 'COMMIT' : 'DRY RUN'}: ${sweepSentence(report)}  (${Math.round((Date.now() - t0) / 1000)} s)`);
  for (const a of report.generated) console.log(`   ${a._createdAt?.slice(0, 16) ?? '?'}  ${a.originalFilename ?? '?'}  ${a.width}x${a.height}  ${Math.round((a.size ?? 0) / 1024)} KB  ${a._id}`);
  if (commit) {
    for (const r of report.removed) console.log(`   removed ${r._id}`);
    for (const k of report.kept) console.log(`   kept ${k.asset._id}: ${k.reason}`);
  }
  if (report.generated.length > 0) {
    const dir = path.join(process.cwd(), 'data', '.local');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `orphan-sweep-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 1));
    console.log(`   record written to ${file}`);
  }
  if (!commit && report.generated.length > 0) console.log('\nRun again with --commit to remove them.');
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
