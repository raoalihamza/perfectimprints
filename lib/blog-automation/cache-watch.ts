/**
 * The Blog Topics route's cache-failure watch (AUTO-121). Module state, which
 * is per serverless instance, and that is exactly where the failure shows:
 * the same instance answering two pool calls with two different
 * `generatedAt` values, both freshly built, neither asked for by a Refresh,
 * inside the cache lifetime, means every open is rebuilding, which is what
 * the data cache does silently when it refuses an entry. Lives outside the
 * route file because a Next route module may export only its handlers and
 * config (an extra export fails the build's route type check).
 *
 * Pure apart from that state; no fetch, no Sanity, no next/*.
 */

const cacheWatch: { generatedAt: string | null; refreshRequested: boolean } = { generatedAt: null, refreshRequested: false };

/** The route calls this when Refresh expires the cache, so the rebuild that follows is expected. */
export function noteRefreshRequested(): void {
  cacheWatch.refreshRequested = true;
}

/** Null when the cache is behaving; a sentence for the panel when it is not. */
export function cacheWarningFor(snapshot: { generatedAt: string; buildMs: number; cacheBytes: number }): string | null {
  const previous = cacheWatch.generatedAt;
  const fresh = Date.now() - new Date(snapshot.generatedAt).getTime() < snapshot.buildMs + 5_000;
  const rebuiltUnasked = previous !== null && previous !== snapshot.generatedAt && fresh && !cacheWatch.refreshRequested;
  cacheWatch.generatedAt = snapshot.generatedAt;
  cacheWatch.refreshRequested = false;
  if (!rebuiltUnasked) return null;
  const mb = (snapshot.cacheBytes / 1024 / 1024).toFixed(2);
  return `The saved list is not being kept between opens (the entry is ${mb} MB), so every open is reading Search Console again. The list is still correct. Ali: check the server log for the data cache refusing the entry.`;
}

/** Tests only: forget what was seen. */
export function resetCacheWatchForTests(): void {
  cacheWatch.generatedAt = null;
  cacheWatch.refreshRequested = false;
}
