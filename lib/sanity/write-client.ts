/**
 * The server-side Sanity WRITE client for public API routes (Q-150).
 *
 * EXTRACTED VERBATIM from app/api/leads/route.ts (`getSanityWriteClient`) so the
 * quote-response route and the leads route share one definition. Returns null
 * when the project id or the token is missing, which every caller treats as
 * "skip the Sanity side, the email already went out" rather than as an error.
 *
 * Note the pinned `apiVersion: '2024-10-01'`: at that version a token-bearing
 * client defaults to the `raw` perspective, so any FETCH through this client
 * would see drafts. It is used for writes only. Reads on a render path go
 * through the tag-cached `cachedClient` in lib/sanity/client.ts, which pins
 * `perspective: 'published'` explicitly.
 */
import { createClient, type SanityClient } from '@sanity/client';

export function getSanityWriteClient(): SanityClient | null {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId || !token) return null;
  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    token,
    useCdn: false,
  });
}
