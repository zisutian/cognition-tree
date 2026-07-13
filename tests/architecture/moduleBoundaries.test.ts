import { describe, expect, it } from "vitest";

type SourceModules = Record<string, string>;
type RawSourceModules = Record<string, string | { default?: string }>;

// @ts-expect-error Node built-in types are intentionally outside the app tsconfig.
const { readFileSync } = (await import("node:fs")) as {
  readFileSync: (path: URL, encoding: "utf8") => string;
};

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

const rawSourceStyleModules = import.meta.glob("../../src/**/*.css", {
  eager: true,
  query: "?inline",
}) as RawSourceModules;

const sourceStyleModules = Object.fromEntries(
  Object.keys(rawSourceStyleModules).map((filePath) => [
    filePath,
    readFileSync(new URL(filePath, import.meta.url), "utf8"),
  ]),
) as SourceModules;

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

function readStyleSource(relativePath: string) {
  const globSource = Object.entries(sourceStyleModules).find(
    ([filePath]) =>
      sourcePathToRelative(filePath) === relativePath ||
      filePath.endsWith(`/${relativePath}`) ||
      filePath.includes(relativePath),
  )?.[1];

  return globSource ?? "";
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
      "workspaceSessionSaveQueue.ts",
    ]);
    expect(listSourceFileNames("application/workspace/view-model")).toEqual([
      "activityViewModels.ts",
      "selection.ts",
      "sidebarTreeMove.ts",
      "structureOperationTargetPosition.ts",
      "syntaxDraftActions.ts",
      "useStructureOperationViewModel.ts",
      "useSyntaxDraft.ts",
      "useViewModel.ts",
      "useWorkspaceParseIndex.ts",
      "viewSelection.ts",
    ]);
    expect(listSourceFileNames("application/workspace/projection")).toEqual([
      "viewBlocks.ts",
      "viewEditor.ts",
      "viewGraph.ts",
      "viewStructureOperation.ts",
      "viewSyntax.ts",
      "viewText.ts",
      "viewTree.ts",
    ]);
  });

  it("keeps ui submodules explicitly named", () => {
    expect(listImmediateSourceFileNames("ui")).toEqual([
      "ActivityBar.tsx",
      "AppFrame.tsx",
      "AppView.tsx",
      "activityTypes.ts",
      "frameResize.ts",
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
      "frame.css",
    ]);
    expect(listAllFileNames("ui/styles/shared")).toEqual([
      "blockText.css",
      "context.css",
      "primitives.css",
      "tree.css",
    ]);
    expect(listAllFileNames("ui/styles/activities")).toEqual([
      "notes.css",
      "placeholder.css",
      "settings.css",
      "structure-operation.css",
      "syntax.css",
      "visualization.css",
    ]);
    expect(listImmediateSourceFileNames("ui/activities")).toEqual([
      "PlaceholderPanel.tsx",
      "activityRegistry.tsx",
    ]);
    expect(listSubdirectories("ui/activities")).toEqual([
      "notes",
      "settings",
      "structure-operation",
      "syntax",
      "visualization",
    ]);
    expect(listImmediateSourceFileNames("ui/shared")).toEqual([
      "blockText.tsx",
      "primitives.tsx",
    ]);
    expect(listSubdirectories("ui/shared")).toEqual(["tree"]);
    expect(listSourceFileNames("ui/shared/tree")).toEqual([
      "NoteTree.tsx",
      "StructureTree.tsx",
      "drag.ts",
      "index.ts",
      "structureIndent.ts",
      "types.ts",
    ]);
    expect(listSourceFileNames("ui/activities/structure-operation")).toEqual([
      "StructureOperationContext.tsx",
      "StructureOperationPairView.tsx",
      "StructureOperationPanels.tsx",
      "StructureOperationStructureView.tsx",
      "blockLineDrag.ts",
      "structureOperationBlocks.ts",
      "structureOperationDropTargets.tsx",
    ]);
    expect(listSourceFileNames("ui/activities/notes")).toEqual([
      "NotesPanels.tsx",
    ]);
    expect(listSourceFileNames("ui/activities/settings")).toEqual([
      "SettingsPanel.tsx",
    ]);
    expect(listSourceFileNames("ui/activities/syntax")).toEqual([
      "SyntaxDetailPanel.tsx",
      "SyntaxMainPanel.tsx",
      "SyntaxPanels.tsx",
      "SyntaxRolePicker.tsx",
      "SyntaxRuleRows.tsx",
      "SyntaxSetupPanel.tsx",
      "TonePicker.tsx",
      "syntaxPreview.ts",
    ]);
    expect(listSourceFileNames("ui/activities/visualization")).toEqual([
      "ReferenceGraphCanvas.tsx",
      "VisualizationDetailLists.tsx",
      "VisualizationDetailPanel.tsx",
      "VisualizationPanel.tsx",
      "VisualizationPanels.tsx",
      "VisualizationToolbar.tsx",
      "graphEmptyState.ts",
      "referenceGraphCanvasDrawing.ts",
      "referenceGraphCanvasModel.ts",
      "referenceGraphView.ts",
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

  it("keeps activity components on activity-specific view models", () => {
    const violations = listSourceFiles("ui/activities")
      .filter(
        (filePath) =>
          filePath !== "../../src/ui/activities/activityRegistry.tsx",
      )
      .flatMap((filePath) => {
        const source = sourceModules[filePath] ?? "";

        return /\bViewModel\b/.test(source)
          ? [sourcePathToRelative(filePath)]
          : [];
      });

    expect(violations).toEqual([]);
  });

  it("keeps workbench interactions out of native browser dialogs", () => {
    const uiSource = listSourceFiles("ui")
      .map((filePath) => sourceModules[filePath])
      .join("\n");

    expect(uiSource).not.toMatch(/window\.(?:alert|confirm|prompt)\s*\(/);
  });

  it("keeps editor and activity styles in their owning modules", () => {
    const sharedStyleSource = Object.entries(sourceStyleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../src/ui/styles/shared/"),
      )
      .map(([, source]) => source)
      .join("\n");
    const activityStyleSource = Object.entries(sourceStyleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../src/ui/styles/activities/"),
      )
      .map(([, source]) => source)
      .join("\n");
    const editorSource = readStyleSource("editor/CtnEditor.css");

    expect(sharedStyleSource).not.toMatch(
      /\.(?:graph|settings|structure-operation|syntax)-/,
    );
    expect(activityStyleSource).not.toContain(".source-editor");
    expect(editorSource).toContain(".source-editor");
    expect(editorSource).toContain(
      ".source-editor .ctn-line:not(.ctn-tone-default)",
    );
  });

  it("keeps activity styles from redefining shared panel titles", () => {
    const titleSelectorPattern =
      /^\s*\.[\w-]+\s+(?:\.ui-panel-(?:header|title|title-group|leading-actions|actions)|\.context-panel-header)(?:\s|[.{:#>])/;
    const violations = Object.entries(sourceStyleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../src/ui/styles/activities/"),
      )
      .flatMap(([filePath, source]) =>
        source
          .split("\n")
          .map((line, index) => ({ filePath, index, line }))
          .filter(({ line }) => titleSelectorPattern.test(line))
          .map(({ filePath, index, line }) =>
            `${sourcePathToRelative(filePath)}:${index + 1}: ${line.trim()}`,
          ),
      );

    expect(violations).toEqual([]);
  });

  it("keeps typography and numeric style tokens centralized", () => {
    const themeSource = readStyleSource("ui/styles/foundation/theme.css");
    const primitiveSource = readStyleSource("ui/styles/shared/primitives.css");
    const frameSource = readStyleSource("ui/styles/frame/frame.css");
    const treeSource = readStyleSource("ui/styles/shared/tree.css");
    const editorSource = readStyleSource("editor/CtnEditor.css");

    expect(themeSource).toContain("--font-ui");
    expect(themeSource).toContain("--font-content");
    expect(themeSource).toContain("--font-code");
    expect(themeSource).toContain("--app-activity-width: 48px");
    expect(themeSource).toContain("--app-detail-collapsed-width: 36px");
    expect(themeSource).toContain("--app-main-min-width: 420px");
    expect(themeSource).toContain("--ui-panel-padding: 10px");
    expect(themeSource).toContain("--ui-tree-row-height: 22px");
    expect(themeSource).toContain("--ui-root-font-size");
    expect(themeSource).toContain("--ui-title-font-size");
    expect(themeSource).toContain("--ui-body-font-size");
    expect(themeSource).toContain("--ui-control-font-size");
    expect(themeSource).toContain("--ui-micro-font-size");
    expect(themeSource).toContain("--ui-code-font-size");
    expect(themeSource).toContain("--ui-micro-line-height");
    expect(themeSource).toContain("--ui-micro-weight");
    expect(themeSource).toContain("--ui-micro-strong-weight");
    expect(themeSource).toContain("--ui-numeric-font-variant");
    expect(themeSource).toContain("--ui-numeric-weight");
    expect(themeSource).toContain("--ui-numeric-strong-weight");
    expect(themeSource).toContain("--ctn-editor-font-size: 14px");
    expect(primitiveSource).toContain("var(--ui-micro-font-size)");
    expect(primitiveSource).toContain("var(--ui-numeric-font-variant)");
    expect(frameSource).toContain("var(--ui-micro-font-size)");
    expect(treeSource).toContain("var(--ui-numeric-font-variant)");
    expect(editorSource).toContain("var(--ctn-editor-font-size)");
    expect(`${primitiveSource}\n${frameSource}`).not.toContain(
      "text-transform: uppercase",
    );
  });

  it("keeps typography variables role based", () => {
    const styleSource = Object.values(sourceStyleModules).join("\n");
    const forbiddenFontVariables = [
      /--font-cjk\b/,
      /--font-mono\b/,
      /--font-size-/,
      /--font-weight-/,
    ];
    const violations = forbiddenFontVariables.flatMap((pattern) =>
      pattern.test(styleSource) ? [String(pattern)] : [],
    );

    expect(violations).toEqual([]);
  });

  it("keeps UI typography from bypassing role tokens outside foundation", () => {
    const violations = Object.entries(sourceStyleModules)
      .filter(
        ([filePath]) =>
          filePath.startsWith("../../src/ui/styles/") &&
          !filePath.startsWith("../../src/ui/styles/foundation/"),
      )
      .flatMap(([filePath, source]) =>
        source
          .split("\n")
          .map((line, index) => ({ filePath, index, line }))
          .filter(({ line }) =>
            /font-(?:size|weight):\s*(?:[0-9]|var\(--font-)/.test(line),
          )
          .map(({ filePath, index, line }) =>
            `${sourcePathToRelative(filePath)}:${index + 1}: ${line.trim()}`,
          ),
      );

    expect(violations).toEqual([]);
  });

  it("keeps UI font family and line height behind role tokens", () => {
    const violations = Object.entries(sourceStyleModules)
      .filter(
        ([filePath]) =>
          filePath.startsWith("../../src/ui/styles/") &&
          !filePath.startsWith("../../src/ui/styles/foundation/"),
      )
      .flatMap(([filePath, source]) =>
        source
          .split("\n")
          .map((line, index) => ({ filePath, index, line }))
          .filter(({ line }) => {
            const fontFamilyValue = line.match(/font-family:\s*([^;]+)/)?.[1].trim();
            const usesRawFontFamily = fontFamilyValue
              ? fontFamilyValue !== "inherit" &&
                !fontFamilyValue.startsWith("var(--font-")
              : false;
            const usesRawLineHeight = /line-height:\s*[0-9]/.test(line);

            return usesRawFontFamily || usesRawLineHeight;
          })
          .map(({ filePath, index, line }) =>
            `${sourcePathToRelative(filePath)}:${index + 1}: ${line.trim()}`,
          ),
      );

    expect(violations).toEqual([]);
  });

  it("keeps numeric alignment behind numeric tokens", () => {
    const violations = Object.entries(sourceStyleModules)
      .filter(
        ([filePath]) =>
          filePath.startsWith("../../src/ui/styles/") &&
          sourcePathToRelative(filePath) !== "ui/styles/foundation/theme.css",
      )
      .flatMap(([filePath, source]) =>
        source
          .split("\n")
          .map((line, index) => ({ filePath, index, line }))
          .filter(({ line }) => line.includes("tabular-nums"))
          .map(({ filePath, index, line }) =>
            `${sourcePathToRelative(filePath)}:${index + 1}: ${line.trim()}`,
          ),
      );

    expect(violations).toEqual([]);
  });

  it("keeps activity microcopy styles behind role tokens", () => {
    const microcopySelectorPattern =
      /^\s*\.(?:context-caption|context-empty|syntax-readonly|graph-label)\b/;
    const violations = Object.entries(sourceStyleModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../src/ui/styles/activities/"),
      )
      .flatMap(([filePath, source]) => {
        const lines = source.split("\n");

        return lines.flatMap((line, index) => {
          if (!microcopySelectorPattern.test(line)) {
            return [];
          }

          const block = lines.slice(index, index + 12).join("\n");
          const usesAdHocFont =
            /font-size:\s*(?:[0-9]|var\(--font-)/.test(block) ||
            /font-weight:\s*(?:[0-9]|var\(--font-)/.test(block);

          return usesAdHocFont
            ? [`${sourcePathToRelative(filePath)}:${index + 1}: ${line.trim()}`]
            : [];
        });
      });

    expect(violations).toEqual([]);
  });

  it("keeps high-density UI scales stable", () => {
    const themeSource = readStyleSource("ui/styles/foundation/theme.css");

    expect(themeSource).toContain("--ui-panel-header-height: 34px");
    expect(themeSource).toContain("--ui-control-height: 24px");
    expect(themeSource).toContain("--ui-icon-size: 22px");
    expect(themeSource).toContain("--ui-title-font-size: 16px");
    expect(themeSource).toContain("--ui-body-font-size: 13px");
    expect(themeSource).toContain("--ui-micro-font-size: 12px");
  });

  it("keeps old syntax UI wording out of source", () => {
    const forbiddenSyntaxText = [
      "Tab 宽度",
      "无有效 profile",
      "生成摘要",
      "行首规则",
      "单符号",
      "标题字体色",
      "顶格概念字体色",
    ];
    const violations = Object.entries(sourceModules)
      .filter(([filePath]) => filePath.startsWith("../../src/ui/"))
      .flatMap(([filePath, source]) =>
        forbiddenSyntaxText.flatMap((text) =>
          source.includes(text)
            ? [`${sourcePathToRelative(filePath)}: ${text}`]
            : [],
        ),
      );

    expect(violations).toEqual([]);
  });

  it("keeps the collapsed detail opener in a header wrapper", () => {
    const source = sourceModules["../../src/ui/AppFrame.tsx"] ?? "";

    expect(source).toContain("app-detail-collapsed-header");
    expect(source).toContain("app-detail-toggle");
  });

  it("keeps display primitives from reintroducing card frames", () => {
    const source = readStyleSource("ui/styles/shared/primitives.css");
    const selectorPatterns = [
      /\.ui-section-framed,\n\.ui-form-section\s*\{[^}]*\bborder:\s*1px/s,
      /\.ui-form-row\s*\{[^}]*\bborder:\s*1px/s,
      /\.ui-list-cards \.ui-list-row,[^}]*\bborder:\s*1px/s,
      /\.ui-status\s*\{[^}]*\bborder:\s*1px\s+solid/s,
      /\.ui-empty-state\s*\{[^}]*\bborder:\s*1px/s,
      /\.ui-section-framed,\n\.ui-form-section\s*\{[^}]*\bbackground:\s*var\(--color-panel\)/s,
      /\.ui-form-row\s*\{[^}]*\bbackground:\s*var\(--color-panel\)/s,
      /\.ui-list-cards \.ui-list-row,[^}]*\bbackground:\s*var\(--color-panel\)/s,
      /\.ui-status\s*\{[^}]*\bbackground:\s*var\(--color-panel\)/s,
      /\.ui-empty-state\s*\{[^}]*\bbackground:\s*var\(--color-panel\)/s,
    ];
    const violations = selectorPatterns.flatMap((pattern) =>
      pattern.test(source) ? [String(pattern)] : [],
    );

    expect(violations).toEqual([]);
  });

  it("keeps activity panel headers free of stats payloads", () => {
    const violations = Object.entries(sourceModules)
      .filter(([filePath]) =>
        filePath.startsWith("../../src/ui/activities/"),
      )
      .flatMap(([filePath, source]) =>
        /<UiPanelHeader\b[\s\S]*?\bstats\s*=/.test(source)
          ? [sourcePathToRelative(filePath)]
          : [],
      );

    expect(violations).toEqual([]);
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
      /--space-9/,
      /--color-warning/,
      /--color-warning-soft/,
      /ui-field\b/,
      /ui-field-compact/,
      /ui-metrics\b/,
      /ui-metric\b/,
      /ui-list-plain/,
      /ui-status-warning/,
      /ui-status-neutral/,
      /dense-list\b/,
      /detail-list\b/,
      /detail-row(?:-|\b)/,
      /diagnostics-panel/,
      /diagnostic-location/,
      /current-note-chip/,
      /note-editor-count-row/,
      /ui-panel-stats/,
      /header-chip/,
      /ui-panel-header-start/,
      /syntax-marker-row/,
      /syntax-marker-label/,
      /syntax-inline-actions/,
      /app-sidebar/,
      /side-panel/,
      /sidebar-scroll-area/,
      /blockMigrationCommands/,
      /migrationMessages/,
      /migrationTargetPosition/,
      /MigrationPanels/,
      /UiMigrationView/,
      /useMigrationViewModel/,
      /viewMigration/,
      /WorkspaceBlockMigration/,
      /moveWorkspaceBlock/,
      /moveWorkspaceNoteBlock/,
      /migration-(?:grid|column|drop-target|target-node|target-tree|panel|body)/,
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
      "structureBlockCommands.ts",
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

  it("keeps storage organized around one versioned repository aggregate", () => {
    expect(listImmediateSourceFileNames("storage")).toEqual([
      "browserWorkspaceRepository.ts",
      "httpWorkspaceRepository.ts",
      "runtimeWorkspaceRepository.ts",
      "workspaceDto.ts",
      "workspaceRepository.ts",
      "workspaceRepositoryRevision.ts",
    ]);

    const repositoryPort =
      sourceModules["../../src/storage/workspaceRepository.ts"] ?? "";
    const sessionQueue =
      sourceModules[
        "../../src/application/workspace/session/workspaceSessionSaveQueue.ts"
      ] ?? "";
    const apiServer =
      serverModules["../../server/workspaceApiServer.mjs"] ?? "";

    expect(repositoryPort).toContain("commitSnapshot");
    expect(repositoryPort).toContain("loadSnapshot");
    expect(repositoryPort).not.toMatch(
      /saveWorkspace|loadWorkspace|saveWorkspaceSyntax|readWorkspaceSyntax/,
    );
    expect(sessionQueue).not.toMatch(
      /enqueueWorkspace|enqueueSyntax|saveWorkspace|saveSyntax/,
    );
    expect(apiServer).toContain('"/api/repository-snapshot"');
    expect(apiServer).not.toMatch(
      /["']\/api\/(?:workspace|syntax)["']/,
    );
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
      "../../src/ui/frameResize.ts",
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
