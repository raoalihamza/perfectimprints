/**
 * "Generate Photo Details with AI" Studio action (PORT-170). Appears only on
 * portfolioItem documents (registered in sanity.config.ts). On click it sends
 * the uploaded photograph's asset reference to /api/sanity/generate-portfolio
 * (Gemini vision + vocabulary validation + the daily cap, all server-side)
 * and patches the answer into the DRAFT for Patrick to read and edit. It
 * never publishes, and it never touches `clientName`.
 *
 * FILLS EMPTY FIELDS ONLY. A field Patrick has already written (a title, an
 * alt text, ticked colours) is kept exactly as it is, and the result dialog
 * says which fields were filled and which were kept. To have the AI redo a
 * field, clear that field and press the button again. Chosen over "replace
 * everything" because he was promised he edits what he does not like before
 * publishing: an edit that a second press could silently erase is not an
 * edit. When every field is already filled the button says so and sends
 * nothing to Google, so a stray click costs nothing.
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui, and NO
 * server-only imports (the route holds the prompt, the vocabularies check and
 * the Gemini call). This action only fetches and patches.
 */
import { useState } from 'react';
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { AiProgressContent } from '../components/AiProgressDialog';
import { useGenerateAuthFetch } from '../components/useGenerateAuthFetch';

interface GeneratedPortfolioResponse {
  title: string;
  alt: string;
  description: string;
  colors: string[];
  decorationMethods: string[];
  industry: string | null;
  dropped: string[];
  cap?: { used: number; cap: number };
}

interface PortfolioItemDoc {
  title?: string;
  image?: { asset?: { _ref?: string }; alt?: string };
  description?: string;
  colors?: string[];
  decorationMethods?: string[];
  industry?: string;
}

/** The fields the button may fill, in the order the form shows them. */
const FIELD_LABELS = {
  title: 'Title',
  alt: 'Alt text',
  description: 'Description',
  colors: 'Colours',
  decorationMethods: 'Decoration method',
  industry: 'Industry',
} as const;
type FieldKey = keyof typeof FIELD_LABELS;

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Which of the six fields are currently empty on the document. */
function emptyFields(doc: PortfolioItemDoc | null): FieldKey[] {
  const out: FieldKey[] = [];
  if (isBlank(doc?.title)) out.push('title');
  if (isBlank(doc?.image?.alt)) out.push('alt');
  if (isBlank(doc?.description)) out.push('description');
  if (isBlank(doc?.colors)) out.push('colors');
  if (isBlank(doc?.decorationMethods)) out.push('decorationMethods');
  if (isBlank(doc?.industry)) out.push('industry');
  return out;
}

interface Outcome {
  filled: FieldKey[];
  kept: FieldKey[];
  /** Fields the AI left empty (e.g. it could not tell the industry). */
  blank: FieldKey[];
  dropped: string[];
  cap?: { used: number; cap: number };
}

export const generatePortfolioWithAi: DocumentActionComponent = (props) => {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  // FIX-850: carries the Studio session nonce the generate routes require.
  const authFetch = useGenerateAuthFetch();
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideProgress, setHideProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Belt-and-suspenders: even though it's registered only for portfolioItem.
  if (type !== 'portfolioItem') return null;

  const doc = (draft ?? published) as PortfolioItemDoc | null;
  const assetRef = doc?.image?.asset?._ref;
  const hasImage = Boolean(assetRef);

  return {
    label: isGenerating ? 'Describing the photo…' : 'Generate Photo Details with AI',
    disabled: isGenerating || !hasImage,
    title: hasImage ? undefined : 'Upload the photo first, then generate.',
    onHandle: async () => {
      const empty = emptyFields(doc);
      if (empty.length === 0) {
        // Nothing to fill: say so without spending a call.
        setOutcome({
          filled: [],
          kept: (Object.keys(FIELD_LABELS) as FieldKey[]),
          blank: [],
          dropped: [],
        });
        return;
      }
      setIsGenerating(true);
      setHideProgress(false);
      setError(null);
      try {
        const res = await authFetch('/api/sanity/generate-portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetRef }),
        });
        const data = (await res.json().catch(() => ({}))) as Partial<GeneratedPortfolioResponse> & {
          error?: string;
        };
        if (!res.ok || typeof data.title !== 'string' || typeof data.alt !== 'string') {
          throw new Error(data.error || 'The AI photo description failed. Click Generate again, or fill the fields in by hand.');
        }

        // Only the fields that were empty when the button was pressed. A value
        // Patrick types during the few seconds the call takes is one edge this
        // does not cover: the props captured at the click are what is patched.
        const stillEmpty = new Set(empty);
        const set: Record<string, unknown> = {};
        const filled: FieldKey[] = [];
        const blank: FieldKey[] = [];
        const consider = (key: FieldKey, path: string, value: unknown) => {
          if (!stillEmpty.has(key)) return;
          if (isBlank(value)) {
            blank.push(key);
            return;
          }
          set[path] = value;
          filled.push(key);
        };
        consider('title', 'title', data.title.trim());
        consider('alt', 'image.alt', data.alt.trim());
        consider('description', 'description', (data.description ?? '').trim());
        consider('colors', 'colors', Array.isArray(data.colors) ? data.colors : []);
        consider(
          'decorationMethods',
          'decorationMethods',
          Array.isArray(data.decorationMethods) ? data.decorationMethods : [],
        );
        consider('industry', 'industry', typeof data.industry === 'string' ? data.industry : '');

        if (Object.keys(set).length > 0) {
          patch.execute([{ set }]);
        }
        const kept = (Object.keys(FIELD_LABELS) as FieldKey[]).filter((k) => !stillEmpty.has(k));
        setOutcome({ filled, kept, blank, dropped: data.dropped ?? [], cap: data.cap });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The AI photo description failed.');
      } finally {
        setIsGenerating(false);
      }
    },
    // Progress dialog while generating (P2-AI-002d pattern), then a result
    // dialog that says exactly what was filled, kept and left blank, so Patrick
    // knows what to read before publishing. Closing the result dialog
    // completes the action.
    dialog:
      isGenerating && !hideProgress
        ? {
            type: 'dialog',
            header: 'Describing the photo…',
            onClose: () => setHideProgress(true),
            content: (
              <AiProgressContent message="Looking at the photo and writing the title, alt text, description, colours, decoration method and industry. This usually takes a few seconds." />
            ),
          }
        : error
          ? {
              type: 'dialog',
              header: 'AI photo description failed',
              onClose: () => setError(null),
              content: (
                <div style={{ padding: 16, fontSize: 14, color: '#e11f1e', lineHeight: 1.5 }}>{error}</div>
              ),
            }
          : outcome
            ? {
                type: 'dialog',
                header: outcome.filled.length > 0 ? 'Photo details filled in' : 'Nothing to fill in',
                onClose: () => {
                  setOutcome(null);
                  onComplete();
                },
                content: <OutcomeContent outcome={outcome} />,
              }
            : false,
  };
};

function labels(keys: FieldKey[]): string {
  return keys.map((k) => FIELD_LABELS[k]).join(', ');
}

function OutcomeContent({ outcome }: { outcome: Outcome }) {
  const rows: React.ReactNode[] = [];
  if (outcome.filled.length > 0) {
    rows.push(
      <p key="filled">
        <strong>Filled in:</strong> {labels(outcome.filled)}.
      </p>,
    );
  }
  if (outcome.kept.length > 0) {
    rows.push(
      <p key="kept">
        <strong>Kept as you had them:</strong> {labels(outcome.kept)}.{' '}
        {outcome.filled.length === 0
          ? 'Every field already has a value, so nothing was sent to the AI. Clear a field and generate again to have it written for you.'
          : 'To have the AI redo one of these, clear it and generate again.'}
      </p>,
    );
  }
  if (outcome.blank.length > 0) {
    rows.push(
      <p key="blank">
        <strong>Left empty:</strong> {labels(outcome.blank)}. The AI could not tell from the photo; fill
        these in yourself if you know them.
      </p>,
    );
  }
  if (outcome.dropped.length > 0) {
    rows.push(
      <p key="dropped">
        <strong>Ignored:</strong> the AI suggested {outcome.dropped.join(', ')}, which are not on the
        site&apos;s lists, so they were dropped.
      </p>,
    );
  }
  if (outcome.filled.length > 0) {
    rows.push(
      <p key="check">
        <strong>Read it before you publish.</strong> The AI is told never to name a customer and never to
        invent details; check that it did not, and edit anything you would say differently. Client name is
        never filled in by this button.
      </p>,
    );
  }
  if (outcome.cap) {
    rows.push(
      <p key="cap" style={{ color: '#6b7280', fontSize: 12 }}>
        {outcome.cap.used} of {outcome.cap.cap} AI photo descriptions used today.
      </p>,
    );
  }
  return <div style={{ padding: 16, fontSize: 14, lineHeight: 1.5, maxWidth: 480 }}>{rows}</div>;
}

export default generatePortfolioWithAi;
