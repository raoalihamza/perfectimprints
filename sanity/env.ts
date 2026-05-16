function requireEnv(value: string | undefined, primary: string, fallback: string): string {
  if (value && value.length > 0) return value;
  throw new Error(
    `Missing Sanity env var: set ${primary} (Next.js) or ${fallback} (standalone studio).`,
  );
}

export const projectId = requireEnv(
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? process.env.SANITY_STUDIO_PROJECT_ID,
  'NEXT_PUBLIC_SANITY_PROJECT_ID',
  'SANITY_STUDIO_PROJECT_ID',
);

export const dataset = requireEnv(
  process.env.NEXT_PUBLIC_SANITY_DATASET ?? process.env.SANITY_STUDIO_DATASET,
  'NEXT_PUBLIC_SANITY_DATASET',
  'SANITY_STUDIO_DATASET',
);

export const apiVersion = '2024-10-01';
