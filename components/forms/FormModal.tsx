'use client';

import { useEffect, useRef } from 'react';
import { FormRenderer } from './FormRenderer';
import type { FormDef } from '@/lib/forms/form-def';

/**
 * Modal wrapper for a form-builder form (P2-FB-001) — mirrors LeadFormModal's
 * focus/scroll/escape behavior, with the title + intro coming from the form
 * definition instead of hardcoded copy.
 */

interface FormModalProps {
  open: boolean;
  onClose: () => void;
  form: FormDef;
  sourceUrl?: string;
  /** Extra hidden values posted with the submission — see FormModalButton. */
  hiddenFields?: Record<string, string>;
}

export function FormModal({ open, onClose, form, sourceUrl, hiddenFields }: FormModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="builder-form-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl outline-none sm:rounded-xl"
      >
        {/* Header — fixed, doesn't scroll */}
        <div className="relative border-b border-border bg-white px-6 pb-5 pt-6 sm:px-8 sm:pt-8">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-soft hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <h2
            id="builder-form-modal-title"
            className="px-10 text-center text-2xl font-bold leading-tight text-brand-ink sm:text-3xl"
          >
            {form.title}
          </h2>
          {form.intro?.trim() && (
            <p className="mx-auto mt-2 max-w-xl px-10 text-center text-sm text-text-muted sm:text-base">
              {form.intro}
            </p>
          )}
        </div>

        {/* Body — scrolls, scrollbar hidden. The intro is shown in the header,
            so the renderer gets a copy WITHOUT it (no double display). */}
        <div className="flex-1 overflow-y-auto px-6 py-6 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-8 sm:py-8 [&::-webkit-scrollbar]:hidden">
          <FormRenderer
            form={{ ...form, intro: undefined }}
            sourceUrl={sourceUrl}
            hiddenFields={hiddenFields}
          />
        </div>
      </div>
    </div>
  );
}
