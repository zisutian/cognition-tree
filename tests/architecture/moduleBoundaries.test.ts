import { describe, expect, it } from "vitest";

type SourceModules = Record<string, string>;

type SourceImport = {
  filePath: string;
  importPath: string;
  targetPath: string;
  targetRoot: string;
};

const sourceModules = import.meta.glob("../../src/**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

const sourceStyleModules = import.meta.glob("../../src/**/*.css", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

const serverModules = import.meta.glob("../../server/**/*.mjs", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

const allowedSourceRoots = [
  "app",
  "application",
  "ctn",
  "editor",
  "storage",
  "ui",
  "workspace",
];

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

function sourcePathToRelative(filePath: string) {
  return filePath.replace("../../src/", "");
}

function getSourceRoot(filePath: string) {
  return sourcePathToRelative(filePath).split("/")[0] ?? "";
}

function listSourceFiles(dir: string) {
  return Object.keys(sourceModules).filter((filePath) =>
    filePath.startsWith(`../../src/${dir}/`),
  );
}

function listAllSourcePaths() {
  return [
    ...new Set([
      ...Object.keys(sourceModules),
      ...Object.keys(sourceStyleModules),
    ]),
  ].sort();
}

function listSourceRootDirectories() {
  return [
    ...new Set(
      listAllSourcePaths().flatMap((filePath) => {
        const relativePath = sourcePathToRelative(filePath);
        const separatorIndex = relativePath.indexOf("/");

        return separatorIndex === -1
          ? []
          : [relativePath.slice(0, separatorIndex)];
      }),
    ),
  ].sort();
}

function listSourceRootFiles() {
  return listAllSourcePaths()
    .map(sourcePathToRelative)
    .filter((filePath) => !filePath.includes("/"))
    .sort();
}

function listSubdirectories(dir: string) {
  return [
    ...new Set(
      listAllSourcePaths().flatMap((filePath) => {
        const prefix = `../../src/${dir}/`;

        if (!filePath.startsWith(prefix)) {
          return [];
        }

        const relativePath = filePath.slice(prefix.length);
        const separatorIndex = relativePath.indexOf("/");

        return separatorIndex === -1
          ? []
          : [relativePath.slice(0, separatorIndex)];
      }),
    ),
  ].sort();
}

function listSourceFileNames(dir: string) {
  return listSourceFiles(dir)
    .map((filePath) => filePath.replace(`../../src/${dir}/`, ""))
    .sort();
}

function listImmediateSourceFileNames(dir: string) {
  return listSourceFileNames(dir)
    .filter((filePath) => !filePath.includes("/"))
    .sort();
}

function listAllFileNames(dir: string) {
  return listAllSourcePaths()
    .filter((filePath) => filePath.startsWith(`../../src/${dir}/`))
    .map((filePath) => filePath.replace(`../../src/${dir}/`, ""))
    .sort();
}

function listImmediateAllFileNames(dir: string) {
  return listAllFileNames(dir)
    .filter((filePath) => !filePath.includes("/"))
    .sort();
}

function readModuleImports(modules: SourceModules, filePath: string) {
  const source = modules[filePath] ?? "";
  const imports = [
    ...source.matchAll(/\bimport\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
  ];

  return imports.map((match) => match[1]);
}

function normalizePath(segments: string[]) {
  return segments.reduce<string[]>((normalizedSegments, segment) => {
    if (!segment || segment === ".") {
      return normalizedSegments;
    }

    if (segment === "..") {
      return normalizedSegments.slice(0, -1);
    }

    return [...normalizedSegments, segment];
  }, []);
}

function resolveRelativeImport(filePath: string, importPath: string) {
  if (!importPath.startsWith(".")) {
    return null;
  }

  const fileDirectory = filePath.split("/").slice(0, -1);
  const resolvedPath = normalizePath([
    ...fileDirectory,
    ...importPath.split("/"),
  ]).join("/");

  return resolvedPath.startsWith("../../src/") ? resolvedPath : null;
}

function readSourceImports(filePath: string): SourceImport[] {
  return readModuleImports(sourceModules, filePath).flatMap((importPath) => {
    const targetPath = resolveRelativeImport(filePath, importPath);

    if (!targetPath) {
      return [];
    }

    return [
      {
        filePath,
        importPath,
        targetPath,
        targetRoot: getSourceRoot(targetPath),
      },
    ];
  });
}

function listInternalImports() {
  return Object.keys(sourceModules).flatMap(readSourceImports);
}

function listServerFiles() {
  return Object.keys(serverModules);
}

function readServerImports(filePath: string) {
  return readModuleImports(serverModules, filePath);
}

describe("architecture module boundaries", () => {
  it("keeps src top-level directories aligned with the architecture document", () => {
    expect(listSourceRootDirectories()).toEqual(allowedSourceRoots);
    expect(listSourceRootFiles()).toEqual(["vite-env.d.ts"]);
  });

  it("keeps app as the composition root", () => {
    expect(listSourceFileNames("app")).toEqual(["AppRoot.tsx", "main.tsx"]);
  });

  it("keeps application submodules explicitly named", () => {
    expect(listSubdirectories("application")).toEqual(["workspace"]);
    expect(listImmediateSourceFileNames("application/workspace")).toEqual([]);
    expect(listSubdirectories("application/workspace")).toEqual([
      "projection",
      "session",
      "view-model",
    ]);
    expect(listSourceFileNames("application/workspace/session")).toEqual([
      "sessionCommands.ts",
      "sessionRepositorySnapshot.ts",
      "useSession.ts",
      "workspaceSaveQueue.ts",
    ]);
    expect(listSourceFileNames("application/workspace/view-model")).toEqual([
      "migrationMessages.ts",
      "migrationTargetPosition.ts",
      "selection.ts",
      "sidebarTreeMove.ts",
      "syntaxDraftActions.ts",
      "useMigrationViewModel.ts",
      "useSyntaxDraft.ts",
      "useViewModel.ts",
      "useWorkspaceParseIndex.ts",
      "viewSelection.ts",
    ]);
    expect(listSourceFileNames("application/workspace/projection")).toEqual([
      "viewBlocks.ts",
      "viewEditor.ts",
      "viewGraph.ts",
      "viewMigration.ts",
      "viewSidebar.ts",
      "viewSyntax.ts",
      "viewText.ts",
      "viewTree.ts",
    ]);
  });

  it("keeps ui submodules explicitly named", () => {
    expect(listImmediateSourceFileNames("ui")).toEqual([
      "ActivityBar.tsx",
      "AppFrame.tsx",
      "AppSidebar.tsx",
      "AppView.tsx",
      "activityTypes.ts",
      "sidebarResize.ts",
    ]);
    expect(listSubdirectories("ui")).toEqual([
      "activities",
      "shared",
      "styles",
    ]);
    expect(listImmediateAllFileNames("ui/styles")).toEqual(["index.css"]);
    expect(listSubdirectories("ui/styles")).toEqual([
      "activities",
      "foundation",
      "frame",
      "shared",
    ]);
    expect(listAllFileNames("ui/styles/foundation")).toEqual([
      "base.css",
      "theme.css",
    ]);
    expect(listAllFileNames("ui/styles/frame")).toEqual([
      "layout.css",
      "responsive.css",
      "sidebar.css",
    ]);
    expect(listAllFileNames("ui/styles/shared")).toEqual([
      "blockText.css",
      "primitives.css",
      "scrollbars.css",
      "tree.css",
    ]);
    expect(listAllFileNames("ui/styles/activities")).toEqual([
      "migration.css",
      "notes.css",
      "syntax.css",
      "visualization.css",
    ]);
    expect(listImmediateSourceFileNames("ui/activities")).toEqual([
      "ActivityPlaceholderPanels.tsx",
      "activityRegistry.tsx",
    ]);
    expect(listSubdirectories("ui/activities")).toEqual([
      "migration",
      "notes",
      "settings",
      "syntax",
      "visualization",
    ]);
    expect(listSubdirectories("ui/shared")).toEqual([
      "blocks",
      "primitives",
    ]);
    expect(listSourceFileNames("ui/activities/migration")).toEqual([
      "BlockMigrationView.tsx",
      "BlockStructureTree.tsx",
      "BlockStructureView.tsx",
      "MigrationMainPanel.tsx",
      "MigrationNoteTree.tsx",
      "MigrationSidebarPanel.tsx",
      "MigrationSourceTree.tsx",
      "MigrationTargetTree.tsx",
      "blockLineDrag.ts",
      "migrationNoteDrag.ts",
    ]);
    expect(listSourceFileNames("ui/activities/notes")).toEqual([
      "NoteEditorPanel.tsx",
      "NoteOutlinePanel.tsx",
      "NoteOutlineTree.tsx",
      "NotesSidebarPanel.tsx",
      "NotesSidebarTree.tsx",
      "sidebarTreeDrag.ts",
    ]);
    expect(listSourceFileNames("ui/shared/blocks")).toEqual([
      "BlockTextDisplay.tsx",
      "BlockTree.tsx",
    ]);
    expect(listSourceFileNames("ui/shared/primitives")).toEqual([
      "UiButton.tsx",
      "UiEmptyState.tsx",
      "UiField.tsx",
      "UiList.tsx",
      "UiPanel.tsx",
      "UiStatus.tsx",
      "classNames.ts",
      "index.ts",
    ]);
  });

  it("keeps activity styles from redefining shared primitives", () => {
    const primitiveSelectorDefinitions = Object.entries(sourceStyleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../src/ui/styles/activities/"),
      )
      .flatMap(([filePath, source]) =>
        source
          .split("\n")
          .map((line, index) => ({ filePath, index, line }))
          .filter(({ line }) => /^\s*\.ui-[\w-]/.test(line))
          .map(({ filePath, index, line }) =>
            `${sourcePathToRelative(filePath)}:${index + 1}: ${line.trim()}`,
          ),
      );

    expect(primitiveSelectorDefinitions).toEqual([]);
  });

  it("keeps hard-coded style colors centralized in the theme", () => {
    const hardCodedColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
    const violations = Object.entries(sourceStyleModules)
      .filter(
        ([filePath]) =>
          filePath !== "../../src/ui/styles/foundation/theme.css",
      )
      .flatMap(([filePath, source]) =>
        source
          .split("\n")
          .map((line, index) => ({ filePath, index, line }))
          .filter(({ line }) => hardCodedColorPattern.test(line))
          .map(({ filePath, index, line }) =>
            `${sourcePathToRelative(filePath)}:${index + 1}: ${line.trim()}`,
          ),
      );

    expect(violations).toEqual([]);
  });

  it("keeps removed style aliases and dead primitive classes out of source", () => {
    const forbiddenStylePatterns = [
      /--note-/,
      /--font-weight-medium/,
      /--space-9/,
      /--color-warning/,
      /--color-warning-soft/,
      /ui-field-compact/,
      /ui-list-plain/,
      /ui-status-warning/,
      /ui-status-neutral/,
      /diagnostics-panel/,
      /diagnostic-location/,
    ];
    const violations = listAllSourcePaths().flatMap((filePath) => {
      const source = sourceModules[filePath] ?? sourceStyleModules[filePath] ?? "";

      return source
        .split("\n")
        .flatMap((line, index) =>
          forbiddenStylePatterns.some((pattern) => pattern.test(line))
            ? [`${sourcePathToRelative(filePath)}:${index + 1}: ${line.trim()}`]
            : [],
        );
    });

    expect(violations).toEqual([]);
  });

  it("keeps workspace submodules explicitly named", () => {
    expect(listSubdirectories("workspace")).toEqual([
      "commands",
      "context",
      "indexes",
      "model",
      "queries",
    ]);
  });

  it("keeps workspace commands focused on workspace business commands", () => {
    expect(listSourceFileNames("workspace/commands")).toEqual([
      "blockMigrationCommands.ts",
      "workspaceCommands.ts",
    ]);
  });

  it("keeps workspace syntax source handling in workspace context", () => {
    expect(listSourceFileNames("workspace/context")).toEqual([
      "workspaceContext.ts",
      "workspaceSyntaxFile.ts",
    ]);
  });

  it("keeps ctn submodules explicitly named", () => {
    expect(listSubdirectories("ctn")).toEqual(["parser", "syntax"]);
  });

  it("keeps ctn parser owning parsed block text operations", () => {
    expect(listSourceFileNames("ctn/parser")).toEqual([
      "blockRanges.ts",
      "blockTextEdit.ts",
      "diagnostics.ts",
      "indent.ts",
      "inlineReferences.ts",
      "inlineSpans.ts",
      "lineMarkers.ts",
      "parseCtnDocument.ts",
      "types.ts",
    ]);
  });

  it("keeps ctn syntax free of tone presentation helpers", () => {
    const toneSource = sourceModules["../../src/ctn/syntax/tones.ts"] ?? "";

    expect(toneSource).not.toMatch(/getSyntax(?:TextColor)?(?:ClassName|Style)/);
    expect(toneSource).not.toContain("ctn-tone-");
    expect(toneSource).not.toContain("ctn-text-color-");
  });

  it("keeps workspace model focused on workspace data and tree model", () => {
    expect(listImmediateSourceFileNames("workspace/model")).toEqual([
      "workspaceData.ts",
      "workspaceValidation.ts",
    ]);
    expect(listSubdirectories("workspace/model")).toEqual(["noteTree"]);
    expect(listSourceFileNames("workspace/model/noteTree")).toEqual([
      "create.ts",
      "move.ts",
      "mutations.ts",
      "query.ts",
      "types.ts",
    ]);
  });

  it("keeps workspace queries behind a single entry file", () => {
    expect(listSourceFileNames("workspace/queries")).toEqual([
      "workspaceQueries.ts",
    ]);
  });

  it("keeps workspace indexes named by runtime responsibility", () => {
    expect(listSourceFileNames("workspace/indexes")).toEqual([
      "workspaceParseIndex.ts",
      "workspaceStructureIndex.ts",
    ]);
  });

  it("keeps workspace parsed notes behind on-demand index access", () => {
    const violations = Object.entries(sourceModules)
      .filter(([, source]) => source.includes("parsedNotesById"))
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(violations).toEqual([]);
  });

  it("keeps old generic workspace index names out of source", () => {
    const blockedNames = [
      "WorkspaceIndex",
      "WorkspaceIndexCache",
      "createWorkspaceIndex",
      "createWorkspaceIndexCache",
      "useWorkspaceIndex",
    ];
    const violations = Object.entries(sourceModules)
      .filter(([, source]) => blockedNames.some((name) => source.includes(name)))
      .map(([filePath]) => sourcePathToRelative(filePath));

    expect(violations).toEqual([]);
  });

  it("keeps application from bypassing workspace runtime indexes", () => {
    const violations = listSourceFiles("application").flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(({ targetPath }) =>
          targetPath.startsWith("../../src/workspace/model/noteTree"),
        )
        .map(({ importPath }) => `${filePath} imports ${importPath}`),
    );

    expect(violations).toEqual([]);
  });

  it("keeps application projections free of workspace command adapters", () => {
    const violations = listSourceFiles("application/workspace/projection")
      .flatMap((filePath) =>
        readSourceImports(filePath)
          .filter(({ targetPath }) =>
            targetPath.startsWith("../../src/workspace/commands/"),
          )
          .map(({ importPath }) => `${filePath} imports ${importPath}`),
      );

    expect(violations).toEqual([]);
  });

  it("keeps rendered React components out of workspace", () => {
    const workspaceComponentFiles = listSourceFiles("workspace").filter(
      (filePath) => filePath.endsWith(".tsx"),
    );

    expect(workspaceComponentFiles).toEqual([]);
  });

  it("keeps ui isolated from workspace and ctn internals", () => {
    const uiBoundaryViolations = listInternalImports()
      .filter(({ filePath }) => getSourceRoot(filePath) === "ui")
      .filter(({ targetRoot }) => targetRoot === "workspace" || targetRoot === "ctn")
      .map(
        ({ filePath, importPath, targetRoot }) =>
          `${filePath} imports ${importPath} (ui -> ${targetRoot})`,
      );

    expect(uiBoundaryViolations).toEqual([]);
  });

  it("keeps storage out of CTN internals", () => {
    const violations = listSourceFiles("storage").flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(({ targetRoot }) => targetRoot === "ctn")
        .map(({ importPath }) => `${filePath} imports ${importPath}`),
    );

    expect(violations).toEqual([]);
  });

  it("keeps internal source imports following documented dependency direction", () => {
    const violations = listInternalImports().flatMap(
      ({ filePath, importPath, targetRoot }) => {
        const sourceRoot = getSourceRoot(filePath);
        const allowedImports = allowedRootImports.get(sourceRoot);

        if (!allowedImports || allowedImports.has(targetRoot)) {
          return [];
        }

        return [
          `${filePath} imports ${importPath} (${sourceRoot} -> ${targetRoot})`,
        ];
      },
    );

    expect(violations).toEqual([]);
  });

  it("keeps ui shared independent from activities and application", () => {
    const violations = listSourceFiles("ui/shared").flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(
          ({ targetPath }) =>
            targetPath.startsWith("../../src/ui/activities/") ||
            targetPath.startsWith("../../src/application/"),
        )
        .map(({ importPath }) => `${filePath} imports ${importPath}`),
    );

    expect(violations).toEqual([]);
  });

  it("keeps shared block text naming independent from outline-only views", () => {
    const sharedSource = listSourceFiles("ui/shared")
      .map((filePath) => sourceModules[filePath])
      .join("\n");
    const styleSource = Object.values(sourceStyleModules).join("\n");

    expect(sharedSource).not.toMatch(/OutlineNodeText|outline-inline/);
    expect(styleSource).not.toContain("outline-inline");
  });

  it("keeps ui frame components independent from application and activities", () => {
    const frameFiles = [
      "../../src/ui/ActivityBar.tsx",
      "../../src/ui/AppFrame.tsx",
      "../../src/ui/AppSidebar.tsx",
    ];
    const violations = frameFiles.flatMap((filePath) =>
      readSourceImports(filePath)
        .filter(
          ({ targetPath }) =>
            targetPath.startsWith("../../src/application/") ||
            targetPath.startsWith("../../src/workspace/") ||
            targetPath.startsWith("../../src/ctn/") ||
            targetPath.startsWith("../../src/ui/activities/"),
        )
        .map(({ importPath }) => `${filePath} imports ${importPath}`),
    );

    expect(violations).toEqual([]);
  });

  it("keeps server from owning CTN syntax parsing rules", () => {
    const serverSyntaxCoreFiles = listServerFiles()
      .filter((filePath) => /syntaxProfileToml/.test(filePath))
      .sort();
    const violations = listServerFiles().flatMap((filePath) =>
      readServerImports(filePath)
        .filter((importPath) => importPath === "smol-toml")
        .map((importPath) => `${filePath} imports ${importPath}`),
    );

    expect(serverSyntaxCoreFiles).toEqual([]);
    expect(violations).toEqual([]);
  });

  it("keeps server behind the local HTTP and file repository boundary", () => {
    const blockedServerImports = [
      /^react$/,
      /^react\//,
      /\.\.\/src\//,
      /^src\//,
    ];
    const violations = listServerFiles().flatMap((filePath) =>
      readServerImports(filePath)
        .filter((importPath) =>
          blockedServerImports.some((blockedImport) =>
            blockedImport.test(importPath),
          ),
        )
        .map((importPath) => `${filePath} imports ${importPath}`),
    );

    expect(violations).toEqual([]);
  });

  it("keeps frontend source out of server modules", () => {
    const violations = Object.keys(sourceModules).flatMap((filePath) =>
      readModuleImports(sourceModules, filePath)
        .filter((importPath) => /server\//.test(importPath))
        .map((importPath) => `${filePath} imports ${importPath}`),
    );

    expect(violations).toEqual([]);
  });
});
