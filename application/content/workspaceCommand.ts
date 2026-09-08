// SPDX-License-Identifier: GPL-3.0-or-later

import { DomainValidationError } from "../../core/errors/index.ts";
import {
  createInitialWorkspaceSyntax,
  listWorkspaceResourcePaths,
} from "../../core/workspace/index.ts";
import { projectNamedSourceChanges } from "../commands/index.ts";
import {
  createWorkspaceSyntaxCatalogMutationService,
  prepareWorkspaceCommand,
  prepareWorkspaceRepositoryContent,
  projectWorkspaceContentChanges,
  projectWorkspaceContentReview,
  type WorkspaceCommandIntent,
} from "../workspace/index.ts";
import type { ContentCommand } from "./contentCommand.ts";
import type {
  ContentRevision,
  ContentServicePorts,
  ContentWorkspaceStore,
} from "./contentPorts.ts";
import { commitContentCommand, contentMoveTarget } from "./commandSupport.ts";
import { resolveNamedContent } from "./targetResolution.ts";

export function executeWorkspaceContentCommand(
  ports: ContentServicePorts,
  store: ContentWorkspaceStore,
  repository: { id: string; name: string },
  baseRevision: ContentRevision,
  command: ContentCommand,
  timestamp: string,
) {
  return commitContentCommand({
    store,
    baseRevision,
    prepare(snapshot) {
      const resources = listWorkspaceResourcePaths(
        snapshot.projection.workspace,
      );
      const resolve = (name: string, kind: "folder" | "note") =>
        resolveNamedContent(
          resources.filter((item) => item.kind === kind),
          name,
        ).id;
      const parent = (name: string | null) =>
        name === null ? null : resolve(name, "folder");
      if (
        command.kind === "create-syntax" ||
        command.kind === "update-syntax" ||
        command.kind === "activate-syntax" ||
        command.kind === "delete-syntax"
      ) {
        const service = createWorkspaceSyntaxCatalogMutationService({
          createBlockId: ports.runtime.createId,
          createSyntaxFileId: () => `syntax-${ports.runtime.createId()}`,
          newFileTemplate: createInitialWorkspaceSyntax(),
          now: () => timestamp,
        });
        const files = snapshot.content.syntax.files.map((file) => ({
          ...file,
          name: snapshot.projection.syntaxById.get(file.id)!.syntax.name,
          path: snapshot.projection.syntaxById.get(file.id)!.syntax.name,
        }));
        if (command.kind === "update-syntax" && command.syntax === null)
          throw new DomainValidationError(
            "Workspace syntax changes require an explicit syntax name.",
          );
        const id =
          command.kind === "create-syntax"
            ? null
            : resolveNamedContent(files, command.syntax!).id;
        const changed =
          command.kind === "create-syntax"
            ? service.createFile(
                snapshot.content,
                snapshot.projection.analysisIndex,
                null,
                command.source,
              )
            : command.kind === "update-syntax"
              ? service.updateFileSource(
                  snapshot.content,
                  snapshot.projection.analysisIndex,
                  id!,
                  command.source,
                )
              : command.kind === "activate-syntax"
                ? service.activateFile(
                    snapshot.content,
                    snapshot.projection.analysisIndex,
                    id!,
                  )
                : service.deleteFile(
                    snapshot.content,
                    snapshot.projection.analysisIndex,
                    id!,
                  );
        return changed
          ? {
              content: changed.content,
              projection: prepareWorkspaceRepositoryContent(changed.content, {
                previous: snapshot.projection,
                analysisOverrides: changed.analysisOverrides,
              }),
            }
          : snapshot;
      }
      let intent: WorkspaceCommandIntent;
      switch (command.kind) {
        case "create-folder":
          intent = {
            kind: command.kind,
            parentFolderId: parent(command.parent),
            title: command.name,
          };
          break;
        case "create-note":
          intent = {
            kind: command.kind,
            parentFolderId: parent(command.parent),
            title: command.title,
            body: command.body,
          };
          break;
        case "delete-folder":
          intent = {
            kind: command.kind,
            folderId: resolve(command.resource, "folder"),
          };
          break;
        case "delete-note":
          intent = {
            kind: command.kind,
            noteId: resolve(command.resource, "note"),
          };
          break;
        case "rename-folder":
          intent = {
            kind: command.kind,
            folderId: resolve(command.resource, "folder"),
            title: command.name,
          };
          break;
        case "rename-note":
          intent = {
            kind: command.kind,
            noteId: resolve(command.resource, "note"),
            title: command.name,
          };
          break;
        case "move-tree-node":
          intent = {
            kind: command.kind,
            nodeId: resolve(command.resource, command.resourceKind),
            nodeKind: command.resourceKind,
            parentFolderId: parent(command.parent),
            toIndex: command.index,
          };
          break;
        case "edit-content":
          intent = {
            kind: "edit-note-body",
            noteId: resolve(command.resource, "note"),
            edit: command.edit,
          };
          break;
        case "move-block":
          contentMoveTarget(command);
          intent = {
            kind: command.kind,
            sourceBlockId: command.blockId,
            sourceNoteId: resolve(command.resource, "note"),
            targetNoteId: resolve(command.targetResource, "note"),
            targetBlockId: command.targetBlockId,
            targetKind: command.position,
          };
          break;
        default:
          throw new DomainValidationError(
            "This command does not apply to a Workspace repository.",
          );
      }
      return prepareWorkspaceCommand({
        snapshot,
        intent,
        runtime: { ...ports.runtime, now: () => new Date(timestamp) },
        versionPolicy: ports.versions.workspace,
      });
    },
    describe(receipt) {
      const { before, after } = receipt;
      const changes = projectWorkspaceContentChanges(
        repository.id,
        before.content,
        after.content,
        timestamp,
        before.projection,
        after.projection,
        ports.versions.workspace,
      ).changes;
      const review = projectWorkspaceContentReview({
        beforePreparation: before.projection,
        afterPreparation: after.projection,
        changes,
        repositoryLabel: repository.name,
      });
      const syntaxFiles = (snapshot: typeof before) =>
        snapshot.content.syntax.files.map((file) => ({
          ...file,
          name: snapshot.projection.syntaxById.get(file.id)!.syntax.name,
        }));
      const syntaxChanges = projectNamedSourceChanges(
        syntaxFiles(before),
        syntaxFiles(after),
        before.content.syntax.activeFileId,
        after.content.syntax.activeFileId,
      );
      return {
        review: {
          ...review,
          resources: [...review.resources, ...syntaxChanges],
        },
        changeMetadata: {
          resourceIds: [
            ...new Set([
              ...changes.resources.map(({ resourceId }) => resourceId),
              ...syntaxChanges.map(({ resourceId }) => resourceId),
            ]),
          ],
          blockIds: [...new Set(changes.blocks.map(({ blockId }) => blockId))],
        },
        notify: () =>
          ports.onCommitted(
            { domain: "workspace", repositoryId: repository.id },
            receipt.revision,
            changes,
          ),
      };
    },
  });
}
