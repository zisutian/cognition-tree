// SPDX-License-Identifier: GPL-3.0-or-later

import { DomainValidationError } from "../../core/errors/index.ts";
import {
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
import { contentCatalogRevision } from "./contentQuery.ts";
import { commandFailure, requireRevision } from "./commandSupport.ts";
import { resolveNamedContent } from "./targetResolution.ts";

export function executeCatalogContentCommand(
  ports: ContentServicePorts,
  request: ContentOperationRequest,
  timestamp: string,
  recordPrepared: ContentOperationRecorder,
) {
  return ports.catalog.run(
    async (session): Promise<ContentOperationOutcome> => {
      const before = await session.read();
      requireRevision(
        contentCatalogRevision(before, ports.digest),
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
      const createId = ports.runtime.createId;
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
          ports.digest,
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
        const next =
          command.kind === "create-repository"
            ? await session.create(id, name!, initialContent!)
            : command.kind === "rename-repository"
              ? await session.rename(previous!.id, name!)
              : (await session.delete(previous!.id), null);
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
          ...(next ? { repository: next } : {}),
          afterRevision: null,
          changeMetadata: { resourceIds: [id!], blockIds: [] },
          review,
          error: null,
        };
        try {
          result.afterRevision = contentCatalogRevision(
            await session.read(),
            ports.digest,
          );
        } catch {
          result.error = {
            code: "catalog_refresh_failed",
            message:
              "Repository change was committed, but the updated directory could not be read. Refresh the directory before another change.",
          };
        }
        try {
          ports.onCatalogChanged(
            id!,
            command.kind === "create-repository"
              ? "created"
              : command.kind === "rename-repository"
                ? "updated"
                : "deleted",
            timestamp,
          );
        } catch {
          result.error ??= {
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
