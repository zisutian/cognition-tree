import { describe, expect, it } from "vitest";
import {
  contractModules,
  hasSourceFile,
  listModuleRootDirectories,
  listModuleRootFiles,
  listModuleSubdirectories,
  listSourceFiles,
  listSourceRootDirectories,
  listSourceRootFiles,
  listSubdirectories,
  serverModules,
  sourceModules,
  sourcePathToRelative,
} from "./sourceGraph";

describe("source topology", () => {
  it("keeps the documented logical modules at the source root", () => {
    expect(listSourceRootDirectories()).toEqual([
      "app",
      "application",
      "ctn",
      "editor",
      "storage",
      "ui",
      "workspace",
    ]);
    expect(listSourceRootFiles()).toEqual(["vite-env.d.ts"]);
  });

  it("keeps app as a small composition root", () => {
    expect(hasSourceFile("app/main.tsx")).toBe(true);
    expect(hasSourceFile("app/AppRoot.tsx")).toBe(true);
    expect(listSubdirectories("app")).toEqual(["activities", "workbench"]);
    expect(hasSourceFile("app/activities/activityRegistry.ts")).toBe(true);
    expect(hasSourceFile("app/workbench/WorkspaceWorkbench.tsx")).toBe(true);
    expect(
      hasSourceFile("app/workbench/WorkbenchProblemsController.tsx"),
    ).toBe(true);
  });

  it("keeps application state organized by workspace responsibility", () => {
    expect(listSubdirectories("application")).toEqual(["workspace"]);
    expect(listSubdirectories("application/workspace")).toEqual([
      "activities",
      "diagnostics",
      "navigation",
      "projection",
      "runtime",
      "selection",
      "session",
    ]);
    expect(listSubdirectories("application/workspace/activities")).toEqual([
      "notes",
      "settings",
      "structure-operation",
      "syntax",
      "visualization",
    ]);
    expect(
      hasSourceFile(
        "application/workspace/diagnostics/workspaceDiagnosticCollection.ts",
      ),
    ).toBe(true);
    expect(
      hasSourceFile(
        "application/workspace/diagnostics/useWorkbenchDiagnostics.ts",
      ),
    ).toBe(true);
    expect(
      hasSourceFile(
        "application/workspace/diagnostics/workbenchDiagnosticPlan.ts",
      ),
    ).toBe(true);
  });

  it("keeps workspace and CTN organized by business responsibility", () => {
    expect(listSubdirectories("workspace")).toEqual([
      "commands",
      "context",
      "indexes",
      "model",
      "queries",
    ]);
    expect(listSubdirectories("ctn")).toEqual(["metadata", "parser", "syntax"]);
    expect(listSourceFiles("workspace").filter((path) => path.endsWith(".tsx")))
      .toEqual([]);
  });

  it("keeps frontend persistence organized by core, adapters, and runtime", () => {
    const storageModules = Object.fromEntries(
      Object.entries(sourceModules).filter(([filePath]) =>
        filePath.startsWith("../../src/storage/"),
      ),
    );

    expect(
      listModuleRootDirectories(storageModules, "../../src/storage/"),
    ).toEqual(["adapters", "repository", "runtime"]);
    expect(listModuleRootFiles(storageModules, "../../src/storage/")).toEqual(
      [],
    );
    expect(listSubdirectories("storage/adapters")).toEqual([
      "browser",
      "http",
    ]);
  });

  it("keeps server API, repository rules, catalogs, and adapters explicit", () => {
    expect(listModuleRootDirectories(serverModules, "../../server/")).toEqual([
      "adapters",
      "api",
      "catalog",
      "repository",
    ]);
    expect(listModuleRootFiles(serverModules, "../../server/")).toEqual([
      "index.ts",
    ]);
    expect(
      listModuleSubdirectories(
        serverModules,
        "../../server/",
        "adapters",
      ),
    ).toEqual(["local", "webdav"]);
  });

  it("keeps UI frame, activity, and shared tree boundaries explicit", () => {
    expect(hasSourceFile("ui/AppView.tsx")).toBe(true);
    expect(hasSourceFile("ui/AppFrame.tsx")).toBe(true);
    expect(hasSourceFile("ui/activityTypes.ts")).toBe(true);
    expect(listSubdirectories("ui")).toEqual([
      "activities",
      "problems",
      "shared",
      "workbench",
    ]);
    expect(listSubdirectories("ui/activities")).toEqual([
      "notes",
      "settings",
      "structure-operation",
      "syntax",
      "visualization",
    ]);
    expect(hasSourceFile("ui/shared/tree/index.ts")).toBe(true);
    expect(hasSourceFile("ui/shared/tree/NoteTree.tsx")).toBe(true);
    expect(hasSourceFile("ui/shared/tree/DirectoryTreeContent.tsx")).toBe(true);
    expect(hasSourceFile("ui/shared/tree/DirectoryTreeRow.tsx")).toBe(true);
    expect(hasSourceFile("ui/shared/tree/StructureTree.tsx")).toBe(true);
    expect(hasSourceFile("ui/problems/ProblemsPanel.tsx")).toBe(true);
    expect(hasSourceFile("ui/problems/useProblemsShortcut.ts")).toBe(true);
    expect(hasSourceFile("ui/workbench/frameResize.ts")).toBe(true);
    expect(hasSourceFile("ui/workbench/useWorkbenchLayout.ts")).toBe(true);
    expect(
      hasSourceFile("ui/workbench/useWorkbenchPanelResize.ts"),
    ).toBe(true);
  });

  it("keeps directory tree surface, collection, and row rendering separate", () => {
    const treeFiles = listSourceFiles("ui/shared/tree");
    const rowOwners = treeFiles
      .filter((filePath) =>
        (sourceModules[filePath] ?? "").includes('"ui-tree-row-frame",'),
      )
      .map(sourcePathToRelative);
    const virtualCollectionOwners = treeFiles
      .filter((filePath) =>
        (sourceModules[filePath] ?? "").includes(
          "ui-directory-tree ui-virtual-tree",
        ),
      )
      .map(sourcePathToRelative);

    expect(rowOwners).toEqual(["ui/shared/tree/DirectoryTreeRow.tsx"]);
    expect(virtualCollectionOwners).toEqual([
      "ui/shared/tree/DirectoryTreeContent.tsx",
    ]);
  });

  it("keeps structure tree recursion owned by the shared structure tree", () => {
    const owners = listSourceFiles("ui")
      .filter((filePath) =>
        (sourceModules[filePath] ?? "").includes(
          "ui-tree ui-structure-tree",
        ),
      )
      .map(sourcePathToRelative);

    expect(owners).toEqual(["ui/shared/tree/StructureTree.tsx"]);
  });

  it("keeps application projections free of CSS presentation output", () => {
    const blockedTokens = [
      "CSSProperties",
      "className",
      "--ctn-",
      "ctn-text-color-",
      "ctn-tone-",
    ];
    const violations = listSourceFiles("application/workspace/projection")
      .filter((filePath) =>
        blockedTokens.some((token) =>
          (sourceModules[filePath] ?? "").includes(token),
        ),
      )
      .map(sourcePathToRelative);

    expect(violations).toEqual([]);
  });

  it("keeps repository contracts and server implementation outside frontend source", () => {
    expect(Object.keys(contractModules).length).toBeGreaterThan(0);
    expect(
      Object.keys(contractModules).every((path) =>
        path.startsWith("../../contracts/workspace-repository/"),
      ),
    ).toBe(true);
    expect(Object.keys(serverModules).length).toBeGreaterThan(0);
  });

  it("keeps legacy repository handling out of the runtime source graph", () => {
    const violations = Object.entries(sourceModules)
      .filter(([, source]) => /legacy/i.test(source))
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(violations).toEqual([]);
  });
});
