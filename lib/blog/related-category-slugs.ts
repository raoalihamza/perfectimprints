/**
 * What `blogPost.relatedCategorySlugs` stores, and how a typed value is read
 * (FIX-900, 2026-10-04).
 *
 * The field is the list of ROOT category slugs a post appears under in the
 * "Related Blogs About ..." row. That row renders on root category pages only
 * (`app/cat/[...slug]/page.tsx`, the `isRoot` branch) and its query matches the
 * stored strings exactly: `$slug in relatedCategorySlugs` with `$slug` the
 * bare root slug (`lib/sanity/queries/related-blogs.ts`). So the ONLY value
 * that does anything is the bare slug, `ornaments`. AUTO-200 found 11
 * published posts storing paths instead, every one filled in by Patrick by
 * hand since July: `/cat/ornaments`, `/cat/ornaments/theme/christmas`,
 * `/cat/bags/theme/halloween`, `/cat/candy?price-min=10`. None of them could
 * ever match, Studio accepted them all, and nothing said so. That is the
 * FIX-881 class of fault (a free-text field that silently accepts a value
 * which does nothing).
 *
 * Three things read this module, so there is one definition of "what counts":
 *   - the schema (`sanity/schemas/documents/blog-post.ts`) runs
 *     `relatedCategorySlugProblem` on every item as an ERROR, so a path, an
 *     address or a facet slug cannot be published again, and the message
 *     names the slug to type instead;
 *   - the repair script (`scripts/migrations/repair-related-category-slugs.ts`)
 *     uses `planRelatedCategorySlugsRepair` to turn the stored paths into the
 *     roots they name, dry run by default;
 *   - the tests, which run the real stored values of the 11 posts through
 *     both.
 *
 * An ERROR rather than FIX-881's warning, on purpose: FIX-881 warned because
 * its key list is open (a brand-new catalog must be publishable before the
 * constant is updated). This rule is a closed SHAPE rule, like PORT-160's
 * `shopCategorySlugProblem`: a bare root slug never contains `/`, `?`, `:` or
 * a space, and nothing legitimate ever will, so there is no false positive to
 * protect against. A value that passes here can still name a root that does
 * not exist; the Studio input (the root-only category picker) is what stops
 * that, and this module deliberately does not load the 465-root list.
 *
 * Pure and dependency-free so the Studio bundle, the script and vitest all
 * import the same file (the raw-html.ts / catalog-key.ts precedent).
 */

/** A root slug: lowercase letters and digits joined by single dashes. */
export const ROOT_CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Longer than any real root slug (the longest of the 465 is under 50). */
export const RELATED_CATEGORY_SLUG_MAX_LENGTH = 120;

/** How much of a long stray value a message repeats back. */
const SHOWN_MAX = 60;

function shown(value: string): string {
  const v = value.trim();
  return v.length > SHOWN_MAX ? `${v.slice(0, SHOWN_MAX)}...` : v;
}

/** True when the value is already exactly what the query matches. (A plain boolean, not a type predicate: a predicate would narrow the string away in the message rules below.) */
export function isCleanRelatedCategorySlug(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length <= RELATED_CATEGORY_SLUG_MAX_LENGTH &&
    ROOT_CATEGORY_SLUG_PATTERN.test(value)
  );
}

/**
 * The root slug a typed value names, or null when none can be read from it.
 * Strips a scheme and host (`https://www.perfectimprints.com`), a bare
 * `perfectimprints.com` host, leading slashes, the `cat/` prefix, and
 * everything from the first `/`, `?` or `#` on, then lower-cases and trims.
 * It never invents: `Water Bottles` (a title, not a slug) is null, because
 * turning spaces into dashes would be a guess at a category that may not
 * exist. The root-only picker is the way to find the right slug.
 */
export function normalizeRelatedCategorySlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let v = value.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^https?:\/\/[^/?#]+/, '');
  v = v.replace(/^(?:[a-z0-9-]+\.)*perfectimprints\.com/, '');
  v = v.replace(/^\/+/, '');
  v = v.replace(/^cat\//, '');
  v = (v.split(/[/?#]/)[0] ?? '').trim();
  if (!v || v.length > RELATED_CATEGORY_SLUG_MAX_LENGTH) return null;
  return ROOT_CATEGORY_SLUG_PATTERN.test(v) ? v : null;
}

/**
 * The Studio message for one item of `relatedCategorySlugs`, or null when the
 * item is a bare root slug. Every message says what to type instead when
 * that can be read from the value, and says WHY the typed value fails (it
 * would never show the post anywhere), the thing FIX-881 found missing.
 */
export function relatedCategorySlugProblem(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'Must be a category slug, e.g. water-bottles.';
  const raw = value.trim();
  if (!raw) return 'Empty entry: remove it, or pick a category from the search.';
  if (isCleanRelatedCategorySlug(raw) && raw === value) return null;

  const root = normalizeRelatedCategorySlug(raw);
  const never = `"${shown(raw)}" would never show this post anywhere`;
  const instead = root ? `Type ${root} instead. ` : '';

  if (/^https?:\/\//i.test(raw) || /perfectimprints\.com/i.test(raw)) {
    return `${instead}Just the slug, not the whole address: ${never}. The Related Blogs row matches the bare root slug only, the part of the address after /cat/.`;
  }
  const body = raw.replace(/^\/+/, '').replace(/^cat\//i, '');
  const hasMoreSegments = /[/?#]/.test(body);
  if (hasMoreSegments) {
    return `${instead}${never}: the Related Blogs row lives on the root category page only (/cat/${root ?? 'the root slug'}) and matches the bare root slug, not a facet, a filter or a path.`;
  }
  if (/^\/|^cat\//i.test(raw)) {
    return `${instead}Without /cat/: ${never}, because the row matches the bare slug only.`;
  }
  if (isCleanRelatedCategorySlug(raw)) {
    return `Remove the space before or after "${raw}": with it, the value would never show this post anywhere.`;
  }
  if (raw.length > RELATED_CATEGORY_SLUG_MAX_LENGTH) {
    return `Too long to be a category slug: ${never}. Pick the category from the search above.`;
  }
  return `Lowercase letters, numbers and dashes only, with no spaces, e.g. water-bottles: ${never}. Pick the category from the search above, which writes the slug for you.`;
}

export interface RelatedCategorySlugsRepairPlan {
  /** The list to store: every value as its root slug, in order, each once. */
  next: string[];
  /** True when `next` differs from what is stored. */
  changed: boolean;
  /** Stored values that could not be read as a root slug (nothing is written for a document that has one). */
  unresolved: string[];
  /** Roots read from the values that are not in `knownRoots` (same rule: nothing is written). */
  unknownRoots: string[];
  /** Human-readable `stored -> root` lines, for the dry run. */
  mapping: { from: string; to: string | null }[];
}

/**
 * The repair for one document's stored list. Pure: the script prints it in
 * the dry run and applies `next` on `--commit`. A document whose list holds
 * a value that cannot be read, or that names a root not in `knownRoots`
 * (when given), is NOT repaired at all, so a half-understood list is never
 * rewritten; the script reports it for a person to decide. Duplicates after
 * normalising (`/cat/ornaments` beside `ornaments`) collapse to one, first
 * position kept. A list that is already clean is `changed: false`.
 */
export function planRelatedCategorySlugsRepair(
  stored: unknown,
  knownRoots?: ReadonlySet<string>,
): RelatedCategorySlugsRepairPlan {
  const values = Array.isArray(stored) ? stored : [];
  const next: string[] = [];
  const unresolved: string[] = [];
  const unknownRoots: string[] = [];
  const mapping: { from: string; to: string | null }[] = [];
  for (const raw of values) {
    const from = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const root = normalizeRelatedCategorySlug(raw);
    mapping.push({ from, to: root });
    if (!root) {
      unresolved.push(from);
      continue;
    }
    if (knownRoots && !knownRoots.has(root)) unknownRoots.push(root);
    if (!next.includes(root)) next.push(root);
  }
  const changed = values.length !== next.length || values.some((v, i) => v !== next[i]);
  return { next, changed, unresolved, unknownRoots, mapping };
}
