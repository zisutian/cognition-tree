// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { readModuleImports, type SourceModules } from "./moduleImports.ts";

const cliModules = import.meta.glob("../../tooling/cli/**/*.ts", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

describe("trusted-client CLI boundary", () => {
  it("uses the public API contract without importing server or content owners", () => {
    const forbiddenRoots = [
      "/application/",
      "/core/",
      "/infrastructure/",
      "/presentation/",
    ];

    for (const filePath of Object.keys(cliModules)) {
      for (const importPath of readModuleImports(cliModules, filePath)) {
        expect(
          forbiddenRoots.some((root) => importPath.includes(root)),
          `${filePath} imports ${importPath}`,
        ).toBe(false);
      }
    }
  });

  it("does not acquire secrets or server configuration from the environment", () => {
    for (const [filePath, source] of Object.entries(cliModules)) {
      expect(source, filePath).not.toContain("process.env");
      expect(source, filePath).not.toContain("bootstrap-v1");
      expect(source, filePath).not.toContain("repositories/");
    }
  });
});
