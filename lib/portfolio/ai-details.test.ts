/**
 * PORT-170: the prompt Gemini is given, the check its answer passes through,
 * and the structural guards on the route and the Studio action.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_FILLER,
  PORTFOLIO_ALT_MAX_CHARS,
  PORTFOLIO_DESCRIPTION_MAX_CHARS,
  PORTFOLIO_TITLE_MAX_CHARS,
  buildPortfolioDetailsPrompt,
  clampText,
  hasUsableDetails,
  parsePortfolioAiDetails,
} from './ai-details';
import { PORTFOLIO_COLORS } from './colors';
import { PORTFOLIO_DECORATION_METHODS } from './decoration-methods';
import { PORTFOLIO_INDUSTRIES } from './industries';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
/** Source with comments removed, so a comment that NAMES a forbidden import does not trip an import check. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('buildPortfolioDetailsPrompt', () => {
  const { system, user } = buildPortfolioDetailsPrompt();

  it('lists every vocabulary value by importing the modules, never by restating them', () => {
    for (const v of PORTFOLIO_COLORS) expect(system).toContain(v);
    for (const v of PORTFOLIO_DECORATION_METHODS) expect(system).toContain(v);
    for (const v of PORTFOLIO_INDUSTRIES) expect(system).toContain(v);
    // The source of this module carries no vocabulary literal of its own.
    const src = read('lib/portfolio/ai-details.ts');
    for (const v of [...PORTFOLIO_DECORATION_METHODS, ...PORTFOLIO_INDUSTRIES]) {
      expect(src, `ai-details.ts spells out ${v}`).not.toContain(`'${v}'`);
    }
  });

  it('forbids naming the customer and inventing facts, and asks for JSON only', () => {
    expect(system).toMatch(/NEVER name the customer/);
    expect(system).toMatch(/Never state a quantity, a price, a date/);
    expect(system).toMatch(/Never invent/);
    expect(system).toMatch(/ONLY a JSON object/);
    expect(user).toMatch(/never name the customer/);
  });

  it('states the alt limit the schema enforces, in both halves of the prompt', () => {
    expect(PORTFOLIO_ALT_MAX_CHARS).toBe(160);
    expect(system).toContain(`at most ${PORTFOLIO_ALT_MAX_CHARS} characters`);
    expect(user).toContain('at most 160 characters');
    expect(system).toContain(`at most ${PORTFOLIO_DESCRIPTION_MAX_CHARS} characters`);
  });

  it('never asks for a client name', () => {
    expect(system).not.toMatch(/clientName/);
    expect(system).not.toMatch(/"client"/);
  });

  it('carries the buyer wording and B2B framing from CLAUDE.md Section 24', () => {
    for (const word of ['custom', 'personalized', 'logo', 'printed', 'branded', 'embroidered']) {
      expect(system).toContain(word);
    }
    expect(system).toMatch(/never consumer retail/);
  });

  // PORT-171: the things a buyer asks about a piece of decorated work.
  it('asks for the exact item type, the imprint location, the technique, the colour contrast and multiple views', () => {
    expect(system).toMatch(/EXACT item type/);
    expect(system).toMatch(/"snapback trucker cap" not "hat"/);
    expect(system).toMatch(/WHERE each decoration sits/);
    expect(system).toMatch(/left chest, full back, left sleeve/);
    expect(system).toMatch(/HOW it was applied/);
    expect(system).toMatch(/decoration COLOUR against the item colour/);
    expect(system).toMatch(/MORE THAN ONE view or colourway/);
    // The user turn repeats the ask, so a model that skims the system block still sees it.
    expect(user).toMatch(/where the decoration sits/);
    expect(user).toMatch(/more than one view or colourway/);
  });

  it('forbids padding: every filler phrase is named, sentences must be visible facts, the title is not repeated', () => {
    expect(DESCRIPTION_FILLER.length).toBeGreaterThanOrEqual(6);
    for (const f of DESCRIPTION_FILLER) expect(system).toContain(`"${f}"`);
    expect(system).toMatch(/NO PADDING/);
    expect(system).toMatch(/One true sentence beats two empty ones/);
    expect(system).toMatch(/Do not repeat the title in the description/);
    expect(system).toMatch(/Empty string when the photo shows nothing beyond what the title says/);
    expect(user).toMatch(/no padding/);
  });

  it('tells the model to describe rather than guess a technique, and not to copy a printed year', () => {
    expect(system).toMatch(/leave decorationMethods empty rather than guess/);
    expect(system).toMatch(/a date, a year, a location/);
    expect(system).toMatch(/even if one is printed on the item/);
  });
});

describe('parsePortfolioAiDetails', () => {
  const good = {
    title: 'Custom embroidered caps for a local business',
    alt: 'Tan and black trucker hat featuring custom dark stitching on the front panel.',
    description: 'Custom embroidered trucker hats for staff uniforms and giveaways.',
    colors: ['black', 'brown'],
    decorationMethods: ['embroidered'],
    industry: 'business-and-corporate',
  };

  it('passes a clean answer through unchanged', () => {
    const { details, dropped } = parsePortfolioAiDetails(good);
    expect(details).toEqual(good);
    expect(dropped).toEqual([]);
    expect(hasUsableDetails(details)).toBe(true);
  });

  it('drops a value outside a vocabulary and reports it, keeping the rest', () => {
    const { details, dropped } = parsePortfolioAiDetails({
      ...good,
      colors: ['navy', 'black', 'Brown'],
      decorationMethods: ['embroidered', 'heat transfer', 'screen printed'],
      industry: 'government',
    });
    expect(details.colors).toEqual(['black', 'brown']);
    expect(details.decorationMethods).toEqual(['embroidered']);
    expect(details.industry).toBeNull();
    expect(dropped).toEqual([
      'color: navy',
      'decoration: heat transfer',
      'decoration: screen printed',
      'industry: government',
    ]);
  });

  it('returns values in vocabulary order, each once', () => {
    const { details } = parsePortfolioAiDetails({
      ...good,
      colors: ['white', 'black', 'white', 'BLACK'],
    });
    expect(details.colors).toEqual(['black', 'white']);
  });

  it('cuts an over-long alt at a word boundary under 160 characters', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    expect(long.length).toBeGreaterThan(PORTFOLIO_ALT_MAX_CHARS);
    const { details } = parsePortfolioAiDetails({ ...good, alt: long });
    expect(details.alt.length).toBeLessThanOrEqual(PORTFOLIO_ALT_MAX_CHARS);
    expect(details.alt.endsWith(' ')).toBe(false);
    expect(long.startsWith(details.alt)).toBe(true);
  });

  it('caps the description and the title the same way', () => {
    const long = 'x'.repeat(50).split('').join(' ').repeat(12);
    const { details } = parsePortfolioAiDetails({ ...good, description: long, title: long });
    expect(details.description.length).toBeLessThanOrEqual(PORTFOLIO_DESCRIPTION_MAX_CHARS);
    expect(details.title.length).toBeLessThanOrEqual(PORTFOLIO_TITLE_MAX_CHARS);
  });

  it('never throws on garbage: missing fields, wrong types, a non-object', () => {
    for (const raw of [null, undefined, 'text', 42, [], { title: 7, colors: 'black', industry: 3 }]) {
      const { details, dropped } = parsePortfolioAiDetails(raw);
      expect(details.title).toBe(typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? '' : '');
      expect(Array.isArray(details.colors)).toBe(true);
      expect(Array.isArray(dropped)).toBe(true);
    }
    // A string where an array was expected is treated as one candidate.
    expect(parsePortfolioAiDetails({ colors: 'black' }).details.colors).toEqual(['black']);
    // Without a title and an alt the answer is unusable, and the route says so.
    expect(hasUsableDetails(parsePortfolioAiDetails({}).details)).toBe(false);
  });

  it('never produces a clientName key', () => {
    const { details } = parsePortfolioAiDetails({ ...good, clientName: 'Acme Fire Department' });
    expect(Object.keys(details)).not.toContain('clientName');
  });

  it('clampText collapses whitespace and trims trailing punctuation at the cut', () => {
    expect(clampText('  a   b  ', 10)).toBe('a b');
    expect(clampText('alpha beta, gamma', 11)).toBe('alpha beta');
    expect(clampText(12, 10)).toBe('');
  });
});

describe('PORT-170 structural guards', () => {
  const ROUTE = 'app/api/sanity/generate-portfolio/route.ts';
  const ACTION = 'sanity/actions/generate-portfolio-with-ai.tsx';
  const GEMINI = 'lib/ai/gemini.ts';

  it('the route sets an explicit maxDuration, reserves the cap before Gemini and validates through the shared parser', () => {
    const src = read(ROUTE);
    expect(src).toContain('export const maxDuration = 60;');
    expect(src).toContain("from '@/lib/portfolio/ai-details'");
    expect(src).toContain("from '@/lib/portfolio/ai-usage'");
    const reserveAt = src.indexOf('reservePortfolioAiCall(');
    const geminiAt = src.indexOf('generateJsonFromImage<');
    expect(reserveAt).toBeGreaterThan(-1);
    expect(geminiAt).toBeGreaterThan(reserveAt);
    expect(src).toContain('parsePortfolioAiDetails(');
    expect(src).toContain('buildPortfolioDetailsPrompt(');
  });

  it('the route writes no content document and fetches only the Sanity CDN', () => {
    const src = read(ROUTE);
    expect(src).not.toMatch(/\.patch\(|createOrReplace|\.create\(|createIfNotExists|\.delete\(/);
    expect(src).toContain("const SANITY_CDN_HOST = 'cdn.sanity.io';");
    expect(src).toContain('url.hostname !== SANITY_CDN_HOST');
  });

  it('the key is server-side only: never NEXT_PUBLIC_, sent in a header, never in a URL or a log line', () => {
    const gemini = read(GEMINI);
    expect(gemini).toContain("'x-goog-api-key': apiKey");
    expect(gemini).not.toMatch(/[?&]key=/);
    expect(gemini).not.toMatch(/console\.(log|info|warn|error)\([^)]*apiKey/);
    const dirs = ['app', 'components', 'lib', 'sanity', 'scripts'];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (name === 'node_modules' || name.startsWith('.')) continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|mjs|py|md|html)$/.test(name)) files.push(full);
      }
    };
    for (const d of dirs) walk(join(ROOT, d));
    files.push(join(ROOT, '.env.example'), join(ROOT, 'CLAUDE.md'));
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/NEXT_PUBLIC_[A-Z_]*GEMINI/);
    }
  });

  it('the model name is defined in exactly one file', () => {
    const gemini = read(GEMINI);
    expect(gemini).toMatch(/export const GEMINI_MODEL = 'gemini-[a-z0-9.-]+';/);
    for (const rel of [ROUTE, ACTION, 'lib/portfolio/ai-details.ts', 'lib/portfolio/ai-usage.ts']) {
      expect(read(rel), rel).not.toMatch(/'gemini-/);
    }
  });

  it('the action calls its route through the auth hook, fills only empty fields, and never touches clientName or publish', () => {
    const src = code(ACTION);
    expect(src).toContain("authFetch('/api/sanity/generate-portfolio'");
    expect(src).toContain('emptyFields(');
    expect(src).toContain("consider('alt', 'image.alt'");
    expect(src).not.toContain('clientName');
    // It reads the `published` prop and tells Patrick to read before he
    // publishes; it never performs a publish.
    expect(src).not.toMatch(/publish\.execute|\bpublish\(|useDocumentOperation\([^)]*\)\.publish/);
    expect(src).toContain('patch.execute([{ set }])');
    expect(src).not.toMatch(/server-only|node:|@\/lib/);
  });

  it('the action is registered for portfolioItem and the usage counter type is not a schema type', () => {
    const config = read('sanity/sanity.config.ts');
    expect(config).toContain("if (context.schemaType === 'portfolioItem') return [...prev, generatePortfolioWithAi];");
    const index = read('sanity/schemas/index.ts');
    expect(index).not.toContain('portfolioAiUsage');
  });

  it('ai-details and ai-usage are pure: no fs, Sanity, React or server-only import', () => {
    for (const rel of ['lib/portfolio/ai-details.ts', 'lib/portfolio/ai-usage.ts']) {
      const src = code(rel);
      const imports = [...src.matchAll(/^import [^;]*from '([^']+)';/gm)].map((m) => m[1]);
      for (const spec of imports) expect(spec, `${rel} imports ${spec}`).toMatch(/^\.\/(colors|decoration-methods|industries)$/);
      expect(src, rel).not.toMatch(/server-only|node:|@sanity|next\/|from 'react'/);
    }
  });
});
