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

const sourceRoots: ReadonlySet<string> = new Set<string>([
  "application",
  "contracts",
  "core",
  "infrastructure",
  "presentation",
]);

export function modulePathToRelative(filePath: string, prefix: string) {
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

export function sourcePathToRelative(filePath: string) {
  return modulePathToRelative(filePath, "../../");
}

export function getSourceRoot(filePath: string): SourceRoot {
  const root = sourcePathToRelative(filePath).split("/")[0];

  if (!(root && sourceRoots.has(root))) {
    throw new Error(`Unknown source root for ${filePath}`);
  }
  return root as SourceRoot;
}
