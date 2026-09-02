/**
 * IMG-120: the structured-data boundary strips `auto=format` and nothing else.
 */
import { describe, expect, it } from 'vitest';

import { withoutAutoFormat } from './image-format';

const S = 'https://cdn.sanity.io/images/ii96lcy9/production/abc-1500x1500.jpg';

describe('withoutAutoFormat', () => {
  it('removes a trailing auto=format', () => {
    expect(withoutAutoFormat(`${S}?w=400&fit=max&auto=format`)).toBe(`${S}?w=400&fit=max`);
  });

  it('removes a leading or middle auto=format and keeps the other params in order', () => {
    expect(withoutAutoFormat(`${S}?auto=format&w=400&fit=max`)).toBe(`${S}?w=400&fit=max`);
    expect(withoutAutoFormat(`${S}?w=400&auto=format&fit=max`)).toBe(`${S}?w=400&fit=max`);
  });

  it('drops the whole query when auto=format was the only parameter', () => {
    expect(withoutAutoFormat(`${S}?auto=format`)).toBe(S);
  });

  it('leaves a URL without the parameter byte-identical', () => {
    const url = `${S}?w=1200&fit=max`;
    expect(withoutAutoFormat(url)).toBe(url);
    expect(withoutAutoFormat(S)).toBe(S);
  });

  it('never touches a Geiger URL, even one that carries an auto parameter', () => {
    const geiger = 'https://imgsirv.geiger.com/x.jpg?format=webp&thumbnail=1200&w=1200&h=1200';
    expect(withoutAutoFormat(geiger)).toBe(geiger);
    const odd = 'https://imgsirv.geiger.com/x.jpg?auto=format&w=1200';
    expect(withoutAutoFormat(odd)).toBe(odd);
  });

  it('is not fooled by a host that merely contains the Sanity host name', () => {
    const spoof = 'https://cdn.sanity.io.evil.test/a.jpg?w=1&auto=format';
    expect(withoutAutoFormat(spoof)).toBe(spoof);
    const inQuery = 'https://evil.test/a.jpg?u=cdn.sanity.io&auto=format';
    expect(withoutAutoFormat(inQuery)).toBe(inQuery);
  });

  it('passes null and undefined through', () => {
    expect(withoutAutoFormat(null)).toBeNull();
    expect(withoutAutoFormat(undefined)).toBeUndefined();
  });

  it('keeps a fragment intact', () => {
    expect(withoutAutoFormat(`${S}?w=400&auto=format#x`)).toBe(`${S}?w=400#x`);
    expect(withoutAutoFormat(`${S}?auto=format#x`)).toBe(`${S}#x`);
  });
});
