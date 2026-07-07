/**
 * "Generate Landing Page with AI" Studio action (P2-AI-005 part 1). Appears
 * only on `landingPage` documents (registered in sanity.config.ts). On click it
 * POSTs the doc's targeting inputs (title, city, state, product, the
 * MUST-INCLUDE landmarks, topic keywords) to /api/sanity/generate-landing
 * (DeepSeek + related products + internal links, all server-side — the route
 * REJECTS any result that dropped a landmark), then patches the returned draft
 * content — hero, local intro, options & ideas, why-us, FAQs, the
 * related-products strip, SEO meta — for Patrick to review and edit. Patrick's
 * INPUTS (title, city, state, product, landmarks, leadRecipient) are never
 * overwritten. Never auto-publishes.
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui, and —
 * critically — NO server-only imports (nothing that pulls node:fs, e.g.
 * lib/categories or lib/ai/*). The fully assembled Portable Text bodies come
 * back from the route; this action only fetches and patches.
 */
import { useState } from 'react';
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { AiProgressContent } from '../components/AiProgressDialog';

interface SuggestedLink {
  label: string;
  href: string;
  reason: string;
}

interface GeneratedLandingResponse {
  heroHeading: string;
  heroSubheading: string;
  localIntro: Record<string, unknown>[];
  optionsIdeas: Record<string, unknown>[];
  whyUs: Record<string, unknown>[];
  faqs: { question: string; answer: string }[];
  relatedProducts: { sku?: string }[];
  leadFormHeading?: string;
  metaTitle: string;
  metaDescription: string;
  suggestedLinks: SuggestedLink[];
}

let itemKey = 0;
function nextItemKey(prefix: string): string {
  itemKey += 1;
  return `${prefix}-${Date.now().toString(36)}-${itemKey}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export const generateLandingWithAi: DocumentActionComponent = (props) => {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideProgress, setHideProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Belt-and-suspenders: even though it's registered only for landingPage.
  if (type !== 'landingPage') return null;

  const doc = (draft ?? published) as {
    title?: string;
    slug?: { current?: string };
    city?: string;
    state?: string;
    product?: string;
    landmarks?: string[];
    aiTopicKeywords?: string[];
    leadFormHeading?: string;
  } | null;

  const hasTargeting = Boolean(
    doc?.city?.trim() && doc?.state?.trim() && doc?.product?.trim(),
  );

  return {
    label: isGenerating ? 'Generating…' : 'Generate Landing Page with AI',
    disabled: isGenerating || !hasTargeting,
    title: hasTargeting
      ? undefined
      : 'Fill in City, State, and Product / topic first, then generate.',
    onHandle: async () => {
      setIsGenerating(true);
      setHideProgress(false);
      setError(null);
      try {
        const res = await fetch('/api/sanity/generate-landing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: doc?.title,
            city: doc?.city,
            state: doc?.state,
            product: doc?.product,
            landmarks: doc?.landmarks ?? [],
            keywords: doc?.aiTopicKeywords ?? [],
            currentSlug: doc?.slug?.current,
          }),
        });
        const data = (await res.json()) as Partial<GeneratedLandingResponse> & { error?: string };
        if (!res.ok || !Array.isArray(data.optionsIdeas) || data.optionsIdeas.length === 0) {
          throw new Error(data.error || 'AI landing-page generation failed.');
        }

        const suggestedLinks = (data.suggestedLinks ?? []).map((l) => ({
          _key: nextItemKey('ail'),
          _type: 'aiSuggestedLink',
          label: l.label,
          href: l.href,
          reason: l.reason,
        }));
        // SKU-only entries, exactly like the AI blog/video strips — the live
        // product (name, price, image, affiliate URL) resolves from the catalog
        // at render time, so nothing goes stale in the doc.
        const relatedProducts = (data.relatedProducts ?? [])
          .map((p) => (typeof p?.sku === 'string' ? p.sku.trim() : ''))
          .filter(Boolean)
          .map((sku) => ({ _key: nextItemKey('rp'), _type: 'blogProduct', sku }));
        const faqs = (data.faqs ?? [])
          .filter((f) => f?.question && f?.answer)
          .map((f) => ({ _key: nextItemKey('qa'), question: f.question, answer: f.answer }));

        patch.execute([
          // Deep-set the seo fields without clobbering an existing ogImage.
          { setIfMissing: { seo: { _type: 'seo' } } },
          {
            set: {
              // Never overwrite Patrick's inputs (title, city, state, product,
              // landmarks, leadRecipient) or an existing slug.
              ...(!doc?.slug?.current
                ? {
                    slug: {
                      _type: 'slug',
                      current: slugify(
                        `${doc?.product ?? ''} ${doc?.city ?? ''} ${doc?.state ?? ''}`,
                      ),
                    },
                  }
                : {}),
              'seo.metaTitle': data.metaTitle,
              'seo.metaDescription': data.metaDescription,
              ...(data.heroHeading ? { heroHeading: data.heroHeading } : {}),
              heroSubheading: data.heroSubheading ?? '',
              localIntro: data.localIntro ?? [],
              optionsIdeas: data.optionsIdeas,
              whyUs: data.whyUs ?? [],
              // Only refill when the AI actually returned entries — an empty
              // result must not wipe a manually curated list (the route also
              // rejects < 3 usable FAQs, so this is belt-and-suspenders).
              ...(faqs.length > 0 ? { faqs } : {}),
              ...(relatedProducts.length > 0 ? { relatedProducts } : {}),
              // Quote-form heading pre-fill (part 2) — ONLY when empty, so
              // Patrick's wording is never overwritten. heroCtaLabel is left
              // alone entirely (schema initialValue / template default).
              ...(data.leadFormHeading && !doc?.leadFormHeading?.trim()
                ? { leadFormHeading: data.leadFormHeading }
                : {}),
              aiSuggestedLinks: suggestedLinks,
            },
          },
        ]);
        onComplete();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'AI landing-page generation failed.');
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
            header: 'Generating landing page…',
            onClose: () => setHideProgress(true),
            content: (
              <AiProgressContent message="Writing the hero, the local intro (naming every landmark you listed), the options & ideas sections with internal links, the why-us section, and FAQs, and matching related products. This usually takes 30 to 90 seconds." />
            ),
          }
        : error
          ? {
              type: 'dialog',
              header: 'AI landing-page generation failed',
              onClose: () => setError(null),
              content: (
                <div style={{ padding: 16, fontSize: 14, color: '#e11f1e' }}>{error}</div>
              ),
            }
          : false,
  };
};

export default generateLandingWithAi;
