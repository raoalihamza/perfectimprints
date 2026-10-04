/**
 * What the two blog AI buttons write, field by field (AUTO-116). PURE: no
 * React, no Sanity, so vitest covers every rule and the two actions in
 * generate-blog-with-ai.tsx only fetch, confirm and patch.
 *
 * AUTO-115 found the single "Generate Blog with AI" button patching title,
 * meta title, meta description, excerpt, body and suggested links
 * UNCONDITIONALLY, so a second press destroyed every paragraph, image,
 * product row and link Patrick had placed, and the new title landed beside
 * the old slug. There are now two buttons, because he has two intentions:
 *
 *   FILL ("Generate Blog with AI"): writes only fields that are EMPTY. It
 *   never writes the title (the title is what the AI is told to write about,
 *   and the button cannot be pressed without one), so the slug it fills,
 *   when the slug is empty, is made from the title that stays. When nothing
 *   the AI writes is empty, nothing is sent to the AI.
 *
 *   REGENERATE ("Regenerate Blog with AI"): asks first, naming every field it
 *   will replace, then replaces them. The title and slug move TOGETHER or not
 *   at all: both are replaced only when the post has never been published
 *   (no live address to break; CLAUDE.md Section 4, URL preservation) and the
 *   slug is empty or is still exactly the title's own slug (Patrick did not
 *   choose it by hand). Otherwise both are kept.
 *
 * The typing-during-generation window. Both buttons decide AGAIN when the AI
 * answers, against the document as it is at that moment: FILL writes a field
 * only if it is still empty, REGENERATE replaces a field only if it is
 * unchanged since the click. A field Patrick edited while the AI was writing
 * is kept and reported. The comparison is per FIELD: an edit to one
 * paragraph keeps the whole body, it does not merge.
 *
 * Suggested links describe the links placed in the generated body, so they
 * are written only when the body is.
 *
 * THE HEADER IMAGE (AUTO-202) follows the same two rules and is decided here
 * too, as `plan.image`: FILL makes a picture only when the post has NO header
 * image of either shape (an uploaded or generated asset, or the hot-linked
 * product photo), so an image Patrick uploaded is never replaced by Generate
 * Blog with AI; REGENERATE replaces it, and its confirmation names "Header
 * image" among the fields it will replace. The picture comes from a second
 * request (the generate-blog-image route) after the body is patched, so the
 * plan carries the INTENTION and the action re-checks the document when the
 * picture arrives: an image changed during the wait is Patrick's and is kept.
 */
import { isBlank } from '../components/blank-fields';
import { hasHeaderImage, headerImageSignature, type BlogImageDoc } from './blog-image-request';

export const BLOG_CONTENT_FIELDS = ['metaTitle', 'metaDescription', 'excerpt', 'body'] as const;
export type BlogContentField = (typeof BLOG_CONTENT_FIELDS)[number];
export type BlogField = 'title' | 'slug' | BlogContentField | 'headerImage';

export const BLOG_FIELD_LABELS: Record<BlogField, string> = {
  title: 'Title',
  slug: 'Slug (web address)',
  metaTitle: 'Meta title',
  metaDescription: 'Meta description',
  excerpt: 'Excerpt',
  body: 'Body (every paragraph, heading, image, product row and link in it)',
  headerImage: 'Header image',
};

/** The fields of a blogPost these buttons read. */
export interface BlogDocFields extends BlogImageDoc {
  title?: unknown;
  slug?: { current?: unknown } | null;
  metaTitle?: unknown;
  metaDescription?: unknown;
  excerpt?: unknown;
  body?: unknown;
}

/** What the button will do about the header image (AUTO-202). */
export type ImagePlan = 'fill' | 'replace' | 'keep';

export { hasHeaderImage, headerImageSignature };

/** What /api/sanity/generate-blog returns (the fields used here). */
export interface GeneratedBlog {
  title?: unknown;
  metaTitle?: unknown;
  metaDescription?: unknown;
  excerpt?: unknown;
  body?: unknown;
}

export type KeepReason =
  /** FILL only: the field already had a value when the button was pressed. */
  | 'not-empty'
  /** The field changed while the AI was writing; Patrick's version is kept. */
  | 'edited-during-generation'
  /** The post is published: its address must not change, so neither does its title. */
  | 'live'
  /** The slug was chosen by hand (it is not the title's own slug). */
  | 'hand-set-slug'
  /** FILL never writes the title; it is what the AI was told to write about. */
  | 'title-is-input'
  /** The AI returned nothing for this field, so the current value stays. */
  | 'ai-left-blank';

export interface KeptField {
  field: BlogField;
  why: KeepReason;
}

export interface BlogPatchPlan {
  /** The `set` to patch into the draft; empty means send no patch. */
  set: Record<string, unknown>;
  /** Fields that had a value and were replaced. */
  replaced: BlogField[];
  /** Fields that were empty and were filled. */
  filled: BlogField[];
  kept: KeptField[];
  /** AUTO-202: the header image intention; 'keep' is also recorded in `kept` with its reason. */
  image: ImagePlan;
}

/**
 * The slug maker both buttons use (unchanged from AUTO-110). AUTO-201 moved
 * the function itself to lib/blog/slugify-title.ts, where the server-side
 * draft creator reads it too; it is re-exported here so every caller is
 * unchanged. (A pure module: safe in the Studio bundle.)
 */
import { slugifyTitle } from '../../lib/blog/slugify-title';
export { slugifyTitle };

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function slugOf(doc: BlogDocFields | null | undefined): string {
  return str(doc?.slug?.current);
}

function slugValue(title: string): { _type: 'slug'; current: string } | null {
  const current = slugifyTitle(title);
  return current ? { _type: 'slug', current } : null;
}

/** Same value, treating every kind of blank as the same blank. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (isBlank(a) && isBlank(b)) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** The content fields (not title, not slug) that are empty. FILL calls the writing AI only when this is non-empty. */
export function emptyContentFields(doc: BlogDocFields | null | undefined): BlogContentField[] {
  return BLOG_CONTENT_FIELDS.filter((f) => isBlank(doc?.[f]));
}

/** True when FILL has a picture to make: the post has no header image of either shape (AUTO-202). */
export function needsHeaderImage(doc: BlogDocFields | null | undefined): boolean {
  return !hasHeaderImage(doc);
}

export type TitleSlugPlan = { mode: 'replace' } | { mode: 'keep'; why: 'live' | 'hand-set-slug' };

/** Whether REGENERATE may replace the title (and with it the slug). */
export function titleSlugPlan(doc: BlogDocFields | null | undefined, isPublished: boolean): TitleSlugPlan {
  if (isPublished) return { mode: 'keep', why: 'live' };
  const slug = slugOf(doc);
  if (slug && slug !== slugifyTitle(str(doc?.title))) return { mode: 'keep', why: 'hand-set-slug' };
  return { mode: 'replace' };
}

export interface RegeneratePreview {
  replace: BlogField[];
  fill: BlogField[];
  keep: KeptField[];
}

/** What REGENERATE will do, for the confirmation it shows BEFORE anything is sent to the AI. */
export function previewRegenerate(doc: BlogDocFields | null | undefined, isPublished: boolean): RegeneratePreview {
  const out: RegeneratePreview = { replace: [], fill: [], keep: [] };
  const ts = titleSlugPlan(doc, isPublished);
  if (ts.mode === 'replace') {
    out.replace.push('title');
    (isBlank(slugOf(doc)) ? out.fill : out.replace).push('slug');
  } else {
    out.keep.push({ field: 'title', why: ts.why }, { field: 'slug', why: ts.why });
  }
  for (const f of BLOG_CONTENT_FIELDS) (isBlank(doc?.[f]) ? out.fill : out.replace).push(f);
  // AUTO-202: the confirmation names the header image among what it replaces.
  (hasHeaderImage(doc) ? out.replace : out.fill).push('headerImage');
  return out;
}

/**
 * FILL. `atClick` is the document when the button was pressed, `now` the
 * document when the AI answered (null `generated` means the AI was not
 * called because nothing it writes was empty).
 */
export function planFill(
  atClick: BlogDocFields | null | undefined,
  now: BlogDocFields | null | undefined,
  generated: GeneratedBlog | null,
): BlogPatchPlan {
  const plan: BlogPatchPlan = { set: {}, replaced: [], filled: [], kept: [], image: 'keep' };
  if (!isBlank(now?.title)) plan.kept.push({ field: 'title', why: 'title-is-input' });

  for (const f of BLOG_CONTENT_FIELDS) {
    if (!isBlank(now?.[f])) {
      plan.kept.push({ field: f, why: isBlank(atClick?.[f]) ? 'edited-during-generation' : 'not-empty' });
      continue;
    }
    if (!generated) continue;
    if (isBlank(generated[f])) {
      plan.kept.push({ field: f, why: 'ai-left-blank' });
      continue;
    }
    plan.set[f] = typeof generated[f] === 'string' ? (generated[f] as string).trim() : generated[f];
    plan.filled.push(f);
  }

  // The slug is made from the title that STAYS, so the two always agree.
  if (isBlank(slugOf(now))) {
    const slug = slugValue(str(now?.title));
    if (slug) {
      plan.set.slug = slug;
      plan.filled.push('slug');
    }
  } else {
    plan.kept.push({ field: 'slug', why: isBlank(slugOf(atClick)) ? 'edited-during-generation' : 'not-empty' });
  }

  // AUTO-202: a picture only where there is none. An image Patrick uploaded
  // (or one made earlier) is never replaced by this button.
  if (hasHeaderImage(now)) {
    plan.kept.push({ field: 'headerImage', why: hasHeaderImage(atClick) ? 'not-empty' : 'edited-during-generation' });
  } else {
    plan.image = 'fill';
  }
  return plan;
}

/** REGENERATE, after the confirmation. Same `atClick` / `now` meaning as FILL. */
export function planRegenerate(
  atClick: BlogDocFields | null | undefined,
  now: BlogDocFields | null | undefined,
  generated: GeneratedBlog,
  published: { atClick: boolean; now: boolean },
): BlogPatchPlan {
  const plan: BlogPatchPlan = { set: {}, replaced: [], filled: [], kept: [], image: 'keep' };

  for (const f of BLOG_CONTENT_FIELDS) {
    if (!sameValue(atClick?.[f], now?.[f])) {
      plan.kept.push({ field: f, why: 'edited-during-generation' });
      continue;
    }
    if (isBlank(generated[f])) {
      plan.kept.push({ field: f, why: 'ai-left-blank' });
      continue;
    }
    plan.set[f] = typeof generated[f] === 'string' ? (generated[f] as string).trim() : generated[f];
    (isBlank(now?.[f]) ? plan.filled : plan.replaced).push(f);
  }

  // AUTO-202: the header image is replaced (or filled) unless it changed
  // during the wait, in which case Patrick's is kept.
  if (headerImageSignature(atClick) !== headerImageSignature(now)) {
    plan.kept.push({ field: 'headerImage', why: 'edited-during-generation' });
  } else {
    plan.image = hasHeaderImage(now) ? 'replace' : 'fill';
  }

  // Title and slug: together or not at all.
  const ts = titleSlugPlan(atClick, published.atClick || published.now);
  const newTitle = str(generated.title);
  const newSlug = newTitle ? slugValue(newTitle) : null;
  const titleUnchanged = sameValue(atClick?.title, now?.title) && sameValue(slugOf(atClick), slugOf(now));
  if (ts.mode === 'replace' && titleUnchanged && newTitle && newSlug) {
    plan.set.title = newTitle;
    plan.set.slug = newSlug;
    (isBlank(now?.title) ? plan.filled : plan.replaced).push('title');
    (isBlank(slugOf(now)) ? plan.filled : plan.replaced).push('slug');
    return plan;
  }
  const why: KeepReason = ts.mode === 'keep' ? ts.why : !titleUnchanged ? 'edited-during-generation' : 'ai-left-blank';
  plan.kept.push({ field: 'title', why });
  if (isBlank(slugOf(now))) {
    // Title kept but no slug yet: make it from the kept title, so they agree.
    const slug = slugValue(str(now?.title));
    if (slug) {
      plan.set.slug = slug;
      plan.filled.push('slug');
    }
  } else {
    plan.kept.push({ field: 'slug', why });
  }
  return plan;
}

const KEEP_SENTENCES: Record<KeepReason, string> = {
  'not-empty': 'already had a value',
  'edited-during-generation': 'you changed it while the AI was writing, so your version was kept',
  live: 'the post is published, so its web address must not change, and the title is kept so the two still match',
  'hand-set-slug': 'the web address was set by hand, so the title and address were both left as they are',
  'title-is-input': 'the title is what the AI was asked to write about; use Regenerate to have it rewritten',
  'ai-left-blank': 'the AI returned nothing for it',
};

export function keepSentence(why: KeepReason): string {
  return KEEP_SENTENCES[why];
}

export function fieldList(fields: readonly BlogField[]): string {
  return fields.map((f) => BLOG_FIELD_LABELS[f]).join(', ');
}
