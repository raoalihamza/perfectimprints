/**
 * "Generate Catalog Page with AI" Studio action (P2-CAT-004). Appears only on
 * `catalogPage` documents (registered in sanity.config.ts). On click it POSTs
 * the document's title + catalogKey + AI inputs (topic keywords, brief) to
 * /api/sanity/generate-catalog (DeepSeek + real product names from the synced
 * catalog + internal links, all server-side), then patches the draft's
 * EDITORIAL landing fields for Patrick to review and edit:
 *
 *   - hero heading/subheading + body + SEO meta: REFRESHED every run;
 *   - relatedKeywords + aiSuggestedLinks: filled ONLY when empty (Patrick's
 *     curation is never overwritten);
 *   - slug: filled from the title only when empty.
 *
 * HARD BOUNDARY (the productPage/landing rule): it NEVER touches `catalogKey`,
 * the gated products (addedSkus / addedProducts / hiddenSkus), the browse
 * link, or any commercial fact — those are Patrick's / the yearly sync's.
 * Never auto-publishes.
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui, and —
 * critically — NO server-only imports (nothing that pulls node:fs, e.g.
 * lib/catalogs or lib/ai/*). The assembled Portable Text body comes back from
 * the route; this action only fetches and patches.
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

interface GeneratedCatalogResponse {
  heroHeading: string;
  heroSubheading: string;
  body: Record<string, unknown>[];
  metaTitle: string;
  metaDescription: string;
  relatedKeywords: string[];
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

export const generateCatalogWithAi: DocumentActionComponent = (props) => {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  // FIX-850: carries the Studio session nonce the generate routes now require.
  const authFetch = useGenerateAuthFetch();
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideProgress, setHideProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Belt-and-suspenders: even though it's registered only for catalogPage.
  if (type !== 'catalogPage') return null;

  const doc = (draft ?? published) as {
    title?: string;
    slug?: { current?: string };
    catalogKey?: string;
    aiBrief?: string;
    aiTopicKeywords?: string[];
    relatedKeywords?: string[];
    aiSuggestedLinks?: unknown[];
  } | null;

  const hasTitle = Boolean(doc?.title?.trim());

  return {
    label: isGenerating ? 'Generating…' : 'Generate Catalog Page with AI',
    disabled: isGenerating || !hasTitle,
    title: hasTitle ? undefined : 'Enter the catalog Title first, then generate.',
    onHandle: async () => {
      setIsGenerating(true);
      setHideProgress(false);
      setError(null);
      try {
        const res = await authFetch('/api/sanity/generate-catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: doc?.title,
            catalogKey: doc?.catalogKey,
            brief: doc?.aiBrief,
            keywords: doc?.aiTopicKeywords ?? [],
            currentSlug: doc?.slug?.current,
          }),
        });
        const data = (await res.json()) as Partial<GeneratedCatalogResponse> & { error?: string };
        if (!res.ok || !data.heroHeading || !Array.isArray(data.body) || data.body.length === 0) {
          throw new Error(data.error || 'AI catalog-page generation failed.');
        }

        const suggestedLinks = (data.suggestedLinks ?? []).map((l) => ({
          _key: nextItemKey('ail'),
          _type: 'aiSuggestedLink',
          label: l.label,
          href: l.href,
          reason: l.reason,
        }));

        // Only-if-empty curation fields — never overwrite Patrick's own lists.
        const keywordsEmpty = (doc?.relatedKeywords ?? []).length === 0;
        const linksEmpty = (doc?.aiSuggestedLinks ?? []).length === 0;

        patch.execute([
          // Deep-set the seo fields without clobbering an existing ogImage.
          { setIfMissing: { seo: { _type: 'seo' } } },
          {
            set: {
              // Editorial fields — refreshed every run (Generate again = redo).
              heroHeading: data.heroHeading,
              heroSubheading: data.heroSubheading ?? '',
              body: data.body,
              'seo.metaTitle': data.metaTitle,
              'seo.metaDescription': data.metaDescription,
              // Never overwrite the title (the user's seed) or an existing slug.
              ...(!doc?.slug?.current && doc?.title
                ? { slug: { _type: 'slug', current: slugify(doc.title) } }
                : {}),
              ...(keywordsEmpty && (data.relatedKeywords ?? []).length > 0
                ? { relatedKeywords: data.relatedKeywords }
                : {}),
              ...(linksEmpty && suggestedLinks.length > 0
                ? { aiSuggestedLinks: suggestedLinks }
                : {}),
            },
          },
        ]);
        onComplete();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'AI catalog-page generation failed.');
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
            header: 'Generating catalog page…',
            onClose: () => setHideProgress(true),
            content: (
              <AiProgressContent message="Writing the hero and the long-form landing body with internal links, grounded in this catalog's real products, plus SEO meta and keywords. This usually takes 30 to 90 seconds. Your catalog key, products, and links are never touched." />
            ),
          }
        : error
          ? {
              type: 'dialog',
              header: 'AI catalog-page generation failed',
              onClose: () => setError(null),
              content: (
                <div style={{ padding: 16, fontSize: 14, color: '#e11f1e' }}>{error}</div>
              ),
            }
          : false,
  };
};

export default generateCatalogWithAi;
