import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

describe("artifact workflow CLI entrypoints", () => {
  const repo = path.resolve(__dirname, "../..");
  const tsNode = path.join(repo, "node_modules/.bin/ts-node");

  it("imports the uploader with the exact plain ts-node workflow runtime", () => {
    expect(() => execFileSync(tsNode, [
      "--project", "tsconfig.json", "-e", "require('./scripts/storage-publisher')",
    ], { cwd: path.join(repo, "evaluation"), stdio: "pipe" })).not.toThrow();
  });

  it("runs the reconciliation CLI offline with a retained-file fixture", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-cli-"));
    const fixture = path.join(temp, "objects.txt");
    fs.writeFileSync(fixture, "fmp-evaluation-2026-09-15.json\nfmp-summary-2026-09-15.json\n");
    const output = execFileSync(tsNode, [
      "--project", "scripts/tsconfig.cli.json",
      "scripts/reconcile-evaluation-artifacts.ts", "--files-from", fixture,
    ], { cwd: repo, encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({
      mode: "DRY_RUN_READ_ONLY",
      providerCalls: 0,
      databaseWrites: 0,
      storageWrites: 0,
    });
  });
});
