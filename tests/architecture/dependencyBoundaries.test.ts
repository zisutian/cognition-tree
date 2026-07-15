import { describe, expect, it } from "vitest";
import {
  contractModules,
  findDependencyCycles,
  getSourceRoot,
  listInternalSourceImports,
  listSourceDependencyCycles,
  listSourceFiles,
  modulePathToRelative,
  readInternalModuleImports,
  readModuleImports,
  readSourceImports,
  serverModules,
  sourceModules,
} from "./sourceGraph";

const allowedRootImports = new Map(
  Object.entries({
    app: ["app", "application", "editor", "storage", "ui"],
    application: ["application", "ctn", "storage", "workspace"],
    ctn: ["ctn"],
    editor: ["ctn", "editor"],
    storage: ["storage", "workspace"],
    ui: ["application", "editor", "ui"],
    workspace: ["ctn", "workspace"],
  }).map(([sourceRoot, imports]) => [sourceRoot, new Set(imports)]),
);

function formatImport(filePath: string, importPath: string) {
  return `${filePath} imports ${importPath}`;
}

describe("dependency boundaries", () => {
  it("reads imports, re-exports, and dynamic imports through the TypeScript AST", () => {
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
  });

  it("resolves source imports without discarding leading parent segments", () => {
    const sourceImport = readSourceImports(
      "../../src/app/AppRoot.tsx",
    ).find(({ importPath }) => importPath.includes("session/useSession"));

    expect(sourceImport).toMatchObject({
      targetPath:
        "../../src/application/workspace/session/useSession",
      targetRoot: "application",
    });
  });

  it("enforces the documented source dependency direction", () => {
    const violations = listInternalSourceImports().flatMap(
      ({ filePath, importPath, targetRoot }) => {
        const sourceRoot = getSourceRoot(filePath);
        const allowedImports = allowedRootImports.get(sourceRoot);

        return !allowedImports || allowedImports.has(targetRoot)
          ? []
          : [
              `${formatImport(filePath, importPath)} (${sourceRoot} -> ${targetRoot})`,
            ];
      },
    );

    expect(violations).toEqual([]);
  });

  it("detects dependency cycles as strongly connected components", () => {
    expect(
      findDependencyCycles(
        new Map([
          ["a", ["b"]],
          ["b", ["a"]],
          ["independent", []],
          ["self", ["self"]],
        ]),
      ),
    ).toEqual([["a", "b"], ["self"]]);
  });

  it("keeps the source dependency graph acyclic", () => {
    expect(listSourceDependencyCycles()).toEqual([]);
  });

  it("keeps application activity state behind local activity boundaries", () => {
    const activityPrefix = "../../src/application/workspace/activities/";
    const siblingViolations = listSourceFiles(
      "application/workspace/activities",
    ).flatMap((filePath) => {
      const sourceActivity = filePath
        .slice(activityPrefix.length)
        .split("/")[0];

      return readSourceImports(filePath)
        .filter(({ targetPath }) => targetPath.startsWith(activityPrefix))
        .filter(
          ({ targetPath }) =>
            targetPath.slice(activityPrefix.length).split("/")[0] !==
            sourceActivity,
        )
        .map(({ importPath }) => formatImport(filePath, importPath));
    });
    const sharedViolations = ["runtime", "selection", "session"].flatMap(
      (directory) =>
        listSourceFiles(`application/workspace/${directory}`).flatMap(
          (filePath) =>
            readSourceImports(filePath)
              .filter(({ targetPath }) =>
                targetPath.startsWith(activityPrefix),
              )
              .map(({ importPath }) => formatImport(filePath, importPath)),
        ),
    );

    expect([...siblingViolations, ...sharedViolations]).toEqual([]);
  });

  it("keeps UI activities, shared components, and frame modules independent", () => {
    const activityPrefix = "../../src/ui/activities/";
    const activityViolations = listSourceFiles("ui/activities").flatMap(
      (filePath) => {
        const relativeActivityPath = filePath.slice(activityPrefix.length);
        const sourceActivity = relativeActivityPath.includes("/")
          ? relativeActivityPath.split("/")[0]
          : null;

        return readSourceImports(filePath)
          .filter(({ targetPath }) => targetPath.startsWith(activityPrefix))
          .filter(({ targetPath }) => {
            const targetActivity = targetPath
              .slice(activityPrefix.length)
              .split("/")[0];

            return sourceActivity && targetActivity !== sourceActivity;
          })
          .map(({ importPath }) => formatImport(filePath, importPath));
      },
    );
    const sharedViolations = listSourceFiles("ui/shared").flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(
          ({ targetPath }) =>
            targetPath.startsWith(activityPrefix) ||
            targetPath.startsWith("../../src/application/"),
        )
        .map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const frameFiles = [
      "../../src/ui/ActivityBar.tsx",
      "../../src/ui/AppFrame.tsx",
      ...listSourceFiles("ui/workbench"),
    ];
    const frameViolations = frameFiles.flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(
          ({ targetPath }) =>
            targetPath.startsWith("../../src/application/") ||
            targetPath.startsWith("../../src/workspace/") ||
            targetPath.startsWith("../../src/ctn/") ||
            targetPath.startsWith(activityPrefix),
        )
        .map(({ importPath }) => formatImport(filePath, importPath)),
    );

    expect([
      ...activityViolations,
      ...sharedViolations,
      ...frameViolations,
    ]).toEqual([]);
  });

  it("keeps global workbench composition out of activity controllers", () => {
    const blockedTargets = new Set([
      "../../src/ui/AppView",
      "../../src/ui/problems/ProblemsPanel",
      "../../src/ui/workbench/useWorkbenchLayout",
    ]);
    const violations = listSourceFiles("app/activities").flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(({ targetPath }) => blockedTargets.has(targetPath))
        .map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const workbenchImports = readSourceImports(
      "../../src/app/workbench/WorkspaceWorkbench.tsx",
    ).map(({ targetPath }) => targetPath);

    expect(violations).toEqual([]);
    expect(workbenchImports).toContain("../../src/ui/AppView");
    expect(workbenchImports).toContain(
      "../../src/ui/workbench/useWorkbenchLayout",
    );
  });

  it("keeps workbench layout preferences out of application view models", () => {
    const settingsViewModel =
      sourceModules[
        "../../src/application/workspace/activities/settings/settingsViewModel.ts"
      ] ?? "";

    expect(settingsViewModel).not.toMatch(/\b(?:contextWidth|setContextWidth)\b/);
  });

  it("keeps UI, storage, and application projections on their public inputs", () => {
    const uiViolations = listSourceFiles("ui").flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(
          ({ targetRoot }) =>
            targetRoot === "workspace" || targetRoot === "ctn",
        )
        .map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const storageViolations = listSourceFiles("storage").flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(({ targetRoot }) => targetRoot === "ctn")
        .map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const projectionViolations = listSourceFiles(
      "application/workspace/projection",
    ).flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(({ targetPath }) =>
          targetPath.startsWith("../../src/workspace/commands/"),
        )
        .map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const noteTreeViolations = listSourceFiles("application").flatMap(
      (filePath) =>
        readSourceImports(filePath)
          .filter(({ targetPath }) =>
            targetPath.startsWith("../../src/workspace/model/noteTree/"),
          )
          .map(({ importPath }) => formatImport(filePath, importPath)),
    );

    expect([
      ...uiViolations,
      ...storageViolations,
      ...projectionViolations,
      ...noteTreeViolations,
    ]).toEqual([]);
  });

  it("keeps storage core, adapters, and runtime dependencies directional", () => {
    const storagePrefix = "../../src/storage/";
    const getStorageArea = (filePath: string) => {
      const segments = modulePathToRelative(filePath, storagePrefix).split("/");

      return segments[0] === "adapters"
        ? `adapters/${segments[1]}`
        : segments[0];
    };
    const allowedStorageImports = new Map<string, ReadonlySet<string>>([
      ["repository", new Set(["repository"])],
      ["adapters/browser", new Set(["adapters/browser", "repository"])],
      ["adapters/http", new Set(["adapters/http", "repository"])],
      [
        "runtime",
        new Set([
          "adapters/browser",
          "adapters/http",
          "repository",
          "runtime",
        ]),
      ],
    ]);
    const storageViolations = listSourceFiles("storage").flatMap(
      (filePath) => {
        const allowedImports = allowedStorageImports.get(
          getStorageArea(filePath),
        );

        return readSourceImports(filePath)
          .filter(({ targetPath }) => targetPath.startsWith(storagePrefix))
          .filter(({ targetPath }) =>
            !allowedImports?.has(getStorageArea(targetPath)),
          )
          .map(({ importPath }) => formatImport(filePath, importPath));
      },
    );
    const consumerViolations = Object.keys(sourceModules).flatMap((filePath) =>
      filePath.startsWith("../../src/storage/") ||
      filePath.startsWith("../../src/app/")
        ? []
        : readSourceImports(filePath)
            .filter(({ targetPath }) =>
              targetPath.startsWith(`${storagePrefix}adapters/`) ||
              targetPath.startsWith(`${storagePrefix}runtime/`),
            )
            .map(({ importPath }) => formatImport(filePath, importPath)),
    );

    expect([...storageViolations, ...consumerViolations]).toEqual([]);
  });

  it("keeps the wire contract runtime-neutral and consumed only at boundaries", () => {
    const blockedContractImports = [
      /^node:/,
      /^react$/,
      /^react\//,
      /\/server\//,
      /\/src\//,
    ];
    const contractViolations = Object.keys(contractModules).flatMap(
      (filePath) =>
        readModuleImports(contractModules, filePath)
          .filter((importPath) =>
            blockedContractImports.some((pattern) => pattern.test(importPath)),
          )
          .map((importPath) => formatImport(filePath, importPath)),
    );
    const sourceViolations = Object.keys(sourceModules).flatMap((filePath) =>
      readModuleImports(sourceModules, filePath)
        .filter((importPath) => importPath.includes("contracts/"))
        .filter(() => getSourceRoot(filePath) !== "storage")
        .map((importPath) => formatImport(filePath, importPath)),
    );
    const serverConsumesContract = Object.keys(serverModules).some((filePath) =>
      readModuleImports(serverModules, filePath).some((importPath) =>
        importPath.includes("contracts/workspace-repository/"),
      ),
    );

    expect([...contractViolations, ...sourceViolations]).toEqual([]);
    expect(serverConsumesContract).toBe(true);
  });

  it("keeps server and frontend behind the repository HTTP boundary", () => {
    const blockedServerImports = [
      /^react$/,
      /^react\//,
      /\/src\//,
      /^src\//,
    ];
    const serverViolations = Object.keys(serverModules).flatMap((filePath) =>
      readModuleImports(serverModules, filePath)
        .filter(
          (importPath) =>
            importPath === "smol-toml" ||
            blockedServerImports.some((pattern) => pattern.test(importPath)),
        )
        .map((importPath) => formatImport(filePath, importPath)),
    );
    const sourceViolations = Object.keys(sourceModules).flatMap((filePath) =>
      readModuleImports(sourceModules, filePath)
        .filter((importPath) => /server\//.test(importPath))
        .map((importPath) => formatImport(filePath, importPath)),
    );

    expect([...serverViolations, ...sourceViolations]).toEqual([]);
  });

  it("keeps server repository rules and adapters independent", () => {
    const serverPrefix = "../../server/";
    const getServerArea = (filePath: string) => {
      const segments = modulePathToRelative(filePath, serverPrefix).split("/");

      return segments[0] === "adapters"
        ? `adapters/${segments[1]}`
        : segments[0];
    };
    const allowedServerImports = new Map<string, ReadonlySet<string>>([
      ["api", new Set(["api", "repository"])],
      ["catalog", new Set(["catalog", "repository"])],
      ["repository", new Set(["repository"])],
      ["adapters/local", new Set(["adapters/local", "repository"])],
      ["adapters/webdav", new Set(["adapters/webdav", "repository"])],
    ]);
    const violations = Object.keys(serverModules).flatMap((filePath) => {
      const sourceArea = getServerArea(filePath);

      if (sourceArea === "index.ts") {
        return [];
      }

      const allowedImports = allowedServerImports.get(sourceArea);

      return readInternalModuleImports(
        serverModules,
        filePath,
        serverPrefix,
      )
        .filter(({ targetPath }) =>
          !allowedImports?.has(getServerArea(targetPath)),
        )
        .map(({ importPath }) => formatImport(filePath, importPath));
    });
    const graph = new Map(
      Object.keys(serverModules).map((filePath) => [
        filePath,
        readInternalModuleImports(serverModules, filePath, serverPrefix).map(
          ({ targetPath }) => targetPath,
        ),
      ]),
    );

    expect(violations).toEqual([]);
    expect(findDependencyCycles(graph)).toEqual([]);
  });
});
