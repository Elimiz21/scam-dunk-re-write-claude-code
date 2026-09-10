import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "src/components/ui/info-tooltip.tsx"),
  "utf8",
);

describe("InfoTooltip HTML semantics", () => {
  test("uses phrasing content so it is valid inside inline dashboard labels", () => {
    expect(source).toContain('role="tooltip"');
    expect(source).not.toMatch(/<div[\s\S]*?role="tooltip"/);
    expect(source).not.toContain("<p className=");
  });
});
