/**
 * SEC-100 guard 1: the rules of the prebuild check, PURE.
 *
 * scripts/security/check-sanity-read.ts gathers the facts (is a project
 * configured, is this a Vercel build, does the token read Global Settings,
 * what does an anonymous query see) and this decides pass or fail and the
 * words. A failed check fails `pnpm build`, so Vercel keeps serving the
 * previous deployment instead of shipping a site built from empty answers.
 *
 * FAILS when:
 *  - a Vercel build has a real project and no SANITY_API_READ_TOKEN;
 *  - a token is set and Sanity rejects it (401/403);
 *  - a token is set and cannot see the published Global Settings singleton;
 *  - a token is set and Sanity could not be reached after three tries.
 * PASSES with a warning when a LOCAL build has no token (local builds are not
 * part of the deploy path; the message says what will be empty).
 * SKIPS when no real project is configured (the CI build's `placeholder`).
 *
 * Reported, never failed on:
 *  - whether the dataset is private (an anonymous count of documents);
 *  - documents in a custom ID path the token can see that anonymous reads
 *    cannot (a dotted `_id`). With a token those join every query of their
 *    type, so a CONTENT type there would start appearing on the site. Known
 *    bookkeeping types are listed as expected; anything else is a warning.
 */

/** Types expected in a custom ID path, and why they are harmless: no page queries them. */
export const EXPECTED_CUSTOM_PATH_TYPES: readonly string[] = ['blogAutomationRun'];

export type TokenReadOutcome =
  | { state: 'ok' }
  | { state: 'rejected' | 'cannot-read' | 'error'; detail: string };

export interface ReadCheckInput {
  projectConfigured: boolean;
  onVercel: boolean;
  /** VERCEL_ENV on Vercel (production / preview / development), else null. */
  vercelEnv: string | null;
  tokenConfigured: boolean;
  /** Null when there is no token to try. */
  tokenRead: TokenReadOutcome | null;
  /** Anonymous `count(*)`; null when it could not be read. */
  anonymousCount: number | null;
  /** Types (with counts) of documents in a custom ID path visible to the token; null when not read. */
  customPathTypes: Record<string, number> | null;
}

export interface ReadCheckResult {
  pass: boolean;
  lines: string[];
}

const TOKEN = 'SANITY_API_READ_TOKEN';

export function evaluateReadCheck(input: ReadCheckInput): ReadCheckResult {
  const where = input.onVercel ? `this Vercel build (${input.vercelEnv ?? 'unknown'} environment)` : 'this local build';
  if (!input.projectConfigured) {
    return { pass: true, lines: ['[sanity-read] skipped: no Sanity project is configured (the CI build), so nothing reads Sanity.'] };
  }

  const lines: string[] = [];
  if (!input.tokenConfigured) {
    if (input.onVercel) {
      return {
        pass: false,
        lines: [
          `[sanity-read] FAILED: ${TOKEN} is not set for ${where}.`,
          '[sanity-read] The Sanity dataset is private: without this token every page would build from empty answers.',
          `[sanity-read] Set ${TOKEN} in Vercel > Settings > Environment Variables for the ${input.vercelEnv ?? 'this'} environment, then redeploy. The previous deployment keeps serving until then.`,
        ],
      };
    }
    lines.push(
      `[sanity-read] WARNING: ${TOKEN} is not set for ${where}. Every Sanity read will fail (the dataset is private), so this build and \`pnpm dev\` would show no Sanity content. Add it to .env.local.`,
    );
    return { pass: true, lines: [...lines, ...visibilityLines(input)] };
  }

  const read = input.tokenRead;
  if (!read || read.state !== 'ok') {
    let reason = 'the token was not tried';
    if (read && read.state !== 'ok') {
      reason =
        read.state === 'rejected'
          ? `Sanity rejected the token (${read.detail}): it was revoked, mistyped, or belongs to another project`
          : read.state === 'cannot-read'
            ? `the token is accepted but cannot see the published Global Settings document (${read.detail}): give it the Viewer role on this project`
            : `Sanity could not be reached after three tries (${read.detail})`;
    }
    return {
      pass: false,
      lines: [
        `[sanity-read] FAILED for ${where}: ${reason}.`,
        '[sanity-read] Nothing was built. The previous deployment keeps serving.',
        ...visibilityLines(input),
      ],
    };
  }

  lines.push(`[sanity-read] ok: ${TOKEN} reads the dataset for ${where}.`);
  return { pass: true, lines: [...lines, ...visibilityLines(input)] };
}

function visibilityLines(input: ReadCheckInput): string[] {
  const out: string[] = [];
  if (input.anonymousCount === null) out.push('[sanity-read] dataset visibility: could not be checked.');
  else if (input.anonymousCount === 0) out.push('[sanity-read] dataset visibility: private (an anonymous query sees nothing).');
  else out.push(`[sanity-read] dataset visibility: PUBLIC (an anonymous query sees ${input.anonymousCount} documents). Set the dataset to Private once both hosts run with the token.`);

  if (input.customPathTypes) {
    const entries = Object.entries(input.customPathTypes).sort(([a], [b]) => a.localeCompare(b));
    const unexpected = entries.filter(([type]) => !EXPECTED_CUSTOM_PATH_TYPES.includes(type) && !type.startsWith('system.'));
    const expected = entries.filter(([type]) => !unexpected.some(([u]) => u === type));
    const fmt = (list: [string, number][]) => list.map(([t, n]) => `${t} ${n}`).join(', ');
    if (entries.length === 0) out.push('[sanity-read] documents in a custom ID path visible to the token: none.');
    else if (expected.length) {
      out.push(`[sanity-read] documents in a custom ID path visible to the token: ${fmt(expected)} (expected; no page queries these types).`);
    }
    if (unexpected.length) {
      out.push(
        `[sanity-read] WARNING: unexpected types in a custom ID path: ${fmt(unexpected)}. With the token these join every query of their type and may appear on the site. Check them in the Studio.`,
      );
    }
  }
  return out;
}
