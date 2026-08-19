// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createDomainTransition,
} from "../../commands/domainCommand.ts";
import {
  executePreparedCommand,
  type CommandExecutionMode,
  type PreparedCommandStore,
} from "../../commands/preparedCommandExecutor.ts";
import {
  readCommandRuntimeNow,
  type CommandRuntime,
} from "../../commands/commandRuntime.ts";
import {
  createWorkspaceSourceReplacement,
  prepareWorkspaceMutation,
  type WorkspaceDomainCommand,
  type WorkspaceDomainContext,
  type WorkspaceDomainVersions,
} from "./workspaceDomainCommands.ts";
import { projectWorkspaceMutation } from "./workspaceDomainProjection.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../../core/errors/domainErrors.ts";
import type {
  NoteTreeNode,
  WorkspaceData,
} from "../../../core/workspace/model/workspaceData.ts";
import type {
  NoteTreeNodeReference,
} from "../../../core/workspace/model/noteTree/types.ts";
import type {
  RepositoryRevision,
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
} from "../persistence/workspaceRepository.ts";

type ResourceVersion = `sha256:${string}`;

type WorkspaceCommandInput =
  | {
      command: {
        kind: "create-folder";
        parentFolderId: string | null;
        title: string;
      };
      preconditions: { expectedTreeVersion: ResourceVersion };
    }
  | {
      command: {
        body: string;
        kind: "create-note";
        parentFolderId: string | null;
        title: string;
      };
      preconditions: { expectedTreeVersion: ResourceVersion };
    }
  | {
      command: { folderId: string; kind: "delete-folder" };
      preconditions: { expectedTreeVersion: ResourceVersion };
    }
  | {
      command: { kind: "delete-note"; noteId: string };
      preconditions: { expectedVersion: ResourceVersion };
    }
  | {
      command: {
        kind: "move-block";
        sourceBlockId: string;
        sourceNoteId: string;
        targetBlockId: string | null;
        targetKind: "above" | "below" | "end" | "inside";
        targetNoteId: string;
      };
      preconditions: {
        expectedSourceVersion: ResourceVersion;
        expectedTargetVersion: ResourceVersion;
      };
    }
  | {
      command: {
        kind: "move-tree-node";
        nodeId: string;
        nodeKind: "folder" | "note";
        parentFolderId: string | null;
        toIndex: number;
      };
      preconditions: { expectedTreeVersion: ResourceVersion };
    }
  | {
      command: { folderId: string; kind: "rename-folder"; title: string };
      preconditions: { expectedVersion: ResourceVersion };
    }
  | {
      command: { kind: "rename-note"; noteId: string; title: string };
      preconditions: { expectedVersion: ResourceVersion };
    }
  | {
      command: {
        editableText: string;
        kind: "replace-note-source";
        noteId: string;
      };
      preconditions: { expectedVersion: ResourceVersion };
    };

export type WorkspaceCommandExecutionRequest = WorkspaceCommandInput & {
  mode: CommandExecutionMode;
};

type WorkspaceCommandKind = WorkspaceCommandInput["command"]["kind"];
type WorkspaceCommandInputFor<Kind extends WorkspaceCommandKind> = Extract<
  WorkspaceCommandInput,
  { command: { kind: Kind } }
>;

export type WorkspaceResourceVersionPolicy = {
  folder(folderId: string, title: string): ResourceVersion;
  note(source: string): ResourceVersion;
  tree(
    content: WorkspaceRepositoryContent,
    workspace: WorkspaceData,
  ): ResourceVersion;
};

function inputFor<Kind extends WorkspaceCommandKind>(
  input: WorkspaceCommandInput,
  kind: Kind,
) {
  if (input.command.kind !== kind) {
    throw new Error(`Expected Workspace command ${kind}.`);
  }
  return input as WorkspaceCommandInputFor<Kind>;
}

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
  input: WorkspaceCommandInputFor<"move-tree-node">,
) {
  const { command } = input;
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

function createDomainVersions(
  content: WorkspaceRepositoryContent,
  versions: WorkspaceResourceVersionPolicy,
): WorkspaceDomainVersions {
  return {
    folder: versions.folder,
    note: versions.note,
    tree: (workspace) => versions.tree(content, workspace),
  };
}

function mapWorkspaceCommand({
  context,
  createId,
  input,
  timestamp,
}: {
  context: WorkspaceDomainContext;
  createId: () => string;
  input: WorkspaceCommandInput;
  timestamp: string;
}): WorkspaceDomainCommand {
  switch (input.command.kind) {
    case "create-folder": {
      const { command, preconditions } = inputFor(input, "create-folder");
      return {
        ...command,
        expectedTreeVersion: preconditions.expectedTreeVersion,
        folderId: createWorkspaceId("folder", createId),
        timestamp,
      };
    }
    case "create-note": {
      const { command, preconditions } = inputFor(input, "create-note");
      return {
        ...command,
        expectedTreeVersion: preconditions.expectedTreeVersion,
        noteId: createWorkspaceId("note", createId),
        timestamp,
      };
    }
    case "delete-folder": {
      const { command, preconditions } = inputFor(input, "delete-folder");
      return {
        ...command,
        expectedTreeVersion: preconditions.expectedTreeVersion,
        timestamp,
      };
    }
    case "delete-note":
    case "rename-note":
    case "rename-folder": {
      const narrowed = inputFor(input, input.command.kind);
      return {
        ...narrowed.command,
        expectedVersion: narrowed.preconditions.expectedVersion,
        timestamp,
      };
    }
    case "move-block": {
      const { command, preconditions } = inputFor(input, "move-block");
      return {
        expectedSourceVersion: preconditions.expectedSourceVersion,
        expectedTargetVersion: preconditions.expectedTargetVersion,
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
    }
    case "move-tree-node": {
      const narrowed = inputFor(input, "move-tree-node");
      return {
        expectedTreeVersion: narrowed.preconditions.expectedTreeVersion,
        kind: narrowed.command.kind,
        request: createTreeMoveRequest(context, narrowed),
        timestamp,
      };
    }
    case "replace-note-source": {
      const { command, preconditions } = inputFor(
        input,
        "replace-note-source",
      );
      return {
        change: createWorkspaceSourceReplacement(
          context,
          command.noteId,
          command.editableText,
        ),
        expectedVersion: preconditions.expectedVersion,
        kind: command.kind,
        noteId: command.noteId,
        timestamp,
      };
    }
  }
}

export function projectWorkspaceContentChanges(
  repositoryId: string,
  before: WorkspaceRepositoryContent,
  after: WorkspaceRepositoryContent,
  timestamp: string,
  beforePreparation: WorkspaceRepositoryPreparation,
  afterPreparation: WorkspaceRepositoryPreparation,
  versionPolicy: WorkspaceResourceVersionPolicy,
) {
  const versions = createDomainVersions(before, versionPolicy);

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
      syntax: beforePreparation.workspaceSyntax?.syntax ?? null,
    },
    repositoryId,
    timestamp,
    versions,
  });
}

export function executeWorkspaceCommand({
  createRevision,
  repositoryId,
  request,
  runtime,
  store,
  versionPolicy,
}: {
  createRevision(content: WorkspaceRepositoryContent): RepositoryRevision;
  repositoryId: string;
  request: WorkspaceCommandExecutionRequest;
  runtime: CommandRuntime;
  store: PreparedCommandStore<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation,
    RepositoryRevision
  >;
  versionPolicy: WorkspaceResourceVersionPolicy;
}) {
  const now = readCommandRuntimeNow(runtime);
  const allocatedIds: string[] = [];

  return executePreparedCommand({
    mode: request.mode,
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
      const versions = createDomainVersions(content, versionPolicy);
      const mutation = prepareWorkspaceMutation({
        command: mapWorkspaceCommand({
          context,
          createId,
          input: request,
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
        revision: createRevision(next),
      };
    },
    store,
  });
}
