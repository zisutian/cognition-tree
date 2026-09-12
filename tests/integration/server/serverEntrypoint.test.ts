// SPDX-License-Identifier: GPL-3.0-or-later

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("server entrypoint", () => {
  it("links under Node native TypeScript stripping", () => {
    const result = spawnSync(
      process.execPath,
      ["infrastructure/server/index.ts", "--unsupported"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Unsupported server arguments: --unsupported",
    );
    expect(result.stderr).not.toContain(
      "does not provide an export named",
    );
  });
});
