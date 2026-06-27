import type { Metadata } from 'next';
import { PortableText, type PortableTextComponents } from '@portabletext/react';

import { Container } from '@/components/ui/Container';
import { Hero } from '@/components/home/Hero';
import { ValuePillars } from '@/components/home/ValuePillars';
// import { FeaturedBlocks } from '@/components/home/FeaturedBlocks';
import { BannerRow } from '@/components/home/BannerRow';
import { NewProductsRail } from '@/components/home/NewProductsRail';
import { BrandsStrip } from '@/components/home/BrandsStrip';
import { Testimonials } from '@/components/home/Testimonials';
import { BlogPreview } from '@/components/home/BlogPreview';
import { HomeCtaBanner } from '@/components/home/HomeCtaBanner';

import { getHomePage, getHomeCtaBanner } from '@/lib/sanity/queries/home';
import { getNewProducts } from '@/lib/new-products';
import { getAllBrands } from '@/lib/brands';
import { getBlogPostsPage } from '@/lib/sanity/queries/blogs';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.perfectimprints.com').replace(
  /\/$/,
  '',
);

export const dynamic = 'force-static';

// Links inside the bottom SEO text render in brand red (underline on hover) so
// they read as links; external links open in a new tab. Block/list styling is
// left to the surrounding `prose` classes.
const seoTextComponents: PortableTextComponents = {
  marks: {
    link: ({ value, children }) => {
      const href = (value?.href as string) || '#';
      const cls = 'text-brand-red no-underline hover:underline';
      const external = /^https?:\/\//i.test(href);
      return external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
          {children}
        </a>
      ) : (
        <a href={href} className={cls}>
          {children}
        </a>
      );
    },
  },
};

export const metadata: Metadata = {
  title: {
    absolute: 'Custom Promo Products & Branded Apparel by Perfect Imprints',
  },
  description:
    'Custom promotional products & branded apparel for bulk B2B orders. Shop 22,000+ trending promo items with free art proofs and rush options.',
  alternates: { canonical: `${SITE_URL}/` },
};

export default async function HomePage() {
  const [home, ctaBanner, newProducts, brands, blogPage] = await Promise.all([
    getHomePage(),
    getHomeCtaBanner(),
    Promise.resolve(getNewProducts(12)),
    getAllBrands(),
    getBlogPostsPage({ page: 1, perPage: 3 }).catch(() => ({
      posts: [],
      total: 0,
      totalPages: 0,
    })),
  ]);

  return (
    <>
      <Hero hero={home.hero} />
      <ValuePillars pillars={home.valueProps} />
      {/* <FeaturedBlocks blocks={home.featuredBlocks} /> */}
      <BannerRow
        banners={home.bannerRow}
        heading={home.bannerRowHeading}
        subheading={home.bannerRowSubheading}
      />
      <NewProductsRail products={newProducts} heading={home.newProductsHeading} />
      <Testimonials testimonials={home.testimonials} />
      <BrandsStrip
        brands={brands}
        heading={home.brandsHeading}
        subheading={home.brandsSubheading}
      />
      <BlogPreview posts={blogPage.posts} heading={home.blogPreviewHeading} />
      {home.textContent.length > 0 && (
        <section className="border-t border-border bg-white">
          <Container className="py-14 md:py-20">
            <div className="prose prose-neutral max-w-none text-text-primary">
              <PortableText value={home.textContent} components={seoTextComponents} />
            </div>
          </Container>
        </section>
      )}
      <HomeCtaBanner copy={ctaBanner} />
    </>
  );
}
