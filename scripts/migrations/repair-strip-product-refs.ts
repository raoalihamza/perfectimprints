/**
 * Repair the AI-written product strips that stored one of Patrick's own
 * products as a bare synthetic SKU (FIX-871; the finding is FIX-870).
 *
 *   pnpm repair-strip-refs                dry run: prints exactly what would change, writes nothing
 *   pnpm repair-strip-refs -- --commit    applies it
 *   (= tsx scripts/migrations/repair-strip-product-refs.ts ...)
 *
 * NO FLAG MEANS DRY RUN (the PORT-141 pattern). `--dry-run` is accepted and
 * wins over `--commit`.
 *
 * What it finds. Every strip entry, on every strip surface, whose `sku` is a
 * synthetic `custom-<id>`: `video.relatedProducts`, `landingPage.relatedProducts`,
 * a page's `sections[_type == "productStrip"].products`, and a blog post's
 * `body[_type == "blogProducts"].products`. Drafts included (the two draft blogs
 * FIX-870 identified are draft-only). Read with the token client so drafts are
 * visible; the public read API would miss half the affected documents.
 *
 * What it does to each entry, decided by the SAME helper the generate paths
 * now write through (lib/products/strip-entry-write.ts), with `targetExists`
 * answered by one query for every referenced id:
 *   - target exists as a PUBLISHED document: the entry is REPLACED IN PLACE by
 *     `{ _type: 'relatedProductRef', _key, _ref }`, keeping its `_key` and its
 *     position, so the strip renders the product where the AI put it;
 *   - target gone (deleted), or present only as a draft (the published render
 *     cannot dereference it and a strong reference to it blocks Publish): the
 *     entry is REMOVED, because a reference nobody can resolve is a card that
 *     never renders and a Publish button that stops working.
 *
 * What it never does. It addresses each entry by its own `_key` path
 * (`relatedProducts[_key=="..."]`, `body[_key=="..."].products[_key=="..."]`)
 * with `set` and `unset`, so nothing else in the document is rewritten: no
 * array is replaced wholesale, no other entry moves, no other field is
 * touched. Each document's patch carries `ifRevisionId`, so a document edited
 * between the scan and the write fails loudly for that document instead of
 * being overwritten (Patrick was editing the affected video the day this was
 * written). It never publishes, never creates, never deletes a document.
 *
 * Drafts and published copies. The scan is by document id, so a draft and a
 * published copy are separate documents and each one that holds a broken
 * entry is repaired on its own. A draft-only post is repaired in the draft,
 * and Publish carries the repaired strip forward. A published document with
 * no draft is repaired in place and goes live through the webhook (`video`
 * and `blogPost` are in its Filter); opening it in Studio afterwards starts
 * the draft FROM the repaired copy, so a later Publish cannot bring the old
 * entries back. The one way a Publish could undo a repair is a draft that
 * already existed with the old entries and was NOT repaired; the scan sees
 * every draft, so that draft is repaired in the same run.
 *
 * Idempotent: after a commit the scan finds nothing and the script says so.
 *
 * Requires NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_TOKEN (write scope
 * for --commit; read is enough for the dry run, but a token is needed even
 * then, for the drafts) from .env.local or the shell.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SanityClient } from '@sanity/client';
import { getSanityWriteClient } from '../../lib/sanity/write-client';
import {
  stripEntryForSuggestion,
  SYNTHETIC_SKU_PREFIX,
  syntheticTargetId,
  type StripWriteEntry,
} from '../../lib/products/strip-entry-write';

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

function parseArgs(argv: string[]): { commit: boolean } {
  let commit = false;
  let dryRun = false;
  for (const a of argv) {
    if (a === '--commit') commit = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a !== '--') throw new Error(`Unknown argument: ${a}`);
  }
  return { commit: commit && !dryRun };
}

interface RawEntry {
  _key?: string;
  sku?: string;
}

interface RawStrip {
  _key?: string;
  products?: RawEntry[];
}

interface ScannedDoc {
  _id: string;
  _type: string;
  _rev: string;
  title?: string;
  slug?: string;
  relatedProducts?: RawEntry[];
  strips?: RawStrip[];
}

interface Change {
  path: string;
  key: string;
  sku: string;
  targetId: string;
  action: 'convert' | 'remove';
  entry?: StripWriteEntry;
  targetLabel: string;
  reason?: string;
}

interface DocPlan {
  doc: ScannedDoc;
  changes: Change[];
}

const isSynthetic = (e: RawEntry) =>
  typeof e?.sku === 'string' && e.sku.trim().startsWith(SYNTHETIC_SKU_PREFIX);

/** The four strip surfaces, drafts included (raw perspective). */
async function scan(client: SanityClient): Promise<ScannedDoc[]> {
  const [flat, pages, blogs] = await Promise.all([
    client.fetch<ScannedDoc[]>(
      `*[_type in ['video', 'landingPage'] && defined(relatedProducts)]{
        _id, _type, _rev, title, 'slug': slug.current,
        'relatedProducts': relatedProducts[]{ _key, sku }
      }`,
    ),
    client.fetch<ScannedDoc[]>(
      `*[_type == 'page' && count(sections[_type == 'productStrip']) > 0]{
        _id, _type, _rev, title, 'slug': slug.current,
        'strips': sections[_type == 'productStrip']{ _key, 'products': products[]{ _key, sku } }
      }`,
    ),
    client.fetch<ScannedDoc[]>(
      `*[_type == 'blogPost' && count(body[_type == 'blogProducts']) > 0]{
        _id, _type, _rev, title, 'slug': slug.current,
        'strips': body[_type == 'blogProducts']{ _key, 'products': products[]{ _key, sku } }
      }`,
    ),
  ]);
  return [...flat, ...pages, ...blogs];
}

function entryPaths(doc: ScannedDoc): { path: string; entry: RawEntry }[] {
  const out: { path: string; entry: RawEntry }[] = [];
  const arrayField = doc._type === 'page' ? 'sections' : 'body';
  for (const entry of doc.relatedProducts ?? []) {
    if (isSynthetic(entry) && entry._key) out.push({ path: `relatedProducts[_key=="${entry._key}"]`, entry });
  }
  for (const strip of doc.strips ?? []) {
    if (!strip._key) continue;
    for (const entry of strip.products ?? []) {
      if (isSynthetic(entry) && entry._key) {
        out.push({ path: `${arrayField}[_key=="${strip._key}"].products[_key=="${entry._key}"]`, entry });
      }
    }
  }
  return out;
}

interface TargetState {
  published?: { _type: string; title?: string; slug?: string };
  draft?: { _type: string; title?: string };
}

async function fetchTargets(client: SanityClient, ids: string[]): Promise<Map<string, TargetState>> {
  const map = new Map<string, TargetState>();
  if (ids.length === 0) return map;
  const rows = await client.fetch<{ _id: string; _type: string; title?: string; slug?: string }[]>(
    `*[_id in $ids || _id in $draftIds]{ _id, _type, title, 'slug': slug.current }`,
    { ids, draftIds: ids.map((id) => `drafts.${id}`) },
  );
  for (const id of ids) map.set(id, {});
  for (const row of rows) {
    const base = row._id.replace(/^drafts\./, '');
    const state = map.get(base);
    if (!state) continue;
    if (row._id.startsWith('drafts.')) state.draft = row;
    else state.published = row;
  }
  return map;
}

function label(doc: ScannedDoc): string {
  const variant = doc._id.startsWith('drafts.') ? 'DRAFT' : 'published';
  return `${doc._type} ${doc._id} (${variant}) "${doc.title ?? ''}"${doc.slug ? ` /${doc.slug}` : ''}`;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { commit } = parseArgs(process.argv.slice(2));
  const writeClient = getSanityWriteClient();
  if (!writeClient) {
    throw new Error(
      'NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_TOKEN are required (the token even for the dry run: two of the affected documents are drafts, which the public read API cannot see).',
    );
  }
  // Raw perspective: drafts and published copies are separate documents here.
  const client = writeClient.withConfig({ perspective: 'raw' });
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';

  console.log(`Repair AI product strips (FIX-871)`);
  console.log(`Mode: ${commit ? 'COMMIT (writes the changes below)' : 'DRY RUN (nothing is written)'}`);
  console.log(`Dataset: ${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}/${dataset}\n`);

  const docs = (await scan(client)).filter((d) => entryPaths(d).length > 0);
  if (docs.length === 0) {
    console.log('No strip entry carries a synthetic custom-<id> SKU. Nothing to repair.');
    return;
  }

  const targetIds = [
    ...new Set(
      docs.flatMap((d) => entryPaths(d).map(({ entry }) => syntheticTargetId(entry.sku) ?? '')),
    ),
  ].filter(Boolean);
  const targets = await fetchTargets(client, targetIds);
  const publishedIds = new Set([...targets].filter(([, s]) => s.published).map(([id]) => id));

  // The other variant of each affected document, so the report can say
  // whether a draft or a published copy exists alongside it.
  const baseIds = [...new Set(docs.map((d) => d._id.replace(/^drafts\./, '')))];
  const variants = new Set(
    (
      await client.fetch<{ _id: string }[]>(`*[_id in $ids || _id in $draftIds]{ _id }`, {
        ids: baseIds,
        draftIds: baseIds.map((id) => `drafts.${id}`),
      })
    ).map((r) => r._id),
  );

  const plans: DocPlan[] = docs.map((doc) => ({
    doc,
    changes: entryPaths(doc).map(({ path, entry }) => {
      const sku = (entry.sku ?? '').trim();
      const targetId = syntheticTargetId(sku) ?? '';
      const state = targets.get(targetId);
      const converted = stripEntryForSuggestion({ sku }, entry._key ?? '', {
        targetExists: (id) => publishedIds.has(id),
      });
      const targetLabel = state?.published
        ? `${state.published._type} "${state.published.title ?? ''}"${state.published.slug ? ` /${state.published.slug}` : ''}`
        : state?.draft
          ? `${state.draft._type} "${state.draft.title ?? ''}" (DRAFT ONLY, not published)`
          : 'no such document (deleted)';
      if (converted) {
        return { path, key: entry._key ?? '', sku, targetId, action: 'convert', entry: converted, targetLabel };
      }
      return {
        path,
        key: entry._key ?? '',
        sku,
        targetId,
        action: 'remove',
        targetLabel,
        reason: state?.draft
          ? 'target exists only as a draft: the published site cannot show it and a reference to it would block Publish'
          : state?.published
            ? 'target id is not a storable reference'
            : 'target no longer exists',
      };
    }),
  }));

  let converts = 0;
  let removes = 0;
  for (const { doc, changes } of plans) {
    const base = doc._id.replace(/^drafts\./, '');
    const other = doc._id.startsWith('drafts.') ? base : `drafts.${base}`;
    console.log(label(doc));
    console.log(
      `  ${variants.has(other) ? `a ${other.startsWith('drafts.') ? 'draft' : 'published'} copy also exists (${other})${docs.some((d) => d._id === other) ? ', listed separately below/above' : ', and it holds no broken entry'}` : `no ${doc._id.startsWith('drafts.') ? 'published' : 'draft'} copy exists`}`,
    );
    for (const c of changes) {
      if (c.action === 'convert') {
        converts += 1;
        console.log(
          `  [convert] ${c.path}\n            sku "${c.sku}"\n            -> ${JSON.stringify(c.entry)}\n            (${c.targetLabel})`,
        );
      } else {
        removes += 1;
        console.log(
          `  [remove]  ${c.path}\n            sku "${c.sku}"\n            -> removed: ${c.reason}\n            (${c.targetLabel})`,
        );
      }
    }
    console.log('');
  }
  console.log(
    `plan: ${plans.length} document${plans.length === 1 ? '' : 's'}, ${converts} entr${converts === 1 ? 'y' : 'ies'} to convert to a reference, ${removes} to remove.`,
  );

  if (!commit) {
    console.log('Dry run: nothing written. Re-run with --commit to apply.');
    return;
  }

  let patched = 0;
  let failed = 0;
  for (const { doc, changes } of plans) {
    try {
      const sets: Record<string, StripWriteEntry> = {};
      const unsets: string[] = [];
      for (const c of changes) {
        if (c.action === 'convert' && c.entry) sets[c.path] = c.entry;
        else unsets.push(c.path);
      }
      await client
        .transaction()
        .patch(doc._id, (p) => {
          let patch = p.ifRevisionId(doc._rev);
          if (Object.keys(sets).length > 0) patch = patch.set(sets);
          if (unsets.length > 0) patch = patch.unset(unsets);
          return patch;
        })
        .commit();
      patched += 1;
      console.log(`  patched ${doc._id}`);
    } catch (err) {
      failed += 1;
      console.error(
        `  FAILED ${doc._id}: ${err instanceof Error ? err.message : String(err)} (if it was edited since the scan, just run the script again)`,
      );
    }
  }
  console.log(
    `\ndone: ${patched} patched, ${failed} failed. Nothing was published. Published documents refresh through the Sanity webhook; a repaired draft goes live on its next Publish.`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
