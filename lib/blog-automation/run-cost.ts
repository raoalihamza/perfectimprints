/**
 * What one scheduled post cost, for the run log and the digest (AUTO-208).
 * Pure apart from the model names, read from lib/ai/gemini.ts (the one place
 * a Gemini model is named). An ESTIMATE, labelled as one in `basis`:
 *
 *   - DeepSeek: the wrapper (lib/ai/deepseek.ts) returns the parsed answer
 *     and not the usage, so the figure is the documented measurement, "about
 *     half a cent" a post (AUTO-201), and a tenth of that for the small
 *     title-shortening call.
 *   - The picture (AUTO-220): the dollars the image service's own token
 *     counts come to, already summed over the attempts by the chain
 *     (HeaderImageUsage.usd: OpenAI's reported tokens at its 2026-11-09
 *     prices, about USD 0.053 a picture with three photos), plus USD 0.006 an
 *     attempt for the reads around it (the photo screen, the title reads and
 *     the two inventories on the vision model). A run logged before AUTO-220
 *     carries no dollar figure and is priced as before, from Google's
 *     reported tokens at the 2026-10-15 prices times the attempts.
 *
 * At two posts a day this comes to about USD 0.065 a post and about USD 47
 * a year (the Gemini picture it replaced was USD 0.155 and about 113). The
 * daily image caps and the two slots a day are the ceilings; this module
 * only reports.
 */

import { GEMINI_IMAGE_MODEL, GEMINI_IMAGE_PRICES } from '../ai/gemini';

export const DEEPSEEK_USD_PER_POST = 0.005;
export const DEEPSEEK_USD_PER_SHORTEN = 0.0005;
/** The vision reads around one generated picture: the photo screen, the title reads and the inventories (AUTO-220; AUTO-207's planner, reads and close look were 0.004). */
export const IMAGE_CHECKS_USD = 0.006;

/** The image prices are lib/ai/gemini.ts's own table (pricing page dated 2026-10-15); an unknown model is priced as the main one. */
const DEFAULT_IMAGE_PRICE = GEMINI_IMAGE_PRICES[GEMINI_IMAGE_MODEL];

export interface ImageUsageForCost {
  model: string;
  imageTokens: number;
  promptTokens: number;
  attempts: number;
  /** AUTO-220: the picture's cost in dollars as the chain summed it over the attempts; absent on a run logged before it. */
  usd?: number | null;
}

export interface RunCostInput {
  deepseekCalls: number;
  /** The accepted picture's usage, when the AI made one; null for a library picture, a product photo or none. */
  image: ImageUsageForCost | null;
}

export interface RunCostEstimate {
  deepseekCalls: number;
  deepseekUsd: number;
  imageUsd: number;
  totalUsd: number;
  basis: string;
}

function round(usd: number): number {
  return Math.round(usd * 10000) / 10000;
}

export function estimateRunCost(input: RunCostInput): RunCostEstimate {
  const calls = Math.max(0, Math.floor(input.deepseekCalls));
  const deepseekUsd = calls === 0 ? 0 : DEEPSEEK_USD_PER_POST + Math.max(0, calls - 1) * DEEPSEEK_USD_PER_SHORTEN;
  let imageUsd = 0;
  if (input.image) {
    const attempts = Math.max(1, Math.floor(input.image.attempts));
    if (typeof input.image.usd === 'number' && Number.isFinite(input.image.usd) && input.image.usd > 0) {
      imageUsd = input.image.usd + IMAGE_CHECKS_USD * attempts;
    } else {
      const price = GEMINI_IMAGE_PRICES[input.image.model] ?? DEFAULT_IMAGE_PRICE;
      const one = (input.image.imageTokens * price.usdPerMillionImageTokens + input.image.promptTokens * price.usdPerMillionInputTokens) / 1e6 + IMAGE_CHECKS_USD;
      imageUsd = one * attempts;
    }
  }
  return {
    deepseekCalls: calls,
    deepseekUsd: round(deepseekUsd),
    imageUsd: round(imageUsd),
    totalUsd: round(deepseekUsd + imageUsd),
    basis: input.image
      ? `DeepSeek estimated at USD ${DEEPSEEK_USD_PER_POST} a post; the picture from the image service's reported tokens over ${Math.max(1, Math.floor(input.image.attempts))} attempt(s), plus USD ${IMAGE_CHECKS_USD} of reads an attempt`
      : `DeepSeek estimated at USD ${DEEPSEEK_USD_PER_POST} a post; no generated picture`,
  };
}

/** The product rows a body carries and the products across them. Pure over the stored body. */
export function stripStats(body: readonly unknown[] | undefined | null): { rows: number; products: number } {
  let rows = 0;
  let products = 0;
  for (const block of body ?? []) {
    const b = block as { _type?: string; products?: unknown[] } | null;
    if (!b || b._type !== 'blogProducts') continue;
    rows += 1;
    products += Array.isArray(b.products) ? b.products.length : 0;
  }
  return { rows, products };
}
