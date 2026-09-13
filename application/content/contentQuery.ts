// SPDX-License-Identifier: GPL-3.0-or-later

import {
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
import type { TodoItemState } from "../todo/index.ts";
import {
  CtnContentEditError,
  projectCtnContentRange,
} from "../../core/ctn/index.ts";
import { DomainValidationError } from "../../core/errors/index.ts";
import { contentPage } from "./contentPage.ts";
import {
  resolveNamedContent,
  type NamedContentResource,
} from "./targetResolution.ts";
import type {
  ContentReadBasis,
  ContentCatalog,
  ContentScope,
  ContentServicePorts,
} from "./contentPorts.ts";

import {
  createWorkspaceContentReadContext,
  createJournalContentReadContext,
  createTodoContentReadContext,
  type ContentReadContext,
} from "./contentReadContext.ts";

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
    const { analysis, document } = context.read(resource);
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
      tasks: context.readTasks?.(resource, ids) ?? [],
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
      const documentMatches = projectSearchDocumentResults(input, {
        query: searchText,
      });
      if (documentMatches.length === 0) continue;
      const lineByBlockId = new Map(
        document.blocks.map((block) => [block.blockId, block.lineNumber]),
      );
      for (const match of documentMatches)
        yield {
          resource,
          blockId: match.blockId,
          lineNumber:
            match.blockId === null
              ? null
              : (lineByBlockId.get(match.blockId) ?? null),
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
        createWorkspaceContentReadContext(
          await store.loadSnapshot(),
          repository,
          ports.versions.workspace,
        ),
        query,
        ports.digest,
      );
    });
  }
  const context =
    query.scope.domain === "journal"
      ? createJournalContentReadContext(
          await (await ports.journal()).loadSnapshot(),
          ports.versions.journal,
        )
      : createTodoContentReadContext(
          await (await ports.todo()).loadSnapshot(),
          ports.versions.todo,
          () => ports.runtime.today(readCommandRuntimeNow(ports.runtime).date),
        );
  return readQuery(context, query, ports.digest);
}
