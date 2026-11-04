/**
 * SEC-100 guard 1: the prebuild check. First step of `pnpm build` (prebuild),
 * and runnable alone as `pnpm sec:check-read`.
 *
 * The Sanity dataset is private. A build without a working read token would
 * not fail on its own: Sanity answers an unauthenticated query with HTTP 200
 * and an EMPTY result, so every page would build hollow and ship. This makes
 * that impossible on Vercel: no token, a rejected token, or a token that
 * cannot read, and the build stops here, so Vercel keeps the previous
 * deployment. The rules and the words are in lib/sanity/read-check.ts.
 *
 * Prints only states, counts and type names. Never the token, never a
 * document field.
 */
import '../search-index/load-env';

import { cachedClient, sanityReadTokenConfigured } from '../../lib/sanity/client';
import { isConfiguredSanityProject, isSanityAccessError } from '../../lib/sanity/read-access';
import { evaluateReadCheck, type TokenReadOutcome } from '../../lib/sanity/read-check';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';

async function withRetries<T>(attempt: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (isSanityAccessError(err)) throw err; // a credential failure does not get better by asking again
      last = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

function short(err: unknown): string {
  const status = (err as { statusCode?: number } | null)?.statusCode;
  const msg = err instanceof Error ? err.message : String(err);
  return `${status ? `HTTP ${status}: ` : ''}${msg}`.slice(0, 160);
}

async function tokenRead(): Promise<TokenReadOutcome | null> {
  if (!sanityReadTokenConfigured) return null;
  try {
    const id = await withRetries(() => cachedClient.fetch<string | null>(`*[_id == "globalSettings"][0]._id`, {}, { cache: 'no-store' }));
    return id === 'globalSettings' ? { state: 'ok' } : { state: 'cannot-read', detail: 'the query answered with no document' };
  } catch (err) {
    return { state: isSanityAccessError(err) ? 'rejected' : 'error', detail: short(err) };
  }
}

async function anonymousCount(): Promise<number | null> {
  try {
    const url = `https://${projectId}.api.sanity.io/v2024-10-01/data/query/${encodeURIComponent(dataset)}?query=${encodeURIComponent('count(*)')}`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: unknown };
    return typeof body.result === 'number' ? body.result : null;
  } catch {
    return null;
  }
}

async function customPathTypes(): Promise<Record<string, number> | null> {
  if (!sanityReadTokenConfigured) return null;
  try {
    // Published perspective (the client's): drafts and release versions are
    // excluded, so this is exactly what the site's queries can now see.
    const types = await cachedClient.fetch<string[]>(`*[_id in path("*.**")]._type`, {}, { cache: 'no-store' });
    const counts: Record<string, number> = {};
    for (const t of types ?? []) counts[t] = (counts[t] ?? 0) + 1;
    return counts;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const configured = isConfiguredSanityProject(projectId);
  const [read, anon, custom] = configured ? await Promise.all([tokenRead(), anonymousCount(), customPathTypes()]) : [null, null, null];
  const result = evaluateReadCheck({
    projectConfigured: configured,
    onVercel: process.env.VERCEL === '1',
    vercelEnv: process.env.VERCEL_ENV ?? null,
    tokenConfigured: sanityReadTokenConfigured,
    tokenRead: read,
    anonymousCount: anon,
    customPathTypes: custom,
  });
  for (const line of result.lines) (result.pass ? console.log : console.error)(line);
  // exitCode, not exit(): exiting while fetch sockets close crashes Node on Windows.
  if (!result.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[sanity-read] FAILED: the check itself crashed (${short(err)}). Nothing was built.`);
  process.exitCode = 1;
});
