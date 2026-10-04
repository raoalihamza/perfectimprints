/**
 * AUTO-201 structural guard: ONE generation path, shared by the Blog Topics
 * tab and the Stage 2 scheduler, and the rules of the links it places.
 *
 * Source-level assertions, the lib/sanity/generate-auth.test.ts idiom. They
 * fail when:
 *   - the tab creates a blog document itself again (the two-code-paths fault
 *     FIX-871 was about), or calls the generate-blog route instead of the
 *     blog-topics `generate` action, or imports a server module;
 *   - a second file writes the AUTO-117 record, builds the draft document,
 *     or carries the blog prompt;
 *   - the generate-blog route or the blog-topics route stops calling the
 *     shared functions, or loses its explicit maxDuration;
 *   - the link count or the AI deadline is spelled in a second place;
 *   - the finder starts returning unpublished targets, or a blog-shape link
 *     opens in a new tab.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

// Read from the source rather than imported: the generator imports the
// hidden-SKU context, which carries the `server-only` marker vitest cannot
// load, and a structural test must not need the module to run anyway.
function constant(src: string, name: string): number {
  const m = src.match(new RegExp(`export const ${name} = ([^;]+);`));
  if (!m) throw new Error(`${name} not found`);
  // The values are numeric literals (with digit separators) or a product of the per-post count.
  let expr = m[1];
  if (name !== 'INTERNAL_LINKS_PER_POST') {
    expr = expr.replace(/INTERNAL_LINKS_PER_POST/g, String(constant(src, 'INTERNAL_LINKS_PER_POST')));
  }
  return Function(`return (${expr.replace(/_/g, '')});`)() as number;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}

const TOOL = 'sanity/tools/blog-topics-tool.tsx';
const TOPICS_ROUTE = 'app/api/sanity/blog-topics/route.ts';
const BLOG_ROUTE = 'app/api/sanity/generate-blog/route.ts';
const CREATOR = 'lib/blog-automation/create-blog-draft.ts';
const GENERATOR = 'lib/blog-automation/generate-blog-post.ts';
const DRAFT_DOC = 'lib/blog-automation/draft-document.ts';

const allSources = [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'lib')), ...sourceFiles(join(ROOT, 'sanity')), ...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'scripts'))];

describe('the Blog Topics tab generates through the server function and writes nothing itself', () => {
  const tool = read(TOOL);

  it('sends action "generate" to the blog-topics route through useGenerateAuthFetch', () => {
    expect(tool).toContain("action: 'generate'");
    expect(tool).toContain("const API_URL = '/api/sanity/blog-topics';");
    expect(tool).toContain('await authFetch(API_URL, {');
    expect(tool).not.toContain('/api/sanity/generate-blog');
  });

  it('never creates a blog document in the browser', () => {
    expect(tool).not.toMatch(/\.create\(/);
    expect(tool).not.toMatch(/_type:\s*'blogPost'/);
    expect(tool).not.toContain('buildSourceTopicRecord');
    expect(tool).not.toContain('slugifyTitle');
  });

  it('imports no server module (the function runs on the server, not in the Studio bundle)', () => {
    const imports: string[] = tool.match(/from '[^']+'/g) ?? [];
    for (const forbidden of ['create-blog-draft', 'generate-blog-post', 'written-topics', 'studio-nonce-auth', 'build-topic-pool', 'cached-topic-pool', 'gsc-client', 'lib/ai/']) {
      expect(imports.filter((i) => i.includes(forbidden)), forbidden).toEqual([]);
    }
  });

  it('passes allowDuplicate only from a confirmed dialog', () => {
    expect(tool).toContain('let allowDuplicate = false;');
    expect(tool).toContain('allowDuplicate = true;');
    expect(tool.split('allowDuplicate = true;').length).toBe(2);
  });
});

describe('the one function, and its two callers', () => {
  it('the blog-topics route calls createBlogDraftFromTopic and nothing else writes a draft there', () => {
    const route = read(TOPICS_ROUTE);
    expect(route).toContain("from '@/lib/blog-automation/create-blog-draft'");
    expect(route).toContain('await createBlogDraftFromTopic({');
    expect(route).not.toMatch(/\.create\(/);
    expect(route).not.toContain('generateBlogPost(');
  });

  it('createBlogDraftFromTopic is the only non-route caller of generateBlogPost, and the generate-blog route the only route caller', () => {
    const callers = allSources.filter((f) => f !== GENERATOR && /\bgenerateBlogPost\(/.test(read(f)));
    expect(callers.sort()).toEqual([BLOG_ROUTE, CREATOR].sort());
  });

  it('the AUTO-117 record and the draft document are built in one place each', () => {
    const recordWriters = allSources.filter((f) => !f.endsWith('topic-pool.ts') && /\bbuildSourceTopicRecord\(/.test(read(f)));
    expect(recordWriters).toEqual([DRAFT_DOC]);
    const docBuilders = allSources.filter((f) => f !== DRAFT_DOC && /\bbuildBlogDraftDocument\(/.test(read(f)));
    expect(docBuilders).toEqual([CREATOR]);
    // No other source file assembles a blogPost document literal.
    const literalWriters = allSources.filter((f) => f !== DRAFT_DOC && /_type:\s*'blogPost'/.test(read(f)) && !f.startsWith('scripts/'));
    expect(literalWriters).toEqual([]);
  });

  it('the blog prompt lives in the generator only', () => {
    const carriers = allSources.filter((f) => read(f).includes('LONG-FORM BLOG POST'));
    expect(carriers).toEqual([GENERATOR]);
  });

  it('the create is the last step and happens once', () => {
    const creator = read(CREATOR);
    const createAt = creator.indexOf('await client.create(document);');
    expect(createAt).toBeGreaterThan(-1);
    expect(creator.split('.create(').length).toBe(2);
    for (const marker of ['await generateBlogPost(', 'await readWrittenTopicSources()', 'buildBlogDraftDocument({']) {
      expect(creator.lastIndexOf(marker), marker).toBeLessThan(createAt);
    }
  });
});

describe('deadlines', () => {
  const generator = read(GENERATOR);
  const BLOG_AI_TIMEOUT_MS = constant(generator, 'BLOG_AI_TIMEOUT_MS');
  const INTERNAL_LINKS_PER_POST = constant(generator, 'INTERNAL_LINKS_PER_POST');
  const INTERNAL_LINK_CANDIDATES = constant(generator, 'INTERNAL_LINK_CANDIDATES');

  it('both routes set an explicit maxDuration above the AI deadline', () => {
    const blog = Number(read(BLOG_ROUTE).match(/export const maxDuration = (\d+);/)?.[1]);
    const topics = Number(read(TOPICS_ROUTE).match(/export const maxDuration = (\d+);/)?.[1]);
    expect(blog).toBe(180);
    expect(topics).toBe(240);
    expect(BLOG_AI_TIMEOUT_MS).toBe(150_000);
    expect(blog * 1000).toBeGreaterThan(BLOG_AI_TIMEOUT_MS);
    expect(topics * 1000).toBeGreaterThan(BLOG_AI_TIMEOUT_MS);
    // Inside every Vercel plan's ceiling.
    expect(topics).toBeLessThanOrEqual(300);
  });

  it('the generator passes the deadline to DeepSeek, and the DeepSeek wrapper honours it', () => {
    expect(read(GENERATOR)).toContain('timeoutMs: BLOG_AI_TIMEOUT_MS,');
    const deepseek = read('lib/ai/deepseek.ts');
    expect(deepseek).toContain('AbortSignal.timeout(opts.timeoutMs)');
    expect(deepseek).toMatch(/TimeoutError/);
  });

  it('the deadline and the link count are spelled once', () => {
    for (const name of ['BLOG_AI_TIMEOUT_MS', 'INTERNAL_LINKS_PER_POST', 'INTERNAL_LINK_CANDIDATES']) {
      const definers = allSources.filter((f) => new RegExp(`export const ${name} =`).test(read(f)));
      expect(definers, name).toEqual([GENERATOR]);
    }
  });
});

describe('the fields beside the body (AUTO-202)', () => {
  const creator = read(CREATOR);
  const FIELDS = 'lib/blog-automation/resolve-draft-fields.ts';
  const IMAGE_CHAIN = 'lib/blog-automation/resolve-header-image.ts';
  const IMAGE_ROUTE = 'app/api/sanity/generate-blog-image/route.ts';

  it('the creator resolves the four fields after the AI, and the second drafts read is the LAST step before the one create', () => {
    const createAt = creator.indexOf('await client.create(document);');
    const aiAt = creator.indexOf('await generateBlogPost(');
    const fieldsAt = creator.indexOf('await resolveDraftFields(');
    const secondRead = creator.lastIndexOf('await readWrittenTopicSources()');
    expect(fieldsAt).toBeGreaterThan(aiAt);
    expect(secondRead).toBeGreaterThan(fieldsAt);
    expect(secondRead).toBeLessThan(createAt);
    expect(creator).toContain('fields,');
    // A picture uploaded for a draft the duplicate check refuses is removed again.
    expect(creator).toContain('await discardGeneratedPicture(client, fields.headerImage);');
    // Still ONE create.
    expect(creator.split('.create(').length).toBe(2);
  });

  it('the field resolver and the image chain are each called from exactly the stated places', () => {
    const fieldCallers = allSources.filter((f) => f !== FIELDS && /\bresolveDraftFields\(/.test(read(f)));
    expect(fieldCallers).toEqual([CREATOR]);
    const chainCallers = allSources.filter((f) => f !== IMAGE_CHAIN && /\bresolveHeaderImage\(/.test(read(f)));
    expect(chainCallers.sort()).toEqual([IMAGE_ROUTE, FIELDS].sort());
  });

  it('the image chain never throws: every effect is caught, and every effect after the reservation runs under the deadline', () => {
    const chain = read(IMAGE_CHAIN);
    for (const effect of ['deps.reserve(', 'deps.fetchReference(', 'deps.generate({', 'deps.check({', 'deps.upload(']) {
      const at = chain.indexOf(effect);
      expect(at, effect).toBeGreaterThan(-1);
      expect(chain.lastIndexOf('try {', at), `${effect} inside a try`).toBeGreaterThan(chain.lastIndexOf('} catch', at));
    }
    for (const effect of ['deps.fetchReference(', 'deps.generate({', 'deps.check({', 'deps.upload(']) {
      expect(chain, `${effect} under withDeadline`).toMatch(new RegExp(`withDeadline\\(\\s*${effect.replace(/[.(]/g, '\\$&')}`));
    }
    // The only throws are the two inside the no-client deps' own stubs, which the chain catches.
    const body = chain.slice(chain.indexOf('export async function resolveHeaderImage('));
    expect(body).not.toContain('throw new');
    // The key is checked before any slot is spent.
    expect(chain.indexOf('deps.keyConfigured()')).toBeLessThan(chain.indexOf('await deps.reserve('));
  });

  it('the image budget fits the blog-topics route beside the AI deadline', () => {
    const chain = read(IMAGE_CHAIN);
    const numberConst = (src: string, name: string): number => {
      const m = src.match(new RegExp(`export const ${name} = ([0-9_]+);`));
      if (!m) throw new Error(`${name} not found`);
      return Number(m[1].replace(/_/g, ''));
    };
    const budget = numberConst(chain, 'HEADER_IMAGE_BUDGET_MS');
    const timeout = numberConst(chain, 'HEADER_IMAGE_GENERATE_TIMEOUT_MS');
    const aiDeadline = constant(read(GENERATOR), 'BLOG_AI_TIMEOUT_MS');
    const topics = Number(read(TOPICS_ROUTE).match(/export const maxDuration = (\d+);/)?.[1]);
    const image = Number(read(IMAGE_ROUTE).match(/export const maxDuration = (\d+);/)?.[1]);
    expect(timeout).toBeLessThan(budget);
    // 150 s AI + 70 s image + a few seconds of reads and the create, inside 240.
    expect(aiDeadline + budget + 10_000).toBeLessThan(topics * 1000);
    expect(image * 1000).toBeGreaterThan(budget);
    expect(image).toBeLessThanOrEqual(300);
  });

  it('the tab sends the ranking page with the topic, and the route reads it', () => {
    expect(read(TOOL)).toContain('page: topic.page');
    const route = read(TOPICS_ROUTE);
    expect(route).toContain('page: readPage(raw?.page)');
    expect(route).toContain('headerImageSummary(created.headerImage)');
  });

  it('the cap is reserved before anything is generated, and both counters are unregistered types', () => {
    const chain = read(IMAGE_CHAIN);
    const reserveAt = chain.indexOf('await deps.reserve(');
    const fetchAt = chain.indexOf('deps.fetchReference(');
    const generateAt = chain.indexOf('deps.generate({');
    expect(reserveAt).toBeGreaterThan(-1);
    expect(generateAt).toBeGreaterThan(-1);
    // The cap first; the reference photos and the generation only after a slot is held.
    expect(reserveAt).toBeLessThan(fetchAt);
    expect(reserveAt).toBeLessThan(generateAt);
    const index = read('sanity/schemas/index.ts');
    expect(index).not.toContain('blogImageAiUsage');
    expect(index).not.toContain('portfolioAiUsage');
  });
});

describe('the links', () => {
  it('about six per post, with twice that many candidates, placed under the topic policy in the same tab', () => {
    const gen = read(GENERATOR);
    expect(constant(gen, 'INTERNAL_LINKS_PER_POST')).toBe(6);
    expect(constant(gen, 'INTERNAL_LINK_CANDIDATES')).toBe(12);
    expect(gen).toContain("{ linkShape: 'blog', anchorPolicy: 'topic', topicWords: promptKeywords }");
    expect(gen).toContain('INTERNAL_LINKS_PER_POST,');
    expect(gen).toContain('limit: INTERNAL_LINK_CANDIDATES,');
    // Blog-shape links never open in a new tab.
    expect(read('lib/ai/place-internal-links.ts')).toContain("linkShape === 'blog'\n        ? { href, openInNewTab: false }");
  });

  it('the finder is untouched in what it reads: published documents only, and generated root categories', () => {
    const finder = read('lib/ai/internal-links.ts');
    expect(finder).toContain('!(_id in path("drafts.**"))');
    expect(finder).toContain('getAllGeneratedRootSlugs()');
    expect(finder).toContain('export async function suggestInternalLinks(');
  });

  it('a self link is dropped twice over: the finder excludes the slug, and the generator drops the href', () => {
    expect(read(GENERATOR)).toContain('excludeSlug: currentSlug,');
    expect(read(GENERATOR)).toContain('function dropSelf(');
  });

  it("the post's own category is boosted for the finder only, and a target matched on generic words alone is dropped", () => {
    const gen = read(GENERATOR);
    expect(gen).toContain('const linkCategorySlug = categorySlug ?? resolveCategoryForKeywords(promptKeywords.join(\' \')) ?? undefined;');
    expect(gen).toContain('categorySlug: linkCategorySlug,');
    expect(gen).toContain('const suggestions = found.filter((s) => topicWordsOf(s).length > 0);');
    // The strips still receive the caller's category and nothing else.
    expect(gen.match(/categorySlug: ideaCategory \?\? undefined,/g)).toHaveLength(1);
    expect(gen).not.toContain('categorySlug: linkCategorySlug,\n        keywords: stripKeywords');
  });

  it('no price in the body: the prompt forbids it and the generator rejects a post that carries one', () => {
    const gen = read(GENERATOR);
    expect(gen).toContain('NO prices, dollar amounts, per-unit costs or budget figures');
    expect(gen).toContain('textParts(gen).find(containsPrice)');
  });
});
