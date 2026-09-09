// SPDX-License-Identifier: GPL-3.0-or-later

import {
  projectContentDocument,
  projectUnparsedContentDocument,
  projectContentSyntaxGuide,
  readCommandRuntimeNow,
  type ContentDocument,
  type ContentSyntaxGuide,
} from "../commands/index.ts";
import {
  projectSearchDocumentResults,
  type SearchDocument,
} from "../search/index.ts";
import type { ContentOperationScope } from "../operations/index.ts";
import type { PreparedVersionedSnapshot } from "../persistence/index.ts";
import { projectTodoItemStates, type TodoItemState } from "../todo/index.ts";
import type {
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
} from "../workspace/index.ts";
import {
  CtnContentEditError,
  projectCtnContentRange,
  type CtnCanonicalSourceAnalysis,
  type CtnCompiledSyntax,
} from "../../core/ctn/index.ts";
import { listWorkspaceResourcePaths } from "../../core/workspace/index.ts";
import {
  resolveNamedContent,
  type NamedContentResource,
} from "./targetResolution.ts";
import type {
  ContentCatalog,
  ContentRevision,
  ContentServicePorts,
} from "./contentPorts.ts";

export type ContentScope = Exclude<
  ContentOperationScope,
  { domain: "catalog" }
>;
export type ContentQuery =
  | { kind: "catalog" }
  | { kind: "directory"; scope: ContentScope }
  | { kind: "syntax"; scope: ContentScope }
  | {
      kind: "read";
      scope: ContentScope;
      resource: string;
      blockId?: string;
      subtree?: boolean;
    }
  | { kind: "search"; scope: ContentScope; text: string; limit: number };

export type ContentQueryResult = {
  baseRevision: ContentRevision;
  scope: ContentOperationScope;
} & (
  | {
      kind: "catalog";
      repositories: { id: string; name: string }[];
      issues: { id: string; message: string }[];
    }
  | { kind: "directory"; resources: NamedContentResource[] }
  | {
      kind: "syntax";
      active: string | null;
      files: { id: string; name: string; source: string }[];
      guide: ContentSyntaxGuide | null;
    }
  | {
      kind: "read";
      resource: NamedContentResource;
      document: ContentDocument;
      range: { from: number; to: number };
      tasks: TodoItemState[];
    }
  | {
      kind: "search";
      results: {
        resource: NamedContentResource;
        blockId: string | null;
        lineNumber: number | null;
        snippet: string;
      }[];
      truncated: boolean;
    }
);

type QueryDocument = {
  analysis: CtnCanonicalSourceAnalysis | null;
  document: ContentDocument;
  tasks: TodoItemState[];
};
type ContentReadContext = {
  scope: ContentScope;
  revision: ContentRevision;
  resources: NamedContentResource[];
  syntax: CtnCompiledSyntax | null;
  syntaxFiles: { id: string; name: string; source: string }[];
  active: string | null;
  read(resource: NamedContentResource): QueryDocument;
};

export function contentCatalogRevision(
  catalog: ContentCatalog,
  digest: ContentServicePorts["digest"],
) {
  return digest({
    repositories: catalog.repositories
      .map(({ id, label }) => ({ id, label }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    issues: catalog.issues
      .map(({ id, message }) => ({ id, message }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

function readQuery(
  context: ContentReadContext,
  query: Exclude<ContentQuery, { kind: "catalog" }>,
): ContentQueryResult {
  const base = { baseRevision: context.revision, scope: context.scope };
  if (query.kind === "directory")
    return { ...base, kind: query.kind, resources: context.resources };
  if (query.kind === "syntax")
    return {
      ...base,
      kind: query.kind,
      active: context.active,
      files: context.syntaxFiles,
      guide: context.syntax ? projectContentSyntaxGuide(context.syntax) : null,
    };
  if (query.kind === "read") {
    const resource = resolveNamedContent(
      context.resources.filter(({ kind }) => kind !== "folder"),
      query.resource,
    );
    const { analysis, document, tasks } = context.read(resource);
    if (!analysis && query.blockId)
      throw new CtnContentEditError(
        "missing-block",
        "An active syntax is required to address blocks. Read the whole resource or activate a syntax.",
      );
    const range = analysis
      ? projectCtnContentRange(
          analysis,
          "body",
          query.blockId ?? null,
          query.subtree ?? false,
        )
      : {
          from: 0,
          to: document.editableText.length,
          text: document.editableText,
        };
    const blocks = document.blocks.filter(
      ({ sourceRange }) =>
        sourceRange.from >= range.from && sourceRange.to <= range.to,
    );
    const ids = new Set(blocks.map(({ blockId }) => blockId));
    return {
      ...base,
      kind: query.kind,
      resource,
      document: {
        ...document,
        blocks,
        editableText: range.text,
        diagnostics: query.blockId
          ? document.diagnostics.filter(({ lineNumber }) =>
              blocks.some(
                (block) =>
                  lineNumber >= block.lineNumber &&
                  lineNumber <= block.endLineNumber,
              ),
            )
          : document.diagnostics,
      },
      range: { from: range.from, to: range.to },
      tasks: tasks.filter(({ blockId }) => ids.has(blockId)),
    };
  }
  const results: Extract<ContentQueryResult, { kind: "search" }>["results"] =
    [];
  if (
    !query.text.trim() ||
    !Number.isInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > 100
  )
    throw new Error("Search requires text and a limit between 1 and 100.");
  for (const resource of context.resources) {
    if (resource.kind === "folder") continue;
    const document = context.read(resource).document;
    const input: SearchDocument =
      context.scope.domain === "workspace"
        ? {
            ...document,
            title: resource.path,
            domain: "workspace",
            repositoryId: context.scope.repository,
          }
        : { ...document, title: resource.path, domain: context.scope.domain };
    for (const match of projectSearchDocumentResults(input, {
      query: query.text,
    })) {
      if (results.length === query.limit)
        return { ...base, kind: query.kind, results, truncated: true };
      results.push({
        resource,
        blockId: match.blockId,
        lineNumber:
          document.blocks.find(({ blockId }) => blockId === match.blockId)
            ?.lineNumber ?? null,
        snippet: match.snippet,
      });
    }
  }
  return { ...base, kind: query.kind, results, truncated: false };
}

function workspaceReadContext(
  scope: Extract<ContentScope, { domain: "workspace" }>,
  snapshot: PreparedVersionedSnapshot<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation,
    ContentRevision
  >,
  ports: ContentServicePorts,
): ContentReadContext {
  const preparation = snapshot.projection;
  return {
    scope,
    revision: snapshot.revision,
    resources: listWorkspaceResourcePaths(preparation.workspace),
    syntax: preparation.workspaceSyntax?.syntax ?? null,
    active: snapshot.content.syntax.activeFileId,
    syntaxFiles: snapshot.content.syntax.files.map((file) => ({
      ...file,
      name: preparation.syntaxById.get(file.id)!.syntax.name,
    })),
    read(resource) {
      const parsed = preparation.analysisIndex?.getParsedNote(resource.id);
      const { header, note } = preparation.workspace.noteEntryById.get(
        resource.id,
      )!;
      if (!parsed)
        return {
          analysis: null,
          document: projectUnparsedContentDocument({
            source: note.source,
            createdAt: header.createdAt,
            resourceId: resource.id,
            textMode: "body",
            title: resource.name,
            updatedAt: header.updatedAt,
            version: ports.versions.workspace.note(note.source),
          }),
          tasks: [],
        };
      return {
        analysis: parsed.analysis,
        document: projectContentDocument({
          analysis: parsed.analysis,
          createdAt: header.createdAt,
          resourceId: resource.id,
          textMode: "body",
          title: resource.name,
          updatedAt: header.updatedAt,
          version: ports.versions.workspace.note(parsed.source),
        }),
        tasks: [],
      };
    },
  };
}

export async function queryContent(
  ports: ContentServicePorts,
  query: ContentQuery,
): Promise<ContentQueryResult> {
  if (query.kind === "catalog" || query.scope.domain === "workspace") {
    return ports.catalog.run(async (session) => {
      const catalog = await session.read();
      if (query.kind === "catalog")
        return {
          kind: "catalog",
          scope: { domain: "catalog" },
          baseRevision: contentCatalogRevision(catalog, ports.digest),
          repositories: catalog.repositories.map(({ id, label }) => ({
            id,
            name: label,
          })),
          issues: catalog.issues,
        };
      if (query.scope.domain !== "workspace")
        throw new Error("Invalid workspace scope.");
      const repository = resolveNamedContent(
        catalog.repositories.map(({ id, label }) => ({
          id,
          name: label,
          path: label,
        })),
        query.scope.repository,
      );
      const store = await session.getStore(repository.id);
      return readQuery(
        workspaceReadContext(
          { domain: "workspace", repository: repository.name },
          await store.loadSnapshot(),
          ports,
        ),
        query,
      );
    });
  }
  if (query.scope.domain === "journal") {
    const snapshot = await (await ports.journal()).loadSnapshot();
    const index = snapshot.projection;
    const resources = index.entries.map(({ entry, title }) => ({
      id: entry.id,
      kind: "entry" as const,
      name: title,
      path: title,
    }));
    return readQuery(
      {
        scope: query.scope,
        revision: snapshot.revision,
        resources,
        syntax: index.syntax,
        active: "journal",
        syntaxFiles: [
          {
            id: "journal",
            name: index.syntax.name,
            source: snapshot.content.syntaxSource,
          },
        ],
        read(resource) {
          const parsed = index.entries.find(
            ({ entry }) => entry.id === resource.id,
          )!;
          const analysis = index.getParsedEntry(parsed.entry.id)!.analysis;
          return {
            analysis,
            document: projectContentDocument({
              analysis,
              createdAt: parsed.entry.createdAt,
              resourceId: resource.id,
              textMode: "body",
              title: resource.name,
              updatedAt: parsed.entry.updatedAt,
              version: ports.versions.journal.entry(parsed.entry.source),
            }),
            tasks: [],
          };
        },
      },
      query,
    );
  }
  const snapshot = await (await ports.todo()).loadSnapshot();
  const index = snapshot.projection;
  return readQuery(
    {
      scope: query.scope,
      revision: snapshot.revision,
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
      read(resource) {
        const collection = index.collections.find(
          ({ collection }) => collection.id === resource.id,
        )!;
        const parsed = index.getParsedCollection(collection.collection.id)!;
        const blocks = parsed.analysis.document.blocks;
        return {
          analysis: parsed.analysis,
          document: projectContentDocument({
            analysis: parsed.analysis,
            createdAt: blocks[0]!.metadata.createdAt,
            resourceId: resource.id,
            textMode: "body",
            title: resource.name,
            updatedAt: blocks.reduce(
              (latest, block) =>
                latest > block.metadata.updatedAt
                  ? latest
                  : block.metadata.updatedAt,
              blocks[0]!.metadata.updatedAt,
            ),
            version: ports.versions.todo.collection(parsed),
          }),
          tasks: projectTodoItemStates(
            parsed,
            ports.runtime.today(readCommandRuntimeNow(ports.runtime).date),
            ports.versions.todo.itemState,
          ),
        };
      },
    },
    query,
  );
}
