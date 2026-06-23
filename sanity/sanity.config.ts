import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemas';
import { deskStructure } from './desk-structure';
import { generateWithAi } from './actions/generate-with-ai';
import { pushCategoryTool } from './tools/push-category-tool';
import { projectId, dataset, apiVersion } from './env';

export default defineConfig({
  name: 'perfectimprints',
  title: 'Perfect Imprints',
  projectId,
  dataset,
  basePath: '/admin',
  plugins: [
    structureTool({ structure: deskStructure }),
    visionTool({ defaultApiVersion: apiVersion }),
  ],
  // "Push to Sanity" tool (M5-504 push flow) — take over any baked category page.
  tools: (prev) => [...prev, pushCategoryTool],
  schema: {
    types: schemaTypes,
  },
  document: {
    // "Generate with AI" appears only on customCategory documents (M5-505).
    actions: (prev, context) =>
      context.schemaType === 'customCategory' ? [...prev, generateWithAi] : prev,
  },
});
