import { Container } from '@/components/ui/Container';

/**
 * Shared content column for page-builder sections. Every section renders its
 * content inside this same max-width column so headings, paragraphs, image
 * blocks, and icon/card grids all align to identical left/right gutters across
 * every page. (Full-bleed sections like the hero banner and stat banner manage
 * their own width and intentionally do not use this.)
 */
export function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <Container as="section" className="py-8">
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </Container>
  );
}
