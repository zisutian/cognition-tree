import { describe, expect, it } from "vitest";

const retiredProjectEntries = import.meta.glob(
  [
    "../../scripts/**/*.{ts,mjs}",
    "../../tsconfig.node.json",
    "../../tsconfig.server.json",
    "../../tsconfig.e2e.json",
    "../../tsconfig.benchmark.json",
  ],
  { eager: true, import: "default", query: "?raw" },
);
const projectConfiguration = import.meta.glob(
  [
    "../../package.json",
    "../../vite.config.ts",
    "../../playwright.config.ts",
    "../../e2e/support/repositorySeeds.ts",
    "../../e2e/support/workspaceServer.ts",
    "../../tooling/build/*.{ts,mjs}",
    "../../tooling/config/*.json",
  ],
  { eager: true, import: "default", query: "?raw" },
);

function readConfiguration(fileName: string) {
  const entry = Object.entries(projectConfiguration).find(([filePath]) =>
    filePath.endsWith(fileName)
  );

  if (!entry || typeof entry[1] !== "string") {
    throw new Error(`Missing project configuration: ${fileName}`);
  }
  return entry[1];
}

describe("project layout", () => {
  it("keeps auxiliary tooling out of retired root locations", () => {
    expect(Object.keys(retiredProjectEntries)).toEqual([]);
  });

  it("routes disposable output through the artifacts directory", () => {
    expect(readConfiguration("package.json")).toContain(
      ".artifacts/build/server/infrastructure/server/index.js",
    );
    expect(readConfiguration("vite.config.ts")).toContain(
      'outDir: ".artifacts/build/client"',
    );
    expect(readConfiguration("playwright.config.ts")).toContain(
      'outputDir: ".artifacts/test/playwright"',
    );
    expect(readConfiguration("repositorySeeds.ts")).toContain(
      'path.join(".artifacts", "test", "e2e-runtime", "repositories")',
    );
    expect(readConfiguration("workspaceServer.ts")).toContain(
      'path.join(".artifacts", "test", "e2e-runtime", "server")',
    );
    expect(readConfiguration("tsconfig.server.json")).toContain(
      '"outDir": "../../.artifacts/build/server"',
    );
    expect(readConfiguration("tsconfig.node.json")).toContain(
      '"tsBuildInfoFile": "../../.artifacts/cache/typescript/node.tsbuildinfo"',
    );
    expect(readConfiguration("verifyClientBundle.ts")).toContain(
      "../../.artifacts/build/client/.vite/manifest.json",
    );
  });
});
