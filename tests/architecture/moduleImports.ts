import ts from "typescript";

export type SourceModules = Readonly<Record<string, string>>;

function getScriptKind(filePath: string) {
  if (/\.[cm]?js$/.test(filePath)) return ts.ScriptKind.JS;
  return filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

export function readModuleImports(
  modules: SourceModules,
  filePath: string,
): readonly string[] {
  if (!(filePath in modules)) throw new Error(`Source file is missing: ${filePath}`);
  const sourceFile = ts.createSourceFile(
    filePath,
    modules[filePath]!,
    ts.ScriptTarget.Latest,
    false,
    getScriptKind(filePath),
  );
  const diagnostics = (sourceFile as ts.SourceFile & {
    parseDiagnostics: readonly ts.Diagnostic[];
  }).parseDiagnostics;
  if (diagnostics.length > 0) {
    throw new Error(`Cannot parse ${filePath}: ${diagnostics.map(diagnostic =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
    ).join("; ")}`);
  }
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
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const argument = node.arguments[0];
      if (!argument || !ts.isStringLiteralLike(argument)) {
        throw new Error(`Dynamic import must use a literal path: ${filePath}`);
      }
      imports.push(argument.text);
    } else if (ts.isImportTypeNode(node)) {
      if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteralLike(node.argument.literal)) {
        throw new Error(`Type import must use a literal path: ${filePath}`);
      }
      imports.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports;
}
