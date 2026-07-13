import { describe, expect, it } from "vitest";
import {
  contractModules,
  hasSourceFile,
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
    expect(listSubdirectories("app")).toEqual(["activities"]);
  });

  it("keeps application state organized by workspace responsibility", () => {
    expect(listSubdirectories("application")).toEqual(["workspace"]);
    expect(listSubdirectories("application/workspace")).toEqual([
      "activities",
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
  });

  it("keeps workspace and CTN organized by business responsibility", () => {
    expect(listSubdirectories("workspace")).toEqual([
      "commands",
      "context",
      "indexes",
      "model",
      "queries",
    ]);
    expect(listSubdirectories("ctn")).toEqual(["parser", "syntax"]);
    expect(listSourceFiles("workspace").filter((path) => path.endsWith(".tsx")))
      .toEqual([]);
  });

  it("keeps UI frame, activity, and shared tree boundaries explicit", () => {
    expect(hasSourceFile("ui/AppView.tsx")).toBe(true);
    expect(hasSourceFile("ui/AppFrame.tsx")).toBe(true);
    expect(hasSourceFile("ui/activityTypes.ts")).toBe(true);
    expect(listSubdirectories("ui")).toEqual(["activities", "shared"]);
    expect(listSubdirectories("ui/activities")).toEqual([
      "notes",
      "settings",
      "structure-operation",
      "syntax",
      "visualization",
    ]);
    expect(hasSourceFile("ui/shared/tree/index.ts")).toBe(true);
    expect(hasSourceFile("ui/shared/tree/NoteTree.tsx")).toBe(true);
    expect(hasSourceFile("ui/shared/tree/StructureTree.tsx")).toBe(true);
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
});
