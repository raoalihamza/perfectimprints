import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { SectionRenderer } from '@/components/page-sections/SectionRenderer';
import { getPageBySlug } from '@/lib/sanity/queries/pages';
import { SIMPLE_NAV } from '@/lib/nav-data';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

// On-demand SSG: the four known service pages are pre-rendered; any other page
// doc whose slug matches a Services nav item renders on first hit and is cached
// at the edge until the next deploy / webhook revalidation.
export const dynamicParams = true;
export const revalidate = false;

// The Services route only serves `page` docs whose slug is one of the existing
// Services dropdown items (lib/nav-data.ts), so a generic page (e.g. an About
// page) can't accidentally resolve under /services/<slug>.
const SERVICE_SLUGS: string[] = (
  SIMPLE_NAV.find((n) => n.label === 'Services')?.children ?? []
)
  .map((c) => c.href)
  .filter((h) => h.startsWith('/services/'))
  .map((h) => h.replace('/services/', ''));

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return SERVICE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!SERVICE_SLUGS.includes(slug)) return {};
  const page = await getPageBySlug(slug);
  if (!page) return {};
  const title = page.seo?.metaTitle?.trim() || `${page.title} | Perfect Imprints`;
  const description = page.seo?.metaDescription?.trim() || undefined;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}/services/${slug}` },
  };
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params;
  if (!SERVICE_SLUGS.includes(slug)) notFound();

  const page = await getPageBySlug(slug);
  if (!page) notFound();

  return (
    <>
      <Container as="section" className="pb-2 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: page.title }]} />
      </Container>

      <SectionRenderer sections={page.sections ?? []} />
    </>
  );
}
