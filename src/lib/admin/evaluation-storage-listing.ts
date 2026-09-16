export interface StorageListFile {
  name: string;
}

type StorageList = (
  path: string,
  options: {
    limit: number;
    offset: number;
    sortBy: { column: "name"; order: "asc" };
  },
) => Promise<{
  data: StorageListFile[] | null;
  error: { message: string } | null;
}>;

export async function listAllEvaluationFiles(
  list: StorageList,
  path = "",
): Promise<StorageListFile[]> {
  const files: StorageListFile[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await list(path, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error || !data) {
      throw new Error(error?.message ?? "Storage listing returned no data");
    }
    files.push(...data);
    if (data.length < pageSize) return files;
  }
}
