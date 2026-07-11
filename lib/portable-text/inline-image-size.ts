/**
 * Shared size/alignment mapping for INLINE images in rich-text bodies.
 *
 * Consumed by BOTH inline-image renderers so a sized image looks the same in a
 * blog post as on a product page / page / landing page:
 *   - components/page-sections/portable-text.tsx (page richText/imageText,
 *     landingPage bodies, productPage description)
 *   - components/blog/BlogBody.tsx (blogPost.body)
 *
 * The `size`/`align` values are set on the image block by the Studio fields in
 * sanity/schemas/objects/inline-image-fields.ts (value lists mirrored there —
 * the standalone Studio bundler can't import lib/, keep them in sync).
 *
 * Backward compatible: unset (or `full`) size returns '' extra classes and the
 * full 1200px asset width, so every pre-existing inline image renders exactly
 * as before. Sized images are capped with responsive max-widths — a "small"
 * image relaxes toward full width on phones so it never becomes a postage
 * stamp — and aligned with auto margins (unset align = centered).
 */

export type InlineImageSize = 'small' | 'medium' | 'large' | 'full';
export type InlineImageAlign = 'left' | 'center' | 'right';

/** Fields the renderers read off an inline image block (loosely typed — data). */
export interface InlineImageSizing {
  size?: string;
  align?: string;
}

// Full literal class strings (never built dynamically) so Tailwind's scanner
// picks them up. Mobile-first: small/medium widen on phones for legibility.
const SIZE_CAP_CLASSES: Record<string, string> = {
  small: 'max-w-[60%] sm:max-w-[40%] md:max-w-[25%]',
  medium: 'max-w-[85%] sm:max-w-[65%] md:max-w-[50%]',
  large: 'md:max-w-[75%]',
};

const ALIGN_MARGIN_CLASSES: Record<string, string> = {
  left: 'mr-auto',
  center: 'mx-auto',
  right: 'ml-auto',
};

// Asset width requested from the Sanity CDN per rendered size — no point
// fetching a 1200px asset for a quarter-width image.
const ASSET_WIDTHS: Record<string, number> = {
  small: 400,
  medium: 600,
  large: 900,
};

export const INLINE_IMAGE_FULL_WIDTH = 1200;

/**
 * Extra classes to append to the renderer's base image classes (which keep
 * `w-full`): a responsive max-width cap + an auto-margin alignment. Returns ''
 * for full/unset/unknown sizes so existing images render byte-identically.
 */
export function inlineImageSizingClasses(sizing: InlineImageSizing): string {
  const cap = sizing.size ? SIZE_CAP_CLASSES[sizing.size] : undefined;
  if (!cap) return '';
  const margin = ALIGN_MARGIN_CLASSES[sizing.align ?? ''] ?? ALIGN_MARGIN_CLASSES.center;
  return `${cap} ${margin}`;
}

/** Width to request from the Sanity image CDN for the chosen size. */
export function inlineImageAssetWidth(sizing: InlineImageSizing): number {
  return (sizing.size && ASSET_WIDTHS[sizing.size]) || INLINE_IMAGE_FULL_WIDTH;
}
