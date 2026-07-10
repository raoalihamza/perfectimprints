'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { FormDef } from '@/lib/forms/form-def';

// The modal (+ FormRenderer + Turnstile + file-validation code) is
// interaction-only — split out with ssr:false so it stays out of the static
// pages' First Load JS and loads only when a visitor clicks the button (same
// pattern as EmptyStateCTAButton / SearchEmptyCTA).
const FormModal = dynamic(() => import('./FormModal').then((m) => m.FormModal), { ssr: false });

interface FormModalButtonProps {
  /** RENDERABLE definition (recipient config already stripped server-side). */
  form: FormDef;
  label: string;
  className?: string;
}

/**
 * The client island a page CTA renders when it targets a form-builder form
 * (P2-FB-001): a button that opens the form in a modal. The form definition
 * arrives resolved from the server's tag-cached read, so the embedding page
 * stays static and a Studio edit revalidates it via the webhook.
 */
export function FormModalButton({ form, label, className }: FormModalButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'inline-flex h-12 items-center justify-center rounded-md bg-brand-green px-6 text-base font-semibold text-white hover:opacity-90'
        }
      >
        {label}
      </button>
      {open && <FormModal open form={form} onClose={() => setOpen(false)} />}
    </>
  );
}
