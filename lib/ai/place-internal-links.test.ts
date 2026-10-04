/**
 * AUTO-201: the 'topic' anchor policy, against the anchors a read of all 29
 * real AI posts and drafts produced under the old rules (2026-10-05), and
 * the rules every placed link must hold: same tab, no self link, no target
 * twice, prose only, fewer links rather than forced ones. The 'label'
 * policy, the default, is pinned byte-for-byte on the harness's own cases.
 */
import { describe, expect, it } from 'vitest';
import type { InternalLinkSuggestion } from './internal-links';
import { ANCHOR_OCCASION_WORDS, placeInternalLinks, stem, topicAnchorCandidates, topicWordsOf } from './place-internal-links';
import { buildBlogBody, type BlogInlineSpan, type BlogTextBlock } from '../portable-text/build-blog-body';

const target = (over: Partial<InternalLinkSuggestion> & { href: string; label: string }): InternalLinkSuggestion => ({
  kind: 'blog',
  reason: 'Existing blog post sharing the keywords: x',
  ...over,
});

const anchorsOf = (result: ReturnType<typeof placeInternalLinks>) => result.placed.map((p) => `[${p.anchor}] -> ${p.href}`);

describe("topicWordsOf: what the finder matched, minus what is generic", () => {
  it('reads matchedTokens first and drops promo, filler, near-generic and occasion words', () => {
    expect(
      topicWordsOf(target({ href: '/cat/koozies', label: 'Custom Koozies', matchedTokens: ['custom', 'koozies', 'events', 'business', 'gifts', 'ideas'] })),
    ).toEqual(['koozies']);
  });
  it('falls back to the "keywords:" suffix of the reason for a hand-built suggestion', () => {
    expect(topicWordsOf(target({ href: '/cat/pens', label: 'Pens', reason: 'Category page matching the keywords: custom, pens' }))).toEqual(['pens']);
  });
  it('a target matched only on generic words has no topic word', () => {
    expect(topicWordsOf(target({ href: '/videos/hats-roi', label: 'Custom Hats ROI for Business Buyers', matchedTokens: ['custom', 'business'] }))).toEqual([]);
    for (const w of ANCHOR_OCCASION_WORDS) expect(topicWordsOf(target({ href: '/x', label: 'X', matchedTokens: [w] }))).toEqual([]);
  });
});

describe('topicAnchorCandidates: trimmed phrases, longest first, one-word anchors only from the address', () => {
  it('trims function words, numbers and punctuation off the ends and orders by trimmed length', () => {
    const t = target({
      href: '/blog/25-ways-use-custom-pepper-spray-safety-branding',
      label: '25 Ways to Use Custom Pepper Spray: Safety Branding',
      matchedTokens: ['custom', 'pepper', 'spray'],
    });
    const phrases = topicAnchorCandidates(t).map((c) => c.phrase);
    // "Branding" is an occasion word, so it comes off the end too.
    expect(phrases[0]).toBe('Custom Pepper Spray Safety');
    // Never "Ways to Use Custom" (no topic word) and never a phrase ending in "to", "custom", "branding" or a colon.
    for (const p of phrases) {
      expect(p).not.toMatch(/:/);
      expect(p).not.toMatch(/\b(?:to|for|the|custom|ways|use|branding)$/i);
      expect(p).not.toMatch(/^(?:\d+|to|for|the|ways|use)\b/i);
    }
    expect(phrases).toContain('Custom Pepper Spray');
    expect(phrases).toContain('Pepper Spray');
    expect(phrases.indexOf('Custom Pepper Spray')).toBeLessThan(phrases.indexOf('Pepper Spray'));
  });
  it('a one-word anchor must be a topic word that is also in the target address', () => {
    const koozies = target({ href: '/cat/koozies', label: 'Custom Koozies for Events', matchedTokens: ['koozies'] });
    const singles = topicAnchorCandidates(koozies).filter((c) => c.single).map((c) => c.phrase.toLowerCase());
    expect(singles).toEqual(['koozies']);
    // "events" is in the label and not generic by the old rule; it is never a candidate here.
    expect(topicAnchorCandidates(koozies).map((c) => c.phrase.toLowerCase())).not.toContain('events');
  });
  it('a target with no topic word has no candidates at all', () => {
    expect(topicAnchorCandidates(target({ href: '/videos/hats', label: 'Custom Hats for Business', matchedTokens: ['custom', 'business'] }))).toEqual([]);
  });

  it('a one-word anchor needs an address about nothing but the topic (the AUTO-201 proof run cases)', () => {
    const singles = (t: InternalLinkSuggestion) => topicAnchorCandidates(t).filter((c) => c.single).map((c) => c.phrase.toLowerCase());
    // Allowed: the page is about exactly the topic words.
    expect(singles(target({ href: '/cat/tote-bags', label: 'Custom Tote Bags for Branding & Everyday Use', kind: 'category', matchedTokens: ['tote', 'bags'] }))).toEqual(['tote', 'bags']);
    expect(singles(target({ href: '/cat/seat-cushions', label: 'Custom Seat Cushions for Comfort & Branding', kind: 'category', matchedTokens: ['seat', 'cushions'] }))).toEqual(['seat', 'cushions']);
    // Refused: the page is about something wider, so one word would mislead.
    expect(singles(target({ href: '/cat/lunch-bags-boxes-totes', label: 'Custom Lunch Bags, Boxes & Totes for Everyday Use', kind: 'category', matchedTokens: ['tote', 'bags'] }))).toEqual([]);
    expect(singles(target({ href: '/cat/seat-covers', label: 'Custom Seat Covers for Events & Branding', kind: 'category', matchedTokens: ['seat'] }))).toEqual([]);
    expect(singles(target({ href: '/videos/custom-debossed-water-bottles-for-business-branding', label: 'Custom Debossed Water Bottles for Business Branding', kind: 'video', matchedTokens: ['custom', 'water', 'bottles'] }))).toEqual([]);
    expect(singles(target({ href: '/blog/custom-pepper-spray-delivery-drivers-mobile-employees', label: 'Custom Pepper Spray for Delivery Drivers and Mobile Employees', matchedTokens: ['custom', 'for', 'employees'] }))).toEqual([]);
    // The phrase candidates of those targets are unaffected.
    expect(topicAnchorCandidates(target({ href: '/cat/lunch-bags-boxes-totes', label: 'Custom Lunch Bags, Boxes & Totes for Everyday Use', kind: 'category', matchedTokens: ['tote', 'bags'] })).map((c) => c.phrase)).toContain('Lunch Bags');
  });
});

describe('stem: singular and plural compare equal', () => {
  it('folds the plurals the catalog uses, and nothing else', () => {
    expect(stem('bottles')).toBe('bottle');
    expect(stem('bottle')).toBe('bottle');
    expect(stem('boxes')).toBe('box');
    expect(stem('sunglasses')).toBe('sunglass');
    expect(stem('koozies')).toBe('koozie');
    expect(stem('cushions')).toBe('cushion');
    expect(stem('totes')).toBe('tote');
    expect(stem('glass')).toBe('glass');
    expect(stem('Bags,')).toBe('bag');
  });
});

describe('placeInternalLinks, topic policy: the fragments the proof run produced do not come back', () => {
  it('never cuts a phrase on a word that belongs to the POST ("[Custom stadium]" out of "custom stadium seat cushions")', () => {
    const body = { intro: ['Custom stadium seat cushions solve that problem while keeping your logo in view.'], sections: [] };
    const blankets = target({ href: '/cat/stadium-blankets', label: 'Custom Stadium Blankets for Game Day', kind: 'category', matchedTokens: ['stadium'] });
    const without = placeInternalLinks(body, [blankets], 6, { anchorPolicy: 'topic' });
    expect(without.placed.map((p) => p.anchor)).toEqual(['Custom stadium']); // the target alone cannot see "seat"
    const withPost = placeInternalLinks(body, [blankets], 6, { anchorPolicy: 'topic', topicWords: ['custom stadium seat cushions'] });
    expect(withPost.placed).toEqual([]);
  });

  it('a phrase may follow a topic word ("stadium [seat cushions]"); a one-word anchor may not ("pepper [spray]")', () => {
    const body = { intro: ['Custom stadium seat cushions solve that problem, and pepper spray keeps drivers safe.'], sections: [] };
    const cushions = target({ href: '/cat/seat-cushions', label: 'Custom Seat Cushions for Comfort & Branding', kind: 'category', matchedTokens: ['seat', 'cushions'] });
    const r = placeInternalLinks(body, [cushions], 6, { anchorPolicy: 'topic', topicWords: ['custom stadium seat cushions'] });
    expect(r.placed.map((p) => p.anchor)).toEqual(['seat cushions']);
    const spray = target({ href: '/cat/spray', label: 'Spray', kind: 'category', matchedTokens: ['pepper', 'spray'] });
    expect(placeInternalLinks(body, [spray], 6, { anchorPolicy: 'topic' }).placed).toEqual([]);
  });

  it('reads the neighbours across a paragraph already split by an earlier link', () => {
    const body = { intro: ['Custom stadium seat cushions solve that problem while keeping your logo in view.'], sections: [] };
    const cushions = target({ href: '/cat/seat-cushions', label: 'Custom Seat Cushions for Comfort & Branding', kind: 'category', matchedTokens: ['seat', 'cushions'] });
    const blankets = target({ href: '/cat/stadium-blankets', label: 'Custom Stadium Blankets for Game Day', kind: 'category', matchedTokens: ['stadium'] });
    const r = placeInternalLinks(body, [cushions, blankets], 6, { anchorPolicy: 'topic', topicWords: ['custom stadium seat cushions'] });
    // "seat cushions" is linked first and splits the paragraph; "[Custom stadium]"
    // must still see the "seat" in the next span and be refused.
    expect(r.placed.map((p) => `[${p.anchor}] -> ${p.href}`)).toEqual(['[seat cushions] -> /cat/seat-cushions']);
  });

  it('never cuts a phrase before a singular neighbour ("[custom water]" beside "bottle")', () => {
    const body = { intro: ['A custom water bottle belongs in that kit because it gets used every day.'], sections: [] };
    const video = target({ href: '/videos/custom-water-bottles-brand-visibility', label: 'Custom Water Bottles That Turn Daily Use Into Brand Visibility', kind: 'video', matchedTokens: ['custom', 'water', 'bottles'] });
    const r = placeInternalLinks(body, [video], 6, { anchorPolicy: 'topic' });
    // The full phrase is matched in the singular; the fragment is never used.
    expect(r.placed.map((p) => p.anchor)).toEqual(['custom water bottle']);
  });
});

describe('placeInternalLinks, topic policy: the measured junk anchors do not come back', () => {
  const body = {
    intro: [
      'Custom koozies keep drinks cold at summer events and give every attendee something to take home.',
      'Businesses that order custom pepper sprays for delivery drivers see them used every day.',
      'Ornaments for the office tree are a gift that comes out every December.',
    ],
    sections: [
      { heading: 'Idea 1: Koozies', headingLevel: 'h2' as const, paragraphs: ['Koozies for events are the cheapest branded item on the table.'], products: { skus: ['1'] } },
      { heading: 'Idea 2', headingLevel: 'h2' as const, paragraphs: ['A list of custom ornaments for business clients goes a long way.'], list: { kind: 'bullet' as const, items: ['custom koozies in bulk'] } },
    ],
  };

  it('"[events]" never links to the koozies category; the product word does, on its own only because it is in the address', () => {
    const r = placeInternalLinks(
      body,
      [
        target({ href: '/blog/custom-koozies', label: 'Custom Koozies', kind: 'blog', matchedTokens: ['custom', 'koozies'] }),
        target({ href: '/cat/koozies', label: 'Custom Koozies for Events', kind: 'category', matchedTokens: ['koozies'] }),
      ],
      6,
      { anchorPolicy: 'topic' },
    );
    // "Custom koozies" is spent by the first target; "for events" is trimmed off
    // the second's label, so it falls to the one-word anchor "Koozies", which
    // is allowed because the word is in /cat/koozies.
    expect(anchorsOf(r)).toEqual(['[Custom koozies] -> /blog/custom-koozies', '[Koozies] -> /cat/koozies']);
  });

  it('a target matched only on "business" or "custom" is skipped, not forced onto a generic word', () => {
    const r = placeInternalLinks(
      body,
      [target({ href: '/videos/custom-hats-roi-for-business-buyers', label: 'Custom Hats and Promotional Products ROI for Business Buyers', kind: 'video', matchedTokens: ['custom', 'business'] })],
      6,
      { anchorPolicy: 'topic' },
    );
    expect(r.placed).toEqual([]);
  });

  it('matches a plural in the text and never cuts a product phrase ("[custom pepper]" out of "custom pepper sprays")', () => {
    const r = placeInternalLinks(
      body,
      [target({ href: '/blog/25-ways-use-custom-pepper-spray-safety-branding', label: '25 Ways to Use Custom Pepper Spray: Safety Branding', matchedTokens: ['custom', 'pepper', 'spray'] })],
      6,
      { anchorPolicy: 'topic' },
    );
    expect(anchorsOf(r)).toEqual(['[custom pepper sprays] -> /blog/25-ways-use-custom-pepper-spray-safety-branding']);
  });

  it('never ends an anchor on "for" and never includes punctuation', () => {
    const r = placeInternalLinks(
      body,
      [target({ href: '/cat/ornaments', label: 'Custom Ornaments for Business Gifting', kind: 'category', matchedTokens: ['ornaments'] })],
      6,
      { anchorPolicy: 'topic' },
    );
    expect(r.placed).toHaveLength(1);
    // "for Business Gifting" comes off the end of the label; the product phrase is what is linked.
    expect(r.placed[0].anchor).toBe('custom ornaments');
    expect(r.placed[0].anchor).not.toMatch(/[.,:;]$|\sfor$|\sbusiness$/i);
  });

  it('links only prose: headings, list items and product strips are untouched', () => {
    const r = placeInternalLinks(
      body,
      [target({ href: '/cat/koozies', label: 'Koozies', kind: 'category', matchedTokens: ['koozies'] })],
      6,
      { anchorPolicy: 'topic' },
    );
    const blocks = buildBlogBody(r.body);
    const text = blocks.filter((b): b is BlogTextBlock => b._type === 'block');
    for (const b of text) if (b.style !== 'normal' || b.listItem) expect(b.markDefs).toEqual([]);
    expect(blocks.filter((b) => b._type === 'blogProducts')).toHaveLength(1);
    expect(text.some((b) => b.style === 'normal' && !b.listItem && b.markDefs.length === 1)).toBe(true);
  });
});

describe('placeInternalLinks: the rules every placed link holds', () => {
  const prose = {
    intro: ['Custom pens, custom tote bags and custom mugs are the three giveaways every trade show table carries.'],
    sections: [
      { paragraphs: ['Pens go first. Tote bags go second.'] },
      { paragraphs: ['Mugs stay on desks for years, and pens again in case the first paragraph is spent.'] },
    ],
  };
  const pens = target({ href: '/cat/pens', label: 'Custom Pens', kind: 'category', matchedTokens: ['pens'] });
  const totes = target({ href: '/cat/tote-bags', label: 'Custom Tote Bags', kind: 'category', matchedTokens: ['tote', 'bags'] });
  const mugs = target({ href: '/cat/mugs', label: 'Custom Mugs', kind: 'category', matchedTokens: ['mugs'] });

  it('same tab: every blog-shape link carries openInNewTab false, and the body builder keeps it false', () => {
    const r = placeInternalLinks(prose, [pens, totes, mugs], 6, { anchorPolicy: 'topic' });
    const spans = (r.body.intro![0] as BlogInlineSpan[]).filter((s) => s.link);
    expect(spans.length).toBeGreaterThan(0);
    for (const s of spans) expect(s.link).toEqual({ href: s.link!.href, openInNewTab: false });
    const built = buildBlogBody(r.body).filter((b): b is BlogTextBlock => b._type === 'block');
    for (const b of built) for (const d of b.markDefs) expect(d.openInNewTab).toBe(false);
  });

  it('never the same target twice, even when it is suggested twice', () => {
    const r = placeInternalLinks(prose, [pens, { ...pens, label: 'Pens Buying Guide' }, pens], 6, { anchorPolicy: 'topic' });
    expect(r.placedHrefs).toEqual(['/cat/pens']);
  });

  it('never the same words twice: a second target cannot reuse an anchor already linked', () => {
    const r = placeInternalLinks(prose, [pens, target({ href: '/blog/pens-post', label: 'Pens', kind: 'blog', matchedTokens: ['pens'] })], 6, { anchorPolicy: 'topic' });
    const anchors = r.placed.map((p) => p.anchor.toLowerCase());
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('spreads across paragraphs before sharing one', () => {
    const r = placeInternalLinks(prose, [pens, totes, mugs], 6, { anchorPolicy: 'topic' });
    const intro = r.body.intro![0] as BlogInlineSpan[];
    const second = r.body.sections[0].paragraphs![0] as BlogInlineSpan[];
    const third = r.body.sections[1].paragraphs![0] as BlogInlineSpan[];
    expect(intro.filter((s) => s.link)).toHaveLength(1);
    expect(second.filter((s) => s.link)).toHaveLength(1);
    expect(third.filter((s) => s.link)).toHaveLength(1);
  });

  it('fewer good targets mean fewer links, never a forced one; the cap holds', () => {
    const none = placeInternalLinks(prose, [target({ href: '/cat/umbrellas', label: 'Custom Umbrellas', kind: 'category', matchedTokens: ['umbrellas'] })], 6, { anchorPolicy: 'topic' });
    expect(none.placed).toEqual([]);
    const capped = placeInternalLinks(prose, [pens, totes, mugs], 2, { anchorPolicy: 'topic' });
    expect(capped.placed).toHaveLength(2);
  });

  it('the result names each placed link with its anchor, label and kind', () => {
    const r = placeInternalLinks(prose, [pens], 6, { anchorPolicy: 'topic' });
    expect(r.placed).toEqual([{ href: '/cat/pens', anchor: 'Custom pens', label: 'Custom Pens', kind: 'category' }]);
  });
});

describe("the default 'label' policy is what every other caller had", () => {
  it('places the harness case exactly as before and returns placedHrefs unchanged in shape', () => {
    const r = placeInternalLinks(
      { intro: ['Ordering custom water bottles in bulk pays off for trade shows.'], sections: [] },
      [
        target({ label: 'Custom Water Bottles', href: '/cat/water-bottles', kind: 'category', reason: 'Category page matching the keywords: water, bottles' }),
        target({ label: 'Quantum Flux Capacitors', href: '/blog/quantum-flux', reason: 'Existing blog post sharing the keywords: quantum, flux' }),
      ],
    );
    expect(r.placedHrefs).toEqual(['/cat/water-bottles']);
    expect(r.placed[0].anchor).toBe('custom water bottles');
  });
  it('still takes a single label word under the old rule (the behaviour the topic policy replaces for blogs)', () => {
    const r = placeInternalLinks(
      { intro: ['Great at events of every size.'], sections: [] },
      [target({ label: 'Custom Koozies for Events', href: '/cat/koozies', kind: 'category', reason: 'Category page matching the keywords: koozies' })],
    );
    expect(r.placed.map((p) => p.anchor)).toEqual(['events']);
  });
});
