/**
 * "Generate Blog with AI" Studio action (P2-AI-002). Appears only on blogPost
 * documents (registered in sanity.config.ts). On click it POSTs the document's
 * title + AI inputs (template, topic keywords, primary category) to
 * /api/sanity/generate-blog (DeepSeek + related products + internal links,
 * all server-side), then patches the returned draft content — body with product
 * strips, meta, excerpt, suggested internal links — for Patrick to review and
 * edit. Never auto-publishes.
 *
 * Studio-only: plain React + the `sanity` action API, no @sanity/ui, and —
 * critically — NO server-only imports (nothing that pulls node:fs, e.g.
 * lib/categories or lib/ai/*). The fully assembled body comes back from the
 * route; this action only fetches and patches.
 */
import { useState } from 'react';
import { useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { AiProgressContent } from '../components/AiProgressDialog';

interface SuggestedLink {
  label: string;
  href: string;
  reason: string;
}

interface GeneratedBlogResponse {
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  ctaTopic?: string;
  body: unknown[];
  suggestedLinks: SuggestedLink[];
}

let linkKey = 0;
function nextLinkKey(): string {
  linkKey += 1;
  return `ail-${Date.now().toString(36)}-${linkKey}`;
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

export const generateBlogWithAi: DocumentActionComponent = (props) => {
  const { id, type, draft, published, onComplete } = props;
  const { patch } = useDocumentOperation(id, type);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hideProgress, setHideProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Belt-and-suspenders: even though it's registered only for blogPost.
  if (type !== 'blogPost') return null;

  const doc = (draft ?? published) as {
    title?: string;
    slug?: { current?: string };
    publishDate?: string;
    ctaTopic?: string;
    aiTemplate?: string;
    aiTopicKeywords?: string[];
    aiPrimaryCategorySlug?: string;
    aiWordCount?: number;
  } | null;

  return {
    label: isGenerating ? 'Generating…' : 'Generate Blog with AI',
    disabled: isGenerating || !doc?.title,
    title: doc?.title
      ? undefined
      : 'Add a title first (and optionally Topic Keywords + a Primary Category in the AI generation section)',
    onHandle: async () => {
      setIsGenerating(true);
      setHideProgress(false);
      setError(null);
      try {
        const res = await fetch('/api/sanity/generate-blog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: doc?.title,
            template: doc?.aiTemplate,
            keywords: doc?.aiTopicKeywords ?? [],
            categorySlug: doc?.aiPrimaryCategorySlug,
            currentSlug: doc?.slug?.current,
            wordCount: typeof doc?.aiWordCount === 'number' ? doc.aiWordCount : 1500,
          }),
        });
        const data = (await res.json()) as Partial<GeneratedBlogResponse> & { error?: string };
        if (!res.ok || !Array.isArray(data.body) || data.body.length === 0) {
          throw new Error(data.error || 'AI blog generation failed.');
        }

        const suggestedLinks = (data.suggestedLinks ?? []).map((l) => ({
          _key: nextLinkKey(),
          _type: 'aiSuggestedLink',
          label: l.label,
          href: l.href,
          reason: l.reason,
        }));

        patch.execute([
          {
            set: {
              ...(data.title ? { title: data.title } : {}),
              // Never overwrite an existing (possibly imported/preserved) slug.
              ...(!doc?.slug?.current && data.title
                ? { slug: { _type: 'slug', current: slugify(data.title) } }
                : {}),
              // publishDate is required — set it only when empty so the draft
              // is publishable after review. Patrick can adjust it.
              ...(!doc?.publishDate ? { publishDate: new Date().toISOString() } : {}),
              // CTA/Related-Blogs topic — only when Patrick hasn't set one.
              ...(!doc?.ctaTopic?.trim() && data.ctaTopic?.trim()
                ? { ctaTopic: data.ctaTopic.trim() }
                : {}),
              metaTitle: data.metaTitle,
              metaDescription: data.metaDescription,
              excerpt: data.excerpt,
              body: data.body,
              aiSuggestedLinks: suggestedLinks,
            },
          },
        ]);
        onComplete();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'AI blog generation failed.');
      } finally {
        setIsGenerating(false);
      }
    },
    // Progress dialog while generating (P2-AI-002d) — the button label alone is
    // invisible because the actions menu closes on click. Closing the dialog
    // only hides it; generation continues and patches the draft when done.
    dialog:
      isGenerating && !hideProgress
        ? {
            type: 'dialog',
            header: 'Generating blog post…',
            onClose: () => setHideProgress(true),
            content: (
              <AiProgressContent message="Writing the full post — body text, product rows, meta, excerpt, and internal links. A long post can take a minute or two." />
            ),
          }
        : error
          ? {
              type: 'dialog',
              header: 'AI blog generation failed',
              onClose: () => setError(null),
              content: (
                <div style={{ padding: 16, fontSize: 14, color: '#e11f1e' }}>{error}</div>
              ),
            }
          : false,
  };
};

export default generateBlogWithAi;
