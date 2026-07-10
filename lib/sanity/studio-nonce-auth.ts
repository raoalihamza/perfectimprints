/**
 * Cookie-session-safe Studio auth (server-side), shared by privileged Studio →
 * API routes (P2-CP-003). This is the EXACT scheme proven by the Site Refresh
 * panel (app/api/sanity/workflows/route.ts), factored out so new panels reuse
 * it instead of re-implementing:
 *
 *   1. The Studio panel writes a random nonce to a DRAFT doc via the
 *      cookie-authed Studio client. Only a logged-in user with dataset-write
 *      grants can perform that write, and a draft is NOT returned by
 *      anonymous/public dataset reads — so an unauthenticated caller can
 *      neither create the doc nor read the nonce.
 *   2. Every privileged call carries the nonce in a header.
 *   3. The route reads the draft nonce with its own server SANITY_API_TOKEN and
 *      compares timing-safe (+ a 24h freshness window). Match → authorized;
 *      else 401. Cross-origin browser callers → 403.
 *
 * Each panel uses its OWN doc id + header name so two open panels never clobber
 * each other's session. The workflows route keeps its original inline copy —
 * behavior there is untouched.
 */

import { timingSafeEqual } from 'node:crypto';
import { createClient, type SanityClient } from '@sanity/client';

const NONCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StudioAuthResult {
  ok: boolean;
  status: number;
  error?: string;
}

/** Our canonical site origin (for the cross-origin guard). */
function siteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Browsers always send `Origin` on cross-origin requests (and on same-origin
 * non-GET), so a present-but-mismatched Origin is a hard reject. An absent
 * Origin passes — the nonce proof is the real gate.
 */
function crossOriginBlocked(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const ours = siteOrigin();
  if (!ours) return false; // can't determine our origin (env unset) → don't hard-fail
  return origin !== ours;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Server-side Sanity client (SANITY_API_TOKEN, raw perspective so drafts are
 * readable). Null when the server env is incomplete. Also usable as the write
 * client for routes that create/patch documents after passing auth.
 */
export function serverSanityClient(): SanityClient | null {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
    process.env.SANITY_STUDIO_PROJECT_ID ||
    process.env.SANITY_PROJECT_ID;
  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET ||
    process.env.SANITY_STUDIO_DATASET ||
    process.env.SANITY_DATASET;
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId || !dataset || !token) return null;
  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    token,
    useCdn: false,
    perspective: 'raw',
  });
}

/**
 * Verify the first-party Studio nonce for a privileged route.
 * `authDocId` must be a DRAFT id (e.g. `drafts.bulkImportAuth`) matching what
 * the panel writes; `headerName` is the request header carrying the nonce.
 */
export async function verifyStudioNonce(
  request: Request,
  opts: { authDocId: string; headerName: string },
): Promise<StudioAuthResult> {
  if (crossOriginBlocked(request)) {
    return { ok: false, status: 403, error: 'Cross-origin requests are not allowed.' };
  }
  const nonce = (request.headers.get(opts.headerName) || '').trim();
  if (nonce.length < 16) {
    return { ok: false, status: 401, error: 'Unauthorized — reload the Studio and sign in.' };
  }
  const sanity = serverSanityClient();
  if (!sanity) {
    return {
      ok: false,
      status: 500,
      error: 'Server is missing SANITY_API_TOKEN / Sanity project config.',
    };
  }
  try {
    const doc = await sanity.fetch<{ nonce?: string; at?: string } | null>(
      `*[_id == $id][0]{ nonce, at }`,
      { id: opts.authDocId },
    );
    if (!doc?.nonce || !timingSafeEqualStr(doc.nonce, nonce)) {
      return { ok: false, status: 401, error: 'Unauthorized — reload the Studio and sign in.' };
    }
    if (doc.at) {
      const age = Date.now() - new Date(doc.at).getTime();
      if (Number.isFinite(age) && age > NONCE_MAX_AGE_MS) {
        return { ok: false, status: 401, error: 'Session expired — reload the Studio.' };
      }
    }
    return { ok: true, status: 200 };
  } catch {
    return { ok: false, status: 500, error: 'Could not verify your Studio session.' };
  }
}
