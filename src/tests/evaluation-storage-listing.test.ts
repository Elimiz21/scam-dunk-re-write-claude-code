import { listAllEvaluationFiles } from "@/lib/admin/evaluation-storage-listing";

describe("evaluation storage pagination", () => {
  it("discovers artifacts beyond 1,500 objects", async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, index) => ({ name: `a-${index}` })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, index) => ({ name: `b-${index}` })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, index) => ({ name: `c-${index}` })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ name: "enhanced-evaluation-2026-09-16.json" }],
        error: null,
      });

    await expect(listAllEvaluationFiles(list)).resolves.toHaveLength(1501);
    expect(list).toHaveBeenLastCalledWith("", {
      limit: 500,
      offset: 1500,
      sortBy: { column: "name", order: "asc" },
    });
  });

  it("fails the whole listing when any page fails", async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({ name: "x" })), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "page failed" } });

    await expect(listAllEvaluationFiles(list)).rejects.toThrow("page failed");
  });
});
