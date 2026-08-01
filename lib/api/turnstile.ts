/**
 * Cloudflare Turnstile verification for public write routes (Q-150).
 *
 * EXTRACTED VERBATIM from app/api/leads/route.ts (including the log wording,
 * which only gains a caller-supplied prefix so `[leads] ...` messages are
 * byte-identical to before). The quote-response route calls the same function
 * rather than writing a second policy, because the failure-mode policy below is
 * the part that is easy to get subtly wrong.
 *
 * Failure-mode policy:
 *
 * - FAIL OPEN (accept, log loudly) on CONFIGURATION errors: TURNSTILE_SECRET_KEY
 *   unset (staging/local without keys, where the widget does not render either),
 *   siteverify rejecting OUR secret, siteverify unreachable, or a non-JSON /
 *   non-2xx siteverify response. The honeypot and the rate limit stay active.
 * - FAIL CLOSED (reject) on ACTUAL verification failures: no token submitted
 *   while the widget is configured, or siteverify answering `success: false`
 *   for the token (invalid, expired, already redeemed).
 */

/** siteverify codes that mean OUR configuration is broken, not the visitor. */
const TURNSTILE_CONFIG_ERROR_CODES = new Set(['invalid-input-secret', 'missing-input-secret']);

export async function verifyTurnstile(
  token: string,
  ip: string,
  logPrefix = 'leads',
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error(
      `[${logPrefix}] TURNSTILE MISCONFIGURED: TURNSTILE_SECRET_KEY is not set — CAPTCHA verification SKIPPED (fail open). Set it in Vercel to activate bot protection.`
    );
    return true;
  }
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (ip && ip !== 'unknown') form.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!res.ok) {
      console.error(
        `[${logPrefix}] TURNSTILE SERVICE ERROR: siteverify returned HTTP ${res.status} — accepting lead (fail open).`
      );
      return true;
    }
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success === true) return true;
    const codes = data['error-codes'] ?? [];
    if (codes.some((code) => TURNSTILE_CONFIG_ERROR_CODES.has(code))) {
      console.error(
        `[${logPrefix}] TURNSTILE MISCONFIGURED: siteverify rejected our secret (${codes.join(', ')}) — accepting lead (fail open). Fix TURNSTILE_SECRET_KEY in Vercel.`
      );
      return true;
    }
    console.warn(`[${logPrefix}] turnstile rejected token (${codes.join(', ') || 'no error codes'})`);
    return false;
  } catch (err) {
    console.error(
      `[${logPrefix}] TURNSTILE UNREACHABLE: siteverify call failed — accepting lead (fail open).`,
      err
    );
    return true;
  }
}
