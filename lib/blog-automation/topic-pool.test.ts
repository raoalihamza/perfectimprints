/**
 * AUTO-110: the blog opportunity pool and its cannibalization guard, the pure
 * half. Every rule AUTO-100 recommended is asserted here so the route, the
 * measuring script and the Studio panel cannot drift from it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NEAR_GENERIC_WORDS, NON_SIGNIFICANT_MATCH_WORDS } from '../ai/brand-voice';
import {
  CANNIBALIZATION_THRESHOLD,
  POOL_IMPRESSIONS_FLOOR,
  POOL_POSITION_HIGH,
  POOL_POSITION_LOW,
  POOL_WINDOW_DAYS,
  applyGuard,
  applyNegativeKeywords,
  compactTopic,
  expandTopic,
  blockingTerm,
  countTopics,
  decideGuard,
  detectorInput,
  groupIntoTopics,
  isBlogPath,
  isPoolQuery,
  negativeKeywordBlocks,
  sectionOfPath,
  sharedTokensFromReason,
  significantTokens,
  singularToken,
  sitePath,
  topPageByQuery,
  topicKey,
  type PoolQuery,
  type Topic,
} from './topic-pool';

const ROOT = join(__dirname, '..', '..');

describe('the numbers AUTO-100 settled', () => {
  it('are the ones the report recommended', () => {
    expect(POOL_WINDOW_DAYS).toBe(90);
    expect(POOL_IMPRESSIONS_FLOOR).toBe(10);
    expect(POOL_POSITION_LOW).toBe(8);
    expect(POOL_POSITION_HIGH).toBe(40);
    expect(CANNIBALIZATION_THRESHOLD).toBe(2);
  });

  it('the shared list carries the promo words and the filler, and the near-generic five sit beside it', () => {
    for (const w of ['custom', 'branded', 'the', 'for', 'ideas']) expect(NON_SIGNIFICANT_MATCH_WORDS.has(w)).toBe(true);
    for (const w of ['products', 'items', 'gift', 'business', 'company']) {
      expect(NEAR_GENERIC_WORDS).toContain(w);
      // Deliberately NOT in the matcher's list (brand-voice.ts says why).
      expect(NON_SIGNIFICANT_MATCH_WORDS.has(w)).toBe(false);
    }
  });
});

describe('tokens and grouping', () => {
  it('strips generic promo words and filler for the grouping key, folds plurals, sorts', () => {
    expect(topicKey('custom mini footballs')).toBe('football mini');
    expect(topicKey('Mini Football Custom')).toBe('football mini');
    expect(topicKey('ideas for the best water bottles')).toBe('bottle water');
    expect(topicKey('custom promotional products')).toBe('product');
    expect(topicKey('custom branded')).toBe('');
  });

  it('keeps the near-generic words in the grouping key but not in the detector input', () => {
    expect(significantTokens('gifts for truck drivers')).toEqual(['gifts', 'truck', 'drivers']);
    expect(detectorInput('gifts for truck drivers')).toBe('truck drivers');
    expect(detectorInput('cheap promotional items')).toBe('cheap');
    expect(detectorInput('business gifts')).toBe('');
  });

  it('folds plurals the way AUTO-100 did', () => {
    expect(singularToken('bottles')).toBe('bottle');
    expect(singularToken('companies')).toBe('company');
    expect(singularToken('boxes')).toBe('box');
    expect(singularToken('glass')).toBe('glass');
    expect(singularToken('caps')).toBe('cap');
  });

  it('reads the shared tokens out of a detector reason string', () => {
    expect(sharedTokensFromReason('Existing blog post sharing the keywords: gifts, truck, drivers')).toEqual([
      'gifts',
      'truck',
      'drivers',
    ]);
    expect(sharedTokensFromReason(undefined)).toEqual([]);
    expect(sharedTokensFromReason('no colon here')).toEqual([]);
  });

  it('groups queries into topics with the most-impressions member as the representative', () => {
    const queries: PoolQuery[] = [
      { query: 'mini football custom', clicks: 1, impressions: 100, position: 20, page: '/cat/mini-footballs' },
      { query: 'custom mini footballs', clicks: 5, impressions: 617, position: 12, page: '/blog/buying-guide-for-mini-footballs' },
      { query: 'drink tokens', clicks: 3, impressions: 700, position: 9, page: '/blog/free-drink-tokens' },
    ];
    const topics = groupIntoTopics(queries);
    expect(topics.map((t) => t.query)).toEqual(['custom mini footballs', 'drink tokens']);
    const footballs = topics[0];
    expect(footballs.key).toBe('football mini');
    expect(footballs.variants).toEqual(['custom mini footballs', 'mini football custom']);
    expect(footballs.clicks).toBe(6);
    expect(footballs.impressions).toBe(717);
    // Impressions-weighted: (12*617 + 20*100) / 717 = 13.1
    expect(footballs.position).toBe(13.1);
    expect(footballs.page).toBe('/blog/buying-guide-for-mini-footballs');
    expect(footballs.detectorInput).toBe('mini footballs');
  });

  it('a query made only of generic words is its own topic, keyed by the raw query', () => {
    const topics = groupIntoTopics([
      { query: 'custom branded', clicks: 0, impressions: 12, position: 30, page: null },
      { query: 'branded custom', clicks: 0, impressions: 11, position: 30, page: null },
    ]);
    expect(topics).toHaveLength(2);
    expect(topics.map((t) => t.key).sort()).toEqual(['branded custom', 'custom branded']);
  });
});

describe('the pool filter and the ranking page', () => {
  it('keeps the band inclusive and the floor inclusive', () => {
    expect(isPoolQuery({ impressions: 10, position: 8 })).toBe(true);
    expect(isPoolQuery({ impressions: 10, position: 40 })).toBe(true);
    expect(isPoolQuery({ impressions: 9, position: 20 })).toBe(false);
    expect(isPoolQuery({ impressions: 500, position: 7.9 })).toBe(false);
    expect(isPoolQuery({ impressions: 500, position: 40.1 })).toBe(false);
  });

  it('picks the top page by clicks, then impressions', () => {
    const map = topPageByQuery([
      { keys: ['thunder sticks', 'https://www.perfectimprints.com/cat/thundersticks'], clicks: 2, impressions: 900 },
      { keys: ['thunder sticks', 'https://www.perfectimprints.com/blog/what-are-thunder-sticks'], clicks: 7, impressions: 2000 },
      { keys: ['tote bags', 'https://www.perfectimprints.com/cat/tote-bags'], clicks: 0, impressions: 50 },
      { keys: ['tote bags', 'https://www.perfectimprints.com/blog/tote-bags-guide'], clicks: 0, impressions: 40 },
    ]);
    expect(map.get('thunder sticks')).toBe('https://www.perfectimprints.com/blog/what-are-thunder-sticks');
    expect(map.get('tote bags')).toBe('https://www.perfectimprints.com/cat/tote-bags');
  });

  it('shortens www URLs to a path and leaves any other host whole', () => {
    expect(sitePath('https://www.perfectimprints.com/blog/free-drink-tokens')).toBe('/blog/free-drink-tokens');
    expect(sitePath('https://dev.perfectimprints.com/blog/x')).toBe('https://dev.perfectimprints.com/blog/x');
    expect(sitePath(undefined)).toBeNull();
    expect(isBlogPath('/blog/free-drink-tokens')).toBe(true);
    expect(isBlogPath('/blog')).toBe(false);
    expect(isBlogPath('/cat/pens')).toBe(false);
    expect(isBlogPath(null)).toBe(false);
    expect(sectionOfPath('/cat/pens')).toBe('/cat/');
    expect(sectionOfPath('/')).toBe('home');
    expect(sectionOfPath(null)).toBe('none');
  });
});

describe('the guard: two rules, AUTO-100 recommendation', () => {
  const hit = (tokens: string[]) => ({ sharedTokens: tokens, postTitle: 'Free Drink Tokens', postHref: '/blog/free-drink-tokens' });

  it('rule one excludes at the threshold and passes below it', () => {
    expect(decideGuard({ page: '/cat/drink-tokens' }, hit(['drink', 'tokens'])).state).toBe('excluded');
    expect(decideGuard({ page: '/cat/drink-tokens' }, hit(['drink', 'tokens'])).rule).toBe('shared-tokens');
    expect(decideGuard({ page: '/cat/drink-tokens' }, hit(['tokens'])).state).toBe('usable');
    expect(decideGuard({ page: '/cat/drink-tokens' }, null).state).toBe('usable');
  });

  it('rule two excludes a query whose ranking page is already a blog post, whatever the detector says', () => {
    const d = decideGuard({ page: '/blog/what-are-thunder-sticks' }, hit(['thunder']));
    expect(d.state).toBe('excluded');
    expect(d.rule).toBe('ranking-page');
    expect(d.reason).toContain('/blog/what-are-thunder-sticks');
    expect(d.reason).toContain('already ranks');
    expect(decideGuard({ page: '/blog/x' }, null).state).toBe('excluded');
  });

  it('names both rules when both fire, and the reason carries the shared tokens and the post', () => {
    const d = decideGuard({ page: '/blog/free-drink-tokens' }, hit(['drink', 'tokens']));
    expect(d.rule).toBe('both');
    expect(d.reason).toContain('drink, tokens');
    expect(d.reason).toContain('Free Drink Tokens');
    expect(d.reason).toContain('/blog/free-drink-tokens');
    expect(d.matchedPost).toEqual({ title: 'Free Drink Tokens', href: '/blog/free-drink-tokens' });
  });

  it('a usable topic carries no reason and no rule, but keeps what the detector found', () => {
    const d = decideGuard({ page: '/cat/drink-tokens' }, hit(['tokens']));
    expect(d.reason).toBeNull();
    expect(d.rule).toBeNull();
    expect(d.sharedTokens).toEqual(['tokens']);
    expect(d.matchedPost?.title).toBe('Free Drink Tokens');
  });

  it('the threshold is read from the one constant and can be overridden for tuning', () => {
    expect(decideGuard({ page: null }, hit(['a', 'b'])).state).toBe('excluded');
    expect(decideGuard({ page: null }, hit(['a', 'b']), 3).state).toBe('usable');
  });

  it('every excluded topic has a reason', () => {
    const cases = [
      decideGuard({ page: '/blog/x' }, null),
      decideGuard({ page: null }, hit(['a', 'b'])),
      decideGuard({ page: '/blog/x' }, hit(['a', 'b', 'c'])),
    ];
    for (const c of cases) {
      expect(c.state).toBe('excluded');
      expect(typeof c.reason).toBe('string');
      expect((c.reason ?? '').length).toBeGreaterThan(10);
    }
  });
});

describe('negative keywords', () => {
  it('a single word blocks every query that carries it, plural or singular', () => {
    expect(negativeKeywordBlocks('fun facts about paramedics', 'paramedics')).toBe(true);
    expect(negativeKeywordBlocks('paramedic gifts', 'paramedics')).toBe(true);
    expect(negativeKeywordBlocks('paramedic gifts', 'Paramedic')).toBe(true);
    expect(negativeKeywordBlocks('nurse gifts', 'paramedics')).toBe(false);
  });

  it('a whole query as the term blocks its own topic group and nothing wider', () => {
    const term = 'fun facts about paramedics';
    expect(negativeKeywordBlocks('fun facts about paramedics', term)).toBe(true);
    expect(negativeKeywordBlocks('about paramedics fun fact', term)).toBe(true);
    // "about" is not in the filler list, so a query without it is a different topic group and stays.
    expect(negativeKeywordBlocks('paramedics fun fact', term)).toBe(false);
    expect(negativeKeywordBlocks('paramedic gifts', term)).toBe(false);
  });

  it('a term made only of generic words falls back to its plain tokens instead of blocking everything', () => {
    expect(negativeKeywordBlocks('custom promotional products', 'custom products')).toBe(true);
    expect(negativeKeywordBlocks('custom water bottles', 'custom products')).toBe(false);
    expect(negativeKeywordBlocks('anything at all', '')).toBe(false);
    expect(negativeKeywordBlocks('anything at all', '   ')).toBe(false);
  });

  it('applies on top of the guard and comes off cleanly, restoring the guard verdict', () => {
    const base = (query: string, page: string | null): Topic =>
      applyGuard(
        { key: topicKey(query), query, variants: [query], clicks: 0, impressions: 20, position: 15, page, detectorInput: detectorInput(query) },
        null,
      );
    const topics = [base('fun facts about paramedics', '/cat/ems'), base('nurse week gifts', '/blog/nurse-week')];
    const blocked = applyNegativeKeywords(topics, ['paramedics']);
    expect(blocked[0].state).toBe('blocked');
    expect(blocked[0].blockedBy).toBe('paramedics');
    expect(blocked[1].state).toBe('excluded');
    const unblocked = applyNegativeKeywords(blocked, []);
    expect(unblocked[0].state).toBe('usable');
    expect(unblocked[0].blockedBy).toBeNull();
    expect(unblocked[1].state).toBe('excluded');
    expect(unblocked[1].rule).toBe('ranking-page');
    expect(blockingTerm('fun facts about paramedics', ['nurses', 'paramedics'])).toBe('paramedics');
    expect(blockingTerm('fun facts about paramedics', [])).toBeNull();
  });

  it('counts by state and by rule', () => {
    const mk = (query: string, page: string | null, tokens: string[]): Topic =>
      applyGuard(
        { key: topicKey(query), query, variants: [query], clicks: 0, impressions: 20, position: 15, page, detectorInput: detectorInput(query) },
        tokens.length ? { sharedTokens: tokens, postTitle: 'P', postHref: '/blog/p' } : null,
      );
    const topics = applyNegativeKeywords(
      [mk('a b', null, []), mk('c d', '/blog/p', []), mk('e f', null, ['e', 'f']), mk('g h', '/blog/p', ['g', 'h']), mk('paramedics', null, [])],
      ['paramedics'],
    );
    expect(countTopics(topics)).toEqual({
      topics: 5,
      usable: 1,
      excluded: 3,
      blocked: 1,
      excludedBySharedTokens: 1,
      excludedByRankingPage: 1,
      excludedByBoth: 1,
    });
  });
});

describe('structural guards', () => {
  const sourceFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
      else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) out.push(full);
    }
    return out;
  };

  it('the threshold is spelled in exactly one place', () => {
    const files = ['app', 'lib', 'sanity', 'scripts'].flatMap((d) => sourceFiles(join(ROOT, d)));
    const definers = files.filter((f) => /CANNIBALIZATION_THRESHOLD\s*=/.test(readFileSync(f, 'utf8')));
    expect(definers.map((f) => f.replace(ROOT, '').replace(/\\/g, '/'))).toEqual(['/lib/blog-automation/topic-pool.ts']);
  });

  it('the near-generic words are spelled in exactly one place', () => {
    const files = ['app', 'lib', 'sanity', 'scripts'].flatMap((d) => sourceFiles(join(ROOT, d)));
    const spellers = files.filter((f) => /['"]businesses['"]/.test(readFileSync(f, 'utf8')));
    expect(spellers.map((f) => f.replace(ROOT, '').replace(/\\/g, '/'))).toEqual(['/lib/ai/brand-voice.ts']);
  });

  it('the matcher reads the shared list rather than keeping its own copy', () => {
    const src = readFileSync(join(ROOT, 'lib', 'ai', 'related-products.ts'), 'utf8');
    expect(src).toContain('NON_SIGNIFICANT_MATCH_WORDS');
    expect(src).not.toMatch(/'ideas',\s*\n\s*'idea',/);
  });

  it('this module is pure: no fetch, no Sanity, no fs, no next', () => {
    const src = readFileSync(join(__dirname, 'topic-pool.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"](node:fs|next\/|@sanity|\.\.\/sanity)/);
    expect(src).not.toContain('fetch(');
  });
});

describe('the cached shape (compact) round-trips to the same verdict', () => {
  const build = (query: string, page: string | null, tokens: string[]): Topic =>
    applyGuard(
      { key: topicKey(query), query, variants: [query, `${query} bulk`], clicks: 2, impressions: 40, position: 12.3, page, detectorInput: detectorInput(query) },
      tokens.length ? { sharedTokens: tokens, postTitle: 'Free Drink Tokens', postHref: '/blog/free-drink-tokens' } : null,
    );

  it('drops the verdict and the detector input, keeps the figures and what the detector found', () => {
    const t = build('drink tokens', '/cat/drink-tokens', ['drink', 'tokens']);
    const c = compactTopic(t);
    expect(Object.keys(c).sort()).toEqual(['clicks', 'impressions', 'key', 'matchedPost', 'page', 'position', 'query', 'sharedTokens', 'variants']);
    expect(c.matchedPost).toEqual({ title: 'Free Drink Tokens', href: '/blog/free-drink-tokens' });
  });

  it('expands back to exactly the topic the builder produced, for every state', () => {
    for (const t of [
      build('drink tokens', '/cat/drink-tokens', ['drink', 'tokens']),
      build('drink tokens', '/blog/free-drink-tokens', ['drink', 'tokens']),
      build('thunder sticks', '/blog/what-are-thunder-sticks', ['thunder']),
      build('custom pedometers', '/cat/pedometers', []),
      build('promotional balloons', '/cat/balloons', ['balloons']),
    ]) {
      expect(expandTopic(compactTopic(t))).toEqual(t);
    }
  });

  it('applies the threshold it is given, so tuning needs no refresh', () => {
    const t = build('drink tokens', '/cat/drink-tokens', ['drink', 'tokens']);
    expect(expandTopic(compactTopic(t), 3).state).toBe('usable');
    expect(expandTopic(compactTopic(t), 2).state).toBe('excluded');
  });
});
