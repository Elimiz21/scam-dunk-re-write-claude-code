import { Prisma } from "@prisma/client";

// Bound parameter/payload sizes and the time spent in one database round trip.
export const PUBLICATION_BATCH_SIZE = 500;
export function publicationBatches<T>(rows: readonly T[]): T[][] {
  const batches: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += PUBLICATION_BATCH_SIZE) {
    batches.push(rows.slice(offset, offset + PUBLICATION_BATCH_SIZE));
  }
  return batches;
}

export const ALERT_DERIVED_COLUMNS = {
  previousRiskLevel: "text", newRiskLevel: "text", previousScore: "integer",
  newScore: "integer", triggeringSignals: "text", priceAtAlert: "double precision",
  volumeAtAlert: "integer",
} as const;
export const PROMOTED_SOURCE_COLUMNS = {
  promoterName: "text", promotionPlatform: "text", promotionGroup: "text",
  entryPrice: "double precision", entryMarketCap: "double precision",
  entryRiskScore: "integer", evidenceLinks: "text",
} as const;
const TRACKED_COLUMNS = { exchange: "text", isOTC: "boolean" } as const;
const TABLE_COLUMNS = {
  StockRiskAlert: ALERT_DERIVED_COLUMNS,
  PromotedStock: PROMOTED_SOURCE_COLUMNS,
  TrackedStock: TRACKED_COLUMNS,
} as const;

export interface PublicationPatch { id: string; data: Record<string, unknown> }

/** Omitted fields keep their prior value; explicit null remains an update. */
export function definedPatch(input: object, columns: object): Record<string, unknown> {
  const record = input as Record<string, unknown>;
  return Object.fromEntries(Object.keys(columns)
    .filter((key) => record[key] !== undefined)
    .map((key) => [key, record[key]]));
}

export function trackedStockPatches(
  updates: Array<{ id: string; data: Pick<Prisma.TrackedStockUpdateInput, "exchange" | "isOTC"> }>,
): PublicationPatch[] {
  const byId = new Map<string, PublicationPatch>();
  for (const update of updates) {
    const patch = definedPatch(update.data, TRACKED_COLUMNS);
    for (const key of Object.keys(patch)) {
      const value = patch[key];
      if (value && typeof value === "object" && "set" in value) {
        patch[key] = (value as { set: unknown }).set;
        if (patch[key] === undefined) delete patch[key];
      }
    }
    const existing = byId.get(update.id);
    if (existing) Object.assign(existing.data, patch);
    else byId.set(update.id, { id: update.id, data: patch });
  }
  return Array.from(byId.values());
}

/** Identifiers/types come only from this module's whitelist; values are bound.
 * Do not add operator-owned fields or promoted outcome fields to the whitelist. */
export async function updatePublicationRows(
  tx: Prisma.TransactionClient,
  table: keyof typeof TABLE_COLUMNS,
  rows: PublicationPatch[],
): Promise<void> {
  const assignments = Object.entries(TABLE_COLUMNS[table]).map(([column, type]) => {
    const identifier = Prisma.raw(`"${column}"`);
    return Prisma.sql`${identifier} = CASE WHEN incoming."data" ? ${column}
      THEN (incoming."data" ->> ${column})::${Prisma.raw(type)}
      ELSE target.${identifier} END`;
  });
  if (table !== "StockRiskAlert") assignments.push(Prisma.sql`"updatedAt" = CURRENT_TIMESTAMP`);
  for (const batch of publicationBatches(rows)) {
    const count = await tx.$executeRaw(Prisma.sql`
      UPDATE ${Prisma.raw(`"${table}"`)} AS target
      SET ${Prisma.join(assignments)}
      FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS incoming("id" text, "data" jsonb)
      WHERE target."id" = incoming."id"
    `);
    if (count !== batch.length) throw new Error(`Publication ${table} update lost a target row`);
  }
}

export function publicationKey(...values: Array<string | Date>): string {
  return JSON.stringify(values.map((value) => value instanceof Date ? value.toISOString() : value));
}
