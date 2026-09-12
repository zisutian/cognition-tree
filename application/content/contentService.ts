// SPDX-License-Identifier: GPL-3.0-or-later

import { readCommandRuntimeNow } from "../commands/index.ts";
import type { ContentOperationRequest } from "./contentCommand.ts";
import type { ContentServicePorts } from "./contentPorts.ts";
import {
  contentCatalogRevision,
  queryContent,
  type ContentQuery,
} from "./contentQuery.ts";
import { commandFailure, ContentBasisMismatchError } from "./commandSupport.ts";
import { executeCatalogContentCommand } from "./catalogCommand.ts";
import { executeJournalContentCommand } from "./journalCommand.ts";
import { resolveNamedContent } from "./targetResolution.ts";
import { executeTodoContentCommand } from "./todoCommand.ts";
import { executeWorkspaceContentCommand } from "./workspaceCommand.ts";

export class ContentService {
  readonly #ports: ContentServicePorts;
  constructor(ports: ContentServicePorts) {
    this.#ports = ports;
  }
  query(query: ContentQuery) {
    return queryContent(this.#ports, query);
  }
  repositoryCatalog() {
    return this.#ports.catalog.run(async (session) => {
      const catalog = await session.read();
      return {
        ...catalog,
        revision: contentCatalogRevision(catalog, this.#ports.digest),
      };
    });
  }
  result(operationId: string) {
    return this.#ports.ledger.getContentOperation(operationId);
  }

  execute(request: ContentOperationRequest) {
    const { operationId, ...payload } = request;
    const { timestamp } = readCommandRuntimeNow(this.#ports.runtime);
    return this.#ports.ledger.runContentOperation(
      {
        operationId,
        baseRevision: request.basis.baseRevision,
        command: request.command.kind,
        scope: request.scope,
        digest: this.#ports.digest(payload),
        occurredAt: timestamp,
      },
      async (recordPrepared) => {
        try {
          if (
            request.scope.domain !== "workspace" &&
            request.basis.repositoryId !== null
          )
            throw new ContentBasisMismatchError();
          if (request.scope.domain === "catalog")
            return await executeCatalogContentCommand(
              this.#ports,
              request,
              timestamp,
              recordPrepared,
            );
          if (request.scope.domain === "workspace") {
            const selector = request.scope.repository;
            return await this.#ports.catalog.run(async (session) => {
              const catalog = await session.read();
              const repository = resolveNamedContent(
                catalog.repositories.map(({ id, label }) => ({
                  id,
                  name: label,
                  path: label,
                })),
                selector,
              );
              if (repository.id !== request.basis.repositoryId)
                throw new ContentBasisMismatchError();
              return executeWorkspaceContentCommand(
                this.#ports,
                await session.getStore(repository.id),
                repository,
                request.basis.baseRevision,
                request.command,
                timestamp,
                recordPrepared,
              );
            });
          }
          if (request.scope.domain === "journal")
            return await executeJournalContentCommand(
              this.#ports,
              await this.#ports.journal(),
              request.basis.baseRevision,
              request.command,
              timestamp,
              recordPrepared,
            );
          return await executeTodoContentCommand(
            this.#ports,
            await this.#ports.todo(),
            request.basis.baseRevision,
            request.command,
            timestamp,
            recordPrepared,
          );
        } catch (error) {
          return commandFailure(error);
        }
      },
    );
  }
}
