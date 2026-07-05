/**
 * "Generate schema with AI" Studio action (Task C-2). Appears only on
 * customSchema documents (registered in sanity.config.ts). It reads the doc's
 * schemaType + aiContext + pageUrl, POSTs to /api/sanity/generate-schema
 * (DeepSeek, server-side key), validates the returned JSON-LD, and APPENDS it as
 * a new block in jsonLd[] for Patrick to review/edit. Never auto-publishes; the
 * existing raw-paste blocks are untouched (this just adds one more block).
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui.
 */
import { useState } from 'react';
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { AiProgressContent } from '../components/AiProgressDialog';

interface CustomSchemaDoc {
  schemaType?: string;
  aiContext?: string;
  pageUrl?: string;
  jsonLd?: string[];
}

export const generateSchemaWithAi: DocumentActionComponent = (props) => {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideProgress, setHideProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Belt-and-suspenders: registered only for customSchema.
  if (type !== 'customSchema') return null;

  const doc = (draft ?? published) as CustomSchemaDoc | null;
  const schemaType = doc?.schemaType?.trim();

  return {
    label: isGenerating ? 'Generating…' : 'Generate schema with AI',
    disabled: isGenerating || !schemaType,
    title: schemaType ? undefined : 'Pick a Schema type first',
    onHandle: async () => {
      setIsGenerating(true);
      setHideProgress(false);
      setError(null);
      try {
        const res = await fetch('/api/sanity/generate-schema', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schemaType,
            aiContext: doc?.aiContext,
            pageUrl: doc?.pageUrl,
          }),
        });
        const data = (await res.json()) as { jsonLd?: string; error?: string };
        if (!res.ok || !data.jsonLd) {
          throw new Error(data.error || 'AI generation failed.');
        }

        // Append as a new block — keep every existing (pasted or generated) block.
        const existing = Array.isArray(doc?.jsonLd) ? doc!.jsonLd! : [];
        patch.execute([{ set: { jsonLd: [...existing, data.jsonLd] } }]);
        onComplete();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'AI generation failed.');
      } finally {
        setIsGenerating(false);
      }
    },
    // Progress dialog while generating (P2-AI-002d) — the button label alone is
    // invisible because the actions menu closes on click. Closing the dialog
    // only hides it; generation continues and appends the block when done.
    dialog:
      isGenerating && !hideProgress
        ? {
            type: 'dialog',
            header: 'Generating schema with AI…',
            onClose: () => setHideProgress(true),
            content: (
              <AiProgressContent message="Generating the JSON-LD structured-data block. This usually takes a few seconds." />
            ),
          }
        : error
          ? {
              type: 'dialog',
              header: 'AI schema generation failed',
              onClose: () => setError(null),
              content: <div style={{ padding: 16, fontSize: 14, color: '#e11f1e' }}>{error}</div>,
            }
          : false,
  };
};

export default generateSchemaWithAi;
