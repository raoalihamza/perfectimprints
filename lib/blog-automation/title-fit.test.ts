/**
 * AUTO-208 Part 6: a title over the ceiling no longer loses the generation.
 * The real `fitTitle` with a fake shortener; the measuring cups case that
 * died in AUTO-207 is the first test.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TITLE_MAX_CHARS } from './blog-shape';
import { fitTitle, isLengthFault, repairTitle, type FitTitleInput } from './title-fit';

type ShortenArgs = Parameters<FitTitleInput['shorten']>[0];

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const LONG = '10 Promotional Measuring Cups That Belong in Every Breakroom and Employee Kitchen';

describe('fitTitle', () => {
  it('the measuring cups title that died in AUTO-207 (78 characters) is shortened once and accepted', async () => {
    expect(LONG.length).toBeGreaterThan(TITLE_MAX_CHARS);
    const shorten = vi.fn(async (_args: ShortenArgs) => '10 Promotional Measuring Cups for Every Breakroom');
    const r = await fitTitle({ title: LONG, shape: 'list', topic: 'promotional measuring cups', ideaCount: 10, shorten });
    expect(r).toEqual({ ok: true, title: '10 Promotional Measuring Cups for Every Breakroom', repair: 'shortened', shortenCalls: 1 });
    expect(shorten).toHaveBeenCalledTimes(1);
    expect(shorten.mock.calls[0][0]).toMatchObject({ title: LONG, shape: 'list', topic: 'promotional measuring cups', ideaCount: 10 });
  });

  it('a title that fits is never sent to the shortener', async () => {
    const shorten = vi.fn(async () => 'unused');
    const r = await fitTitle({ title: '7 Ways to Use Promotional Coasters at Events', shape: 'list', topic: 'promotional coasters', ideaCount: 7, shorten });
    expect(r).toEqual({ ok: true, title: '7 Ways to Use Promotional Coasters at Events', repair: null, shortenCalls: 0 });
    expect(shorten).not.toHaveBeenCalled();
  });

  it('the shortened title goes through the SAME judge: a shortened title that drops the number, the product words or the shape is refused with both faults named', async () => {
    const dropsNumber = await fitTitle({ title: LONG, shape: 'list', topic: 'promotional measuring cups', ideaCount: 10, shorten: async () => 'Promotional Measuring Cups for Every Breakroom' });
    // The list-number repair REPLACES a leading number; it never adds one, so a shortened list title with no number is refused.
    expect(dropsNumber).toMatchObject({ ok: false, shortenCalls: 1 });
    if (dropsNumber.ok === false) expect(dropsNumber.fault).toContain('a list title must start with its number');
    const dropsProduct = await fitTitle({ title: LONG, shape: 'list', topic: 'promotional measuring cups', ideaCount: 10, shorten: async () => '10 Breakroom Ideas That Work' });
    expect(dropsProduct).toMatchObject({ ok: false, shortenCalls: 1 });
    if (dropsProduct.ok === false) expect(dropsProduct.fault).toMatch(/longer than Google shows; the shortened title did not fit either \(the title does not carry/);
    const stillLong = await fitTitle({ title: LONG, shape: 'list', topic: 'promotional measuring cups', ideaCount: 10, shorten: async () => LONG });
    expect(stillLong.ok).toBe(false);
  });

  it('only a LENGTH fault is sent to the shortener; every other fault refuses at once with no second call', async () => {
    const shorten = vi.fn(async () => 'unused');
    const r = await fitTitle({ title: 'Promotional Measuring Cups Guide', shape: 'list', topic: 'promotional measuring cups', ideaCount: 10, shorten });
    expect(r).toMatchObject({ ok: false, shortenCalls: 0 });
    expect(shorten).not.toHaveBeenCalled();
    expect(isLengthFault('x'.repeat(80), 'the title is 80 characters, longer than Google shows')).toBe(true);
    expect(isLengthFault('x'.repeat(40), 'a list title must start with its number')).toBe(false);
  });

  it('a shortener that throws or returns nothing refuses the generation as before, naming why', async () => {
    const threw = await fitTitle({ title: LONG, shape: 'list', topic: 'promotional measuring cups', ideaCount: 10, shorten: async () => { throw new Error('DeepSeek did not answer'); } });
    expect(threw).toMatchObject({ ok: false, shortenCalls: 1 });
    if (threw.ok === false) expect(threw.fault).toContain('could not be shortened (DeepSeek did not answer)');
    const empty = await fitTitle({ title: LONG, shape: 'list', topic: 'promotional measuring cups', ideaCount: 10, shorten: async () => '' });
    if (empty.ok === false) expect(empty.fault).toContain('returned no title');
  });

  it('repairs are the AUTO-203 ones: the list number and the question mark', () => {
    expect(repairTitle('9 Ways to Use Koozies', 'list', 7)).toBe('7 Ways to Use Koozies');
    expect(repairTitle('Are Custom Koozies Worth It', 'question')).toBe('Are Custom Koozies Worth It?');
    expect(repairTitle('  Custom Koozies: A Guide  ', 'guide')).toBe('Custom Koozies: A Guide');
  });
});

describe('the generator uses it', () => {
  const generator = read('lib/blog-automation/generate-blog-post.ts');

  it('judges the title through fitTitle with the DeepSeek shortener as the default, and counts the call', () => {
    expect(generator).toContain("import { fitTitle } from './title-fit';");
    expect(generator).toContain('shorten: input.shortenTitle ?? shortenTitleWithDeepSeek,');
    expect(generator).toContain('const deepseekCalls = 1 + fitted.shortenCalls;');
    expect(generator).toContain("const titleRepair = fitted.repair ?? undefined;");
    // The shortening call is small and bounded.
    expect(generator).toMatch(/timeoutMs: TITLE_SHORTEN_TIMEOUT_MS/);
    expect(generator).toMatch(/maxTokens: 120/);
  });

  it('the prompt now asks for the target length up front, so the shortener is the exception', () => {
    expect(generator).toContain('the title is at most ${TITLE_TARGET_CHARS} characters (${TITLE_MAX_CHARS} is the hard ceiling)');
  });
});
