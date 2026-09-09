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
import { DomainValidationError } from "../../core/errors/index.ts";
import { contentPage } from "./contentPage.ts";
import {
  resolveNamedContent,
  type NamedContentResource,
} from "./targetResolution.ts";
import type {
  ContentReadBasis,
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
  | {
      kind: "directory";
      scope: ContentScope;
      parent?: string | null;
      recursive?: boolean;
      limit?: number;
      cursor?: string;
    }
  | {
      kind: "syntax";
      scope: ContentScope;
      file?: string;
      includeSource?: boolean;
    }
  | {
      kind: "read";
      scope: ContentScope;
      resource: string;
      blockId?: string;
      subtree?: boolean;
    }
  | {
      kind: "search";
      scope: ContentScope;
      text: string;
      limit: number;
      cursor?: string;
    };

export type ContentQueryResult = {
  basis: ContentReadBasis;
  scope: ContentOperationScope;
} & (
  | {
      kind: "catalog";
      repositories: { id: string; name: string }[];
      issues: { id: string; message: string }[];
    }
  | {
      kind: "directory";
      resources: NamedContentResource[];
      nextCursor: string | null;
    }
  | {
      kind: "syntax";
      active: string | null;
      files: { id: string; name: string; source?: string }[];
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
      nextCursor: string | null;
    }
);

type QueryDocument = {
  analysis: CtnCanonicalSourceAnalysis | null;
  document: ContentDocument;
  tasks: TodoItemState[];
};
type ContentReadContext = {
  scope: ContentScope;
  basis: ContentReadBasis;
  resources: NamedContentResource[];
  syntax: CtnCompiledSyntax | null;
  syntaxFiles: { id: string; name: string; source: string }[];
  active: string | null;
  syntaxForFile(id: string): CtnCompiledSyntax;
  read(resource: NamedContentResource): QueryDocument;
};

export function contentCatalogRevision(
  catalog: {
    repositories: Pick<
      ContentCatalog["repositories"][number],
      "id" | "label"
    >[];
    issues: Pick<ContentCatalog["issues"][number], "id" | "message">[];
  },
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
  digest: ContentServicePorts["digest"],
): ContentQueryResult {
  const base = { basis: context.basis, scope: context.scope };
  if (query.kind === "directory") {
    if (context.scope.domain !== "workspace" && query.parent != null)
      throw new DomainValidationError("This domain has no folder hierarchy.");
    const parent =
      query.parent == null
        ? null
        : resolveNamedContent(
            context.resources.filter((item) => item.kind === "folder"),
            query.parent,
          ).path;
    const prefix = parent === null ? "" : `${parent}/`;
    const rows = context.resources.filter(
      (item) =>
        item.path.startsWith(prefix) &&
        (query.recursive || !item.path.slice(prefix.length).includes("/")),
    );
    const limit = query.limit ?? 100;
    const page = contentPage(rows, {
      basis: context.basis,
      cursor: query.cursor,
      limit,
      digest,
      query: {
        kind: query.kind,
        scope: context.scope,
        parent,
        recursive: query.recursive ?? false,
        limit,
      },
    });
    return {
      ...base,
      kind: query.kind,
      resources: page.items,
      nextCursor: page.nextCursor,
    };
  }
  if (query.kind === "syntax") {
    const selected = query.file
      ? resolveNamedContent(
          context.syntaxFiles.map((file) => ({ ...file, path: file.name })),
          query.file,
        )
      : context.syntaxFiles.find((file) => file.id === context.active);
    if (query.includeSource && !selected)
      throw new DomainValidationError(
        "No active syntax. Select a syntax file by name.",
      );
    const syntax = selected
      ? context.syntaxForFile(selected.id)
      : context.syntax;
    return {
      ...base,
      kind: query.kind,
      active: context.active,
      files: context.syntaxFiles.map((file) => ({
        id: file.id,
        name: file.name,
        ...(query.includeSource && selected?.id === file.id
          ? { source: file.source }
          : {}),
      })),
      guide: syntax ? projectContentSyntaxGuide(syntax) : null,
    };
  }
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
  if (!query.text.trim())
    throw new DomainValidationError("Search requires non-empty text.");
  const searchText = query.text;
  function* matches(): Generator<
    Extract<ContentQueryResult, { kind: "search" }>["results"][number]
  > {
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
        query: searchText,
      }))
        yield {
          resource,
          blockId: match.blockId,
          lineNumber:
            document.blocks.find(({ blockId }) => blockId === match.blockId)
              ?.lineNumber ?? null,
          snippet: match.snippet,
        };
    }
  }
  const page = contentPage(matches(), {
    basis: context.basis,
    cursor: query.cursor,
    limit: query.limit,
    digest,
    query: {
      kind: query.kind,
      scope: context.scope,
      text: query.text,
      limit: query.limit,
    },
  });
  return {
    ...base,
    kind: query.kind,
    results: page.items,
    nextCursor: page.nextCursor,
  };
}

function workspaceReadContext(
  scope: Extract<ContentScope, { domain: "workspace" }>,
  snapshot: PreparedVersionedSnapshot<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation,
    ContentRevision
  >,
  ports: ContentServicePorts,
  repositoryId: string,
): ContentReadContext {
  const preparation = snapshot.projection;
  return {
    scope,
    basis: { baseRevision: snapshot.revision, repositoryId },
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
          basis: {
            baseRevision: contentCatalogRevision(catalog, ports.digest),
            repositoryId: null,
          },
          repositories: catalog.repositories.map(({ id, label }) => ({
            id,
            name: label,
          })),
          issues: catalog.issues.map(({ id, message }) => ({ id, message })),
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
          repository.id,
        ),
        query,
        ports.digest,
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
        basis: { baseRevision: snapshot.revision, repositoryId: null },
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
        syntaxForFile: () => index.syntax,
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
      ports.digest,
    );
  }
  const snapshot = await (await ports.todo()).loadSnapshot();
  const index = snapshot.projection;
  return readQuery(
    {
      scope: query.scope,
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
    ports.digest,
  );
}
