import type { Metadata } from 'next';
import { PortableText } from '@portabletext/react';

import { Container } from '@/components/ui/Container';
import { Hero } from '@/components/home/Hero';
import { ValuePillars } from '@/components/home/ValuePillars';
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

export const metadata: Metadata = {
  title: {
    absolute: 'Perfect Imprints — Custom Promotional Products, Apparel & Bulk Giveaways',
  },
  description:
    'Custom promotional products and branded apparel for bulk B2B orders. 22,000+ items, wholesale pricing, free art proofs, rush production. Marketing, HR, safety, and corporate gifts.',
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
            <div className="prose prose-neutral max-w-3xl text-text-primary">
              <PortableText value={home.textContent} />
            </div>
          </Container>
        </section>
      )}
      <HomeCtaBanner copy={ctaBanner} />
    </>
  );
}
