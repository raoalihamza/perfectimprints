/**
 * Studio-side half of the nonce guard on the AI generate routes (FIX-850).
 *
 * Exactly the cookie-session handshake the Site Refresh and Bulk Upload tools
 * perform (sanity/tools/site-refresh-tool.tsx, sanity/tools/bulk-import-tool.tsx),
 * shared by the eight "Generate ... with AI" document actions instead of being
 * copied into each one:
 *
 *   1. Write a random nonce to the DRAFT handshake doc via the cookie-authed
 *      Studio client (only a signed-in user with dataset-write grants can).
 *   2. Send that nonce in the request header on every generate call.
 *   3. On a 401 (nonce expired or overwritten by another Studio tab),
 *      re-handshake once and retry.
 *
 * The nonce is cached at module level so one handshake serves every Generate
 * button in this Studio session; it is performed lazily on the first click,
 * never on mount, so opening a document writes nothing.
 *
 * Studio-only: plain React + the `sanity` client. Imports only the pure
 * constants module so the routes and this hook agree on the doc id + header.
 */
import { useCallback } from 'react';
import { useClient } from 'sanity';
import {
  GENERATE_AUTH_DOC_ID,
  GENERATE_AUTH_DOC_TYPE,
  GENERATE_NONCE_HEADER,
} from '../../lib/sanity/generate-auth';

let cachedNonce: string | null = null;

function newNonce(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export type GenerateAuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Returns a `fetch` that carries the Studio session nonce. Call it exactly
 * where the action used to call `fetch`; the request body, method and
 * Content-Type are passed through untouched.
 */
export function useGenerateAuthFetch(): GenerateAuthFetch {
  const client = useClient({ apiVersion: '2024-10-01' });

  const handshake = useCallback(async (): Promise<string | null> => {
    try {
      const nonce = newNonce();
      await client.createOrReplace({
        _id: GENERATE_AUTH_DOC_ID,
        _type: GENERATE_AUTH_DOC_TYPE,
        nonce,
        at: new Date().toISOString(),
      });
      cachedNonce = nonce;
      return nonce;
    } catch {
      cachedNonce = null;
      return null;
    }
  }, [client]);

  return useCallback<GenerateAuthFetch>(
    async (input, init) => {
      const call = (nonce: string | null) =>
        fetch(input, {
          ...init,
          credentials: 'same-origin',
          headers: {
            ...(init?.headers || {}),
            ...(nonce ? { [GENERATE_NONCE_HEADER]: nonce } : {}),
          },
        });

      let nonce = cachedNonce ?? (await handshake());
      const res = await call(nonce);
      if (res.status === 401) {
        nonce = await handshake();
        if (nonce) return call(nonce);
      }
      return res;
    },
    [handshake],
  );
}
