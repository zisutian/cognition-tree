// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { existsSync, readFileSync, statSync } from "node:fs";

type ManifestChunk = {
  file: string;
  imports?: string[];
  isDynamicEntry?: boolean;
  isEntry?: boolean;
};

type ClientManifest = Record<string, ManifestChunk>;

const manifestUrl = new URL(
  "../../.artifacts/build/client/.vite/manifest.json",
  import.meta.url,
);
const manifest = JSON.parse(
  readFileSync(manifestUrl, "utf8"),
) as ClientManifest;
const manifestEntries = Object.entries(manifest);
const clientEntry = manifestEntries.find(([, chunk]) => chunk.isEntry);

if (!clientEntry) {
  throw new Error("Client bundle manifest has no entry chunk.");
}

const catalogUrl = new URL("../../presentation/shell/workbench/activityCatalog.tsx", import.meta.url);
const catalogPath = fileURLToPath(catalogUrl);
const catalog = ts.createSourceFile(catalogPath, readFileSync(catalogUrl, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const parseDiagnostics = (catalog as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
if (parseDiagnostics.length) throw new Error("Activity catalog cannot be parsed");
const controllerSources: string[] = [];
function resolveControllerEntry(specifier: string) {
  const base = path.resolve(path.dirname(catalogPath), specifier);
  const entry = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]
    .find(candidate => existsSync(candidate) && statSync(candidate).isFile());
  if (!entry) throw new Error(`Activity entry does not exist: ${specifier}`);
  return path.relative(fileURLToPath(new URL("../../", import.meta.url)), entry);
}
function visitCatalog(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const argument = node.arguments[0];
    if (!argument || !ts.isStringLiteralLike(argument)) throw new Error("Activity lazy import must declare a literal public entry");
    controllerSources.push(resolveControllerEntry(argument.text));
  }
  ts.forEachChild(node, visitCatalog);
}
visitCatalog(catalog);

if (controllerSources.length === 0) {
  throw new Error("Activity descriptor catalog declares no lazy controllers.");
}

const controllerEntries = controllerSources.map((sourcePath) => {
  const entry = manifestEntries.find(([manifestPath]) =>
    manifestPath === sourcePath
  );

  if (!entry || !entry[1].isDynamicEntry) {
    throw new Error(`${sourcePath} is not a dynamic client entry.`);
  }

  return entry;
});

function collectStaticImports(
  sourcePath: string,
  collected = new Set<string>(),
) {
  if (collected.has(sourcePath)) {
    return collected;
  }

  collected.add(sourcePath);

  if (!manifest[sourcePath]) throw new Error(`Missing manifest import: ${sourcePath}`);
  for (const importedPath of manifest[sourcePath].imports ?? []) {
    collectStaticImports(importedPath, collected);
  }

  return collected;
}

function getBundleFileUrl(file: string) {
  return new URL(`../../.artifacts/build/client/${file}`, import.meta.url);
}

const [clientEntryPath] = clientEntry;
const initialImports = collectStaticImports(clientEntryPath);
const bundledControllers = controllerEntries
  .filter(([sourcePath]) => initialImports.has(sourcePath))
  .map(([sourcePath]) => sourcePath);

if (bundledControllers.length > 0) {
  throw new Error(
    `Activity controllers entered the initial bundle: ${bundledControllers.join(", ")}`,
  );
}

const maxInitialChunkBytes = 500_000;
const oversizedInitialChunks = [...initialImports].flatMap((sourcePath) => {
  const file = manifest[sourcePath]?.file;

  if (!file?.endsWith(".js")) {
    return [];
  }

  const size = statSync(getBundleFileUrl(file)).size;

  return size > maxInitialChunkBytes ? [`${file} (${size} bytes)`] : [];
});

if (oversizedInitialChunks.length > 0) {
  throw new Error(
    `Initial client chunks exceed ${maxInitialChunkBytes} bytes: ${oversizedInitialChunks.join(", ")}`,
  );
}

const initialSize = [...initialImports].reduce((total, sourcePath) => {
  const file = manifest[sourcePath]?.file;

  return file?.endsWith(".js")
    ? total + statSync(getBundleFileUrl(file)).size
    : total;
}, 0);

process.stdout.write(
  `Verified ${controllerEntries.length} lazy activities; initial JS ${initialSize} bytes.\n`,
);
