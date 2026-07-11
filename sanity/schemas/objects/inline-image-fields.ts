/**
 * Shared Size + Alignment fields for INLINE images dropped into rich-text
 * bodies. Used by BOTH inline-image definitions:
 *   - the shared page-builder `portableBody()` image member (page richText /
 *     imageText bodies, landingPage bodies, productPage description) in
 *     ./page-sections.ts
 *   - the blogPost.body image member in ../documents/blog-post.ts
 *
 * Backward compatible by design: no `initialValue`, so every existing inline
 * image has both fields unset and keeps rendering exactly as before
 * (full width). The value lists are mirrored (NOT imported) by the render-side
 * mapping in lib/portable-text/inline-image-size.ts — the standalone Studio
 * bundler can't import from lib/, so keep the two value sets in sync manually.
 */
import { defineField } from 'sanity';

export const inlineImageSizeField = defineField({
  name: 'size',
  title: 'Size',
  type: 'string',
  description: 'How wide this image renders on the page. Leave blank for full width.',
  options: {
    list: [
      { title: 'Small (about a quarter width)', value: 'small' },
      { title: 'Medium (about half width)', value: 'medium' },
      { title: 'Large (about three quarters width)', value: 'large' },
      { title: 'Full width (default)', value: 'full' },
    ],
    layout: 'radio',
  },
});

export const inlineImageAlignField = defineField({
  name: 'align',
  title: 'Alignment',
  type: 'string',
  description:
    'How the image sits when it is smaller than the full width. Leave blank for centered.',
  options: {
    list: [
      { title: 'Left', value: 'left' },
      { title: 'Center (default)', value: 'center' },
      { title: 'Right', value: 'right' },
    ],
    layout: 'radio',
  },
});
