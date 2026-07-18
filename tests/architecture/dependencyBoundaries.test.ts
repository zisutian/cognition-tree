import { describe, expect, it } from "vitest";
import {
  contractModules,
  ctnModules,
  findDependencyCycles,
  getSourceRoot,
  journalModules,
  journalPathToRelative,
  listInternalSourceImports,
  listSourceDependencyCycles,
  listSourceFiles,
  modulePathToRelative,
  readInternalModuleImports,
  readModuleImports,
  readSourceImports,
  serverModules,
  sourceModules,
  todoModules,
  todoPathToRelative,
  workspaceModules,
} from "./sourceGraph";

const allowedRootImports = new Map(
  Object.entries({
    app: ["app", "application", "editor", "storage", "ui"],
    application: ["application", "ctn", "storage", "workspace"],
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

  it("keeps the shared CTN core pure, acyclic, and uniquely owned", () => {
    const blockedCtnImports = [
      /^node:/,
      /^react$/,
      /^react\//,
      /(?:^|\/)contracts\//,
      /(?:^|\/)server\//,
      /(?:^|\/)src\//,
    ];
    const purityViolations = Object.keys(ctnModules).flatMap((filePath) =>
      readModuleImports(ctnModules, filePath)
        .filter((importPath) =>
          blockedCtnImports.some((pattern) => pattern.test(importPath)),
        )
        .map((importPath) => formatImport(filePath, importPath)),
    );
    const ctnPrefix = "../../ctn/";
    const graph = new Map(
      Object.keys(ctnModules).map((filePath) => [
        filePath,
        readInternalModuleImports(ctnModules, filePath, ctnPrefix).map(
          ({ targetPath }) => targetPath,
        ),
      ]),
    );
    const allowedSourceConsumers = new Set([
      "application",
      "editor",
      "workspace",
    ]);
    const sourceConsumerViolations = Object.keys(sourceModules).flatMap(
      (filePath) => {
        const sourceRoot = getSourceRoot(filePath);

        return readInternalModuleImports(
          workspaceModules,
          filePath,
          ctnPrefix,
        )
          .filter(() => !allowedSourceConsumers.has(sourceRoot))
          .map(({ importPath }) => formatImport(filePath, importPath));
      },
    );
    const serverConsumerViolations = Object.keys(serverModules).flatMap(
      (filePath) =>
        readInternalModuleImports(
          workspaceModules,
          filePath,
          ctnPrefix,
        )
          .filter(
            () =>
              !filePath.startsWith("../../server/adapters/local/") &&
              filePath !==
                "../../server/repository/workspaceRepositoryContentValidation.ts",
          )
          .map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const contractConsumerViolations = Object.keys(contractModules).flatMap(
      (filePath) =>
        readInternalModuleImports(
          workspaceModules,
          filePath,
          ctnPrefix,
        ).map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const tomlParserOwners = Object.keys(ctnModules)
      .filter((filePath) =>
        readModuleImports(ctnModules, filePath).includes("smol-toml"),
      );

    expect([
      ...purityViolations,
      ...sourceConsumerViolations,
      ...serverConsumerViolations,
      ...contractConsumerViolations,
    ]).toEqual([]);
    expect(findDependencyCycles(graph)).toEqual([]);
    expect(tomlParserOwners).toEqual([
      "../../ctn/syntax/profileTomlParser.ts",
    ]);
  });

  it("keeps Journal a pure shared domain with explicit consumers", () => {
    const journalPrefix = "../../journal/";
    const blockedImports = [
      /^node:/,
      /^react$/,
      /^react\//,
      /(?:^|\/)contracts\//,
      /(?:^|\/)server\//,
      /(?:^|\/)src\//,
    ];
    const purityViolations = Object.keys(journalModules).flatMap((filePath) =>
      readModuleImports(journalModules, filePath)
        .filter((importPath) =>
          blockedImports.some((pattern) => pattern.test(importPath)),
        )
        .map((importPath) => formatImport(filePath, importPath))
    );
    const graph = new Map(
      Object.keys(journalModules).map((filePath) => [
        filePath,
        readInternalModuleImports(
          workspaceModules,
          filePath,
          journalPrefix,
        ).map(({ targetPath }) => targetPath),
      ]),
    );
    const allowedSourceConsumers = new Set(["application", "storage"]);
    const sourceConsumerViolations = Object.keys(sourceModules).flatMap(
      (filePath) =>
        readInternalModuleImports(
          workspaceModules,
          filePath,
          journalPrefix,
        )
          .filter(() => !allowedSourceConsumers.has(getSourceRoot(filePath)))
          .map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const serverConsumerViolations = Object.keys(serverModules).flatMap(
      (filePath) =>
        readInternalModuleImports(
          workspaceModules,
          filePath,
          journalPrefix,
        )
          .filter(
            () =>
              !filePath.startsWith("../../server/repository/") &&
              filePath !== "../../server/index.ts",
          )
          .map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const contractConsumerViolations = Object.keys(contractModules).flatMap(
      (filePath) =>
        readInternalModuleImports(
          workspaceModules,
          filePath,
          journalPrefix,
        ).map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const fixedSyntaxSource = journalModules[
      "../../journal/syntax/journalSyntaxV1.ts"
    ] ?? "";

    expect([
      ...purityViolations,
      ...sourceConsumerViolations,
      ...serverConsumerViolations,
      ...contractConsumerViolations,
    ]).toEqual([]);
    expect(findDependencyCycles(graph)).toEqual([]);
    expect(fixedSyntaxSource).not.toMatch(/defaultCtnSyntaxProfile/);
    expect(Object.keys(journalModules).map(journalPathToRelative).sort())
      .toEqual([
        "commands/journalCommands.ts",
        "indexes/journalParseIndex.ts",
        "model/journalContent.ts",
        "queries/journalQueries.ts",
        "queries/journalReferenceNavigation.ts",
        "syntax/journalSyntaxV1.ts",
      ]);
  });

  it("keeps Todo a pure shared domain with explicit consumers", () => {
    const todoPrefix = "../../todo/";
    const blockedImports = [
      /^node:/,
      /^react$/,
      /^react\//,
      /(?:^|\/)contracts\//,
      /(?:^|\/)ctn\//,
      /(?:^|\/)journal\//,
      /(?:^|\/)server\//,
      /(?:^|\/)src\//,
      /(?:^|\/)workspace\//,
    ];
    const purityViolations = Object.keys(todoModules).flatMap((filePath) =>
      readModuleImports(todoModules, filePath)
        .filter((importPath) =>
          blockedImports.some((pattern) => pattern.test(importPath)),
        )
        .map((importPath) => formatImport(filePath, importPath))
    );
    const graph = new Map(
      Object.keys(todoModules).map((filePath) => [
        filePath,
        readInternalModuleImports(
          workspaceModules,
          filePath,
          todoPrefix,
        ).map(({ targetPath }) => targetPath),
      ]),
    );
    const allowedSourceConsumers = new Set(["application", "storage"]);
    const sourceConsumerViolations = Object.keys(sourceModules).flatMap(
      (filePath) =>
        readInternalModuleImports(
          workspaceModules,
          filePath,
          todoPrefix,
        )
          .filter(() => !allowedSourceConsumers.has(getSourceRoot(filePath)))
          .map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const serverConsumerViolations = Object.keys(serverModules).flatMap(
      (filePath) =>
        readInternalModuleImports(
          workspaceModules,
          filePath,
          todoPrefix,
        )
          .filter(
            () => filePath !== "../../server/repository/systemRepositoryStore.ts",
          )
          .map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const contractConsumerViolations = Object.keys(contractModules).flatMap(
      (filePath) =>
        readInternalModuleImports(
          workspaceModules,
          filePath,
          todoPrefix,
        ).map(({ importPath }) => formatImport(filePath, importPath)),
    );

    expect([
      ...purityViolations,
      ...sourceConsumerViolations,
      ...serverConsumerViolations,
      ...contractConsumerViolations,
    ]).toEqual([]);
    expect(findDependencyCycles(graph)).toEqual([]);
    expect(Object.keys(todoModules).map(todoPathToRelative).sort()).toEqual([
      "commands/todoCommands.ts",
      "model/todoContent.ts",
      "queries/todoQueries.ts",
    ]);
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
            targetPath.startsWith("../../ctn/") ||
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

  it("keeps compact context row structure shared across list-based activities", () => {
    const compactContextListTarget =
      "../../src/ui/shared/CompactContextList";
    const requiredConsumers = [
      "../../src/ui/activities/journal/JournalPanels.tsx",
      "../../src/ui/activities/repository/RepositoryPanel.tsx",
      "../../src/ui/activities/syntax/SyntaxContext.tsx",
    ];
    const missingConsumers = requiredConsumers.filter((filePath) =>
      !readSourceImports(filePath).some(
        ({ targetPath }) => targetPath === compactContextListTarget,
      )
    );
    const inlineRenameMarkupOwners = listSourceFiles("ui").filter((filePath) =>
      (sourceModules[filePath] ?? "").includes(
        "ui-compact-context-inline-rename",
      ),
    );

    expect(missingConsumers).toEqual([]);
    expect(inlineRenameMarkupOwners).toEqual([
      "../../src/ui/shared/CompactContextList.tsx",
    ]);
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

  it("keeps portal and global overlay behavior in the shared overlay owner", () => {
    const portalOwners = listSourceFiles("ui").filter((filePath) =>
      (sourceModules[filePath] ?? "").includes("createPortal"),
    );
    const globalOverlayListenerOwners = listSourceFiles("ui/shared").filter(
      (filePath) =>
        /(?:document|window)\.addEventListener\(\s*"(?:focusin|keydown|pointerdown)"/.test(
          sourceModules[filePath] ?? "",
        ),
    );

    expect(portalOwners).toEqual(["../../src/ui/shared/Overlay.tsx"]);
    expect(globalOverlayListenerOwners).toEqual([
      "../../src/ui/shared/Overlay.tsx",
    ]);
  });

  it("keeps workbench layout preferences out of application view models", () => {
    const repositoryViewModel =
      sourceModules[
        "../../src/application/workspace/activities/repository/repositoryViewModel.ts"
      ] ?? "";

    expect(repositoryViewModel).not.toMatch(
      /\b(?:contextWidth|setContextWidth)\b/,
    );
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
