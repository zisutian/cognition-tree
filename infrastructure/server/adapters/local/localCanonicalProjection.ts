// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { createCtnBlockIdAllocator } from "../../../../core/ctn/metadata/blockIdAllocator.ts";
import { formatCtnBlockMetadataLine } from "../../../../core/ctn/metadata/blockMetadata.ts";
import { createCtnEditableSourceFromDocument } from "../../../../core/ctn/metadata/editableSource.ts";
import { createMyersTextEdits } from "../../../../core/ctn/metadata/myersTextEdits.ts";
import { reconcileCtnSourceBlockMetadata } from "../../../../core/ctn/metadata/reconcileSourceMetadata.ts";
import { initializeCtnSourceBlockMetadata } from "../../../../core/ctn/metadata/sourceMetadata.ts";
import {
  parseCtnCanonicalDocument,
  readCtnCanonicalTitleHeader,
} from "../../../../core/ctn/parser/parseCtnDocument.ts";
import { parseSyntaxProfileToml } from "../../../../core/ctn/syntax/profileToml.ts";
import type { CtnSyntaxProfile } from "../../../../core/ctn/syntax/types.ts";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import { WorkspaceRepositoryContractError } from "../../../../contracts/workspace/contractValue.ts";
import type {
  RepositoryTreeNodeDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";
import {
  repositorySyntaxIndexFileName,
  workspaceRepositorySchemaVersion,
} from "../../../../contracts/workspace/types.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "../../repository/repositoryStore.ts";
import { validateWorkspaceRepositorySyntax } from "../../repository/workspaceRepositoryContentValidation.ts";
import { createWorkspaceRepositoryRevision } from "../../repository/workspaceRepositoryRevision.ts";
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
  type LocalNoteMetadata,
  type LocalRepositoryIndex,
  type LocalRepositoryMetadata,
  type LocalWorkingTreeProjection,
} from "./localWorkingTreeLayout.ts";
import {
  assertLocalProjectedPath,
  validateLocalEntryName,
  validateLocalNoteTitle,
} from "./localWorkingTreePath.ts";

function resolveSyntaxProfile(
  syntaxSource: string | null,
): CtnSyntaxProfile | null {
  if (syntaxSource === null) return null;
  const result = parseSyntaxProfileToml(syntaxSource);

  if (!result.profile) {
    throw new RepositoryCorruptError(
      "Local workspace syntax profile is invalid",
    );
  }
  return result.profile;
}

export function projectCanonicalNoteSource(
  noteId: string,
  canonicalSource: string,
  syntaxSource: string | null,
): LocalNoteMetadata {
  try {
    const syntaxProfile = resolveSyntaxProfile(syntaxSource);

    if (syntaxProfile === null) {
      const header = readCtnCanonicalTitleHeader(canonicalSource);
      const editableSource = canonicalSource.split("\n").slice(1).join("\n");

      return {
        blocks: [{
          ...header.metadata,
          editableLineNumber: 1,
          fingerprint: editableSource.split("\n", 1)[0] ?? "",
        }],
        editableSource,
        noteId,
        schemaVersion: 1,
      };
    }
    const document = parseCtnCanonicalDocument(canonicalSource, syntaxProfile);
    const editable = createCtnEditableSourceFromDocument(
      canonicalSource,
      document,
    );

    return {
      blocks: document.blocks.map((block) => ({
        createdAt: block.metadata.createdAt,
        editableLineNumber:
          editable.editableLineNumberByCanonicalLineNumber.get(
            block.metadataLineNumber,
          ) ?? 1,
        fingerprint: block.contentFingerprint,
        id: block.id,
        indentText: block.indentText,
        updatedAt: block.metadata.updatedAt,
      })),
      editableSource: editable.source,
      noteId,
      schemaVersion: 1,
    };
  } catch (error) {
    if (error instanceof RepositoryCorruptError) throw error;
    throw new RepositoryCorruptError(
      `Canonical metadata is invalid for note ${noteId}`,
    );
  }
}

export function createCanonicalSourceFromLocalNoteMetadata(
  sidecar: LocalNoteMetadata,
) {
  const lines = sidecar.editableSource.split("\n");
  const blocks = [...sidecar.blocks].sort(
    (left, right) => right.editableLineNumber - left.editableLineNumber,
  );

  for (const block of blocks) {
    lines.splice(
      block.editableLineNumber - 1,
      0,
      formatCtnBlockMetadataLine(block),
    );
  }
  return lines.join("\n");
}

export function equalLocalNoteMetadataProjection(
  left: LocalNoteMetadata,
  right: LocalNoteMetadata,
) {
  return left.editableSource === right.editableSource &&
    left.blocks.length === right.blocks.length &&
    left.blocks.every((block, index) => {
      const other = right.blocks[index];

      return other !== undefined &&
        block.createdAt === other.createdAt &&
        block.editableLineNumber === other.editableLineNumber &&
        block.fingerprint === other.fingerprint &&
        block.id === other.id &&
        block.indentText === other.indentText &&
        block.updatedAt === other.updatedAt;
    });
}

export function reconcileEditableNoteSource({
  createId,
  editableSource,
  noteId,
  previous,
  reservedIds,
  syntaxSource,
  timestamp,
}: {
  createId: () => string;
  editableSource: string;
  noteId: string;
  previous: LocalNoteMetadata | null;
  reservedIds: Set<string>;
  syntaxSource: string | null;
  timestamp: string;
}): LocalNoteMetadata {
  if (previous) {
    const verifiedPrevious = projectCanonicalNoteSource(
      noteId,
      createCanonicalSourceFromLocalNoteMetadata(previous),
      syntaxSource,
    );

    if (!equalLocalNoteMetadataProjection(verifiedPrevious, previous)) {
      throw new RepositoryCorruptError(
        `Note sidecar projection is invalid for ${noteId}`,
      );
    }
  }
  if (previous?.editableSource === editableSource) {
    previous.blocks.forEach((block) => reservedIds.add(block.id));
    return previous;
  }
  try {
    const syntaxProfile = resolveSyntaxProfile(syntaxSource);
    let canonicalSource: string;
    const previousCanonicalSource = previous
      ? createCanonicalSourceFromLocalNoteMetadata(previous)
      : null;

    if (syntaxProfile === null) {
      const allocator = createCtnBlockIdAllocator(createId, reservedIds);
      const metadata = previous
        ? readCtnCanonicalTitleHeader(previousCanonicalSource ?? "").metadata
        : {
            createdAt: timestamp,
            id: allocator.allocate(),
            indentText: "",
            updatedAt: timestamp,
          };

      canonicalSource = `${formatCtnBlockMetadataLine({
        ...metadata,
        updatedAt: timestamp,
      })}\n${editableSource}`;
    } else if (previous) {
      canonicalSource = reconcileCtnSourceBlockMetadata(
        previousCanonicalSource ?? "",
        {
          edits: createMyersTextEdits(previous.editableSource, editableSource),
          source: editableSource,
        },
        syntaxProfile,
        { createId, reservedIds, timestamp },
      );
    } else {
      canonicalSource = initializeCtnSourceBlockMetadata(
        editableSource,
        syntaxProfile,
        {
          createId,
          createdAt: timestamp,
          reservedIds,
          updatedAt: timestamp,
        },
      );
    }
    const projected = projectCanonicalNoteSource(
      noteId,
      canonicalSource,
      syntaxSource,
    );

    projected.blocks.forEach((block) => reservedIds.add(block.id));
    return projected;
  } catch (error) {
    if (
      error instanceof RepositoryAdapterError ||
      error instanceof RepositoryCorruptError
    ) {
      throw error;
    }
    throw new RepositoryCorruptError(`Could not reconcile Local note ${noteId}`);
  }
}

function titleFromEditableSource(source: string) {
  return source.split("\n", 1)[0] ?? "";
}

function sourceHash(source: string) {
  return createHash("sha256").update(source).digest("hex");
}

function createSubtreeHashes(entries: readonly LocalIndexEntry[]) {
  const hashes = new Map<string, string>();
  const folders = entries.filter(
    (entry): entry is LocalFolderIndexEntry => entry.kind === "folder",
  );

  for (const folder of folders) {
    const prefix = `${folder.path}/`;
    const facts = entries
      .filter((entry) => entry.path.startsWith(prefix))
      .map((entry) => entry.kind === "folder"
        ? `folder:${entry.path.slice(prefix.length)}`
        : `note:${entry.path.slice(prefix.length)}:${entry.sourceHash}`)
      .sort();

    hashes.set(folder.path, sourceHash(facts.join("\n")));
  }
  return hashes;
}

function jsonSource(value: unknown) {
  return `${serializeJsonIteratively(value, { indent: 2 })}\n`;
}

export function createLocalProjectionFromContent({
  content,
  label,
  previousIndex = null,
  repositoryId,
  rootDir,
}: {
  content: WorkspaceRepositoryContentDto;
  label: string;
  previousIndex?: LocalRepositoryIndex | null;
  repositoryId: string;
  rootDir: string;
}): LocalWorkingTreeProjection {
  const { activeSource: syntaxSource } =
    validateWorkspaceRepositorySyntax(content.syntax);
  const noteById = new Map(
    content.workspace.notes.map((note) => [note.id, note]),
  );
  const previousByIdentity = new Map(
    (previousIndex?.entries ?? []).map((entry) => [
      entry.kind === "folder"
        ? `folder:${entry.folderId}`
        : `note:${entry.noteId}`,
      entry,
    ]),
  );
  const entries: LocalIndexEntry[] = [];
  const files: LocalManagedFileSet = new Map();
  const siblingNamesByParent = new Map<string, Set<string>>();
  const pending: Array<{
    node: RepositoryTreeNodeDto;
    order: number;
    parentPath: string;
  }> = [];

  for (let index = content.workspace.tree.length - 1; index >= 0; index -= 1) {
    pending.push({
      node: content.workspace.tree[index],
      order: index,
      parentPath: "",
    });
  }
  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) break;
    const siblingNames = siblingNamesByParent.get(current.parentPath) ??
      new Set<string>();

    siblingNamesByParent.set(current.parentPath, siblingNames);
    if (current.node.kind === "folder") {
      const title = validateLocalEntryName(
        current.node.title,
        "$.workspace.tree.folder.title",
      );
      const collisionKey = title.toLocaleLowerCase("en-US");

      if (siblingNames.has(collisionKey)) {
        throw new WorkspaceRepositoryContractError(
          "$.workspace.tree",
          "duplicate Local sibling name",
        );
      }
      siblingNames.add(collisionKey);
      const relativePath = current.parentPath
        ? `${current.parentPath}/${title}`
        : title;

      assertLocalProjectedPath(
        relativePath,
        "$.workspace.tree.folder.path",
        rootDir,
      );
      const previous = previousByIdentity.get(
        `folder:${current.node.folderId}`,
      );

      entries.push({
        device: previous?.kind === "folder" ? previous.device : null,
        folderId: current.node.folderId,
        inode: previous?.kind === "folder" ? previous.inode : null,
        kind: "folder",
        order: current.order,
        path: relativePath,
        subtreeHash: previous?.kind === "folder"
          ? previous.subtreeHash
          : sourceHash(""),
      });
      for (
        let index = current.node.children.length - 1;
        index >= 0;
        index -= 1
      ) {
        pending.push({
          node: current.node.children[index],
          order: index,
          parentPath: relativePath,
        });
      }
      continue;
    }
    const note = noteById.get(current.node.noteId);

    if (!note) {
      throw new WorkspaceRepositoryContractError(
        "$.workspace.tree",
        "missing Local note",
      );
    }
    const sidecar = projectCanonicalNoteSource(
      note.id,
      note.source,
      syntaxSource,
    );
    const title = validateLocalNoteTitle(
      titleFromEditableSource(sidecar.editableSource),
      "$.workspace.notes.title",
    );
    const collisionKey = title.toLocaleLowerCase("en-US");

    if (siblingNames.has(collisionKey)) {
      throw new WorkspaceRepositoryContractError(
        "$.workspace.tree",
        "duplicate Local sibling name",
      );
    }
    siblingNames.add(collisionKey);
    const relativePath = current.parentPath
      ? `${current.parentPath}/${title}.ctn`
      : `${title}.ctn`;

    assertLocalProjectedPath(
      relativePath,
      "$.workspace.notes.path",
      rootDir,
    );
    const previous = previousByIdentity.get(`note:${note.id}`);

    entries.push({
      device: previous?.kind === "note" ? previous.device : null,
      inode: previous?.kind === "note" ? previous.inode : null,
      kind: "note",
      noteId: note.id,
      order: current.order,
      path: relativePath,
      sourceHash: sourceHash(sidecar.editableSource),
    });
    files.set(relativePath, sidecar.editableSource);
    files.set(
      `${localControlDirectoryName}/${localNoteMetadataDirectoryName}/${note.id}.json`,
      jsonSource(sidecar),
    );
  }
  files.set(
    `${localControlDirectoryName}/${localSyntaxDirectoryName}/${repositorySyntaxIndexFileName}`,
    jsonSource({
      activeFileId: content.syntax.activeFileId,
      files: content.syntax.files.map((file) => file.id),
    }),
  );
  for (const file of content.syntax.files) {
    files.set(
      `${localControlDirectoryName}/${localSyntaxDirectoryName}/${file.id}.toml`,
      file.source,
    );
  }
  const revision = createWorkspaceRepositoryRevision(content);
  const subtreeHashes = createSubtreeHashes(entries);

  entries.forEach((entry) => {
    if (entry.kind === "folder") {
      entry.subtreeHash = subtreeHashes.get(entry.path) ?? sourceHash("");
    }
  });
  const index: LocalRepositoryIndex = {
    entries,
    layoutVersion: localLayoutVersion,
  };
  const metadata: LocalRepositoryMetadata = {
    currentRevision: revision,
    label,
    layoutVersion: localLayoutVersion,
    repositoryId,
    schemaVersion: workspaceRepositorySchemaVersion,
    workspace: { id: content.workspace.id, name: content.workspace.name },
  };

  files.set(
    `${localControlDirectoryName}/${localIndexFileName}`,
    jsonSource(index),
  );
  files.set(
    `${localControlDirectoryName}/${localRepositoryMetadataFileName}`,
    jsonSource(metadata),
  );
  for (const relativePath of files.keys()) {
    assertLocalProjectedPath(
      relativePath,
      "Local repository control path",
      rootDir,
    );
  }
  return { content, files, index, metadata, revision };
}
