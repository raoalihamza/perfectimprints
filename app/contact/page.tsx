import { Container } from '@/components/ui/Container';
import { LeadForm } from '@/components/forms/LeadForm';
import { StaticPage, staticPageMetadata } from '@/components/page-sections/StaticPage';
import { OrganizationJsonLd } from '@/components/seo/OrganizationJsonLd';

export const revalidate = false;

export function generateMetadata() {
  return staticPageMetadata('contact', '/contact', 'Contact Us');
}

export default function ContactPage() {
  return (
    <StaticPage slug="contact" fallbackTitle="Contact Us">
      {/* Organization (local-business) JSON-LD — home + contact only (M-SEO3). */}
      <OrganizationJsonLd />
      {/* Lead form lives in code (not a page-builder section) so the Contact
          page always carries it; the editable copy/contact details come from
          the Sanity `page` doc sections rendered above. */}
      <Container as="section" className="pb-16">
        <div className="mx-auto w-full max-w-3xl rounded-lg border border-border bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-brand-ink">Send Us a Message</h2>
          <p className="mt-2 text-text-muted">
            Tell us what you need and our team will get back to you fast with product ideas and
            pricing.
          </p>
          <div className="mt-6">
            <LeadForm sourceUrl="/contact" />
          </div>
        </div>
      </Container>
    </StaticPage>
  );
}
