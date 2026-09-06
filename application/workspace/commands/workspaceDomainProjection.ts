// SPDX-License-Identifier: GPL-3.0-or-later

import {
  removeCtnBlockMetadataLines,
  createMyersTextEdits,
} from "../../../core/ctn/index.ts";

import type { WorkspaceData } from "../../../core/workspace/index.ts";
import {
  createDomainChangeSet,
  type DomainResourceChange,
} from "../../../core/sync/index.ts";
import {
  projectDomainTextEdits,
  type DomainMutationProjection,
} from "../../commands/index.ts";
import {
  type WorkspaceDomainContext,
  type WorkspaceDomainVersions,
} from "./workspaceDomainCommands.ts";

type ResourceVersion = `sha256:${string}`;

type IndexedTreeNode =
  | {
      id: string;
      kind: "folder";
      order: number;
      parentFolderId: string | null;
      title: string;
      version: ResourceVersion;
    }
  | {
      id: string;
      kind: "note";
      order: number;
      parentFolderId: string | null;
      source: string;
      version: ResourceVersion;
    };

function indexTree(
  context: WorkspaceDomainContext,
  versions: WorkspaceDomainVersions,
) {
  const nodes = new Map<string, IndexedTreeNode>();

  for (const [id, entry] of context.structure.folderEntryById) {
    nodes.set(id, {
      id,
      kind: "folder",
      order: entry.path.index,
      parentFolderId: entry.parentFolderId,
      title: entry.node.title,
      version: versions.folder(id, entry.node.title),
    });
  }
  for (const [id, entry] of context.structure.noteEntryById) {
    nodes.set(id, {
      id,
      kind: "note",
      order: entry.path.index,
      parentFolderId: entry.parentFolderId,
      source: entry.note.source,
      version: versions.note(entry.note.source),
    });
  }
  return nodes;
}

function workspaceEditableText(
  context: WorkspaceDomainContext,
  noteId: string,
) {
  const parsed = context.index?.getParsedNote(noteId);

  if (parsed) return parsed.analysis.editableProjection.source;
  const source = context.structure.noteEntryById.get(noteId)?.note.source;

  if (!source) return "";
  return removeCtnBlockMetadataLines(source)
    .split("\n")
    .slice(1)
    .join("\n");
}

export function projectWorkspaceMutation({
  after,
  afterContext,
  before,
  beforeContext,
  repositoryId,
  timestamp,
  versions,
}: {
  after: WorkspaceData;
  afterContext: WorkspaceDomainContext;
  before: WorkspaceData;
  beforeContext: WorkspaceDomainContext;
  repositoryId: string;
  timestamp: string;
  versions: WorkspaceDomainVersions;
}): DomainMutationProjection {
  const beforeNodes = indexTree(beforeContext, versions);
  const afterNodes = indexTree(afterContext, versions);
  const resources: DomainResourceChange[] = [];
  const changedNoteIds = new Set<string>();

  for (const [id, node] of beforeNodes) {
    if (afterNodes.has(id)) continue;
    resources.push({
      domain: "workspace",
      kind: "deleted",
      repositoryId,
      resourceId: id,
    });
    if (node.kind === "note") changedNoteIds.add(id);
  }
  for (const [id, node] of afterNodes) {
    const previous = beforeNodes.get(id);

    if (!previous) {
      resources.push({
        domain: "workspace",
        kind: "created",
        repositoryId,
        resourceId: id,
        version: node.version,
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
        version: node.version,
      });
    }
    if (previous.version !== node.version) {
      resources.push({
        domain: "workspace",
        kind: "updated",
        repositoryId,
        resourceId: id,
        version: node.version,
      });
      if (node.kind === "note") changedNoteIds.add(id);
    }
  }
  const beforeTreeVersion = versions.tree(before);
  const afterTreeVersion = versions.tree(after);

  if (beforeTreeVersion !== afterTreeVersion) {
    resources.push({
      domain: "workspace",
      kind: "updated",
      repositoryId,
      resourceId: "tree",
      version: afterTreeVersion,
    });
  }
  const blocks = [...changedNoteIds].flatMap((noteId) => {
    const previous = beforeContext.index?.getParsedNote(noteId);
    const next = afterContext.index?.getParsedNote(noteId);

    return createDomainChangeSet({
      next: next
        ? {
            document: next.analysis.document,
            domain: "workspace",
            repositoryId,
            resourceId: noteId,
            version: versions.note(next.note.source),
          }
        : null,
      occurredAt: timestamp,
      previous: previous
        ? {
            document: previous.analysis.document,
            domain: "workspace",
            repositoryId,
            resourceId: noteId,
            version: versions.note(previous.note.source),
          }
        : null,
    }).blocks;
  });
  const diff = [...changedNoteIds].flatMap((noteId) =>
    projectDomainTextEdits(
      noteId,
      createMyersTextEdits(
        workspaceEditableText(beforeContext, noteId),
        workspaceEditableText(afterContext, noteId),
      ),
    )
  );

  return {
    changes: { blocks, occurredAt: timestamp, resources },
    diff,
  };
}
