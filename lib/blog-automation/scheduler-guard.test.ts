/**
 * AUTO-208 structural guard: the scheduler's contracts, asserted against the
 * source (the generate-auth.test.ts idiom), and the modules this ticket
 * promised not to touch, asserted by their load-bearing constants.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPARISON_IN_ROTATION, LIST_IDEAS_MIN, TITLE_MAX_CHARS } from './blog-shape';
import { PRODUCT_SPACING_GAP, SHAPE_LOOKAHEAD } from './topic-spacing';
import { BLOG_POSTS_PER_DAY, DIGEST_CRON_PATH, expectedVercelCrons, WRITER_CRON_PATH, WRITING_FIRINGS } from './schedule';
import { RUN_STALE_MS } from './run-log';
import { HEADER_IMAGE_BUDGET_MS } from './resolve-header-image';
import { BLOG_IMAGE_AI_DAILY_CAP } from './header-image-usage';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === '.next' || name.startsWith('.') || name === 'tmp') continue;
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}
const allSources = [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'lib')), ...sourceFiles(join(ROOT, 'sanity')), ...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'scripts'))];
const nonTest = allSources.filter((f) => !/\.test\.tsx?$/.test(f));

const WRITER_ROUTE = 'app/api/cron/blog-automation/route.ts';
const DIGEST_ROUTE = 'app/api/cron/blog-digest/route.ts';

describe('the schedule and vercel.json say the same thing', () => {
  it('vercel.json carries exactly the firings in schedule.ts: four writing firings (two per slot) and the digest', () => {
    const json = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] };
    expect(json.crons).toEqual(expectedVercelCrons());
    expect(BLOG_POSTS_PER_DAY).toBe(2);
    expect(WRITING_FIRINGS.filter((f) => f.attempt === 2)).toHaveLength(2);
    // Every retry fires 30 minutes after its first firing, well past the stale window.
    for (const slot of ['a', 'b'] as const) {
      const [first, retry] = WRITING_FIRINGS.filter((f) => f.slot === slot).map((f) => f.schedule.split(' '));
      expect(first[1]).toBe(retry[1]);
      expect(Number(retry[0]) - Number(first[0])).toBe(30);
      expect(30 * 60 * 1000).toBeGreaterThan(RUN_STALE_MS);
    }
    // Both writing slots and the digest fall in ONE UTC day, in that order.
    const hours = [...WRITING_FIRINGS.map((f) => Number(f.schedule.split(' ')[1])), 12];
    expect([...hours].sort((a, b) => a - b)).toEqual(hours);
  });

  it('the cron paths are the two route files, and the routes are nodejs + force-dynamic with an explicit maxDuration', () => {
    expect(WRITER_CRON_PATH).toBe('/api/cron/blog-automation');
    expect(DIGEST_CRON_PATH).toBe('/api/cron/blog-digest');
    for (const file of [WRITER_ROUTE, DIGEST_ROUTE]) {
      const src = read(file);
      expect(src).toContain("export const runtime = 'nodejs';");
      expect(src).toContain("export const dynamic = 'force-dynamic';");
      expect(src).toMatch(/export const maxDuration = \d+;/);
      expect(src).toMatch(/export async function GET\(/);
      expect(src).not.toMatch(/export async function POST/);
    }
    const writerMax = Number(/export const maxDuration = (\d+);/.exec(read(WRITER_ROUTE))![1]);
    expect(writerMax).toBe(300);
    expect(writerMax * 1000).toBeGreaterThan(150_000 + HEADER_IMAGE_BUDGET_MS + 10_000);
  });
});

describe('the production lock and the secret', () => {
  it('both routes authorize as the FIRST statement of GET, before any read, and refuse with the helper status', () => {
    for (const file of [WRITER_ROUTE, DIGEST_ROUTE]) {
      const src = read(file);
      const body = src.slice(src.indexOf('export async function GET('));
      const firstStatement = body.slice(body.indexOf('{') + 1).trimStart();
      expect(firstStatement.startsWith('const auth = authorizeCronRequest({')).toBe(true);
      expect(body).toContain('if (auth.ok === false) {');
      expect(body).toContain('{ status: auth.status }');
      expect(body.indexOf('authorizeCronRequest')).toBeLessThan(body.indexOf('serverSanityClient') === -1 ? body.length : body.indexOf('serverSanityClient'));
    }
  });

  it('CRON_SECRET is read only by the two cron routes, and never logged', () => {
    const readers = nonTest.filter((f) => /process\.env\.CRON_SECRET/.test(read(f)));
    expect(readers.sort()).toEqual([DIGEST_ROUTE, WRITER_ROUTE].sort());
    for (const f of readers) {
      const src = read(f);
      // No console call on a line that mentions the secret.
      expect(src.split('\n').filter((l) => /console\./.test(l) && /CRON_SECRET|cronSecret|authorization/.test(l))).toEqual([]);
    }
    const auth = read('lib/blog-automation/scheduler-auth.ts');
    expect(auth).toContain("import { PRODUCTION_HOST, siteUrlHost } from '../seo/indexing-policy';");
    expect(auth).toContain('timingSafeEqual');
    expect(auth).not.toMatch(/console\./);
    expect(auth).not.toMatch(/process\.env/);
  });

  it('the lock decides by the host of NEXT_PUBLIC_SITE_URL and spells no host itself', () => {
    const auth = read('lib/blog-automation/scheduler-auth.ts');
    expect(auth).toContain('host !== PRODUCTION_HOST');
    expect(auth).not.toMatch(/perfectimprints\.com/);
    expect(auth).not.toMatch(/process\.env\.VERCEL_ENV/);
  });
});

describe('the switches are read live, and blank means on and draft', () => {
  it('scheduler-settings reads with cache: no-store and never through getSiteSettings', () => {
    const src = read('lib/blog-automation/scheduler-settings.ts');
    expect(src).toContain("{ cache: 'no-store' }");
    expect(src).not.toMatch(/import[^;]*getSiteSettings/);
    expect(src).not.toMatch(/getSiteSettings\(\)\s*;/);
    expect(src).toContain('resolveBlogAutomation(raw ?? {})');
  });

  it('the schema fields carry no initialValue, and the resolver treats blank as running and draft', () => {
    const schema = read('sanity/schemas/singletons/global-settings.ts');
    const paused = schema.slice(schema.indexOf("name: 'paused'"), schema.indexOf("name: 'publishMode'"));
    const mode = schema.slice(schema.indexOf("name: 'publishMode'"), schema.indexOf("name: 'publishMode'") + 1200);
    expect(paused).not.toContain('initialValue');
    expect(mode).not.toContain('initialValue');
    expect(mode).toContain("value: 'draft'");
    expect(mode).toContain("value: 'publish'");
    const resolver = read('lib/sanity/queries/global-settings.ts');
    expect(resolver).toContain('paused: raw?.paused === true,');
    expect(resolver).toContain('publishMode: publishModeOf(raw?.publishMode),');
  });
});

describe('the run log', () => {
  it('is a registered, read-only document type with the claim on a fixed id', () => {
    expect(read('sanity/schemas/index.ts')).toContain('blogAutomationRun,');
    const schema = read('sanity/schemas/documents/blog-automation-run.ts');
    expect(schema).toContain("name: 'blogAutomationRun'");
    expect(schema).toContain('readOnly: true');
    const log = read('lib/blog-automation/run-log.ts');
    expect(log).toContain('await client.create(fresh);');
    expect(log).toContain('.ifRevisionId(existing._rev)');
    expect(RUN_STALE_MS).toBe(10 * 60 * 1000);
    expect(read('sanity/desk-structure.ts')).toContain("S.documentTypeList('blogAutomationRun')");
  });
});

describe('the choice and the generation', () => {
  it('the scheduler chooses through spaceTopics at gap 7 and look-ahead 4, product rule first', () => {
    expect(PRODUCT_SPACING_GAP).toBe(7);
    expect(SHAPE_LOOKAHEAD).toBe(4);
    const choose = read('lib/blog-automation/choose-topic.ts');
    expect(choose).toContain("from './topic-spacing'");
    expect(choose).toContain('const picked = spaceTopics(window, {');
    expect(choose).toContain('limit: 1,');
    // Shapes are measured only for the candidates the product rule let through.
    expect(choose.indexOf('candidates.push(entry)')).toBeLessThan(choose.indexOf('c.depth = await deps.depthFor('));
  });

  it('the real deps create through the ONE generation function with the measured depth, and publish in one transaction with the date stamped', () => {
    const deps = read('lib/blog-automation/scheduler-deps.ts');
    expect(deps).toContain('draftModule.createBlogDraftFromTopic({');
    expect(deps).toContain('depth: chosen.depth,');
    expect(deps).toContain("template: 'auto',");
    expect(deps).toContain('client.transaction().createOrReplace(published).delete(created.draftId).commit()');
    expect(deps).toContain('publishDate: now.toISOString()');
    expect(deps).not.toMatch(/_type:\s*'blogPost'/);
    const creator = read('lib/blog-automation/create-blog-draft.ts');
    expect(creator).toContain('...(opts.depth ? { depth: opts.depth } : {}),');
  });

  it('the scheduler module imports no next/* and no server-only module statically', () => {
    for (const f of ['lib/blog-automation/scheduler.ts', 'lib/blog-automation/choose-topic.ts', 'lib/blog-automation/run-log.ts', 'lib/blog-automation/digest.ts', 'lib/blog-automation/orphan-sweep.ts', 'lib/blog-automation/run-cost.ts', 'lib/blog-automation/schedule.ts']) {
      const src = read(f);
      const imports = src.match(/^import .* from '[^']+';$/gm) ?? [];
      expect(imports.filter((i) => /from 'next\//.test(i) || /site-wide-hidden|related-products|generate-blog-post'|create-blog-draft'(?!.*type)/.test(i) && !/^import type/.test(i)), f).toEqual([]);
    }
  });

  it('every failure stage is recorded and the publish failure keeps the draft id', () => {
    const src = read('lib/blog-automation/scheduler.ts');
    for (const stage of ["fail('choose'", "fail('generate'", "fail('publish'"]) expect(src).toContain(stage);
    expect(src).toContain("return fail('publish', err, created.draftId);");
  });
});

describe('the untouched modules still say what they said', () => {
  it('COMPARISON_IN_ROTATION stays false, the list floor 5, the title ceiling 75, the image budget 90 s, the image cap 20', () => {
    expect(COMPARISON_IN_ROTATION).toBe(false);
    expect(LIST_IDEAS_MIN).toBe(5);
    expect(TITLE_MAX_CHARS).toBe(75);
    expect(HEADER_IMAGE_BUDGET_MS).toBe(90_000);
    expect(BLOG_IMAGE_AI_DAILY_CAP).toBe(20);
  });

  it('the generator keeps its links ceiling, its deadline and the Pro image model', () => {
    const gen = read('lib/blog-automation/generate-blog-post.ts');
    expect(gen).toContain('export const INTERNAL_LINKS_PER_POST = 6;');
    expect(gen).toContain('export const BLOG_AI_TIMEOUT_MS = 150_000;');
    expect(read('lib/ai/gemini.ts')).toContain("export const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image';");
  });

  it('the files this ticket did not own are not imported by the route in a way that could change them', () => {
    const writer = read(WRITER_ROUTE);
    expect(writer).not.toContain('category-resolver');
    expect(writer).not.toContain('resolve-header-image');
  });
});

describe('the orphan sweep', () => {
  it('is dry run by default everywhere: the script needs --commit, the digest needs BLOG_ORPHAN_SWEEP_COMMIT=true', () => {
    const script = read('scripts/blog-automation/sweep-orphan-headers.ts');
    expect(script).toContain("const commit = args.includes('--commit') && !args.includes('--dry-run');");
    expect(read(DIGEST_ROUTE)).toContain("commit: process.env.BLOG_ORPHAN_SWEEP_COMMIT === 'true'");
    const sweep = read('lib/blog-automation/orphan-sweep.ts');
    expect(sweep).toContain('if (!opts.commit) return report;');
    expect(sweep.indexOf('REFERENCE_COUNT_QUERY, { id: asset._id }')).toBeLessThan(sweep.indexOf('await client.delete(asset._id)'));
    expect(sweep).toContain("from './discard-header-image'");
  });
});

describe('no em dash in the files this ticket wrote', () => {
  it('none', () => {
    const files = [
      WRITER_ROUTE,
      DIGEST_ROUTE,
      'vercel.json',
      'lib/blog-automation/scheduler-auth.ts',
      'lib/blog-automation/schedule.ts',
      'lib/blog-automation/run-log.ts',
      'lib/blog-automation/scheduler-settings.ts',
      'lib/blog-automation/choose-topic.ts',
      'lib/blog-automation/scheduler.ts',
      'lib/blog-automation/scheduler-deps.ts',
      'lib/blog-automation/run-cost.ts',
      'lib/blog-automation/digest.ts',
      'lib/blog-automation/orphan-sweep.ts',
      'lib/blog-automation/quantity-rule.ts',
      'lib/blog-automation/title-fit.ts',
      'sanity/schemas/documents/blog-automation-run.ts',
      'scripts/blog-automation/sweep-orphan-headers.ts',
    ];
    const emDash = String.fromCharCode(0x2014);
    for (const f of files) expect(read(f).includes(emDash), f).toBe(false);
  });
});
