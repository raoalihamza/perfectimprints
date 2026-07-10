import Link from 'next/link';
import { SectionShell } from './SectionShell';
import { FormModalButton } from '@/components/forms/FormModalButton';
import { getFormBySlug, toFormRenderDef } from '@/lib/sanity/queries/forms';
import type { CtaBlockSection, CtaButton } from '@/lib/sanity/queries/pages';

const buttonClass =
  'inline-flex h-12 items-center justify-center rounded-md bg-brand-green px-6 text-base font-semibold text-white hover:opacity-90';

/**
 * Async server component (P2-FB-001): a button with a `formSlug` resolves its
 * form-builder form through the tag-cached read (FORMS_TAG + form:<slug> —
 * static-safe, webhook-revalidated) and renders the modal-opening client
 * island; unresolved (unpublished/typo) form slugs fall back to the plain
 * link so the CTA never dead-ends. Buttons without `formSlug` are unchanged.
 */
export async function CtaBlock({ section }: { section: CtaBlockSection }) {
  const { heading, subheading, buttons } = section;
  if (!heading && !subheading && (!buttons || buttons.length === 0)) return null;

  const resolvedForms = await Promise.all(
    (buttons ?? []).map((b) => (b.formSlug ? getFormBySlug(b.formSlug) : Promise.resolve(null))),
  );

  function renderButton(b: CtaButton, i: number) {
    if (!b.label) return null;
    const form = resolvedForms[i];
    if (form) {
      return (
        <FormModalButton
          key={b._key ?? i}
          form={toFormRenderDef(form)}
          label={b.label}
          className={buttonClass}
        />
      );
    }
    if (!b.href) return null;
    const external = /^https?:\/\//i.test(b.href);
    return external ? (
      <a key={b._key ?? i} href={b.href} className={buttonClass}>
        {b.label}
      </a>
    ) : (
      <Link key={b._key ?? i} href={b.href} className={buttonClass}>
        {b.label}
      </Link>
    );
  }

  return (
    <SectionShell>
      <div className="rounded-md border border-border bg-bg-soft p-8 text-center">
        {heading && (
          <h2 className="text-2xl font-bold text-brand-ink md:text-3xl">{heading}</h2>
        )}
        {subheading && (
          <p className="mx-auto mt-3 max-w-2xl text-lg text-text-primary">{subheading}</p>
        )}
        {buttons && buttons.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {buttons.map((b, i) => renderButton(b, i))}
          </div>
        )}
      </div>
    </SectionShell>
  );
}
