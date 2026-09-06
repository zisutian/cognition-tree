import { describe, expect, it } from "vitest";
import { readModuleImports } from "./moduleImports";
import type { TextCorpus } from "../support/textPolicy";

const architectureTestModules = import.meta.glob([
  "./*.ts",
  "../presentation/designContract.test.ts",
  "../presentation/uiConstraintCatalog.ts",
  "../support/workflowTextPolicies.ts",
], {
  eager: true,
  import: "default",
  query: "?raw",
}) as TextCorpus;

function importsFrom(filePath: string) {
  return readModuleImports(architectureTestModules, filePath);
}

function withoutTypeScriptExtension(importPath: string) {
  return importPath.replace(/\.ts$/, "");
}

describe("architecture test infrastructure boundaries", () => {
  it("keeps TypeScript AST parsing in one owner", () => {
    const typescriptImport = /\bfrom\s+["']typescript["']/;

    expect(
      Object.entries(architectureTestModules)
        .filter(([, source]) => typescriptImport.test(source))
        .map(([filePath]) => filePath),
    ).toEqual(["./moduleImports.ts"]);
  });

  it("keeps production raw globs in the source corpus owner", () => {
    const productionSourceGlob =
      /["']\.\.\/\.\.\/(?:core|contracts|application|infrastructure|presentation|tooling)\/\*\*\/\*\.(?:ts|\{[a-z,]+\})["']/;

    expect(
      Object.entries(architectureTestModules)
        .filter(([, source]) => productionSourceGlob.test(source))
        .map(([filePath]) => filePath),
    ).toEqual(["./sourceCorpus.ts"]);
  });

  it("keeps catalogs free of corpus and graph initialization", () => {
    const catalogPaths = [
      "./dependencyConstraintCatalog.ts",
      "./e2eConstraintCatalog.ts",
      "./ownershipConstraintCatalog.ts",
      "../presentation/uiConstraintCatalog.ts",
    ];
    const forbiddenRuntimeOwners = new Set([
      "./sourceCorpus",
      "./sourceGraph",
      "../architecture/sourceCorpus",
      "../architecture/sourceGraph",
    ]);

    expect(catalogPaths.filter((filePath) =>
      !(filePath in architectureTestModules)
    )).toEqual([]);
    expect(catalogPaths.flatMap((filePath) => {
      const source = architectureTestModules[filePath] ?? "";

      return [
        ...importsFrom(filePath)
          .filter((importPath) =>
            forbiddenRuntimeOwners.has(
              withoutTypeScriptExtension(importPath),
            )
          )
          .map((importPath) => `${filePath} imports ${importPath}`),
        ...(source.includes("import.meta.glob")
          ? [`${filePath} owns an eager corpus`]
          : []),
      ];
    })).toEqual([]);
  });

  it("keeps shared workflow policies in one owner", () => {
    const workflowFactoryDeclaration = new RegExp([
      "function create",
      "WorkflowTextPolicies",
    ].join(""));
    const workflowFactoryOwners = Object.entries(architectureTestModules)
      .filter(([, source]) => workflowFactoryDeclaration.test(source))
      .map(([filePath]) => filePath);
    const workflowFactoryConsumers = Object.keys(architectureTestModules)
      .flatMap((filePath) =>
        importsFrom(filePath)
          .filter((importPath) =>
            withoutTypeScriptExtension(importPath).endsWith(
              "workflowTextPolicies",
            )
          )
          .map((importPath) => `${filePath} imports ${importPath}`)
      )
      .sort();

    expect(workflowFactoryOwners).toEqual([
      "../support/workflowTextPolicies.ts",
    ]);
    expect(workflowFactoryConsumers).toEqual([
      "../presentation/uiConstraintCatalog.ts imports ../support/workflowTextPolicies",
      "./e2eConstraintCatalog.ts imports ../support/workflowTextPolicies",
    ]);
  });

  it("keeps each catalog wired only by its test composition root", () => {
    const catalogImports = Object.keys(architectureTestModules)
      .flatMap((filePath) =>
        importsFrom(filePath)
          .filter((importPath) =>
            withoutTypeScriptExtension(importPath).endsWith(
              "ConstraintCatalog",
            )
          )
          .map((importPath) => `${filePath} imports ${importPath}`)
      )
      .sort();

    expect(catalogImports).toEqual([
      "../presentation/designContract.test.ts imports ./uiConstraintCatalog",
      "./dependencyBoundaries.test.ts imports ./dependencyConstraintCatalog",
      "./e2eBoundaries.test.ts imports ./e2eConstraintCatalog",
      "./ownershipBoundaries.test.ts imports ./ownershipConstraintCatalog",
    ]);
    expect(
      Object.keys(architectureTestModules).filter((filePath) =>
        filePath.endsWith("/constraintCatalog.ts") ||
        filePath === "./constraintCatalog.ts"
      ),
    ).toEqual([]);
  });

  it("keeps UI design composition leaf-based without file rereads", () => {
    const designImports = importsFrom(
      "../presentation/designContract.test.ts",
    );

    expect(designImports).toContain(
      "../../presentation/ui/shared/tree/structureIndent",
    );
    expect(designImports).not.toContain(
      "../../presentation/ui/shared/tree",
    );
    expect(designImports).not.toContain("node:fs");
  });
});
