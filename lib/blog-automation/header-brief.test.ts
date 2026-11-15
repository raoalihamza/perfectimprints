/**
 * AUTO-220: the ladder, the prompts and the title gate. The wording is
 * MEASURED (CHECK-image-brief-26, 35 paid pictures), so every line is pinned
 * verbatim: a changed word is a prompt nobody measured.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HEADER_LADDER,
  HEADER_RUNGS,
  INSTRUCTED_LINE_1,
  MAX_HEADER_EDITS_IN_A_ROW,
  MAX_INSTRUCTION_CHARS,
  NO_DEVICES_LINE,
  POSTER_LINE_1,
  SETTING_LINE,
  TITLE_GATE_READS,
  TITLE_READ_PROMPT,
  buildEditBrief,
  buildHeaderBrief,
  buildInstructionBrief,
  cleanInstruction,
  drawnHeaderAlt,
  editCountOf,
  foldTitle,
  nextRung,
  parseTitleRead,
  patrickLines,
  rungOf,
  titleGate,
  titleReadMatches,
} from './header-brief';

const TITLE = 'Engraved Pens for Business: A Buyer’s Guide';

describe('the ladder', () => {
  it('is three rungs in this exact order: the bare prompt, the reworded poster, the instructed version', () => {
    expect(HEADER_RUNGS).toEqual([1, 2, 3]);
    expect(HEADER_LADDER).toEqual({ 1: 'bare', 2: 'poster', 3: 'instructed' });
  });

  it('the first picture is rung 1; each Generate again is the next; after the third it repeats', () => {
    expect(nextRung(undefined)).toBe(1);
    expect(nextRung(1)).toBe(2);
    expect(nextRung(2)).toBe(3);
    expect(nextRung(3)).toBe(1);
    for (const junk of [null, 0, 4, 2.5, '1', NaN, {}, '{"layout":"headline"}']) expect(nextRung(junk)).toBe(1);
    expect(rungOf(2)).toBe(2);
    expect(rungOf('2')).toBeNull();
  });
});

describe('the prompts, verbatim as measured', () => {
  it("rung 1 is Patrick's two lines and nothing else", () => {
    expect(buildHeaderBrief({ title: TITLE, rung: 1, photos: 3 })).toBe(`Create a blog header image, "${TITLE}"\n\nUse the attached product photos in the image`);
    expect(patrickLines(`  ${TITLE}\n `, 3)).toBe(`Create a blog header image, "${TITLE}"\n\nUse the attached product photos in the image`);
  });

  it('rung 2 adds the three lines with line 1 reworded to keep the poster', () => {
    expect(POSTER_LINE_1).toBe(
      'Make it a bold graphic header with colour bands and shapes, but the title is the only writing you add: no other headings, captions, labels, callouts, badges, tags or words under icons. The logos already printed on the products stay exactly as they are.',
    );
    expect(buildHeaderBrief({ title: TITLE, rung: 2, photos: 3 })).toBe(
      `Create a blog header image, "${TITLE}"\n\nUse the attached product photos in the image\n\n${POSTER_LINE_1}\n${NO_DEVICES_LINE}\n${SETTING_LINE}`,
    );
  });

  it('rung 3 adds the three lines as the earlier ticket worded them', () => {
    expect(INSTRUCTED_LINE_1).toBe('The only words you add are the title. No other headings, captions, labels, callouts, badges or tags. The logos already printed on the products stay exactly as they are.');
    expect(NO_DEVICES_LINE).toBe('No laptops, tablets, phones or screens anywhere in the picture.');
    expect(SETTING_LINE).toBe('Put the products in the setting where they are really used, with a background that suits them.');
    expect(buildHeaderBrief({ title: TITLE, rung: 3, photos: 3 })).toBe(
      `Create a blog header image, "${TITLE}"\n\nUse the attached product photos in the image\n\n${INSTRUCTED_LINE_1}\n${NO_DEVICES_LINE}\n${SETTING_LINE}`,
    );
  });

  it('no rung carries a rule against invented claims (Ali decided: "Bulk Discounts" is acceptable on the bare picture)', () => {
    for (const rung of HEADER_RUNGS) {
      const p = buildHeaderBrief({ title: TITLE, rung, photos: 3 });
      expect(p).not.toMatch(/claim|slogan|discount|savings|promise/i);
    }
    // The bare rung says nothing about words at all.
    expect(buildHeaderBrief({ title: TITLE, rung: 1, photos: 3 })).not.toMatch(/caption|heading|badge|label/i);
  });

  it('with no photo attached the prompt does not speak of photos', () => {
    expect(buildHeaderBrief({ title: TITLE, rung: 1, photos: 0 })).toBe(`Create a blog header image, "${TITLE}"`);
  });

  it('a redraw keeps the rung and names what was wrong, after everything else', () => {
    const base = buildHeaderBrief({ title: TITLE, rung: 2, photos: 3 });
    const title = buildHeaderBrief({ title: TITLE, rung: 2, photos: 3, retry: { title: true } });
    expect(title).toBe(`${base}\n\nThe title on the picture must read exactly, letter for letter: "${TITLE}"`);
    const brand = buildHeaderBrief({ title: TITLE, rung: 1, photos: 3, retry: { brand: 'Dunlop' } });
    expect(brand).toBe(
      `${buildHeaderBrief({ title: TITLE, rung: 1, photos: 3 })}\n\nThe previous picture showed "Dunlop". That name must not appear anywhere in the picture: where it was printed, leave the product plain. Every other logo printed on the products stays exactly as the photos show it, letter for letter.`,
    );
    expect(buildHeaderBrief({ title: TITLE, rung: 1, photos: 3, retry: {} })).toBe(buildHeaderBrief({ title: TITLE, rung: 1, photos: 3 }));
  });
});

describe("Patrick's own instruction", () => {
  it('a new picture: his words after the two lines, in place of the ladder\'s block', () => {
    const p = buildInstructionBrief({ title: TITLE, instruction: 'Pens on a boardroom table, navy band across the top', photos: 3 });
    expect(p).toBe(`Create a blog header image, "${TITLE}"\n\nUse the attached product photos in the image\n\nPens on a boardroom table, navy band across the top`);
    expect(p).not.toContain(POSTER_LINE_1);
    expect(p).not.toContain(INSTRUCTED_LINE_1);
  });

  it('a change to the current picture: his words, keep the rest, and the exact title', () => {
    expect(buildEditBrief({ title: TITLE, instruction: 'make the background a beach' })).toBe(
      `Change the attached blog header image as follows: make the background a beach\n\nKeep everything else in the picture as it is. The title on the picture must read exactly: "${TITLE}"`,
    );
  });

  it('the instruction is one trimmed paragraph, cut at a word past the limit, and nothing when empty', () => {
    expect(cleanInstruction('  make it\n\n  blue  ')).toBe('make it blue');
    expect(cleanInstruction(undefined)).toBe('');
    expect(cleanInstruction(42)).toBe('');
    const long = cleanInstruction(`${'word '.repeat(300)}`);
    expect(long.length).toBeLessThanOrEqual(MAX_INSTRUCTION_CHARS);
    expect(long.endsWith('word')).toBe(true);
  });

  it('changes in a row are counted, and three is the limit', () => {
    expect(MAX_HEADER_EDITS_IN_A_ROW).toBe(3);
    expect(editCountOf(2)).toBe(2);
    for (const junk of [undefined, null, -1, '2', NaN]) expect(editCountOf(junk)).toBe(0);
  });
});

describe('the title gate', () => {
  it('reads three times with the transcription prompt that was measured', () => {
    expect(TITLE_GATE_READS).toBe(3);
    expect(TITLE_READ_PROMPT.user).toBe(
      'This is a blog header picture with a title laid over it. Copy the title exactly, character for character, keeping capital letters and punctuation. Return {"title": "..."}',
    );
  });

  it('a read matches when every letter, digit and mark is the same; quotes, dashes, spacing and case are folded', () => {
    expect(titleReadMatches("Engraved Pens for Business: A Buyer's Guide", TITLE)).toBe(true);
    expect(titleReadMatches('ENGRAVED PENS FOR BUSINESS:  A BUYER’S GUIDE', TITLE)).toBe(true);
    expect(titleReadMatches('Engraved Pens for Business A Buyer’s Guide', TITLE)).toBe(false); // the colon dropped
    expect(titleReadMatches('Engraved Pen for Business: A Buyer’s Guide', TITLE)).toBe(false); // one letter
    expect(titleReadMatches('A Buyer’s Guide', TITLE)).toBe(false); // one line of a wrapped title
    expect(titleReadMatches('', TITLE)).toBe(false);
    expect(titleReadMatches(null, TITLE)).toBe(false);
    expect(titleReadMatches('anything', '')).toBe(false);
    expect(foldTitle('5 Reasons  –  “Why”')).toBe('5 reasons - "why"');
  });

  it('accepts on ONE exact read of three (a gate wanting all three refused 4 correct pictures of 35)', () => {
    expect(titleGate([TITLE, 'Reasons to Use Pens', 'A Buyer’s Guide'], TITLE)).toEqual({ passed: true, answered: 3, exact: 1, misread: 'Reasons to Use Pens' });
    expect(titleGate([TITLE, TITLE, TITLE], TITLE)).toEqual({ passed: true, answered: 3, exact: 3, misread: null });
    expect(titleGate(['wrong', 'wrong', 'also wrong'], TITLE)).toMatchObject({ passed: false, answered: 3, exact: 0, misread: 'wrong' });
  });

  it('a read that did not come back is not a match, and no read at all does not pass', () => {
    expect(titleGate([null, TITLE, null], TITLE)).toMatchObject({ passed: true, answered: 1, exact: 1 });
    expect(titleGate([null, null, null], TITLE)).toEqual({ passed: false, answered: 0, exact: 0, misread: null });
    expect(titleGate(['', '', ''], TITLE)).toMatchObject({ passed: false, answered: 3 });
  });

  it('the read is parsed defensively', () => {
    expect(parseTitleRead({ title: '  A   Title ' })).toBe('A Title');
    for (const bad of [null, {}, { title: 3 }, { title: '   ' }, 'x']) expect(parseTitleRead(bad)).toBeNull();
  });
});

describe('the alt text and the structure', () => {
  it('says the title first, then what the picture shows', () => {
    expect(drawnHeaderAlt(TITLE, 'Engraved Pens')).toBe(`${TITLE}. Blog header picture showing engraved pens`);
    expect(drawnHeaderAlt('Are Caps Good for Trade Shows?', '')).toBe('Are Caps Good for Trade Shows? Blog header picture showing promotional products');
  });

  it('this module is pure: no imports at all', () => {
    const src = readFileSync(join(process.cwd(), 'lib/blog-automation/header-brief.ts'), 'utf8');
    expect(src.match(/^import .*$/gm) ?? []).toEqual([]);
  });
});
