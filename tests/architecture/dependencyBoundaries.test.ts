import { describe, expect, it } from "vitest";
import {
  applicationModules,
  contractModules,
  coreModules,
  ctnModules,
  findDependencyCycles,
  getSourceRoot,
  infrastructureModules,
  journalModules,
  listInternalSourceImports,
  listSourceDependencyCycles,
  portableNameModules,
  presentationModules,
  readInternalModuleImports,
  readModuleImports,
  readSourceImports,
  serverModules,
  todoModules,
  workspaceDomainModules,
  workspaceModules,
} from "./sourceGraph";

function formatImport(filePath: string, importPath: string) {
  return `${filePath} imports ${importPath}`;
}

const allowedLayerImports = new Map<string, ReadonlySet<string>>([
  ["application", new Set(["application", "core"])],
  ["infrastructure", new Set(["application", "contracts", "core", "infrastructure"])],
  ["presentation", new Set(["application", "core", "infrastructure", "presentation"])],
]);

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

  it("resolves imports across the new repository-root layers", () => {
    const imported = readSourceImports(
      "../../presentation/shell/AppRoot.tsx",
    ).find(({ targetPath }) =>
      targetPath.endsWith("application/workbench/workbenchController.ts"),
    );

    expect(imported).toMatchObject({
      targetRoot: "application",
      targetPath: "../../application/workbench/workbenchController.ts",
    });
  });

  it("enforces core → application → infrastructure → presentation direction", () => {
    const violations = listInternalSourceImports().flatMap(
      ({ filePath, importPath, targetRoot }) => {
        const sourceRoot = getSourceRoot(filePath);
        const allowed = allowedLayerImports.get(sourceRoot);

        return allowed?.has(targetRoot)
          ? []
          : [`${formatImport(filePath, importPath)} (${sourceRoot} -> ${targetRoot})`];
      },
    );

    expect(violations).toEqual([]);
  });

  it("keeps application framework- and boundary-independent", () => {
    const blocked = [
      /^react$/,
      /^react\//,
      /(?:^|\/)contracts\//,
      /(?:^|\/)infrastructure\//,
      /(?:^|\/)presentation\//,
    ];
    const violations = Object.keys(applicationModules).flatMap((filePath) =>
      readModuleImports(applicationModules, filePath)
        .filter((importPath) => blocked.some((pattern) => pattern.test(importPath)))
        .map((importPath) => formatImport(filePath, importPath)),
    );

    expect(violations).toEqual([]);
  });

  it("keeps platform globals behind infrastructure adapters", () => {
    const blocked = [
      /\bglobalThis\s*\./,
      /(?:^|[^\w.])(?:setTimeout|clearTimeout|setInterval|clearInterval)\s*\(/m,
    ];
    const violations = Object.entries(applicationModules).flatMap(
      ([filePath, source]) =>
        blocked.some((pattern) => pattern.test(source)) ? [filePath] : [],
    );

    expect(violations).toEqual([]);
  });

  it("keeps core and wire contracts runtime-neutral", () => {
    const blockedCore = [
      /^node:/,
      /^react(?:\/|$)/,
      /(?:^|\/)application\//,
      /(?:^|\/)contracts\//,
      /(?:^|\/)infrastructure\//,
      /(?:^|\/)presentation\//,
    ];
    const blockedContracts = [
      /^node:/,
      /^react(?:\/|$)/,
      /(?:^|\/)application\//,
      /(?:^|\/)infrastructure\//,
      /(?:^|\/)presentation\//,
    ];
    const violations = [
      ...Object.keys(coreModules).flatMap((filePath) =>
        readModuleImports(coreModules, filePath)
          .filter((value) => blockedCore.some((pattern) => pattern.test(value)))
          .map((value) => formatImport(filePath, value)),
      ),
      ...Object.keys(contractModules).flatMap((filePath) =>
        readModuleImports(contractModules, filePath)
          .filter((value) => blockedContracts.some((pattern) => pattern.test(value)))
          .map((value) => formatImport(filePath, value)),
      ),
    ];

    expect(violations).toEqual([]);
  });

  it("keeps Workspace, Journal, and Todo as peer core domains", () => {
    const peers = [
      ["../../core/workspace/", workspaceDomainModules],
      ["../../core/journal/", journalModules],
      ["../../core/todo/", todoModules],
    ] as const;
    const violations = peers.flatMap(([sourcePrefix, modules]) =>
      Object.keys(modules).flatMap((filePath) =>
        peers.flatMap(([targetPrefix]) =>
          targetPrefix === sourcePrefix
            ? []
            : readInternalModuleImports(
                workspaceModules,
                filePath,
                targetPrefix,
              ).map(({ importPath }) => formatImport(filePath, importPath)),
        ),
      ),
    );

    expect(violations).toEqual([]);
  });

  it("keeps peer application modules coupled only through Workbench", () => {
    const peers = ["journal", "todo", "workspace"] as const;
    const violations = peers.flatMap((sourcePeer) =>
      Object.keys(applicationModules)
        .filter((filePath) =>
          filePath.startsWith(`../../application/${sourcePeer}/`),
        )
        .flatMap((filePath) =>
          readSourceImports(filePath)
            .filter(({ targetPath }) =>
              peers.some((targetPeer) =>
                targetPeer !== sourcePeer &&
                (targetPath.startsWith(`../../application/${targetPeer}/`) ||
                  targetPath.startsWith(`../../core/${targetPeer}/`))
              ),
            )
            .map(({ importPath }) => formatImport(filePath, importPath)),
        ),
    );

    expect(violations).toEqual([]);
  });

  it("keeps cross-domain activities out of the Workspace feature tree", () => {
    const misplaced = Object.keys(applicationModules).filter((filePath) =>
      filePath.startsWith("../../application/workspace/activities/repository/") ||
      filePath.startsWith("../../application/workspace/activities/syntax/")
    );

    expect(misplaced).toEqual([]);
    expect(Object.keys(applicationModules)).toContain(
      "../../application/repository/repositoryViewModel.ts",
    );
    expect(Object.keys(applicationModules)).toContain(
      "../../application/syntax/syntaxViewModel.ts",
    );
  });

  it("keeps Workbench orchestration out of the React composition root", () => {
    const appRoot = presentationModules["../../presentation/shell/AppRoot.tsx"];
    const retiredModules = [
      "../../application/workbench/workbenchCoordinator.ts",
      "../../presentation/activities/bindings/workspace/session/useRepositoryCatalog.ts",
      "../../presentation/activities/bindings/workspace/session/useSession.ts",
      "../../presentation/shell/bindings/session/useBuiltInCatalog.ts",
      "../../presentation/shell/bindings/session/useJournalSession.ts",
      "../../presentation/shell/bindings/session/useTodoSession.ts",
    ];

    expect(Object.keys(applicationModules)).toContain(
      "../../application/workbench/workbenchController.ts",
    );
    expect(retiredModules.filter((filePath) => filePath in workspaceModules))
      .toEqual([]);
    expect(appRoot).not.toMatch(/createWorkspaceSessionController|createRepositoryCatalogController/);
    expect(appRoot).not.toMatch(/flushPendingChanges|prepareForRepositoryRemoval/);
  });

  it("keeps syntax catalog mutation rules outside the session lifecycle controller", () => {
    const controller = applicationModules[
      "../../application/workspace/session/workspaceSessionController.ts"
    ];

    expect(Object.keys(applicationModules)).toContain(
      "../../application/workspace/session/workspaceSyntaxCatalogMutationService.ts",
    );
    expect(controller).not.toMatch(
      /parseWorkspaceSyntax|normalizeWorkspaceSyntaxProfileName|reconcileWorkspaceSyntaxBlockMetadata/,
    );
  });

  it("keeps common wire utilities independent from domain contracts", () => {
    const violations = Object.keys(contractModules)
      .filter((filePath) => filePath.startsWith("../../contracts/common/"))
      .flatMap((filePath) =>
        readInternalModuleImports(
          contractModules,
          filePath,
          "../../contracts/",
        )
          .filter(({ targetPath }) =>
            !targetPath.startsWith("../../contracts/common/")
          )
          .map(({ importPath }) => formatImport(filePath, importPath))
      );

    expect(violations).toEqual([]);
  });

  it("keeps shared CTN and portable naming pure and uniquely owned", () => {
    const externalCtnParsers = Object.keys(coreModules).filter((filePath) =>
      !filePath.startsWith("../../core/ctn/") &&
      readModuleImports(coreModules, filePath).includes("smol-toml"),
    );
    const tomlParserOwners = Object.keys(ctnModules).filter((filePath) =>
      readModuleImports(ctnModules, filePath).includes("smol-toml"),
    );

    expect(externalCtnParsers).toEqual([]);
    expect(tomlParserOwners).toEqual([
      "../../core/ctn/syntax/profileTomlParser.ts",
    ]);
    expect(Object.keys(portableNameModules)).toEqual([
      "../../core/naming/portableName.ts",
    ]);
  });

  it("keeps browser and HTTP adapters independent behind persistence ports", () => {
    const area = (filePath: string) =>
      filePath.replace("../../infrastructure/", "").split("/")[0] ?? "";
    const violations = Object.keys(infrastructureModules).flatMap((filePath) => {
      const sourceArea = area(filePath);

      if (sourceArea !== "browser" && sourceArea !== "http") return [];
      return readInternalModuleImports(
        workspaceModules,
        filePath,
        "../../infrastructure/",
      )
        .filter(({ targetPath }) => {
          const targetArea = area(targetPath);
          return targetArea !== sourceArea && targetArea !== "persistence";
        })
        .map(({ importPath }) => formatImport(filePath, importPath));
    });

    expect(violations).toEqual([]);
  });

  it("keeps server repository rules and adapters directional", () => {
    const prefix = "../../infrastructure/server/";
    const area = (filePath: string) => {
      const segments = filePath.slice(prefix.length).split("/");
      return segments[0] === "adapters"
        ? `adapters/${segments[1]}`
        : segments[0];
    };
    const allowed = new Map<string, ReadonlySet<string>>([
      ["api", new Set(["api", "repository"])],
      ["catalog", new Set(["catalog", "repository"])],
      ["repository", new Set(["repository"])],
      ["adapters/local", new Set(["adapters/local", "repository"])],
      ["adapters/webdav", new Set(["adapters/webdav", "repository"])],
    ]);
    const violations = Object.keys(serverModules).flatMap((filePath) => {
      if (filePath === `${prefix}index.ts`) return [];
      const permitted = allowed.get(area(filePath));

      return readInternalModuleImports(serverModules, filePath, prefix)
        .filter(({ targetPath }) => !permitted?.has(area(targetPath)))
        .map(({ importPath }) => formatImport(filePath, importPath));
    });

    expect(violations).toEqual([]);
  });

  it("keeps production dependency graphs acyclic", () => {
    expect(listSourceDependencyCycles()).toEqual([]);
    const coreGraph = new Map(
      Object.keys(coreModules).map((filePath) => [
        filePath,
        readInternalModuleImports(coreModules, filePath, "../../core/").map(
          ({ targetPath }) => targetPath,
        ),
      ]),
    );

    expect(findDependencyCycles(coreGraph)).toEqual([]);
  });

  it("removes the purpose-content union and shared system endpoint", () => {
    const production = Object.values(workspaceModules).join("\n");

    expect(production).not.toContain("SystemRepositoryContentDto");
    expect(production).not.toContain("/api/system-repositories");
  });

  it("keeps presentation ownership one-way", () => {
    const consumers = [
      ...Object.keys(applicationModules),
      ...Object.keys(contractModules),
      ...Object.keys(coreModules),
      ...Object.keys(infrastructureModules),
    ].flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(({ targetRoot }) => targetRoot === "presentation")
        .map(({ importPath }) => formatImport(filePath, importPath)),
    );
    const reactOutsidePresentation = [
      ...Object.keys(applicationModules),
      ...Object.keys(contractModules),
      ...Object.keys(coreModules),
      ...Object.keys(infrastructureModules),
    ].flatMap((filePath) =>
      readModuleImports(workspaceModules, filePath)
        .filter((value) => /^react(?:\/|$)/.test(value))
        .map((value) => formatImport(filePath, value)),
    );

    expect(consumers).toEqual([]);
    expect(reactOutsidePresentation).toEqual([]);
    expect(Object.keys(presentationModules).length).toBeGreaterThan(0);
  });

  it("keeps activity bindings independent from the shell composition root", () => {
    const activityModules = Object.keys(presentationModules).filter((filePath) =>
      filePath.startsWith("../../presentation/activities/")
    );
    const shellImports = activityModules.flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(({ targetPath }) =>
          targetPath.startsWith("../../presentation/shell/")
        )
        .map(({ importPath }) => formatImport(filePath, importPath)),
    );

    expect(shellImports).toEqual([]);
    expect(activityModules.some((filePath) =>
      filePath.startsWith("../../presentation/activities/bindings/")
    )).toBe(true);
  });
});
