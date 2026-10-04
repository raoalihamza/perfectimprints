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
 *   the slug when it is empty, made from the title that stays, and, since
 *   AUTO-202, the HEADER IMAGE when the post has none. It never writes the
 *   title and it never replaces an image Patrick uploaded. When none of the
 *   AI fields is empty it says so and sends nothing to the AI (the PORT-170
 *   portfolio rule, same helpers); when only the image is missing it makes
 *   the image and nothing else.
 *
 *   "Regenerate Blog with AI" (regenerateBlogWithAi) REPLACES, after a
 *   confirmation that names every field it will replace, the header image
 *   among them. Title and slug are replaced together or kept together (see
 *   blog-generate-plan.ts).
 *
 * THE IMAGE IS A SECOND REQUEST (AUTO-202). After the body is patched, the
 * action asks /api/sanity/generate-blog-image for a picture made from the
 * title, the topic keywords and the product photos of the strips in the body
 * it has just patched (sent in the request, because Sanity has not
 * necessarily stored the body yet), starting from the post's own image
 * source setting, else the site's. The route runs the same chain the Blog
 * Topics generator runs (AI, then the library, then the first product photo,
 * then nothing); an image that cannot be made never fails the post, it is
 * reported in the dialog. The document is re-checked when the picture
 * arrives, so an image Patrick uploaded during the wait is kept.
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
import { useRef, useState } from 'react';
import {
  useDocumentOperation,
  type DocumentActionComponent,
  type DocumentActionDescription,
  type DocumentActionProps,
} from 'sanity';
import { AiProgressContent } from '../components/AiProgressDialog';
import { useGenerateAuthFetch } from '../components/useGenerateAuthFetch';
import { setBlogActionRunning as setRunning, useBlogActionRunning as useRunning } from './blog-running';
import {
  BLOG_FIELD_LABELS,
  emptyContentFields,
  fieldList,
  hasHeaderImage,
  headerImageSignature,
  keepSentence,
  needsHeaderImage,
  planFill,
  planRegenerate,
  previewRegenerate,
  type BlogDocFields,
  type BlogPatchPlan,
  type GeneratedBlog,
  type ImagePlan,
  type RegeneratePreview,
} from './blog-generate-plan';
import { capOf, imageRequestBody, patchForOutcome, type ImageResponse } from './blog-image-request';

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

// "Is an AI button running on this document?" lives in ./blog-running.ts,
// shared with the header image button (AUTO-202), so all three disable together.

let linkKey = 0;
function nextLinkKey(): string {
  linkKey += 1;
  return `ail-${Date.now().toString(36)}-${linkKey}`;
}

/** What happened to the header image (AUTO-202). */
interface ImageResult {
  status: 'filled' | 'replaced' | 'kept' | 'failed' | 'none';
  summary: string;
  cap?: { used: number; cap: number };
}

interface Outcome {
  mode: Mode;
  plan: BlogPatchPlan;
  /** FILL found nothing the AI writes empty, so the writing AI was not called. */
  skippedAi: boolean;
  image: ImageResult;
}

function useBlogGenerateAction(props: DocumentActionProps, mode: Mode): DocumentActionDescription {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  // FIX-850: carries the Studio session nonce the generate routes now require.
  const authFetch = useGenerateAuthFetch();
  const isRunning = useRunning(id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stage, setStage] = useState<'post' | 'image'>('post');
  const [hideProgress, setHideProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirming, setConfirming] = useState<RegeneratePreview | null>(null);

  const doc = (draft ?? published) as BlogDoc | null;
  // The document as it is NOW, read when the AI answers (the click-time copy
  // is captured separately), so an edit made during the wait is seen.
  const latest = useRef<{ doc: BlogDoc | null; published: boolean }>({ doc, published: Boolean(published) });
  latest.current = { doc, published: Boolean(published) };

  /**
   * The header image, second request (AUTO-202). `intent` is the plan's
   * decision at the moment the body was patched; the document is re-checked
   * when the picture arrives. Never throws: a failure is reported, not raised.
   */
  const makeImage = async (atClick: BlogDoc | null, intent: ImagePlan, body: unknown): Promise<ImageResult> => {
    if (intent === 'keep') return { status: 'kept', summary: '' };
    setStage('image');
    const signatureAtClick = headerImageSignature(atClick);
    try {
      const res = await authFetch('/api/sanity/generate-blog-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageRequestBody(latest.current.doc, 'default', body)),
      });
      const data = (await res.json().catch(() => ({}))) as ImageResponse;
      if (!res.ok || !data.outcome) {
        return { status: 'failed', summary: data.error || 'The header image could not be made; the rest of the post is unaffected.' };
      }
      const toPatch = patchForOutcome(data.outcome);
      const cap = capOf(data.outcome);
      if (!toPatch) return { status: 'none', summary: data.summary || 'No header image could be made.', cap };
      const now = latest.current.doc;
      // The typing window: FILL writes only if still empty; REGENERATE only if unchanged since the click.
      const changed = intent === 'fill' ? hasHeaderImage(now) : headerImageSignature(now) !== signatureAtClick;
      if (changed) return { status: 'kept', summary: 'The header image changed while the AI was working, so yours was kept.', cap };
      patch.execute([{ set: toPatch.set }, { unset: toPatch.unset }]);
      return { status: intent === 'fill' ? 'filled' : 'replaced', summary: data.summary || 'Header image set.', cap };
    } catch (e) {
      return { status: 'failed', summary: e instanceof Error ? e.message : 'The header image could not be made; the rest of the post is unaffected.' };
    }
  };

  const run = async (atClick: BlogDoc | null, publishedAtClick: boolean) => {
    setIsGenerating(true);
    setStage('post');
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
      // AUTO-202: the picture, from the body that is now on the post.
      const image = await makeImage(atClick, plan.image, 'body' in set ? set.body : now.doc?.body);
      setOutcome({ mode, plan, skippedAi: false, image });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI blog generation failed. Nothing on the post was changed.');
    } finally {
      setIsGenerating(false);
      setRunning(id, false);
    }
  };

  /** FILL with every content field already written and no header image: the picture alone, no writing AI call. */
  const runImageOnly = async (atClick: BlogDoc | null) => {
    setIsGenerating(true);
    setRunning(id, true);
    setHideProgress(false);
    setError(null);
    try {
      const plan = planFill(atClick, atClick, null);
      if (Object.keys(plan.set).length > 0) patch.execute([{ set: plan.set }]);
      const image = await makeImage(atClick, plan.image, atClick?.body);
      setOutcome({ mode, plan, skippedAi: true, image });
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
      if (needsHeaderImage(atClick)) {
        // Only the picture is missing: make it, and nothing else.
        void runImageOnly(atClick);
        return;
      }
      // Nothing for the AI to fill: say so without spending a call. An empty
      // slug is still made from the title, which needs no AI.
      const plan = planFill(atClick, atClick, null);
      if (Object.keys(plan.set).length > 0) patch.execute([{ set: plan.set }]);
      setOutcome({ mode, plan, skippedAi: true, image: { status: 'kept', summary: '' } });
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
          ? 'Writes only the fields that are empty, the header image included. Anything you have written or uploaded is kept.'
          : 'Replaces what the AI wrote before, the header image included. Asks first and names every field it will replace.',
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
              <AiProgressContent
                message={
                  stage === 'image'
                    ? 'The post is written. Now making the header image from the product photos in it and checking it for text and logos (15 to 30 seconds).'
                    : 'Writing the post: body text, product rows, meta, excerpt and internal links, then the header image. A long post can take a minute or two. Anything you change on the post while you wait is kept.'
                }
              />
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
                  outcome.plan.replaced.length + outcome.plan.filled.length > 0 || outcome.image.status === 'filled' || outcome.image.status === 'replaced'
                    ? 'Blog post updated'
                    : 'Nothing was changed',
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
  const { plan, skippedAi, image } = outcome;
  const kept = plan.kept;
  const changed = plan.replaced.length + plan.filled.length > 0 || image.status === 'filled' || image.status === 'replaced';
  return (
    <div style={box}>
      {skippedAi && plan.image === 'keep' && (
        <p>
          Every field the AI writes already has something in it, so nothing was sent to the AI. To have the AI rewrite
          them, use <strong>Regenerate Blog with AI</strong>, or clear a field and press Generate again.
        </p>
      )}
      {skippedAi && plan.image !== 'keep' && (
        <p>Every text field already had something in it, so only the header image was made.</p>
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
      {image.status === 'filled' && (
        <p>
          <strong>Filled in:</strong> Header image. {image.summary}
        </p>
      )}
      {image.status === 'replaced' && (
        <p>
          <strong>Replaced:</strong> Header image. {image.summary}
        </p>
      )}
      {(image.status === 'failed' || image.status === 'none') && plan.image === 'replace' && (
        <p>
          <strong>Kept:</strong> Header image, as it was: no new picture could be made. {image.summary}
        </p>
      )}
      {(image.status === 'failed' || image.status === 'none') && plan.image !== 'replace' && (
        <p>
          <strong>Header image:</strong> not set. {image.summary} You can upload one, or press{' '}
          <strong>Generate header image</strong>.
        </p>
      )}
      {image.status === 'kept' && image.summary && (
        <p>
          <strong>Kept:</strong> Header image, because {image.summary}
        </p>
      )}
      {kept.map((k) => (
        <p key={k.field}>
          <strong>Kept:</strong> {BLOG_FIELD_LABELS[k.field]}, because {keepSentence(k.why)}.
        </p>
      ))}
      {changed && (
        <p>
          <strong>Read it before you publish.</strong> The publish date is set when you press Publish.
        </p>
      )}
      {image.cap && (
        <p style={{ color: '#6b7280', fontSize: 12 }}>
          {image.cap.used} of {image.cap.cap} generated header images used today.
        </p>
      )}
    </div>
  );
}

export default generateBlogWithAi;
