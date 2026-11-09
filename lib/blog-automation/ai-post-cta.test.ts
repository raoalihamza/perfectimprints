/**
 * AUTO-212 Part 1: Patrick's CTA on posts the AI writes.
 *
 *   Heading: Get Help with 'KEYWORD'
 *   Body:    Our team can help you pick the right 'KEYWORD', decoration, and
 *            quantity for your project. Reach out and we'll send tailored
 *            ideas, usually within one business day. (his dash, kept)
 *
 * KEYWORD is the post's search topic (`sourceTopic.query`). Written into a
 * NEW generated draft's `ctaTopic` / `ctaBody` once, at creation; no existing
 * post changes and the render path is untouched.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_POST_CTA_BODY, AI_POST_CTA_HEADING, DEFAULT_CTA_BODY } from '../blog/cta-defaults';
import { aiPostCta, buildBlogDraftDocument } from './draft-document';

const generated = {
  title: 'Are Promotional Caps Good for Trade Shows?',
  metaTitle: 'm',
  metaDescription: 'd',
  excerpt: 'e',
  body: [],
  suggestedLinks: [],
};

describe("Patrick's CTA on AI posts (AUTO-212)", () => {
  it('is his wording exactly, with the dash and apostrophe of his existing copy', () => {
    expect(AI_POST_CTA_HEADING).toBe('Get Help with {KEYWORD}');
    expect(AI_POST_CTA_BODY).toBe(
      'Our team can help you pick the right {KEYWORD}, decoration, and quantity for your project. Reach out and we’ll send tailored ideas — usually within one business day.',
    );
    // The body is the default body with the keyword where it said "product", nothing else.
    expect(AI_POST_CTA_BODY.replace('{KEYWORD}', 'product')).toBe(DEFAULT_CTA_BODY);
  });

  it('fills the keyword: title case in the heading, as searched in the body', () => {
    expect(aiPostCta('promotional caps')).toEqual({
      heading: 'Get Help with Promotional Caps',
      body: 'Our team can help you pick the right promotional caps, decoration, and quantity for your project. Reach out and we’ll send tailored ideas — usually within one business day.',
    });
    expect(aiPostCta('ink pens with logo')?.heading).toBe('Get Help with Ink Pens with Logo');
    expect(aiPostCta('  engraved   pens ')?.body).toContain('the right engraved pens, decoration');
  });

  it('gives nothing for a blank keyword, so the post keeps the automatic heading and the default body', () => {
    for (const k of ['', '   ', null, undefined, 42]) expect(aiPostCta(k)).toBeNull();
  });

  it('a new generated draft carries it, from the topic it was written for', () => {
    const doc = buildBlogDraftDocument({
      documentId: 'x',
      generated,
      template: 'single',
      wordCount: 1500,
      topic: { key: 'cap promotional', query: 'promotional caps', variants: [] },
      recordedAt: '2026-11-05T00:00:00.000Z',
      keyFor: (p) => `${p}-1`,
    });
    expect(doc.ctaTopic).toBe('Get Help with Promotional Caps');
    expect(doc.ctaBody).toBe(aiPostCta('promotional caps')?.body);
  });

  it('the page renders the stored heading and body verbatim, unchanged, so only new drafts are affected', () => {
    const cta = readFileSync('components/blog/OrderTodayCTA.tsx', 'utf8');
    expect(cta).toContain('{heading || `Order Custom ${topic} Today`}');
    expect(cta).toContain('{body || DEFAULT_CTA_BODY}');
    expect(cta).not.toContain('AI_POST_CTA');
  });

  it('is written by the draft builder and by nothing else (no backfill, no Studio action, no render path)', () => {
    const writers = ['lib/blog-automation/draft-document.ts'];
    const candidates = [
      'lib/blog-automation/create-blog-draft.ts',
      'lib/blog-automation/scheduler.ts',
      'sanity/actions/generate-blog-with-ai.tsx',
      'sanity/tools/blog-topics-tool.tsx',
      'app/blog/[slug]/page.tsx',
      'components/blog/OrderTodayCTA.tsx',
    ];
    for (const f of writers) expect(readFileSync(f, 'utf8')).toContain('aiPostCta(args.topic.query)');
    for (const f of candidates) expect(readFileSync(f, 'utf8')).not.toMatch(/AI_POST_CTA|aiPostCta/);
  });
});
