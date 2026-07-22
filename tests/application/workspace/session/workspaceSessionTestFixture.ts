import { createDefaultWorkspaceSyntax } from "../../../../core/workspace/context/workspaceSyntax";
import {
  createInitialWorkspaceData,
  type WorkspaceData,
} from "../../../../core/workspace/model/workspaceData";
import type {
  LocalDraftRevision,
  RepositoryRevision,
  WorkspaceRepositoryContent,
  WorkspaceRepositorySnapshot,
} from "../../../../src/storage/repository/workspaceRepository";
import type { CtnEditableSourceChange } from "../../../../core/ctn/metadata/textEdits";
import { createCtnEditableSource } from "../../../../core/ctn/metadata/editableSource";
import { initializeCtnSourceBlockMetadata } from "../../../../core/ctn/metadata/sourceMetadata";
import { defaultCtnSyntaxProfile } from "../../../../core/ctn/syntax/defaultSyntaxProfile";

export const initialTimestamp = "2026-07-15T00:00:00.000Z";
export const initialSyntaxFileId =
  "syntax-00000000-0000-4000-8000-000000000001";

export function draftRevision(value: string): LocalDraftRevision {
  return `draft:${value}` as LocalDraftRevision;
}

export function remoteRevision(character: string): RepositoryRevision {
  return `sha256:${character.repeat(64)}` as RepositoryRevision;
}

export function createWorkspace(source = "标题\n内容"): WorkspaceData {
  let id = 0;
  const noteSource = initializeCtnSourceBlockMetadata(
    source,
    defaultCtnSyntaxProfile,
    {
      createdAt: initialTimestamp,
      createId: () =>
        `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
      reservedIds: new Set(),
      updatedAt: initialTimestamp,
    },
  );

  return {
    ...createInitialWorkspaceData(),
    notes: [{ id: "note-1", source: noteSource }],
    tree: [{ kind: "note", noteId: "note-1" }],
  };
}

export function createContent(
  name = "测试工作区",
  source = "标题\n内容",
): WorkspaceRepositoryContent {
  const syntax = createDefaultWorkspaceSyntax();

  return {
    schemaVersion: 4,
    syntax: {
      activeFileId: initialSyntaxFileId,
      files: [{ id: initialSyntaxFileId, source: syntax.source }],
    },
    workspace: {
      ...createWorkspace(source),
      name,
    },
  };
}

export function createSnapshot({
  conflictRevision = null,
  content = createContent(),
  localRevision = draftRevision("initial"),
  pendingChanges = false,
  remoteRevision: revision = remoteRevision("a"),
}: Partial<WorkspaceRepositorySnapshot> = {}): WorkspaceRepositorySnapshot {
  return {
    conflictRevision,
    content,
    localRevision,
    pendingChanges,
    remoteRevision: revision,
  };
}

export function replaceEditableSource(
  canonicalSource: string,
  source: string,
): CtnEditableSourceChange {
  const previousSource = createCtnEditableSource(
    canonicalSource,
    defaultCtnSyntaxProfile,
  ).source;

  return {
    edits: [{ from: 0, insertedText: source, to: previousSource.length }],
    source,
  };
}
