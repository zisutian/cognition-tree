import ts from "typescript";

export type SourceModules = Record<string, string>;

export type SourceImport = {
  filePath: string;
  importPath: string;
  targetPath: string;
  targetRoot: string;
};

export const sourceModules = import.meta.glob("../../src/**/*.{ts,tsx}", {
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

export function sourcePathToRelative(filePath: string) {
  return filePath.replace("../../src/", "");
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
  return [
    ...new Set(
      Object.keys(sourceModules).flatMap((filePath) => {
        const relativePath = sourcePathToRelative(filePath);
        const separatorIndex = relativePath.indexOf("/");

        return separatorIndex === -1
          ? []
          : [relativePath.slice(0, separatorIndex)];
      }),
    ),
  ].sort();
}

export function listSourceRootFiles() {
  return Object.keys(sourceModules)
    .map(sourcePathToRelative)
    .filter((filePath) => !filePath.includes("/"))
    .sort();
}

export function listSubdirectories(directory: string) {
  const prefix = `../../src/${directory}/`;

  return [
    ...new Set(
      Object.keys(sourceModules).flatMap((filePath) => {
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
