/**
 * FIX-872: nothing may construct a product-strip entry except the shared
 * write helper, and this file is what enforces it.
 *
 * WHY. FIX-871 fixed the bug (every AI writer stored a Product Page as a bare
 * `{_type:'blogProduct', sku:'custom-<id>'}` that the render side could not
 * resolve) by routing all five writers through
 * lib/products/strip-entry-write.ts. That fixes the five writers that exist
 * today. Nothing stopped a sixth writer, six months from now, from typing the
 * literal by hand again: it would look right in review, pass typecheck, pass
 * the suite, and fail silently in production exactly as before. The FIX-871
 * test's own literal scan was a start (one regex, one key order, six
 * directories); this file replaces its reach without weakening it.
 *
 * WHAT IT SCANS. Every .ts/.tsx under app/, components/, lib/, sanity/ and
 * scripts/ (the whole tree, not a directory list: the FIX-871 scan skipped
 * scripts/ai-pipeline and scripts/quick-quote, and both held the old literal),
 * with comments stripped and string literals kept, excluding test files and
 * the helper itself. Schema files stay IN scope on purpose: a schema names the
 * type as `name: 'blogProduct'` / `type: 'blogProduct'`, never as a `_type:`
 * key, so it does not fire, while a schema `initialValue` that built the
 * shape WOULD be a writer and should.
 *
 * WHAT IT CATCHES (each proven below against a fixture snippet):
 *   - the object literal `_type: 'blogProduct'` / `'relatedProductRef'` in any
 *     key order, any quote style (single, double, template), quoted key,
 *     no spaces, `as const`, and the base object of a spread;
 *   - a local variable holding the type name (`const T = 'blogProduct'`),
 *     which is only ever declared to build the shape;
 *   - any use of the helper's exported `STRIP_REF_TYPE` constant outside the
 *     helper (it exists for the `typeof` type and for tests, not for writers);
 *   - a property assignment `x._type = 'blogProduct'`.
 *
 * WHAT IT DELIBERATELY DOES NOT CATCH (the known holes, written down):
 *   - the type name assembled from pieces (`'blog' + 'Product'`, a template
 *     with a placeholder), or read from a constant imported from anywhere
 *     other than the helper: no text scan can follow that;
 *   - an entry cloned from one READ out of Sanity (`{...existing, sku}`): the
 *     shape came from storage, not from the writer, and it is the shape the
 *     render side already understood;
 *   - an entry written with NO `_type` at all, or with a `_type` the schema
 *     does not know: Studio marks those invalid and the projection never
 *     matches them, so they fail visibly rather than silently;
 *   - a GROQ string that spells the key as `"_type": "blogProduct"` inside an
 *     object projection (none exists; the projections key on
 *     `_type == 'blogProduct'` and `defined(_ref)`, which are not matched).
 *
 * WHAT IT OVER-REPORTS, on purpose: a type-position literal such as
 * `Extract<Entry, { _type: 'blogProduct' }>` would fire. None exists today
 * (interface members end in `;` and are skipped). If one is ever needed, use
 * the exported entry types (`StripSkuWriteEntry`, `StripSkuOrManualEntry`)
 * or narrow with `entry._type === 'blogProduct'`, which is not matched.
 *
 * A guard that cannot fail is worse than none. Two proofs live in this file:
 * the scanner runs against fixture snippets of every shape above and must
 * find each one, and it runs against the helper's own source and must find
 * the two constructions that are allowed to exist. FIX-872's report also
 * records the real-tree proof: the old literal reintroduced at one call site,
 * the repo scan failing, the site restored, the scan passing.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..', '..');
/** Line endings normalised: the working trees are CRLF on Windows. */
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** Source without `//` and block comments; string and template literals are kept intact. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        // Keep the newlines so a finding's line number matches the real file.
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        i += 1;
      }
      out += quote;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const HELPER = 'lib/products/strip-entry-write.ts';
const SCAN_ROOTS = ['app', 'components', 'lib', 'sanity', 'scripts'];
const TYPE_NAMES = 'blogProduct|relatedProductRef';

export type FindingKind = 'literal' | 'constant' | 'helper-constant' | 'assignment';
export interface Finding {
  line: number;
  kind: FindingKind;
  text: string;
}

/**
 * The shapes, one regex each, applied per line of comment-stripped code.
 * `(?!\s*;)` after a literal skips an interface / type-alias member, which
 * is a declaration of the shape, not a construction of it. `_type?:` never
 * matches because the key pattern allows no `?`.
 */
const LITERAL = new RegExp(
  `(?<![\\w$.])['"]?_type['"]?\\s*:\\s*(['"\`])(${TYPE_NAMES})\\1(?!\\s*;)`,
);
const CONSTANT = new RegExp(
  `\\b(?:const|let|var)\\s+[\\w$]+\\s*(?::[^=]+)?=\\s*(['"\`])(${TYPE_NAMES})\\1`,
);
const HELPER_CONSTANT = /\bSTRIP_REF_TYPE\b/;
const ASSIGNMENT = new RegExp(`\\._type\\s*=(?!=)\\s*(['"\`])(${TYPE_NAMES})\\1`);

/** Every construction of a strip entry in one file's comment-stripped source. */
export function findStripEntryConstructions(code: string): Finding[] {
  const out: Finding[] = [];
  code.split('\n').forEach((raw, idx) => {
    const text = raw.trim();
    const line = idx + 1;
    if (LITERAL.test(raw)) out.push({ line, kind: 'literal', text });
    if (CONSTANT.test(raw)) out.push({ line, kind: 'constant', text });
    if (HELPER_CONSTANT.test(raw)) out.push({ line, kind: 'helper-constant', text });
    if (ASSIGNMENT.test(raw)) out.push({ line, kind: 'assignment', text });
  });
  return out;
}

function filesUnder(dir: string): string[] {
  const base = resolve(root, dir);
  return (readdirSync(base, { recursive: true }) as string[])
    .filter((name) => ['.ts', '.tsx'].includes(extname(name)))
    .map((name) => join(dir, name).split(sep).join('/'))
    .filter((rel) => !rel.includes('/node_modules/') && !rel.includes('/.next/'));
}

const isTest = (rel: string) => /\.test\.tsx?$/.test(rel);

// ---------------------------------------------------------------------------
// Proof 1: the scanner finds every shape it claims to, and none it must not.
// ---------------------------------------------------------------------------

describe('the scanner catches every way a person might write the shape', () => {
  const mustFire: [string, string][] = [
    ['the FIX-870 literal', "products.push({ _type: 'blogProduct', _key: k, sku: p.sku });"],
    ['a different key order', "return { sku, _key: nextKey('rp'), _type: 'blogProduct' };"],
    ['double quotes', 'const e = { _type: "blogProduct", sku };'],
    ['a template literal', 'const e = { _type: `blogProduct`, sku };'],
    ['a quoted key', "const e = { '_type': 'blogProduct', sku };"],
    ['no spaces', "arr.push({_type:'blogProduct',sku});"],
    ['as const', "const e = { _type: 'blogProduct' as const, sku };"],
    ['the base object of a spread', "const base = { _type: 'blogProduct' }; out.push({ ...base, sku });"],
    ['the reference shape', "return { _type: 'relatedProductRef', _key: k, _ref: id };"],
    ['a local constant holding the type name', "const ENTRY_TYPE = 'blogProduct';"],
    ['a typed local constant holding the type name', "const t: string = 'relatedProductRef';"],
    ["the helper's exported constant used elsewhere", 'return { _type: STRIP_REF_TYPE, _key, _ref };'],
    ['a property assignment', "entry._type = 'blogProduct';"],
    ['a multi-line literal (the _type line alone)', "  _type: 'blogProduct',"],
  ];
  it.each(mustFire)('fires on %s', (_label, snippet) => {
    expect(findStripEntryConstructions(stripComments(snippet)).length).toBeGreaterThan(0);
  });

  const mustNotFire: [string, string][] = [
    ['an interface member', "export interface X { _type: 'blogProduct'; sku: string }"],
    ['an optional interface member', "  _type?: 'blogProduct';"],
    ['a read of an existing entry', "if (entry._type === 'blogProduct') { use(entry.sku); }"],
    ['a loose comparison', "const skus = list.filter((p) => p._type == 'blogProduct');"],
    ['the GROQ projection condition', "  _type == 'blogProduct' => { _type, _key, sku, title, image, url },"],
    ['a GROQ path filter', 'relatedProducts[_type == "blogProduct"].sku'],
    ['the schema type registration', "export const blogProduct = defineType({ name: 'blogProduct', title: 'Product', type: 'object' });"],
    ['the schema array member', "defineArrayMember({ type: 'blogProduct' }),"],
    ['the schema reference member name', "  name: 'relatedProductRef',"],
    ['a comment describing the shape', "// stored as { _type: 'blogProduct', _key, sku } for a Geiger product"],
    ['a block comment describing the shape', "/* 2. `{ _type: 'relatedProductRef', _key, _ref }` for one of Patrick's own */"],
    ['another document type', "const doc = { _type: 'blogProducts', _key: k, products };"],
    ['a different `_type` value', "sections.push({ _type: 'productStrip', _key: nextKey('strip') });"],
    ['a mention in a user-facing string', "throw new Error('expected a blogProduct entry');"],
  ];
  it.each(mustNotFire)('stays quiet on %s', (_label, snippet) => {
    expect(findStripEntryConstructions(stripComments(snippet))).toEqual([]);
  });

  it('reports the line number, so an offender is found at once', () => {
    const code = "const a = 1;\nconst b = 2;\nout.push({ _type: 'blogProduct', sku });\n";
    expect(findStripEntryConstructions(code)).toEqual([
      { line: 3, kind: 'literal', text: "out.push({ _type: 'blogProduct', sku });" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Proof 2: the helper itself, scanned with the same function, is NOT quiet.
// If this ever passes with zero findings the scanner has stopped seeing the
// shape as the helper really writes it, and the repo scan below is proving
// nothing.
// ---------------------------------------------------------------------------

describe('the scanner sees the shape as the helper actually writes it', () => {
  const findings = findStripEntryConstructions(stripComments(read(HELPER)));

  it('finds the SKU literal and the reference constant in the helper', () => {
    expect(findings.map((f) => f.kind).sort()).toEqual(
      ['constant', 'helper-constant', 'helper-constant', 'helper-constant', 'literal'].sort(),
    );
    expect(findings.some((f) => f.text.includes("_type: 'blogProduct', _key: key, sku"))).toBe(true);
    expect(findings.some((f) => f.text.includes('_type: STRIP_REF_TYPE, _key: key, _ref: targetId'))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// The repo scan.
// ---------------------------------------------------------------------------

describe('no source file outside the helper constructs a strip entry (FIX-872)', () => {
  const files = SCAN_ROOTS.flatMap(filesUnder).filter((rel) => !isTest(rel) && rel !== HELPER);

  it('scans a real, non-trivial set of source files, including every known writer', () => {
    expect(files.length).toBeGreaterThan(300);
    for (const writer of [
      'lib/portable-text/build-blog-body.ts',
      'app/api/sanity/generate-page/route.ts',
      'sanity/actions/generate-video-with-ai.tsx',
      'sanity/actions/generate-landing-with-ai.tsx',
      'scripts/seed/seed-landing-pages.ts',
      'scripts/migrations/repair-strip-product-refs.ts',
      'scripts/ai-pipeline/verify-blog-engine.ts',
      'scripts/quick-quote/verify-q170.ts',
      'sanity/schemas/objects/blog-products.ts',
    ]) {
      expect(files, writer).toContain(writer);
    }
  });

  it('finds no construction of a strip entry anywhere but the helper', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      for (const f of findStripEntryConstructions(stripComments(read(rel)))) {
        offenders.push(`${rel}:${f.line} [${f.kind}] ${f.text}`);
      }
    }
    expect(
      offenders,
      'A strip entry is constructed outside lib/products/strip-entry-write.ts. ' +
        'Call stripEntriesForSuggestions / stripEntryForSuggestion instead: the render side ' +
        '(lib/sanity/strip-product-entries.ts + resolveStripCards) reads exactly the two shapes ' +
        'the helper writes, and a hand-written shape is how FIX-870 shipped and stayed hidden for two months.',
    ).toEqual([]);
  });

  it('every writer that stores a strip entry imports the helper', () => {
    for (const writer of [
      'lib/portable-text/build-blog-body.ts',
      'app/api/sanity/generate-page/route.ts',
      'sanity/actions/generate-video-with-ai.tsx',
      'sanity/actions/generate-landing-with-ai.tsx',
      'scripts/seed/seed-landing-pages.ts',
      'scripts/migrations/repair-strip-product-refs.ts',
      'scripts/quick-quote/verify-q170.ts',
      'scripts/ai-pipeline/verify-blog-engine.ts',
    ]) {
      expect(stripComments(read(writer)), writer).toMatch(/strip-entry-write'/);
    }
  });

  it('the helper still imports nothing (the Studio bundle takes it as-is)', () => {
    expect(stripComments(read(HELPER))).not.toMatch(/^import /m);
  });

  it('no em dash in this file', () => {
    expect(read('lib/products/strip-entry-write-guard.test.ts')).not.toContain('\u2014');
  });
});
