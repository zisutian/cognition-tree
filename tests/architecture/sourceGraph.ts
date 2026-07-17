import ts from "typescript";

export type SourceModules = Record<string, string>;

export type SourceImport = {
  filePath: string;
  importPath: string;
  targetPath: string;
  targetRoot: string;
};

export type InternalModuleImport = {
  filePath: string;
  importPath: string;
  targetPath: string;
};

export const sourceModules = import.meta.glob("../../src/**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

export const ctnModules = import.meta.glob("../../ctn/**/*.ts", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

export const serverModules = import.meta.glob("../../server/**/*.ts", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

export const contractModules = import.meta.glob("../../contracts/**/*.ts", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

export const workspaceModules = {
  ...contractModules,
  ...ctnModules,
  ...serverModules,
  ...sourceModules,
};

export function ctnPathToRelative(filePath: string) {
  return filePath.replace("../../ctn/", "");
}

export function sourcePathToRelative(filePath: string) {
  return filePath.replace("../../src/", "");
}

export function modulePathToRelative(filePath: string, prefix: string) {
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

export function listModuleRootDirectories(
  modules: SourceModules,
  prefix: string,
) {
  return [
    ...new Set(
      Object.keys(modules).flatMap((filePath) => {
        const relativePath = modulePathToRelative(filePath, prefix);
        const separatorIndex = relativePath.indexOf("/");

        return separatorIndex === -1
          ? []
          : [relativePath.slice(0, separatorIndex)];
      }),
    ),
  ].sort();
}

export function listModuleRootFiles(
  modules: SourceModules,
  prefix: string,
) {
  return Object.keys(modules)
    .map((filePath) => modulePathToRelative(filePath, prefix))
    .filter((filePath) => !filePath.includes("/"))
    .sort();
}

export function listModuleSubdirectories(
  modules: SourceModules,
  prefix: string,
  directory: string,
) {
  const directoryPrefix = `${prefix}${directory}/`;

  return [
    ...new Set(
      Object.keys(modules).flatMap((filePath) => {
        if (!filePath.startsWith(directoryPrefix)) {
          return [];
        }

        const relativePath = filePath.slice(directoryPrefix.length);
        const separatorIndex = relativePath.indexOf("/");

        return separatorIndex === -1
          ? []
          : [relativePath.slice(0, separatorIndex)];
      }),
    ),
  ].sort();
}

export function getSourceRoot(filePath: string) {
  return sourcePathToRelative(filePath).split("/")[0] ?? "";
}

export function listSourceFiles(directory: string) {
  const prefix = `../../src/${directory}/`;

  return Object.keys(sourceModules)
    .filter((filePath) => filePath.startsWith(prefix))
    .sort();
}

export function listSourceRootDirectories() {
  return listModuleRootDirectories(sourceModules, "../../src/");
}

export function listSourceRootFiles() {
  return listModuleRootFiles(sourceModules, "../../src/");
}

export function listSubdirectories(directory: string) {
  return listModuleSubdirectories(
    sourceModules,
    "../../src/",
    directory,
  );
}

export function hasSourceFile(relativePath: string) {
  return `../../src/${relativePath}` in sourceModules;
}

function getScriptKind(filePath: string) {
  return filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

export function readModuleImports(
  modules: SourceModules,
  filePath: string,
): string[] {
  const source = modules[filePath] ?? "";
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );
  const imports: string[] = [];

  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      imports.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return imports;
}

function normalizePath(segments: string[]) {
  return segments.reduce<string[]>((normalizedSegments, segment) => {
    if (!segment || segment === ".") {
      return normalizedSegments;
    }

    if (segment === "..") {
      const previousSegment = normalizedSegments.at(-1);

      return previousSegment && previousSegment !== ".."
        ? normalizedSegments.slice(0, -1)
        : [...normalizedSegments, segment];
    }

    normalizedSegments.push(segment);
    return normalizedSegments;
  }, []);
}

function resolveRelativeSourceImport(filePath: string, importPath: string) {
  if (!importPath.startsWith(".")) {
    return null;
  }

  const fileDirectory = filePath.split("/").slice(0, -1);
  const targetPath = normalizePath([
    ...fileDirectory,
    ...importPath.split("/"),
  ]).join("/");

  return targetPath.startsWith("../../src/") ? targetPath : null;
}

function resolveSourceFilePath(targetPath: string) {
  return resolveModuleFilePath(sourceModules, targetPath);
}

function resolveModuleFilePath(modules: SourceModules, targetPath: string) {
  return [
    targetPath,
    `${targetPath}.ts`,
    `${targetPath}.tsx`,
    `${targetPath}/index.ts`,
    `${targetPath}/index.tsx`,
  ].find((candidate) => candidate in modules) ?? null;
}

export function readInternalModuleImports(
  modules: SourceModules,
  filePath: string,
  rootPrefix: string,
): InternalModuleImport[] {
  return readModuleImports(modules, filePath).flatMap((importPath) => {
    if (!importPath.startsWith(".")) {
      return [];
    }

    const targetPath = normalizePath([
      ...filePath.split("/").slice(0, -1),
      ...importPath.split("/"),
    ]).join("/");
    const targetFilePath = resolveModuleFilePath(modules, targetPath);

    return targetFilePath?.startsWith(rootPrefix)
      ? [{ filePath, importPath, targetPath: targetFilePath }]
      : [];
  });
}

export function readSourceImports(filePath: string): SourceImport[] {
  return readModuleImports(sourceModules, filePath).flatMap((importPath) => {
    const targetPath = resolveRelativeSourceImport(filePath, importPath);

    return targetPath
      ? [
          {
            filePath,
            importPath,
            targetPath,
            targetRoot: getSourceRoot(targetPath),
          },
        ]
      : [];
  });
}

export function listInternalSourceImports() {
  return Object.keys(sourceModules).flatMap(readSourceImports);
}

export function findDependencyCycles(
  graph: ReadonlyMap<string, readonly string[]>,
) {
  const indexByNode = new Map<string, number>();
  const lowLinkByNode = new Map<string, number>();
  const stack: string[] = [];
  const nodesOnStack = new Set<string>();
  const cycles: string[][] = [];
  let nextIndex = 0;

  const visit = (node: string) => {
    indexByNode.set(node, nextIndex);
    lowLinkByNode.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    nodesOnStack.add(node);

    for (const target of graph.get(node) ?? []) {
      if (!indexByNode.has(target)) {
        visit(target);
        lowLinkByNode.set(
          node,
          Math.min(lowLinkByNode.get(node)!, lowLinkByNode.get(target)!),
        );
      } else if (nodesOnStack.has(target)) {
        lowLinkByNode.set(
          node,
          Math.min(lowLinkByNode.get(node)!, indexByNode.get(target)!),
        );
      }
    }

    if (lowLinkByNode.get(node) !== indexByNode.get(node)) {
      return;
    }

    const component: string[] = [];
    let member: string;

    do {
      member = stack.pop()!;
      nodesOnStack.delete(member);
      component.push(member);
    } while (member !== node);

    if (
      component.length > 1 ||
      (graph.get(node) ?? []).includes(node)
    ) {
      cycles.push(component.sort());
    }
  };

  for (const node of graph.keys()) {
    if (!indexByNode.has(node)) {
      visit(node);
    }
  }

  return cycles.sort(([left], [right]) => left.localeCompare(right));
}

export function listSourceDependencyCycles() {
  const graph = new Map(
    Object.keys(sourceModules).map((filePath) => [
      filePath,
      readSourceImports(filePath).flatMap(({ targetPath }) => {
        const targetFilePath = resolveSourceFilePath(targetPath);

        return targetFilePath ? [targetFilePath] : [];
      }),
    ]),
  );

  return findDependencyCycles(graph).map((cycle) =>
    cycle.map(sourcePathToRelative),
  );
}
