import type { SchemaTypeDefinition } from 'sanity';

import homePage from './singletons/home-page';
import globalSettings from './singletons/global-settings';
import megaMenu from './singletons/mega-menu';

import curatedCategory from './documents/curated-category';
import customCategory from './documents/custom-category';
import customProduct from './documents/custom-product';
import categoryOverride from './documents/category-override';
import productPlacement from './documents/product-placement';
import blogPost from './documents/blog-post';
import blogCategory from './documents/blog-category';
import author from './documents/author';
import faq from './documents/faq';
import video from './documents/video';
import brand from './documents/brand';
import leadSubmission from './documents/lead-submission';
import page from './documents/page';
import customSchema from './documents/custom-schema';

import seo from './objects/seo';
import link from './objects/link';
import richAnswer from './objects/rich-answer';
import footerColumn from './objects/footer-column';
import blogProducts from './objects/blog-products';
import { pageSectionSchemas } from './objects/page-sections';

export const schemaTypes: SchemaTypeDefinition[] = [
  homePage,
  globalSettings,
  megaMenu,
  curatedCategory,
  customCategory,
  customProduct,
  categoryOverride,
  productPlacement,
  blogPost,
  blogCategory,
  author,
  faq,
  video,
  brand,
  leadSubmission,
  page,
  customSchema,
  seo,
  link,
  richAnswer,
  footerColumn,
  blogProducts,
  ...pageSectionSchemas,
];
