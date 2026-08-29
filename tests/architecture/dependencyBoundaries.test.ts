import { describe, expect, it } from "vitest";
import {
  listSourceDependencyCycles,
  listSourceImports,
  readSourceImports,
} from "./sourceGraph";
import { readModuleImports } from "./moduleImports";
import {
  auditApplicationCoordinationRoots,
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

const architectureModules = import.meta.glob("./*.ts", {
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
  it("keeps TypeScript AST parsing in one architecture owner", () => {
    const typescriptImport = /\bfrom\s+["']typescript["']/;

    expect(
      Object.entries(architectureModules)
        .filter(([, source]) => typescriptImport.test(source))
        .map(([filePath]) => filePath),
    ).toEqual(["./moduleImports.ts"]);
  });

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
        "../../presentation/shell/application/useWorkbenchApplicationBindings.ts",
      ).find(({ targetPath }) =>
        targetPath.endsWith("application/workbench/workbenchController.ts")
      ),
    ).toMatchObject({
      targetRoot: "application",
      targetPath: "../../application/workbench/workbenchController.ts",
    });
  });

  it("returns isolated copies of indexed source imports", () => {
    const filePath =
      "../../presentation/shell/application/useWorkbenchApplicationBindings.ts";
    const first = readSourceImports(filePath);
    const second = readSourceImports(filePath);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
  });

  it("enforces the shared dependency and runtime policy catalog", () => {
    const imports = listSourceImports();

    expect([
      ...auditApplicationCoordinationRoots(imports),
      ...auditImportPolicies(imports, dependencyImportPolicies),
      ...auditTextPolicies(dependencyTextPolicies),
      ...auditTextPolicies(e2eTextPolicies),
      ...auditTestLayerImports(),
    ]).toEqual([]);
  });

  it("rejects repository, generic persistence, and peer-domain coupling", () => {
    const violations = auditImportPolicies([
      {
        filePath: "../../application/repository/view.ts",
        importPath: "../workspace/session",
        targetPath: "../../application/workspace/session.ts",
        targetRoot: "application",
      },
      {
        filePath: "../../application/persistence/merge.ts",
        importPath: "../../core/todo/model",
        targetPath: "../../core/todo/model.ts",
        targetRoot: "core",
      },
      {
        filePath: "../../application/workspace/service.ts",
        importPath: "../journal/service",
        targetPath: "../../application/journal/service.ts",
        targetRoot: "application",
      },
      {
        filePath: "../../infrastructure/client/http/apiTransport.ts",
        importPath: "../../../application/workspace/persistence/workspaceRepository",
        targetPath:
          "../../application/workspace/persistence/workspaceRepository.ts",
        targetRoot: "application",
      },
      {
        filePath: "../../infrastructure/server/api/http/queryHandlers.ts",
        importPath: "../../../../core/todo/commands/todoCompletionRecurrenceCommands",
        targetPath:
          "../../core/todo/commands/todoCompletionRecurrenceCommands.ts",
        targetRoot: "core",
      },
      {
        filePath: "../../application/workbench/problems.ts",
        importPath: "../agent/controller",
        targetPath: "../../application/agent/controller.ts",
        targetRoot: "application",
      },
    ], dependencyImportPolicies);

    expect(violations).toEqual([
      "peer domain isolation: ../../application/workspace/service.ts imports ../journal/service",
      "repository independence from domain content: ../../application/repository/view.ts imports ../workspace/session",
      "generic persistence and sync independence from domains: ../../application/persistence/merge.ts imports ../../core/todo/model",
      "generic client HTTP independence from domains: ../../infrastructure/client/http/apiTransport.ts imports ../../../application/workspace/persistence/workspaceRepository",
      "server API independence from core commands: ../../infrastructure/server/api/http/queryHandlers.ts imports ../../../../core/todo/commands/todoCompletionRecurrenceCommands",
      "application coordination root independence: ../../application/workbench/problems.ts imports ../agent/controller",
    ]);
  });

  it("requires browser code to reach the server through the public API", () => {
    const violations = auditImportPolicies([{
      filePath: "../../presentation/shell/AppRoot.tsx",
      importPath: "../../infrastructure/server/agent/service",
      targetPath: "../../infrastructure/server/agent/service.ts",
      targetRoot: "infrastructure",
    }], dependencyImportPolicies);

    expect(violations).toEqual([
      "browser-to-server API boundary: ../../presentation/shell/AppRoot.tsx imports ../../infrastructure/server/agent/service",
    ]);
  });

  it("allows cross-domain application coordination only in explicit roots", () => {
    const imports = [
      {
        filePath: "../../application/implicit/coordinator.ts",
        importPath: "../workspace/service",
        targetPath: "../../application/workspace/service.ts",
        targetRoot: "application" as const,
      },
      {
        filePath: "../../application/implicit/coordinator.ts",
        importPath: "../journal/service",
        targetPath: "../../application/journal/service.ts",
        targetRoot: "application" as const,
      },
      {
        filePath: "../../application/workbench/coordinator.ts",
        importPath: "../todo/service",
        targetPath: "../../application/todo/service.ts",
        targetRoot: "application" as const,
      },
      {
        filePath: "../../application/workbench/coordinator.ts",
        importPath: "../workspace/service",
        targetPath: "../../application/workspace/service.ts",
        targetRoot: "application" as const,
      },
    ];

    expect(auditApplicationCoordinationRoots(imports)).toEqual([
      "cross-domain application coordination: ../../application/implicit/coordinator.ts imports journal, workspace",
    ]);
  });

  it("keeps the production dependency graph acyclic", () => {
    expect(listSourceDependencyCycles()).toEqual([]);
  });
});
