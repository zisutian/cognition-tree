import {
  readModuleImports,
  type SourceModules,
} from "./moduleImports";

export type SourceRoot =
  | "core"
  | "contracts"
  | "application"
  | "infrastructure"
  | "presentation";

export type SourceImport = Readonly<{
  filePath: string;
  importPath: string;
  targetPath: string;
  targetRoot: SourceRoot;
}>;

export type InternalModuleImport = Readonly<
  Omit<SourceImport, "targetRoot">
>;

export const coreModules = import.meta.glob("../../core/**/*.ts", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

export const contractModules = import.meta.glob("../../contracts/**/*.ts", {
  eager: true,
  import: "default",
  query: "?raw",
}) as SourceModules;

export const applicationModules = import.meta.glob(
  "../../application/**/*.{ts,tsx}",
  { eager: true, import: "default", query: "?raw" },
) as SourceModules;

export const infrastructureModules = import.meta.glob(
  "../../infrastructure/**/*.ts",
  { eager: true, import: "default", query: "?raw" },
) as SourceModules;

export const presentationModules = import.meta.glob(
  "../../presentation/**/*.{ts,tsx}",
  { eager: true, import: "default", query: "?raw" },
) as SourceModules;

export const sourceModulesByRoot: Readonly<
  Record<SourceRoot, SourceModules>
> = Object.freeze({
  core: coreModules,
  contracts: contractModules,
  application: applicationModules,
  infrastructure: infrastructureModules,
  presentation: presentationModules,
});

export const sourceModules: SourceModules = Object.freeze(
  Object.assign({}, ...Object.values(sourceModulesByRoot)),
);

export function modulePathToRelative(filePath: string, prefix: string) {
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

export function sourcePathToRelative(filePath: string) {
  return modulePathToRelative(filePath, "../../");
}

export function getSourceRoot(filePath: string): SourceRoot {
  const root = sourcePathToRelative(filePath).split("/")[0];

  if (!(root && root in sourceModulesByRoot)) {
    throw new Error(`Unknown source root for ${filePath}`);
  }
  return root as SourceRoot;
}

export function listSourceFiles(directory: string) {
  const prefix = `../../${directory}/`;

  return Object.keys(sourceModules)
    .filter((filePath) => filePath.startsWith(prefix))
    .sort();
}

export function selectSourceModules(directory: string) {
  const selected = new Set(listSourceFiles(directory));

  return Object.fromEntries(
    Object.entries(sourceModules).filter(([filePath]) =>
      selected.has(filePath)
    ),
  );
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

function resolveInternalModuleImports(
  modules: SourceModules,
  filePath: string,
  importPaths: readonly string[],
  rootPrefix: string,
): InternalModuleImport[] {
  return importPaths.flatMap((importPath) => {
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

export function readInternalModuleImports(
  modules: SourceModules,
  filePath: string,
  rootPrefix = "../../",
): readonly InternalModuleImport[] {
  const indexedImportPaths = modules === sourceModules
    ? sourceImportIndex[filePath]?.importPaths
    : undefined;

  return resolveInternalModuleImports(
    modules,
    filePath,
    indexedImportPaths ?? readModuleImports(modules, filePath),
    rootPrefix,
  );
}

type SourceImportIndexEntry = Readonly<{
  importPaths: readonly string[];
  sourceImports: readonly SourceImport[];
}>;

const sourceModulePaths = Object.freeze(Object.keys(sourceModules));
const sourceImportIndex: Readonly<Record<string, SourceImportIndexEntry>> =
  Object.freeze(Object.fromEntries(sourceModulePaths.map((filePath) => {
    const importPaths = Object.freeze(
      readModuleImports(sourceModules, filePath),
    );
    const sourceImports = Object.freeze(
      resolveInternalModuleImports(
        sourceModules,
        filePath,
        importPaths,
        "../../",
      ).map((entry) => Object.freeze({
        ...entry,
        targetRoot: getSourceRoot(entry.targetPath),
      })),
    );

    return [
      filePath,
      Object.freeze({ importPaths, sourceImports }),
    ];
  })));

export const sourceImportCorpus: SourceModules = Object.freeze(
  Object.fromEntries(sourceModulePaths.map((filePath) => [
    filePath,
    sourceImportIndex[filePath]?.importPaths.join("\n") ?? "",
  ])),
);

function copySourceImport(sourceImport: Readonly<SourceImport>): SourceImport {
  return { ...sourceImport };
}

export function readSourceImports(filePath: string): readonly SourceImport[] {
  return (sourceImportIndex[filePath]?.sourceImports ?? []).map(
    copySourceImport,
  );
}

export function listSourceImports(): readonly SourceImport[] {
  return sourceModulePaths.flatMap((filePath) =>
    (sourceImportIndex[filePath]?.sourceImports ?? []).map(copySourceImport)
  );
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
    sourceModulePaths.map((filePath) => [
      filePath,
      (sourceImportIndex[filePath]?.sourceImports ?? []).map(
        ({ targetPath }) => targetPath,
      ),
    ]),
  );

  return findDependencyCycles(graph).map((cycle) =>
    cycle.map(sourcePathToRelative)
  );
}
