// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  AgentScopeUnavailableError,
  AgentScopeViolationError,
  assertAgentResourceInScope,
  resolveWorkspaceAgentScope,
} from "../../../application/agent/agentScope.ts";
import type { WorkspaceData } from "../../../core/workspace/model/workspaceData.ts";

const workspace: WorkspaceData = {
  id: "workspace-1",
  name: "Scope",
  notes: [
    { id: "note-a", source: "a" },
    { id: "note-b", source: "b" },
    { id: "note-c", source: "c" },
  ],
  tree: [{
    children: [
      { kind: "note", noteId: "note-a" },
      {
        children: [{ kind: "note", noteId: "note-b" }],
        folderId: "folder-child",
        kind: "folder",
        title: "Child",
      },
    ],
    folderId: "folder-root",
    kind: "folder",
    title: "Root",
  }, { kind: "note", noteId: "note-c" }],
};

describe("Agent hard scope", () => {
  it("resolves a folder by stable id and includes only its descendants", () => {
    const scope = {
      domain: "workspace" as const,
      repositoryId: "repository-1",
      target: { folderId: "folder-root", kind: "folder" as const },
    };
    const resolved = resolveWorkspaceAgentScope(scope, workspace);

    expect([...resolved.folderIds!].sort()).toEqual([
      "folder-child",
      "folder-root",
    ]);
    expect([...resolved.noteIds].sort()).toEqual(["note-a", "note-b"]);
    expect(() => assertAgentResourceInScope(scope, {
      domain: "workspace",
      noteId: "note-c",
      workspace,
    })).toThrow(AgentScopeViolationError);
  });

  it("makes the scope unavailable when its stable root disappears", () => {
    expect(() => resolveWorkspaceAgentScope({
      domain: "workspace",
      repositoryId: "repository-1",
      target: { folderId: "missing", kind: "folder" },
    }, workspace)).toThrow(AgentScopeUnavailableError);
  });

  it("never lets exact Journal or Todo scopes expand", () => {
    expect(() => assertAgentResourceInScope({
      domain: "journal",
      entryIds: ["entry-1"],
    }, {
      domain: "journal",
      entryId: "entry-2",
    })).toThrow(AgentScopeViolationError);
    expect(() => assertAgentResourceInScope({
      collectionIds: ["collection-1"],
      domain: "todo",
    }, {
      collectionId: "collection-2",
      domain: "todo",
    })).toThrow(AgentScopeViolationError);
  });
});
