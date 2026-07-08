import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemas';
import { deskStructure } from './desk-structure';
import { generateWithAi } from './actions/generate-with-ai';
import { generateSchemaWithAi } from './actions/generate-schema-with-ai';
import { generateBlogWithAi } from './actions/generate-blog-with-ai';
import { generateVideoWithAi } from './actions/generate-video-with-ai';
import { generatePageWithAi } from './actions/generate-page-with-ai';
import { generateLandingWithAi } from './actions/generate-landing-with-ai';
import { generateProductWithAi } from './actions/generate-product-with-ai';
import { pushCategoryTool } from './tools/push-category-tool';
import { siteRefreshTool } from './tools/site-refresh-tool';
import { projectId, dataset, apiVersion } from './env';

export default defineConfig({
  name: 'perfectimprints',
  title: 'Perfect Imprints',
  projectId,
  dataset,
  // Obfuscated admin path (M5-506) — light bot/scanner noise reduction, NOT a
  // security boundary (Sanity auth still gates access). Must match the route
  // folder app/admin3773752 and the ChromeGate check.
  basePath: '/admin3773752',
  plugins: [
    structureTool({ structure: deskStructure }),
    visionTool({ defaultApiVersion: apiVersion }),
  ],
  // Top-level Studio tools (separate tabs, not under any document):
  //  • "Push to Sanity" (M5-504) — take over any baked category page.
  //  • "Site Refresh" (2026-06-30) — trigger / watch / cancel the data-refresh
  //    GitHub Actions workflows (weekly scrapes + monthly full rebuild).
  tools: (prev) => [...prev, pushCategoryTool, siteRefreshTool],
  schema: {
    types: schemaTypes,
  },
  document: {
    // Per-type AI document actions: "Generate with AI" on customCategory (M5-505),
    // "Generate schema with AI" on customSchema (Task C-2), "Generate Blog with
    // AI" on blogPost (P2-AI-002), "Generate Video Details with AI" on video
    // (P2-AI-003), "Generate Page with AI" on page (P2-AI-004), "Generate
    // Landing Page with AI" on landingPage (P2-AI-005), "Generate Product
    // Details with AI" on productPage (P2-CP follow-up).
    actions: (prev, context) => {
      if (context.schemaType === 'customCategory') return [...prev, generateWithAi];
      if (context.schemaType === 'customSchema') return [...prev, generateSchemaWithAi];
      if (context.schemaType === 'blogPost') return [...prev, generateBlogWithAi];
      if (context.schemaType === 'video') return [...prev, generateVideoWithAi];
      if (context.schemaType === 'page') return [...prev, generatePageWithAi];
      if (context.schemaType === 'landingPage') return [...prev, generateLandingWithAi];
      if (context.schemaType === 'productPage') return [...prev, generateProductWithAi];
      return prev;
    },
  },
});
