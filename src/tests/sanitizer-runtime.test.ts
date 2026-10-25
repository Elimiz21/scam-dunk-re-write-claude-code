import { spawnSync } from "node:child_process";

test("the server sanitizer loads without require(ESM) and preserves safe article HTML", () => {
  const child = spawnSync(process.execPath, ["--no-experimental-require-module", "-e", `
    const purifier = require("isomorphic-dompurify");
    const inputs = [
      '<p><strong>Formatting</strong> <a href="https://example.com/reference">Reference</a></p>',
      '<script>window.bad=1</script><img src="x" onerror="window.bad=2"><a href="java&#x73;cript:window.bad=3">Link</a>',
      '<svg><g onload="window.bad=4"></g></svg><math><mi xlink:href="javascript:window.bad=5">Text</mi></math>',
      '<table><tr><td>Cell</td></tr></table>'
    ];
    console.log(JSON.stringify(inputs.map(input => purifier.sanitize(input))));
  `], { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 });

  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).not.toContain("ERR_REQUIRE_ESM");
  const output = JSON.parse(child.stdout) as string[];
  expect(output[0]).toContain("<strong>Formatting</strong>");
  expect(output[0]).toContain('href="https://example.com/reference"');
  expect(output[1]).not.toMatch(/<script|onerror|javascript:/i);
  expect(output[2]).not.toMatch(/onload|javascript:/i);
  expect(output[3]).toContain("<td>Cell</td>");
});
