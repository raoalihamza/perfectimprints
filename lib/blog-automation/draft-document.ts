/**
 * The blog DRAFT a topic becomes (AUTO-201). Pure: the document shape the
 * Blog Topics tab used to assemble in the browser (AUTO-116, AUTO-117),
 * moved here so the server-side creator (create-blog-draft.ts) and any test
 * build exactly the document the panel built, and so there is ONE place that
 * says which fields a generated draft carries. No Sanity, no fs, no next/*.
 *
 * What a draft carries, and what it deliberately does not:
 *   - title and slug from the SAME AI title, so they match
 *   - metaTitle, metaDescription, excerpt, body
 *   - aiSuggestedLinks: everything the link finder found, each marked
 *     "placed in the body" or "not placed" (Patrick adds more by hand from it)
 *   - aiTemplate, aiTopicKeywords: [the topic's search], aiWordCount
 *   - sourceTopic: AUTO-117's record, read back by the guard on every pool
 *     call, drafts included, so the topic leaves the usable list at once
 *   - NO publishDate: AUTO-116 stamps it when Publish is pressed
 *   - since AUTO-202, the fields beside the body, each ONLY when it was
 *     determined (lib/blog-automation/resolve-draft-fields.ts): author (the
 *     setting or the default author), categories (the setting, never a
 *     guess), relatedCategorySlugs (the topic's ranking page, FIX-900 clean),
 *     and the header image as an uploaded asset (`headerImage`) or, for the
 *     first-product-photo fallback, a hot link (`externalHeaderImage`)
 */
import { buildSourceTopicRecord, type SourceTopicRecord, type SpacingGroup, type TopicCandidate } from './topic-pool';
import { slugifyTitle } from '../blog/slugify-title';
import type { HeaderImageOutcome, SanityImageValue } from './header-image';

/** The part of a topic the record needs: what the panel sends and what a scheduler reads off the snapshot. */
export type SourceTopicInput = Pick<TopicCandidate, 'key' | 'query' | 'variants'> & {
  /** The representative search's ranking page (AUTO-202: the related category slugs are read from it). */
  page?: string | null;
  spacingGroups?: readonly (Pick<SpacingGroup, 'key' | 'query'> & { page?: string | null })[];
};

/** What the field resolver determined for the draft; everything optional, written only when present. */
export interface DraftDocumentFields {
  authorId?: string | null;
  categoryIds?: readonly string[];
  relatedCategorySlugs?: readonly string[];
  headerImage?: HeaderImageOutcome | null;
}

export type BlogDraftTemplate = 'list' | 'single';

/** What the generator hands the draft builder. */
export interface GeneratedDraftContent {
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  body: unknown[];
  suggestedLinks: { label: string; href: string; reason: string }[];
}

export interface BlogDraftDocument {
  _id: string;
  _type: 'blogPost';
  title: string;
  slug: { _type: 'slug'; current: string };
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  body: unknown[];
  aiSuggestedLinks: { _key: string; _type: 'aiSuggestedLink'; label: string; href: string; reason: string }[];
  aiTemplate: BlogDraftTemplate;
  aiTopicKeywords: string[];
  aiWordCount: number;
  sourceTopic: SourceTopicRecord;
  /** AUTO-202, each present only when determined. */
  author?: { _type: 'reference'; _ref: string };
  categories?: { _type: 'reference'; _ref: string; _key: string }[];
  relatedCategorySlugs?: string[];
  headerImage?: SanityImageValue;
  externalHeaderImage?: { url: string; alt: string };
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);

/** "custom mini footballs" becomes "Custom Mini Footballs"; the AI refines it further. The panel's rule, unchanged. */
export function topicDraftTitle(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function randomTail(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? uuid.replace(/-/g, '') : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** A new document id (the draft is `drafts.<id>`); the panel's rule, unchanged. */
export function newDraftDocumentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? randomTail();
}

/** A new array item key; the panel's rule, unchanged. */
export function newItemKey(prefix: string): string {
  return `${prefix}-${randomTail().slice(0, 12)}`;
}

export interface BuildBlogDraftArgs {
  documentId: string;
  generated: GeneratedDraftContent;
  template: BlogDraftTemplate;
  wordCount: number;
  topic: SourceTopicInput;
  /** UTC ISO; what `sourceTopic.recordedAt` stores. */
  recordedAt: string;
  /** Array item keys (tests pass a deterministic one). */
  keyFor?: (prefix: string) => string;
  /** AUTO-202: the fields beside the body, as the resolver determined them. */
  fields?: DraftDocumentFields | null;
}

/**
 * The draft document, exactly as the Blog Topics tab created it before
 * AUTO-201 (sanity/tools/blog-topics-tool.tsx, the `client.create` call that
 * this replaced), with the title and slug from the same AI title and
 * AUTO-117's record built by the one builder. Throws when the AI title is
 * blank or slugifies to nothing, because a draft with no address is not a
 * draft anyone can open.
 */
export function buildBlogDraftDocument(args: BuildBlogDraftArgs): BlogDraftDocument {
  const keyFor = args.keyFor ?? newItemKey;
  const title = args.generated.title.trim();
  const slug = slugifyTitle(title);
  if (!title || !slug) {
    throw new Error('The AI did not return a usable title, so no draft was created. Try again.');
  }
  const doc: BlogDraftDocument = {
    _id: `drafts.${args.documentId}`,
    _type: 'blogPost',
    title,
    slug: { _type: 'slug', current: slug },
    metaTitle: args.generated.metaTitle,
    metaDescription: args.generated.metaDescription,
    excerpt: args.generated.excerpt,
    body: args.generated.body,
    aiSuggestedLinks: args.generated.suggestedLinks.map((l) => ({
      _key: keyFor('ail'),
      _type: 'aiSuggestedLink',
      label: l.label,
      href: l.href,
      reason: l.reason,
    })),
    aiTemplate: args.template,
    aiTopicKeywords: [args.topic.query],
    aiWordCount: args.wordCount,
    sourceTopic: buildSourceTopicRecord(args.topic, args.recordedAt),
  };
  // AUTO-202: the fields beside the body, each only when determined, so a
  // draft with no picture or no author has no key for it rather than a null
  // (the Studio shows an empty field either way; a GROQ `defined()` sees the
  // difference).
  const f = args.fields;
  if (f?.authorId) doc.author = { _type: 'reference', _ref: f.authorId };
  const categoryIds = (f?.categoryIds ?? []).filter((id) => typeof id === 'string' && id.trim());
  if (categoryIds.length > 0) doc.categories = categoryIds.map((id) => ({ _type: 'reference', _ref: id, _key: keyFor('cat') }));
  const related = (f?.relatedCategorySlugs ?? []).filter((s) => typeof s === 'string' && s.trim());
  if (related.length > 0) doc.relatedCategorySlugs = [...related];
  if (f?.headerImage?.kind === 'asset') doc.headerImage = f.headerImage.image;
  else if (f?.headerImage?.kind === 'url') doc.externalHeaderImage = { url: f.headerImage.url, alt: f.headerImage.alt };
  return doc;
}
