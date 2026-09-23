// SPDX-License-Identifier: GPL-3.0-or-later

import {
  projectContentDocument,
  projectUnparsedContentDocument,
  type ContentDocument,
} from "../commands/index.ts";
import type {
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
  WorkspaceResourceVersionPolicy,
} from "../workspace/index.ts";

type ResourceVersion = `sha256:${string}`;

export type WorkspaceTreeNodeResource =
  | {
      folderId: string;
      kind: "folder";
      order: number;
      parentFolderId: string | null;
      title: string;
      version: ResourceVersion;
    }
  | {
      kind: "note";
      noteId: string;
      order: number;
      parentFolderId: string | null;
      title: string;
      updatedAt: string;
      version: ResourceVersion;
    };

export type WorkspaceTreeResource = {
  nodes: WorkspaceTreeNodeResource[];
  repositoryId: string;
  revision: ResourceVersion;
  version: ResourceVersion;
};

export function readWorkspaceTreeResource(
  repositoryId: string,
  revision: ResourceVersion,
  content: WorkspaceRepositoryContent,
  preparation: WorkspaceRepositoryPreparation,
  versions: WorkspaceResourceVersionPolicy,
): WorkspaceTreeResource {
  const structure = preparation.workspace;
  const nodes: WorkspaceTreeNodeResource[] = [];
  const pending = [...structure.data.tree]
    .reverse()
    .map((node, reverseIndex) => ({
      node,
      order: structure.data.tree.length - reverseIndex - 1,
      parentFolderId: null as string | null,
    }));

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) continue;
    if (current.node.kind === "note") {
      const entry = structure.noteEntryById.get(current.node.noteId);

      if (!entry) continue;
      nodes.push({
        kind: "note",
        noteId: entry.note.id,
        order: current.order,
        parentFolderId: current.parentFolderId,
        title: entry.header.title,
        updatedAt: entry.header.updatedAt,
        version: versions.note(entry.note.source),
      });
      continue;
    }
    nodes.push({
      folderId: current.node.folderId,
      kind: "folder",
      order: current.order,
      parentFolderId: current.parentFolderId,
      title: current.node.title,
      version: versions.folder(current.node.folderId, current.node.title),
    });
    for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
      const child = current.node.children[index];

      if (child) {
        pending.push({
          node: child,
          order: index,
          parentFolderId: current.node.folderId,
        });
      }
    }
  }
  return {
    nodes,
    repositoryId,
    revision,
    version: versions.tree(content, structure.data),
  };
}

export function readWorkspaceNoteResource(
  preparation: WorkspaceRepositoryPreparation,
  noteId: string,
  versions: WorkspaceResourceVersionPolicy,
  textMode: "body" | "document" = "document",
): ContentDocument | null {
  const entry = preparation.workspace.noteEntryById.get(noteId);

  if (!entry) return null;
  const version = versions.note(entry.note.source);
  const parsed = preparation.analysisIndex?.getParsedNote(noteId);
  const metadata = {
    createdAt: entry.header.createdAt,
    resourceId: noteId,
    textMode,
    title: entry.header.title,
    updatedAt: entry.header.updatedAt,
    version,
  };

  return parsed
    ? projectContentDocument({ ...metadata, analysis: parsed.analysis })
    : projectUnparsedContentDocument({ ...metadata, source: entry.note.source });
}
