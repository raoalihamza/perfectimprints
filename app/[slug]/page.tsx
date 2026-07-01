import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { SectionRenderer } from '@/components/page-sections/SectionRenderer';
import { CustomSchemaJsonLd } from '@/components/seo/CustomSchemaJsonLd';
import { getPageBySlug, getAllPageSlugs } from '@/lib/sanity/queries/pages';
import { RESERVED_SLUG_SET } from '@/lib/reserved-slugs';
import { SIMPLE_NAV } from '@/lib/nav-data';
import { socialMeta } from '@/lib/seo/open-graph';

/**
 * Top-level dynamic route for arbitrary custom `page` documents (Issue 2).
 *
 * Any published `page` whose slug is NOT reserved renders at `/<slug>` through
 * the same website-builder pipeline as Services/StaticPage (SectionRenderer +
 * breadcrumb + BreadcrumbList schema + injectable customSchema JSON-LD). This
 * lets Patrick recreate old-site top-level URLs (e.g. /llm-info-perfect-imprints)
 * from Studio without a code change — a publish goes live in seconds via the
 * Sanity webhook (revalidateTag PAGES_TAG + page:<slug> + revalidatePath).
 *
 * Route-collision reasoning (why this catch-all is safe):
 *  - In the Next.js App Router, a literal segment ("/blog") and a dedicated
 *    folder route (app/cat/[...slug], app/services/[slug], the eight static-page
 *    routes, app/api/*) ALWAYS beat a same-level dynamic [slug] segment. So all
 *    existing routes win and never reach app/[slug].
 *  - app/[slug] is SINGLE-segment, so multi-segment paths (/cat/water-bottles,
 *    /services/kitting, /blog/foo, /api/...) can't match it at all.
 *  - Defence-in-depth: we still `notFound()` for any reserved slug and for the
 *    Services page-doc slugs, so a `page` doc can never shadow a real route or
 *    render duplicate content at both /<slug> and /services/<slug>.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

// On-demand SSG: non-reserved page slugs prebuild via generateStaticParams; any
// other renders on first hit and caches at the edge until the next deploy /
// webhook revalidation. (Matches the Services / footer-page routes.)
export const dynamicParams = true;
export const revalidate = false;

// The Services page docs (slug "kitting", "company-stores", …) live at
// /services/<slug>. They are valid `page` docs (so NOT in the schema-level
// reserved list), but must not ALSO render at /<slug>. Derive them from the same
// nav source the Services route uses and exclude them here.
const SERVICE_SLUGS: string[] = (SIMPLE_NAV.find((n) => n.label === 'Services')?.children ?? [])
  .map((c) => c.href)
  .filter((h) => h.startsWith('/services/'))
  .map((h) => h.replace('/services/', ''));

// Slugs this route refuses to serve: reserved top-level routes/static pages +
// the Services page slugs (rendered under /services/).
const ROUTE_RESERVED = new Set<string>([...RESERVED_SLUG_SET, ...SERVICE_SLUGS]);

interface Props {
  params: Promise<{ slug: string }>;
}

// Dedupe the Sanity read between generateMetadata() and the page render.
const getPage = cache((slug: string) => getPageBySlug(slug));

export async function generateStaticParams() {
  const slugs = await getAllPageSlugs();
  return slugs.filter((slug) => !ROUTE_RESERVED.has(slug)).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (ROUTE_RESERVED.has(slug)) return {};
  const page = await getPage(slug);
  if (!page) return {};

  const title = page.seo?.metaTitle?.trim() || `${page.title} | Perfect Imprints`;
  const description = page.seo?.metaDescription?.trim() || undefined;
  const canonical = `${SITE_URL}/${slug}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    ...socialMeta({ title: page.title, description, url: canonical }),
  };
}

export default async function TopLevelPage({ params }: Props) {
  const { slug } = await params;
  if (ROUTE_RESERVED.has(slug)) notFound();

  const page = await getPage(slug);
  if (!page) notFound();

  return (
    <>
      <CustomSchemaJsonLd path={`/${slug}`} />
      <Container as="section" className="pb-2 pt-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: page.title }]} />
      </Container>

      <SectionRenderer sections={page.sections ?? []} />
    </>
  );
}
