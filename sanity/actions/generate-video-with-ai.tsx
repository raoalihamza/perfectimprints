/**
 * "Generate Video Details with AI" Studio action (P2-AI-003). Appears only on
 * video documents (registered in sanity.config.ts). On click it POSTs the
 * document's pasted script + title + AI inputs (topic keywords, video link) to
 * /api/sanity/generate-video (DeepSeek + related products + internal links, all
 * server-side), then patches the returned draft content — title, meta, the
 * long-form description with internal links already placed, and the
 * related-products strip — for Patrick to review and edit. Never auto-publishes.
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui, and —
 * critically — NO server-only imports (nothing that pulls node:fs, e.g.
 * lib/categories or lib/ai/*). The fully assembled richAnswer description comes
 * back from the route; this action only fetches and patches.
 */
import { useState } from 'react';
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { AiProgressContent } from '../components/AiProgressDialog';
import { useGenerateAuthFetch } from '../components/useGenerateAuthFetch';

interface SuggestedLink {
  label: string;
  href: string;
  reason: string;
}

interface GeneratedVideoResponse {
  title: string;
  metaTitle: string;
  metaDescription: string;
  description: unknown[];
  relatedProducts: { sku?: string; name?: string }[];
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

export const generateVideoWithAi: DocumentActionComponent = (props) => {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  // FIX-850: carries the Studio session nonce the generate routes now require.
  const authFetch = useGenerateAuthFetch();
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideProgress, setHideProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Belt-and-suspenders: even though it's registered only for video.
  if (type !== 'video') return null;

  const doc = (draft ?? published) as {
    title?: string;
    slug?: { current?: string };
    embedUrl?: string;
    publishDate?: string;
    aiScript?: string;
    aiTopicKeywords?: string[];
  } | null;

  const hasScript = Boolean(doc?.aiScript?.trim());

  return {
    label: isGenerating ? 'Generating…' : 'Generate Video Details with AI',
    disabled: isGenerating || !hasScript,
    title: hasScript
      ? undefined
      : 'Paste the Video Script / Transcript first (in the AI generation section), then generate.',
    onHandle: async () => {
      setIsGenerating(true);
      setHideProgress(false);
      setError(null);
      try {
        const res = await authFetch('/api/sanity/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: doc?.title,
            script: doc?.aiScript,
            keywords: doc?.aiTopicKeywords ?? [],
            embedUrl: doc?.embedUrl,
            currentSlug: doc?.slug?.current,
          }),
        });
        const data = (await res.json()) as Partial<GeneratedVideoResponse> & { error?: string };
        if (!res.ok || !Array.isArray(data.description) || data.description.length === 0) {
          throw new Error(data.error || 'AI video generation failed.');
        }

        const suggestedLinks = (data.suggestedLinks ?? []).map((l) => ({
          _key: nextItemKey('ail'),
          _type: 'aiSuggestedLink',
          label: l.label,
          href: l.href,
          reason: l.reason,
        }));
        // SKU-only entries, exactly like the AI blog strips — the live product
        // (name, price, image, affiliate URL) resolves from the catalog at
        // render time, so nothing goes stale in the doc.
        const relatedProducts = (data.relatedProducts ?? [])
          .map((p) => (typeof p?.sku === 'string' ? p.sku.trim() : ''))
          .filter(Boolean)
          .map((sku) => ({ _key: nextItemKey('rp'), _type: 'blogProduct', sku }));

        patch.execute([
          // Deep-set the seo fields without clobbering an existing ogImage.
          { setIfMissing: { seo: { _type: 'seo' } } },
          {
            set: {
              ...(data.title ? { title: data.title } : {}),
              // Never overwrite an existing slug.
              ...(!doc?.slug?.current && data.title
                ? { slug: { _type: 'slug', current: slugify(data.title) } }
                : {}),
              ...(!doc?.publishDate ? { publishDate: new Date().toISOString() } : {}),
              'seo.metaTitle': data.metaTitle,
              'seo.metaDescription': data.metaDescription,
              description: data.description,
              // Only refill the strip when the AI actually matched products —
              // a zero-match run must not wipe a manually curated list.
              ...(relatedProducts.length > 0 ? { relatedProducts } : {}),
              aiSuggestedLinks: suggestedLinks,
            },
          },
        ]);
        onComplete();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'AI video generation failed.');
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
            header: 'Generating video details…',
            onClose: () => setHideProgress(true),
            content: (
              <AiProgressContent message="Writing the title, meta, and long-form description with internal links, and matching related products. This usually takes 20 to 60 seconds." />
            ),
          }
        : error
          ? {
              type: 'dialog',
              header: 'AI video generation failed',
              onClose: () => setError(null),
              content: (
                <div style={{ padding: 16, fontSize: 14, color: '#e11f1e' }}>{error}</div>
              ),
            }
          : false,
  };
};

export default generateVideoWithAi;
