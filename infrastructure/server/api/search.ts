// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  projectJournalSearchDocuments,
  projectTodoSearchDocuments,
  projectWorkspaceSearchDocuments,
} from "../../../application/search/searchCorpus.ts";
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
  ApiV1PrincipalDto,
  ApiV1SearchRequestDto,
  ApiV1SearchResponseDto,
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
import type { ApiV1BuiltInCatalog } from "./http/ports.ts";
import { ApiV1RequestError } from "./http/errors.ts";
import {
  createApiV1ResourceVersion,
} from "./resources/versions.ts";

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

function projectApiV1SearchResponse(
  response: SearchResponse,
): ApiV1SearchResponseDto {
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

export class ApiV1SearchService {
  readonly #query;

  constructor({
    builtInCatalog,
    catalog,
  }: {
    builtInCatalog: ApiV1BuiltInCatalog;
    catalog: WorkspaceRepositoryCatalog;
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

                    return {
                      async loadDocuments() {
                        return projectWorkspaceSearchDocuments({
                          createVersion: createApiV1ResourceVersion,
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
                      createVersion: createApiV1ResourceVersion,
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
                      createVersion: createApiV1ResourceVersion,
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
      return projectApiV1SearchResponse(
        await this.#query.search(
          { ...request, domains } satisfies SearchRequest,
          principal,
        ),
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
