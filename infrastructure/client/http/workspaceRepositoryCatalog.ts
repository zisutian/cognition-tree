// SPDX-License-Identifier: GPL-3.0-or-later

import { parsePortableName } from "../../../core/naming/index.ts";
import type {
  WorkspaceRepositoryCatalog,
  WorkspaceRepositoryCatalogData,
  RepositoryMutationBasis,
} from "../../../application/repository/index.ts";
import { WorkspaceRepositoryRemoteError } from "../../../application/workspace/index.ts";
import type {
  ContentOperationRequestDto,
  ContentOperationResultDto,
} from "../../../contracts/content/index.ts";
import {
  parseRepositoryCatalog,
  parseRepositoryDescriptor,
} from "../../../contracts/workspace/index.ts";
import {
  requestApiOperation,
  type HttpApiTransportOptions,
} from "./apiTransport.ts";
import { withWorkspaceApiAdapterErrors } from "./workspaceApiAdapter.ts";

export function createHttpWorkspaceCatalogBackend({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
}: HttpApiTransportOptions): WorkspaceRepositoryCatalog {
  const execute = (
    basis: RepositoryMutationBasis,
    command: ContentOperationRequestDto["command"],
  ) =>
    withWorkspaceApiAdapterErrors(async () => {
      const result = (await requestApiOperation(
        fetchFn,
        baseUrl,
        "executeContentOperation",
        {
          scope: { domain: "catalog" },
          basis: { baseRevision: basis.baseRevision, repositoryId: null },
          operationId: basis.operationId,
          command,
        },
      )) as ContentOperationResultDto;
      if (result.status !== "committed" || !result.afterRevision)
        throw new WorkspaceRepositoryRemoteError(
          `${result.error?.message ?? "操作尚未完成"}（操作 ID：${result.operationId}）`,
          {
            code:
              result.status === "conflict"
                ? "revision_conflict"
                : "invalid_request",
            retryable: false,
          },
        );
      return result;
    }).catch((error) => {
      if (error instanceof Error && !error.message.includes(basis.operationId))
        error.message += `（请核对操作 ID：${basis.operationId}，不要自动重试）`;
      throw error;
    });
  const descriptorResult = (result: ContentOperationResultDto) => {
    if (!result.repository || !result.afterRevision)
      throw new Error(
        `已提交，但仓库收据不完整。请查询操作 ${result.operationId}。`,
      );
    return {
      descriptor: parseRepositoryDescriptor(result.repository),
      revision: result.afterRevision,
    };
  };
  return {
    label: "HTTP 后端",
    createRepository: async (input) =>
      descriptorResult(
        await execute(input, {
          kind: "create-repository",
          name: parsePortableName(input.label, "Repository label"),
        }),
      ),
    renameRepository: async (input) =>
      descriptorResult(
        await execute(input, {
          kind: "rename-repository",
          repository: input.repository,
          name: parsePortableName(input.label, "Repository label"),
        }),
      ),
    deleteRepository: async (input) => ({
      revision: (
        await execute(input, {
          kind: "delete-repository",
          repository: input.repository,
        })
      ).afterRevision!,
    }),
    listRepositories: () =>
      withWorkspaceApiAdapterErrors(async () => {
        const value = (await requestApiOperation(
          fetchFn,
          baseUrl,
          "listAdminRepositories",
        )) as WorkspaceRepositoryCatalogData;
        return {
          ...parseRepositoryCatalog({
            repositories: value.repositories,
            issues: value.issues,
          }),
          revision: value.revision,
        };
      }),
  };
}
