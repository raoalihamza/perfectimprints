/**
 * Import legacy PI blog posts (data/blogs/raw/*.json) into Sanity as DRAFTS.
 *
 *   pnpm tsx scripts/migrations/import-blogs.ts            # live import
 *   pnpm tsx scripts/migrations/import-blogs.ts --dry-run  # counts + log only
 *   pnpm tsx scripts/migrations/import-blogs.ts --limit=5  # smoke test
 *   pnpm tsx scripts/migrations/import-blogs.ts --resume   # skip slugs already in Sanity
 *
 * Workflow:
 *   1. Convert bodyHtml → portable text (@sanity/block-tools + jsdom).
 *   2. Preserve <a href> as markDefs of type `link` (no rewriting — internal
 *      /cat/* and /blog/* links keep working since destinations are preserved).
 *   3. Upload header + inline images to Sanity assets; rewrite image nodes
 *      to point at the uploaded asset references.
 *   4. Upsert author + blogCategory documents (dedup by name/slug).
 *   5. Best-effort `relatedCategorySlugs` mapping against PI's root slug set.
 *   6. Write blogPost as DRAFT (`_id: drafts.<id>`). Never auto-publish here —
 *      that's a separate step (publish-blog-drafts.ts) after sample verification.
 *
 * Requires SANITY_API_TOKEN with write scope.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { basename, resolve, extname } from 'node:path';
import { JSDOM } from 'jsdom';
import { htmlToBlocks } from '@sanity/block-tools';
import { Schema } from '@sanity/schema';
import { createClient, type SanityClient } from '@sanity/client';

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const RESUME = ARGS.includes('--resume');
const LIMIT_FLAG = ARGS.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_FLAG ? Number(LIMIT_FLAG.split('=')[1]) : Number.POSITIVE_INFINITY;

const PROJECT_ROOT = resolve(__dirname, '../..');
const RAW_DIR = resolve(PROJECT_ROOT, 'data/blogs/raw');
const CATEGORY_URLS_FILE = resolve(PROJECT_ROOT, 'data/pi-urls/category-urls.json');
const MAPPING_REPORT_PATH = resolve(PROJECT_ROOT, 'data/blogs/migration-mapping-report.json');

// ---------- .env.local loader (same minimal style as import-brands.ts) ----------
function loadDotEnvLocal(): void {
  const envPath = resolve(PROJECT_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

// ---------- types ----------
interface RawEmbed {
  type: 'youtube' | 'vimeo' | 'iframe';
  url: string;
  videoId?: string;
}

interface RawBlog {
  url: string;
  slug: string;
  title: string;
  /** SEO meta title from <title>/og:title (may differ from H1 title). */
  metaTitle?: string | null;
  publishDate: string | null;
  /** Updated date from PI's "Updated: ..." metaline. */
  updatedDate?: string | null;
  author: string | null;
  /** Legacy field name (TS scraper era). New Python scrape uses headerImageUrl. */
  headerImagePath?: string | null;
  /** Direct CDN URL (MPower's store-media.mpowerpromo.com is not CF-blocked). */
  headerImageUrl?: string | null;
  bodyHtml: string;
  /** Iframe embeds extracted during scrape (YouTube/Vimeo/other). */
  embeds?: RawEmbed[];
  categoryTags: string[];
  metaDescription: string | null;
  scrapedAt: string;
  scrapeSource?: string;
  scrapeSnapshotTimestamp?: string;
}

interface CategoryUrlEntry {
  url: string;
  type: string;
  rootSlug?: string;
}

interface CategoryUrlsJson {
  urls: CategoryUrlEntry[];
}

interface PortableTextBlock {
  _type: string;
  _key?: string;
  [k: string]: unknown;
}

// ---------- Sanity client ----------
function buildClient(): SanityClient {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production';
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID is required.');
  if (!DRY_RUN && !token) {
    throw new Error('SANITY_API_TOKEN with write scope is required. Use --dry-run to skip writes.');
  }
  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    useCdn: false,
    token,
  });
}

// ---------- PI root slug set (for relatedCategorySlugs mapping) ----------
function loadRootSlugs(): Set<string> {
  if (!existsSync(CATEGORY_URLS_FILE)) return new Set();
  const parsed = JSON.parse(readFileSync(CATEGORY_URLS_FILE, 'utf8')) as CategoryUrlsJson;
  const slugs = new Set<string>();
  for (const u of parsed.urls) {
    if (u.type === 'root' && u.rootSlug) slugs.add(u.rootSlug);
  }
  return slugs;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveRelatedCategorySlugs(blog: RawBlog, rootSlugs: Set<string>): string[] {
  const candidates = new Set<string>();
  // Sources: title words, category tags.
  const haystacks: string[] = [blog.title, ...blog.categoryTags].filter(Boolean);
  for (const text of haystacks) {
    const slug = slugify(text);
    if (rootSlugs.has(slug)) candidates.add(slug);
    // Also try single-noun forms by splitting the slug and re-joining suffix chunks.
    const parts = slug.split('-').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j <= parts.length; j++) {
        const sub = parts.slice(i, j).join('-');
        if (sub.length >= 4 && rootSlugs.has(sub)) candidates.add(sub);
      }
    }
  }
  return [...candidates];
}

// ---------- HTML → portable text ----------
// Minimal block schema for @sanity/block-tools. We only need the shape; the
// real Studio schema definition isn't required at convert-time as long as the
// allowed marks/styles match what we'll persist.
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

function htmlToPortableText(html: string): PortableTextBlock[] {
  if (!html.trim()) return [];
  const blocks = htmlToBlocks(html, blogBlockType, {
    parseHtml: (h: string) => new JSDOM(h).window.document,
    rules: [
      {
        deserialize(el, _next, block) {
          const node = el as Element;
          if (node.nodeName !== 'IMG') return undefined;
          const src = (node as HTMLImageElement).getAttribute('src') || '';
          const alt = (node as HTMLImageElement).getAttribute('alt') || '';
          // We emit a placeholder image block here; the asset upload step
          // (uploadAndRewriteImages) replaces _placeholderSrc with a real
          // sanity asset reference.
          return block({
            _type: 'image',
            _placeholderSrc: src,
            alt,
          });
        },
      },
      {
        // <iframe> → embed block. Preserves YouTube/Vimeo videos through the
        // portable text conversion which would otherwise drop them.
        deserialize(el, _next, block) {
          const node = el as Element;
          if (node.nodeName !== 'IFRAME') return undefined;
          const src =
            (node as HTMLIFrameElement).getAttribute('src') ||
            node.getAttribute('data-src') ||
            '';
          if (!src) return undefined;
          const { provider, videoId } = classifyEmbedSrc(src);
          return block({
            _type: 'embed',
            provider,
            url: src,
            videoId,
          });
        },
      },
      // Note: <a> tag handling is left to block-tools' built-in deserializer
      // — overriding it caused link annotations to be silently dropped from
      // the output. The default emits markDefs of type "link" with `href`.
    ],
  }) as PortableTextBlock[];
  return blocks;
}

// ---------- Image uploads ----------
const IMAGE_FETCH_TIMEOUT_MS = 6_000;
const SKIP_IMAGE_UPLOADS = process.argv.includes('--skip-images');

async function uploadImageFromUrl(
  client: SanityClient,
  url: string,
  title: string,
): Promise<string | null> {
  if (DRY_RUN) return `__dry-image-${url.slice(-30)}`;
  if (SKIP_IMAGE_UPLOADS) return null;
  // Note: MPower's store-media CDN legitimately uses `/undefined/` in some
  // paths (the page ID was undefined at render time but the asset itself is
  // valid). Earlier we rejected those as broken — that caused ~50% of the
  // images on long listicles to be silently dropped. Now we let them through.
  // Retry transient failures (ECONNRESET, timeout, Sanity 5xx) up to 4 times
  // with exponential backoff. The previous swallow-and-drop behaviour was
  // losing ~62% of body images at high parallelism.
  const MAX_ATTEMPTS = 4;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        return null;
      }
      const arr = await response.arrayBuffer();
      const buf = Buffer.from(arr);
      if (buf.length === 0) return null;
      let filename = url.split('?')[0].split('/').pop() || 'image.jpg';
      if (filename.length < 3 || !filename.includes('.')) filename = 'image.jpg';
      const asset = await client.assets.upload('image', buf, { filename, title });
      return asset._id;
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  console.warn(`    image upload gave up after ${MAX_ATTEMPTS} attempts: ${msg.slice(0, 60)} | ${url.slice(-60)}`);
  return null;
}

async function uploadImageFromLocalPath(
  client: SanityClient,
  absPath: string,
  title: string,
): Promise<string | null> {
  if (!existsSync(absPath)) return null;
  if (DRY_RUN) return `__dry-image-${basename(absPath)}`;
  const asset = await client.assets.upload('image', createReadStream(absPath), {
    filename: basename(absPath),
    title,
  });
  return asset._id;
}

function resolveLocalImagePath(localRef: string): string {
  const trimmed = localRef.replace(/^\/+/, '');
  return resolve(PROJECT_ROOT, trimmed);
}

async function uploadAndRewriteImages(
  client: SanityClient,
  blocks: PortableTextBlock[],
  blogSlug: string,
  cache: Map<string, string>,
): Promise<PortableTextBlock[]> {
  // Collect every image block placeholder URL up front, dedupe via cache, and
  // upload in parallel. Without this each blog's image uploads are sequential
  // and 5-image posts take 5x the wall time.
  const imageBlocks = blocks.filter(
    (b) => b._type === 'image' && b._placeholderSrc,
  ) as (PortableTextBlock & { _placeholderSrc: string })[];
  const uniquePlaceholders = Array.from(new Set(imageBlocks.map((b) => b._placeholderSrc)));
  const toFetch = uniquePlaceholders.filter((p) => !cache.has(p));

  // Throttle to IMAGE_UPLOAD_CONCURRENCY at a time. Without this, blogs with
  // many images (e.g. recession-proof has 91) would fire 91 parallel uploads
  // to Sanity → guaranteed rate limit / ECONNRESET → silently lost images.
  const IMAGE_UPLOAD_CONCURRENCY = 4;
  for (let i = 0; i < toFetch.length; i += IMAGE_UPLOAD_CONCURRENCY) {
    const chunk = toFetch.slice(i, i + IMAGE_UPLOAD_CONCURRENCY);
    await Promise.all(
      chunk.map(async (placeholder) => {
        const isUrl = /^https?:\/\//.test(placeholder);
        const uploaded = isUrl
          ? await uploadImageFromUrl(client, placeholder, `Blog inline ${blogSlug}`)
          : await uploadImageFromLocalPath(
              client,
              resolveLocalImagePath(placeholder),
              `Blog inline ${blogSlug}`,
            );
        if (uploaded) cache.set(placeholder, uploaded);
      }),
    );
  }

  // Mark failed-upload blocks for removal — Sanity's image schema requires
  // an asset ref, so leaving them in causes the doc to fail validation and
  // makes the migration brittle. Better to drop and let Patrick re-add hero
  // images later via an image backfill script.
  const blocksToKeep: PortableTextBlock[] = [];
  for (const block of blocks) {
    if (block._type !== 'image') {
      blocksToKeep.push(block);
      continue;
    }
    const placeholder = (block as { _placeholderSrc?: string })._placeholderSrc;
    const hasExistingAsset = !!(block as Record<string, unknown>).asset;
    if (hasExistingAsset && !placeholder) {
      // Already-uploaded image (rare but possible).
      blocksToKeep.push(block);
      continue;
    }
    if (!placeholder) {
      // Empty src in original HTML — drop as broken.
      continue;
    }
    const assetId = cache.get(placeholder);
    if (assetId) {
      (block as Record<string, unknown>).asset = { _type: 'reference', _ref: assetId };
      delete (block as Record<string, unknown>)._placeholderSrc;
      blocksToKeep.push(block);
    }
    // else: upload failed → drop block. Patrick can backfill via headerImage script.
  }
  return blocksToKeep;
}

// ---------- Upserts for author + blogCategory ----------
function authorId(name: string): string {
  return `author-${slugify(name)}`;
}
function blogCategoryId(slug: string): string {
  return `blog-category-${slug}`;
}

async function upsertAuthor(client: SanityClient, name: string, cache: Set<string>): Promise<string> {
  const id = authorId(name);
  if (cache.has(id)) return id;
  cache.add(id);
  if (DRY_RUN) return id;
  await client.createIfNotExists({
    _id: id,
    _type: 'author',
    name,
  } as never);
  return id;
}

async function upsertBlogCategory(
  client: SanityClient,
  title: string,
  cache: Set<string>,
): Promise<string> {
  const slug = slugify(title);
  const id = blogCategoryId(slug);
  if (cache.has(id)) return id;
  cache.add(id);
  if (DRY_RUN) return id;
  await client.createIfNotExists({
    _id: id,
    _type: 'blogCategory',
    title,
    slug: { _type: 'slug', current: slug },
  } as never);
  return id;
}

// ---------- Blog post upsert (as draft) ----------
function blogPostDraftId(slug: string): string {
  return `drafts.blog-post-${slug}`;
}
function blogPostPublishedId(slug: string): string {
  return `blog-post-${slug}`;
}

interface ExistingBlogIds {
  drafts: Set<string>;
  published: Set<string>;
}

async function fetchExistingBlogIds(client: SanityClient): Promise<ExistingBlogIds> {
  if (DRY_RUN) return { drafts: new Set(), published: new Set() };
  const docs = (await client.fetch<{ _id: string }[]>(
    `*[_type == "blogPost"]{ _id }`,
  )) ?? [];
  const drafts = new Set<string>();
  const published = new Set<string>();
  for (const d of docs) {
    if (d._id.startsWith('drafts.')) drafts.add(d._id);
    else published.add(d._id);
  }
  return { drafts, published };
}

function excerptFromBlocks(blocks: PortableTextBlock[], max = 200): string {
  for (const b of blocks) {
    if (b._type !== 'block') continue;
    const children = (b as { children?: { text?: string }[] }).children ?? [];
    const text = children.map((c) => c.text || '').join(' ').trim();
    if (text) return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
  }
  return '';
}

interface ImportResult {
  slug: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  error?: string;
  relatedCategorySlugs: string[];
}

async function importOne(
  client: SanityClient,
  blog: RawBlog,
  ctx: {
    rootSlugs: Set<string>;
    authorCache: Set<string>;
    categoryCache: Set<string>;
    existing: ExistingBlogIds;
    imageCache: Map<string, string>;
  },
): Promise<ImportResult> {
  const relatedCategorySlugs = deriveRelatedCategorySlugs(blog, ctx.rootSlugs);
  const draftId = blogPostDraftId(blog.slug);
  const publishedId = blogPostPublishedId(blog.slug);

  // Resume mode: skip if already imported (draft OR published).
  if (RESUME && (ctx.existing.drafts.has(draftId) || ctx.existing.published.has(publishedId))) {
    return { slug: blog.slug, status: 'skipped', relatedCategorySlugs };
  }

  // 1. HTML → portable text + image uploads.
  let body = htmlToPortableText(blog.bodyHtml);

  // Drop the first body image when it's a variant of headerImageUrl — PI
  // duplicates the hero image at the top of the article body, often with a
  // different MPower CDN version suffix (e.g.
  // `.../Doctors-Day-1771013062013.jpg` for the header vs
  // `.../Doctors-Day-1771013084376.jpg` in the body — same image, different
  // version timestamp). We compare URLs after stripping the trailing
  // `-<digits>.ext` pattern so both variants collapse to the same key.
  const normalizeImgUrl = (u: string): string =>
    u.split('?')[0].replace(/-\d{6,}(\.[a-z0-9]+)$/i, '$1');

  if (blog.headerImageUrl) {
    const headerKey = normalizeImgUrl(blog.headerImageUrl);
    for (let i = 0; i < body.length; i++) {
      const b = body[i] as Record<string, unknown>;
      if (b._type === 'image') {
        const placeholder = (b._placeholderSrc as string) || '';
        if (placeholder && normalizeImgUrl(placeholder) === headerKey) {
          body.splice(i, 1);
        }
        // Only inspect the first encountered image — preserves later body images.
        break;
      }
    }
  }

  body = await uploadAndRewriteImages(client, body, blog.slug, ctx.imageCache);
  const excerpt = excerptFromBlocks(body);

  // 2. Header image upload (URL preferred — new Python scrape — fall back to legacy local path).
  let headerImageRef: string | undefined;
  if (blog.headerImageUrl) {
    const assetId = await uploadImageFromUrl(
      client,
      blog.headerImageUrl,
      `Blog header ${blog.slug}`,
    );
    if (assetId) headerImageRef = assetId;
  } else if (blog.headerImagePath) {
    const abs = resolve(PROJECT_ROOT, blog.headerImagePath);
    const assetId = await uploadImageFromLocalPath(client, abs, `Blog header ${blog.slug}`);
    if (assetId) headerImageRef = assetId;
  }

  // 3. Author + categories.
  const authorRef = blog.author ? await upsertAuthor(client, blog.author, ctx.authorCache) : null;
  const categoryRefs: string[] = [];
  for (const tag of blog.categoryTags) {
    if (!tag.trim()) continue;
    categoryRefs.push(await upsertBlogCategory(client, tag, ctx.categoryCache));
  }

  // 4. Build the doc. Use the draft id so it stays unpublished until the
  // explicit publish-blog-drafts.ts step.
  // If a published version already exists, we update the published doc rather
  // than creating a stale draft alongside it.
  const targetId = ctx.existing.published.has(publishedId) ? publishedId : draftId;
  const isUpdate = ctx.existing.drafts.has(draftId) || ctx.existing.published.has(publishedId);

  const publishDateIso = blog.publishDate
    ? new Date(blog.publishDate).toISOString()
    : new Date(blog.scrapedAt).toISOString();

  const doc: Record<string, unknown> = {
    _id: targetId,
    _type: 'blogPost',
    title: blog.title,
    slug: { _type: 'slug', current: blog.slug },
    publishDate: publishDateIso,
    excerpt,
    body,
    metaDescription: blog.metaDescription || excerpt.slice(0, 155),
    // Prefer the scraped SEO meta title; fall back to the visible title.
    metaTitle:
      (blog.metaTitle && blog.metaTitle.length > 0
        ? blog.metaTitle.length <= 60
          ? blog.metaTitle
          : `${blog.metaTitle.slice(0, 57)}...`
        : blog.title.length <= 60
          ? blog.title
          : `${blog.title.slice(0, 57)}...`),
    relatedCategorySlugs,
  };
  if (blog.updatedDate) {
    try {
      doc.updatedDate = new Date(blog.updatedDate).toISOString();
    } catch {
      // ignore invalid updatedDate values
    }
  }
  if (headerImageRef) {
    doc.headerImage = {
      _type: 'image',
      asset: { _type: 'reference', _ref: headerImageRef },
      alt: blog.title,
    };
  }
  if (authorRef) {
    doc.author = { _type: 'reference', _ref: authorRef };
  }
  if (categoryRefs.length > 0) {
    doc.categories = categoryRefs.map((ref, i) => ({
      _type: 'reference',
      _key: `cat-${i}`,
      _ref: ref,
    }));
  }

  if (DRY_RUN) {
    return {
      slug: blog.slug,
      status: isUpdate ? 'updated' : 'created',
      relatedCategorySlugs,
    };
  }

  await client.createOrReplace(doc as never);

  return {
    slug: blog.slug,
    status: isUpdate ? 'updated' : 'created',
    relatedCategorySlugs,
  };
}

// ---------- main ----------
async function main(): Promise<void> {
  if (!existsSync(RAW_DIR)) {
    throw new Error(`raw blogs dir not found at ${RAW_DIR}. Run \`pnpm scrape-blogs\` first.`);
  }
  const blogsDir = resolve(PROJECT_ROOT, 'data/blogs');
  if (!existsSync(blogsDir)) mkdirSync(blogsDir, { recursive: true });

  const files = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} raw blog JSONs in ${RAW_DIR}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (writes drafts)'}`);
  if (RESUME) console.log('Resume: skipping blogs already in Sanity');
  if (Number.isFinite(LIMIT)) console.log(`Limited to first ${LIMIT}`);

  const client = buildClient();
  const rootSlugs = loadRootSlugs();
  console.log(`Loaded ${rootSlugs.size} PI root slugs for relatedCategorySlugs mapping`);

  const existing = await fetchExistingBlogIds(client);
  console.log(
    `Existing blogPost docs in Sanity: ${existing.drafts.size} drafts, ${existing.published.size} published`,
  );

  const authorCache = new Set<string>();
  const categoryCache = new Set<string>();
  const imageCache = new Map<string, string>();
  const ctx = { rootSlugs, authorCache, categoryCache, existing, imageCache };

  const slugsToProcess = files.slice(0, Number.isFinite(LIMIT) ? LIMIT : files.length);
  // Parallel chunk size for blog processing — keeps Sanity write pipeline busy.
  const CONCURRENCY = SKIP_IMAGE_UPLOADS ? 8 : 3;

  // Identify URLs that have no raw JSON (Wayback had no usable snapshot) so
  // we can backfill stub drafts at the end. Without this, those 200+ URLs
  // would 404 on the new site and lose their SEO equity.
  const piIndex = JSON.parse(
    readFileSync(resolve(PROJECT_ROOT, 'data/pi-urls/blog-urls.json'), 'utf8'),
  ) as { urls: { slug: string }[] };
  const haveRawSet = new Set(files.map((f) => f.replace(/\.json$/, '').toLowerCase()));
  const stubsToCreate = piIndex.urls.filter((u) => !haveRawSet.has(u.slug.toLowerCase()));
  console.log(`Stub drafts to create for URLs without Wayback snapshots: ${stubsToCreate.length}`);

  const results: ImportResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let withMapping = 0;
  const slugCoverage = new Map<string, number>();

  let processed = 0;
  for (let i = 0; i < slugsToProcess.length; i += CONCURRENCY) {
    const chunk = slugsToProcess.slice(i, i + CONCURRENCY);
    const chunkBlogs = chunk.map(
      (f) => JSON.parse(readFileSync(resolve(RAW_DIR, f), 'utf8')) as RawBlog,
    );
    await Promise.all(
      chunkBlogs.map(async (blog) => {
        try {
          const r = await importOne(client, blog, ctx);
          results.push(r);
          if (r.status === 'created') created += 1;
          else if (r.status === 'updated') updated += 1;
          else if (r.status === 'skipped') skipped += 1;
          if (r.relatedCategorySlugs.length > 0) {
            withMapping += 1;
            for (const s of r.relatedCategorySlugs)
              slugCoverage.set(s, (slugCoverage.get(s) || 0) + 1);
          }
        } catch (e) {
          failed += 1;
          const msg = e instanceof Error ? e.message : String(e);
          results.push({ slug: blog.slug, status: 'failed', error: msg, relatedCategorySlugs: [] });
          console.error(`  FAIL ${blog.slug}: ${msg}`);
        }
      }),
    );
    processed += chunk.length;
    if (processed % 25 === 0 || processed >= slugsToProcess.length) {
      console.log(
        `  [${processed}/${slugsToProcess.length}] created=${created} updated=${updated} skipped=${skipped} failed=${failed}`,
      );
    }
  }

  // Stub drafts for URLs Wayback had no snapshot for. Batched via Sanity
  // transactions — much faster than per-doc createOrReplace.
  let stubsCreated = 0;
  let stubsFailed = 0;
  const STUB_BATCH_SIZE = 50;
  for (let i = 0; i < stubsToCreate.length; i += STUB_BATCH_SIZE) {
    const batch = stubsToCreate.slice(i, i + STUB_BATCH_SIZE);
    const tx = client.transaction();
    let queuedInBatch = 0;
    for (const entry of batch) {
      const slug = entry.slug.toLowerCase();
      const draftId = blogPostDraftId(slug);
      const publishedId = blogPostPublishedId(slug);
      if (
        RESUME &&
        (ctx.existing.drafts.has(draftId) || ctx.existing.published.has(publishedId))
      ) {
        continue;
      }
      const title = slug
        .split('-')
        .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
        .join(' ');
      const relatedCategorySlugs = deriveRelatedCategorySlugs(
        { title, categoryTags: [], slug } as RawBlog,
        ctx.rootSlugs,
      );
      const targetId = ctx.existing.published.has(publishedId) ? publishedId : draftId;
      const doc: Record<string, unknown> = {
        _id: targetId,
        _type: 'blogPost',
        title,
        slug: { _type: 'slug', current: slug },
        publishDate: new Date().toISOString(),
        excerpt: 'Content coming soon.',
        body: [
          {
            _type: 'block',
            _key: 'stub',
            style: 'normal',
            children: [
              {
                _type: 'span',
                _key: 'stub-span',
                text:
                  'This post is being migrated. Please check back soon — the original article is in the process of being restored.',
              },
            ],
          },
        ],
        metaTitle: title.length <= 60 ? title : `${title.slice(0, 57)}...`,
        metaDescription: 'Promotional product ideas and insights from Perfect Imprints.',
        relatedCategorySlugs,
      };
      tx.createOrReplace(doc as never);
      queuedInBatch += 1;
    }
    if (queuedInBatch === 0) continue;
    try {
      if (!DRY_RUN) await tx.commit();
      stubsCreated += queuedInBatch;
    } catch (e) {
      stubsFailed += queuedInBatch;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  STUB BATCH FAIL at offset ${i}: ${msg}`);
    }
    console.log(
      `  [stubs ${Math.min(i + STUB_BATCH_SIZE, stubsToCreate.length)}/${stubsToCreate.length}] created=${stubsCreated} failed=${stubsFailed}`,
    );
  }

  // Write the mapping report so Patrick (or Studio cleanup) can see coverage at a glance.
  const sortedCoverage = [...slugCoverage.entries()].sort((a, b) => b[1] - a[1]);
  const report = {
    generatedAt: new Date().toISOString(),
    totalBlogs: results.length,
    blogsWithAtLeastOneMappedSlug: withMapping,
    blogsWithoutAnyMapping: results.length - withMapping,
    coveragePct: Math.round((withMapping / Math.max(1, results.length)) * 100),
    stubsCreated,
    stubsFailed,
    topMappedSlugs: sortedCoverage.slice(0, 50).map(([slug, count]) => ({ slug, count })),
    failures: results.filter((r) => r.status === 'failed').map((r) => ({ slug: r.slug, error: r.error })),
  };
  writeFileSync(MAPPING_REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log('\nDone.');
  console.log(`  Created (as drafts):  ${created}`);
  console.log(`  Updated:              ${updated}`);
  console.log(`  Skipped (resume):     ${skipped}`);
  console.log(`  Failed:               ${failed}`);
  console.log(`  Stub drafts created:  ${stubsCreated}`);
  console.log(`  Stub drafts failed:   ${stubsFailed}`);
  console.log(
    `  With relatedCategorySlugs: ${withMapping}/${results.length} (${report.coveragePct}%)`,
  );
  console.log(`  Mapping report: ${MAPPING_REPORT_PATH}`);
  console.log(
    '\nNext: spot-check 5 sample drafts in Studio, then run `pnpm publish-blog-drafts` (after manual sample verification).',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
