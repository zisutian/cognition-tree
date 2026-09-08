// SPDX-License-Identifier: GPL-3.0-or-later

import { DomainValidationError } from "../../core/errors/index.ts";
import {
  createJournalParseIndex,
  updateJournalSyntaxSource,
} from "../../core/journal/index.ts";
import { projectNamedSourceChanges } from "../commands/index.ts";
import {
  prepareJournalCommand,
  projectJournalContentChanges,
  projectJournalContentReview,
  type JournalCommandIntent,
} from "../journal/index.ts";
import { commitContentCommand, contentMoveTarget } from "./commandSupport.ts";
import type { ContentCommand } from "./contentCommand.ts";
import type {
  ContentJournalStore,
  ContentRevision,
  ContentServicePorts,
} from "./contentPorts.ts";
import { resolveNamedContent } from "./targetResolution.ts";

export function executeJournalContentCommand(
  ports: ContentServicePorts,
  store: ContentJournalStore,
  baseRevision: ContentRevision,
  command: ContentCommand,
  timestamp: string,
) {
  return commitContentCommand({
    store,
    baseRevision,
    prepare(snapshot) {
      const index = snapshot.projection;
      if (command.kind === "update-syntax") {
        if (command.syntax !== null)
          throw new DomainValidationError(
            "Journal has one syntax; use null for its selector.",
          );
        const changed = updateJournalSyntaxSource(snapshot.content, index, {
          source: command.source,
          createBlockId: ports.runtime.createId,
          updatedAt: timestamp,
        });
        return {
          content: changed.content,
          projection: createJournalParseIndex(
            changed.content,
            index,
            changed.analysisOverrides,
          ),
        };
      }
      const resolve = (name: string) =>
        resolveNamedContent(
          index.entries.map(({ entry, title }) => ({
            id: entry.id,
            name: title,
            path: title,
          })),
          name,
        ).id;
      let intent: JournalCommandIntent;
      switch (command.kind) {
        case "create-entry":
          intent = command;
          break;
        case "delete-entry":
          intent = { kind: command.kind, entryId: resolve(command.resource) };
          break;
        case "edit-content":
          intent = {
            kind: "edit-entry-body",
            entryId: resolve(command.resource),
            edit: command.edit,
          };
          break;
        case "move-block": {
          const entryId = resolve(command.resource);
          if (entryId !== resolve(command.targetResource))
            throw new DomainValidationError(
              "Journal block moves stay within one entry.",
            );
          intent = {
            kind: command.kind,
            entryId,
            blockId: command.blockId,
            target: contentMoveTarget(command),
          };
          break;
        }
        default:
          throw new DomainValidationError(
            "This command does not apply to Journal.",
          );
      }
      return prepareJournalCommand({
        snapshot,
        intent,
        runtime: { ...ports.runtime, now: () => new Date(timestamp) },
        versionPolicy: ports.versions.journal,
      });
    },
    describe(receipt) {
      const { before, after } = receipt;
      const changes = projectJournalContentChanges(
        before.content,
        after.content,
        timestamp,
        before.projection,
        after.projection,
        ports.versions.journal,
      ).changes;
      const review = projectJournalContentReview({
        beforeIndex: before.projection,
        afterIndex: after.projection,
        changes,
      });
      const syntaxChanges = projectNamedSourceChanges(
        [
          {
            id: "journal",
            name: before.projection.syntax.name,
            source: before.content.syntaxSource,
          },
        ],
        [
          {
            id: "journal",
            name: after.projection.syntax.name,
            source: after.content.syntaxSource,
          },
        ],
        "journal",
        "journal",
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
          ports.onCommitted({ domain: "journal" }, receipt.revision, changes),
      };
    },
  });
}
