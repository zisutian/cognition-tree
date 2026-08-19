// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  analyzeCtnSource,
  type CtnCanonicalSourceAnalysis,
} from "../../../../core/ctn/analysis/sourceAnalysis.ts";
import { createCtnBlockIdAllocator } from "../../../../core/ctn/metadata/blockIdAllocator.ts";
import { formatCtnBlockMetadataLine } from "../../../../core/ctn/metadata/blockMetadata.ts";
import { createMyersTextEdits } from "../../../../core/ctn/metadata/myersTextEdits.ts";
import { reconcileCtnSourceBlockMetadata } from "../../../../core/ctn/metadata/reconcileSourceMetadata.ts";
import {
  initializeCtnSourceBlockMetadataAnalysis,
} from "../../../../core/ctn/metadata/sourceMetadata.ts";
import {
  readCtnCanonicalTitleHeader,
} from "../../../../core/ctn/parser/parseCtnDocument.ts";
import { compileCtnSyntaxSource } from "../../../../core/ctn/syntax/compiler.ts";
import type { CtnCompiledSyntax } from "../../../../core/ctn/syntax/types.ts";
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
} from "../../repository/store.ts";
import { validateWorkspaceRepositorySyntax } from "../../repository/workspace/contentValidation.ts";
import type { WorkspaceRepositoryPreparation } from "../../../../application/repository/workspaceRepositoryPreparation.ts";
import { createWorkspaceRepositoryRevision } from "../../repository/workspace/revision.ts";
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

function resolveSyntax(
  syntaxSource: string | null,
): CtnCompiledSyntax | null {
  if (syntaxSource === null) return null;
  const result = compileCtnSyntaxSource(syntaxSource, "workspace");

  if (!result.syntax) {
    throw new RepositoryCorruptError(
      "Local workspace syntax is invalid",
    );
  }
  return result.syntax;
}

export function createLocalNoteMetadataFromAnalysis(
  noteId: string,
  analysis: CtnCanonicalSourceAnalysis,
): LocalNoteMetadata {
  const { document, editableProjection: editable } = analysis;

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
}

export type LocalCanonicalNoteProjection = {
  analysis: CtnCanonicalSourceAnalysis | null;
  metadata: LocalNoteMetadata;
};

export function projectCanonicalNoteSourceAnalysis(
  noteId: string,
  canonicalSource: string,
  syntaxSource: string | null,
  preparedSyntax?: CtnCompiledSyntax | null,
): LocalCanonicalNoteProjection {
  try {
    const syntax = preparedSyntax === undefined
      ? resolveSyntax(syntaxSource)
      : preparedSyntax;

    if (syntax === null) {
      const header = readCtnCanonicalTitleHeader(canonicalSource);
      const editableSource = canonicalSource.split("\n").slice(1).join("\n");

      return {
        analysis: null,
        metadata: {
          blocks: [{
            ...header.metadata,
            editableLineNumber: 1,
            fingerprint: editableSource.split("\n", 1)[0] ?? "",
          }],
          editableSource,
          noteId,
          schemaVersion: 1,
        },
      };
    }
    const analysis = analyzeCtnSource({
      mode: { kind: "canonical-document" },
      source: canonicalSource,
      syntax,
    });

    return {
      analysis,
      metadata: createLocalNoteMetadataFromAnalysis(noteId, analysis),
    };
  } catch (error) {
    if (error instanceof RepositoryCorruptError) throw error;
    throw new RepositoryCorruptError(
      `Canonical metadata is invalid for note ${noteId}`,
    );
  }
}

export function projectCanonicalNoteSource(
  noteId: string,
  canonicalSource: string,
  syntaxSource: string | null,
  preparedSyntax?: CtnCompiledSyntax | null,
): LocalNoteMetadata {
  return projectCanonicalNoteSourceAnalysis(
    noteId,
    canonicalSource,
    syntaxSource,
    preparedSyntax,
  ).metadata;
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

export function reconcileEditableNoteSourceAnalysis({
  createId,
  editableSource,
  noteId,
  previous,
  verifiedPrevious = null,
  reservedIds,
  syntaxSource,
  timestamp,
  syntax: preparedSyntax,
}: {
  createId: () => string;
  editableSource: string;
  noteId: string;
  previous: LocalNoteMetadata | null;
  verifiedPrevious?: LocalCanonicalNoteProjection | null;
  reservedIds: Set<string>;
  syntaxSource: string | null;
  timestamp: string;
  syntax?: CtnCompiledSyntax | null;
}): LocalCanonicalNoteProjection {
  if (previous) {
    verifiedPrevious ??= projectCanonicalNoteSourceAnalysis(
      noteId,
      createCanonicalSourceFromLocalNoteMetadata(previous),
      syntaxSource,
      preparedSyntax,
    );

    if (!equalLocalNoteMetadataProjection(verifiedPrevious.metadata, previous)) {
      throw new RepositoryCorruptError(
        `Note sidecar projection is invalid for ${noteId}`,
      );
    }
  }
  if (previous?.editableSource === editableSource) {
    previous.blocks.forEach((block) => reservedIds.add(block.id));
    return {
      analysis: verifiedPrevious?.analysis ?? null,
      metadata: previous,
    };
  }
  try {
    const syntax = preparedSyntax === undefined
      ? resolveSyntax(syntaxSource)
      : preparedSyntax;
    let canonicalSource: string;
    let canonicalAnalysis: CtnCanonicalSourceAnalysis | null = null;
    const previousCanonicalSource = previous
      ? createCanonicalSourceFromLocalNoteMetadata(previous)
      : null;

    if (syntax === null) {
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
      const previousAnalysis = verifiedPrevious?.analysis ?? analyzeCtnSource({
          mode: { kind: "canonical-document" },
          source: previousCanonicalSource ?? "",
          syntax,
        });
      const candidateAnalysis = analyzeCtnSource({
        mode: { kind: "editable-document" },
        source: editableSource,
        syntax,
      });

      const reconciled = reconcileCtnSourceBlockMetadata(
        previousAnalysis,
        candidateAnalysis,
        {
          edits: createMyersTextEdits(previous.editableSource, editableSource),
          source: editableSource,
        },
        {
          createId,
          reservedIds,
          timestamp,
          touchTitle: true,
        },
      );

      canonicalSource = reconciled.source;
      canonicalAnalysis = reconciled.analysis;
    } else {
      const initialized = initializeCtnSourceBlockMetadataAnalysis(
        editableSource,
        syntax,
        {
          createId,
          createdAt: timestamp,
          reservedIds,
          updatedAt: timestamp,
        },
      );

      canonicalSource = initialized.source;
      canonicalAnalysis = initialized.analysis;
    }
    const projected = canonicalAnalysis
      ? createLocalNoteMetadataFromAnalysis(noteId, canonicalAnalysis)
      : projectCanonicalNoteSource(
          noteId,
          canonicalSource,
          syntaxSource,
        );

    projected.blocks.forEach((block) => reservedIds.add(block.id));
    return { analysis: canonicalAnalysis, metadata: projected };
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

export function reconcileEditableNoteSource(
  input: Parameters<typeof reconcileEditableNoteSourceAnalysis>[0],
): LocalNoteMetadata {
  return reconcileEditableNoteSourceAnalysis(input).metadata;
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
