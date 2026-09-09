// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentOperationRecorder } from "../operations/index.ts";
import { DomainValidationError } from "../../core/errors/index.ts";
import {
  createTodoParseIndex,
  updateTodoSyntaxSource,
} from "../../core/todo/index.ts";
import { projectNamedSourceChanges } from "../commands/index.ts";
import {
  prepareTodoCommand,
  projectTodoContentChanges,
  projectTodoContentReview,
  type TodoCommandIntent,
} from "../todo/index.ts";
import { commitContentCommand, contentMoveTarget } from "./commandSupport.ts";
import type { ContentCommand } from "./contentCommand.ts";
import type {
  ContentRevision,
  ContentServicePorts,
  ContentTodoStore,
} from "./contentPorts.ts";
import { resolveNamedContent } from "./targetResolution.ts";

export function executeTodoContentCommand(
  ports: ContentServicePorts,
  store: ContentTodoStore,
  baseRevision: ContentRevision,
  command: ContentCommand,
  timestamp: string,
  recordPrepared: ContentOperationRecorder,
) {
  return commitContentCommand({
    store,
    baseRevision,
    recordPrepared,
    revisionOf: ports.revisions.todo,
    repositoryId: null,
    prepare(snapshot) {
      const index = snapshot.projection;
      if (command.kind === "update-syntax") {
        if (command.syntax !== null)
          throw new DomainValidationError(
            "Todo has one syntax; use null for its selector.",
          );
        const changed = updateTodoSyntaxSource(snapshot.content, index, {
          source: command.source,
          createBlockId: ports.runtime.createId,
          updatedAt: timestamp,
        });
        return {
          content: changed.content,
          projection: createTodoParseIndex(
            changed.content,
            index,
            changed.analysisOverrides,
          ),
        };
      }
      const resolve = (name: string) =>
        resolveNamedContent(
          index.collections.map(({ collection, name }) => ({
            id: collection.id,
            name,
            path: name,
          })),
          name,
        ).id;
      let intent: TodoCommandIntent;
      switch (command.kind) {
        case "create-collection":
          intent = command;
          break;
        case "delete-collection":
          intent = {
            kind: command.kind,
            collectionId: resolve(command.resource),
          };
          break;
        case "rename-collection":
          intent = {
            kind: command.kind,
            collectionId: resolve(command.resource),
            name: command.name,
          };
          break;
        case "move-collection":
          intent = {
            kind: command.kind,
            collectionId: resolve(command.resource),
            toIndex: command.index,
          };
          break;
        case "edit-content":
          intent = {
            kind: "edit-collection-body",
            collectionId: resolve(command.resource),
            edit: command.edit,
          };
          break;
        case "set-completion":
          intent = {
            kind: command.kind,
            collectionId: resolve(command.resource),
            blockId: command.blockId,
            completed: command.completed,
            occurrenceDate: command.occurrenceDate,
          };
          break;
        case "set-recurrence":
          intent = {
            kind: command.kind,
            collectionId: resolve(command.resource),
            blockId: command.blockId,
            rule: command.rule,
          };
          break;
        case "stop-recurrence":
          intent = {
            kind: command.kind,
            collectionId: resolve(command.resource),
            blockId: command.blockId,
          };
          break;
        case "move-block": {
          const collectionId = resolve(command.resource);
          if (collectionId !== resolve(command.targetResource))
            throw new DomainValidationError(
              "Todo block moves stay within one collection.",
            );
          contentMoveTarget(command);
          intent = {
            kind: command.kind,
            collectionId,
            sourceBlockId: command.blockId,
            targetBlockId: command.targetBlockId,
            targetKind: command.position,
          };
          break;
        }
        default:
          throw new DomainValidationError(
            "This command does not apply to Todo.",
          );
      }
      return prepareTodoCommand({
        snapshot,
        intent,
        runtime: { ...ports.runtime, now: () => new Date(timestamp) },
        versionPolicy: ports.versions.todo,
      });
    },
    describe(receipt) {
      const { before, after } = receipt;
      const changes = projectTodoContentChanges(
        before.content,
        after.content,
        timestamp,
        before.projection,
        after.projection,
        ports.versions.todo,
      ).changes;
      const review = projectTodoContentReview({
        beforeIndex: before.projection,
        afterIndex: after.projection,
        changes,
      });
      const syntaxChanges = projectNamedSourceChanges(
        [
          {
            id: "todo",
            name: before.projection.syntax.name,
            source: before.content.syntaxSource,
          },
        ],
        [
          {
            id: "todo",
            name: after.projection.syntax.name,
            source: after.content.syntaxSource,
          },
        ],
        "todo",
        "todo",
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
        notify: (revision) =>
          ports.onCommitted({ domain: "todo" }, revision, changes),
      };
    },
  });
}
