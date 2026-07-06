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
    storage: ["ctn", "storage", "workspace"],
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
    expect(listSourceFileNames("application/workspace")).toEqual([
      "dataSaveQueue.ts",
      "selection.ts",
      "useIndex.ts",
      "useSession.ts",
      "useSyntaxDraft.ts",
      "useViewModel.ts",
      "viewData.ts",
      "viewState.ts",
      "viewTypes.ts",
    ]);
  });

  it("keeps ui submodules explicitly named", () => {
    expect(listImmediateSourceFileNames("ui")).toEqual([
      "ActivityBar.tsx",
      "AppFrame.tsx",
      "AppSidebar.tsx",
      "AppView.tsx",
      "activityTypes.ts",
    ]);
    expect(listSubdirectories("ui")).toEqual([
      "activities",
      "shared",
      "styles",
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
    expect(listSubdirectories("ui/shared")).toEqual(["blocks"]);
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

  it("keeps workspace syntax source handling in workspace context", () => {
    expect(listSourceFileNames("workspace/context")).toEqual([
      "syntaxFile.ts",
      "workspaceContext.ts",
    ]);
  });

  it("keeps ctn submodules explicitly named", () => {
    expect(listSubdirectories("ctn")).toEqual(["parser", "syntax"]);
  });

  it("keeps workspace model focused on workspace data and tree model", () => {
    expect(listSourceFileNames("workspace/model")).toEqual([
      "noteTree.ts",
      "workspaceData.ts",
    ]);
  });

  it("keeps workspace queries behind a single entry file", () => {
    expect(listSourceFileNames("workspace/queries")).toEqual([
      "workspaceQueries.ts",
    ]);
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
