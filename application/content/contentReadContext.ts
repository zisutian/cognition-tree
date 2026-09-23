// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentDocument } from "../commands/index.ts";
import { projectTodoItemStates, type TodoItemState } from "../todo/index.ts";
import type {
  CtnCanonicalSourceAnalysis,
  CtnCompiledSyntax,
} from "../../core/ctn/index.ts";
import {
  isTodoCollectionId,
  type TodoLocalDate,
} from "../../core/todo/index.ts";
import { isJournalEntryId } from "../../core/journal/index.ts";
import { DomainNotFoundError } from "../../core/errors/index.ts";
import { listWorkspaceResourcePaths } from "../../core/workspace/index.ts";
import type { NamedContentResource } from "./targetResolution.ts";
import { readWorkspaceNoteResource } from "./workspaceResources.ts";
import { projectJournalEntryResource } from "./journalResources.ts";
import { projectTodoCollectionDocument } from "./todoResources.ts";
import type {
  ContentJournalStore,
  ContentReadBasis,
  ContentScope,
  ContentServicePorts,
  ContentTodoStore,
  ContentWorkspaceStore,
} from "./contentPorts.ts";

export type ContentReadContext = {
  scope: ContentScope;
  basis: ContentReadBasis;
  resources: NamedContentResource[];
  syntax: CtnCompiledSyntax | null;
  syntaxFiles: { id: string; name: string; source: string }[];
  active: string | null;
  syntaxForFile(id: string): CtnCompiledSyntax;
  read(resource: NamedContentResource): {
    analysis: CtnCanonicalSourceAnalysis | null;
    document: ContentDocument;
  };
  readTasks?(
    resource: NamedContentResource,
    blockIds: ReadonlySet<string>,
  ): TodoItemState[];
};

export function createWorkspaceContentReadContext(
  snapshot: Awaited<ReturnType<ContentWorkspaceStore["loadSnapshot"]>>,
  repository: { id: string; name: string },
  versions: ContentServicePorts["versions"]["workspace"],
): ContentReadContext {
  const preparation = snapshot.projection;
  return {
    scope: { domain: "workspace", repository: repository.name },
    basis: { baseRevision: snapshot.revision, repositoryId: repository.id },
    resources: listWorkspaceResourcePaths(preparation.workspace),
    syntax: preparation.workspaceSyntax?.syntax ?? null,
    active: snapshot.content.syntax.activeFileId,
    syntaxFiles: snapshot.content.syntax.files.map((file) => ({
      ...file,
      name: preparation.syntaxById.get(file.id)!.syntax.name,
    })),
    syntaxForFile: (id) => preparation.syntaxById.get(id)!.syntax,
    read(resource) {
      const parsed = preparation.analysisIndex?.getParsedNote(resource.id);
      const document = readWorkspaceNoteResource(
        preparation,
        resource.id,
        versions,
        "body",
      );

      if (!document) throw new DomainNotFoundError(resource.id, "Prepared Workspace note is missing.");
      return { analysis: parsed?.analysis ?? null, document };
    },
  };
}

export function createJournalContentReadContext(
  snapshot: Awaited<ReturnType<ContentJournalStore["loadSnapshot"]>>,
  versions: ContentServicePorts["versions"]["journal"],
): ContentReadContext {
  const index = snapshot.projection;
  return {
    scope: { domain: "journal" },
    basis: { baseRevision: snapshot.revision, repositoryId: null },
    resources: index.entries.map(({ entry, title }) => ({
      id: entry.id,
      kind: "entry",
      name: title,
      path: title,
    })),
    syntax: index.syntax,
    active: "journal",
    syntaxFiles: [
      {
        id: "journal",
        name: index.syntax.name,
        source: snapshot.content.syntaxSource,
      },
    ],
    syntaxForFile: () => index.syntax,
    read(resource) {
      const parsed = isJournalEntryId(resource.id)
        ? index.getParsedEntry(resource.id)
        : null;
      if (!parsed)
        throw new DomainNotFoundError(
          resource.id,
          "Prepared Journal entry is missing.",
        );
      return {
        analysis: parsed.analysis,
        document: projectJournalEntryResource(parsed, versions),
      };
    },
  };
}

export function createTodoContentReadContext(
  snapshot: Awaited<ReturnType<ContentTodoStore["loadSnapshot"]>>,
  versions: ContentServicePorts["versions"]["todo"],
  readToday: () => TodoLocalDate,
): ContentReadContext {
  const index = snapshot.projection;
  function readCollection(resource: NamedContentResource) {
    const parsed = isTodoCollectionId(resource.id)
      ? index.getParsedCollection(resource.id)
      : null;
    if (!parsed)
      throw new DomainNotFoundError(
        resource.id,
        "Prepared Todo collection is missing.",
      );
    return parsed;
  }
  return {
    scope: { domain: "todo" },
    basis: { baseRevision: snapshot.revision, repositoryId: null },
    resources: index.collections.map(({ collection, name }) => ({
      id: collection.id,
      kind: "collection",
      name,
      path: name,
    })),
    syntax: index.syntax,
    active: "todo",
    syntaxFiles: [
      {
        id: "todo",
        name: index.syntax.name,
        source: snapshot.content.syntaxSource,
      },
    ],
    syntaxForFile: () => index.syntax,
    read(resource) {
      const parsed = readCollection(resource);
      return {
        analysis: parsed.analysis,
        document: projectTodoCollectionDocument(parsed, versions),
      };
    },
    readTasks(resource, blockIds) {
      if (blockIds.size === 0) return [];
      return projectTodoItemStates(
        readCollection(resource),
        readToday(),
        versions.itemState,
        blockIds,
      );
    },
  };
}
