/**
 * What a blog post tells search engines and social cards (AUTO-220 Part 8b).
 * PURE: the image URL builder is passed in, so the rule is tested without a
 * Sanity client.
 *
 * THE "SEO (extra)" FIELDS ARE TRUE OVERRIDES NOW. `seo.metaTitle`,
 * `seo.metaDescription` and `seo.ogImage` were on the blog post schema,
 * described there as overrides, and read by nothing: videos, products,
 * landing pages and shop by theme all read theirs, the blog was the
 * exception. Patrick had filled the Open Graph Image on about 45 published
 * posts believing it worked. The rule, the same on every one of the three:
 *
 *   empty   the main field is used (Meta Title, else the title; Meta
 *           Description, else the excerpt; the header image), exactly as
 *           before;
 *   filled  the SEO (extra) field wins.
 *
 * THE SOCIAL IMAGE IS ALWAYS SOMETHING A CARD CAN SHOW. It is served without
 * `auto=format` (IMG-120: scrapers cache what they get), so the CDN returns
 * the asset's own format unless told otherwise. Whichever picture is used,
 * the Open Graph Image or the header, is asked for as a JPEG whenever it is
 * not one already (`socialImageNeedsJpeg`): Patrick's Open Graph uploads
 * are AVIF where they are not the header itself, and X does not show an AVIF
 * card image; a generated header is a PNG. A picture that already IS a JPEG
 * is requested exactly as before, so its address is byte for byte what it was.
 *
 * MEASURED ON THE LIVE POSTS (2026-11-14, 689 published). The Open Graph Image
 * is filled on 45. On 40 it is the SAME ASSET as the header (a JPEG), so the
 * social image address does not change by one character. On 5 it is an AVIF
 * copy of the header picture (three are Sanity's own AVIF download of the
 * header asset, by their file names; the other two were looked at, and are
 * the same picture); those 5 now serve that copy, as a JPEG. The SEO Meta
 * Title and Meta Description are filled on ONE published post, and both
 * differ from the main fields, so that post's title and description change.
 */
import { socialImageNeedsJpeg } from './header-image';

interface ImageValue {
  asset?: { _ref?: string | null } | null;
}

export interface BlogSeoPost {
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  excerpt?: string | null;
  headerImage?: ImageValue | null;
  seo?: {
    metaTitle?: string | null;
    metaDescription?: string | null;
    ogImage?: ImageValue | null;
  } | null;
}

export interface BlogSeoDeps<P extends BlogSeoPost> {
  /** The Sanity image at 1200 wide, converted to a JPEG when asked; null when it has no asset. */
  imageUrl: (image: ImageValue | null | undefined, jpeg: boolean) => string | null | undefined;
  /** The hot-linked product photo (AUTO-202), when the post has no header asset. */
  externalUrl: (post: P) => string | null | undefined;
}

export interface BlogSeo {
  /** The `<title>`. */
  title: string;
  /** The social card's title (no site name appended). */
  socialTitle: string;
  description: string | undefined;
  /** The social image, or null for the branded default card. */
  image: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function blogPostSeo<P extends BlogSeoPost>(post: P, deps: BlogSeoDeps<P>): BlogSeo {
  const seoTitle = text(post.seo?.metaTitle);
  const mainTitle = text(post.metaTitle);
  const title = seoTitle || mainTitle || `${post.title} | Perfect Imprints`;
  const socialTitle = seoTitle || mainTitle || post.title;
  const description = text(post.seo?.metaDescription) || text(post.metaDescription) || text(post.excerpt) || undefined;

  const og = post.seo?.ogImage;
  const ogRef = og?.asset?._ref;
  const ogUrl = ogRef ? deps.imageUrl(og, socialImageNeedsJpeg(ogRef)) : null;
  const headerRef = post.headerImage?.asset?._ref;
  const headerUrl = headerRef ? deps.imageUrl(post.headerImage, socialImageNeedsJpeg(headerRef)) : null;
  const image = ogUrl || headerUrl || deps.externalUrl(post) || null;
  return { title, socialTitle, description, image };
}
