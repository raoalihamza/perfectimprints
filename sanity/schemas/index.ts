import type { SchemaTypeDefinition } from 'sanity';

import homePage from './singletons/home-page';
import globalSettings from './singletons/global-settings';
import megaMenu from './singletons/mega-menu';

import curatedCategory from './documents/curated-category';
import customCategory from './documents/custom-category';
import customProduct from './documents/custom-product';
import blogPost from './documents/blog-post';
import blogCategory from './documents/blog-category';
import author from './documents/author';
import faq from './documents/faq';
import video from './documents/video';
import brand from './documents/brand';
import leadSubmission from './documents/lead-submission';

import seo from './objects/seo';
import link from './objects/link';
import footerColumn from './objects/footer-column';

export const schemaTypes: SchemaTypeDefinition[] = [
  homePage,
  globalSettings,
  megaMenu,
  curatedCategory,
  customCategory,
  customProduct,
  blogPost,
  blogCategory,
  author,
  faq,
  video,
  brand,
  leadSubmission,
  seo,
  link,
  footerColumn,
];
