import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Accordion } from '@/components/ui/Accordion';
import { Badge } from '@/components/ui/Badge';

export const metadata = {
  title: 'Style Guide',
  description: 'Brand tokens, typography, buttons, and form elements for visual review.',
};

const COLORS = [
  { name: 'brand-red', value: '#E11F1E' },
  { name: 'brand-ink', value: '#231F20' },
  { name: 'brand-green', value: '#16A34A' },
  { name: 'brand-white', value: '#FFFFFF' },
  { name: 'text-primary', value: '#1A1A1A' },
  { name: 'text-muted', value: '#666666' },
  { name: 'border', value: '#E5E5E5' },
  { name: 'bg-soft', value: '#F5F5F5' },
];

const TYPE_SCALE = [
  { tag: 'h1', label: 'Heading 1', sample: 'The quick brown fox' },
  { tag: 'h2', label: 'Heading 2', sample: 'The quick brown fox' },
  { tag: 'h3', label: 'Heading 3', sample: 'The quick brown fox' },
  { tag: 'h4', label: 'Heading 4', sample: 'The quick brown fox' },
  { tag: 'h5', label: 'Heading 5', sample: 'The quick brown fox' },
  { tag: 'h6', label: 'Heading 6', sample: 'The quick brown fox' },
];

const ACCORDION_ITEMS = [
  {
    question: 'Are custom imprints included in the price?',
    answer:
      'Yes - the base price includes a one-color, one-location imprint. Additional colors or locations are quoted on request.',
  },
  {
    question: 'What is the minimum order quantity?',
    answer: 'Most items start at 24, 50, or 100 pieces. The product page shows MOQ for each item.',
  },
  {
    question: 'How fast can you turn around a rush order?',
    answer:
      'Many products can ship in 1-3 business days. Filter by "Rush" or call 800-773-9472 to confirm.',
  },
];

export default function StyleGuidePage() {
  return (
    <Container as="section" className="py-12">
      <h1>Perfect Imprints Style Guide</h1>
      <p className="mt-2 text-text-muted">
        Visual reference for brand tokens, typography, buttons, forms, and components.
      </p>

      <Section title="Colors">
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {COLORS.map((c) => (
            <li
              key={c.name}
              className="overflow-hidden rounded border border-border"
            >
              <div className="h-20" style={{ background: c.value }} aria-hidden="true" />
              <div className="p-3 text-sm">
                <div className="font-medium text-text-primary">{c.name}</div>
                <div className="text-text-muted">{c.value}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography">
        <ul className="mt-4 space-y-3">
          {TYPE_SCALE.map((t) => {
            const Tag = t.tag as keyof React.JSX.IntrinsicElements;
            return (
              <li
                key={t.tag}
                className="flex flex-wrap items-baseline gap-3 border-b border-border pb-3"
              >
                <span className="w-24 text-xs uppercase tracking-wide text-text-muted">
                  {t.label}
                </span>
                <Tag>{t.sample}</Tag>
              </li>
            );
          })}
          <li className="border-b border-border pb-3">
            <span className="block text-xs uppercase tracking-wide text-text-muted">
              Body
            </span>
            <p>Body copy at the default size, with a 1.6 line height for readability.</p>
          </li>
          <li>
            <span className="block text-xs uppercase tracking-wide text-text-muted">
              Small
            </span>
            <p className="text-sm text-text-muted">Captions, metadata, helper text.</p>
          </li>
        </ul>
      </Section>

      <Section title="Buttons">
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary CTA</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Form Elements">
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium text-text-primary">Name</span>
            <Input className="mt-1" placeholder="Pat Black" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-text-primary">Email</span>
            <Input className="mt-1" type="email" placeholder="patrick@example.com" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-text-primary">
              Phone (error state)
            </span>
            <Input className="mt-1" type="tel" error placeholder="800-773-9472" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-text-primary">Quantity</span>
            <Select className="mt-1" defaultValue="">
              <option value="" disabled>
                Choose a range
              </option>
              <option>24-50</option>
              <option>51-100</option>
              <option>100+</option>
            </Select>
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium text-text-primary">Message</span>
            <Textarea className="mt-1" placeholder="Tell us about your project." />
          </label>
        </div>
      </Section>

      <Section title="Badges">
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="new">New</Badge>
          <Badge variant="sale">Sale</Badge>
          <Badge variant="hot">Hot</Badge>
          <Badge variant="neutral">Default</Badge>
        </div>
      </Section>

      <Section title="Accordion">
        <Accordion className="mt-4" items={ACCORDION_ITEMS} defaultOpenIndex={0} />
      </Section>

      <Section title="Layout previews">
        <p className="mt-4 text-sm text-text-muted">
          The Header and Footer wrap every page automatically. Scroll to the top and
          bottom of this page to review them.
        </p>
      </Section>
    </Container>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
