/**
 * AUTO-220 Part 7: the compose stack is GONE, not switched off, and nothing
 * left behind can write over a picture Patrick uploaded.
 *
 * AUTO-209 to AUTO-212 put the post's title on the picture in code: a layout
 * vision call, an inlined font, six looks, an untitled copy of every picture
 * and a "Redraw title" button. The image model draws the title now, so all of
 * it was deleted. Code that once drew on images is a hazard around Patrick's
 * own uploads (AUTO-212 found the redraw button offered over two of them), so
 * these tests fail if any of it comes back.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const SKIP = new Set(['node_modules', '.next', '.git', 'tmp', 'data', 'public', '.vercel', 'docs', '.sanity', 'dist']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}
const rel = (f: string) => f.slice(ROOT.length + 1).replace(/\\/g, '/');
const sources = ['app', 'components', 'lib', 'sanity', 'scripts'].flatMap((d) => walk(join(ROOT, d)));
/** Everything that runs: the source without its tests. */
const running = sources.filter((f) => !/\.test\.tsx?$/.test(f));

const RETIRED_FILES = [
  'lib/blog-automation/compose-title.tsx',
  'lib/blog-automation/title-layout.ts',
  'lib/blog-automation/title-shapes.ts',
  'lib/blog-automation/title-font.ts',
  'lib/blog-automation/title-font-metrics.ts',
  'lib/blog-automation/title-font-500.ts',
  'lib/blog-automation/title-font-500-metrics.ts',
  'lib/blog-automation/title-font.OFL.txt',
  'lib/blog-automation/title-logo.ts',
  'lib/blog-automation/retitle-header-image.ts',
  'sanity/actions/redraw-blog-title.tsx',
  'scripts/blog-automation/generate-title-font.mjs',
  'scripts/blog-automation/generate-title-logo.mjs',
  // Their tests went with them.
  'lib/blog-automation/title-layout.test.ts',
  'lib/blog-automation/title-on-picture.test.ts',
  'lib/blog-automation/painted-band.test.ts',
  'lib/blog-automation/product-shot.test.ts',
  'lib/blog-automation/retitle-header-image.test.ts',
  'lib/blog-automation/title-logo.test.ts',
  'sanity/actions/redraw-blog-title.test.tsx',
];

describe('the compose stack is deleted', () => {
  it('none of its files exists', () => {
    expect(RETIRED_FILES.filter((f) => existsSync(join(ROOT, f)))).toEqual([]);
  });

  it('nothing imports a deleted module', () => {
    const gone = /from ['"][^'"]*(compose-title|title-layout|title-shapes|title-font|title-logo|retitle-header-image|redraw-blog-title)['"]|import\(['"][^'"]*(compose-title|title-layout|title-shapes|title-font|title-logo|retitle-header-image)['"]\)/;
    expect(sources.filter((f) => gone.test(readFileSync(f, 'utf8'))).map(rel)).toEqual([]);
  });

  it('no running code names a piece of it: the looks, the title room, the layout call, the painted band, the untitled copy as something written', () => {
    const names = /composeTitledHeader|composeTitle\b|chooseTitleLayout|askTitleLayout|planTitle\b|titleRoomSideFor|TitleRoomSide|plannerRoomRule|imageRoomRule|paintedBandIn|paintedBand\b|TITLE_ROTATION|lookOrderFor|storedTreatmentOf|retitleHeaderImage|retitleRequestBody|redrawBlogTitle|HeaderImprints|REFERENCE_IMPRINT_RULE|PRODUCT_SETTING_RULE/;
    expect(running.filter((f) => names.test(readFileSync(f, 'utf8'))).map(rel)).toEqual([]);
  });

  it('the engine no longer WRITES the old fields: nothing sets untitledImage or titleTreatment on an image value', () => {
    const writers = running.filter((f) => /\.(untitledImage|titleTreatment)\s*=[^=]|untitledImage:\s*\{|titleTreatment:\s*JSON/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(writers).toEqual([]);
    // The schema still DECLARES them (hidden, read only), so a post made then opens with no "unknown field" warning.
    const schema = read('sanity/schemas/documents/blog-post.ts');
    expect(schema).toContain("{ name: 'untitledImage', type: 'image', title: 'Older picture without its title', readOnly: true, hidden: () => true }");
    expect(schema).toContain("{ name: 'titleTreatment', type: 'string', title: 'Older title placement', readOnly: true, hidden: () => true }");
  });

  it('code draws NO text on a picture any more: the only renderer left is the mark stamp, and it loads no font', () => {
    const renderers = running.filter((f) => /from 'next\/og'/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(renderers).toEqual(['lib/blog-automation/stamp-mark.tsx']);
    expect(read('lib/blog-automation/stamp-mark.tsx')).not.toMatch(/fonts:\s*\[|fontFamily|title-font/);
    // No font file is carried for it either.
    const fonts = ['lib', 'public', 'scripts'].flatMap((d) => (existsSync(join(ROOT, d)) ? readdirSync(join(ROOT, d), { recursive: true }) : []).map(String)).filter((n) => /title-font|inter.*\.(woff2?|ttf|otf)$/i.test(n));
    expect(fonts).toEqual([]);
  });
});

describe('the Redraw title button is gone', () => {
  it('is not registered in the Studio, and the two instruction buttons are', () => {
    const config = read('sanity/sanity.config.ts');
    expect(config).not.toMatch(/redrawBlogTitle|redraw-blog-title/);
    expect(config).toContain("import { changeBlogImageWithInstruction, newBlogImageWithInstruction } from './actions/blog-image-instruction';");
    expect(config).toContain('changeBlogImageWithInstruction,');
    expect(config).toContain('newBlogImageWithInstruction,');
  });

  it('the route has no redraw path: a retired request is refused before anything else is read', () => {
    const route = read('app/api/sanity/generate-blog-image/route.ts');
    expect(route).not.toContain('retitleHeaderImage');
    const refuseAt = route.indexOf("if (body.source === 'retitle') {");
    expect(refuseAt).toBeGreaterThan(-1);
    expect(route.slice(refuseAt, refuseAt + 500)).toContain('{ status: 400 }');
    expect(refuseAt).toBeLessThan(route.indexOf('serverSanityClient()'));
    expect(refuseAt).toBeLessThan(route.indexOf('resolveHeaderImage('));
  });

  it('the Studio warning about an old title sends him to a NEW picture, and only when the picture on the post is the engine\'s own', () => {
    const helper = read('lib/blog/header-image.ts');
    expect(helper).not.toMatch(/Redraw title/);
    expect(helper).toContain('press "Generate another header image" for a new picture with the current title');
    const schema = read('sanity/schemas/documents/blog-post.ts');
    expect(schema).toContain('if (!isGeneratedTitledHeaderRef(image?.asset?._ref)) return true;');
    expect(schema).not.toMatch(/redraw/i);
  });
});

describe("NOTHING CAN WRITE OVER A PICTURE PATRICK UPLOADED", () => {
  it('there is exactly ONE place a header picture is uploaded, and it marks what it uploads', () => {
    const uploaders = running.filter((f) => /assets\.upload\(\s*'image'/.test(readFileSync(f, 'utf8'))).map(rel);
    // The header chain, and the three unrelated importers that put images where an editor asked (bulk product upload, portfolio import, blog migration).
    expect(uploaders.filter((f) => f.startsWith('lib/blog-automation/'))).toEqual(['lib/blog-automation/resolve-header-image.ts']);
    expect(read('lib/blog-automation/resolve-header-image.ts')).toContain('source: { name: BLOG_HEADER_ASSET_SOURCE, id: filename }');
  });

  it('the chain itself never writes a blog post: it returns a value, and only a button Patrick presses or a NEW draft puts it on one', () => {
    const chain = read('lib/blog-automation/resolve-header-image.ts');
    expect(chain).not.toMatch(/\.patch\(|\.createOrReplace\(|\.create\(|client\.delete\(/);
    const route = read('app/api/sanity/generate-blog-image/route.ts');
    expect(route).not.toMatch(/\.patch\(|\.createOrReplace\(|\.create\(|\.delete\(/);
  });

  it('the only code that sets headerImage on an existing post is a Studio button, each behind the typing-window check, and the soak rule behind its own guard', () => {
    const setters = running.filter((f) => /set:\s*\{\s*headerImage:|headerImage:\s*outcome\.image/.test(readFileSync(f, 'utf8'))).map(rel).sort();
    // Ali, 2026-11-15: the soak over existing drafts is the ONE writer beside the buttons. Its rule is pure
    // (soak-drafts.ts) and proven in soak-drafts.test.ts; what is pinned here is that the value is only ever
    // handed out AFTER the draft, read again, is still a never-published draft the engine made whose picture
    // the site generated, and still points at the picture that was to be replaced.
    expect(setters).toEqual(['lib/blog-automation/soak-drafts.ts', 'sanity/actions/blog-image-request.ts']);
    const soak = read('lib/blog-automation/soak-drafts.ts');
    const handedOut = soak.indexOf('set: { headerImage: made }');
    expect(soak.match(/set: \{ headerImage: made \}/g)).toHaveLength(1);
    for (const guard of [
      'const verdict = soakDraftVerdict(now);',
      'if (verdict.eligible === false) {',
      'if (!oldRef || refOf(now.headerImage) !== oldRef) {',
      "if (typeof now._rev !== 'string' || !now._rev) return refuse(",
    ]) {
      expect(soak.indexOf(guard), guard).toBeGreaterThan(-1);
      expect(soak.indexOf(guard), guard).toBeLessThan(handedOut);
    }
    for (const rule of ['if (doc.publishedCopyExists !== false) {', 'if (!isGeneratedHeaderAsset(doc.headerAsset)) {', "if (typeof topic !== 'string' || !topic.trim()) {"]) {
      expect(soak, rule).toContain(rule);
    }
    // One caller, the script, which applies the plan as one pinned patch (soak-drafts.test.ts reads the script).
    const planCallers = running.filter((f) => /\bsoakWritePlan\(\{/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(planCallers).toEqual(['scripts/blog-automation/soak-draft-headers.ts']);
    for (const action of ['sanity/actions/generate-blog-image-with-ai.tsx', 'sanity/actions/blog-image-instruction.tsx', 'sanity/actions/generate-blog-with-ai.tsx']) {
      const src = read(action);
      expect(src, action).toContain('patchForOutcome(');
      // An image changed during the wait is kept: the signature is compared before the patch.
      const patchAt = src.indexOf('patch.execute([{ set: toPatch.set }');
      expect(patchAt, action).toBeGreaterThan(-1);
      expect(src.lastIndexOf('headerImageSignature(', patchAt), action).toBeGreaterThan(-1);
    }
  });

  it('"Change this picture" is refused on the server unless the picture ON the post carries the site\'s upload marker', () => {
    const base = read('lib/blog-automation/header-edit-base.ts');
    expect(base).toContain('if (!current || current.source?.name == null || !isGeneratedHeaderAsset(current)) {');
    const route = read('app/api/sanity/generate-blog-image/route.ts');
    const loadAt = route.indexOf('await loadHeaderEditBase(');
    expect(loadAt).toBeGreaterThan(-1);
    expect(loadAt).toBeLessThan(route.indexOf('await resolveHeaderImage('));
    expect(route.slice(loadAt, loadAt + 400)).toContain('{ status: 409 }');
  });

  it('a picture is only ever DELETED through the one guarded rule: generated by the site, and referenced by nothing', () => {
    // A Sanity delete by id (`client.delete(...)`). The scheduler's publish transaction deletes the DRAFT it has
    // just published as one step of that transaction, which is a different call and no picture.
    const deleters = running
      .filter((f) => /lib\/blog-automation\/|sanity\/(actions|components)\//.test(rel(f)))
      .filter((f) => /\bclient\.delete\(/.test(readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    // discard-header-image.ts is the rule; orphan-sweep.ts applies the same rule weekly.
    expect(deleters).toEqual(['lib/blog-automation/discard-header-image.ts', 'lib/blog-automation/orphan-sweep.ts']);
    expect(read('lib/blog-automation/orphan-sweep.ts')).toContain("from './discard-header-image'");
    const rule = read('lib/blog-automation/discard-header-image.ts');
    expect(rule).toContain("if (!isGeneratedHeaderAsset(facts.asset)) return { deleted: false, assetId: id, reason: 'not-generated' };");
    expect(rule).toContain("if ((facts.references ?? 0) > 0) return { deleted: false, assetId: id, reason: 'referenced' };");
  });

  it('the scheduler only makes NEW drafts: the image step is reached through the draft creator and the one route, nowhere else', () => {
    const callers = running.filter((f) => /\bresolveHeaderImage\(/.test(readFileSync(f, 'utf8'))).map(rel).sort();
    expect(callers).toEqual(['app/api/sanity/generate-blog-image/route.ts', 'lib/blog-automation/resolve-draft-fields.ts', 'lib/blog-automation/resolve-header-image.ts']);
    const creator = read('lib/blog-automation/create-blog-draft.ts');
    expect(creator.split('.create(').length).toBe(2);
    expect(creator).not.toMatch(/\.patch\(/);
  });
});

describe('no em dash in the files this ticket wrote', () => {
  it('none', () => {
    const files = [
      'lib/ai/openai-image.ts',
      'lib/blog-automation/openai-image-usage.ts',
      'lib/blog-automation/header-brief.ts',
      'lib/blog-automation/brand-list.ts',
      'lib/blog-automation/brand-screen.ts',
      'lib/blog-automation/mark-placement.ts',
      'lib/blog-automation/stamp-mark.tsx',
      'lib/blog-automation/header-mark.ts',
      'lib/blog-automation/header-edit-base.ts',
      'lib/blog-automation/resolve-header-image.ts',
      'lib/blog-automation/header-image.ts',
      'lib/blog/post-seo.ts',
      'lib/blog/header-image.ts',
      'app/api/sanity/generate-blog-image/route.ts',
      'lib/blog-automation/header-edit-base.ts',
      'sanity/actions/blog-image-instruction.tsx',
      'sanity/actions/blog-image-request.ts',
      'sanity/actions/generate-blog-image-with-ai.tsx',
      'scripts/blog-automation/generate-header-mark.mjs',
    ];
    const emDash = String.fromCharCode(0x2014);
    for (const f of files) expect(read(f).includes(emDash), f).toBe(false);
  });
});
