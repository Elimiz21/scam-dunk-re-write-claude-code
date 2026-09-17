import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

describe("retained-artifact workflow commands", () => {
  test.each(["bulk-upload-supabase.yml", "backfill-data-repo.yml"])(
    "%s executes its actual reconciliation arguments offline",
    (workflow) => {
      const root = path.resolve(__dirname, "../..");
      const source = fs.readFileSync(path.join(root, ".github/workflows", workflow), "utf8");
      const invocation = source.match(/npx ts-node([^\n]*scripts\/reconcile-evaluation-artifacts\.ts)/);
      expect(invocation).not.toBeNull();
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), "reconciliation-workflow-"));
      try {
        const fixture = path.join(temp, "objects.txt");
        fs.writeFileSync(fixture, "fmp-evaluation-2026-09-15.json\nfmp-summary-2026-09-15.json\n");
        const output = execFileSync(path.join(root, "node_modules/.bin/ts-node"), [
          ...invocation![1].trim().split(/\s+/), "--files-from", fixture,
        ], { cwd: root, encoding: "utf8", stdio: "pipe" });
        expect(JSON.parse(output)).toMatchObject({ mode: "DRY_RUN_READ_ONLY", providerCalls: 0, databaseWrites: 0, storageWrites: 0 });
      } finally {
        fs.rmSync(temp, { recursive: true, force: true });
      }
    },
  );
});
