/**
 * In-memory per-IP rate limiting for public write routes (Q-150).
 *
 * EXTRACTED VERBATIM from app/api/leads/route.ts so the quote-response route
 * reuses the proven limiter instead of forking a second copy. The behaviour is
 * unchanged: a sliding window of timestamps per IP, the current hit recorded
 * only when the request is allowed through.
 *
 * HONEST LIMITATION (unchanged, and the reason this is spam damping and not
 * security): the store is module scope inside one serverless instance. It is
 * lost on a cold start and is not shared between instances, so a determined
 * attacker spread across instances is not stopped by it. Anything that must be
 * durable (the quote view debounce, for example) persists in Sanity instead.
 */

export interface RateLimiter {
  /** True when this IP has already used its allowance in the window. */
  isRateLimited(ip: string): boolean;
}

export function createRateLimiter(options: { max: number; windowMs: number }): RateLimiter {
  const store = new Map<string, number[]>();
  return {
    isRateLimited(ip: string): boolean {
      const now = Date.now();
      const cutoff = now - options.windowMs;
      const hits = (store.get(ip) ?? []).filter((t) => t > cutoff);
      if (hits.length >= options.max) {
        store.set(ip, hits);
        return true;
      }
      hits.push(now);
      store.set(ip, hits);
      return false;
    },
  };
}

/** The caller's IP from the proxy headers, or 'unknown'. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
