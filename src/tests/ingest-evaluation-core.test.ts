const list = jest.fn();
const getPublicUrl = jest.fn((filename: string) => ({
  data: { publicUrl: `https://storage.test/${filename}` },
}));
const from = jest.fn(() => ({ list, getPublicUrl }));

jest.mock("@/lib/supabase", () => ({
  EVALUATION_BUCKET: "evaluation-data",
  supabase: { storage: { from } },
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    dailyScanSummary: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/promoted-stocks/tracker", () => ({
  fetchDailyCloses: jest.fn(),
}));

import { prisma } from "@/lib/db";
import {
  getPendingDates,
  ingestDate,
} from "@/lib/admin/ingest-evaluation-core";

describe("getPendingDates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.dailyScanSummary.findMany as jest.Mock).mockResolvedValue([]);
    global.fetch = jest.fn();
  });

  it("discovers a recent evaluation file beyond the first storage page", async () => {
    list
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, i) => ({
          name: `historical-${String(i).padStart(4, "0")}.json`,
        })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { name: "enhanced-evaluation-2026-08-14.json" },
          { name: "enhanced-evaluation-2026-08-12.json" },
        ],
        error: null,
      });

    await expect(getPendingDates()).resolves.toEqual([
      "2026-08-12",
      "2026-08-14",
    ]);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenNthCalledWith(1, "", {
      limit: 500,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    expect(list).toHaveBeenNthCalledWith(2, "", {
      limit: 500,
      offset: 500,
      sortBy: { column: "name", order: "asc" },
    });
  });

  it("does not expose a degraded pipeline date for canonical ingestion", async () => {
    list.mockResolvedValueOnce({
      data: [
        { name: "enhanced-evaluation-2026-08-21.json" },
        { name: "pipeline-validation-2026-08-21.json" },
      ],
      error: null,
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: "degraded" }),
    });

    await expect(getPendingDates()).resolves.toEqual([]);
  });

  it("exposes a healthy validated pipeline date for canonical ingestion", async () => {
    list.mockResolvedValueOnce({
      data: [
        { name: "enhanced-evaluation-2026-08-21.json" },
        { name: "pipeline-validation-2026-08-21.json" },
      ],
      error: null,
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: "healthy" }),
    });

    await expect(getPendingDates()).resolves.toEqual(["2026-08-21"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://storage.test/pipeline-validation-2026-08-21.json",
      { cache: "no-store" },
    );
  });

  it("blocks direct ingestion when the date has degraded validation", async () => {
    list.mockResolvedValueOnce({
      data: [{ name: "pipeline-validation-2026-08-21.json" }],
      error: null,
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: "degraded" }),
    });

    const result = await ingestDate("2026-08-21");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not eligible for ingestion");
    expect(prisma.dailyScanSummary.findMany).not.toHaveBeenCalled();
  });
});
