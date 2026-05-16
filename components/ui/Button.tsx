import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-green text-white hover:bg-brand-green/90 focus-visible:ring-brand-green',
        secondary:
          'border border-brand-ink bg-transparent text-brand-ink hover:bg-brand-ink hover:text-white focus-visible:ring-brand-ink',
        danger:
          'bg-brand-red text-white hover:bg-brand-red/90 focus-visible:ring-brand-red',
        ghost: 'bg-transparent text-brand-ink hover:bg-bg-soft',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-5 text-base',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
});
