/**
 * The three fields beside the body that a generated draft used to leave empty
 * (AUTO-202): the author, the blog categories and the related category slugs.
 * PURE: the rules only; the server resolver (resolve-draft-fields.ts) reads
 * the settings and the dataset and applies them.
 *
 * RELATED CATEGORY SLUGS come from the topic's RANKING PAGE, never from the
 * title. AUTO-200 found the signal and AUTO-202 re-measured it on the live
 * pool (2026-10-05): 1,354 of 2,215 usable topics rank with a `/cat/` page,
 * every one of the 1,354 yields a value that passes FIX-900's rule, 1,346 of
 * them name one of the 465 generated roots, and a read of 50 sampled rows
 * found every root right for its search ("promotional footballs" ranking at
 * /cat/sports-balls/size/mini gives sports-balls; "contractor calendars" at
 * /cat/calendars/industry/contractor gives calendars). The eight that name a
 * non-generated root (a customCategory page, or a root the picker would not
 * offer) are dropped, because the Related Blogs row renders on generated root
 * pages only (FIX-900's own note). When the signal gives nothing, the field
 * stays EMPTY: a topic ranking with a video, a product page or the home page
 * says nothing about which category page should show the post, and guessing
 * from the title is exactly what the brief forbids.
 *
 * THE AUTHOR has an obvious default and gets it. Measured on the published
 * posts (2026-10-05): 653 of 661 carry an author; "Patrick Black"
 * (`author-patrick-black`) is on 287 of them and on 13 of the 13 AI-generated
 * posts that have one (the other three were published with none). Patrick
 * can point `globalSettings.blogAutomation.defaultAuthor` at anyone; until he
 * does, that document is the default, and only when it still exists.
 *
 * THE BLOG CATEGORIES have no honest rule, measured rather than assumed. A
 * title-word rule for the thirteen theme categories reproduces Patrick's own
 * assignments at 7% to 79% precision (halloween 79, beach 71, christmas 67,
 * school spirit 41, medical 31, technology 7), because he files most seasonal
 * and product posts under the catch-all "Promotional Product Ideas" (274 of
 * 587 categorised posts) and the rest by editorial judgement no word predicts.
 * So nothing is derived. What exists instead is a setting,
 * `blogAutomation.defaultCategories`, blank by default: every generated draft
 * gets exactly the categories Patrick put there, or none. The cost of blank
 * is one click per post in Studio; the cost of a wrong guess at two posts a
 * day is a category page full of posts that do not belong on it.
 */
import { relatedCategorySlugProblem } from '../blog/related-category-slugs';

/** The root slug of a `/cat/` ranking page (a full URL or a path), else null. */
export function rootSlugFromRankingPage(page: unknown): string | null {
  if (typeof page !== 'string') return null;
  let p = page.trim().toLowerCase();
  if (!p) return null;
  p = p.replace(/^https?:\/\/[^/?#]+/, '');
  const m = p.match(/^\/cat\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:[/?#]|$)/);
  return m ? m[1] : null;
}

export interface RankingPageInput {
  page?: string | null;
  spacingGroups?: readonly { page?: string | null }[];
}

/**
 * The `relatedCategorySlugs` a topic earns: the root of its ranking page,
 * then the roots of its merged spellings' pages (AUTO-119), each once, each
 * passing FIX-900's rule AND naming a known generated root. Usually one
 * value; empty when the topic ranks with nothing on `/cat/`.
 */
export function relatedCategorySlugsFor(topic: RankingPageInput, knownRoots: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const pages = [topic.page, ...(topic.spacingGroups ?? []).map((g) => g.page)];
  for (const page of pages) {
    const root = rootSlugFromRankingPage(page);
    if (!root || out.includes(root)) continue;
    if (relatedCategorySlugProblem(root) !== null) continue;
    if (!knownRoots.has(root)) continue;
    out.push(root);
  }
  return out;
}

/** The author every generated draft gets when Global Settings names none. See the header before changing it. */
export const DEFAULT_BLOG_AUTHOR_ID = 'author-patrick-black';

/** The author id to use: the setting when it names one, else the default. Existence is the resolver's to check. */
export function authorIdToUse(settingAuthorId: string | null | undefined): string {
  const id = settingAuthorId?.trim();
  return id ? id : DEFAULT_BLOG_AUTHOR_ID;
}

/** Trimmed, non-empty, each once, in order. */
export function uniqueIds(ids: readonly unknown[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of ids ?? []) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}
