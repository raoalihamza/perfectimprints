import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PortableTextBlock } from '@portabletext/react';
import { RichAnswer } from './RichAnswer';

/**
 * FIX-840 render contract for the shared rich-text renderer (video description,
 * FAQ answer, customCategory FAQ answer):
 *
 *  1. Text is ALWAYS escaped. HTML typed into a paragraph reaches the visitor as
 *     the typed characters, never as markup. This is the property that keeps a
 *     Sanity value from injecting `<script>` or a stray `<a>` into the page, and
 *     it is why the live video page showed `<a href=...>` as text: the content
 *     was wrong, the renderer was right.
 *  2. A REAL link annotation (the toolbar link button) renders as an anchor.
 *     That is the thing Patrick should do instead, and this proves it works.
 */

const span = (text: string, marks: string[] = []) => ({ _type: 'span', _key: `s-${text.length}`, marks, text });

describe('RichAnswer', () => {
  it('escapes HTML typed into span text (never injects markup)', () => {
    const value: PortableTextBlock[] = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [],
        children: [span('Shop products <a href="/blog/x">here</a>. <script>alert(1)</script>')],
      },
    ];
    const html = renderToStaticMarkup(<RichAnswer value={value} />);
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;a href=&quot;/blog/x&quot;&gt;here&lt;/a&gt;');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in a legacy plain-string value too', () => {
    const html = renderToStaticMarkup(<RichAnswer value={'see <a href="/x">this</a>'} />);
    expect(html).not.toContain('<a ');
    expect(html).toContain('&lt;a href=');
  });

  it('renders a real link annotation as an internal anchor', () => {
    const value: PortableTextBlock[] = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [{ _type: 'link', _key: 'l1', href: '/blog/national-doctors-day-gifts' }],
        children: [span('Shop National Doctors Day promotional products '), span('here', ['l1']), span('.')],
      },
    ];
    const html = renderToStaticMarkup(<RichAnswer value={value} />);
    expect(html).toMatch(/<a [^>]*href="\/blog\/national-doctors-day-gifts"/);
    expect(html).toContain('>here</a>');
    expect(html).not.toContain('&lt;a');
  });
});
