import { randomUUID } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  ArtifactManifest,
  IngestionStore,
  PhaseClaim,
} from "@/lib/admin/artifact-ingestion";

/** PostgreSQL-backed phase store. Unique keys and lease-token comparisons make
 * retries and concurrent workers converge on one published revision. */
export class PrismaIngestionStore implements IngestionStore {
  constructor(private readonly client: PrismaClient) {}

  private async serializable<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2034" ||
          attempt === 3
        ) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 10));
      }
    }
    throw lastError;
  }

  async ensureRevision(
    manifest: ArtifactManifest,
    phases: readonly string[],
  ): Promise<void> {
    const manifestJson = JSON.stringify(manifest);
    const manifestPath = `revisions/${manifest.scanDate}/${manifest.revisionHash}/manifest.json`;
    let revision: { id: string; manifestJson: string };
    try {
      revision = await this.client.evaluationArtifactRevision.upsert({
        where: { revisionHash: manifest.revisionHash },
        create: {
          scanDate: new Date(`${manifest.scanDate}T00:00:00.000Z`),
          producerRunId: manifest.producerRunId,
          producerExecutedAt: manifest.producerExecutedAt
            ? new Date(manifest.producerExecutedAt)
            : null,
          revisionHash: manifest.revisionHash,
          manifestPath,
          manifestJson,
          requiredPhases: JSON.stringify(phases),
          artifacts: {
            create: manifest.artifacts.map((artifact) => ({
              logicalName: artifact.logicalName,
              storagePath: artifact.storagePath,
              sha256: artifact.sha256,
              byteLength: artifact.byteLength,
              required: artifact.required,
            })),
          },
          phases: {
            create: phases.map((phase) => ({ phase })),
          },
        },
        update: {},
        select: { id: true, manifestJson: true },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }
      revision = await this.client.evaluationArtifactRevision.findUniqueOrThrow({
        where: { revisionHash: manifest.revisionHash },
        select: { id: true, manifestJson: true },
      });
    }
    if (revision.manifestJson !== manifestJson) {
      throw new Error("Revision hash collision or manifest mutation detected");
    }
    await this.client.evaluationIngestionPhase.createMany({
      data: phases.map((phase) => ({ revisionId: revision.id, phase })),
      skipDuplicates: true,
    });
  }

  async claimPhase(
    revisionHash: string,
    phase: string,
    workerId: string,
    leaseMs: number,
  ): Promise<PhaseClaim> {
    return this.serializable(() =>
      this.client.$transaction(
        async (tx) => {
        const revision = await tx.evaluationArtifactRevision.findUniqueOrThrow({
          where: { revisionHash },
          select: { id: true },
        });
        const current = await tx.evaluationIngestionPhase.findUniqueOrThrow({
          where: { revisionId_phase: { revisionId: revision.id, phase } },
          select: { status: true },
        });
        if (current.status === "COMPLETE") return { state: "COMPLETE" };

        const now = new Date();
        const leaseToken = randomUUID();
        const claimed = await tx.evaluationIngestionPhase.updateMany({
          where: {
            revisionId: revision.id,
            phase,
            OR: [
              { status: { in: ["PENDING", "FAILED"] } },
              { status: "RUNNING", leaseExpiresAt: { lte: now } },
            ],
          },
          data: {
            status: "RUNNING",
            leaseToken,
            leaseOwner: workerId,
            leaseExpiresAt: new Date(now.getTime() + leaseMs),
            startedAt: now,
            completedAt: null,
            lastError: null,
            attemptCount: { increment: 1 },
          },
        });
        if (claimed.count !== 1) return { state: "BUSY" };
        await tx.evaluationArtifactRevision.update({
          where: { id: revision.id },
          data: { status: "INGESTING" },
        });
        return { state: "CLAIMED", leaseToken };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async completePhase(
    revisionHash: string,
    phase: string,
    leaseToken: string,
  ): Promise<void> {
    const updated = await this.client.evaluationIngestionPhase.updateMany({
      where: { revision: { revisionHash }, phase, status: "RUNNING", leaseToken },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
        leaseToken: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (updated.count !== 1) throw new Error(`Lost lease for ${phase}`);
  }

  async failPhase(
    revisionHash: string,
    phase: string,
    leaseToken: string | undefined,
    error: string,
  ): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const revision = await tx.evaluationArtifactRevision.findUniqueOrThrow({
        where: { revisionHash },
        select: { id: true },
      });
      const updated = await tx.evaluationIngestionPhase.updateMany({
        where: {
          revisionId: revision.id,
          phase,
          ...(leaseToken ? { status: "RUNNING", leaseToken } : {}),
        },
        data: {
          status: "FAILED",
          lastError: error.slice(0, 10_000),
          leaseToken: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (updated.count !== 1) throw new Error(`Lost lease for ${phase}`);
      await tx.evaluationArtifactRevision.update({
        where: { id: revision.id },
        data: { status: "FAILED" },
      });
    });
  }

  async publishIfComplete(
    revisionHash: string,
    requiredPhases: readonly string[],
  ): Promise<boolean> {
    return this.serializable(() =>
      this.client.$transaction(
        async (tx) => {
        const revision = await tx.evaluationArtifactRevision.findUniqueOrThrow({
          where: { revisionHash },
          select: { id: true, scanDate: true, status: true },
        });
        const complete = await tx.evaluationIngestionPhase.count({
          where: {
            revisionId: revision.id,
            phase: { in: [...requiredPhases] },
            status: "COMPLETE",
          },
        });
        if (complete !== requiredPhases.length) return false;
        const publishedAt = new Date();
        await tx.evaluationArtifactRevision.updateMany({
          where: {
            scanDate: revision.scanDate,
            status: "PUBLISHED",
            id: { not: revision.id },
          },
          data: { status: "SUPERSEDED" },
        });
        await tx.evaluationArtifactRevision.update({
          where: { id: revision.id },
          data: { status: "PUBLISHED", publishedAt },
        });
        return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async publishEvaluationRevision(input: {
    revisionHash: string;
    phase: string;
    leaseToken: string;
    scanDate: Date;
    snapshots: Prisma.StockDailySnapshotCreateManyInput[];
    alerts: Prisma.StockRiskAlertCreateManyInput[];
    promotedStocks: Prisma.PromotedStockCreateManyInput[];
    summary: Omit<
      Prisma.DailyScanSummaryUncheckedCreateInput,
      "id" | "scanDate" | "artifactRevisionId" | "publishedAt" | "createdAt" | "updatedAt"
    >;
  }): Promise<{
    snapshotsCreated: number;
    alertsCreated: number;
    promotedStocksCreated: number;
  }> {
    return this.serializable(() =>
      this.client.$transaction(
        async (tx) => {
          const revision = await tx.evaluationArtifactRevision.findUniqueOrThrow({
            where: { revisionHash: input.revisionHash },
            select: { id: true, scanDate: true },
          });
          if (revision.scanDate.getTime() !== input.scanDate.getTime()) {
            throw new Error("Revision scan date mismatch");
          }
          const lease = await tx.evaluationIngestionPhase.findUniqueOrThrow({
            where: {
              revisionId_phase: {
                revisionId: revision.id,
                phase: input.phase,
              },
            },
            select: { status: true, leaseToken: true },
          });
          if (lease.status !== "RUNNING" || lease.leaseToken !== input.leaseToken) {
            throw new Error(`Lost lease for ${input.phase}`);
          }

          await tx.stockDailySnapshot.deleteMany({
            where: { scanDate: input.scanDate },
          });
          const snapshots = await tx.stockDailySnapshot.createMany({
            data: input.snapshots.map((snapshot) => ({
              ...snapshot,
              artifactRevisionId: revision.id,
            })),
          });
          // Reconcile derived alert fields while retaining operator-owned
          // acknowledgement, notes, stable IDs, and creation timestamps.
          const retainedAlertIds: string[] = [];
          let alertsCreated = 0;
          for (const alert of input.alerts) {
            const existing = await tx.stockRiskAlert.findFirst({
              where: {
                stockId: alert.stockId,
                alertDate: alert.alertDate,
                alertType: alert.alertType,
              },
              orderBy: { createdAt: "asc" },
              select: { id: true },
            });
            if (existing) {
              await tx.stockRiskAlert.update({
                where: { id: existing.id },
                data: {
                  previousRiskLevel: alert.previousRiskLevel,
                  newRiskLevel: alert.newRiskLevel,
                  previousScore: alert.previousScore,
                  newScore: alert.newScore,
                  triggeringSignals: alert.triggeringSignals,
                  priceAtAlert: alert.priceAtAlert,
                  volumeAtAlert: alert.volumeAtAlert,
                },
              });
              retainedAlertIds.push(existing.id);
            } else {
              const created = await tx.stockRiskAlert.create({
                data: alert,
                select: { id: true },
              });
              retainedAlertIds.push(created.id);
              alertsCreated++;
            }
          }
          // Remove obsolete machine-only rows from a superseded revision, but
          // keep any row that carries operator acknowledgement or notes.
          await tx.stockRiskAlert.deleteMany({
            where: {
              alertDate: input.scanDate,
              ...(retainedAlertIds.length
                ? { id: { notIn: retainedAlertIds } }
                : {}),
              isAcknowledged: false,
              OR: [{ notes: null }, { notes: "" }],
            },
          });
          // PromotedStock is a long-lived outcome ledger. A revision may omit
          // this optional artifact, and later tracking may have populated peak,
          // outcome, current-price, and activity fields. Reconcile only retained
          // source fields and never delete/reset downstream tracking state.
          let promotedStocksCreated = 0;
          for (const promoted of input.promotedStocks) {
            await tx.promotedStock.upsert({
              where: {
                symbol_addedDate: {
                  symbol: promoted.symbol,
                  addedDate: promoted.addedDate,
                },
              },
              create: promoted,
              update: {
                promoterName: promoted.promoterName,
                promotionPlatform: promoted.promotionPlatform,
                promotionGroup: promoted.promotionGroup,
                entryPrice: promoted.entryPrice,
                entryMarketCap: promoted.entryMarketCap,
                entryRiskScore: promoted.entryRiskScore,
                evidenceLinks: promoted.evidenceLinks,
              },
            });
            promotedStocksCreated++;
          }
          const publishedAt = new Date();
          await tx.dailyScanSummary.upsert({
            where: { scanDate: input.scanDate },
            create: {
              scanDate: input.scanDate,
              ...input.summary,
              artifactRevisionId: revision.id,
              publishedAt,
            },
            update: {
              ...input.summary,
              artifactRevisionId: revision.id,
              publishedAt,
            },
          });
          await tx.evaluationIngestionPhase.update({
            where: {
              revisionId_phase: {
                revisionId: revision.id,
                phase: input.phase,
              },
            },
            data: {
              status: "COMPLETE",
              completedAt: publishedAt,
              leaseToken: null,
              leaseOwner: null,
              leaseExpiresAt: null,
            },
          });
          await tx.evaluationArtifactRevision.updateMany({
            where: {
              scanDate: input.scanDate,
              status: "PUBLISHED",
              id: { not: revision.id },
            },
            data: { status: "SUPERSEDED" },
          });
          await tx.evaluationArtifactRevision.update({
            where: { id: revision.id },
            data: { status: "PUBLISHED", publishedAt },
          });
          return {
            snapshotsCreated: snapshots.count,
            alertsCreated,
            promotedStocksCreated,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }
}
