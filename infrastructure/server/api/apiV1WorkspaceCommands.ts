// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiV1CommandOutcomeDto,
  ApiV1ResourceChangeDto,
  ApiV1WorkspaceCommandDto,
  ApiV1WorkspaceTreeNodeDto,
} from "../../../contracts/api/types.ts";
import type {
  WorkspaceRepositoryContentDto,
} from "../../../contracts/workspace/types.ts";
import { createMyersTextEdits } from "../../../core/ctn/metadata/myersTextEdits.ts";
import {
  collectWorkspaceTitleBlockIds,
} from "../../../core/workspace/context/workspaceBlockMetadata.ts";
import {
  createWorkspaceFolder,
  createWorkspaceNote,
  deleteWorkspaceFolder,
  deleteWorkspaceNote,
  moveWorkspaceTreeNode,
  renameWorkspaceFolder,
  renameWorkspaceNote,
  updateWorkspaceNoteSource,
  updateWorkspaceRawNoteSource,
} from "../../../core/workspace/commands/workspaceCommands.ts";
import {
  moveWorkspaceStructureBlockBetweenNotes,
  moveWorkspaceStructureBlockWithinNote,
  type WorkspaceStructureBlockTargetPositionRequest,
} from "../../../core/workspace/commands/structureBlockCommands.ts";
import type {
  NoteTreeNode,
} from "../../../core/workspace/model/workspaceData.ts";
import type {
  NoteTreeNodeReference,
} from "../../../core/workspace/model/noteTree/types.ts";
import {
  createDomainChangeSet,
} from "../../../core/sync/domainChangeSet.ts";
import type {
  WorkspaceRepositoryStore,
} from "../repository/repositoryStore.ts";
import {
  createWorkspaceRepositoryRevision,
} from "../repository/workspaceRepositoryRevision.ts";
import {
  ApiV1RequestError,
  apiV1NotFound,
  assertApiV1ResourceVersion,
} from "./apiV1Errors.ts";
import {
  executeApiV1VersionedCommand,
  projectApiV1TextEdits,
} from "./apiV1CommandCommon.ts";
import {
  createApiV1WorkspaceAnalysis,
  createWorkspaceFolderVersion,
  createWorkspaceNoteVersion,
  createWorkspaceTreeVersion,
  projectApiV1WorkspaceNote,
  projectApiV1WorkspaceTree,
} from "./apiV1Resources.ts";
import {
  readApiV1RuntimeNow,
  type ApiV1Runtime,
} from "./apiV1Runtime.ts";

function createWorkspaceId(prefix: "folder" | "note", createId: () => string) {
  return `${prefix}-${createId()}`;
}

function domainValidation<Result>(operation: () => Result): Result {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ApiV1RequestError) throw error;
    throw new ApiV1RequestError(
      "domain_validation_failed",
      error instanceof Error ? error.message : "Workspace command is invalid",
    );
  }
}

function findTreeChildren(
  tree: readonly NoteTreeNode[],
  parentFolderId: string | null,
): readonly NoteTreeNode[] | null {
  if (parentFolderId === null) return tree;
  const pending = [...tree];

  while (pending.length > 0) {
    const node = pending.pop();

    if (!node || node.kind === "note") continue;
    if (node.folderId === parentFolderId) return node.children;
    pending.push(...node.children);
  }
  return null;
}

function nodeReference(
  node: NoteTreeNode,
): NoteTreeNodeReference {
  return node.kind === "folder"
    ? { folderId: node.folderId, kind: "folder" }
    : { kind: "note", noteId: node.noteId };
}

function createTreeMoveRequest(
  content: WorkspaceRepositoryContentDto,
  command: Extract<ApiV1WorkspaceCommandDto, { kind: "move-tree-node" }>,
) {
  const source: NoteTreeNodeReference = command.nodeKind === "folder"
    ? { folderId: command.nodeId, kind: "folder" }
    : { kind: "note", noteId: command.nodeId };
  const children = findTreeChildren(
    content.workspace.tree,
    command.parentFolderId,
  );

  if (!children) apiV1NotFound("Target Workspace folder does not exist");
  const remaining = children.filter((node) =>
    command.nodeKind === "folder"
      ? node.kind !== "folder" || node.folderId !== command.nodeId
      : node.kind !== "note" || node.noteId !== command.nodeId
  );

  if (command.toIndex > remaining.length) {
    throw new ApiV1RequestError(
      "domain_validation_failed",
      "Workspace tree target index is out of bounds",
    );
  }
  const target = remaining[command.toIndex];

  return {
    destination: target
      ? {
          kind: "before" as const,
          target: nodeReference(target),
        }
      : command.parentFolderId === null
        ? { kind: "root" as const }
        : {
            folderId: command.parentFolderId,
            kind: "inside" as const,
          },
    source,
  };
}

function blockTarget(
  command: Extract<ApiV1WorkspaceCommandDto, { kind: "move-block" }>,
  targetLineNumber: number | null,
): WorkspaceStructureBlockTargetPositionRequest {
  if (command.targetKind === "end") {
    if (command.targetBlockId !== null) {
      throw new ApiV1RequestError(
        "domain_validation_failed",
        "End block target must not include targetBlockId",
      );
    }
    return { kind: "end" };
  }
  if (command.targetBlockId === null || targetLineNumber === null) {
    apiV1NotFound("Target Workspace block does not exist");
  }
  return {
    kind: command.targetKind === "inside"
      ? "inside-block"
      : command.targetKind === "above"
        ? "sibling-above"
        : "sibling-below",
    lineNumber: targetLineNumber,
  };
}

function updateWorkspaceLogicalSource(
  content: WorkspaceRepositoryContentDto,
  noteId: string,
  editableText: string,
  timestamp: string,
  createBlockId: () => string,
) {
  const analysis = createApiV1WorkspaceAnalysis(content);
  const entry = analysis.structure.noteEntryById.get(noteId);

  if (!entry) apiV1NotFound("Workspace note does not exist");
  if (!analysis.syntax || !analysis.parseIndex) {
    const currentCanonical = entry.note.source;
    const metadataLine = currentCanonical.split("\n", 1)[0] ?? "";
    const nextCanonical = `${metadataLine}\n${editableText}`;

    return {
      ...content,
      workspace: updateWorkspaceRawNoteSource(
        analysis.structure,
        noteId,
        {
          edits: createMyersTextEdits(currentCanonical, nextCanonical),
          source: nextCanonical,
        },
        timestamp,
      ),
    };
  }
  const parsed = analysis.parseIndex.getParsedNote(noteId);

  if (!parsed) apiV1NotFound("Workspace note does not exist");
  const result = updateWorkspaceNoteSource(
    analysis.structure,
    noteId,
    parsed.analysis,
    {
      edits: createMyersTextEdits(
        parsed.analysis.editableProjection.source,
        editableText,
      ),
      source: editableText,
    },
    timestamp,
    createBlockId,
    analysis.parseIndex.blockIds,
  );

  return { ...content, workspace: result.workspaceData };
}

function applyWorkspaceCommand(
  content: WorkspaceRepositoryContentDto,
  command: ApiV1WorkspaceCommandDto,
  runtime: ApiV1Runtime,
) {
  const { timestamp } = readApiV1RuntimeNow(runtime);
  const beforeAnalysis = createApiV1WorkspaceAnalysis(content);
  const treeVersion = createWorkspaceTreeVersion(content);
  let next = content;
  let result: ApiV1CommandOutcomeDto = { kind: "ok" };

  switch (command.kind) {
    case "create-folder": {
      assertApiV1ResourceVersion(
        command.expectedTreeVersion,
        treeVersion,
        "tree",
      );
      const folderId = createWorkspaceId("folder", runtime.createId);

      next = {
        ...content,
        workspace: createWorkspaceFolder(beforeAnalysis.structure, {
          folderId,
          parentFolderId: command.parentFolderId,
          title: command.title,
        }),
      };
      result = { folderId, kind: "folder-created" };
      break;
    }
    case "create-note": {
      assertApiV1ResourceVersion(
        command.expectedTreeVersion,
        treeVersion,
        "tree",
      );
      const noteId = createWorkspaceId("note", runtime.createId);
      const reservedBlockIds = beforeAnalysis.parseIndex?.blockIds ??
        collectWorkspaceTitleBlockIds(content.workspace);
      let workspace = createWorkspaceNote(beforeAnalysis.structure, {
        createBlockId: runtime.createId,
        noteId,
        parentFolderId: command.parentFolderId,
        reservedBlockIds,
        syntax: beforeAnalysis.syntax,
        timestamp,
      });
      workspace = renameWorkspaceNote(
        createApiV1WorkspaceAnalysis({ ...content, workspace }).structure,
        noteId,
        command.title,
        timestamp,
      );
      next = { ...content, workspace };
      const desired = `${command.title}${command.body ? `\n${command.body}` : ""}`;

      next = updateWorkspaceLogicalSource(
        next,
        noteId,
        desired,
        timestamp,
        runtime.createId,
      );
      result = { kind: "note-created", noteId };
      break;
    }
    case "delete-folder": {
      assertApiV1ResourceVersion(
        command.expectedTreeVersion,
        treeVersion,
        "tree",
      );
      next = {
        ...content,
        workspace: deleteWorkspaceFolder(
          beforeAnalysis.structure,
          command.folderId,
        ),
      };
      break;
    }
    case "delete-note": {
      const entry = beforeAnalysis.structure.noteEntryById.get(command.noteId);

      if (!entry) apiV1NotFound("Workspace note does not exist");
      assertApiV1ResourceVersion(
        command.expectedVersion,
        createWorkspaceNoteVersion(entry.note.source),
        command.noteId,
      );
      next = {
        ...content,
        workspace: deleteWorkspaceNote(
          beforeAnalysis.structure,
          command.noteId,
        ),
      };
      break;
    }
    case "move-block": {
      const source = beforeAnalysis.parseIndex?.getParsedNote(
        command.sourceNoteId,
      );
      const target = beforeAnalysis.parseIndex?.getParsedNote(
        command.targetNoteId,
      );

      if (!source || !target || !beforeAnalysis.parseIndex) {
        throw new ApiV1RequestError(
          "domain_validation_failed",
          "Workspace block moves require an active valid syntax",
        );
      }
      assertApiV1ResourceVersion(
        command.expectedSourceVersion,
        createWorkspaceNoteVersion(source.note.source),
        command.sourceNoteId,
      );
      assertApiV1ResourceVersion(
        command.expectedTargetVersion,
        createWorkspaceNoteVersion(target.note.source),
        command.targetNoteId,
      );
      const sourceBlock = source.analysis.document.blocks.find(
        ({ id }) => id === command.sourceBlockId,
      );
      const targetBlock = command.targetBlockId
        ? target.analysis.document.blocks.find(
            ({ id }) => id === command.targetBlockId,
          )
        : null;

      if (!sourceBlock) apiV1NotFound("Source Workspace block does not exist");
      const targetPosition = blockTarget(
        command,
        targetBlock?.lineNumber ?? null,
      );
      const move = command.sourceNoteId === command.targetNoteId
        ? moveWorkspaceStructureBlockWithinNote(
            beforeAnalysis.structure,
            beforeAnalysis.parseIndex,
            {
              noteId: command.sourceNoteId,
              sourceBlockLineNumber: sourceBlock.lineNumber,
              targetPosition,
            },
            timestamp,
          )
        : moveWorkspaceStructureBlockBetweenNotes(
            beforeAnalysis.structure,
            beforeAnalysis.parseIndex,
            {
              sourceBlockLineNumber: sourceBlock.lineNumber,
              sourceNoteId: command.sourceNoteId,
              targetNoteId: command.targetNoteId,
              targetPosition,
            },
            timestamp,
          );

      if (move.status !== "moved") {
        throw new ApiV1RequestError(
          "domain_validation_failed",
          `Workspace block move failed: ${move.reason}`,
        );
      }
      next = { ...content, workspace: move.workspaceData };
      break;
    }
    case "move-tree-node": {
      assertApiV1ResourceVersion(
        command.expectedTreeVersion,
        treeVersion,
        "tree",
      );
      next = {
        ...content,
        workspace: moveWorkspaceTreeNode(
          beforeAnalysis.structure,
          createTreeMoveRequest(content, command),
        ),
      };
      break;
    }
    case "rename-folder": {
      const folder = beforeAnalysis.structure.folderEntryById.get(
        command.folderId,
      )?.node;

      if (!folder) apiV1NotFound("Workspace folder does not exist");
      assertApiV1ResourceVersion(
        command.expectedVersion,
        createWorkspaceFolderVersion(folder.folderId, folder.title),
        command.folderId,
      );
      next = {
        ...content,
        workspace: renameWorkspaceFolder(
          beforeAnalysis.structure,
          command.folderId,
          command.title,
        ),
      };
      break;
    }
    case "rename-note": {
      const entry = beforeAnalysis.structure.noteEntryById.get(command.noteId);

      if (!entry) apiV1NotFound("Workspace note does not exist");
      assertApiV1ResourceVersion(
        command.expectedVersion,
        createWorkspaceNoteVersion(entry.note.source),
        command.noteId,
      );
      next = {
        ...content,
        workspace: renameWorkspaceNote(
          beforeAnalysis.structure,
          command.noteId,
          command.title,
          timestamp,
        ),
      };
      break;
    }
    case "replace-note-source": {
      const entry = beforeAnalysis.structure.noteEntryById.get(command.noteId);

      if (!entry) apiV1NotFound("Workspace note does not exist");
      assertApiV1ResourceVersion(
        command.expectedVersion,
        createWorkspaceNoteVersion(entry.note.source),
        command.noteId,
      );
      next = updateWorkspaceLogicalSource(
        content,
        command.noteId,
        command.editableText,
        timestamp,
        runtime.createId,
      );
      break;
    }
  }
  return { next, result, timestamp };
}

function nodeId(node: ApiV1WorkspaceTreeNodeDto) {
  return node.kind === "folder" ? node.folderId : node.noteId;
}

export function projectApiV1WorkspaceChanges(
  repositoryId: string,
  before: WorkspaceRepositoryContentDto,
  after: WorkspaceRepositoryContentDto,
  timestamp: string,
) {
  const beforeAnalysis = createApiV1WorkspaceAnalysis(before);
  const afterAnalysis = createApiV1WorkspaceAnalysis(after);
  const beforeTree = projectApiV1WorkspaceTree(
    repositoryId,
    createWorkspaceRepositoryRevision(before),
    beforeAnalysis,
  );
  const afterTree = projectApiV1WorkspaceTree(
    repositoryId,
    createWorkspaceRepositoryRevision(after),
    afterAnalysis,
  );
  const beforeNodes = new Map(beforeTree.nodes.map((node) => [nodeId(node), node]));
  const afterNodes = new Map(afterTree.nodes.map((node) => [nodeId(node), node]));
  const resources: ApiV1ResourceChangeDto[] = [];
  const changedNoteIds = new Set<string>();

  for (const [id, node] of beforeNodes) {
    const next = afterNodes.get(id);

    if (!next) {
      resources.push({
        domain: "workspace",
        kind: "deleted",
        repositoryId,
        resourceId: id,
      });
      if (node.kind === "note") changedNoteIds.add(id);
    }
  }
  for (const [id, node] of afterNodes) {
    const previous = beforeNodes.get(id);
    const version = node.version;

    if (!previous) {
      resources.push({
        domain: "workspace",
        kind: "created",
        repositoryId,
        resourceId: id,
        version,
      });
      if (node.kind === "note") changedNoteIds.add(id);
      continue;
    }
    if (
      previous.parentFolderId !== node.parentFolderId ||
      previous.order !== node.order
    ) {
      resources.push({
        domain: "workspace",
        kind: "moved",
        repositoryId,
        resourceId: id,
        version,
      });
    }
    if (previous.version !== node.version) {
      resources.push({
        domain: "workspace",
        kind: "updated",
        repositoryId,
        resourceId: id,
        version,
      });
      if (node.kind === "note") changedNoteIds.add(id);
    }
  }
  if (beforeTree.version !== afterTree.version) {
    resources.push({
      domain: "workspace",
      kind: "updated",
      repositoryId,
      resourceId: "tree",
      version: afterTree.version,
    });
  }
  const blocks = [...changedNoteIds].flatMap((noteId) => {
    const previous = beforeAnalysis.parseIndex?.getParsedNote(noteId);
    const next = afterAnalysis.parseIndex?.getParsedNote(noteId);
    const changes = createDomainChangeSet({
      next: next
        ? {
            document: next.analysis.document,
            domain: "workspace",
            repositoryId,
            resourceId: noteId,
            version: createWorkspaceNoteVersion(next.note.source),
          }
        : null,
      occurredAt: timestamp,
      previous: previous
        ? {
            document: previous.analysis.document,
            domain: "workspace",
            repositoryId,
            resourceId: noteId,
            version: createWorkspaceNoteVersion(previous.note.source),
          }
        : null,
    });

    return changes.blocks;
  });
  const diff = [...changedNoteIds].flatMap((noteId) => {
    const previousText = projectApiV1WorkspaceNote(beforeAnalysis, noteId)
      ?.editableText ?? "";
    const nextText = projectApiV1WorkspaceNote(afterAnalysis, noteId)
      ?.editableText ?? "";

    return projectApiV1TextEdits(
      noteId,
      createMyersTextEdits(previousText, nextText),
    );
  });

  return {
    changes: { blocks, occurredAt: timestamp, resources },
    diff,
  };
}

export async function executeApiV1WorkspaceCommand({
  command,
  repositoryId,
  runtime,
  store,
}: {
  command: ApiV1WorkspaceCommandDto;
  repositoryId: string;
  runtime: ApiV1Runtime;
  store: WorkspaceRepositoryStore;
}) {
  const now = readApiV1RuntimeNow(runtime);
  const allocatedIds: string[] = [];

  return executeApiV1VersionedCommand({
    apply(content) {
      let nextId = 0;
      const replayRuntime: ApiV1Runtime = {
        ...runtime,
        createId() {
          allocatedIds[nextId] ??= runtime.createId();
          return allocatedIds[nextId++]!;
        },
        now: () => new Date(now.date),
      };
      const applied = domainValidation(() =>
        applyWorkspaceCommand(content, command, replayRuntime)
      );
      const projection = projectApiV1WorkspaceChanges(
        repositoryId,
        content,
        applied.next,
        applied.timestamp,
      );

      return {
        ...projection,
        content: applied.next,
        result: applied.result,
        revision: createWorkspaceRepositoryRevision(applied.next),
      };
    },
    mode: command.mode,
    store,
  });
}
