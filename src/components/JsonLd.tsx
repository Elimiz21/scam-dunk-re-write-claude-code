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
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
