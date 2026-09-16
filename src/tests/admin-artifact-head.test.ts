const date = "2026-09-16";
const hash = "b".repeat(64);
const path = `revisions/${date}/${hash}/manifest.json`;
const download = jest.fn();
const list = jest.fn();
const summaries = jest.fn();
jest.mock("@/lib/admin/auth", () => ({ getAdminSession: jest.fn().mockResolvedValue({ id: "admin" }) }));
jest.mock("@/lib/db", () => ({ prisma: {
  evaluationArtifactPublicationHead: { findMany: jest.fn(async () => [{ scanDate: new Date(date), revisionHash: hash }]) },
  dailyScanSummary: { findMany: (...args: unknown[]) => summaries(...args) },
  adminAuditLog: { findFirst: jest.fn().mockResolvedValue(null) },
} }));
jest.mock("@/lib/server/evaluation-storage", () => ({ getEvaluationStorageServerClient: () => ({ storage: { from: () => ({ list, download }) } }) }));
jest.mock("@/lib/supabase", () => ({ EVALUATION_BUCKET: "evaluation-data" }));
jest.mock("@/lib/admin/ingest-evaluation-core", () => ({ ingestDate: jest.fn() }));
import { GET } from "@/app/api/admin/ingest-evaluation/route";

describe("admin authoritative artifact discovery", () => {
  test.each([false, true])("lists the head without a pointer and marks correct revision pending (published=%s)", async (published) => {
    list.mockResolvedValue({ data: [], error: null });
    download.mockImplementation(async (name: string) => ({ data: { arrayBuffer: async () => Buffer.from(JSON.stringify({ scanDate: date, revisionHash: hash, artifacts: [{ logicalName: `enhanced-evaluation-${date}.json` }, { logicalName: `fmp-summary-${date}.json` }] })) }, error: name === path ? null : { message: "Unexpected pointer read" } }));
    summaries.mockResolvedValue([{ scanDate: new Date(date), artifactRevision: { revisionHash: published ? hash : "a".repeat(64), status: "PUBLISHED" } }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ availableDates: [date], pendingDates: published ? [] : [date] });
    expect(download).toHaveBeenCalledWith(path);
  });
});
