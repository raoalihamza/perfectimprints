import 'server-only';

import type { PortableTextBlock } from '@portabletext/react';
import { cachedClient } from '@/lib/sanity/client';
import { FAQS_TAG } from '@/lib/sanity/cache-tags';

// ---------------------------------------------------------------------------
// FAQ library (M5-506). `faq` docs carry a question, an answer, and a
// `faqCategory` (taxonomy in lib/faqs/categories.ts) that groups them into
// sections on /faq. We only ever surface ANSWERED faqs — a seeded question
// stub with an empty answer is hidden from both the page and search, so the
// library never shows (or links to) a blank answer.
// ---------------------------------------------------------------------------

export interface FaqDoc {
  _id: string;
  question: string;
  /** Rich text (Task B). Rendered with links; plain-texted for schema/search. */
  answer: PortableTextBlock[];
  faqCategory?: string;
}

// `answer` is now Portable Text (an array), so the old `answer != ""` string
// check no longer applies — require at least one block instead.
const ANSWERED_FILTER = `_type == "faq" && defined(answer) && count(answer) > 0`;

/** Answered FAQs for the /faq library page, ordered by question within a category. */
export async function getAnsweredFaqs(): Promise<FaqDoc[]> {
  try {
    // Non-CDN, cache-TAGGED read: the webhook revalidates FAQS_TAG on faq
    // publish so an edit goes live in seconds, and reading off api.sanity.io
    // (not the CDN) avoids the propagation race where the page would re-cache a
    // stale answer. Stays ISR-static (tagged, not no-store).
    const faqs = await cachedClient.fetch<FaqDoc[]>(
      `*[${ANSWERED_FILTER}]{ _id, question, answer, faqCategory } | order(question asc)`,
      {},
      { next: { tags: [FAQS_TAG], revalidate: false } },
    );
    return faqs ?? [];
  } catch {
    return [];
  }
}

export interface FaqSearchEntry {
  question: string;
  faqCategory?: string;
}

/** Minimal answered-FAQ entries for the live search delta (lib/search/sanity-index.ts). */
export async function getAllFaqSearchEntries(): Promise<FaqSearchEntry[]> {
  try {
    const entries = await cachedClient.fetch<FaqSearchEntry[]>(
      `*[${ANSWERED_FILTER}]{ question, faqCategory }`,
      {},
      { next: { tags: [FAQS_TAG], revalidate: false } },
    );
    return entries ?? [];
  } catch {
    return [];
  }
}
