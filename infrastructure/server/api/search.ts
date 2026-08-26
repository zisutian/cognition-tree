// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  projectJournalSearchDocuments,
  projectTodoSearchDocuments,
  projectWorkspaceSearchDocuments,
} from "../../../application/workbench/searchCorpus.ts";
import {
  createSearchQuery,
} from "../../../application/search/searchIndex.ts";
import {
  SearchRequestError,
  type SearchDomain,
  type SearchFault,
  type SearchRequest,
  type SearchSource,
  type SearchResponse,
} from "../../../application/search/searchTypes.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import {
  WireContractError,
} from "../../../contracts/common/contractValue.ts";
import { CtnBlockMetadataSyntaxError } from "../../../core/ctn/metadata/blockMetadata.ts";
import { CtnDocumentMetadataError } from "../../../core/ctn/parser/parseCtnDocument.ts";
import { JournalContentValidationError } from "../../../core/journal/model/journalErrors.ts";
import { TodoContentValidationError } from "../../../core/todo/model/todoErrors.ts";
import { WorkspaceBlockMetadataError } from "../../../core/workspace/context/workspaceBlockMetadata.ts";
import { WorkspaceNoteHeaderError } from "../../../core/workspace/model/workspaceData.ts";
import type {
  ApiPrincipalDto,
  ApiSearchRequestDto,
  ApiSearchResponseDto,
  AutomationApiScope,
} from "../../../contracts/api/types.ts";
import type {
  WorkspaceRepositoryCatalog,
} from "../repository/catalog.ts";
import {
  RepositoryAdapterError,
} from "../repository/store.ts";
import {
  WorkspacePayloadValidationError,
} from "../repository/workspace/layout.ts";
import type { ApiBuiltInCatalog } from "./http/ports.ts";
import { ApiRequestError } from "./http/errors.ts";
import {
  createApiResourceVersion,
} from "./resources/versions.ts";

type AgentSearchPrincipal = {
  kind: "agent-session";
};
type SearchPrincipal = ApiPrincipalDto | AgentSearchPrincipal;

function hasScope(
  principal: SearchPrincipal,
  scope: AutomationApiScope,
) {
  switch (principal.kind) {
    case "agent-session":
    case "local-owner":
    case "owner":
      return true;
    case "automation":
      return principal.scopes.includes(scope);
  }
}

function requestedDomains(
  request: ApiSearchRequestDto,
  principal: SearchPrincipal,
) {
  const requested = request.domains ??
    ["workspace", "journal", "todo"] as const;

  return requested.filter((domain) => {
    const scope = `${domain}:read` as const;

    return hasScope(principal, scope);
  });
}

function allowedWorkspaceRepositoryIds(principal: SearchPrincipal) {
  switch (principal.kind) {
    case "agent-session":
    case "local-owner":
    case "owner":
      return null;
    case "automation":
      return principal.repositoryIds
        ? new Set(principal.repositoryIds)
        : null;
  }
}

function sourceFault(
  domain: SearchDomain,
  repositoryId?: string,
): SearchSource["createFault"] {
  return (error) => {
    const invalid = isInvalidServerSearchSource(error);

    const common: Pick<SearchFault, "code" | "message"> = {
      code: invalid ? "source_invalid" : "source_unavailable",
      message: invalid
        ? "Search source contains invalid data"
        : "Search source is unavailable",
    };

    return domain === "workspace"
      ? { ...common, domain, ...(repositoryId ? { repositoryId } : {}) }
      : { ...common, domain };
  };
}

function isInvalidServerSearchSource(error: unknown) {
  if (error instanceof RepositoryAdapterError) {
    return error.code === "repository_corrupt" ||
      error.code === "unsupported_repository_version" ||
      error.code === "invalid_request";
  }
  return error instanceof WireContractError ||
    error instanceof WorkspacePayloadValidationError ||
    error instanceof JournalContentValidationError ||
    error instanceof TodoContentValidationError ||
    error instanceof CtnDocumentMetadataError ||
    error instanceof CtnBlockMetadataSyntaxError ||
    error instanceof WorkspaceBlockMetadataError ||
    error instanceof WorkspaceNoteHeaderError;
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

function projectApiSearchResponse(
  response: SearchResponse,
): ApiSearchResponseDto {
  return {
    cursor: response.cursor,
    faults: response.faults.map((fault) =>
      fault.domain === "workspace"
        ? {
            code: fault.code,
            domain: fault.domain,
            message: fault.message,
            ...(fault.repositoryId
              ? { repositoryId: fault.repositoryId }
              : {}),
          }
        : {
            code: fault.code,
            domain: fault.domain,
            message: fault.message,
          }
    ),
    results: response.results.map((result) => {
      const common = {
        blockId: result.blockId,
        resourceId: result.resourceId,
        snippet: result.snippet,
        title: result.title,
        updatedAt: result.updatedAt,
        version: result.version,
      };

      if (result.domain === "workspace") {
        if (!result.repositoryId) {
          throw new Error("Workspace search result is missing repositoryId.");
        }
        return {
          ...common,
          domain: result.domain,
          repositoryId: result.repositoryId,
        };
      }
      return { ...common, domain: result.domain };
    }),
  };
}

export class ApiSearchService {
  readonly #query;

  constructor({
    builtInCatalog,
    catalog,
  }: {
    builtInCatalog: ApiBuiltInCatalog;
    catalog: WorkspaceRepositoryCatalog;
  }) {
    this.#query = createSearchQuery<SearchPrincipal>({
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
              const allowedIds = allowedWorkspaceRepositoryIds(principal);
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

                    return {
                      async loadDocuments() {
                        return projectWorkspaceSearchDocuments({
                          createVersion: createApiResourceVersion,
                          index: snapshot.projection.analysisIndex,
                          repositoryId: repository.id,
                          workspace: snapshot.projection.workspace,
                        });
                      },
                      revision: snapshot.revision,
                    };
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

                return {
                  async loadDocuments() {
                    return projectJournalSearchDocuments({
                      createVersion: createApiResourceVersion,
                      index: snapshot.projection,
                    });
                  },
                  revision: snapshot.revision,
                };
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

                return {
                  async loadDocuments() {
                    return projectTodoSearchDocuments({
                      createVersion: createApiResourceVersion,
                      index: snapshot.projection,
                    });
                  },
                  revision: snapshot.revision,
                };
              },
            });
          }
          return { faults, sources };
        },
      },
    });
  }

  async search(
    request: ApiSearchRequestDto,
    principal: ApiPrincipalDto,
  ): Promise<ApiSearchResponseDto> {
    return this.#search(request, principal);
  }

  async searchAgent(
    request: ApiSearchRequestDto,
  ): Promise<ApiSearchResponseDto> {
    return this.#search(request, { kind: "agent-session" });
  }

  async #search(
    request: ApiSearchRequestDto,
    principal: SearchPrincipal,
  ): Promise<ApiSearchResponseDto> {
    const domains = requestedDomains(request, principal);

    if (domains.length === 0) {
      throw new ApiRequestError(
        "forbidden",
        "No requested search domain is readable",
      );
    }
    try {
      return projectApiSearchResponse(
        await this.#query.search(
          { ...request, domains } satisfies SearchRequest,
          principal,
        ),
      );
    } catch (error) {
      if (!(error instanceof SearchRequestError)) throw error;
      if (error.code === "cursor_conflict") {
        throw new ApiRequestError(
          "resource_conflict",
          error.message,
          { details: { restartRequired: true } },
        );
      }
      throw new ApiRequestError("invalid_request", error.message);
    }
  }
}
