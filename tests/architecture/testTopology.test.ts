import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const e2eRoot = new URL("../../e2e/", import.meta.url);
const e2eSpecNames = readdirSync(e2eRoot)
  .filter((fileName) => fileName.endsWith(".pw.ts"))
  .sort();

function readE2eSpec(fileName: string) {
  return readFileSync(new URL(fileName, e2eRoot), "utf8");
}

describe("test topology", () => {
  it("keeps browser scenarios split by independent workbench domains", () => {
    expect(e2eSpecNames.length).toBeGreaterThanOrEqual(3);
    expect(e2eSpecNames).not.toContain("workbench.pw.ts");
    expect(e2eSpecNames).not.toContain("workbench-core.pw.ts");
    expect(
      e2eSpecNames.every((fileName) =>
        /^workbench-[a-z]+(?:-[a-z]+)*\.pw\.ts$/.test(fileName),
      ),
    ).toBe(true);
  });

  it("keeps repository setup and page entry helpers out of scenario specs", () => {
    const violations = e2eSpecNames.flatMap((fileName) => {
      const source = readE2eSpec(fileName);
      const errors = [
        source.includes('./support/repositorySeeds')
          ? null
          : "missing repository seed support",
        source.includes('./support/workbenchPage')
          ? null
          : "missing workbench page support",
        /(?:async\s+)?function\s+(?:seed\w*Repository|openWorkbench|getActivityButton)\b/.test(
          source,
        )
          ? "defines shared setup inline"
          : null,
      ].filter(Boolean);

      return errors.map((error) => `${fileName}: ${error}`);
    });

    expect(violations).toEqual([]);
  });
});
