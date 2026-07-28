import { describe, expect, it } from "vitest";
import {
  applicationModules,
  getSourceRoot,
  listSourceDependencyCycles,
  listSourceImports,
  readModuleImports,
  readSourceImports,
  sourceImportCorpus,
  type SourceImport,
  type SourceRoot,
} from "./sourceGraph";
import {
  auditTextPolicies,
  type TextPolicy,
} from "../support/textPolicy";

const allowedLayerImports: Readonly<Record<SourceRoot, readonly SourceRoot[]>> = {
  application: ["application", "core"],
  contracts: ["contracts", "core"],
  core: ["core"],
  infrastructure: ["infrastructure", "application", "contracts", "core"],
  presentation: ["presentation", "infrastructure", "application", "core"],
};

const allowedServerImports: Readonly<Record<string, readonly string[]>> = {
  "adapters/local": ["adapters/local", "persistence", "repository"],
  "adapters/webdav": ["adapters/webdav", "persistence", "repository"],
  api: ["api", "repository"],
  catalog: ["catalog", "repository"],
  persistence: ["persistence"],
  repository: ["persistence", "repository"],
};

type ImportPolicy = {
  allows: (edge: SourceImport) => boolean;
  applies?: (edge: SourceImport) => boolean;
  name: string;
};

function peerDomain(filePath: string) {
  return filePath.match(
    /^(?:\.\.\/\.\.\/)?(?:core|application)\/(workspace|journal|todo)\//,
  )?.[1] ?? null;
}

function infrastructureArea(filePath: string) {
  return filePath.match(
    /^(?:\.\.\/\.\.\/)?infrastructure\/([^/]+)\//,
  )?.[1] ?? null;
}

function serverArea(filePath: string) {
  const prefix = "../../infrastructure/server/";

  if (!filePath.startsWith(prefix)) return null;
  const segments = filePath.slice(prefix.length).split("/");
  return segments[0] === "adapters"
    ? `adapters/${segments[1]}`
    : segments[0];
}

function isRefinedInfrastructureEdge(edge: SourceImport) {
  const sourceArea = infrastructureArea(edge.filePath);
  return (
    ((sourceArea === "browser" || sourceArea === "http") &&
      infrastructureArea(edge.targetPath) !== null) ||
    (edge.filePath !== "../../infrastructure/server/index.ts" &&
      serverArea(edge.filePath) !== null &&
      serverArea(edge.targetPath) !== null)
  );
}

function allowsInfrastructureEdge(edge: SourceImport) {
  const sourceArea = infrastructureArea(edge.filePath);
  const targetArea = infrastructureArea(edge.targetPath);

  if (sourceArea === "browser" || sourceArea === "http") {
    return targetArea === sourceArea || targetArea === "persistence";
  }
  const allowed = allowedServerImports[serverArea(edge.filePath) ?? ""];
  return allowed?.includes(serverArea(edge.targetPath) ?? "") ?? false;
}

function auditImportPolicies(
  imports: readonly SourceImport[],
  policies: readonly ImportPolicy[],
) {
  return policies.flatMap((policy) =>
    imports
      .filter((edge) => policy.applies?.(edge) ?? true)
      .filter((edge) => !policy.allows(edge))
      .map(({ filePath, importPath }) =>
        `${policy.name}: ${filePath} imports ${importPath}`
      )
  );
}

const importPolicies: readonly ImportPolicy[] = [
  {
    allows: ({ filePath, targetRoot }) =>
      allowedLayerImports[getSourceRoot(filePath)].includes(targetRoot),
    name: "five-layer direction",
  },
  {
    allows: ({ filePath, targetPath }) =>
      peerDomain(filePath) === peerDomain(targetPath),
    applies: ({ filePath, targetPath }) =>
      peerDomain(filePath) !== null && peerDomain(targetPath) !== null,
    name: "peer domain isolation",
  },
  {
    allows: allowsInfrastructureEdge,
    applies: isRefinedInfrastructureEdge,
    name: "infrastructure sublayer direction",
  },
  {
    allows: () => false,
    applies: ({ filePath, targetPath }) =>
      filePath.startsWith("../../presentation/activities/") &&
      targetPath.startsWith("../../presentation/shell/"),
    name: "Activity independence from shell composition",
  },
];

const sourcePolicies: readonly TextPolicy[] = [
  {
    allowedPath: /^presentation\//,
    corpus: sourceImportCorpus,
    matches: { min: 1 },
    name: "React runtime ownership",
    pattern: /^react(?:-dom)?(?:\/|$)/m,
  },
  {
    allowedPath: /^infrastructure\//,
    corpus: sourceImportCorpus,
    matches: { min: 1 },
    name: "Node runtime ownership",
    pattern: /^node:/m,
  },
  {
    corpus: applicationModules,
    matches: 0,
    name: "platform globals in application",
    pattern:
      /\bglobalThis\s*\.|(?:^|[^\w.])(?:setTimeout|clearTimeout|setInterval|clearInterval)\s*\(/m,
  },
];

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

  it("enforces the declared import and runtime policies", () => {
    expect([
      ...auditImportPolicies(listSourceImports(), importPolicies),
      ...auditTextPolicies(sourcePolicies),
    ]).toEqual([]);
  });

  it("keeps the production dependency graph acyclic", () => {
    expect(listSourceDependencyCycles()).toEqual([]);
  });
});
