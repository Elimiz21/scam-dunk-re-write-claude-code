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

// First-create fields include outcome floats only for brand-new promoted rows.
// Existing outcome rows still use the narrower source-only update whitelist.
const INSERT_FLOAT_COLUMNS = {
  StockDailySnapshot: {
    lastPrice: "double precision", previousClose: "double precision",
    priceChangePct: "double precision", volumeRatio: "double precision", marketCap: "double precision",
  },
  StockRiskAlert: { priceAtAlert: "double precision" },
  PromotedStock: {
    entryPrice: "double precision", entryMarketCap: "double precision",
    peakPrice: "double precision", currentPrice: "double precision",
    maxGainPct: "double precision", currentGainPct: "double precision",
  },
} as const;

/** Bind float values as round-trip decimal strings. Prisma numeric parameters
 * can lose one ULP before PostgreSQL receives them; strings avoid that ingress.
 * Encoding -0 explicitly also avoids JSON.stringify normalizing its sign. */
function exactFloatTransport(rows: PublicationPatch[], columns: Record<string, string>): string {
  return JSON.stringify(rows.map(({ id, data }) => ({ id, data: Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key,
      columns[key] === "double precision" && typeof value === "number"
        ? Object.is(value, -0) ? "-0" : String(value)
        : value,
    ]),
  ) })));
}

/** Identifiers/types come only from this module's whitelists; values are bound. */
async function executePublicationPatches(
  tx: Prisma.TransactionClient,
  table: keyof typeof TABLE_COLUMNS | keyof typeof INSERT_FLOAT_COLUMNS,
  columns: Record<string, string>,
  rows: PublicationPatch[],
  updateTimestamp: boolean,
): Promise<void> {
  const assignments = Object.entries(columns).map(([column, type]) => {
    const identifier = Prisma.raw(`"${column}"`);
    return Prisma.sql`${identifier} = CASE WHEN incoming."data" ? ${column}
      THEN (incoming."data" ->> ${column})::${Prisma.raw(type)}
      ELSE target.${identifier} END`;
  });
  if (updateTimestamp) assignments.push(Prisma.sql`"updatedAt" = CURRENT_TIMESTAMP`);
  for (const batch of publicationBatches(rows)) {
    const count = await tx.$executeRaw(Prisma.sql`
      UPDATE ${Prisma.raw(`"${table}"`)} AS target
      SET ${Prisma.join(assignments)}
      FROM jsonb_to_recordset(${exactFloatTransport(batch, columns)}::jsonb) AS incoming("id" text, "data" jsonb)
      WHERE target."id" = incoming."id"
    `);
    if (count !== batch.length) throw new Error(`Publication ${table} update lost a target row`);
  }
}

/** Never add operator-owned or promoted outcome fields to TABLE_COLUMNS. */
export async function updatePublicationRows(
  tx: Prisma.TransactionClient,
  table: keyof typeof TABLE_COLUMNS,
  rows: PublicationPatch[],
): Promise<void> {
  await executePublicationPatches(tx, table, TABLE_COLUMNS[table], rows, table !== "StockRiskAlert");
}

/** Must run immediately after createMany in the same transaction. Preserve
 * Prisma defaults/timestamps and correct only explicitly supplied float fields
 * on these newly inserted IDs before the revision becomes visible. */
export async function restoreInsertedPublicationFloats(
  tx: Prisma.TransactionClient,
  table: keyof typeof INSERT_FLOAT_COLUMNS,
  rows: Array<{ id: string }>,
): Promise<void> {
  const columns = INSERT_FLOAT_COLUMNS[table];
  const patches = rows.map((row) => ({ id: row.id, data: definedPatch(row, columns) }))
    .filter((row) => Object.keys(row.data).length > 0);
  await executePublicationPatches(tx, table, columns, patches, false);
}

export function publicationKey(...values: Array<string | Date>): string {
  return JSON.stringify(values.map((value) => value instanceof Date ? value.toISOString() : value));
}
