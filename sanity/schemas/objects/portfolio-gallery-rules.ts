/**
 * Publish rules for the Portfolio Gallery block (FIX-861, 2026-09-04).
 *
 * THE RULE: a block the editor never touched is invisible to validation. A
 * block the editor STARTED must be completed or emptied.
 *
 * Why it is shaped this way, so nobody "simplifies" it back into the bug:
 * PORT-120 gave `mode`, `limit` and `hidden` an `initialValue`. The block is
 * not only an array member (blog body, page sections) but also a FIELD on
 * productPage, video and landingPage, and Sanity resolves initial values into
 * every object field when a document is created, so every new product page
 * and video was born holding `{mode: 'manual', limit: 8, hidden: false}`. The
 * "pick at least one item" rule then blocked Publish on a gallery nobody had
 * opened, and the Studio has no control that clears an object field, so the
 * only way out was to satisfy a block the editor never wanted. Patrick could
 * not publish videos or product pages.
 *
 * So the block carries NO initial value at all (an untouched field stays
 * absent, and an absent object runs no nested checks), and "started" is
 * decided by what an editor can only have set on purpose:
 *   - a non-blank heading;
 *   - the "From a category" mode;
 *   - at least one hand-picked item (which also completes the block).
 * `mode: 'manual'`, `limit` and `hidden` never count. An unset mode already
 * means hand picked to the resolver (lib/portfolio/gallery.ts), and a limit or
 * a hidden switch changes nothing until there is something to show. They are
 * also exactly what the pre-fix drafts hold, so those documents pass as
 * stored and no migration is needed. A category reference left behind after
 * switching back to "Hand picked" is ignored, as the resolver ignores it and
 * the Studio hides it; counting it would trap the editor behind an invisible
 * field.
 *
 * Every message names the way out, including emptying the block: Patrick
 * reads these under time pressure.
 *
 * Dependency-free on purpose (the raw-html.ts precedent), so the schema can
 * import it and vitest can test it. It is ONE object type wherever the block
 * is placed, so the rule cannot differ between a field host and a section.
 */

export interface PortfolioGalleryDraft {
  heading?: string | null;
  mode?: string | null;
  items?: unknown[] | null;
  category?: { _ref?: string | null } | null;
}

export const PORTFOLIO_GALLERY_ITEMS_MESSAGE =
  'This gallery has a heading but no photos. Pick at least one item, switch to "From a category", or clear the heading to leave the gallery out.';

export const PORTFOLIO_GALLERY_CATEGORY_MESSAGE =
  'Pick a category, or switch back to "Hand picked" with no items chosen to leave the gallery out.';

function asDraft(value: unknown): PortfolioGalleryDraft {
  return value && typeof value === 'object' ? (value as PortfolioGalleryDraft) : {};
}

/** True when the editor typed a heading (whitespace alone does not count). */
export function galleryHasHeading(value: unknown): boolean {
  const { heading } = asDraft(value);
  return typeof heading === 'string' && heading.trim().length > 0;
}

/** The number of hand-picked references, whatever they point at. */
export function galleryItemCount(value: unknown): number {
  const { items } = asDraft(value);
  return Array.isArray(items) ? items.length : 0;
}

/** True only for the explicit "From a category" choice; unset means hand picked. */
export function galleryIsCategoryMode(value: unknown): boolean {
  return asDraft(value).mode === 'category';
}

/** True when the category reference points somewhere. */
export function galleryHasCategory(value: unknown): boolean {
  const { category } = asDraft(value);
  return Boolean(category && typeof category === 'object' && category._ref);
}

/**
 * True when the editor has expressed an intent this block should honour. An
 * untouched block, a cleared block and the pre-fix default object are all
 * NOT started.
 */
export function galleryIsStarted(value: unknown): boolean {
  return galleryHasHeading(value) || galleryIsCategoryMode(value) || galleryItemCount(value) > 0;
}

/**
 * The `items` field rule. Receives the BLOCK (the field's parent). Owns the
 * hand-picked state only; category mode is the category rule's.
 */
export function portfolioGalleryItemsProblem(parent: unknown): string | true {
  if (galleryIsCategoryMode(parent)) return true;
  if (galleryItemCount(parent) > 0) return true;
  if (galleryHasHeading(parent)) return PORTFOLIO_GALLERY_ITEMS_MESSAGE;
  return true;
}

/** The `category` field rule. Receives the BLOCK. Fires only in category mode. */
export function portfolioGalleryCategoryProblem(parent: unknown): string | true {
  if (!galleryIsCategoryMode(parent)) return true;
  return galleryHasCategory(parent) ? true : PORTFOLIO_GALLERY_CATEGORY_MESSAGE;
}

/** Every message the block would show, in field order; empty means it publishes. */
export function portfolioGalleryProblems(value: unknown): string[] {
  return [portfolioGalleryItemsProblem(value), portfolioGalleryCategoryProblem(value)].filter(
    (result): result is string => typeof result === 'string',
  );
}
