/**
 * AUTO-208 Part 8: the morning email. One screen: per post, per failure,
 * the footer with both switches and the spend; and what a morning with
 * nothing written says.
 */
import { describe, expect, it } from 'vitest';
import { buildDigestEmail, dayWords, postLink, type DigestInput } from './digest';
import type { RunLogDocument } from './run-log';

const SITE = 'https://example.test';
const STUDIO = '/admin3773752';

function run(over: Partial<RunLogDocument>): RunLogDocument {
  return {
    _id: `blogAutomationRun.2026-10-17.${over.slot ?? 'a'}`,
    _type: 'blogAutomationRun',
    day: '2026-10-17',
    slot: 'a',
    status: 'written',
    stage: 'record',
    attempts: 1,
    claimedAt: '2026-10-17T02:00:03.000Z',
    updatedAt: '2026-10-17T02:03:10.000Z',
    ...over,
  };
}

function input(over: Partial<DigestInput> = {}): DigestInput {
  return {
    day: '2026-10-17',
    runs: [],
    switches: { paused: false, publishMode: 'draft' },
    imageCap: { used: 2, cap: 20 },
    sweep: null,
    siteUrl: SITE,
    studioPath: STUDIO,
    slots: 2,
    ...over,
  };
}

describe('buildDigestEmail', () => {
  it('two drafts: each with its title as a Studio link, topic, shape, words, product rows, picture and notes; the footer with both switches and the spend', () => {
    const email = buildDigestEmail(
      input({
        runs: [
          run({ slot: 'a', documentId: 'd1', title: '7 Custom Koozie Ideas', slug: '7-custom-koozie-ideas', words: 1712, titleShape: 'list', topic: { query: 'custom koozies', key: 'koozie' }, strips: { rows: 5, products: 18 }, pictureSource: 'ai', cost: { deepseekCalls: 1, deepseekUsd: 0.005, imageUsd: 0.15, totalUsd: 0.155, basis: 'x' } }),
          run({ slot: 'b', documentId: 'd2', title: 'Custom Wall Clocks: A Buyer\'s Guide', slug: 'custom-wall-clocks', words: 2251, titleShape: 'guide', topic: { query: 'custom wall clocks', key: 'clock' }, strips: { rows: 1, products: 7 }, pictureSource: 'product', notes: ['The title ran past 75 characters and was shortened.'], cost: { deepseekCalls: 2, deepseekUsd: 0.0055, imageUsd: 0, totalUsd: 0.0055, basis: 'x' } }),
        ],
      }),
    );
    expect(email.subject).toBe('Blog engine: 2 posts drafted last night (Saturday, October 17, 2026)');
    expect(email.text).toContain('Saved as a draft, the 10 pm slot: 7 Custom Koozie Ideas');
    expect(email.text).toContain(`${SITE}${STUDIO}/intent/edit/id=d1;type=blogPost`);
    expect(email.text).toContain('Topic "custom koozies"; a numbered list; 1712 words; 5 product rows (18 products); picture: an AI picture made from its product photos.');
    expect(email.text).toContain("Saved as a draft, the 4 am slot: Custom Wall Clocks: A Buyer's Guide");
    expect(email.text).toContain("a buyer's guide; 2251 words; 1 product row (7 products); picture: its first product's photo");
    expect(email.text).toContain('Note: The title ran past 75 characters and was shortened.');
    expect(email.text).toContain('Automatic posts: running.');
    expect(email.text).toContain('Each post: save as a draft for you to review.');
    expect(email.text).toContain('Spent last night: about USD 0.16 (estimated).');
    expect(email.text).toContain('2 of 20 generated pictures used today.');
    expect(email.html).toContain('<a href="https://example.test/admin3773752/intent/edit/id=d1;type=blogPost"');
    expect(email.html).not.toContain('<script');
  });

  it('a published post links to the live page and the subject says published', () => {
    const email = buildDigestEmail(input({ runs: [run({ status: 'published', publishedId: 'd1', documentId: 'd1', slug: 'live-post', title: 'Live Post', titleShape: 'question', topic: { query: 'q', key: 'q' } })], switches: { paused: false, publishMode: 'publish' } }));
    expect(email.subject).toContain('1 post published last night');
    expect(email.text).toContain(`Published, the 10 pm slot: Live Post`);
    expect(email.text).toContain(`${SITE}/blog/live-post`);
    expect(email.text).toContain('Each post: publish straight away.');
  });

  it('a failure: the stage in plain words and the sentence; a failed publish names the complete draft that remains', () => {
    const email = buildDigestEmail(
      input({
        runs: [
          run({ slot: 'a', status: 'failed', stage: 'generate', attempts: 2, error: { stage: 'generate', message: 'DeepSeek did not answer within 150 seconds. Try again.' } }),
          run({ slot: 'b', status: 'failed', stage: 'publish', draftId: 'drafts.d2', documentId: 'd2', title: 'Nearly Live', error: { stage: 'publish', message: 'transaction refused' } }),
        ],
      }),
    );
    expect(email.subject).toContain('nothing was written last night');
    expect(email.text).toContain('the 10 pm slot, attempt 2: failed while writing the post. DeepSeek did not answer within 150 seconds. Try again. Nothing was saved.');
    expect(email.text).toContain('the 4 am slot, attempt 1: failed while publishing the post. transaction refused A complete draft was saved ("Nearly Live"); only the publish step failed.');
  });

  it('nothing written and paused: says the automation is paused and how to start it', () => {
    const email = buildDigestEmail(input({ switches: { paused: true, publishMode: 'draft' } }));
    expect(email.text).toContain('PAUSED in Global Settings, so nothing ran');
    expect(email.text).toContain('Automatic posts: PAUSED');
  });

  it('nothing written and running: says no run reached a slot and points Ali at the cron log', () => {
    const email = buildDigestEmail(input());
    expect(email.text).toContain('No run reached either slot');
    expect(email.text).toContain('/api/cron/blog-automation');
  });

  it('a stuck run and the weekly sweep line are reported; a missing image counter is said, not invented', () => {
    const email = buildDigestEmail(input({ runs: [run({ status: 'running', stage: 'generate' })], sweep: { sentence: 'Found 3 leftover generated header pictures; nothing was removed.' }, imageCap: null }));
    expect(email.text).toContain('a run is marked running and never finished');
    expect(email.text).toContain('WEEKLY TIDY-UP');
    expect(email.text).toContain('Found 3 leftover generated header pictures');
    expect(email.text).toContain('the picture counter could not be read');
  });

  it('helpers', () => {
    expect(dayWords('2026-10-17')).toBe('Saturday, October 17, 2026');
    expect(dayWords('bad')).toBe('bad');
    expect(postLink(run({ status: 'published', slug: 's' }), `${SITE}/`, STUDIO)).toBe(`${SITE}/blog/s`);
    expect(postLink(run({ documentId: 'x y' }), SITE, STUDIO)).toBe(`${SITE}${STUDIO}/intent/edit/id=x%20y;type=blogPost`);
  });
});
