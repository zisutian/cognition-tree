// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  PreparedContentCommand,
} from "../../commands/index.ts";
import {
  readCommandRuntimeNow,
  type CommandRuntime,
} from "../../commands/index.ts";
import {
  createWorkspaceSourceReplacement,
  prepareWorkspaceMutation,
  type WorkspaceDomainCommand,
  type WorkspaceDomainContext,
  type WorkspaceDomainVersions,
} from "./workspaceDomainCommands.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../../core/errors/index.ts";
import type {
  NoteTreeNode,
  WorkspaceData,
  NoteTreeNodeReference,
  WorkspaceCommandOutcome,
} from "../../../core/workspace/index.ts";


import type {
  PreparedVersionedSnapshot,
} from "../../persistence/index.ts";
import type {
  RepositoryRevision,
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
} from "../persistence/workspaceRepository.ts";

type ResourceVersion = `sha256:${string}`;

export type WorkspaceCommandIntent =
  | { kind: "create-folder"; parentFolderId: string | null; title: string }
  | {
      body: string;
      kind: "create-note";
      parentFolderId: string | null;
      title: string;
    }
  | { folderId: string; kind: "delete-folder" }
  | { kind: "delete-note"; noteId: string }
  | {
      kind: "move-block";
      sourceBlockId: string;
      sourceNoteId: string;
      targetBlockId: string | null;
      targetKind: "above" | "below" | "end" | "inside";
      targetNoteId: string;
    }
  | {
      kind: "move-tree-node";
      nodeId: string;
      nodeKind: "folder" | "note";
      parentFolderId: string | null;
      toIndex: number;
    }
  | { folderId: string; kind: "rename-folder"; title: string }
  | { kind: "rename-note"; noteId: string; title: string }
  | { editableText: string; kind: "replace-note-source"; noteId: string };

export type WorkspaceResourceVersionPolicy = {
  folder(folderId: string, title: string): ResourceVersion;
  note(source: string): ResourceVersion;
  tree(
    content: WorkspaceRepositoryContent,
    workspace: WorkspaceData,
  ): ResourceVersion;
};

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

function findFolder(
  tree: readonly NoteTreeNode[],
  folderId: string,
): Extract<NoteTreeNode, { kind: "folder" }> | null {
  const pending = [...tree];

  while (pending.length > 0) {
    const node = pending.pop();

    if (!node || node.kind === "note") continue;
    if (node.folderId === folderId) return node;
    pending.push(...node.children);
  }
  return null;
}

function findTreeChildren(
  tree: readonly NoteTreeNode[],
  parentFolderId: string | null,
) {
  return parentFolderId === null
    ? tree
    : findFolder(tree, parentFolderId)?.children ?? null;
}

function nodeReference(node: NoteTreeNode): NoteTreeNodeReference {
  return node.kind === "folder"
    ? { folderId: node.folderId, kind: "folder" }
    : { kind: "note", noteId: node.noteId };
}

function createTreeMoveRequest(
  context: WorkspaceDomainContext,
  intent: Extract<WorkspaceCommandIntent, { kind: "move-tree-node" }>,
) {
  const source: NoteTreeNodeReference = intent.nodeKind === "folder"
    ? { folderId: intent.nodeId, kind: "folder" }
    : { kind: "note", noteId: intent.nodeId };
  const children = findTreeChildren(
    context.structure.data.tree,
    intent.parentFolderId,
  );

  if (!children) {
    throw new DomainNotFoundError(
      intent.parentFolderId ?? "root",
      "Target Workspace folder does not exist",
    );
  }
  const remaining = children.filter((node) =>
    intent.nodeKind === "folder"
      ? node.kind !== "folder" || node.folderId !== intent.nodeId
      : node.kind !== "note" || node.noteId !== intent.nodeId
  );

  if (intent.toIndex > remaining.length) {
    throw new DomainValidationError(
      "Workspace tree target index is out of bounds",
    );
  }
  const target = remaining[intent.toIndex];

  return {
    destination: target
      ? { kind: "before" as const, target: nodeReference(target) }
      : intent.parentFolderId === null
        ? { kind: "root" as const }
        : { folderId: intent.parentFolderId, kind: "inside" as const },
    source,
  };
}

function requireNote(context: WorkspaceDomainContext, noteId: string) {
  const note = context.structure.data.notes.find(({ id }) => id === noteId);

  if (!note) {
    throw new DomainNotFoundError(noteId, "Workspace note does not exist");
  }
  return note;
}

function requireFolder(context: WorkspaceDomainContext, folderId: string) {
  const folder = findFolder(context.structure.data.tree, folderId);

  if (!folder) {
    throw new DomainNotFoundError(folderId, "Workspace folder does not exist");
  }
  return folder;
}

function blockTarget(
  intent: Extract<WorkspaceCommandIntent, { kind: "move-block" }>,
) {
  if (intent.targetKind === "end") {
    if (intent.targetBlockId !== null) {
      throw new DomainValidationError(
        "End block target must not include targetBlockId",
      );
    }
    return { kind: "end" as const };
  }
  if (intent.targetBlockId === null) {
    throw new DomainNotFoundError(
      "target-block",
      "Target Workspace block does not exist",
    );
  }
  return { kind: intent.targetKind, targetBlockId: intent.targetBlockId };
}

function toDomainCommand({
  context,
  createId,
  intent,
  timestamp,
  versions,
}: {
  context: WorkspaceDomainContext;
  createId(): string;
  intent: WorkspaceCommandIntent;
  timestamp: string;
  versions: WorkspaceDomainVersions;
}): WorkspaceDomainCommand {
  switch (intent.kind) {
    case "create-folder":
      return {
        ...intent,
        expectedTreeVersion: versions.tree(context.structure.data),
        folderId: `folder-${createId()}`,
        timestamp,
      };
    case "create-note":
      return {
        ...intent,
        expectedTreeVersion: versions.tree(context.structure.data),
        noteId: `note-${createId()}`,
        timestamp,
      };
    case "delete-folder":
      return {
        ...intent,
        expectedTreeVersion: versions.tree(context.structure.data),
        timestamp,
      };
    case "delete-note":
    case "rename-note": {
      const note = requireNote(context, intent.noteId);
      return {
        ...intent,
        expectedVersion: versions.note(note.source),
        timestamp,
      };
    }
    case "rename-folder": {
      const folder = requireFolder(context, intent.folderId);
      return {
        ...intent,
        expectedVersion: versions.folder(folder.folderId, folder.title),
        timestamp,
      };
    }
    case "move-block": {
      const source = requireNote(context, intent.sourceNoteId);
      const target = requireNote(context, intent.targetNoteId);
      return {
        expectedSourceVersion: versions.note(source.source),
        expectedTargetVersion: versions.note(target.source),
        kind: intent.kind,
        sourceBlockId: intent.sourceBlockId,
        sourceNoteId: intent.sourceNoteId,
        target: blockTarget(intent),
        targetNoteId: intent.targetNoteId,
        timestamp,
      };
    }
    case "move-tree-node":
      return {
        expectedTreeVersion: versions.tree(context.structure.data),
        kind: intent.kind,
        request: createTreeMoveRequest(context, intent),
        timestamp,
      };
    case "replace-note-source": {
      const note = requireNote(context, intent.noteId);
      return {
        change: createWorkspaceSourceReplacement(
          context,
          intent.noteId,
          intent.editableText,
        ),
        expectedVersion: versions.note(note.source),
        kind: intent.kind,
        noteId: intent.noteId,
        timestamp,
      };
    }
  }
}

export function prepareWorkspaceCommand({
  intent,
  runtime,
  snapshot,
  versionPolicy,
}: {
  intent: WorkspaceCommandIntent;
  runtime: CommandRuntime;
  snapshot: PreparedVersionedSnapshot<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation,
    RepositoryRevision
  >;
  versionPolicy: WorkspaceResourceVersionPolicy;
}): PreparedContentCommand<
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
  WorkspaceCommandOutcome,
  RepositoryRevision
> {
  const now = readCommandRuntimeNow(runtime);
  const context: WorkspaceDomainContext = {
    index: snapshot.projection.analysisIndex,
    structure: snapshot.projection.workspace,
    syntax: snapshot.projection.workspaceSyntax?.syntax ?? null,
  };
  const versions = createDomainVersions(snapshot.content, versionPolicy);
  const mutation = prepareWorkspaceMutation({
    command: toDomainCommand({
      context,
      createId: runtime.createId,
      intent,
      timestamp: now.timestamp,
      versions,
    }),
    context,
    createBlockId: runtime.createId,
    versions,
  });

  return {
    baseRevision: snapshot.revision,
    content: { ...snapshot.content, workspace: mutation.content },
    destructive: intent.kind === "delete-folder" ||
      intent.kind === "delete-note",
    outcome: mutation.outcome,
    projection: {
      analysisIndex: mutation.context.index,
      context: mutation.context.syntax
        ? {
            syntax: mutation.context.syntax,
            workspace: mutation.context.structure,
          }
        : null,
      syntaxById: snapshot.projection.syntaxById,
      workspace: mutation.context.structure,
      workspaceSyntax: snapshot.projection.workspaceSyntax,
    },
    timestamp: mutation.timestamp,
  };
}
