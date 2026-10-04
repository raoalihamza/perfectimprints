/**
 * MERCH-220: the shipping policy resolver, the half of the feature that turns
 * what Patrick types in Global Settings into what `shippingRateFor` computes.
 * The rate itself is tested beside its function in product-schema.test.ts;
 * this file covers the boundary between the two (a 15 typed in Studio reaches
 * the builder as 15, a 150 does not reach it at all, and blank stays blank).
 */
import { describe, expect, it } from 'vitest';

import { resolveBlogAutomation, resolveShippingPolicy } from './global-settings';

describe('resolveShippingPolicy (MERCH-220)', () => {
  it('resolves to null when nothing is set, exactly as MERCH-100 did', () => {
    expect(resolveShippingPolicy(null)).toBeNull();
    expect(resolveShippingPolicy(undefined)).toBeNull();
    expect(resolveShippingPolicy({})).toBeNull();
  });

  it("carries Patrick's percentage through as percent, untouched", () => {
    const policy = resolveShippingPolicy({ orderPercentage: 15, destinationCountry: 'US' });
    expect(policy).toEqual({
      orderPercentage: 15,
      rate: null,
      destinationCountry: 'US',
      handlingDaysMin: null,
      handlingDaysMax: null,
      transitDaysMin: null,
      transitDaysMax: null,
    });
  });

  it('keeps the flat rate beside the percentage; precedence is decided downstream, not here', () => {
    const policy = resolveShippingPolicy({ orderPercentage: 15, flatRate: 9 });
    expect(policy?.orderPercentage).toBe(15);
    expect(policy?.rate).toBe(9);
  });

  it('treats a percentage outside 0..100 as unset rather than passing a nonsense share on', () => {
    expect(resolveShippingPolicy({ orderPercentage: 150 })).toBeNull();
    expect(resolveShippingPolicy({ orderPercentage: -5 })).toBeNull();
    expect(resolveShippingPolicy({ orderPercentage: Number.NaN })).toBeNull();
    expect(resolveShippingPolicy({ orderPercentage: 100 })?.orderPercentage).toBe(100);
    expect(resolveShippingPolicy({ orderPercentage: 0 })?.orderPercentage).toBe(0);
  });

  it('keeps the handling fallback and transit range as numbers, as before', () => {
    const policy = resolveShippingPolicy({ handlingDaysMin: 10, handlingDaysMax: 10, transitDaysMin: 3, transitDaysMax: 7 });
    expect(policy).toMatchObject({ handlingDaysMin: 10, handlingDaysMax: 10, transitDaysMin: 3, transitDaysMax: 7 });
    expect(policy?.orderPercentage).toBeNull();
  });
});

/** The resolved object for a singleton that says nothing (AUTO-110 + the AUTO-202 defaults). */
const EMPTY_AUTOMATION = {
  negativeKeywords: [],
  headerImageSource: 'ai',
  headerImageLibrary: [],
  defaultAuthorId: null,
  defaultCategoryIds: [],
};

describe('resolveBlogAutomation (AUTO-110)', () => {
  it('resolves a missing object to an empty list, the state of the singleton before the ticket', () => {
    expect(resolveBlogAutomation(undefined)).toEqual(EMPTY_AUTOMATION);
    expect(resolveBlogAutomation(null)).toEqual(EMPTY_AUTOMATION);
    expect(resolveBlogAutomation({})).toEqual(EMPTY_AUTOMATION);
    expect(resolveBlogAutomation({ negativeKeywords: [] })).toEqual(EMPTY_AUTOMATION);
  });

  it('keeps what the panel wrote, trimmed, with its date and note', () => {
    expect(
      resolveBlogAutomation({
        negativeKeywords: [{ term: '  fun facts about paramedics ', addedAt: '2026-09-24T10:00:00.000Z', note: ' not our buyers ' }],
      }),
    ).toEqual({
      ...EMPTY_AUTOMATION,
      negativeKeywords: [{ term: 'fun facts about paramedics', scope: 'word', addedAt: '2026-09-24T10:00:00.000Z', note: 'not our buyers' }],
    });
  });

  describe('AUTO-202: the header image source, the library, the default author and categories', () => {
    it('reads the source, and blank or unknown reads as AI generated', () => {
      expect(resolveBlogAutomation({ headerImageSource: 'library' }).headerImageSource).toBe('library');
      expect(resolveBlogAutomation({ headerImageSource: 'product' }).headerImageSource).toBe('product');
      expect(resolveBlogAutomation({ headerImageSource: '' }).headerImageSource).toBe('ai');
      expect(resolveBlogAutomation({ headerImageSource: 'something' }).headerImageSource).toBe('ai');
    });

    it('keeps library entries with an uploaded asset only; a blank root slug is the any-post picture', () => {
      expect(
        resolveBlogAutomation({
          headerImageLibrary: [
            { rootSlug: 'caps', alt: ' Caps ', image: { asset: { _ref: 'image-a-1600x900-jpg' } } },
            { rootSlug: '', image: { asset: { _ref: 'image-b-1600x900-jpg' } } },
            { rootSlug: 'pens', image: {} },
            { rootSlug: 'pens' },
          ],
        }).headerImageLibrary,
      ).toEqual([
        { rootSlug: 'caps', assetRef: 'image-a-1600x900-jpg', alt: 'Caps' },
        { rootSlug: null, assetRef: 'image-b-1600x900-jpg', alt: null },
      ]);
    });

    it('the settings query projects the four fields, the two references as ids', async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const src = readFileSync(join(__dirname, 'global-settings.ts'), 'utf8');
      expect(src).toContain('headerImageSource,');
      expect(src).toContain('headerImageLibrary[]{ rootSlug, alt, image{ asset{ _ref } } },');
      expect(src).toContain('"defaultAuthorId": defaultAuthor._ref,');
      expect(src).toContain('"defaultCategoryIds": defaultCategories[]._ref');
    });

    it('reads the default author and categories as ids, blanks and repeats dropped', () => {
      const r = resolveBlogAutomation({
        defaultAuthorId: ' author-sarah-garcia ',
        defaultCategoryIds: ['blog-category-promotional-product-ideas', '', null, 'blog-category-promotional-product-ideas', 'blog-category-christmas'],
      });
      expect(r.defaultAuthorId).toBe('author-sarah-garcia');
      expect(r.defaultCategoryIds).toEqual(['blog-category-promotional-product-ideas', 'blog-category-christmas']);
      expect(resolveBlogAutomation({ defaultAuthorId: '' }).defaultAuthorId).toBeNull();
    });
  });

  it('drops blank terms and case-insensitive duplicates, first entry winning', () => {
    const resolved = resolveBlogAutomation({
      negativeKeywords: [
        { term: '' },
        { term: '   ' },
        { term: 'Paramedics', note: 'first' },
        { term: 'paramedics', note: 'second' },
        {},
        { term: 'nurses' },
      ],
    });
    expect(resolved.negativeKeywords.map((k) => k.term)).toEqual(['Paramedics', 'nurses']);
    expect(resolved.negativeKeywords[0].note).toBe('first');
    expect(resolved.negativeKeywords[1]).toEqual({ term: 'nurses', scope: 'word', addedAt: null, note: null });
  });

  it('AUTO-116: reads the scope, and an entry with none (every entry before AUTO-116) is a word block', () => {
    const resolved = resolveBlogAutomation({
      negativeKeywords: [
        // Patrick's real stored entry, byte for byte (no scope field).
        { term: 'imprinted sunglasses', addedAt: '2026-09-26T01:35:30.171Z' },
        { term: 'custom pens', scope: 'topic' },
        { term: 'nurses', scope: 'something else' },
      ],
    });
    expect(resolved.negativeKeywords.map((k) => [k.term, k.scope])).toEqual([
      ['imprinted sunglasses', 'word'],
      ['custom pens', 'topic'],
      ['nurses', 'word'],
    ]);
  });

  it('AUTO-116: de-duplicates within a scope, keeps a topic block and a word block for the same words, collapses inner spaces', () => {
    const resolved = resolveBlogAutomation({
      negativeKeywords: [
        { term: ' custom   pens ', scope: 'topic' },
        { term: 'Custom Pens', scope: 'topic' },
        { term: 'custom pens' },
      ],
    });
    expect(resolved.negativeKeywords.map((k) => [k.term, k.scope])).toEqual([
      ['custom pens', 'topic'],
      ['custom pens', 'word'],
    ]);
  });
});
