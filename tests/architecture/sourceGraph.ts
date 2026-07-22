import ts from "typescript";

export type SourceModules = Record<string, string>;

export type SourceImport = {
  filePath: string;
  importPath: string;
  targetPath: string;
  targetRoot: string;
};

export type InternalModuleImport = Omit<SourceImport, "targetRoot">;

export const applicationModules = import.meta.glob("../../application/**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

export const contractModules = import.meta.glob("../../contracts/**/*.ts", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

export const coreModules = import.meta.glob("../../core/**/*.ts", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

export const infrastructureModules = import.meta.glob(
  "../../infrastructure/**/*.ts",
  { eager: true, import: "default", query: "?raw" },
) as SourceModules;

export const presentationModules = import.meta.glob(
  "../../presentation/**/*.{ts,tsx}",
  { eager: true, import: "default", query: "?raw" },
) as SourceModules;

export const sourceModules = {
  ...applicationModules,
  ...infrastructureModules,
  ...presentationModules,
};

export const serverModules = Object.fromEntries(
  Object.entries(infrastructureModules).filter(([filePath]) =>
    filePath.startsWith("../../infrastructure/server/"),
  ),
);

export const workspaceModules = {
  ...applicationModules,
  ...contractModules,
  ...coreModules,
  ...infrastructureModules,
  ...presentationModules,
};

function selectCoreModules(domain: string) {
  const prefix = `../../core/${domain}/`;

  return Object.fromEntries(
    Object.entries(coreModules).filter(([filePath]) =>
      filePath.startsWith(prefix),
    ),
  );
}

export const ctnModules = selectCoreModules("ctn");
export const journalModules = selectCoreModules("journal");
export const portableNameModules = selectCoreModules("naming");
export const todoModules = selectCoreModules("todo");
export const workspaceDomainModules = selectCoreModules("workspace");

export function modulePathToRelative(filePath: string, prefix: string) {
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

export function ctnPathToRelative(filePath: string) {
  return modulePathToRelative(filePath, "../../core/ctn/");
}

export function journalPathToRelative(filePath: string) {
  return modulePathToRelative(filePath, "../../core/journal/");
}

export function portableNamePathToRelative(filePath: string) {
  return modulePathToRelative(filePath, "../../core/naming/");
}

export function todoPathToRelative(filePath: string) {
  return modulePathToRelative(filePath, "../../core/todo/");
}

export function sourcePathToRelative(filePath: string) {
  return modulePathToRelative(filePath, "../../");
}

export function getSourceRoot(filePath: string) {
  return sourcePathToRelative(filePath).split("/")[0] ?? "";
}

export function listSourceFiles(directory: string) {
  const prefix = `../../${directory}/`;

  return Object.keys(sourceModules)
    .filter((filePath) => filePath.startsWith(prefix))
    .sort();
}

function getScriptKind(filePath: string) {
  return filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

export function readModuleImports(
  modules: SourceModules,
  filePath: string,
): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    modules[filePath] ?? "",
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
  return segments.reduce<string[]>((normalized, segment) => {
    if (!segment || segment === ".") return normalized;
    if (segment === "..") {
      return normalized.at(-1) && normalized.at(-1) !== ".."
        ? normalized.slice(0, -1)
        : [...normalized, segment];
    }
    return [...normalized, segment];
  }, []);
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
  rootPrefix = "../../",
): InternalModuleImport[] {
  return readModuleImports(modules, filePath).flatMap((importPath) => {
    if (!importPath.startsWith(".")) return [];
    const unresolved = normalizePath([
      ...filePath.split("/").slice(0, -1),
      ...importPath.split("/"),
    ]).join("/");
    const targetPath = resolveModuleFilePath(modules, unresolved);

    return targetPath?.startsWith(rootPrefix)
      ? [{ filePath, importPath, targetPath }]
      : [];
  });
}

export function readSourceImports(filePath: string): SourceImport[] {
  return readInternalModuleImports(workspaceModules, filePath).map((entry) => ({
    ...entry,
    targetRoot: getSourceRoot(entry.targetPath),
  }));
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
    lowLinkByNode.set(node, nextIndex++);
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
    if (lowLinkByNode.get(node) !== indexByNode.get(node)) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      nodesOnStack.delete(member);
      component.push(member);
    } while (member !== node);
    if (component.length > 1 || (graph.get(node) ?? []).includes(node)) {
      cycles.push(component.sort());
    }
  };

  for (const node of graph.keys()) if (!indexByNode.has(node)) visit(node);
  return cycles.sort(([left], [right]) => left.localeCompare(right));
}

export function listSourceDependencyCycles() {
  const graph = new Map(
    Object.keys(sourceModules).map((filePath) => [
      filePath,
      readSourceImports(filePath).map(({ targetPath }) => targetPath),
    ]),
  );

  return findDependencyCycles(graph).map((cycle) =>
    cycle.map(sourcePathToRelative),
  );
}
