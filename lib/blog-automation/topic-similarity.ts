/**
 * The Blog Topics tab's "closest wording" figures (AUTO-119). PURE: no fetch,
 * no Sanity, no fs, so the route, the measuring script and the panel share one
 * definition and vitest covers it.
 *
 * ADVISORY ONLY, and that is the design, not a limitation to be tuned away.
 * AUTO-118 measured whether embedding similarity could tell "the same thing
 * said twice" from "a genuinely different angle" on this pool, and it cannot:
 * same-thing pairs scored 0.790 to 0.977, different-thing pairs 0.569 to 0.859,
 * with no gap between them. Every error had one shape, one product with a
 * different modifier (engraved against printed-lens sunglasses 0.859 in
 * AUTO-118's phrasing; re-measured 2026-09-28, "custom engraved sunglasses"
 * scores 90 against "custom printed sunglasses", a different post), so a
 * merge at 0.85 would have folded the two highest-impression sunglasses
 * angles into the generic topic, exactly the posts worth writing. So nothing
 * here decides anything: these figures are shown beside a topic and Patrick
 * judges them. No function in this module takes or returns a topic state, and
 * the pool route never calls it (the figures come from a separate action).
 *
 * What is shown, per topic: the SIMILARITY_NEIGHBOURS other topics whose
 * wording is closest, and the one published post whose title is closest, each
 * with a score 0 to 100 (the cosine similarity of the two embeddings, times
 * 100, rounded). No floor, no colour, no label such as "duplicate": the
 * closest topic is listed whether it scores 95 or 55, because a floor is a
 * threshold and a threshold is the decision AUTO-118 showed cannot be made.
 */

/** Other topics listed per topic. */
export const SIMILARITY_NEIGHBOURS = 3;

/** One topic's figures as the panel shows them. */
export interface TopicSimilarity {
  /** The closest other topics, closest first. */
  topics: { key: string; query: string; score: number }[];
  /** The closest published post by title, or null when there are no posts. */
  post: { title: string; href: string; score: number } | null;
}

/** What the route's `similar` action answers when the figures exist. */
export interface TopicSimilarityResult {
  /** The pool snapshot these figures were computed for; the panel ignores figures for another one. */
  generatedAt: string;
  model: string;
  dimensions: number;
  /** Texts embedded (topics + posts), calls made, tokens read and what that cost. */
  texts: number;
  calls: number;
  promptTokens: number;
  costUsd: number;
  /** Wall-clock of the embedding + scoring, when it was computed (a cache hit reports the original). */
  buildMs: number;
  byKey: Record<string, TopicSimilarity>;
}

/**
 * The compact form stored in the data cache: indices into the snapshot's own
 * topic list and into the post list, so the entry is about 150 KB rather than
 * the 12 MB the raw vectors would be (AUTO-118). Only results are stored.
 */
export interface CompactTopicSimilarity extends Omit<TopicSimilarityResult, 'byKey'> {
  topicKeys: string[];
  topicQueries: string[];
  posts: { title: string; href: string }[];
  /** Per topic, in snapshot order: [neighbourIndex, score, ...] then [postIndex, score] (or -1, 0). */
  rows: number[][];
}

/** A cosine similarity as the 0 to 100 figure the panel shows. */
export function displayScore(cosine: number): number {
  if (!Number.isFinite(cosine)) return 0;
  return Math.max(0, Math.min(100, Math.round(cosine * 100)));
}

/** Unit-length copy of a vector (768-dimension output is not normalised by Google). */
export function normalizeVector(v: readonly number[]): Float32Array {
  let sum = 0;
  for (const x of v) sum += x * x;
  const len = Math.sqrt(sum) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / len;
  return out;
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Cosine similarity of two raw vectors. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  return dot(normalizeVector(a), normalizeVector(b));
}

/**
 * For every topic vector: the `k` closest OTHER topics and the closest post.
 * Vectors are normalised here, so raw embeddings can be passed. Ties keep the
 * lower index (the snapshot is sorted by impressions, so the bigger topic).
 */
export function computeNeighbourRows(
  topicVectors: readonly (readonly number[])[],
  postVectors: readonly (readonly number[])[],
  k: number = SIMILARITY_NEIGHBOURS,
): number[][] {
  const t = topicVectors.map(normalizeVector);
  const p = postVectors.map(normalizeVector);
  const n = t.length;
  // Full symmetric matrix computed once per pair.
  const sims = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = dot(t[i], t[j]);
      sims[i * n + j] = s;
      sims[j * n + i] = s;
    }
  }
  const round = (x: number) => Math.round(x * 1000) / 1000;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const best: { j: number; s: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const s = sims[i * n + j];
      if (best.length < k || s > best[best.length - 1].s) {
        best.push({ j, s });
        best.sort((a, b) => b.s - a.s || a.j - b.j);
        if (best.length > k) best.pop();
      }
    }
    let postIndex = -1;
    let postScore = -Infinity;
    for (let q = 0; q < p.length; q++) {
      const s = dot(t[i], p[q]);
      if (s > postScore) {
        postScore = s;
        postIndex = q;
      }
    }
    const row: number[] = [];
    for (const b of best) row.push(b.j, round(b.s));
    row.push(postIndex, postIndex === -1 ? 0 : round(postScore));
    rows.push(row);
  }
  return rows;
}

/** The compact cache entry as the per-topic map the panel reads. */
export function expandSimilarity(compact: CompactTopicSimilarity): TopicSimilarityResult {
  const byKey: Record<string, TopicSimilarity> = {};
  compact.rows.forEach((row, i) => {
    const key = compact.topicKeys[i];
    if (key === undefined) return;
    const topics: TopicSimilarity['topics'] = [];
    for (let c = 0; c + 1 < row.length - 2; c += 2) {
      const j = row[c];
      const nk = compact.topicKeys[j];
      if (nk === undefined) continue;
      topics.push({ key: nk, query: compact.topicQueries[j], score: displayScore(row[c + 1]) });
    }
    const postIndex = row[row.length - 2];
    const post = compact.posts[postIndex];
    byKey[key] = {
      topics,
      post: post ? { title: post.title, href: post.href, score: displayScore(row[row.length - 1]) } : null,
    };
  });
  const { topicKeys: _k, topicQueries: _q, posts: _p, rows: _r, ...rest } = compact;
  return { ...rest, byKey };
}

/** What a list of embedded texts costs, in USD, at the given price per million tokens. */
export function embeddingCostUsd(promptTokens: number, usdPerMillion: number): number {
  return Math.round((promptTokens / 1_000_000) * usdPerMillion * 1_000_000) / 1_000_000;
}
