/**
 * Compute the Blog Topics tab's advisory "closest wording" figures (AUTO-119).
 * SERVER ONLY (reads GOOGLE_GEMINI_API_KEY through lib/ai/gemini.ts). Imports
 * nothing from next/*, so the measuring script runs the identical build under
 * tsx; the cache around it is in cached-topic-pool.ts.
 *
 * One pass: embed every topic's search and every published post's title
 * (about 3,100 short texts, 31 batch calls sent one at a time, about 80 s),
 * score every pair, and keep only
 * the RESULT (indices and rounded scores). The raw vectors are about 12 MB
 * (AUTO-118) against the data cache's 2 MB ceiling, and are never stored.
 *
 * It decides nothing. It reads the snapshot's topic list and returns figures
 * about it; it never sees, sets or changes a topic's state.
 */

import {
  GEMINI_EMBEDDING_DIMENSIONS,
  GEMINI_EMBEDDING_MODEL,
  GEMINI_EMBEDDING_USD_PER_MILLION_TOKENS,
  embedTexts,
} from '../ai/gemini';
import { computeNeighbourRows, embeddingCostUsd, type CompactTopicSimilarity } from './topic-similarity';

/**
 * The whole embedding must finish inside this, or the figures are simply not
 * shown. Measured 2026-09-28, one batch at a time (the project quota allows no
 * more, see GEMINI_EMBEDDING_REQUESTS_PER_MINUTE): about 65 s for 2,421 topics
 * plus about 18 s for 659 post titles. The route's maxDuration leaves room.
 */
export const SIMILARITY_DEADLINE_MS = 150_000;

export interface SimilarityInput {
  generatedAt: string;
  topics: readonly { key: string; query: string }[];
  posts: readonly { title: string; href: string }[];
}

export async function buildTopicSimilarity(input: SimilarityInput): Promise<CompactTopicSimilarity> {
  const started = Date.now();
  const posts = input.posts.filter((p) => p.title.trim());
  const texts = [...input.topics.map((t) => t.query), ...posts.map((p) => p.title)];
  const embedded = await embedTexts(texts, { signal: AbortSignal.timeout(SIMILARITY_DEADLINE_MS) });
  const topicVectors = embedded.vectors.slice(0, input.topics.length);
  const postVectors = embedded.vectors.slice(input.topics.length);
  const rows = computeNeighbourRows(topicVectors, postVectors);
  return {
    generatedAt: input.generatedAt,
    model: GEMINI_EMBEDDING_MODEL,
    dimensions: GEMINI_EMBEDDING_DIMENSIONS,
    texts: texts.length,
    calls: embedded.calls,
    promptTokens: embedded.promptTokens,
    costUsd: embeddingCostUsd(embedded.promptTokens, GEMINI_EMBEDDING_USD_PER_MILLION_TOKENS),
    buildMs: Date.now() - started,
    topicKeys: input.topics.map((t) => t.key),
    topicQueries: input.topics.map((t) => t.query),
    posts: posts.map((p) => ({ title: p.title, href: p.href })),
    rows,
  };
}
