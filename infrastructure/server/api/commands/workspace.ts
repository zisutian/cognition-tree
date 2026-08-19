// SPDX-License-Identifier: GPL-3.0-or-later

import {
  executeWorkspaceCommand,
  type WorkspaceCommandExecutionRequest,
} from "../../../../application/workspace/commands/workspaceCommandExecutor.ts";
import type {
  ApiV1WorkspaceCommandDto,
} from "../../../../contracts/api/types.ts";
import {
  WorkspaceRevisionConflictError,
  type WorkspaceRepositoryStore,
} from "../../repository/store.ts";
import {
  createWorkspaceRepositoryRevision,
} from "../../repository/workspace/revision.ts";
import {
  createPreparedCommandStoreAdapter,
} from "../../repository/preparedCommandStoreAdapter.ts";
import { workspaceResourceVersions } from "../resources/versions.ts";
import type { ApiV1Runtime } from "../http/runtime.ts";

function toWorkspaceCommandRequest(
  command: ApiV1WorkspaceCommandDto,
): WorkspaceCommandExecutionRequest {
  switch (command.kind) {
    case "create-folder":
      return {
        command: {
          kind: command.kind,
          parentFolderId: command.parentFolderId,
          title: command.title,
        },
        mode: command.mode,
        preconditions: {
          expectedTreeVersion: command.expectedTreeVersion,
        },
      };
    case "create-note":
      return {
        command: {
          body: command.body,
          kind: command.kind,
          parentFolderId: command.parentFolderId,
          title: command.title,
        },
        mode: command.mode,
        preconditions: {
          expectedTreeVersion: command.expectedTreeVersion,
        },
      };
    case "delete-folder":
      return {
        command: { folderId: command.folderId, kind: command.kind },
        mode: command.mode,
        preconditions: {
          expectedTreeVersion: command.expectedTreeVersion,
        },
      };
    case "delete-note":
      return {
        command: { kind: command.kind, noteId: command.noteId },
        mode: command.mode,
        preconditions: { expectedVersion: command.expectedVersion },
      };
    case "move-block":
      return {
        command: {
          kind: command.kind,
          sourceBlockId: command.sourceBlockId,
          sourceNoteId: command.sourceNoteId,
          targetBlockId: command.targetBlockId,
          targetKind: command.targetKind,
          targetNoteId: command.targetNoteId,
        },
        mode: command.mode,
        preconditions: {
          expectedSourceVersion: command.expectedSourceVersion,
          expectedTargetVersion: command.expectedTargetVersion,
        },
      };
    case "move-tree-node":
      return {
        command: {
          kind: command.kind,
          nodeId: command.nodeId,
          nodeKind: command.nodeKind,
          parentFolderId: command.parentFolderId,
          toIndex: command.toIndex,
        },
        mode: command.mode,
        preconditions: {
          expectedTreeVersion: command.expectedTreeVersion,
        },
      };
    case "rename-folder":
      return {
        command: {
          folderId: command.folderId,
          kind: command.kind,
          title: command.title,
        },
        mode: command.mode,
        preconditions: { expectedVersion: command.expectedVersion },
      };
    case "rename-note":
      return {
        command: {
          kind: command.kind,
          noteId: command.noteId,
          title: command.title,
        },
        mode: command.mode,
        preconditions: { expectedVersion: command.expectedVersion },
      };
    case "replace-note-source":
      return {
        command: {
          editableText: command.editableText,
          kind: command.kind,
          noteId: command.noteId,
        },
        mode: command.mode,
        preconditions: { expectedVersion: command.expectedVersion },
      };
  }
}

export function executeApiV1WorkspaceCommand({
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
  return executeWorkspaceCommand({
    createRevision: createWorkspaceRepositoryRevision,
    repositoryId,
    request: toWorkspaceCommandRequest(command),
    runtime,
    store: createPreparedCommandStoreAdapter(
      store,
      (error) => error instanceof WorkspaceRevisionConflictError,
    ),
    versionPolicy: workspaceResourceVersions,
  });
}
