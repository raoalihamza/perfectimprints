import { describe, it, expect } from 'vitest';
import { containsHtmlTag, findRawHtmlTag, rawHtmlValidationMessage } from './raw-html';

const block = (text: string, markDefs: unknown[] = []) => ({
  _type: 'block',
  _key: 'b1',
  style: 'normal',
  markDefs,
  children: [{ _type: 'span', _key: 's1', marks: [] as string[], text }],
});

describe('containsHtmlTag', () => {
  it('flags the two live cases verbatim', () => {
    expect(
      containsHtmlTag(
        'Shop National Doctors Day promotional products <a href="/blog/national-doctors-day-gifts">here</a>.',
      ),
    ).toBe(true);
    expect(
      containsHtmlTag("region. <a href=\"/blog/us-pepper-spray-laws\">Here's a quick guide to get you started.</a>"),
    ).toBe(true);
  });
  it('flags closing, self-closing and bare tags', () => {
    expect(containsHtmlTag('text</a>')).toBe(true);
    expect(containsHtmlTag('line<br/>break')).toBe(true);
    expect(containsHtmlTag('<strong>bold</strong>')).toBe(true);
  });
  it('does not flag ordinary prose with angle brackets', () => {
    expect(containsHtmlTag('orders <3 days ship free')).toBe(false);
    expect(containsHtmlTag('quantities < 500 and > 100')).toBe(false);
    expect(containsHtmlTag('a<b')).toBe(false);
    expect(containsHtmlTag('use the -> arrow or <- back')).toBe(false);
    expect(containsHtmlTag('plain sentence.')).toBe(false);
  });
});

describe('findRawHtmlTag', () => {
  it('returns null for empty / non-array / clean values', () => {
    expect(findRawHtmlTag(undefined)).toBeNull();
    expect(findRawHtmlTag(null)).toBeNull();
    expect(findRawHtmlTag([])).toBeNull();
    expect(findRawHtmlTag(42)).toBeNull();
    expect(findRawHtmlTag([block('Clean paragraph.')])).toBeNull();
  });
  it('returns the first tag found in span text', () => {
    expect(findRawHtmlTag([block('ok'), block('see <a href="/x">here</a>')])).toBe('<a href="/x">');
  });
  it('handles a legacy plain string', () => {
    expect(findRawHtmlTag('see <em>this</em>')).toBe('<em>');
  });
  it('never inspects markDefs, so a REAL link annotation is not flagged', () => {
    const real = block('Read the guide here.', [{ _type: 'link', _key: 'l1', href: '/blog/guide?a=<b>' }]);
    real.children[0].marks = ['l1'];
    expect(findRawHtmlTag([real])).toBeNull();
  });
  it('ignores non-block members and non-string children', () => {
    expect(findRawHtmlTag([{ _type: 'image' }, { _type: 'block', children: [{ text: 5 }] }])).toBeNull();
  });
});

describe('rawHtmlValidationMessage', () => {
  it('is null (valid) for clean content', () => {
    expect(rawHtmlValidationMessage([block('Clean.')])).toBeNull();
  });
  it('names the tag and tells the editor to use the link button', () => {
    const msg = rawHtmlValidationMessage([block('see <a href="/x">here</a>')]);
    expect(msg).toContain('<a href="/x">');
    expect(msg).toContain('link button');
  });
  it('truncates a very long tag in the message', () => {
    const long = `<a href="/${'x'.repeat(100)}">`;
    const msg = rawHtmlValidationMessage([block(`see ${long}here</a>`)]);
    expect(msg).not.toBeNull();
    expect(msg).toContain('...');
    expect((msg as string).length).toBeLessThan(long.length + 200);
  });
});
