// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiCtnDocumentDto,
  ApiWorkspaceTreeDto,
  ApiWorkspaceTreeNodeDto,
} from "../../../../contracts/api/types.ts";
import type { ContentRevisionDto } from "../../../../contracts/common/versionedContent.ts";
import type { WorkspaceRepositoryContentDto } from "../../../../contracts/workspace/types.ts";
import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";
import { projectRawCanonicalCtnBody } from "../../../../core/ctn/analysis/editableProjection.ts";
import type { CtnCompiledSyntax } from "../../../../core/ctn/syntax/types.ts";
import type { WorkspaceParseIndex } from "../../../../core/workspace/indexes/workspaceParseIndex.ts";
import type { WorkspaceStructureIndex } from "../../../../core/workspace/indexes/workspaceStructureIndex.ts";
import { projectApiCtnDocument } from "./ctn.ts";
import {
  createWorkspaceFolderVersion,
  createWorkspaceNoteVersion,
  createWorkspaceTreeVersion,
} from "./versions.ts";

export type ApiWorkspaceAnalysis = {
  parseIndex: WorkspaceParseIndex | null;
  structure: WorkspaceStructureIndex;
  syntax: CtnCompiledSyntax | null;
};

export function createApiWorkspaceAnalysis(
  content: WorkspaceRepositoryContentDto,
): ApiWorkspaceAnalysis {
  return projectApiWorkspaceAnalysis(
    prepareWorkspaceRepositoryContent(content),
  );
}

export function projectApiWorkspaceAnalysis(
  preparation: WorkspaceRepositoryPreparation,
): ApiWorkspaceAnalysis {
  return {
    parseIndex: preparation.analysisIndex,
    structure: preparation.workspace,
    syntax: preparation.workspaceSyntax?.syntax ?? null,
  };
}
export function projectApiWorkspaceTree(
  repositoryId: string,
  revision: ContentRevisionDto,
  analysis: ApiWorkspaceAnalysis,
): ApiWorkspaceTreeDto {
  const nodes: ApiWorkspaceTreeNodeDto[] = [];
  const pending = [...analysis.structure.data.tree]
    .reverse()
    .map((node, reverseIndex) => ({
      node,
      order: analysis.structure.data.tree.length - reverseIndex - 1,
      parentFolderId: null as string | null,
    }));

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) continue;
    if (current.node.kind === "note") {
      const entry = analysis.structure.noteEntryById.get(current.node.noteId);

      if (!entry) continue;
      nodes.push({
        kind: "note",
        noteId: entry.note.id,
        order: current.order,
        parentFolderId: current.parentFolderId,
        title: entry.header.title,
        updatedAt: entry.header.updatedAt,
        version: createWorkspaceNoteVersion(entry.note.source),
      });
      continue;
    }
    nodes.push({
      folderId: current.node.folderId,
      kind: "folder",
      order: current.order,
      parentFolderId: current.parentFolderId,
      title: current.node.title,
      version: createWorkspaceFolderVersion(
        current.node.folderId,
        current.node.title,
      ),
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
    version: createWorkspaceTreeVersion({
      schemaVersion: 4,
      syntax: {
        activeFileId: null,
        files: [],
      },
      workspace: analysis.structure.data,
    }),
  };
}

export function projectApiWorkspaceNote(
  analysis: ApiWorkspaceAnalysis,
  noteId: string,
): ApiCtnDocumentDto | null {
  const entry = analysis.structure.noteEntryById.get(noteId);

  if (!entry) return null;
  const version = createWorkspaceNoteVersion(entry.note.source);
  const parsed = analysis.parseIndex?.getParsedNote(noteId);

  if (parsed) {
    return projectApiCtnDocument({
      analysis: parsed.analysis,
      createdAt: entry.header.createdAt,
      resourceId: noteId,
      textMode: "document",
      title: entry.header.title,
      updatedAt: entry.header.updatedAt,
      version,
    });
  }
  return {
    blocks: [],
    createdAt: entry.header.createdAt,
    diagnostics: [],
    editableText: projectRawCanonicalCtnBody(entry.note.source),
    resourceId: noteId,
    textMode: "document",
    title: entry.header.title,
    updatedAt: entry.header.updatedAt,
    version,
    writingGuide: null,
  };
}
