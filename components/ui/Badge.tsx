import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
  {
    variants: {
      variant: {
        new: 'bg-brand-green text-white',
        sale: 'bg-brand-red text-white',
        hot: 'bg-brand-ink text-white',
        neutral: 'bg-bg-soft text-text-primary',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
