// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import { parseJournalContent } from "../../../contracts/journal/parseJournal.ts";
import { parseTodoContent } from "../../../contracts/todo/parseTodo.ts";
import type {
  ApiV1PrincipalDto,
  ApiV1SearchRequestDto,
  ApiV1SearchResponseDto,
  ApiV1SearchResultDto,
} from "../../../contracts/api/types.ts";
import type {
  WorkspaceRepositoryCatalog,
} from "../repository/repositoryCatalog.ts";
import type { ApiV1BuiltInCatalog } from "./apiV1Ports.ts";
import { ApiV1RequestError } from "./apiV1Errors.ts";
import {
  createApiV1JournalIndex,
  createApiV1TodoIndex,
  createApiV1WorkspaceAnalysis,
  createJournalEntryVersion,
  createParsedTodoCollectionVersion,
  createWorkspaceNoteVersion,
  projectApiV1JournalEntry,
  projectApiV1TodoCollection,
  projectApiV1WorkspaceNote,
} from "./apiV1Resources.ts";
import type { ApiV1Runtime } from "./apiV1Runtime.ts";

type SearchCorpus = {
  key: string;
  results: ApiV1SearchResultDto[];
};

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("und");
}

function snippet(source: string, normalizedQuery: string) {
  const normalizedSource = normalizeSearchText(source);
  const position = normalizedSource.indexOf(normalizedQuery);
  const start = Math.max(0, position < 0 ? 0 : position - 48);
  const end = Math.min(source.length, start + 160);

  return `${start > 0 ? "…" : ""}${source.slice(start, end)}${
    end < source.length ? "…" : ""
  }`;
}

function encodeCursor(key: string, offset: number) {
  return Buffer.from(JSON.stringify({ key, offset, v: 1 }), "utf8")
    .toString("base64url");
}

function decodeCursor(source: string) {
  try {
    if (source.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(source)) {
      throw new Error();
    }
    const decoded = Buffer.from(source, "base64url");

    if (decoded.toString("base64url") !== source) throw new Error();
    const value = JSON.parse(decoded.toString("utf8")) as unknown;

    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new Error();
    }
    const record = value as Record<string, unknown>;

    if (
      record.v !== 1 ||
      typeof record.key !== "string" ||
      !Number.isSafeInteger(record.offset) ||
      (record.offset as number) < 0
    ) {
      throw new Error();
    }
    return { key: record.key, offset: record.offset as number };
  } catch {
    throw new ApiV1RequestError(
      "invalid_request",
      "Search cursor is invalid",
    );
  }
}

function hasScope(
  principal: ApiV1PrincipalDto,
  scope: ApiV1PrincipalDto["scopes"][number],
) {
  return principal.scopes.includes(scope);
}

function requestedDomains(
  request: ApiV1SearchRequestDto,
  principal: ApiV1PrincipalDto,
) {
  const requested = request.domains ??
    ["workspace", "journal", "todo"] as const;

  return requested.filter((domain) => {
    const scope = `${domain}:read` as const;

    return hasScope(principal, scope);
  });
}

function includeUpdatedAt(
  updatedAt: string,
  request: ApiV1SearchRequestDto,
) {
  return !request.updatedAfter || updatedAt >= request.updatedAfter;
}

export class ApiV1SearchService {
  #cache: SearchCorpus | null = null;
  readonly #builtInCatalog: ApiV1BuiltInCatalog;
  readonly #catalog: WorkspaceRepositoryCatalog;
  readonly #runtime: ApiV1Runtime;

  constructor({
    builtInCatalog,
    catalog,
    runtime,
  }: {
    builtInCatalog: ApiV1BuiltInCatalog;
    catalog: WorkspaceRepositoryCatalog;
    runtime: ApiV1Runtime;
  }) {
    this.#builtInCatalog = builtInCatalog;
    this.#catalog = catalog;
    this.#runtime = runtime;
  }

  async search(
    request: ApiV1SearchRequestDto,
    principal: ApiV1PrincipalDto,
  ): Promise<ApiV1SearchResponseDto> {
    const domains = requestedDomains(request, principal);

    if (domains.length === 0) {
      throw new ApiV1RequestError(
        "forbidden",
        "No requested search domain is readable",
      );
    }
    const normalizedQuery = normalizeSearchText(request.query.trim());

    if (!normalizedQuery) {
      throw new ApiV1RequestError(
        "invalid_request",
        "Search query must not be empty",
      );
    }
    const corpus = await this.#createCorpus(
      request,
      principal,
      domains,
      normalizedQuery,
    );
    const cursor = request.cursor ? decodeCursor(request.cursor) : null;

    if (cursor && cursor.key !== corpus.key) {
      throw new ApiV1RequestError(
        "resource_conflict",
        "Search results changed while paging",
        { details: { restartRequired: true } },
      );
    }
    const offset = cursor?.offset ?? 0;
    const limit = request.limit ?? 20;
    const results = corpus.results.slice(offset, offset + limit);
    const nextOffset = offset + results.length;

    return {
      cursor: nextOffset < corpus.results.length
        ? encodeCursor(corpus.key, nextOffset)
        : null,
      results,
    };
  }

  async #createCorpus(
    request: ApiV1SearchRequestDto,
    principal: ApiV1PrincipalDto,
    domains: readonly ("journal" | "todo" | "workspace")[],
    normalizedQuery: string,
  ): Promise<SearchCorpus> {
    const results: ApiV1SearchResultDto[] = [];
    const revisions: Record<string, string> = {};

    if (domains.includes("workspace")) {
      const catalog = await this.#catalog.listRepositories();
      const requestedRepositoryIds = request.repositoryIds
        ? new Set(request.repositoryIds)
        : null;
      const allowedRepositoryIds = principal.repositoryIds
        ? new Set(principal.repositoryIds)
        : null;

      for (const repository of catalog.repositories) {
        if (
          requestedRepositoryIds &&
          !requestedRepositoryIds.has(repository.id)
        ) {
          continue;
        }
        if (
          allowedRepositoryIds &&
          !allowedRepositoryIds.has(repository.id)
        ) {
          continue;
        }
        const snapshot = await this.#catalog.getStore(repository.id)
          .then((store) => store.loadSnapshot());

        revisions[`workspace:${repository.id}`] = snapshot.revision;
        const analysis = createApiV1WorkspaceAnalysis(snapshot.content);

        for (const note of analysis.structure.data.notes) {
          const projected = projectApiV1WorkspaceNote(analysis, note.id);

          if (!projected || !includeUpdatedAt(projected.updatedAt, request)) {
            continue;
          }
          const version = createWorkspaceNoteVersion(note.source);
          const titleOrDocument =
            `${projected.title}\n${projected.editableText}`;

          if (normalizeSearchText(titleOrDocument).includes(normalizedQuery)) {
            results.push({
              blockId: null,
              domain: "workspace",
              repositoryId: repository.id,
              resourceId: note.id,
              snippet: snippet(titleOrDocument, normalizedQuery),
              title: projected.title,
              updatedAt: projected.updatedAt,
              version,
            });
          }
          for (const block of projected.blocks) {
            const text = `${block.text}\n${block.body ?? ""}`;

            if (!normalizeSearchText(text).includes(normalizedQuery)) continue;
            results.push({
              blockId: block.blockId,
              domain: "workspace",
              repositoryId: repository.id,
              resourceId: note.id,
              snippet: snippet(text, normalizedQuery),
              title: projected.title,
              updatedAt: block.updatedAt,
              version,
            });
          }
        }
      }
    }
    if (domains.includes("journal")) {
      const snapshot = await this.#builtInCatalog.getStore("journal")
        .then((store) => store.loadSnapshot());
      const content = parseJournalContent(snapshot.content);
      const index = createApiV1JournalIndex(content);

      revisions.journal = snapshot.revision;
      for (const parsed of index.entries) {
        const projected = projectApiV1JournalEntry(parsed);

        this.#projectCtnDocumentResults({
          document: projected,
          domain: "journal",
          normalizedQuery,
          request,
          results,
          version: createJournalEntryVersion(parsed.entry.source),
        });
      }
    }
    if (domains.includes("todo")) {
      const snapshot = await this.#builtInCatalog.getStore("todo")
        .then((store) => store.loadSnapshot());
      const content = parseTodoContent(snapshot.content);
      const index = createApiV1TodoIndex(content);

      revisions.todo = snapshot.revision;
      const now = this.#runtime.now();
      const today = this.#runtime.today(now);

      for (const parsed of index.collections) {
        const projected = projectApiV1TodoCollection(parsed, today);

        this.#projectCtnDocumentResults({
          document: projected.document,
          domain: "todo",
          normalizedQuery,
          request,
          results,
          version: createParsedTodoCollectionVersion(parsed),
        });
      }
    }
    const key = createHash("sha256").update(serializeJsonIteratively({
      domains,
      query: normalizedQuery,
      repositoryIds: request.repositoryIds ?? null,
      revisions,
      updatedAfter: request.updatedAfter ?? null,
    }, { sortObjectKeys: true })).digest("hex");
    const sorted = results.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.domain.localeCompare(right.domain) ||
      left.resourceId.localeCompare(right.resourceId) ||
      (left.blockId ?? "").localeCompare(right.blockId ?? "")
    );

    if (this.#cache?.key === key) return this.#cache;
    this.#cache = { key, results: sorted };
    return this.#cache;
  }

  #projectCtnDocumentResults({
    document,
    domain,
    normalizedQuery,
    request,
    results,
    version,
  }: {
    document: ReturnType<typeof projectApiV1JournalEntry>;
    domain: "journal" | "todo";
    normalizedQuery: string;
    request: ApiV1SearchRequestDto;
    results: ApiV1SearchResultDto[];
    version: ApiV1SearchResultDto["version"];
  }) {
    if (!includeUpdatedAt(document.updatedAt, request)) return;
    const titleOrDocument = `${document.title}\n${document.editableText}`;

    if (normalizeSearchText(titleOrDocument).includes(normalizedQuery)) {
      results.push({
        blockId: null,
        domain,
        resourceId: document.resourceId,
        snippet: snippet(titleOrDocument, normalizedQuery),
        title: document.title,
        updatedAt: document.updatedAt,
        version,
      });
    }
    for (const block of document.blocks) {
      const text = `${block.text}\n${block.body ?? ""}`;

      if (!normalizeSearchText(text).includes(normalizedQuery)) continue;
      results.push({
        blockId: block.blockId,
        domain,
        resourceId: document.resourceId,
        snippet: snippet(text, normalizedQuery),
        title: document.title,
        updatedAt: block.updatedAt,
        version,
      });
    }
  }
}
