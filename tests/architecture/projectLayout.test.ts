import { describe, expect, it } from "vitest";

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
  it("routes disposable output through the artifacts directory", () => {
    const routes = [
      [
        "package.json",
        ".artifacts/build/server/infrastructure/server/index.js",
      ],
      ["vite.config.ts", 'outDir: ".artifacts/build/client"'],
      ["playwright.config.ts", 'outputDir: ".artifacts/test/playwright"'],
      [
        "repositorySeeds.ts",
        'path.join(".artifacts", "test", "e2e-runtime", "repositories")',
      ],
      [
        "workspaceServer.ts",
        'path.join(".artifacts", "test", "e2e-runtime", "server")',
      ],
      [
        "tsconfig.server.json",
        '"outDir": "../../.artifacts/build/server"',
      ],
      [
        "tsconfig.node.json",
        '"tsBuildInfoFile": "../../.artifacts/cache/typescript/node.tsbuildinfo"',
      ],
      [
        "verifyClientBundle.ts",
        "../../.artifacts/build/client/.vite/manifest.json",
      ],
    ] as const;

    expect(routes.flatMap(([fileName, fragment]) =>
      readConfiguration(fileName).includes(fragment)
        ? []
        : [`${fileName}: ${fragment}`]
    )).toEqual([]);
  });
});
