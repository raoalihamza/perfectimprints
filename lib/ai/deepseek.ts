/**
 * Shared server-side DeepSeek generation service (P2-AI-001). Every Phase 2 AI
 * feature (blogs, videos, pages, landing pages) calls this instead of
 * re-implementing the fetch. Mirrors the endpoint/model/json_object settings of
 * the existing category route (app/api/sanity/generate-content).
 *
 * (Replaces the never-implemented M5-505 stub that previously lived here — the
 * category feature was built inline in its route and can adopt this later.)
 *
 * Server-side ONLY (it reads DEEPSEEK_API_KEY). No node:fs, no Sanity — but do
 * not import it into Studio bundle code; callers are API routes and scripts.
 */

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';

/**
 * Typed failure so callers can turn any generation problem into a clean
 * 500/502 with a "generation failed, try again or fill manually" message —
 * never crash a page or a publish. `status` is the suggested HTTP status.
 */
export class DeepSeekError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'DeepSeekError';
    this.status = status;
  }
}

export interface GenerateJsonOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * One structured-JSON generation call. Throws `DeepSeekError` when the key is
 * missing, the HTTP call fails, the body is empty, or the content is not valid
 * JSON. The caller validates the SHAPE of `T` itself (this only guarantees
 * parseable JSON).
 */
export async function generateJson<T>(opts: GenerateJsonOptions): Promise<T> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new DeepSeekError('DEEPSEEK_API_KEY not configured.', 500);
  }

  let res: Response;
  try {
    res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: opts.temperature ?? 0.65,
        max_tokens: opts.maxTokens ?? 3000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      }),
    });
  } catch (err) {
    throw new DeepSeekError(
      `DeepSeek request failed: ${err instanceof Error ? err.message : 'network error'}.`,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new DeepSeekError(
      `DeepSeek request failed (${res.status}). ${detail.slice(0, 200)}`.trim(),
    );
  }

  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new DeepSeekError('Empty response from DeepSeek.');
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new DeepSeekError('DeepSeek returned non-JSON content.');
  }
}
