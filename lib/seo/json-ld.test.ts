import { describe, expect, it } from 'vitest';

import { jsonLdHtml } from './json-ld';

describe('jsonLdHtml', () => {
  it('is byte-identical to JSON.stringify for content with no "<"', () => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Custom Water Bottles - 20 oz, "Stainless" & more',
      offers: { '@type': 'Offer', price: 250, priceCurrency: 'USD' },
    };
    expect(jsonLdHtml(data)).toBe(JSON.stringify(data));
  });

  it('escapes "<" so a value cannot terminate the script element', () => {
    const html = jsonLdHtml({ name: 'a</script><script>alert(1)</script>' });
    expect(html).not.toContain('</script>');
    expect(html).toContain('\\u003c/script');
  });

  it('round-trips to the original value through a JSON parser', () => {
    const name = 'Tote bags <b>bulk</b> </script> 5 < 10';
    const parsed = JSON.parse(jsonLdHtml({ name })) as { name: string };
    expect(parsed.name).toBe(name);
  });

  it('escapes every "<", not just the first', () => {
    expect(jsonLdHtml('<<<')).toBe('"\\u003c\\u003c\\u003c"');
  });

  it('leaves ">" and "&" alone (neither can close a script element)', () => {
    expect(jsonLdHtml({ a: '> &' })).toBe('{"a":"> &"}');
  });

  it('handles arrays and nested objects', () => {
    const parsed = JSON.parse(jsonLdHtml([{ a: ['<x>'] }])) as Array<{ a: string[] }>;
    expect(parsed[0].a[0]).toBe('<x>');
  });
});
