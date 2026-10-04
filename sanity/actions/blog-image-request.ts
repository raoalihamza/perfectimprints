/**
 * What the two blog Studio buttons send to /api/sanity/generate-blog-image
 * and what they patch with its answer (AUTO-202). PURE and shared, so the
 * "Generate header image" button and Generate / Regenerate Blog with AI
 * cannot build the request or read the outcome two different ways. No React,
 * no Sanity, no server imports (the Studio bundle takes it).
 */
import { collectBlogProductSkus } from '../../lib/blog/collect-strip-skus';

export interface BlogImageDoc {
  title?: unknown;
  slug?: { current?: unknown } | null;
  body?: unknown;
  headerImage?: { asset?: { _ref?: unknown } | null } | null;
  externalHeaderImage?: { url?: unknown } | null;
  headerImageSource?: unknown;
  aiTopicKeywords?: unknown;
  sourceTopic?: { query?: unknown } | null;
  relatedCategorySlugs?: unknown;
}

/** The route's answer, the part the buttons read. */
export interface ImageOutcome {
  kind: 'asset' | 'url' | 'none';
  source?: 'ai' | 'library' | 'product';
  image?: { _type: 'image'; asset: { _type: 'reference'; _ref: string }; alt?: string };
  url?: string;
  alt?: string;
  notes?: string[];
  usage?: { capUsed?: number; cap?: number; attempts?: number };
}

export interface ImageResponse {
  ok?: boolean;
  outcome?: ImageOutcome;
  summary?: string;
  error?: string;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim()) : [];
}

/** The current header image as one comparable string: the asset ref, the hot link, or empty. */
export function headerImageSignature(doc: BlogImageDoc | null | undefined): string {
  const ref = doc?.headerImage?.asset?._ref;
  if (typeof ref === 'string' && ref) return `asset:${ref}`;
  const url = doc?.externalHeaderImage?.url;
  if (typeof url === 'string' && url.trim()) return `url:${url.trim()}`;
  return '';
}

/** True when the post has a header image of either shape. */
export function hasHeaderImage(doc: BlogImageDoc | null | undefined): boolean {
  return headerImageSignature(doc) !== '';
}

/**
 * The request body, from the document in hand. `body` may be passed
 * explicitly (Generate Blog with AI passes the body it has JUST patched,
 * which Sanity has not necessarily stored yet) and defaults to the document's.
 */
export function imageRequestBody(doc: BlogImageDoc | null | undefined, source: 'ai' | 'default', body?: unknown) {
  const keywords = strings(doc?.aiTopicKeywords);
  const topic = doc?.sourceTopic?.query;
  const postSource = doc?.headerImageSource;
  return {
    title: typeof doc?.title === 'string' ? doc.title : '',
    keywords: keywords.length > 0 ? keywords : typeof topic === 'string' && topic.trim() ? [topic.trim()] : [],
    skus: collectBlogProductSkus(Array.isArray(body ?? doc?.body) ? ((body ?? doc?.body) as unknown[]) : []),
    rootSlugs: strings(doc?.relatedCategorySlugs),
    slug: typeof doc?.slug?.current === 'string' ? doc.slug.current : '',
    source,
    postSource: typeof postSource === 'string' ? postSource : undefined,
  };
}

/** The patch that puts an outcome onto the post, or null when there is nothing to put (kind 'none'). */
export function patchForOutcome(outcome: ImageOutcome | undefined): { set: Record<string, unknown>; unset: string[] } | null {
  if (outcome?.kind === 'asset' && outcome.image?.asset?._ref) {
    return { set: { headerImage: outcome.image }, unset: ['externalHeaderImage'] };
  }
  if (outcome?.kind === 'url' && outcome.url) {
    return { set: { externalHeaderImage: { url: outcome.url, alt: outcome.alt ?? '' } }, unset: ['headerImage'] };
  }
  return null;
}

/** The daily counter line, when the route reported it. */
export function capOf(outcome: ImageOutcome | undefined): { used: number; cap: number } | undefined {
  const used = outcome?.usage?.capUsed;
  const cap = outcome?.usage?.cap;
  return typeof used === 'number' && typeof cap === 'number' ? { used, cap } : undefined;
}
