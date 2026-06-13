import { Container } from '@/components/ui/Container';
import type { HomeTestimonial } from '@/lib/sanity/queries/home';

interface TestimonialsProps {
  testimonials: HomeTestimonial[];
}

export function Testimonials({ testimonials }: TestimonialsProps) {
  if (testimonials.length === 0) return null;

  return (
    <section className="bg-brand-ink text-white">
      <Container className="py-14 md:py-20">
        <h2 className="text-2xl font-bold md:text-3xl">What buyers say</h2>
        <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {testimonials.slice(0, 6).map((t, i) => (
            <li
              key={`${t.attribution}-${i}`}
              className="rounded-md border border-white/10 bg-white/5 p-6"
            >
              <blockquote className="text-base leading-relaxed text-white/90 md:text-lg">
                &ldquo;{t.text}&rdquo;
              </blockquote>
              <figcaption className="mt-4 text-sm text-white/70">
                <span className="font-semibold text-white">{t.attribution}</span>
                {t.company && <span> · {t.company}</span>}
              </figcaption>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
