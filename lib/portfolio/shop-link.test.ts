/**
 * PORT-160: the shop link on a portfolio category. What the Studio refuses to
 * publish, what the site refuses to render, and what the link says.
 */
import { describe, expect, it } from 'vitest';

import {
  SHOP_CATEGORY_SLUG_PATTERN,
  buildPortfolioShopLinks,
  normalizeShopCategorySlug,
  portfolioShopLink,
  shopCategorySlugProblem,
  shopLinkLabel,
} from './shop-link';

describe('the slug shape rule (schema and render share it)', () => {
  it('accepts blank, a root slug and a facet slug', () => {
    expect(shopCategorySlugProblem(undefined)).toBeNull();
    expect(shopCategorySlugProblem(null)).toBeNull();
    expect(shopCategorySlugProblem('')).toBeNull();
    expect(shopCategorySlugProblem('   ')).toBeNull();
    expect(shopCategorySlugProblem('caps')).toBeNull();
    expect(shopCategorySlugProblem('water-bottles')).toBeNull();
    expect(shopCategorySlugProblem('caps/color/blue')).toBeNull();
    expect(shopCategorySlugProblem('t-shirts/no-minimum')).toBeNull();
    expect(shopCategorySlugProblem('  drinkware  ')).toBeNull();
  });

  it('refuses a whole address, a leading /cat/, slashes at the ends, upper case and stray characters', () => {
    expect(shopCategorySlugProblem('https://www.perfectimprints.com/cat/caps')).toMatch(/Just the slug/);
    expect(shopCategorySlugProblem('www.perfectimprints.com/cat/caps')).toMatch(/Just the slug/);
    expect(shopCategorySlugProblem('/caps')).toMatch(/leading or trailing slash/);
    expect(shopCategorySlugProblem('caps/')).toMatch(/leading or trailing slash/);
    expect(shopCategorySlugProblem('cat/caps')).toMatch(/Drop the leading/);
    expect(shopCategorySlugProblem('Caps')).toMatch(/Lowercase/);
    expect(shopCategorySlugProblem('caps and hats')).toMatch(/Letters, numbers and single dashes/);
    expect(shopCategorySlugProblem('caps--hats')).toMatch(/Letters, numbers and single dashes/);
    expect(shopCategorySlugProblem('caps//color')).toMatch(/Letters, numbers and single dashes/);
    expect(shopCategorySlugProblem('caps?x=1')).toMatch(/Letters, numbers and single dashes/);
    expect(shopCategorySlugProblem('caps,hats')).toMatch(/Letters, numbers and single dashes/);
    expect(shopCategorySlugProblem(42)).toMatch(/Must be a category slug/);
    expect(shopCategorySlugProblem('a'.repeat(201))).toMatch(/Too long/);
  });

  it('the pattern itself matches every real slug shape the site has (root, modifier, facet, compound facet)', () => {
    for (const slug of [
      'pens',
      'water-bottles/closeout',
      'water-bottles/material/stainless-steel',
      'bags/color/blue/material/cotton',
    ]) {
      expect(slug).toMatch(SHOP_CATEGORY_SLUG_PATTERN);
    }
  });

  it('normalises to the trimmed slug or null', () => {
    expect(normalizeShopCategorySlug(' caps ')).toBe('caps');
    expect(normalizeShopCategorySlug('/caps')).toBeNull();
    expect(normalizeShopCategorySlug('')).toBeNull();
    expect(normalizeShopCategorySlug(undefined)).toBeNull();
  });
});

describe('the label', () => {
  it('sentence-cases a title and keeps words with an inner capital as typed', () => {
    expect(shopLinkLabel('Caps and Hats')).toBe('Shop all custom caps and hats');
    expect(shopLinkLabel('Drinkware')).toBe('Shop all custom drinkware');
    expect(shopLinkLabel('T-Shirts')).toBe('Shop all custom T-Shirts');
    expect(shopLinkLabel('Fire and EMS gear')).toBe('Shop all custom fire and EMS gear');
    expect(shopLinkLabel('USA Made')).toBe('Shop all custom USA made');
    expect(shopLinkLabel('  Christmas   Ornaments ')).toBe('Shop all custom christmas ornaments');
  });

  it('never renders an empty phrase', () => {
    expect(shopLinkLabel('')).toBe('Shop all custom products');
    expect(shopLinkLabel('   ')).toBe('Shop all custom products');
  });
});

describe('portfolioShopLink', () => {
  it('builds an internal /cat href with the sentence label for a valid slug', () => {
    expect(
      portfolioShopLink({ slug: 'caps-and-hats', title: 'Caps and Hats', shopCategorySlug: 'caps' }),
    ).toEqual({
      categorySlug: 'caps-and-hats',
      title: 'Caps and Hats',
      href: '/cat/caps',
      label: 'Shop all custom caps and hats',
    });
    expect(portfolioShopLink({ title: 'Drinkware', shopCategorySlug: 'drinkware/color/blue' })?.href).toBe(
      '/cat/drinkware/color/blue',
    );
  });

  it('is null for a blank, missing or malformed slug, so a bad value can never become a broken link', () => {
    expect(portfolioShopLink({ title: 'Caps and Hats' })).toBeNull();
    expect(portfolioShopLink({ title: 'Caps and Hats', shopCategorySlug: '' })).toBeNull();
    expect(portfolioShopLink({ title: 'Caps and Hats', shopCategorySlug: null })).toBeNull();
    expect(portfolioShopLink({ title: 'Caps and Hats', shopCategorySlug: '/cat/caps' })).toBeNull();
    expect(portfolioShopLink({ title: 'Caps and Hats', shopCategorySlug: 'https://x.test/cat/caps' })).toBeNull();
    expect(portfolioShopLink({ title: 'Caps and Hats', shopCategorySlug: 'Caps' })).toBeNull();
    expect(portfolioShopLink(null)).toBeNull();
    expect(portfolioShopLink(undefined)).toBeNull();
  });

  it('never emits anything but /cat/ plus clean segments', () => {
    for (const bad of ['../etc', 'caps/../pens', 'caps#frag', 'caps%2F', ' ', 'caps hats']) {
      expect(portfolioShopLink({ title: 'x', shopCategorySlug: bad })).toBeNull();
    }
  });
});

describe('buildPortfolioShopLinks', () => {
  it('keys visible categories with a valid slug by their own slug and skips the rest', () => {
    const links = buildPortfolioShopLinks([
      { slug: 'caps-and-hats', title: 'Caps and Hats', shopCategorySlug: 'caps' },
      { slug: 't-shirts', title: 'T-Shirts', shopCategorySlug: '' },
      { slug: 'drinkware', title: 'Drinkware', shopCategorySlug: 'drinkware', hidden: true },
      { slug: '', title: 'No slug', shopCategorySlug: 'pens' },
      { slug: 'ornaments', title: 'Christmas Ornaments', shopCategorySlug: 'ornaments' },
    ]);
    expect(Object.keys(links)).toEqual(['caps-and-hats', 'ornaments']);
    expect(links['caps-and-hats'].href).toBe('/cat/caps');
    expect(links.ornaments.label).toBe('Shop all custom christmas ornaments');
  });

  it('is empty for no categories', () => {
    expect(buildPortfolioShopLinks([])).toEqual({});
  });
});
