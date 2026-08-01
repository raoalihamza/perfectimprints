import { describe, expect, it } from 'vitest';

import {
  QUOTE_COMMENT_MAX_CHARS,
  VIEW_NOTIFY_WINDOW_MS,
  VIEW_RECORD_WINDOW_MS,
  decideViewHandling,
  isCustomerActionKind,
  isQuoteResponseKind,
  latestCustomerAction,
  millisSince,
  validateQuoteComment,
} from './quote-response';

const NOW = new Date('2026-08-01T12:00:00.000Z');
const SENT = '2026-07-30T09:00:00.000Z';

function agoMs(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe('kind guards', () => {
  it('accepts the three real kinds and nothing else', () => {
    expect(isQuoteResponseKind('viewed')).toBe(true);
    expect(isQuoteResponseKind('accepted')).toBe(true);
    expect(isQuoteResponseKind('revisionRequested')).toBe(true);
    expect(isQuoteResponseKind('deleted')).toBe(false);
    expect(isQuoteResponseKind(null)).toBe(false);
    expect(isQuoteResponseKind(7)).toBe(false);
  });

  it('treats a view as automatic, not a customer action', () => {
    expect(isCustomerActionKind('viewed')).toBe(false);
    expect(isCustomerActionKind('accepted')).toBe(true);
    expect(isCustomerActionKind('revisionRequested')).toBe(true);
  });
});

describe('validateQuoteComment', () => {
  it('requires a comment on a change request', () => {
    const result = validateQuoteComment('revisionRequested', '   ');
    expect(result.comment).toBeNull();
    expect(result.error).toMatch(/what you would like changed/i);
  });

  it('accepts a change request that explains itself', () => {
    const result = validateQuoteComment('revisionRequested', '  Please make it 500 units.  ');
    expect(result.error).toBeNull();
    expect(result.comment).toBe('Please make it 500 units.');
  });

  it('allows accepting with no comment at all', () => {
    expect(validateQuoteComment('accepted', '')).toEqual({ comment: null, error: null });
    expect(validateQuoteComment('accepted', undefined)).toEqual({ comment: null, error: null });
  });

  it('REJECTS an over-length comment rather than truncating it', () => {
    const tooLong = 'x'.repeat(QUOTE_COMMENT_MAX_CHARS + 1);
    const result = validateQuoteComment('accepted', tooLong);
    expect(result.comment).toBeNull();
    expect(result.error).toMatch(/keep your message under/i);
  });

  it('allows a comment exactly at the limit', () => {
    const exact = 'y'.repeat(QUOTE_COMMENT_MAX_CHARS);
    expect(validateQuoteComment('accepted', exact).error).toBeNull();
  });

  it('ignores non-string input', () => {
    expect(validateQuoteComment('accepted', { text: 'hi' }).comment).toBeNull();
    expect(validateQuoteComment('accepted', 42).error).toBeNull();
  });
});

describe('millisSince', () => {
  it('measures elapsed time from an ISO string', () => {
    expect(millisSince(agoMs(5000), NOW)).toBe(5000);
  });

  it('returns null for missing or unparseable input', () => {
    expect(millisSince(undefined, NOW)).toBeNull();
    expect(millisSince('', NOW)).toBeNull();
    expect(millisSince('not a date', NOW)).toBeNull();
    expect(millisSince(12345, NOW)).toBeNull();
  });

  it('clamps a future timestamp to zero rather than going negative', () => {
    expect(millisSince(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe(0);
  });
});

describe('decideViewHandling', () => {
  it('records and notifies the first view of a sent quote', () => {
    const d = decideViewHandling({ sentAt: SENT, now: NOW });
    expect(d).toMatchObject({ record: true, notify: true });
  });

  it('ignores a refresh inside the record window entirely', () => {
    const d = decideViewHandling({
      lastViewedAt: agoMs(VIEW_RECORD_WINDOW_MS - 1000),
      sentAt: SENT,
      now: NOW,
    });
    expect(d.record).toBe(false);
    expect(d.notify).toBe(false);
  });

  it('records but does not email a return visit between the two windows', () => {
    const d = decideViewHandling({
      lastViewedAt: agoMs(VIEW_RECORD_WINDOW_MS + 60_000),
      sentAt: SENT,
      now: NOW,
    });
    expect(d.record).toBe(true);
    expect(d.notify).toBe(false);
  });

  it('emails again once the notify window has passed', () => {
    const d = decideViewHandling({
      lastViewedAt: agoMs(VIEW_NOTIFY_WINDOW_MS + 60_000),
      sentAt: SENT,
      now: NOW,
    });
    expect(d.record).toBe(true);
    expect(d.notify).toBe(true);
  });

  it('never emails about a quote that has not been sent (Patrick previewing his own)', () => {
    const d = decideViewHandling({ sentAt: undefined, now: NOW });
    expect(d.record).toBe(true);
    expect(d.notify).toBe(false);
    expect(d.reason).toMatch(/not marked as sent/i);

    const blank = decideViewHandling({ sentAt: '   ', now: NOW });
    expect(blank.notify).toBe(false);
  });

  it('a refresh burst produces at most one record and one email', () => {
    // First hit: nothing stored yet.
    const first = decideViewHandling({ sentAt: SENT, now: NOW });
    expect(first.record && first.notify).toBe(true);
    // Every subsequent hit sees the timestamp the first one wrote.
    const justWritten = NOW.toISOString();
    for (const seconds of [1, 5, 30, 120, 900]) {
      const again = decideViewHandling({
        lastViewedAt: justWritten,
        sentAt: SENT,
        now: new Date(NOW.getTime() + seconds * 1000),
      });
      expect(again.record).toBe(false);
      expect(again.notify).toBe(false);
    }
  });
});

describe('latestCustomerAction', () => {
  it('returns null when there is nothing to report', () => {
    expect(latestCustomerAction(null)).toBeNull();
    expect(latestCustomerAction(undefined)).toBeNull();
    expect(latestCustomerAction([])).toBeNull();
  });

  it('ignores views entirely', () => {
    expect(
      latestCustomerAction([{ kind: 'viewed', createdAt: '2026-08-01T10:00:00.000Z' }]),
    ).toBeNull();
  });

  it('reports the newest action regardless of array order', () => {
    const result = latestCustomerAction([
      { kind: 'accepted', createdAt: '2026-07-01T10:00:00.000Z', comment: 'old' },
      { kind: 'viewed', createdAt: '2026-08-01T11:00:00.000Z' },
      { kind: 'revisionRequested', createdAt: '2026-07-20T10:00:00.000Z', comment: 'newer' },
    ]);
    expect(result).toEqual({
      kind: 'revisionRequested',
      createdAt: '2026-07-20T10:00:00.000Z',
      comment: 'newer',
    });
  });

  it('lets a later acceptance supersede an earlier change request', () => {
    const result = latestCustomerAction([
      { kind: 'revisionRequested', createdAt: '2026-07-20T10:00:00.000Z', comment: 'change it' },
      { kind: 'accepted', createdAt: '2026-07-25T10:00:00.000Z' },
    ]);
    expect(result?.kind).toBe('accepted');
    expect(result?.comment).toBeNull();
  });

  it('survives junk entries without throwing', () => {
    const result = latestCustomerAction([
      null as never,
      { kind: 'nonsense' },
      { kind: 'accepted' },
    ]);
    expect(result).toEqual({ kind: 'accepted', createdAt: null, comment: null });
  });
});
