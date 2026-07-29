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
    ]).toEqual([]);
  });

  it("keeps the production dependency graph acyclic", () => {
    expect(listSourceDependencyCycles()).toEqual([]);
  });
});
