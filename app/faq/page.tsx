import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { FaqList } from '@/components/faqs/FaqList';
import { faqPageSchema } from '@/lib/seo/schema-generators';
import { getAnsweredFaqs } from '@/lib/sanity/queries/faqs';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

// FAQs are Sanity content. Weekly ISR floor + the publish webhook
// (revalidatePath('/faq')) keep the page fresh without a redeploy.
export const revalidate = 604800;

export const metadata: Metadata = {
  title: { absolute: 'Frequently Asked Questions | Perfect Imprints' },
  description:
    'Answers to common questions about ordering custom promotional products from Perfect Imprints — quotes, minimums, artwork and proofs, production, rush orders, shipping, and more.',
  alternates: { canonical: `${SITE_URL}/faq` },
};

export default async function FaqsPage() {
  const faqs = await getAnsweredFaqs();

  return (
    <Container as="section" className="pb-16 pt-6">
      {/* Centered, comfortable-width reading column so the page doesn't sprawl
          full-width on large screens (M5-506 follow-up). */}
      <div className="mx-auto max-w-4xl">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'FAQs' }]} />

        <div className="mt-6 text-center">
          <h1 className="text-3xl font-bold leading-tight text-brand-ink md:text-4xl">
            Frequently Asked Questions
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-text-primary">
            Everything you need to know about ordering custom promotional products with Perfect
            Imprints. Can&rsquo;t find your answer? We&rsquo;re happy to help.
          </p>
        </div>

        {faqs.length > 0 ? (
          <>
            <FaqList faqs={faqs} />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify(
                  faqPageSchema(faqs.map((f) => ({ question: f.question, answer: f.answer }))),
                ),
              }}
            />
          </>
        ) : (
          <div className="mt-10 rounded-lg border border-border bg-bg-soft p-8 text-center">
            <p className="text-text-primary">
              Our FAQ library is on its way. In the meantime, reach out and a member of our team will
              answer any question you have.
            </p>
          </div>
        )}

        <div className="mt-12 rounded-lg border border-border bg-bg-soft p-6 text-center sm:p-8">
          <h2 className="text-xl font-bold text-brand-ink">Still have questions?</h2>
          <p className="mx-auto mt-2 max-w-xl text-text-primary">
            Call{' '}
            <a href="tel:800-773-9472" className="font-semibold text-brand-red">
              800-773-9472
            </a>{' '}
            or send us a message and we&rsquo;ll get you the answers you need.
          </p>
          <Link
            href="/contact"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-brand-green px-6 font-semibold text-white hover:opacity-90"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </Container>
  );
}
