// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import path from "node:path";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import type {
  RepositorySyntaxCatalogDto,
  RepositoryTreeNodeDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";
import {
  repositorySyntaxIndexFileName,
  workspaceRepositorySchemaVersion,
} from "../../../../contracts/workspace/types.ts";
import { hasFileSystemErrorCode } from "../../persistence/fileSystemError.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "../../repository/store.ts";
import { validateWorkspaceRepositorySyntax } from "../../repository/workspace/contentValidation.ts";
import { createWorkspaceRepositoryRevision } from "../../repository/workspace/revision.ts";
import {
  createCanonicalSourceFromLocalNoteMetadata,
  equalLocalNoteMetadataProjection,
  projectCanonicalNoteSource,
  reconcileEditableNoteSource,
} from "./localCanonicalProjection.ts";
import {
  localControlDirectoryName,
  localIndexFileName,
  localLayoutVersion,
  localNoteMetadataDirectoryName,
  localRepositoryMetadataFileName,
  localSyntaxDirectoryName,
  type LocalFolderIndexEntry,
  type LocalIndexEntry,
  type LocalManagedFileSet,
  type LocalNoteIndexEntry,
  type LocalNoteMetadata,
  type LocalRepositoryIndex,
  type LocalRepositoryMetadata,
  type LocalWorkingTreeProjection,
} from "./localWorkingTreeLayout.ts";
import {
  isLocalWorkingTreeUnstableError,
  matchLocalPhysicalIdentities,
  readStableLocalFile,
  scanPhysicalWorkingTree,
  type LocalPhysicalEntry,
} from "./localPhysicalWorkingTree.ts";
import {
  assertLocalProjectedPath,
  validateLocalEntryName,
  validateLocalNoteTitle,
} from "./localWorkingTreePath.ts";

function titleFromEditableSource(source: string) {
  return source.split("\n", 1)[0] ?? "";
}

function sourceHash(source: string) {
  return createHash("sha256").update(source).digest("hex");
}

function jsonSource(value: unknown) {
  return `${serializeJsonIteratively(value, { indent: 2 })}\n`;
}

function noteTitleFromPath(relativePath: string) {
  return path.posix.basename(relativePath, ".ctn");
}

function parentPathOf(relativePath: string) {
  const parent = path.posix.dirname(relativePath);

  return parent === "." ? "" : parent;
}

function withFirstLine(source: string, title: string) {
  const lines = source.split("\n");

  lines[0] = title;
  return lines.join("\n");
}

export async function createLocalProjectionFromWorkingTree({
  createBlockId,
  createFolderId,
  createNoteId,
  index: previousIndex,
  metadata,
  readNoteMetadata,
  rootDir,
  syntax,
  timestamp,
}: {
  createBlockId: () => string;
  createFolderId: () => string;
  createNoteId: () => string;
  index: LocalRepositoryIndex;
  metadata: LocalRepositoryMetadata;
  readNoteMetadata: (noteId: string) => Promise<LocalNoteMetadata | null>;
  rootDir: string;
  syntax: RepositorySyntaxCatalogDto;
  timestamp: string;
}): Promise<LocalWorkingTreeProjection> {
  const { activeSource: syntaxSource } =
    validateWorkspaceRepositorySyntax(syntax);
  const physical = await scanPhysicalWorkingTree(rootDir);
  const { byPreviousIdentity, unmatched } = matchLocalPhysicalIdentities(
    previousIndex,
    physical,
  );
  const previousByPhysical = new Map<LocalPhysicalEntry, LocalIndexEntry>();

  previousIndex.entries.forEach((entry) => {
    const identity = entry.kind === "folder"
      ? `folder:${entry.folderId}`
      : `note:${entry.noteId}`;
    const matched = byPreviousIdentity.get(identity);

    if (matched) previousByPhysical.set(matched, entry);
  });
  const allPhysical = [...physical].sort((left, right) =>
    left.path.localeCompare(right.path, "en-US")
  );
  const sidecarByNoteId = new Map<string, LocalNoteMetadata>();
  const reservedBlockIds = new Set<string>();

  for (const entry of previousIndex.entries) {
    if (entry.kind !== "note") continue;
    const sidecar = await readNoteMetadata(entry.noteId);

    if (!sidecar) {
      throw new RepositoryCorruptError(
        `Tracked Local note ${entry.noteId} is missing its metadata sidecar`,
      );
    }
    const verified = projectCanonicalNoteSource(
      entry.noteId,
      createCanonicalSourceFromLocalNoteMetadata(sidecar),
      syntaxSource,
    );

    if (!equalLocalNoteMetadataProjection(verified, sidecar)) {
      throw new RepositoryCorruptError(
        `Tracked Local note ${entry.noteId} has invalid metadata anchors`,
      );
    }
    sidecar.blocks.forEach((block) => reservedBlockIds.add(block.id));
    sidecarByNoteId.set(entry.noteId, sidecar);
  }
  const previousFolderIdByPath = new Map(
    previousIndex.entries
      .filter(
        (entry): entry is LocalFolderIndexEntry => entry.kind === "folder",
      )
      .map((entry) => [entry.path, entry.folderId]),
  );
  const currentFolderIdByPath = new Map<string, string>();

  for (const current of allPhysical) {
    if (current.kind !== "folder") continue;
    const previous = previousByPhysical.get(current);

    currentFolderIdByPath.set(
      current.path,
      previous?.kind === "folder" ? previous.folderId : createFolderId(),
    );
  }
  const canKeepOrder = (
    previous: LocalIndexEntry | undefined,
    currentPath: string,
  ) => {
    if (!previous) return false;
    const previousParentPath = parentPathOf(previous.path);
    const currentParentPath = parentPathOf(currentPath);
    const previousParentId = previousParentPath === ""
      ? null
      : previousFolderIdByPath.get(previousParentPath) ?? null;
    const currentParentId = currentParentPath === ""
      ? null
      : currentFolderIdByPath.get(currentParentPath) ?? null;

    return previousParentId === currentParentId;
  };
  const resolvedEntries: Array<{
    canonicalSource?: string;
    entry: LocalIndexEntry;
    physical: LocalPhysicalEntry;
    sidecar?: LocalNoteMetadata;
  }> = [];

  for (const current of allPhysical) {
    const previous = previousByPhysical.get(current);

    if (current.kind === "folder") {
      const folderId = currentFolderIdByPath.get(current.path);

      if (!folderId) {
        throw new RepositoryCorruptError(
          "Local folder identity could not be assigned",
        );
      }
      resolvedEntries.push({
        entry: {
          device: current.device,
          folderId,
          inode: current.inode,
          kind: "folder",
          order: canKeepOrder(previous, current.path)
            ? previous?.order ?? Number.MAX_SAFE_INTEGER
            : Number.MAX_SAFE_INTEGER,
          path: current.path,
          subtreeHash: current.subtreeHash ?? sourceHash(""),
        },
        physical: current,
      });
      continue;
    }
    const noteId = previous?.kind === "note"
      ? previous.noteId
      : createNoteId();
    const previousSidecar = sidecarByNoteId.get(noteId) ?? null;
    const diskSource = current.source ?? "";
    const previousTitle = previousSidecar
      ? titleFromEditableSource(previousSidecar.editableSource)
      : null;
    const fileTitle = noteTitleFromPath(current.path);
    const diskTitle = titleFromEditableSource(diskSource);
    let editableSource = diskSource;
    let effectivePath = current.path;

    validateLocalNoteTitle(fileTitle, "Local note file name");
    if (fileTitle !== diskTitle) {
      if (previousTitle === null) {
        throw new RepositoryCorruptError(
          "New Local note file name must match its title",
        );
      }
      const fileRenamed = fileTitle !== previousTitle;
      const titleChanged = diskTitle !== previousTitle;

      if (fileRenamed && !titleChanged) {
        editableSource = withFirstLine(diskSource, fileTitle);
      } else if (!fileRenamed && titleChanged) {
        validateLocalNoteTitle(diskTitle, "Local note title");
        effectivePath = parentPathOf(current.path)
          ? `${parentPathOf(current.path)}/${diskTitle}.ctn`
          : `${diskTitle}.ctn`;
      } else {
        throw new RepositoryCorruptError(
          "Local note file name and title changed independently",
        );
      }
    }
    validateLocalNoteTitle(
      titleFromEditableSource(editableSource),
      "Local note title",
    );
    assertLocalProjectedPath(effectivePath, "Local note path", rootDir);
    const sidecar = reconcileEditableNoteSource({
      createId: createBlockId,
      editableSource,
      noteId,
      previous: previousSidecar,
      reservedIds: reservedBlockIds,
      syntaxSource,
      timestamp,
    });

    resolvedEntries.push({
      canonicalSource: createCanonicalSourceFromLocalNoteMetadata(sidecar),
      entry: {
        device: current.device,
        inode: current.inode,
        kind: "note",
        noteId,
        order: canKeepOrder(previous, effectivePath)
          ? previous?.order ?? Number.MAX_SAFE_INTEGER
          : Number.MAX_SAFE_INTEGER,
        path: effectivePath,
        sourceHash: sourceHash(editableSource),
      },
      physical: { ...current, path: effectivePath, source: editableSource },
      sidecar,
    });
  }
  void unmatched;
  const collisionByParent = new Map<string, Set<string>>();

  for (const resolved of resolvedEntries) {
    const parent = parentPathOf(resolved.entry.path);
    const name = resolved.entry.kind === "folder"
      ? path.posix.basename(resolved.entry.path)
      : noteTitleFromPath(resolved.entry.path);

    if (resolved.entry.kind === "note") {
      validateLocalNoteTitle(name, "Local working tree name");
    } else {
      validateLocalEntryName(name, "Local working tree name");
    }
    const siblings = collisionByParent.get(parent) ?? new Set<string>();
    const key = name.toLocaleLowerCase("en-US");

    if (siblings.has(key)) {
      throw new RepositoryCorruptError(
        "Local working tree contains duplicate sibling names",
      );
    }
    siblings.add(key);
    collisionByParent.set(parent, siblings);
  }
  const resolvedByParent = new Map<string, typeof resolvedEntries>();

  for (const resolved of resolvedEntries) {
    const parent = parentPathOf(resolved.entry.path);
    const children = resolvedByParent.get(parent) ?? [];

    children.push(resolved);
    resolvedByParent.set(parent, children);
  }
  for (const children of resolvedByParent.values()) {
    children.sort((left, right) => {
      const leftExisting = left.entry.order !== Number.MAX_SAFE_INTEGER;
      const rightExisting = right.entry.order !== Number.MAX_SAFE_INTEGER;

      if (leftExisting && rightExisting) {
        return left.entry.order - right.entry.order;
      }
      if (leftExisting !== rightExisting) return leftExisting ? -1 : 1;
      return left.entry.path.localeCompare(right.entry.path, "en-US");
    });
    children.forEach((child, order) => {
      child.entry.order = order;
    });
  }
  const tree: RepositoryTreeNodeDto[] = [];
  const pendingParents: Array<{
    destination: RepositoryTreeNodeDto[];
    parentPath: string;
  }> = [{ destination: tree, parentPath: "" }];

  while (pendingParents.length > 0) {
    const current = pendingParents.pop();

    if (!current) break;
    const children = resolvedByParent.get(current.parentPath) ?? [];

    for (const child of children) {
      if (child.entry.kind === "note") {
        current.destination.push({
          kind: "note",
          noteId: child.entry.noteId,
        });
      } else {
        const nested: RepositoryTreeNodeDto[] = [];

        current.destination.push({
          children: nested,
          folderId: child.entry.folderId,
          kind: "folder",
          title: path.posix.basename(child.entry.path),
        });
        pendingParents.push({
          destination: nested,
          parentPath: child.entry.path,
        });
      }
    }
  }
  const notes = resolvedEntries
    .filter((entry): entry is typeof entry & {
      canonicalSource: string;
      entry: LocalNoteIndexEntry;
      sidecar: LocalNoteMetadata;
    } =>
      entry.entry.kind === "note" &&
      entry.canonicalSource !== undefined &&
      entry.sidecar !== undefined)
    .map((entry) => ({
      id: entry.entry.noteId,
      source: entry.canonicalSource,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const content: WorkspaceRepositoryContentDto = {
    schemaVersion: workspaceRepositorySchemaVersion,
    syntax,
    workspace: {
      id: metadata.workspace.id,
      name: metadata.workspace.name,
      notes,
      tree,
    },
  };
  const revision = createWorkspaceRepositoryRevision(content);
  const index: LocalRepositoryIndex = {
    entries: resolvedEntries.map((entry) => entry.entry),
    layoutVersion: localLayoutVersion,
  };
  const nextMetadata: LocalRepositoryMetadata = {
    ...metadata,
    currentRevision: revision,
  };
  const files: LocalManagedFileSet = new Map();

  for (const resolved of resolvedEntries) {
    if (resolved.entry.kind === "note" && resolved.sidecar) {
      files.set(resolved.entry.path, resolved.sidecar.editableSource);
      files.set(
        `${localControlDirectoryName}/${localNoteMetadataDirectoryName}/${resolved.entry.noteId}.json`,
        jsonSource(resolved.sidecar),
      );
    }
  }
  files.set(
    `${localControlDirectoryName}/${localSyntaxDirectoryName}/${repositorySyntaxIndexFileName}`,
    jsonSource({
      activeFileId: syntax.activeFileId,
      files: syntax.files.map((file) => file.id),
    }),
  );
  for (const file of syntax.files) {
    files.set(
      `${localControlDirectoryName}/${localSyntaxDirectoryName}/${file.id}.toml`,
      file.source,
    );
  }
  files.set(
    `${localControlDirectoryName}/${localIndexFileName}`,
    jsonSource(index),
  );
  files.set(
    `${localControlDirectoryName}/${localRepositoryMetadataFileName}`,
    jsonSource(nextMetadata),
  );
  return { content, files, index, metadata: nextMetadata, revision };
}

export async function readLocalJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readLocalControlText(filePath));
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) throw error;
    throw new RepositoryCorruptError("Local repository JSON is invalid");
  }
}

export async function readLocalControlText(filePath: string) {
  try {
    return (await readStableLocalFile(filePath)).source;
  } catch (error) {
    if (isLocalWorkingTreeUnstableError(error)) {
      throw new RepositoryAdapterError(
        "repository_busy",
        "Local repository control file changed while it was being read",
      );
    }
    throw error;
  }
}
