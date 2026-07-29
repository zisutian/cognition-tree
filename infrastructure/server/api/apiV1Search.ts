// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  createSearchQuery,
  SearchRequestError,
  type SearchDocument,
  type SearchDomain,
  type SearchFault,
  type SearchRequest,
  type SearchSource,
} from "../../../application/search/searchQuery.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import { parseJournalContent } from "../../../contracts/journal/parseJournal.ts";
import { parseTodoContent } from "../../../contracts/todo/parseTodo.ts";
import type {
  ApiV1CtnDocumentDto,
  ApiV1PrincipalDto,
  ApiV1SearchRequestDto,
  ApiV1SearchResponseDto,
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
  projectApiV1JournalEntry,
  projectApiV1TodoCollection,
  projectApiV1WorkspaceNote,
} from "./apiV1Resources.ts";
import type { ApiV1Runtime } from "./apiV1Runtime.ts";

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

function mapDocument(
  document: ApiV1CtnDocumentDto,
  domain: SearchDomain,
  repositoryId?: string,
): SearchDocument {
  return {
    blocks: document.blocks.map(({ blockId, body, text, updatedAt }) => ({
      blockId,
      body,
      text,
      updatedAt,
    })),
    domain,
    editableText: document.editableText,
    ...(repositoryId ? { repositoryId } : {}),
    resourceId: document.resourceId,
    title: document.title,
    updatedAt: document.updatedAt,
    version: document.version,
  };
}

function sourceFault(
  domain: SearchDomain,
  repositoryId?: string,
): SearchSource["createFault"] {
  return (error) => {
    const invalid = error instanceof Error &&
      /(?:contract|corrupt|invalid|syntax|validation)/i.test(
        `${error.name} ${error.message}`,
      );

    return {
      code: invalid ? "source_invalid" : "source_unavailable",
      domain,
      message: invalid
        ? "Search source contains invalid data"
        : "Search source is unavailable",
      ...(repositoryId ? { repositoryId } : {}),
    };
  };
}

function mapWorkspaceIssue(
  issue: Awaited<
    ReturnType<WorkspaceRepositoryCatalog["listRepositories"]>
  >["issues"][number],
): SearchFault {
  return {
    code: issue.code === "repository_corrupt" ||
        issue.code === "unsupported_repository_version"
      ? "source_invalid"
      : "source_unavailable",
    domain: "workspace",
    message: issue.code === "repository_corrupt" ||
        issue.code === "unsupported_repository_version"
      ? "Workspace search source contains invalid data"
      : "Workspace search source is unavailable",
    repositoryId: issue.id,
  };
}

export class ApiV1SearchService {
  readonly #query;

  constructor({
    builtInCatalog,
    catalog,
    runtime,
  }: {
    builtInCatalog: ApiV1BuiltInCatalog;
    catalog: WorkspaceRepositoryCatalog;
    runtime: ApiV1Runtime;
  }) {
    this.#query = createSearchQuery<ApiV1PrincipalDto>({
      createCorpusKey: (value) =>
        createHash("sha256")
          .update(serializeJsonIteratively(value, { sortObjectKeys: true }))
          .digest("hex"),
      sourceProvider: {
        async listSources(request, principal) {
          const domains = new Set(request.domains ?? []);
          const faults: SearchFault[] = [];
          const sources: SearchSource[] = [];

          if (domains.has("workspace")) {
            try {
              const workspaceCatalog = await catalog.listRepositories();
              const requestedIds = request.repositoryIds
                ? new Set(request.repositoryIds)
                : null;
              const allowedIds = principal.repositoryIds
                ? new Set(principal.repositoryIds)
                : null;
              const allows = (repositoryId: string) =>
                (!requestedIds || requestedIds.has(repositoryId)) &&
                (!allowedIds || allowedIds.has(repositoryId));

              faults.push(
                ...workspaceCatalog.issues
                  .filter(({ id }) => allows(id))
                  .map(mapWorkspaceIssue),
              );
              for (
                const repository of workspaceCatalog.repositories.filter(
                  ({ id }) => allows(id),
                )
              ) {
                sources.push({
                  createFault: sourceFault("workspace", repository.id),
                  domain: "workspace",
                  async load() {
                    const snapshot = await catalog.getStore(repository.id)
                      .then((store) => store.loadSnapshot());
                    const analysis = createApiV1WorkspaceAnalysis(
                      snapshot.content,
                    );
                    const documents = analysis.structure.data.notes.flatMap(
                      (note) => {
                        const projected = projectApiV1WorkspaceNote(
                          analysis,
                          note.id,
                        );

                        return projected
                          ? [mapDocument(
                              projected,
                              "workspace",
                              repository.id,
                            )]
                          : [];
                      },
                    );

                    return { documents, revision: snapshot.revision };
                  },
                  repositoryId: repository.id,
                });
              }
            } catch {
              faults.push({
                code: "source_unavailable",
                domain: "workspace",
                message: "Workspace search catalog is unavailable",
              });
            }
          }
          if (domains.has("journal")) {
            sources.push({
              createFault: sourceFault("journal"),
              domain: "journal",
              async load() {
                const snapshot = await builtInCatalog.getStore("journal")
                  .then((store) => store.loadSnapshot());
                const content = parseJournalContent(snapshot.content);
                const index = createApiV1JournalIndex(content);
                const documents = index.entries.map((parsed) =>
                  mapDocument(
                    projectApiV1JournalEntry(parsed),
                    "journal",
                  )
                );

                return { documents, revision: snapshot.revision };
              },
            });
          }
          if (domains.has("todo")) {
            sources.push({
              createFault: sourceFault("todo"),
              domain: "todo",
              async load() {
                const snapshot = await builtInCatalog.getStore("todo")
                  .then((store) => store.loadSnapshot());
                const content = parseTodoContent(snapshot.content);
                const index = createApiV1TodoIndex(content);
                const now = runtime.now();
                const today = runtime.today(now);
                const documents = index.collections.map((parsed) =>
                  mapDocument(
                    projectApiV1TodoCollection(parsed, today).document,
                    "todo",
                  )
                );

                return { documents, revision: snapshot.revision };
              },
            });
          }
          return { faults, sources };
        },
      },
    });
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
    try {
      return await this.#query.search(
        { ...request, domains } satisfies SearchRequest,
        principal,
      );
    } catch (error) {
      if (!(error instanceof SearchRequestError)) throw error;
      if (error.code === "cursor_conflict") {
        throw new ApiV1RequestError(
          "resource_conflict",
          error.message,
          { details: { restartRequired: true } },
        );
      }
      throw new ApiV1RequestError("invalid_request", error.message);
    }
  }
}
