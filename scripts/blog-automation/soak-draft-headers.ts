/**
 * AUTO-220 Part 10, the soak over EXISTING drafts (Ali, 2026-11-15): draw a
 * new header picture, with the new engine, for the drafts the automation
 * made that still carry the old style of picture.
 *
 *   pnpm auto:soak-drafts
 *       DRY RUN. Lists every draft with its verdict and the reason. Asks for
 *       no picture and writes nothing.
 *   pnpm auto:soak-drafts -- --commit --site <the site's https address> --limit 5
 *       Draws for the first 5 eligible drafts, oldest first.
 *   options with --commit:
 *       --only <draft id>     one draft
 *       --max-usd 3           stop once this much has been spent in this run (default 3)
 *       --keep-old <folder>   save each replaced picture there first, for a before and after
 *
 * NO FLAG MEANS DRY RUN (the PORT-141 pattern), and `--dry-run` wins over
 * `--commit`.
 *
 * WHAT IT MAY TOUCH is decided by lib/blog-automation/soak-drafts.ts and by
 * nothing in this file: a never-published draft, made by the engine, whose
 * header picture the site generated. Those rules are proven in
 * soak-drafts.test.ts, which also reads THIS file and fails if it gains a
 * second way to write.
 *
 * HOW A PICTURE IS MADE. Through the deployed engine, the very route the
 * Studio's "Generate header image" button calls, so the soak measures what
 * Patrick will get: the same photo screen, title gate, brand read-back, P!
 * mark, daily cap and upload marker. The route is guarded by a session
 * document only an account with write access can write; the Studio writes it
 * when a button is pressed, and this script writes it the same way with the
 * server's own write access. (A Studio tab open at the same moment asks for a
 * new session once, by itself, on its next button press.) The route writes no
 * post: it returns the picture and this script patches ONE field of the
 * draft, after the guard has looked at the draft again.
 *
 * AFTER THE WRITE the picture that was replaced, and the copy kept beside it,
 * go through the guarded removal rule (discard-header-image.ts: ours, and
 * referenced by nothing), exactly as the Studio button does. When the write
 * is refused, the new picture goes through the same rule instead.
 *
 * Every draft's result is appended to data/.local/soak-drafts/ledger.json
 * (ignored by git).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient, type SanityClient } from '@sanity/client';
import { SOAK_DRAFT_FACTS, soakDraftVerdict, soakWritePlan, type SoakDraftFacts, type SoakOutcome } from '../../lib/blog-automation/soak-drafts';
import { discardGeneratedHeaderImage, type AssetDiscardClient } from '../../lib/blog-automation/discard-header-image';
import { GENERATE_AUTH_DOC_ID, GENERATE_AUTH_DOC_TYPE, GENERATE_NONCE_HEADER } from '../../lib/sanity/generate-auth';
import { NON_PRODUCTION_HOSTS, PRODUCTION_HOST, siteUrlHost } from '../../lib/seo/indexing-policy';
import { imageRequestBody, type BlogImageDoc } from '../../sanity/actions/blog-image-request';

/** The reads around one generated picture (run-cost.ts IMAGE_CHECKS_USD), per attempt. */
const READS_USD_PER_ATTEMPT = 0.006;
/**
 * What a draft is counted at when the engine drew and used nothing of its
 * own (a refused picture carries no figures back): two pictures and their
 * reads, the most one draft can cost. Only the stop below uses it.
 */
const UNREPORTED_USD = 0.12;
/** The route's own ceiling is 120 s; a little more for the network. */
const ASK_TIMEOUT_MS = 150_000;

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

function valueOf(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}

interface Usage {
  model?: string;
  attempts?: number;
  usd?: number;
  mode?: string;
  rung?: number;
  elapsedMs?: number;
  capUsed?: number;
  cap?: number;
  titleReads?: { answered: number; exact: number } | null;
  photos?: { fetched: number; brand: number; offSubject: number; sent: number; nearest?: number } | null;
  mark?: { corner: string; variant: string } | null;
  brandCheckMade?: boolean;
}
interface RouteAnswer {
  ok?: boolean;
  outcome?: SoakOutcome & { notes?: string[]; usage?: Usage };
  what?: string;
  why?: string;
  error?: string;
}

interface ListRow {
  _id: string;
  title?: string;
  _createdAt?: string;
}

async function readFacts(client: SanityClient, id: string): Promise<SoakDraftFacts | null> {
  return (await client.fetch<SoakDraftFacts | null>(`*[_id == $id][0]${SOAK_DRAFT_FACTS}`, { id })) ?? null;
}

async function openSession(client: SanityClient): Promise<string> {
  const nonce = randomUUID().replace(/-/g, '');
  await client.createOrReplace({ _id: GENERATE_AUTH_DOC_ID, _type: GENERATE_AUTH_DOC_TYPE, nonce, at: new Date().toISOString() });
  return nonce;
}

/** One request to the deployed engine. Never throws: a failure is `{ error }`. */
async function askForPicture(site: string, nonce: string, body: unknown): Promise<{ status: number; answer: RouteAnswer }> {
  try {
    const res = await fetch(`${site}/api/sanity/generate-blog-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [GENERATE_NONCE_HEADER]: nonce },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    });
    const answer = (await res.json().catch(() => ({ error: `the engine answered ${res.status} with no readable body` }))) as RouteAnswer;
    return { status: res.status, answer };
  } catch (err) {
    return { status: 0, answer: { error: `the engine could not be reached (${err instanceof Error ? err.message : String(err)})` } };
  }
}

async function keepOld(client: SanityClient, ref: string | undefined, dir: string, name: string): Promise<string | null> {
  if (!ref) return null;
  try {
    const asset = await client.fetch<{ url?: string; extension?: string } | null>(`*[_id == $id][0]{ url, extension }`, { id: ref });
    if (!asset?.url || new URL(asset.url).hostname !== 'cdn.sanity.io') return null;
    const res = await fetch(asset.url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}.${asset.extension || 'jpg'}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return file;
  } catch {
    return null;
  }
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const commit = args.includes('--commit') && !args.includes('--dry-run');
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
  // The server's own write access, the one the sweep script uses (the site's read access is read in one file only, SEC-100).
  const access = process.env.SANITY_API_TOKEN;
  if (!projectId || !access) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID and the Sanity write access are needed (in .env.local).');
  // RAW perspective: a draft and its published copy must both be visible, and references from drafts must count.
  const client = createClient({ projectId, dataset, apiVersion: '2024-10-01', token: access, useCdn: false, perspective: 'raw' });

  // 1) Every draft, judged by the rule. Published posts are not even read: the rule refuses them by their id.
  const [facts, rows, publishedCount] = await Promise.all([
    client.fetch<SoakDraftFacts[]>(`*[_type == "blogPost" && _id in path("drafts.**")]${SOAK_DRAFT_FACTS}`),
    client.fetch<ListRow[]>(`*[_type == "blogPost" && _id in path("drafts.**")]{ _id, title, _createdAt }`),
    client.fetch<number>(`count(*[_type == "blogPost" && !(_id in path("drafts.**"))])`),
  ]);
  const rowOf = new Map(rows.map((r) => [r._id, r]));
  const judged = facts
    .map((f) => ({ facts: f, verdict: soakDraftVerdict(f), row: rowOf.get(f._id) }))
    .sort((a, b) => (a.row?._createdAt ?? '').localeCompare(b.row?._createdAt ?? ''));
  const eligible = judged.filter((j) => j.verdict.eligible === true);
  const tally = new Map<string, number>();
  for (const j of judged) {
    const key = j.verdict.eligible === false ? j.verdict.reason : 'eligible';
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  console.log(`${commit ? 'COMMIT' : 'DRY RUN'}: ${publishedCount} published posts (never touched), ${judged.length} drafts looked at.`);
  for (const [key, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${key}`);
  console.log(`\nELIGIBLE (${eligible.length}), oldest first:`);
  for (const j of eligible) console.log(`   ${(j.row?._createdAt ?? '').slice(0, 10)}  ${j.facts._id}  ${j.row?.title ?? ''}`);
  // The drafts written by hand are only counted above (there are many, and the reason is always the same one).
  const otherRefused = judged.filter((j) => j.verdict.eligible === false && j.verdict.reason !== 'not-engine-made');
  if (otherRefused.length > 0) {
    console.log(`\nTHE OTHER DRAFTS LEFT ALONE (${otherRefused.length}), each with its reason:`);
    for (const j of otherRefused) if (j.verdict.eligible === false) console.log(`   ${j.facts._id}  ${j.row?.title ?? ''}\n        ${j.verdict.why}`);
  }
  if (!commit) {
    console.log('\nNothing was asked for and nothing was written. Run again with --commit --site <address> --limit N to draw.');
    return;
  }

  // 2) The commit path.
  const site = (valueOf(args, '--site') ?? '').replace(/\/+$/, '');
  const host = siteUrlHost(site);
  if (!site.startsWith('https://') || !host || ![PRODUCTION_HOST, ...NON_PRODUCTION_HOSTS].includes(host)) {
    throw new Error('--site must be the https address of the live site or of the staging site.');
  }
  const limit = Math.max(1, Number(valueOf(args, '--limit') ?? 3) || 3);
  const maxUsd = Math.max(0.1, Number(valueOf(args, '--max-usd') ?? 3) || 3);
  const only = valueOf(args, '--only');
  const keepDir = valueOf(args, '--keep-old');
  const queue = (only ? eligible.filter((j) => j.facts._id === only) : eligible).slice(0, limit);
  if (queue.length === 0) {
    console.log(only ? `\n${only} is not eligible; nothing was done.` : '\nNo eligible draft; nothing was done.');
    return;
  }
  const ledgerDir = path.join(process.cwd(), 'data', '.local', 'soak-drafts');
  fs.mkdirSync(ledgerDir, { recursive: true });
  const ledgerFile = path.join(ledgerDir, 'ledger.json');
  const ledger: unknown[] = fs.existsSync(ledgerFile) ? (JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) as unknown[]) : [];
  const record = (entry: Record<string, unknown>) => {
    ledger.push({ at: new Date().toISOString(), site: host, ...entry });
    fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 1));
  };
  const discard = async (refs: readonly string[]) => {
    const out: string[] = [];
    for (const ref of refs) {
      const r = await discardGeneratedHeaderImage(client as unknown as AssetDiscardClient, ref);
      out.push(`${ref}: ${r.deleted === true ? 'removed' : `kept (${r.reason})`}`);
    }
    return out;
  };

  let nonce = await openSession(client);
  let spent = 0;
  let written = 0;
  console.log(`\nDrawing for ${queue.length} draft(s) through ${host}, stopping at USD ${maxUsd.toFixed(2)}.`);
  for (const [i, item] of queue.entries()) {
    if (spent >= maxUsd) {
      console.log(`Stopped: USD ${spent.toFixed(2)} spent in this run.`);
      break;
    }
    const id = item.facts._id;
    const label = `[${i + 1}/${queue.length}] ${item.row?.title ?? id}`;
    // The draft as it is NOW, and the rule again: the list above is a minute old by the last draft.
    const before = await readFacts(client, id);
    const verdict = soakDraftVerdict(before);
    if (!before || verdict.eligible === false) {
      console.log(`${label}\n   left alone: ${verdict.eligible === false ? verdict.why : 'gone'}`);
      record({ id, title: item.row?.title, result: 'left-alone', why: verdict.eligible === false ? verdict.why : 'gone' });
      continue;
    }
    const doc = await client.fetch<BlogImageDoc | null>(
      `*[_id == $id][0]{ title, slug, body, headerImage, externalHeaderImage, headerImageSource, aiTopicKeywords, sourceTopic, relatedCategorySlugs }`,
      { id },
    );
    if (!doc) {
      record({ id, result: 'left-alone', why: 'gone' });
      continue;
    }
    const oldRef = typeof before.headerImage?.asset?._ref === 'string' ? before.headerImage.asset._ref : undefined;
    const kept = keepDir ? await keepOld(client, oldRef, keepDir, id.replace(/^drafts\./, '')) : null;

    // The picture: the button's own request, a first picture of the new engine (the plain prompt).
    const request = { ...imageRequestBody(doc, 'ai'), previousRung: undefined };
    const t0 = Date.now();
    let asked = await askForPicture(site, nonce, request);
    if (asked.status === 401) {
      // The session was replaced (a Studio tab pressed a button): open one more, once.
      nonce = await openSession(client);
      asked = await askForPicture(site, nonce, request);
    }
    const ms = Date.now() - t0;
    const outcome = asked.answer.outcome;
    const usage = outcome?.usage;
    const reported = typeof usage?.usd === 'number';
    const usd = reported ? (usage?.usd ?? 0) + READS_USD_PER_ATTEMPT * (usage?.attempts ?? 1) : outcome ? UNREPORTED_USD : 0;
    spent += usd;
    if (!outcome) {
      console.log(`${label}\n   no picture: ${asked.answer.error ?? `the engine answered ${asked.status}`}`);
      record({ id, title: item.row?.title, result: 'no-answer', status: asked.status, error: asked.answer.error, ms });
      continue;
    }

    // The guard, on a fresh read, then the ONE write.
    const now = await readFacts(client, id);
    const plan = soakWritePlan({ before, now, outcome });
    let result: string;
    let cleanup: string[] = [];
    if (plan.write === false) {
      result = `not written: ${plan.reason}`;
      cleanup = await discard(plan.discardRefs);
    } else {
      try {
        await client.patch(plan.draftId).ifRevisionId(plan.ifRevisionId).set(plan.set).unset(plan.unset).commit();
        written += 1;
        result = 'written';
        cleanup = await discard(plan.replacedRefs);
      } catch (err) {
        // The draft changed in the last instant and Sanity refused the pinned write: the draft keeps what it has.
        result = `not written (${err instanceof Error ? err.message.slice(0, 160) : String(err)})`;
        const made = outcome.kind === 'asset' && outcome.source === 'ai' ? [outcome.image?.asset?._ref, outcome.image?.unmarkedImage?.asset?._ref] : [];
        cleanup = await discard([...new Set(made.filter((r): r is string => typeof r === 'string' && r.length > 0))]);
      }
    }
    console.log(
      `${label}\n   ${result}; ${Math.round(ms / 1000)} s; USD ${usd.toFixed(3)}; ${usage?.mode ?? outcome.kind}${usage?.attempts ? `, ${usage.attempts} attempt(s)` : ''}${usage?.titleReads ? `, title ${usage.titleReads.exact}/${usage.titleReads.answered}` : ''}${usage?.brandCheckMade === false ? ', BRAND CHECK NOT MADE' : ''}`,
    );
    if (asked.answer.why) console.log(`   ${asked.answer.why}`);
    record({ id, title: item.row?.title, result, ms, usd: Math.round(usd * 10000) / 10000, usdReported: reported, what: asked.answer.what, why: asked.answer.why, usage, oldRef, newRef: outcome.image?.asset?._ref ?? null, keptOldAt: kept, cleanup });
  }
  console.log(`\nDone: ${written} draft(s) given a new header picture, about USD ${spent.toFixed(2)} spent in this run. Record: ${ledgerFile}`);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
