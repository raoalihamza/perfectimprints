/**
 * The two blog AI Studio actions (P2-AI-002, split by AUTO-116). Both appear
 * only on blogPost documents (registered in sanity.config.ts), both POST the
 * document's title + AI inputs (template, topic keywords, primary category,
 * word count) to /api/sanity/generate-blog (DeepSeek + related products +
 * internal links, all server-side), and both patch the DRAFT for Patrick to
 * review. Neither ever publishes, and neither sets the publish date any more:
 * that is stamped when Publish is pressed (stamp-publish-date.tsx).
 *
 *   "Generate Blog with AI" (generateBlogWithAi) FILLS EMPTY FIELDS ONLY:
 *   meta title, meta description, excerpt, body (with its suggested links),
 *   and the slug when it is empty, made from the title that stays. It never
 *   writes the title. When none of the AI fields is empty it says so and
 *   sends nothing to the AI (the PORT-170 portfolio rule, same helpers).
 *
 *   "Regenerate Blog with AI" (regenerateBlogWithAi) REPLACES, after a
 *   confirmation that names every field it will replace. Title and slug are
 *   replaced together or kept together (see blog-generate-plan.ts).
 *
 * Every rule about which field is written lives in the pure
 * blog-generate-plan.ts. Both buttons re-check the document when the AI
 * answers, so a field Patrick edits during the one to two minute wait is
 * kept. While either button is running on a document, both are disabled.
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui, and NO
 * server-only imports (nothing that pulls node:fs, e.g. lib/categories or
 * lib/ai/*). The fully assembled body comes back from the route.
 */
import { useRef, useState, useSyncExternalStore } from 'react';
import {
  useDocumentOperation,
  type DocumentActionComponent,
  type DocumentActionDescription,
  type DocumentActionProps,
} from 'sanity';
import { AiProgressContent } from '../components/AiProgressDialog';
import { useGenerateAuthFetch } from '../components/useGenerateAuthFetch';
import {
  BLOG_FIELD_LABELS,
  emptyContentFields,
  fieldList,
  keepSentence,
  planFill,
  planRegenerate,
  previewRegenerate,
  type BlogDocFields,
  type BlogPatchPlan,
  type GeneratedBlog,
  type RegeneratePreview,
} from './blog-generate-plan';

interface SuggestedLink {
  label: string;
  href: string;
  reason: string;
}

interface GeneratedBlogResponse extends GeneratedBlog {
  body: unknown[];
  suggestedLinks: SuggestedLink[];
}

interface BlogDoc extends BlogDocFields {
  aiTemplate?: string;
  aiTopicKeywords?: string[];
  aiPrimaryCategorySlug?: string;
  aiWordCount?: number;
}

type Mode = 'fill' | 'regenerate';

// ── "Is a generation running on this document?", shared by both buttons ──
const running = new Set<string>();
const listeners = new Set<() => void>();
function setRunning(id: string, on: boolean): void {
  if (on) running.add(id);
  else running.delete(id);
  for (const l of listeners) l();
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
function useRunning(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => running.has(id),
    () => running.has(id),
  );
}

let linkKey = 0;
function nextLinkKey(): string {
  linkKey += 1;
  return `ail-${Date.now().toString(36)}-${linkKey}`;
}

interface Outcome {
  mode: Mode;
  plan: BlogPatchPlan;
  /** FILL found nothing the AI writes empty, so the AI was not called. */
  skippedAi: boolean;
}

function useBlogGenerateAction(props: DocumentActionProps, mode: Mode): DocumentActionDescription {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  // FIX-850: carries the Studio session nonce the generate routes now require.
  const authFetch = useGenerateAuthFetch();
  const isRunning = useRunning(id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideProgress, setHideProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirming, setConfirming] = useState<RegeneratePreview | null>(null);

  const doc = (draft ?? published) as BlogDoc | null;
  // The document as it is NOW, read when the AI answers (the click-time copy
  // is captured separately), so an edit made during the wait is seen.
  const latest = useRef<{ doc: BlogDoc | null; published: boolean }>({ doc, published: Boolean(published) });
  latest.current = { doc, published: Boolean(published) };

  const run = async (atClick: BlogDoc | null, publishedAtClick: boolean) => {
    setIsGenerating(true);
    setRunning(id, true);
    setHideProgress(false);
    setError(null);
    try {
      const res = await authFetch('/api/sanity/generate-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: atClick?.title,
          template: atClick?.aiTemplate,
          keywords: atClick?.aiTopicKeywords ?? [],
          categorySlug: atClick?.aiPrimaryCategorySlug,
          currentSlug: atClick?.slug?.current,
          wordCount: typeof atClick?.aiWordCount === 'number' ? atClick.aiWordCount : 1500,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<GeneratedBlogResponse> & { error?: string };
      if (!res.ok || !Array.isArray(data.body) || data.body.length === 0) {
        throw new Error(data.error || 'AI blog generation failed. Nothing on the post was changed.');
      }
      const now = latest.current;
      const plan =
        mode === 'fill'
          ? planFill(atClick, now.doc, data)
          : planRegenerate(atClick, now.doc, data, { atClick: publishedAtClick, now: now.published });
      const set = { ...plan.set };
      if ('body' in set) {
        set.aiSuggestedLinks = (data.suggestedLinks ?? []).map((l) => ({
          _key: nextLinkKey(),
          _type: 'aiSuggestedLink',
          label: l.label,
          href: l.href,
          reason: l.reason,
        }));
      }
      if (Object.keys(set).length > 0) patch.execute([{ set }]);
      setOutcome({ mode, plan, skippedAi: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI blog generation failed. Nothing on the post was changed.');
    } finally {
      setIsGenerating(false);
      setRunning(id, false);
    }
  };

  const onHandle = () => {
    const atClick = latest.current.doc;
    const publishedAtClick = latest.current.published;
    if (mode === 'regenerate') {
      // Nothing is sent until Patrick confirms.
      setConfirming(previewRegenerate(atClick, publishedAtClick));
      return;
    }
    if (emptyContentFields(atClick).length === 0) {
      // Nothing for the AI to fill: say so without spending a call. An empty
      // slug is still made from the title, which needs no AI.
      const plan = planFill(atClick, atClick, null);
      if (Object.keys(plan.set).length > 0) patch.execute([{ set: plan.set }]);
      setOutcome({ mode, plan, skippedAi: true });
      return;
    }
    void run(atClick, publishedAtClick);
  };

  const confirmedRun = () => {
    const atClick = latest.current.doc;
    const publishedAtClick = latest.current.published;
    setConfirming(null);
    void run(atClick, publishedAtClick);
  };

  const hasTitle = typeof doc?.title === 'string' && doc.title.trim().length > 0;
  const label =
    mode === 'fill'
      ? isGenerating
        ? 'Generating…'
        : 'Generate Blog with AI'
      : isGenerating
        ? 'Regenerating…'
        : 'Regenerate Blog with AI';

  return {
    label,
    disabled: isRunning || isGenerating || !hasTitle,
    title: !hasTitle
      ? 'Add a title first (and optionally Topic Keywords + a Primary Category in the AI generation section)'
      : isRunning
        ? 'The AI is already writing this post.'
        : mode === 'fill'
          ? 'Writes only the fields that are empty. Anything you have written is kept.'
          : 'Replaces what the AI wrote before. Asks first and names every field it will replace.',
    onHandle,
    dialog: confirming
      ? {
          type: 'confirm' as const,
          tone: 'critical' as const,
          message: <ConfirmContent preview={confirming} />,
          confirmButtonText: 'Replace these fields',
          cancelButtonText: 'Keep my post as it is',
          onConfirm: confirmedRun,
          onCancel: () => {
            setConfirming(null);
            onComplete();
          },
        }
      : isGenerating && !hideProgress
        ? {
            type: 'dialog' as const,
            header: mode === 'fill' ? 'Generating blog post…' : 'Regenerating blog post…',
            onClose: () => setHideProgress(true),
            content: (
              <AiProgressContent message="Writing the post: body text, product rows, meta, excerpt and internal links. A long post can take a minute or two. Anything you change on the post while you wait is kept." />
            ),
          }
        : error
          ? {
              type: 'dialog' as const,
              header: 'AI blog generation failed',
              onClose: () => setError(null),
              content: <div style={{ padding: 16, fontSize: 14, color: '#e11f1e' }}>{error}</div>,
            }
          : outcome
            ? {
                type: 'dialog' as const,
                header:
                  outcome.plan.replaced.length + outcome.plan.filled.length > 0 ? 'Blog post updated' : 'Nothing was changed',
                onClose: () => {
                  setOutcome(null);
                  onComplete();
                },
                content: <OutcomeContent outcome={outcome} />,
              }
            : false,
  };
}

/** "Generate Blog with AI": fills empty fields only. */
export const generateBlogWithAi: DocumentActionComponent = (props) => {
  const description = useBlogGenerateAction(props, 'fill');
  // Belt-and-suspenders: even though it's registered only for blogPost.
  if (props.type !== 'blogPost') return null;
  return description;
};

/** "Regenerate Blog with AI": replaces, after a confirmation naming the fields. */
export const regenerateBlogWithAi: DocumentActionComponent = (props) => {
  const description = useBlogGenerateAction(props, 'regenerate');
  if (props.type !== 'blogPost') return null;
  return description;
};

const box: React.CSSProperties = { padding: 16, fontSize: 14, lineHeight: 1.5, maxWidth: 520 };

function ConfirmContent({ preview }: { preview: RegeneratePreview }) {
  return (
    <div style={box}>
      {preview.replace.length > 0 && (
        <p>
          <strong>This replaces:</strong> {fieldList(preview.replace)}. What is there now is lost; this button cannot
          undo it.
        </p>
      )}
      {preview.fill.length > 0 && (
        <p>
          <strong>It also fills in:</strong> {fieldList(preview.fill)}.
        </p>
      )}
      {preview.keep.map((k) => (
        <p key={k.field}>
          <strong>Kept:</strong> {BLOG_FIELD_LABELS[k.field]}, because {keepSentence(k.why)}.
        </p>
      ))}
      <p>Anything you change on the post while the AI is writing is kept. The post is not published.</p>
    </div>
  );
}

function OutcomeContent({ outcome }: { outcome: Outcome }) {
  const { plan, skippedAi } = outcome;
  const kept = plan.kept;
  return (
    <div style={box}>
      {skippedAi && (
        <p>
          Every field the AI writes already has something in it, so nothing was sent to the AI. To have the AI rewrite
          them, use <strong>Regenerate Blog with AI</strong>, or clear a field and press Generate again.
        </p>
      )}
      {plan.replaced.length > 0 && (
        <p>
          <strong>Replaced:</strong> {fieldList(plan.replaced)}.
        </p>
      )}
      {plan.filled.length > 0 && (
        <p>
          <strong>Filled in:</strong> {fieldList(plan.filled)}.
        </p>
      )}
      {kept.map((k) => (
        <p key={k.field}>
          <strong>Kept:</strong> {BLOG_FIELD_LABELS[k.field]}, because {keepSentence(k.why)}.
        </p>
      ))}
      {plan.replaced.length + plan.filled.length > 0 && (
        <p>
          <strong>Read it before you publish.</strong> The publish date is set when you press Publish.
        </p>
      )}
    </div>
  );
}

export default generateBlogWithAi;
