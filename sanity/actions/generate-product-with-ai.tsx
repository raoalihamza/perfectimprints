/**
 * "Generate Product Details with AI" Studio action (P2-CP follow-up). Appears
 * only on productPage documents (registered in sanity.config.ts). On click it
 * POSTs the document's title + brand + AI keywords + the factual attributes
 * Patrick already entered (material, variant colors, sizes, decoration
 * methods) to /api/sanity/generate-product (DeepSeek + internal links +
 * category resolution, all server-side), then patches the returned draft
 * content — the Product details description (links already placed), the SEO
 * meta, and the Related/decoration suggestions — for Patrick to review and
 * edit. Never auto-publishes.
 *
 * EDITORIAL FIELDS ONLY: it never touches pricing tiers, images/color
 * variants, sizes, brand, min qty, production time, or the lead recipient —
 * commercial facts stay Patrick's. Related category/keywords + decoration
 * methods are patched ONLY when currently empty (suggestions never overwrite
 * his curation); description + SEO meta are refreshed on every run (that is
 * what the button is for).
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui, and NO
 * server-only imports (nothing pulling node:fs). The assembled Portable Text
 * comes back from the route; this action only fetches and patches.
 */
import { useState } from 'react';
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { AiProgressContent } from '../components/AiProgressDialog';

interface SuggestedLink {
  label: string;
  href: string;
  reason: string;
}

interface GeneratedProductResponse {
  description: unknown[];
  metaTitle: string;
  metaDescription: string;
  relatedKeywords: string[];
  decorationMethods: string[];
  relatedCategorySlug?: string;
  suggestedLinks: SuggestedLink[];
}

let itemKey = 0;
function nextItemKey(prefix: string): string {
  itemKey += 1;
  return `${prefix}-${Date.now().toString(36)}-${itemKey}`;
}

export const generateProductWithAi: DocumentActionComponent = (props) => {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideProgress, setHideProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Belt-and-suspenders: even though it's registered only for productPage.
  if (type !== 'productPage') return null;

  const doc = (draft ?? published) as {
    title?: string;
    slug?: { current?: string };
    brand?: string;
    material?: string;
    sizes?: string[];
    decorationMethods?: string[];
    colorVariants?: { colorName?: string }[];
    relatedKeywords?: string[];
    relatedCategorySlug?: string;
    aiTopicKeywords?: string[];
  } | null;

  const hasTitle = Boolean(doc?.title?.trim());

  return {
    label: isGenerating ? 'Generating…' : 'Generate Product Details with AI',
    disabled: isGenerating || !hasTitle,
    title: hasTitle ? undefined : 'Enter the product Title first, then generate.',
    onHandle: async () => {
      setIsGenerating(true);
      setHideProgress(false);
      setError(null);
      try {
        const res = await fetch('/api/sanity/generate-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: doc?.title,
            brand: doc?.brand,
            keywords: doc?.aiTopicKeywords ?? [],
            material: doc?.material,
            colors: (doc?.colorVariants ?? [])
              .map((v) => v?.colorName?.trim())
              .filter(Boolean),
            sizes: doc?.sizes ?? [],
            decorationMethods: doc?.decorationMethods ?? [],
            currentSlug: doc?.slug?.current,
          }),
        });
        const data = (await res.json()) as Partial<GeneratedProductResponse> & { error?: string };
        if (!res.ok || !Array.isArray(data.description) || data.description.length === 0) {
          throw new Error(data.error || 'AI product generation failed.');
        }

        const suggestedLinks = (data.suggestedLinks ?? []).map((l) => ({
          _key: nextItemKey('ail'),
          _type: 'aiSuggestedLink',
          label: l.label,
          href: l.href,
          reason: l.reason,
        }));

        const hasOwnKeywords = (doc?.relatedKeywords ?? []).some((k) => k?.trim());
        const hasOwnCategory = Boolean(doc?.relatedCategorySlug?.trim());
        const hasOwnDecoration = (doc?.decorationMethods ?? []).some((m) => m?.trim());

        patch.execute([
          // Deep-set the seo fields without clobbering an existing ogImage.
          { setIfMissing: { seo: { _type: 'seo' } } },
          {
            set: {
              description: data.description,
              'seo.metaTitle': data.metaTitle,
              'seo.metaDescription': data.metaDescription,
              // Suggestions fill blanks only — Patrick's curation always wins.
              ...(!hasOwnKeywords && (data.relatedKeywords ?? []).length > 0
                ? { relatedKeywords: data.relatedKeywords }
                : {}),
              ...(!hasOwnCategory && data.relatedCategorySlug
                ? { relatedCategorySlug: data.relatedCategorySlug }
                : {}),
              ...(!hasOwnDecoration && (data.decorationMethods ?? []).length > 0
                ? { decorationMethods: data.decorationMethods }
                : {}),
              aiSuggestedLinks: suggestedLinks,
            },
          },
        ]);
        onComplete();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'AI product generation failed.');
      } finally {
        setIsGenerating(false);
      }
    },
    // Progress dialog while generating (P2-AI-002d pattern) — the button label
    // alone is invisible because the actions menu closes on click. Closing the
    // dialog only hides it; generation continues and patches the draft when done.
    dialog:
      isGenerating && !hideProgress
        ? {
            type: 'dialog',
            header: 'Generating product details…',
            onClose: () => setHideProgress(true),
            content: (
              <AiProgressContent message="Writing the product description with internal links, the SEO meta, and the related-product suggestions. Your pricing, images, and specs are never touched. This usually takes 20 to 60 seconds." />
            ),
          }
        : error
          ? {
              type: 'dialog',
              header: 'AI product generation failed',
              onClose: () => setError(null),
              content: (
                <div style={{ padding: 16, fontSize: 14, color: '#e11f1e' }}>{error}</div>
              ),
            }
          : false,
  };
};

export default generateProductWithAi;
