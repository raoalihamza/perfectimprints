import { describe, expect, it, beforeEach } from 'vitest';
import { affiliateUrl } from './affiliate-url';

describe('affiliateUrl', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_GEIGER_HOST = 'https://patrickblack.geiger.com';
  });

  it('rewrites a Geiger product URL to the affiliate host', () => {
    expect(affiliateUrl('https://www.geiger.com/p/vinyl-football-510336?pid=208667')).toBe(
      'https://patrickblack.geiger.com/p/vinyl-football-510336?pid=208667',
    );
  });

  it('rewrites a Geiger category URL to the affiliate host', () => {
    expect(affiliateUrl('https://www.geiger.com/b/drinkware')).toBe(
      'https://patrickblack.geiger.com/b/drinkware',
    );
  });

  it('returns the affiliate host when input is empty', () => {
    expect(affiliateUrl('')).toBe('https://patrickblack.geiger.com');
    expect(affiliateUrl(null)).toBe('https://patrickblack.geiger.com');
    expect(affiliateUrl(undefined)).toBe('https://patrickblack.geiger.com');
  });

  it('leaves an already-affiliate URL unchanged', () => {
    expect(affiliateUrl('https://patrickblack.geiger.com/p/foo-123')).toBe(
      'https://patrickblack.geiger.com/p/foo-123',
    );
  });

  it('preserves query parameters during rewrite', () => {
    expect(affiliateUrl('https://www.geiger.com/p/foo?a=1&b=2')).toBe(
      'https://patrickblack.geiger.com/p/foo?a=1&b=2',
    );
  });

  it('honors a trailing-slash affiliate host env var', () => {
    process.env.NEXT_PUBLIC_GEIGER_HOST = 'https://patrickblack.geiger.com/';
    expect(affiliateUrl('https://www.geiger.com/p/foo')).toBe(
      'https://patrickblack.geiger.com/p/foo',
    );
  });

  it('returns non-Geiger URLs unchanged (custom product partners)', () => {
    expect(affiliateUrl('https://partner.example.com/product/123')).toBe(
      'https://partner.example.com/product/123',
    );
  });
});
