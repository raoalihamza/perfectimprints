import type { SchemaTypeDefinition } from 'sanity';

import homePage from './singletons/home-page';
import globalSettings from './singletons/global-settings';
import megaMenu from './singletons/mega-menu';

import curatedCategory from './documents/curated-category';
import customCategory from './documents/custom-category';
import customProduct from './documents/custom-product';
import productPage from './documents/product-page';
import categoryOverride from './documents/category-override';
import productPlacement from './documents/product-placement';
import blogPost from './documents/blog-post';
import blogCategory from './documents/blog-category';
import author from './documents/author';
import faq from './documents/faq';
import video from './documents/video';
import brand from './documents/brand';
import leadSubmission from './documents/lead-submission';
import form from './documents/form';
import page from './documents/page';
import landingPage from './documents/landing-page';
import catalogPage from './documents/catalog-page';
import customSchema from './documents/custom-schema';
// Portfolio Gallery (PORT-100): two document types + the reusable gallery
// block. The block is registered as a named object type (the blogProduct
// precedent) but is DELIBERATELY not in pageSectionSchemas and on no
// document's fields yet; all placement is PORT-120.
import portfolioCategory from './documents/portfolio-category';
import portfolioItem from './documents/portfolio-item';
import portfolioGallery from './objects/portfolio-gallery';
// Quick Quote (Q-110). NOTE: the numbering counter (`quoteCounter`) is
// DELIBERATELY not registered - it must never appear in the Studio desk
// (the siteRefreshAuth invisible-type precedent; see lib/quotes/numbering.ts).
import quote from './documents/quote';
import quoteResponse from './documents/quote-response';
import { quoteLineItemTypes } from './objects/quote-line-items';

import seo from './objects/seo';
import link from './objects/link';
import richAnswer from './objects/rich-answer';
import footerColumn from './objects/footer-column';
import blogProducts, { blogProduct } from './objects/blog-products';
import { pageSectionSchemas } from './objects/page-sections';

export const schemaTypes: SchemaTypeDefinition[] = [
  homePage,
  globalSettings,
  megaMenu,
  curatedCategory,
  customCategory,
  customProduct,
  productPage,
  categoryOverride,
  productPlacement,
  blogPost,
  blogCategory,
  author,
  faq,
  video,
  brand,
  leadSubmission,
  form,
  page,
  landingPage,
  catalogPage,
  customSchema,
  portfolioCategory,
  portfolioItem,
  quote,
  quoteResponse,
  ...quoteLineItemTypes,
  portfolioGallery,
  seo,
  link,
  richAnswer,
  footerColumn,
  blogProduct,
  blogProducts,
  ...pageSectionSchemas,
];
