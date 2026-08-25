import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Mirrors tsconfig's `@/*` path alias so a test can import an app module that
// itself imports through `@/` (FIX-840 added the first such test,
// components/portable-text/RichAnswer.test.tsx). Nothing else is configured;
// the defaults every existing test already ran under are unchanged.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
});
