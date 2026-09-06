// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import {
  parseWorkspaceRepositoryContent,
} from "../../../../../contracts/workspace/index.ts";
import type {
  WorkspaceRepositoryContentDto,
} from "../../../../../contracts/workspace/index.ts";
import { parsePortableName } from "../../../../../core/naming/index.ts";
import {
  fsyncDirectory,
  replaceFileDurably,
} from "../../../persistence/index.ts";
import { RepositoryAdapterError } from "../../store.ts";
import {
  createLocalProjectionFromContent,
} from "./localRepositoryProjection.ts";
import {
  prepareWorkspaceWriteContent,
} from "../preparation.ts";
import {
  localControlDirectoryName,
  localNoteMetadataDirectoryName,
  localRepositoryMetadataFileName,
  localTransactionsDirectoryName,
  type LocalWorkingTreeProjection,
} from "./localWorkingTreeLayout.ts";

async function ensureProjectionDirectories(
  rootDir: string,
  projection: LocalWorkingTreeProjection,
) {
  const folderPaths = projection.index.entries
    .filter((entry) => entry.kind === "folder")
    .map((entry) => entry.path)
    .sort((left, right) => left.split("/").length - right.split("/").length);

  for (const relativePath of folderPaths) {
    await mkdir(path.join(rootDir, ...relativePath.split("/")), {
      mode: 0o700,
      recursive: true,
    });
  }
}

async function writeInitialProjection(
  rootDir: string,
  projection: LocalWorkingTreeProjection,
) {
  await mkdir(path.join(rootDir, localControlDirectoryName), {
    mode: 0o700,
    recursive: true,
  });
  await mkdir(
    path.join(rootDir, localControlDirectoryName, localNoteMetadataDirectoryName),
    { mode: 0o700, recursive: true },
  );
  await mkdir(
    path.join(
      rootDir,
      localControlDirectoryName,
      localTransactionsDirectoryName,
    ),
    { mode: 0o700, recursive: true },
  );
  await ensureProjectionDirectories(rootDir, projection);
  const headPath =
    `${localControlDirectoryName}/${localRepositoryMetadataFileName}`;

  for (const [relativePath, source] of projection.files) {
    if (relativePath === headPath) continue;
    const filePath = path.join(rootDir, ...relativePath.split("/"));

    await mkdir(path.dirname(filePath), { mode: 0o700, recursive: true });
    await replaceFileDurably(filePath, source);
  }
  await replaceFileDurably(
    path.join(rootDir, ...headPath.split("/")),
    projection.files.get(headPath) ?? "",
  );
  await fsyncDirectory(path.join(rootDir, localControlDirectoryName));
  await fsyncDirectory(rootDir);
}

export async function provisionWorkspaceFileRepository({
  content: inputContent,
  label,
  repositoryId,
  rootDir: inputRootDir,
}: {
  content: WorkspaceRepositoryContentDto;
  label: string;
  repositoryId: string;
  rootDir: string;
}) {
  const rootDir = path.resolve(inputRootDir);
  const content = parseWorkspaceRepositoryContent(inputContent);
  const preparation = prepareWorkspaceWriteContent(content);
  const parsedLabel = parsePortableName(label, "Repository label");
  const projection = createLocalProjectionFromContent({
    content,
    label: parsedLabel,
    preparation,
    repositoryId,
    rootDir,
  });

  await mkdir(rootDir, { mode: 0o700, recursive: true });
  const existing = await readdir(rootDir);

  if (existing.length > 0) {
    throw new RepositoryAdapterError(
      "invalid_request",
      "Local repository target is not empty",
    );
  }
  await writeInitialProjection(rootDir, projection);
  return projection.revision;
}
