import 'server-only';

import { client } from '@/lib/sanity/client';

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
  answer: string;
  faqCategory?: string;
}

const ANSWERED_FILTER = `_type == "faq" && defined(answer) && answer != ""`;

/** Answered FAQs for the /faq library page, ordered by question within a category. */
export async function getAnsweredFaqs(): Promise<FaqDoc[]> {
  try {
    const faqs = await client.fetch<FaqDoc[]>(
      `*[${ANSWERED_FILTER}]{ _id, question, answer, faqCategory } | order(question asc)`,
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
    const entries = await client.fetch<FaqSearchEntry[]>(
      `*[${ANSWERED_FILTER}]{ question, faqCategory }`,
    );
    return entries ?? [];
  } catch {
    return [];
  }
}
