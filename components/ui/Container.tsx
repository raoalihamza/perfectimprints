import { cn } from '@/lib/utils';

interface ContainerProps {
  as?: 'div' | 'section' | 'article' | 'header' | 'footer' | 'main' | 'nav';
  className?: string;
  children: React.ReactNode;
}

export function Container({ as: Tag = 'div', className, children }: ContainerProps) {
  return (
    <Tag className={cn('mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8', className)}>
      {children}
    </Tag>
  );
}
