import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemas';
import { deskStructure } from './desk-structure';
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
  schema: {
    types: schemaTypes,
  },
});
