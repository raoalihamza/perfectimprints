/**
 * "Generate with AI" Studio action (M5-505). Appears only on customCategory
 * documents (registered in sanity.config.ts) — works for both brand-new docs and
 * pages pushed over from baked JSON. On click it POSTs the document's title +
 * targetKeyword to /api/sanity/generate-content (DeepSeek, server-side key), then
 * patches the returned heading / intro / buying guide / FAQs into the document
 * for Patrick to review and edit. Never auto-publishes.
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui.
 */
import { useState } from 'react';
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { htmlToBlocks, buildGuideBlocks } from '../../lib/portable-text/html-to-blocks';
import { AiProgressContent } from '../components/AiProgressDialog';

interface GeneratedContent {
  h1: string;
  metaTitle: string;
  metaDescription: string;
  introHtml: string;
  buyingGuideHtml: string;
  buyingGuideH2: string;
  faqs: { q: string; a: string }[];
}

let faqKey = 0;
function nextFaqKey(): string {
  faqKey += 1;
  return `faq-${Date.now().toString(36)}-${faqKey}`;
}

export const generateWithAi: DocumentActionComponent = (props) => {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideProgress, setHideProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Belt-and-suspenders: even though it's registered only for customCategory.
  if (type !== 'customCategory') return null;

  const doc = (draft ?? published) as { title?: string; targetKeyword?: string } | null;

  return {
    label: isGenerating ? 'Generating…' : 'Generate with AI',
    disabled: isGenerating || !doc?.title,
    title: doc?.title ? undefined : 'Add a title first',
    onHandle: async () => {
      setIsGenerating(true);
      setHideProgress(false);
      setError(null);
      try {
        const res = await fetch('/api/sanity/generate-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: doc?.title, targetKeyword: doc?.targetKeyword }),
        });
        const data = (await res.json()) as Partial<GeneratedContent> & { error?: string };
        if (!res.ok || !data.introHtml) {
          throw new Error(data.error || 'AI generation failed.');
        }

        const faqs = (data.faqs ?? []).map((f) => ({ _key: nextFaqKey(), q: f.q, a: f.a }));

        patch.execute([
          {
            set: {
              ...(data.h1 ? { title: data.h1 } : {}),
              seo: {
                _type: 'seo',
                metaTitle: data.metaTitle,
                metaDescription: data.metaDescription,
              },
              introHtml: htmlToBlocks(data.introHtml),
              bodySections: buildGuideBlocks(data.buyingGuideH2, data.buyingGuideHtml),
              faqs,
            },
          },
        ]);
        onComplete();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'AI generation failed.');
      } finally {
        setIsGenerating(false);
      }
    },
    // Progress dialog while generating (P2-AI-002d) — the button label alone is
    // invisible because the actions menu closes on click. Closing the dialog
    // only hides it; generation continues and patches the doc when done.
    dialog:
      isGenerating && !hideProgress
        ? {
            type: 'dialog',
            header: 'Generating with AI…',
            onClose: () => setHideProgress(true),
            content: (
              <AiProgressContent message="Writing the intro, buying guide, and FAQs for this category. This usually takes 20 to 40 seconds." />
            ),
          }
        : error
          ? {
              type: 'dialog',
              header: 'AI generation failed',
              onClose: () => setError(null),
              content: (
                <div style={{ padding: 16, fontSize: 14, color: '#e11f1e' }}>{error}</div>
              ),
            }
          : false,
  };
};

export default generateWithAi;
