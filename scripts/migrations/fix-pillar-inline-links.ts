/**
 * One-off migration: fix value pillars whose body contains LITERAL `<a href>`
 * markup pasted into Studio (renders as visible code on the home page).
 *
 * Part 1 made `homePage.valueProps[].body` portable text so links are possible
 * via the editor's link button, but it did NOT convert HTML that Patrick had
 * already pasted as plain text — e.g. the "Rush Production Available" pillar now
 * holds the literal text `<a href="/rush-products">24 hour rush promos</a>`.
 *
 * This script scans every `valueProps[].body` block. For any span whose text
 * contains a literal `<a href="URL">TEXT</a>` pattern, it rewrites the block:
 * the angle-bracket markup is dropped and TEXT becomes a normal span carrying a
 * `link` mark (markDef) pointing at URL. Relative (`/rush-products`) and
 * absolute URLs are both handled. Only spans that actually contain the pattern
 * are touched; everything else is left byte-for-byte intact.
 *
 *   tsx scripts/migrations/fix-pillar-inline-links.ts             # write
 *   tsx scripts/migrations/fix-pillar-inline-links.ts --dry-run   # print only
 *
 * Idempotent: a body with no literal `<a ...>` markup left is reported as
 * unchanged. Requires SANITY_API_TOKEN (write scope).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SanityClient } from '@sanity/client';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ROOT = resolve(__dirname, '../..');

function loadDotEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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
loadDotEnvLocal();

function buildClient(): SanityClient {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID is required.');
  if (!DRY_RUN && !token) throw new Error('SANITY_API_TOKEN (write scope) is required.');
  return createClient({ projectId, dataset, apiVersion: '2024-10-01', useCdn: false, token });
}

// Matches a literal anchor: <a href="URL">TEXT</a> (single or double quotes,
// optional surrounding whitespace/attributes are tolerated minimally).
const ANCHOR_RE = /<a\s+[^>]*?href=(["'])(.*?)\1[^>]*?>([\s\S]*?)<\/a>/gi;

let keyCounter = 0;
function nextKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}${keyCounter}`;
}

interface Span {
  _type?: string;
  _key?: string;
  text?: string;
  marks?: string[];
  [k: string]: unknown;
}
interface MarkDef {
  _type: string;
  _key: string;
  href?: string;
  [k: string]: unknown;
}
interface Block {
  _type?: string;
  _key?: string;
  children?: Span[];
  markDefs?: MarkDef[];
  [k: string]: unknown;
}

/**
 * Rewrite a single block, expanding any span that contains literal `<a>` markup
 * into plain + linked spans (adding markDefs). Returns the (possibly new) block
 * and whether anything changed.
 */
function rewriteBlock(block: Block): { block: Block; changed: boolean } {
  if (block._type !== 'block' || !Array.isArray(block.children)) {
    return { block, changed: false };
  }
  let changed = false;
  const newMarkDefs: MarkDef[] = [...(block.markDefs ?? [])];
  const newChildren: Span[] = [];

  for (const span of block.children) {
    const text = typeof span.text === 'string' ? span.text : '';
    if (span._type !== 'span' || !ANCHOR_RE.test(text)) {
      newChildren.push(span);
      continue;
    }
    ANCHOR_RE.lastIndex = 0;
    changed = true;
    const baseMarks = Array.isArray(span.marks) ? span.marks : [];

    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ANCHOR_RE.exec(text)) !== null) {
      const [full, , href, innerRaw] = m;
      // Plain text before this anchor keeps the original marks.
      const before = text.slice(lastIndex, m.index);
      if (before) {
        newChildren.push({
          _type: 'span',
          _key: nextKey('s'),
          text: before,
          marks: [...baseMarks],
        });
      }
      // Linked text: strip any nested tags from the inner label, add a markDef.
      const inner = innerRaw.replace(/<[^>]+>/g, '').trim();
      if (inner) {
        const markKey = nextKey('link');
        newMarkDefs.push({ _type: 'link', _key: markKey, href });
        newChildren.push({
          _type: 'span',
          _key: nextKey('s'),
          text: inner,
          marks: [...baseMarks, markKey],
        });
      }
      lastIndex = m.index + full.length;
    }
    // Trailing plain text after the last anchor.
    const after = text.slice(lastIndex);
    if (after) {
      newChildren.push({
        _type: 'span',
        _key: nextKey('s'),
        text: after,
        marks: [...baseMarks],
      });
    }
  }

  if (!changed) return { block, changed: false };
  return { block: { ...block, markDefs: newMarkDefs, children: newChildren }, changed: true };
}

interface RawPillar {
  _key?: string;
  _type?: string;
  title?: string;
  body?: Block[] | string;
}
interface RawHome {
  _id: string;
  valueProps?: RawPillar[];
}

async function main(): Promise<void> {
  console.log(
    `Fixing literal <a href> in home value-pillar bodies. Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE WRITE'}\n`,
  );
  const client = buildClient();

  const doc = await client.fetch<RawHome | null>(
    `*[_type == "homePage"][0]{ _id, valueProps }`,
  );
  if (!doc) {
    console.log('No homePage document found — nothing to do.');
    return;
  }
  const homeId = doc._id;
  console.log(`homePage doc: ${homeId}`);

  const pillars = doc.valueProps ?? [];
  let anyChanged = false;
  const newPillars: RawPillar[] = pillars.map((p) => {
    if (!Array.isArray(p.body)) return p; // legacy string / empty → not our concern
    let pillarChanged = false;
    const newBody = p.body.map((blk) => {
      const { block, changed } = rewriteBlock(blk);
      if (changed) {
        pillarChanged = true;
        anyChanged = true;
        console.log(`  • Rewrote anchor(s) in pillar "${p.title ?? '(untitled)'}"`);
      }
      return block;
    });
    return pillarChanged ? { ...p, body: newBody } : p;
  });

  if (!anyChanged) {
    console.log('\nNothing to change — no literal <a href> markup found (idempotent).');
    return;
  }

  if (DRY_RUN) {
    console.log('\n' + JSON.stringify(newPillars, null, 2));
    console.log('\nDry run — no writes performed.');
    return;
  }

  await client.patch(homeId).set({ valueProps: newPillars }).commit();
  console.log(`\nPatched ${homeId}. Done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
