import { describe, expect, it } from "vitest";
import {
  listSourceDependencyCycles,
  listSourceImports,
  readModuleImports,
  readSourceImports,
} from "./sourceGraph";
import {
  auditImportPolicies,
  dependencyImportPolicies,
  dependencyTextPolicies,
  e2eTextPolicies,
} from "./constraintCatalog";
import {
  auditTextPolicies,
} from "../support/textPolicy";

const layeredTestModules = import.meta.glob([
  "../application/**/*.{ts,tsx}",
  "../contracts/**/*.{ts,tsx}",
  "../core/**/*.{ts,tsx}",
  "../infrastructure/**/*.{ts,tsx}",
  "../presentation/**/*.{ts,tsx}",
], {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const testLayerImports: Readonly<Record<string, readonly string[]>> = {
  application: ["application", "core"],
  contracts: ["contracts", "core"],
  core: ["core"],
  infrastructure: ["infrastructure", "application", "contracts", "core"],
  presentation: [
    "presentation",
    "infrastructure",
    "application",
    "contracts",
    "core",
  ],
};

function auditTestLayerImports() {
  return Object.entries(layeredTestModules).flatMap(([filePath, source]) => {
    const testLayer = filePath.split("/")[1] ?? "";
    const allowed = testLayerImports[testLayer] ?? [];

    return readModuleImports({ [filePath]: source }, filePath).flatMap(
      (importPath) => {
        const productionLayer = importPath.match(
          /(?:^|\/)(application|contracts|core|infrastructure|presentation)(?:\/|$)/,
        )?.[1];

        return productionLayer && !allowed.includes(productionLayer)
          ? [`${filePath} imports ${productionLayer} through ${importPath}`]
          : [];
      },
    );
  });
}

describe("dependency boundaries", () => {
  it("derives static, re-exported, and dynamic edges from the TypeScript AST", () => {
    const modules = {
      "sample.ts": `
        import value from "./imported";
        export { value as exported } from "./exported";
        export * from "./star";
        const lazy = import("./lazy");
      `,
    };

    expect(readModuleImports(modules, "sample.ts")).toEqual([
      "./imported",
      "./exported",
      "./star",
      "./lazy",
    ]);
    expect(
      readSourceImports(
        "../../presentation/shell/bindings/application/workbench/useWorkbenchApplicationBindings.ts",
      ).find(({ targetPath }) =>
        targetPath.endsWith("application/workbench/workbenchController.ts")
      ),
    ).toMatchObject({
      targetRoot: "application",
      targetPath: "../../application/workbench/workbenchController.ts",
    });
  });

  it("enforces the shared dependency and runtime policy catalog", () => {
    expect([
      ...auditImportPolicies(listSourceImports(), dependencyImportPolicies),
      ...auditTextPolicies(dependencyTextPolicies),
      ...auditTextPolicies(e2eTextPolicies),
      ...auditTestLayerImports(),
    ]).toEqual([]);
  });

  it("keeps the production dependency graph acyclic", () => {
    expect(listSourceDependencyCycles()).toEqual([]);
  });
});
