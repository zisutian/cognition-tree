// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  NoteTreeNode,
  WorkspaceData,
} from "../../core/workspace/model/workspaceData.ts";
import type { AgentScope } from "./agentTypes.ts";

export class AgentScopeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentScopeUnavailableError";
  }
}

export class AgentScopeViolationError extends Error {
  constructor(message = "Agent tool target is outside the session scope") {
    super(message);
    this.name = "AgentScopeViolationError";
  }
}

function collectFolderScope(
  tree: readonly NoteTreeNode[],
  folderId: string,
) {
  const pending = [...tree];

  while (pending.length > 0) {
    const node = pending.pop();

    if (!node || node.kind === "note") continue;
    if (node.folderId !== folderId) {
      pending.push(...node.children);
      continue;
    }
    const folderIds = new Set<string>();
    const noteIds = new Set<string>();
    const scoped = [node];

    while (scoped.length > 0) {
      const current = scoped.pop()!;

      folderIds.add(current.folderId);
      for (const child of current.children) {
        if (child.kind === "folder") scoped.push(child);
        else noteIds.add(child.noteId);
      }
    }
    return { folderIds, noteIds };
  }
  return null;
}

export function resolveWorkspaceAgentScope(
  scope: Extract<AgentScope, { domain: "workspace" }>,
  workspace: WorkspaceData,
) {
  if (scope.target.kind === "repository") {
    return {
      folderIds: null,
      noteIds: new Set(workspace.notes.map(({ id }) => id)),
    };
  }
  if (scope.target.kind === "note") {
    const noteId = scope.target.noteId;

    if (!workspace.notes.some(({ id }) => id === noteId)) {
      throw new AgentScopeUnavailableError(
        "The note selected as the Agent scope no longer exists",
      );
    }
    return { folderIds: new Set<string>(), noteIds: new Set([noteId]) };
  }
  const resolved = collectFolderScope(workspace.tree, scope.target.folderId);

  if (!resolved) {
    throw new AgentScopeUnavailableError(
      "The folder selected as the Agent scope no longer exists",
    );
  }
  return resolved;
}

export function assertAgentResourceInScope(
  scope: AgentScope,
  target:
    | { domain: "journal"; entryId: string }
    | { collectionId: string; domain: "todo" }
    | {
        domain: "workspace";
        folderId?: string;
        noteId?: string;
        workspace: WorkspaceData;
      },
) {
  if (scope.domain !== target.domain) {
    throw new AgentScopeViolationError();
  }
  if (scope.domain === "journal" && target.domain === "journal") {
    if (scope.entryIds !== null && !scope.entryIds.includes(target.entryId)) {
      throw new AgentScopeViolationError();
    }
    return;
  }
  if (scope.domain === "todo" && target.domain === "todo") {
    if (
      scope.collectionIds !== null &&
      !scope.collectionIds.includes(target.collectionId)
    ) {
      throw new AgentScopeViolationError();
    }
    return;
  }
  if (scope.domain === "workspace" && target.domain === "workspace") {
    const resolved = resolveWorkspaceAgentScope(scope, target.workspace);

    if (target.noteId && !resolved.noteIds.has(target.noteId)) {
      throw new AgentScopeViolationError();
    }
    if (
      target.folderId &&
      resolved.folderIds !== null &&
      !resolved.folderIds.has(target.folderId)
    ) {
      throw new AgentScopeViolationError();
    }
  }
}
