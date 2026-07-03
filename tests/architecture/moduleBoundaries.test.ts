import { describe, expect, it } from "vitest";

type SourceModules = Record<string, string>;

type BoundaryRule = {
  blockedImports: RegExp[];
  fromDir: string;
};

const sourceModules = import.meta.glob("../../src/**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

function listSourceFiles(dir: string) {
  return Object.keys(sourceModules).filter((filePath) =>
    filePath.startsWith(`../../src/${dir}/`),
  );
}

function readImports(filePath: string) {
  const source = sourceModules[filePath] ?? "";
  const imports = [
    ...source.matchAll(/\bimport\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
  ];

  return imports.map((match) => match[1]);
}

describe("architecture module boundaries", () => {
  it("keeps workspace model inside the workspace layer", () => {
    expect(listSourceFiles("domain")).toEqual([]);
  });

  it("keeps CTN core directories explicitly named", () => {
    expect(listSourceFiles("ctn")).toEqual([]);
    expect(listSourceFiles("syntax")).toEqual([]);
  });

  it("keeps workspace source files grouped by submodule", () => {
    const workspaceRootFiles = Object.keys(sourceModules).filter((filePath) =>
      /^\.\.\/\.\.\/src\/workspace\/[^/]+\.(ts|tsx)$/.test(filePath),
    );

    expect(workspaceRootFiles).toEqual([]);
  });

  it("keeps rendered React components out of workspace", () => {
    const workspaceComponentFiles = Object.keys(sourceModules).filter(
      (filePath) => /^\.\.\/\.\.\/src\/workspace\/.+\.tsx$/.test(filePath),
    );

    expect(workspaceComponentFiles).toEqual([]);
  });

  it("keeps feature packages decoupled through shared feature modules", () => {
    const featureDirs = [
      "features/blocks",
      "features/migration",
      "features/notes",
      "features/syntax",
      "features/visualization",
    ];
    const consumerFeatureImport =
      /^\.\.\/(migration|notes|syntax|visualization)(\/|$)/;
    const violations = featureDirs.flatMap((featureDir) =>
      listSourceFiles(featureDir).flatMap((filePath) =>
        readImports(filePath)
          .filter((importPath) => consumerFeatureImport.test(importPath))
          .map((importPath) => `${filePath} imports ${importPath}`),
      ),
    );

    expect(violations).toEqual([]);
  });

  it("keeps core layers from depending on forbidden higher layers", () => {
    const rules: BoundaryRule[] = [
      {
        fromDir: "workspace/model",
        blockedImports: [
          /^react$/,
          /^react\//,
          /ctn-parser/,
          /ctn-syntax/,
          /editor/,
          /features/,
          /shell/,
          /storage/,
          /runtime/,
          /workspaceRuntime/,
        ],
      },
      {
        fromDir: "ctn-syntax",
        blockedImports: [
          /^react$/,
          /^react\//,
          /app/,
          /editor/,
          /features/,
          /shell/,
          /storage/,
          /workspace/,
        ],
      },
      {
        fromDir: "ctn-parser",
        blockedImports: [
          /^react$/,
          /^react\//,
          /app/,
          /editor/,
          /features/,
          /shell/,
          /storage/,
          /workspace/,
        ],
      },
      {
        fromDir: "storage",
        blockedImports: [
          /^react$/,
          /^react\//,
          /app/,
          /editor/,
          /features/,
          /shell/,
        ],
      },
    ];

    const violations = rules.flatMap((rule) =>
      listSourceFiles(rule.fromDir).flatMap((filePath) => {
        const fileImports = readImports(filePath);

        return fileImports
          .filter((importPath) =>
            rule.blockedImports.some((blockedImport) =>
              blockedImport.test(importPath),
            ),
          )
          .map((importPath) => `${filePath} imports ${importPath}`);
      }),
    );

    expect(violations).toEqual([]);
  });
});
