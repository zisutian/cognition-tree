import { describe, expect, it } from "vitest";
import {
  applicationModules,
  getSourceRoot,
  infrastructureModules,
  listSourceDependencyCycles,
  listSourceImports,
  presentationModules,
  readInternalModuleImports,
  readModuleImports,
  readSourceImports,
  sourceModules,
  sourceModulesByRoot,
  type SourceRoot,
} from "./sourceGraph";

function formatImport(filePath: string, importPath: string) {
  return `${filePath} imports ${importPath}`;
}

const allowedLayerImports: Readonly<
  Record<SourceRoot, ReadonlySet<SourceRoot>>
> = {
  core: new Set(["core"]),
  contracts: new Set(["contracts", "core"]),
  application: new Set(["application", "core"]),
  infrastructure: new Set([
    "infrastructure",
    "application",
    "contracts",
    "core",
  ]),
  presentation: new Set([
    "presentation",
    "infrastructure",
    "application",
    "core",
  ]),
};

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

  it("enforces the declared five-layer dependency direction", () => {
    const violations = listSourceImports().flatMap(
      ({ filePath, importPath, targetRoot }) => {
        const sourceRoot = getSourceRoot(filePath);

        return allowedLayerImports[sourceRoot].has(targetRoot)
          ? []
          : [
              `${formatImport(filePath, importPath)} ` +
                `(${sourceRoot} -> ${targetRoot})`,
            ];
      },
    );

    expect(violations).toEqual([]);
  });

  it("keeps framework and platform runtimes in their owning layers", () => {
    const runtimeViolations = Object.entries(sourceModulesByRoot).flatMap(
      ([root, modules]) =>
        Object.keys(modules).flatMap((filePath) =>
          readModuleImports(modules, filePath)
            .filter((importPath) =>
              (/^react(?:-dom)?(?:\/|$)/.test(importPath) &&
                root !== "presentation") ||
              (/^node:/.test(importPath) && root !== "infrastructure")
            )
            .map((importPath) => formatImport(filePath, importPath))
        ),
    );
    const platformGlobalViolations = Object.entries(applicationModules).flatMap(
      ([filePath, source]) =>
        /\bglobalThis\s*\./.test(source) ||
        /(?:^|[^\w.])(?:setTimeout|clearTimeout|setInterval|clearInterval)\s*\(/m
          .test(source)
          ? [filePath]
          : [],
    );

    expect(runtimeViolations).toEqual([]);
    expect(platformGlobalViolations).toEqual([]);
  });

  it("keeps peer core and application domains isolated", () => {
    const corePeers = ["workspace", "journal", "todo"];
    const applicationPeers = ["workspace", "journal", "todo"];
    const coreViolations = corePeers.flatMap((sourcePeer) =>
      Object.keys(sourceModulesByRoot.core)
        .filter((filePath) =>
          filePath.startsWith(`../../core/${sourcePeer}/`)
        )
        .flatMap((filePath) =>
          readSourceImports(filePath)
            .filter(({ targetPath }) =>
              corePeers.some((targetPeer) =>
                targetPeer !== sourcePeer &&
                targetPath.startsWith(`../../core/${targetPeer}/`)
              )
            )
            .map(({ importPath }) => formatImport(filePath, importPath))
        )
    );
    const applicationViolations = applicationPeers.flatMap((sourcePeer) =>
      Object.keys(applicationModules)
        .filter((filePath) =>
          filePath.startsWith(`../../application/${sourcePeer}/`)
        )
        .flatMap((filePath) =>
          readSourceImports(filePath)
            .filter(({ targetPath }) =>
              applicationPeers.some((targetPeer) =>
                targetPeer !== sourcePeer &&
                (targetPath.startsWith(`../../application/${targetPeer}/`) ||
                  targetPath.startsWith(`../../core/${targetPeer}/`))
              )
            )
            .map(({ importPath }) => formatImport(filePath, importPath))
        )
    );

    expect([...coreViolations, ...applicationViolations]).toEqual([]);
  });

  it("keeps infrastructure adapter and server sublayers directional", () => {
    const infrastructureArea = (filePath: string) =>
      filePath.replace("../../infrastructure/", "").split("/")[0] ?? "";
    const adapterViolations = Object.keys(infrastructureModules).flatMap(
      (filePath) => {
        const sourceArea = infrastructureArea(filePath);

        if (sourceArea !== "browser" && sourceArea !== "http") return [];
        return readInternalModuleImports(
          sourceModules,
          filePath,
          "../../infrastructure/",
        )
          .filter(({ targetPath }) => {
            const targetArea = infrastructureArea(targetPath);
            return targetArea !== sourceArea && targetArea !== "persistence";
          })
          .map(({ importPath }) => formatImport(filePath, importPath));
      },
    );
    const serverPrefix = "../../infrastructure/server/";
    const serverArea = (filePath: string) => {
      const segments = filePath.slice(serverPrefix.length).split("/");
      return segments[0] === "adapters"
        ? `adapters/${segments[1]}`
        : segments[0];
    };
    const allowedServerImports = new Map<string, ReadonlySet<string>>([
      ["api", new Set(["api", "repository"])],
      ["catalog", new Set(["catalog", "repository"])],
      ["persistence", new Set(["persistence"])],
      ["repository", new Set(["persistence", "repository"])],
      [
        "adapters/local",
        new Set(["adapters/local", "persistence", "repository"]),
      ],
      [
        "adapters/webdav",
        new Set(["adapters/webdav", "persistence", "repository"]),
      ],
    ]);
    const serverModules = Object.fromEntries(
      Object.entries(infrastructureModules).filter(([filePath]) =>
        filePath.startsWith(serverPrefix)
      ),
    );
    const serverViolations = Object.keys(serverModules).flatMap((filePath) => {
      if (filePath === `${serverPrefix}index.ts`) return [];
      const allowed = allowedServerImports.get(serverArea(filePath));

      return readInternalModuleImports(serverModules, filePath, serverPrefix)
        .filter(({ targetPath }) => !allowed?.has(serverArea(targetPath)))
        .map(({ importPath }) => formatImport(filePath, importPath));
    });

    expect([...adapterViolations, ...serverViolations]).toEqual([]);
  });

  it("keeps activity bindings independent from shell composition", () => {
    const violations = Object.keys(presentationModules)
      .filter((filePath) =>
        filePath.startsWith("../../presentation/activities/")
      )
      .flatMap((filePath) =>
        readSourceImports(filePath)
          .filter(({ targetPath }) =>
            targetPath.startsWith("../../presentation/shell/")
          )
          .map(({ importPath }) => formatImport(filePath, importPath))
      );

    expect(violations).toEqual([]);
  });

  it("keeps the production dependency graph acyclic", () => {
    expect(listSourceDependencyCycles()).toEqual([]);
  });
});
