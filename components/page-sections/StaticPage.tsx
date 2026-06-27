import 'server-only';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { SectionRenderer } from './SectionRenderer';
import { getPageBySlug } from '@/lib/sanity/queries/pages';
import { socialMeta } from '@/lib/seo/open-graph';

/**
 * Shared renderer for the footer/legal static pages (M5-506) — About, Contact,
 * Sample Policy, U.S. & International Shipping, Returns & Refunds, Privacy &
 * Security, Company Core Values, Terms of Service.
 *
 * Each lives at a top-level route (`/about`, `/sample-policy`, …) backed by a
 * generic `page` Sanity doc of the same slug, so Patrick edits the copy in the
 * same website-builder used for Services. The route file is a 3-line wrapper
 * around `StaticPage` + `staticPageMetadata`; the content + section order is all
 * in Sanity. Breadcrumbs emit BreadcrumbList JSON-LD; the page's first
 * `heroBanner` section provides the H1.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

// Dedupe the Sanity read between generateMetadata() and the page render.
const getPage = cache((slug: string) => getPageBySlug(slug));

export async function staticPageMetadata(
  slug: string,
  path: string,
  fallbackTitle: string,
): Promise<Metadata> {
  const page = await getPage(slug);
  const title = page?.seo?.metaTitle?.trim() || `${page?.title || fallbackTitle} | Perfect Imprints`;
  const description = page?.seo?.metaDescription?.trim() || undefined;
  const canonical = `${SITE_URL}${path}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    ...socialMeta({
      title: page?.title || fallbackTitle,
      description,
      url: canonical,
    }),
  };
}

export async function StaticPage({
  slug,
  fallbackTitle,
  children,
}: {
  slug: string;
  fallbackTitle: string;
  children?: ReactNode;
}) {
  const page = await getPage(slug);
  if (!page) notFound();

  return (
    <>
      <Container as="section" className="pb-2 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: page.title || fallbackTitle }]} />
      </Container>

      <SectionRenderer sections={page.sections ?? []} />

      {children}
    </>
  );
}
