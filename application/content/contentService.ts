// SPDX-License-Identifier: GPL-3.0-or-later

import { DomainValidationError } from "../../core/errors/index.ts";
import {
  readCommandRuntimeNow,
  summarizeContentBlockChanges,
  type ContentChangeReview,
} from "../commands/index.ts";
import type {
  ContentOperationOutcome,
  ContentOperationRecorder,
} from "../operations/index.ts";
import { createInitialRepositoryContent } from "../workspace/index.ts";
import type { ContentOperationRequest } from "./contentCommand.ts";
import type { ContentServicePorts } from "./contentPorts.ts";
import {
  contentCatalogRevision,
  queryContent,
  type ContentQuery,
} from "./contentQuery.ts";
import {
  commandFailure,
  requireRevision,
  ContentBasisMismatchError,
} from "./commandSupport.ts";
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
            return await this.#executeCatalog(
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

  #executeCatalog(
    request: ContentOperationRequest,
    timestamp: string,
    recordPrepared: ContentOperationRecorder,
  ) {
    return this.#ports.catalog.run(
      async (session): Promise<ContentOperationOutcome> => {
        const before = await session.read();
        requireRevision(
          contentCatalogRevision(before, this.#ports.digest),
          request.basis.baseRevision,
        );
        const command = request.command;
        if (
          command.kind !== "create-repository" &&
          command.kind !== "rename-repository" &&
          command.kind !== "delete-repository"
        )
          throw new DomainValidationError(
            "Catalog scope only accepts repository management commands.",
          );
        const previous =
          command.kind === "create-repository"
            ? null
            : resolveNamedContent(
                before.repositories.map(({ id, label }) => ({
                  id,
                  name: label,
                  path: label,
                })),
                command.repository,
              );
        const name =
          command.kind === "delete-repository"
            ? null
            : await session.validateName(command.name, previous?.id);
        const createId = this.#ports.runtime.createId;
        const initialContent =
          command.kind === "create-repository"
            ? createInitialRepositoryContent({
                createBlockId: createId,
                createNoteId: () => `note-${createId()}`,
                createSyntaxFileId: () => `syntax-${createId()}`,
                createWorkspaceId: () => `workspace-${createId()}`,
                name: name!,
                timestamp,
              })
            : null;
        const id = previous?.id ?? (await session.allocateId());
        const expectedAfter = {
          ...before,
          repositories:
            command.kind === "create-repository"
              ? [...before.repositories, { id, label: name! }]
              : command.kind === "delete-repository"
                ? before.repositories.filter((item) => item.id !== id)
                : before.repositories.map((item) =>
                    item.id === id ? { ...item, label: name! } : item,
                  ),
        };
        await recordPrepared({
          repositoryId: id,
          expectedAfterRevision: contentCatalogRevision(
            expectedAfter,
            this.#ports.digest,
          ),
          targets: [
            {
              type: "repository",
              resourceId: id,
              actions: [
                command.kind === "create-repository"
                  ? "created"
                  : command.kind === "rename-repository"
                    ? "renamed"
                    : "deleted",
              ],
              before: previous
                ? { label: previous.name, path: previous.path }
                : null,
              after: name ? { label: name, path: name } : null,
            },
          ],
        });
        try {
          if (command.kind === "create-repository") {
            await session.create(id, name!, initialContent!);
          } else if (command.kind === "rename-repository")
            await session.rename(previous!.id, name!);
          else await session.delete(previous!.id);
          const after = await session.read();
          const next = after.repositories.find((item) => item.id === id);
          const review: ContentChangeReview = {
            storeLabel: null,
            resources: [
              {
                type: "repository",
                resourceId: id!,
                actions: [
                  command.kind === "create-repository"
                    ? "created"
                    : command.kind === "rename-repository"
                      ? "renamed"
                      : "deleted",
                ],
                before: previous
                  ? { label: previous.name, path: previous.path }
                  : null,
                after: next ? { label: next.label, path: next.label } : null,
                blockSummary: summarizeContentBlockChanges([]),
                diff: [],
              },
            ],
          };
          const result: ContentOperationOutcome = {
            status: "committed",
            afterRevision: contentCatalogRevision(after, this.#ports.digest),
            changeMetadata: { resourceIds: [id!], blockIds: [] },
            review,
            error: null,
          };
          try {
            this.#ports.onCatalogChanged(
              id!,
              command.kind === "create-repository"
                ? "created"
                : command.kind === "rename-repository"
                  ? "updated"
                  : "deleted",
              timestamp,
            );
          } catch {
            result.error = {
              code: "notification_failed",
              message:
                "Repository change was committed, but its notification failed. Refresh the directory.",
            };
          }
          return result;
        } catch (error) {
          return commandFailure(error, true);
        }
      },
    );
  }
}
