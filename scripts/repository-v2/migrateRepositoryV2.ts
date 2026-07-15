import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { repositorySyntaxFileName } from "../../contracts/workspace-repository/types.ts";
import { inferRepositoryNoteTitle } from "../../contracts/workspace-repository/noteSource.ts";
import { WorkspaceFileStore } from "../../server/workspaceFileStore.ts";
import {
  workspaceManifestSchemaVersion,
  type WorkspaceManifest,
} from "../../server/workspaceManifest.ts";
import { ctnBlockMetadataDirective } from "../../src/ctn/metadata/blockMetadata";
import { parseWorkspaceSyntax } from "../../src/workspace/context/workspaceSyntax";
import {
  initializeWorkspaceBlockMetadata,
  validateWorkspaceBlockMetadata,
} from "../../src/workspace/context/workspaceBlockMetadata";
import type { WorkspaceData } from "../../src/workspace/model/workspaceData";
import {
  parseLegacyWorkspaceManifest,
  type LegacyWorkspaceManifest,
} from "./legacyManifest.ts";

const manifestFileName = "workspace.json";
const notesDirectoryName = "notes";
const syntaxDirectoryName = "syntax";

export type RepositoryV2MigrationResult = {
  backupPath: string;
  noteCount: number;
  repositoryPath: string;
};

export type RepositoryV2MigrationOptions = {
  createBlockId?: () => string;
  now?: () => Date;
};

async function pathExists(filePath: string) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }

    throw error;
  }
}

async function assertDirectory(filePath: string) {
  const stats = await lstat(filePath);

  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Repository path must be a real directory: ${filePath}`);
  }
}

async function fingerprintDirectory(rootDir: string) {
  const hash = createHash("sha256");

  const visit = async (directory: string, relativeDirectory: string) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        throw new Error(`Repository migration does not follow symbolic links: ${relativePath}`);
      }

      if (entry.isDirectory()) {
        hash.update(`D\0${relativePath}\0`);
        await visit(absolutePath, relativePath);
        continue;
      }

      if (!entry.isFile()) {
        throw new Error(`Unsupported repository entry: ${relativePath}`);
      }

      hash.update(`F\0${relativePath}\0`);
      hash.update(await readFile(absolutePath));
      hash.update("\0");
    }
  };

  await visit(rootDir, "");
  return hash.digest("hex");
}

function formatBackupTimestamp(date: Date) {
  return date.toISOString().replace(/[-:.]/g, "");
}

async function createAvailableBackupPath(rootDir: string, date: Date) {
  const basePath = `${rootDir}.backup-v1-${formatBackupTimestamp(date)}`;
  let candidate = basePath;
  let suffix = 2;

  while (await pathExists(candidate)) {
    candidate = `${basePath}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function readLegacyManifest(rootDir: string) {
  const source = await readFile(path.join(rootDir, manifestFileName), "utf8");
  return parseLegacyWorkspaceManifest(JSON.parse(source));
}

async function readOptionalSyntaxSource(rootDir: string) {
  try {
    return await readFile(
      path.join(rootDir, syntaxDirectoryName, repositorySyntaxFileName),
      "utf8",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function readLegacyWorkspace(
  rootDir: string,
  manifest: LegacyWorkspaceManifest,
): Promise<WorkspaceData> {
  const notes = [];

  for (const note of manifest.notes) {
    const sourcePath = path.join(
      rootDir,
      notesDirectoryName,
      ...note.fileName.split("/"),
    );
    const stats = await lstat(sourcePath);

    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Legacy note source must be a real file: ${note.fileName}`);
    }

    const source = await readFile(sourcePath, "utf8");

    if (source.trimStart().startsWith(ctnBlockMetadataDirective)) {
      throw new Error(`Legacy note already contains v2 block metadata: ${note.id}`);
    }

    if (inferRepositoryNoteTitle(source) !== note.title) {
      throw new Error(`Legacy note title does not match source: ${note.id}`);
    }

    notes.push({
      createdAt: note.createdAt,
      id: note.id,
      source,
      title: note.title,
      updatedAt: note.updatedAt,
    });
  }

  return {
    id: manifest.id,
    name: manifest.name,
    notes,
    tree: manifest.tree,
  };
}

async function writeStagingRepository({
  createBlockId,
  sourceRoot,
  stagingRoot,
}: {
  createBlockId?: () => string;
  sourceRoot: string;
  stagingRoot: string;
}) {
  const manifest = await readLegacyManifest(sourceRoot);
  const syntaxSource = await readOptionalSyntaxSource(sourceRoot);
  const legacyWorkspace = await readLegacyWorkspace(sourceRoot, manifest);
  const syntax = syntaxSource === null ? null : parseWorkspaceSyntax(syntaxSource);
  const workspace = syntax
    ? initializeWorkspaceBlockMetadata(
        legacyWorkspace,
        syntax.profile,
        { createId: createBlockId },
      )
    : legacyWorkspace;
  const v2Manifest: WorkspaceManifest = {
    id: workspace.id,
    name: workspace.name,
    notes: workspace.notes.map((note) => ({
      createdAt: note.createdAt,
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
    })),
    schemaVersion: workspaceManifestSchemaVersion,
    tree: workspace.tree,
  };

  await mkdir(path.join(stagingRoot, notesDirectoryName), { recursive: true });
  await mkdir(path.join(stagingRoot, syntaxDirectoryName), { recursive: true });
  await writeFile(
    path.join(stagingRoot, manifestFileName),
    `${JSON.stringify(v2Manifest, null, 2)}\n`,
    "utf8",
  );

  for (const note of workspace.notes) {
    await writeFile(
      path.join(stagingRoot, notesDirectoryName, `${note.id}.ctn`),
      note.source,
      "utf8",
    );
  }

  if (syntaxSource !== null) {
    await writeFile(
      path.join(stagingRoot, syntaxDirectoryName, repositorySyntaxFileName),
      syntaxSource,
      "utf8",
    );
  }

  return { syntax, workspace };
}

async function validateStagingRepository({
  stagingRoot,
  syntax,
  workspace,
}: {
  stagingRoot: string;
  syntax: ReturnType<typeof parseWorkspaceSyntax> | null;
  workspace: WorkspaceData;
}) {
  const snapshot = await new WorkspaceFileStore(stagingRoot).loadSnapshot();

  if (
    snapshot.workspace.id !== workspace.id ||
    snapshot.workspace.notes.length !== workspace.notes.length
  ) {
    throw new Error("Repository v2 staging validation returned different workspace data.");
  }

  if (syntax) {
    validateWorkspaceBlockMetadata(snapshot.workspace, syntax.profile);
  }
}

async function switchRepositoryDirectories(
  repositoryPath: string,
  stagingPath: string,
) {
  const previousPath = path.join(
    path.dirname(repositoryPath),
    `.${path.basename(repositoryPath)}.pre-v2-${randomUUID()}`,
  );

  await rename(repositoryPath, previousPath);

  try {
    await rename(stagingPath, repositoryPath);
  } catch (error) {
    await rename(previousPath, repositoryPath);
    throw error;
  }

  await rm(previousPath, { recursive: true });
}

export async function migrateRepositoryV2(
  repositoryPath: string,
  {
    createBlockId,
    now = () => new Date(),
  }: RepositoryV2MigrationOptions = {},
): Promise<RepositoryV2MigrationResult> {
  const rootDir = path.resolve(repositoryPath);

  await assertDirectory(rootDir);

  const sourceFingerprint = await fingerprintDirectory(rootDir);
  const backupPath = await createAvailableBackupPath(rootDir, now());

  await cp(rootDir, backupPath, {
    errorOnExist: true,
    force: false,
    recursive: true,
  });

  if (await fingerprintDirectory(backupPath) !== sourceFingerprint) {
    throw new Error("Repository backup verification failed.");
  }

  const stagingPath = await mkdtemp(
    path.join(path.dirname(rootDir), `.${path.basename(rootDir)}.v2-`),
  );

  try {
    const staged = await writeStagingRepository({
      createBlockId,
      sourceRoot: backupPath,
      stagingRoot: stagingPath,
    });

    await validateStagingRepository({ stagingRoot: stagingPath, ...staged });

    if (await fingerprintDirectory(rootDir) !== sourceFingerprint) {
      throw new Error("Repository changed while migration was running.");
    }

    await switchRepositoryDirectories(rootDir, stagingPath);

    return {
      backupPath,
      noteCount: staged.workspace.notes.length,
      repositoryPath: rootDir,
    };
  } catch (error) {
    await rm(stagingPath, { force: true, recursive: true });
    throw error;
  }
}
