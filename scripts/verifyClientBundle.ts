import { readFileSync, statSync } from "node:fs";

type ManifestChunk = {
  file: string;
  imports?: string[];
  isDynamicEntry?: boolean;
  isEntry?: boolean;
};

type ClientManifest = Record<string, ManifestChunk>;

const manifestUrl = new URL("../dist/.vite/manifest.json", import.meta.url);
const manifest = JSON.parse(
  readFileSync(manifestUrl, "utf8"),
) as ClientManifest;
const manifestEntries = Object.entries(manifest);
const clientEntry = manifestEntries.find(([, chunk]) => chunk.isEntry);

if (!clientEntry) {
  throw new Error("Client bundle manifest has no entry chunk.");
}

const controllerSources = [
  "NotesActivityController.tsx",
  "SettingsActivityController.tsx",
  "StructureOperationActivityController.tsx",
  "SyntaxActivityController.tsx",
  "VisualizationActivityController.tsx",
];

const controllerEntries = controllerSources.map((sourceName) => {
  const entry = manifestEntries.find(([sourcePath]) =>
    sourcePath.endsWith(`/app/activities/${sourceName}`),
  );

  if (!entry || !entry[1].isDynamicEntry) {
    throw new Error(`${sourceName} is not a dynamic client entry.`);
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

  for (const importedPath of manifest[sourcePath]?.imports ?? []) {
    collectStaticImports(importedPath, collected);
  }

  return collected;
}

function getBundleFileUrl(file: string) {
  return new URL(`../dist/${file}`, import.meta.url);
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
