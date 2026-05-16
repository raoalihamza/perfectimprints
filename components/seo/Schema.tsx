// TODO: M5-508 - Render arbitrary JSON-LD schema in a <script type="application/ld+json">.

interface SchemaProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

export function Schema({ data }: SchemaProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
