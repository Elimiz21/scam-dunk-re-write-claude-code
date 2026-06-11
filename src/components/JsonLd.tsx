"use client";

/**
 * JsonLd — component for injecting JSON-LD structured data.
 * Works in both server and client component trees.
 * Usage: <JsonLd data={schemaObject} />
 */
export function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  // Escape "<" so DB-sourced fields (article headline/body, etc.) cannot break
  // out of the <script> block with a literal </script> and inject markup —
  // stored XSS on public pages (FE-M12).
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
