/**
 * "Generate Page with AI" Studio action (P2-AI-004). Appears only on `page`
 * documents (registered in sanity.config.ts). On click it POSTs the document's
 * title + AI inputs (brief, topic keywords) to /api/sanity/generate-page
 * (DeepSeek + related products + internal links, all server-side), then
 * APPENDS the returned draft sections — hero text, richText body copy with
 * internal links already placed, a product strip, a stat banner, FAQs, and a
 * closing CTA — for Patrick to review, add images to, and edit. Existing
 * sections are NEVER overwritten (append is non-destructive; re-clicking
 * Generate appends a second set, acceptable for a reviewed draft). Never
 * auto-publishes.
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui, and —
 * critically — NO server-only imports (nothing that pulls node:fs, e.g.
 * lib/categories or lib/ai/*). The fully assembled section objects come back
 * from the route; this action only fetches and patches.
 */
import { useState } from 'react';
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { AiProgressContent } from '../components/AiProgressDialog';

interface SuggestedLink {
  label: string;
  href: string;
  reason: string;
}

interface GeneratedPageResponse {
  metaTitle: string;
  metaDescription: string;
  sections: Record<string, unknown>[];
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

export const generatePageWithAi: DocumentActionComponent = (props) => {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideProgress, setHideProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Belt-and-suspenders: even though it's registered only for page.
  if (type !== 'page') return null;

  const doc = (draft ?? published) as {
    title?: string;
    slug?: { current?: string };
    aiBrief?: string;
    aiTopicKeywords?: string[];
  } | null;

  const hasTitle = Boolean(doc?.title?.trim());

  return {
    label: isGenerating ? 'Generating…' : 'Generate Page with AI',
    disabled: isGenerating || !hasTitle,
    title: hasTitle ? undefined : 'Enter the page Title first, then generate.',
    onHandle: async () => {
      setIsGenerating(true);
      setHideProgress(false);
      setError(null);
      try {
        const res = await fetch('/api/sanity/generate-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: doc?.title,
            brief: doc?.aiBrief,
            keywords: doc?.aiTopicKeywords ?? [],
            currentSlug: doc?.slug?.current,
          }),
        });
        const data = (await res.json()) as Partial<GeneratedPageResponse> & { error?: string };
        if (!res.ok || !Array.isArray(data.sections) || data.sections.length === 0) {
          throw new Error(data.error || 'AI page generation failed.');
        }

        const suggestedLinks = (data.suggestedLinks ?? []).map((l) => ({
          _key: nextItemKey('ail'),
          _type: 'aiSuggestedLink',
          label: l.label,
          href: l.href,
          reason: l.reason,
        }));

        patch.execute([
          // Deep-set the seo fields without clobbering an existing ogImage.
          { setIfMissing: { seo: { _type: 'seo' } } },
          // Non-destructive: never overwrite a populated sections array —
          // append the generated sections to the end (on a fresh page this is
          // effectively "set"). Re-clicking Generate appends again.
          { setIfMissing: { sections: [] } },
          { insert: { after: 'sections[-1]', items: data.sections } },
          {
            set: {
              // Never overwrite the title (it is the user's input/seed) or an
              // existing slug.
              ...(!doc?.slug?.current && doc?.title
                ? { slug: { _type: 'slug', current: slugify(doc.title) } }
                : {}),
              'seo.metaTitle': data.metaTitle,
              'seo.metaDescription': data.metaDescription,
              aiSuggestedLinks: suggestedLinks,
            },
          },
        ]);
        onComplete();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'AI page generation failed.');
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
            header: 'Generating page…',
            onClose: () => setHideProgress(true),
            content: (
              <AiProgressContent message="Writing the hero, body sections with internal links, FAQs, and closing CTA, and matching a product strip. This usually takes 30 to 90 seconds. The sections are APPENDED to the page — nothing existing is overwritten." />
            ),
          }
        : error
          ? {
              type: 'dialog',
              header: 'AI page generation failed',
              onClose: () => setError(null),
              content: (
                <div style={{ padding: 16, fontSize: 14, color: '#e11f1e' }}>{error}</div>
              ),
            }
          : false,
  };
};

export default generatePageWithAi;
