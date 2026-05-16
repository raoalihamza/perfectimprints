import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded border bg-white px-3 text-base text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        error
          ? 'border-brand-red focus-visible:ring-brand-red'
          : 'border-border focus-visible:ring-brand-ink',
        className,
      )}
      {...props}
    />
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[96px] w-full rounded border bg-white px-3 py-2 text-base text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        error
          ? 'border-brand-red focus-visible:ring-brand-red'
          : 'border-border focus-visible:ring-brand-ink',
        className,
      )}
      {...props}
    />
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, error, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded border bg-white px-3 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        error
          ? 'border-brand-red focus-visible:ring-brand-red'
          : 'border-border focus-visible:ring-brand-ink',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
