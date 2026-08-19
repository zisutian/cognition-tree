// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createWorkspaceSourceReplacement,
  prepareWorkspaceMutation,
  type WorkspaceDomainCommand,
  type WorkspaceDomainContext,
  type WorkspaceDomainVersions,
} from "../../../../application/workspace/commands/workspaceDomainCommands.ts";
import { projectWorkspaceMutation } from "../../../../application/workspace/commands/workspaceDomainProjection.ts";
import {
  createDomainTransition,
} from "../../../../application/commands/domainCommand.ts";
import {
  executePreparedCommand,
} from "../../../../application/commands/preparedCommandExecutor.ts";
import type {
  ApiV1WorkspaceCommandDto,
} from "../../../../contracts/api/types.ts";
import type {
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../../../core/errors/domainErrors.ts";
import type {
  NoteTreeNode,
} from "../../../../core/workspace/model/workspaceData.ts";
import type {
  NoteTreeNodeReference,
} from "../../../../core/workspace/model/noteTree/types.ts";
import {
  WorkspaceRevisionConflictError,
  type WorkspaceRepositoryStore,
} from "../../repository/store.ts";
import type {
  WorkspaceRepositoryPreparation,
} from "../../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";
import {
  createWorkspaceRepositoryRevision,
} from "../../repository/workspace/revision.ts";
import {
  createPreparedCommandStoreAdapter,
} from "../../repository/preparedCommandStoreAdapter.ts";
import {
  createWorkspaceFolderVersion,
  createWorkspaceNoteVersion,
  createWorkspaceTreeVersion,
} from "../resources/versions.ts";
import {
  readApiV1RuntimeNow,
  type ApiV1Runtime,
} from "../http/runtime.ts";

function createWorkspaceId(prefix: "folder" | "note", createId: () => string) {
  return `${prefix}-${createId()}`;
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

function nodeReference(node: NoteTreeNode): NoteTreeNodeReference {
  return node.kind === "folder"
    ? { folderId: node.folderId, kind: "folder" }
    : { kind: "note", noteId: node.noteId };
}

function createTreeMoveRequest(
  context: WorkspaceDomainContext,
  command: Extract<ApiV1WorkspaceCommandDto, { kind: "move-tree-node" }>,
) {
  const source: NoteTreeNodeReference = command.nodeKind === "folder"
    ? { folderId: command.nodeId, kind: "folder" }
    : { kind: "note", noteId: command.nodeId };
  const children = findTreeChildren(
    context.structure.data.tree,
    command.parentFolderId,
  );

  if (!children) {
    throw new DomainNotFoundError(
      command.parentFolderId ?? "root",
      "Target Workspace folder does not exist",
    );
  }
  const remaining = children.filter((node) =>
    command.nodeKind === "folder"
      ? node.kind !== "folder" || node.folderId !== command.nodeId
      : node.kind !== "note" || node.noteId !== command.nodeId
  );

  if (command.toIndex > remaining.length) {
    throw new DomainValidationError(
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

function createVersions(
  content: WorkspaceRepositoryContentDto,
): WorkspaceDomainVersions {
  return {
    folder: createWorkspaceFolderVersion,
    note: createWorkspaceNoteVersion,
    tree(workspace) {
      return createWorkspaceTreeVersion({ ...content, workspace });
    },
  };
}

function mapWorkspaceCommand({
  command,
  context,
  createId,
  timestamp,
}: {
  command: ApiV1WorkspaceCommandDto;
  context: WorkspaceDomainContext;
  createId: () => string;
  timestamp: string;
}): WorkspaceDomainCommand {
  switch (command.kind) {
    case "create-folder":
      return {
        ...command,
        folderId: createWorkspaceId("folder", createId),
        timestamp,
      };
    case "create-note":
      return {
        ...command,
        noteId: createWorkspaceId("note", createId),
        timestamp,
      };
    case "delete-folder":
    case "delete-note":
    case "rename-folder":
    case "rename-note":
      return { ...command, timestamp };
    case "move-block":
      return {
        expectedSourceVersion: command.expectedSourceVersion,
        expectedTargetVersion: command.expectedTargetVersion,
        kind: command.kind,
        sourceBlockId: command.sourceBlockId,
        sourceNoteId: command.sourceNoteId,
        target: command.targetKind === "end"
          ? (() => {
              if (command.targetBlockId !== null) {
                throw new DomainValidationError(
                  "End block target must not include targetBlockId",
                );
              }
              return { kind: "end" as const };
            })()
          : command.targetBlockId === null
            ? (() => {
                throw new DomainNotFoundError(
                  "target-block",
                  "Target Workspace block does not exist",
                );
              })()
            : {
                kind: command.targetKind,
                targetBlockId: command.targetBlockId,
              },
        targetNoteId: command.targetNoteId,
        timestamp,
      };
    case "move-tree-node":
      return {
        expectedTreeVersion: command.expectedTreeVersion,
        kind: command.kind,
        request: createTreeMoveRequest(context, command),
        timestamp,
      };
    case "replace-note-source":
      return {
        change: createWorkspaceSourceReplacement(
          context,
          command.noteId,
          command.editableText,
        ),
        expectedVersion: command.expectedVersion,
        kind: command.kind,
        noteId: command.noteId,
        timestamp,
      };
  }
}

export function projectApiV1WorkspaceChanges(
  repositoryId: string,
  before: WorkspaceRepositoryContentDto,
  after: WorkspaceRepositoryContentDto,
  timestamp: string,
  beforePreparation: WorkspaceRepositoryPreparation,
  afterPreparation: WorkspaceRepositoryPreparation,
) {
  const syntax = beforePreparation.workspaceSyntax?.syntax ?? null;

  return projectWorkspaceMutation({
    after: after.workspace,
    afterContext: {
      index: afterPreparation.analysisIndex,
      structure: afterPreparation.workspace,
      syntax: afterPreparation.workspaceSyntax?.syntax ?? null,
    },
    before: before.workspace,
    beforeContext: {
      index: beforePreparation.analysisIndex,
      structure: beforePreparation.workspace,
      syntax,
    },
    repositoryId,
    timestamp,
    versions: createVersions(before),
  });
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

  return executePreparedCommand({
    prepare({ content, projection: analysis }) {
      let nextId = 0;
      const createId = () => {
        allocatedIds[nextId] ??= runtime.createId();
        return allocatedIds[nextId++]!;
      };
      const context: WorkspaceDomainContext = {
        index: analysis.analysisIndex,
        structure: analysis.workspace,
        syntax: analysis.workspaceSyntax?.syntax ?? null,
      };
      const versions = createVersions(content);
      const mutation = prepareWorkspaceMutation({
        command: mapWorkspaceCommand({
          command,
          context,
          createId,
          timestamp: now.timestamp,
        }),
        context,
        createBlockId: createId,
        versions,
      });
      const next = { ...content, workspace: mutation.content };
      const projection = projectWorkspaceMutation({
        after: mutation.content,
        afterContext: mutation.context,
        before: content.workspace,
        beforeContext: context,
        repositoryId,
        timestamp: mutation.timestamp,
        versions,
      });
      const transition = createDomainTransition(mutation, projection);
      const nextPreparation: WorkspaceRepositoryPreparation = {
        analysisIndex: mutation.context.index,
        context: mutation.context.syntax
          ? {
              syntax: mutation.context.syntax,
              workspace: mutation.context.structure,
            }
          : null,
        syntaxById: analysis.syntaxById,
        workspace: mutation.context.structure,
        workspaceSyntax: analysis.workspaceSyntax,
      };

      return {
        changes: transition.changes,
        content: next,
        diff: transition.diff,
        projection: nextPreparation,
        result: transition.result,
        revision: createWorkspaceRepositoryRevision(next),
      };
    },
    mode: command.mode,
    store: createPreparedCommandStoreAdapter(
      store,
      (error) => error instanceof WorkspaceRevisionConflictError,
    ),
  });
}
