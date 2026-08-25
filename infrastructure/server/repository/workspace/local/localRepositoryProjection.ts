// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { serializeJsonIteratively } from "../../../../../contracts/common/json.ts";
import { WorkspaceRepositoryContractError } from "../../../../../contracts/workspace/contractValue.ts";
import type {
  RepositoryTreeNodeDto,
  WorkspaceRepositoryContentDto,
} from "../../../../../contracts/workspace/types.ts";
import {
  repositorySyntaxIndexFileName,
  workspaceRepositorySchemaVersion,
} from "../../../../../contracts/workspace/types.ts";
import type { WorkspaceRepositoryPreparation } from "../../../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";
import { createWorkspaceRepositoryRevision } from "../revision.ts";
import { validateWorkspaceRepositorySyntax } from "../contentValidation.ts";
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
  type LocalRepositoryIndex,
  type LocalRepositoryMetadata,
  type LocalWorkingTreeProjection,
} from "./localWorkingTreeLayout.ts";
import {
  createLocalNoteMetadataFromAnalysis,
  projectCanonicalNoteSource,
} from "./localNoteProjection.ts";
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
  preparation,
  previousIndex = null,
  repositoryId,
  rootDir,
}: {
  content: WorkspaceRepositoryContentDto;
  label: string;
  preparation?: WorkspaceRepositoryPreparation;
  previousIndex?: LocalRepositoryIndex | null;
  repositoryId: string;
  rootDir: string;
}): LocalWorkingTreeProjection {
  const syntaxSource = preparation
    ? preparation.workspaceSyntax?.source ?? null
    : validateWorkspaceRepositorySyntax(content.syntax).activeSource;
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
    const preparedNote = preparation?.analysisIndex?.getParsedNote(note.id);
    const sidecar = preparedNote
      ? createLocalNoteMetadataFromAnalysis(note.id, preparedNote.analysis)
      : projectCanonicalNoteSource(note.id, note.source, syntaxSource);
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
  return {
    analysisOverrides: new Map(
      content.workspace.notes.flatMap((note) => {
        const analysis = preparation?.analysisIndex
          ?.getParsedNote(note.id)?.analysis;

        return analysis ? [[note.id, analysis] as const] : [];
      }),
    ),
    content,
    files,
    index,
    metadata,
    revision,
    syntaxOverrides: preparation?.syntaxById ?? new Map(),
  };
}
