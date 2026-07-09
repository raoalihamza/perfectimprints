/**
 * Internal-linking engine (P2-AI-001, extended P2-AI-005). Suggests links to
 * EXISTING blog posts, `page` docs, videos, landing pages, and baked category
 * pages relevant to a topic/keyword list — the AI never invents these; every
 * href comes from real data:
 *   - blogs:      published blogPost title+slug    (Sanity, tag RELATED_BLOGS_TAG)
 *   - pages:      published `page` title+slug      (Sanity, tag PAGES_TAG)
 *   - videos:     published `video` title+slug     (Sanity, tag VIDEOS_TAG)
 *   - landing:    published `landingPage` title+slug (Sanity, tag LANDING_TAG)
 *   - categories: generated root category JSONs on disk (lib/categories)
 *
 * Suggestions are surfaced for editor confirmation (aiSuggestedLinks on the
 * blog draft) — nothing is auto-inserted into content by default.
 *
 * SERVER-ONLY (disk reads + Sanity). Runs exclusively inside the force-dynamic
 * generate routes, so it adds no render surface — the Sanity reads reuse the
 * EXISTING cache tags (no new tag, nothing new for the webhook to bust) and
 * never affect any page's staticness. Never import from Studio bundle code.
 *
 * Relative imports (not `@/`) so the offline verifier script can exercise the
 * disk-only category portion under tsx. The Sanity portions have their own
 * GROQ here (rather than importing lib/sanity/queries/blogs|pages) to keep this
 * module free of `server-only` markers for that same tsx execution path; each
 * read is guarded so an offline/failed fetch degrades to fewer suggestions.
 */

import { cachedClient } from '../sanity/client';
import { LANDING_TAG, PAGES_TAG, RELATED_BLOGS_TAG, VIDEOS_TAG } from '../sanity/cache-tags';
import { getAllGeneratedRootSlugs, getCategoryContent } from '../categories';

export type InternalLinkKind = 'blog' | 'page' | 'category' | 'video' | 'landing';

export interface InternalLinkSuggestion {
  label: string;
  href: string;
  kind: InternalLinkKind;
  reason: string;
  /**
   * Sanity document _id — set for the Sanity-backed kinds (blog/page/video/
   * landing) only; disk-backed category suggestions have none. Lets consumers
   * (e.g. the generate-product route's related-video/blog pre-fill) patch real
   * references instead of re-querying by slug.
   */
  docId?: string;
}

export interface SuggestInternalLinksOptions {
  keywords: string[];
  /** Boosts the matching /cat/<slug> page so the post links to its own topic category. */
  categorySlug?: string;
  /** Blog slug to exclude (the post being generated, when it already has one). */
  excludeSlug?: string;
  limit: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function keywordTokenSet(keywords: string[]): Set<string> {
  const set = new Set<string>();
  for (const kw of keywords) for (const t of tokenize(kw)) set.add(t);
  return set;
}

function overlapScore(text: string, tokens: Set<string>): { score: number; matched: string[] } {
  const textTokens = new Set(tokenize(text));
  const matched: string[] = [];
  for (const t of tokens) {
    if (
      textTokens.has(t) ||
      (t.endsWith('s') && textTokens.has(t.slice(0, -1))) ||
      textTokens.has(`${t}s`)
    ) {
      matched.push(t);
    }
  }
  return { score: matched.length, matched };
}

export interface ScoredLinkSuggestion extends InternalLinkSuggestion {
  score: number;
}

type Scored = ScoredLinkSuggestion;

function reasonFor(kind: InternalLinkKind, matched: string[]): string {
  const kw = matched.slice(0, 3).join(', ');
  switch (kind) {
    case 'blog':
      return `Existing blog post sharing the keywords: ${kw}`;
    case 'page':
      return `Site page matching the keywords: ${kw}`;
    case 'category':
      return `Category page matching the keywords: ${kw}`;
    case 'video':
      return `Site video matching the keywords: ${kw}`;
    case 'landing':
      return `Existing landing page matching the keywords: ${kw}`;
  }
}

/**
 * Disk-only category-link portion — exported separately so the offline
 * verifier can assert real /cat/<slug> targets without Sanity or network.
 * Scores the 465 generated ROOT categories by slug-token overlap and labels
 * each suggestion with the page's real H1.
 */
export function suggestCategoryLinks(
  keywords: string[],
  limit: number,
  boostSlug?: string,
): Scored[] {
  const tokens = keywordTokenSet(keywords);
  // A facet/modifier boost slug (e.g. water-bottles/color/blue) boosts its root.
  const boostRoot = boostSlug?.split('/')[0];
  const scored: Scored[] = [];
  for (const slug of getAllGeneratedRootSlugs()) {
    const { score, matched } = overlapScore(slug.split('-').join(' '), tokens);
    const boosted = boostRoot === slug ? score + 10 : score;
    if (boosted <= 0) continue;
    scored.push({
      label: slug, // resolved to the real H1 below, only for the kept top slice
      href: `/cat/${slug}`,
      kind: 'category',
      reason: reasonFor('category', matched.length ? matched : [slug]),
      score: boosted,
    });
  }
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.href < b.href ? -1 : 1));
  const top = scored.slice(0, limit);
  for (const s of top) {
    const content = getCategoryContent(s.href.replace(/^\/cat\//, ''));
    if (content?.h1) s.label = content.h1;
  }
  return top;
}

/**
 * One Sanity-backed link source. All four (blogs, pages, videos, landing
 * pages) score published title+slug docs the same way — only the GROQ type,
 * cache tag, and href prefix differ. Each read reuses its surface's EXISTING
 * cache tag (nothing new for the webhook to bust) and degrades to [] offline.
 */
interface SanityLinkSource {
  kind: InternalLinkKind;
  docType: string;
  tag: string;
  /** Prefix the slug is appended to, e.g. '/blog/' or '/'. */
  hrefPrefix: string;
}

const SANITY_LINK_SOURCES: Record<'blog' | 'page' | 'video' | 'landing', SanityLinkSource> = {
  blog: { kind: 'blog', docType: 'blogPost', tag: RELATED_BLOGS_TAG, hrefPrefix: '/blog/' },
  page: { kind: 'page', docType: 'page', tag: PAGES_TAG, hrefPrefix: '/' },
  video: { kind: 'video', docType: 'video', tag: VIDEOS_TAG, hrefPrefix: '/videos/' },
  landing: { kind: 'landing', docType: 'landingPage', tag: LANDING_TAG, hrefPrefix: '/' },
};

async function suggestSanityDocLinks(
  source: SanityLinkSource,
  keywords: string[],
  limit: number,
  excludeSlug?: string,
): Promise<Scored[]> {
  const tokens = keywordTokenSet(keywords);
  let docs: { _id?: string; title?: string; slug?: string }[] = [];
  try {
    docs =
      (await cachedClient.fetch<{ _id?: string; title?: string; slug?: string }[]>(
        `*[_type == "${source.docType}" && !(_id in path("drafts.**")) && defined(title) && defined(slug.current)]{ _id, title, "slug": slug.current }`,
        {},
        { next: { tags: [source.tag], revalidate: false } },
      )) ?? [];
  } catch {
    return [];
  }
  const scored: Scored[] = [];
  for (const d of docs) {
    if (!d.title || !d.slug || d.slug === excludeSlug) continue;
    const { score, matched } = overlapScore(d.title, tokens);
    if (score <= 0) continue;
    scored.push({
      label: d.title,
      href: `${source.hrefPrefix}${d.slug}`,
      kind: source.kind,
      reason: reasonFor(source.kind, matched),
      ...(d._id ? { docId: d._id } : {}),
      score,
    });
  }
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.href < b.href ? -1 : 1));
  return scored.slice(0, limit);
}

/**
 * Kind-scoped suggestions for ONE Sanity-backed source (P2-CP follow-up) —
 * used by the /products/<slug> "Related Videos" / "Related Blogs" strips
 * (render-time auto matching) and the generate-product route's strip pre-fill.
 * Same scoring/tagged read as the mixed suggestInternalLinks; returns [] on a
 * zero-match or a failed read (the strip then simply doesn't render).
 */
export async function suggestLinksForKind(
  kind: 'blog' | 'page' | 'video' | 'landing',
  keywords: string[],
  limit: number,
  excludeSlug?: string,
): Promise<InternalLinkSuggestion[]> {
  const scored = await suggestSanityDocLinks(SANITY_LINK_SOURCES[kind], keywords, limit, excludeSlug);
  return scored.map(({ score: _score, ...suggestion }) => suggestion);
}

/**
 * Pure interleave of per-kind, score-sorted suggestion lists (exported so the
 * offline verifier can exercise the mixing with seeded landing/video lists):
 * each round takes the best-scoring remaining head, then rotates that list to
 * the back so close scores spread across kinds. Deduped by href (a `page` and
 * a `landingPage` could theoretically share `/<slug>`), capped at `limit`.
 */
export function interleaveScoredSuggestions(
  inputLists: ScoredLinkSuggestion[][],
  limit: number,
): InternalLinkSuggestion[] {
  const lists = inputLists.filter((l) => l.length > 0).map((l) => [...l]);
  const out: InternalLinkSuggestion[] = [];
  const seenHrefs = new Set<string>();
  const cursors = lists.map(() => 0);
  while (out.length < limit) {
    // Pick the list whose current head has the best score (tie-break by list
    // order: categories → blogs → pages → videos → landing).
    let best = -1;
    for (let i = 0; i < lists.length; i++) {
      // Skip already-emitted hrefs so a duplicate never consumes a slot.
      while (cursors[i] < lists[i].length && seenHrefs.has(lists[i][cursors[i]].href)) {
        cursors[i] += 1;
      }
      if (cursors[i] >= lists[i].length) continue;
      if (best === -1 || lists[i][cursors[i]].score > lists[best][cursors[best]].score) best = i;
    }
    if (best === -1) break;
    const { score: _score, ...suggestion } = lists[best][cursors[best]];
    out.push(suggestion);
    seenHrefs.add(suggestion.href);
    cursors[best] += 1;
    // Rotate the just-picked list to the back so close scores spread across kinds.
    lists.push(lists.splice(best, 1)[0]);
    cursors.push(cursors.splice(best, 1)[0]);
  }
  return out;
}

/**
 * Top `limit` suggestions across categories + blogs + pages + videos + landing
 * pages, mixed with a preference for spread across kinds when scores are close
 * (see interleaveScoredSuggestions). `excludeSlug` filters the blog source only
 * (the blog being generated); the OTHER generate routes self-filter on the
 * returned hrefs instead — page/landing drop `/<currentSlug>`, video drops
 * `/videos/<currentSlug>` — so no generated doc ever auto-links to itself.
 */
export async function suggestInternalLinks(
  opts: SuggestInternalLinksOptions,
): Promise<InternalLinkSuggestion[]> {
  const perKind = Math.max(2, opts.limit);
  const [blogs, pages, videos, landings, categories] = await Promise.all([
    suggestSanityDocLinks(SANITY_LINK_SOURCES.blog, opts.keywords, perKind, opts.excludeSlug),
    suggestSanityDocLinks(SANITY_LINK_SOURCES.page, opts.keywords, perKind),
    suggestSanityDocLinks(SANITY_LINK_SOURCES.video, opts.keywords, perKind),
    suggestSanityDocLinks(SANITY_LINK_SOURCES.landing, opts.keywords, perKind),
    Promise.resolve(suggestCategoryLinks(opts.keywords, perKind, opts.categorySlug)),
  ]);

  return interleaveScoredSuggestions([categories, blogs, pages, videos, landings], opts.limit);
}
