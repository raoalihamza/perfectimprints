/**
 * Standalone test: run htmlToPortableText conversion on a single raw blog JSON
 * and print the resulting portable text blocks. Does NOT touch Sanity.
 *
 *   pnpm tsx scripts/migrations/test-html-to-blocks.ts <slug>
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { htmlToBlocks } from '@sanity/block-tools';
import { Schema } from '@sanity/schema';

const PROJECT_ROOT = resolve(__dirname, '../..');
const slug = process.argv[2];
if (!slug) {
  console.error('Usage: pnpm tsx scripts/migrations/test-html-to-blocks.ts <slug>');
  process.exit(1);
}

const blockSchema = Schema.compile({
  name: 'blogConverter',
  types: [
    {
      name: 'blogPost',
      type: 'document',
      fields: [
        {
          name: 'body',
          type: 'array',
          of: [
            {
              type: 'block',
              styles: [
                { title: 'Normal', value: 'normal' },
                { title: 'H2', value: 'h2' },
                { title: 'H3', value: 'h3' },
                { title: 'H4', value: 'h4' },
                { title: 'Quote', value: 'blockquote' },
              ],
              lists: [
                { title: 'Bullet', value: 'bullet' },
                { title: 'Number', value: 'number' },
              ],
              marks: {
                decorators: [
                  { title: 'Strong', value: 'strong' },
                  { title: 'Emphasis', value: 'em' },
                  { title: 'Underline', value: 'underline' },
                ],
                annotations: [
                  {
                    name: 'link',
                    type: 'object',
                    fields: [
                      { name: 'href', type: 'string' },
                      { name: 'openInNewTab', type: 'boolean' },
                    ],
                  },
                ],
              },
            },
            { type: 'image' },
            {
              type: 'object',
              name: 'embed',
              fields: [
                { name: 'provider', type: 'string' },
                { name: 'url', type: 'url' },
                { name: 'videoId', type: 'string' },
                { name: 'caption', type: 'string' },
              ],
            },
          ],
        },
      ],
    },
  ],
});

function classifyEmbedSrc(src: string): { provider: 'youtube' | 'vimeo' | 'iframe'; videoId?: string } {
  const yt = src.match(/youtube\.com\/embed\/([\w-]+)|youtu\.be\/([\w-]+)|youtube\.com\/watch\?v=([\w-]+)/);
  if (yt) return { provider: 'youtube', videoId: yt[1] || yt[2] || yt[3] };
  const vimeo = src.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { provider: 'vimeo', videoId: vimeo[1] };
  return { provider: 'iframe' };
}

const blogBlockType = blockSchema
  .get('blogPost')
  .fields.find((f: { name: string }) => f.name === 'body').type;

const raw = JSON.parse(
  readFileSync(resolve(PROJECT_ROOT, 'data/blogs/raw', `${slug}.json`), 'utf8'),
) as { bodyHtml: string; embeds?: { type: string; url: string; videoId?: string }[] };

const blocks = htmlToBlocks(raw.bodyHtml, blogBlockType, {
  parseHtml: (h: string) => new JSDOM(h).window.document,
  rules: [
    {
      deserialize(el, _next, block) {
        const node = el as Element;
        if (node.nodeName !== 'IMG') return undefined;
        const src = (node as HTMLImageElement).getAttribute('src') || '';
        const alt = (node as HTMLImageElement).getAttribute('alt') || '';
        return block({ _type: 'image', _placeholderSrc: src, alt });
      },
    },
    {
      deserialize(el, _next, block) {
        const node = el as Element;
        if (node.nodeName !== 'IFRAME') return undefined;
        const src =
          (node as HTMLIFrameElement).getAttribute('src') ||
          node.getAttribute('data-src') ||
          '';
        if (!src) return undefined;
        const { provider, videoId } = classifyEmbedSrc(src);
        return block({ _type: 'embed', provider, url: src, videoId });
      },
    },
  ],
}) as unknown as Record<string, unknown>[];

console.log(`Converted ${blocks.length} blocks from ${raw.bodyHtml.length} chars of HTML`);
console.log(`\nBlock type breakdown:`);
const breakdown: Record<string, number> = {};
for (const b of blocks) {
  const t = (b._type as string) || 'unknown';
  breakdown[t] = (breakdown[t] || 0) + 1;
}
for (const [type, count] of Object.entries(breakdown)) {
  console.log(`  ${type.padEnd(10)} ${count}`);
}

console.log(`\nFirst 3 blocks:`);
console.log(JSON.stringify(blocks.slice(0, 3), null, 2));

console.log(`\nAny embed blocks?`);
const embeds = blocks.filter((b) => b._type === 'embed');
for (const e of embeds) console.log(JSON.stringify(e, null, 2));

console.log(`\nRaw scrape captured ${(raw.embeds || []).length} iframe embeds`);
for (const e of raw.embeds || []) console.log(`  - ${e.type} | ${e.url}`);
