// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiV1CommandOutcomeDto,
  ApiV1JournalCommandDto,
  ApiV1ResourceChangeDto,
} from "../../../contracts/api/types.ts";
import { createMyersTextEdits } from "../../../core/ctn/metadata/myersTextEdits.ts";
import {
  createJournalEntry,
  deleteJournalEntry,
  updateJournalEntryBody,
} from "../../../core/journal/commands/journalCommands.ts";
import {
  createJournalParseIndex,
} from "../../../core/journal/indexes/journalParseIndex.ts";
import {
  createJournalEntryBodyProjection,
  isJournalEntryId,
  listJournalEntries,
  type JournalContent,
  type JournalEntryId,
} from "../../../core/journal/model/journalContent.ts";
import {
  createDomainChangeSet,
} from "../../../core/sync/domainChangeSet.ts";
import type {
  VersionedContentStore,
} from "../repository/versionedContentStore.ts";
import {
  createJournalRevision,
} from "../repository/journalContentStore.ts";
import {
  executeApiV1VersionedCommand,
  projectApiV1TextEdits,
} from "./apiV1CommandCommon.ts";
import {
  ApiV1RequestError,
  apiV1NotFound,
  assertApiV1ResourceVersion,
} from "./apiV1Errors.ts";
import {
  createJournalEntriesVersion,
  createJournalEntryVersion,
} from "./apiV1Resources.ts";
import {
  readApiV1RuntimeNow,
  type ApiV1Runtime,
} from "./apiV1Runtime.ts";

function asDomainValidation<Result>(operation: () => Result): Result {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ApiV1RequestError) throw error;
    throw new ApiV1RequestError(
      "domain_validation_failed",
      error instanceof Error ? error.message : "Journal command is invalid",
    );
  }
}

function journalBody(content: JournalContent, entryId: string) {
  if (!isJournalEntryId(entryId)) return "";
  const parsed = createJournalParseIndex(content).getParsedEntry(entryId);

  return parsed ? createJournalEntryBodyProjection(parsed).source : "";
}

function applyJournalCommand(
  content: JournalContent,
  command: ApiV1JournalCommandDto,
  runtime: ApiV1Runtime,
) {
  const { date, timestamp } = readApiV1RuntimeNow(runtime);
  const index = createJournalParseIndex(content);
  let next = content;
  let result: ApiV1CommandOutcomeDto = { kind: "ok" };

  switch (command.kind) {
    case "create-entry": {
      assertApiV1ResourceVersion(
        command.expectedEntriesVersion,
        createJournalEntriesVersion(content),
        "entries",
      );
      const entryId = `journal-entry-${runtime.createId()}` as const;
      const created = createJournalEntry(content, index, {
        createBlockId: runtime.createId,
        createdAt: timestamp,
        entryId,
        timezoneOffsetMinutes: runtime.timezoneOffsetMinutes(date),
      });

      next = created.content;
      if (command.body !== "") {
        const createdIndex = createJournalParseIndex(
          next,
          index,
          new Map([[entryId, created.analysis]]),
        );
        const updated = updateJournalEntryBody(next, createdIndex, {
          change: {
            edits: createMyersTextEdits("", command.body),
            source: command.body,
          },
          createBlockId: runtime.createId,
          entryId,
          updatedAt: timestamp,
        });

        next = updated.content;
      }
      result = { entryId, kind: "journal-entry-created" };
      break;
    }
    case "delete-entry": {
      if (!isJournalEntryId(command.entryId)) {
        apiV1NotFound("Journal entry does not exist");
      }
      const parsed = index.getParsedEntry(command.entryId);

      if (!parsed) apiV1NotFound("Journal entry does not exist");
      assertApiV1ResourceVersion(
        command.expectedVersion,
        createJournalEntryVersion(parsed.entry.source),
        command.entryId,
      );
      next = deleteJournalEntry(content, parsed.entry.id);
      break;
    }
    case "replace-entry-body": {
      if (!isJournalEntryId(command.entryId)) {
        apiV1NotFound("Journal entry does not exist");
      }
      const parsed = index.getParsedEntry(command.entryId);

      if (!parsed) apiV1NotFound("Journal entry does not exist");
      assertApiV1ResourceVersion(
        command.expectedVersion,
        createJournalEntryVersion(parsed.entry.source),
        command.entryId,
      );
      const previousBody = createJournalEntryBodyProjection(parsed).source;
      const updated = updateJournalEntryBody(content, index, {
        change: {
          edits: createMyersTextEdits(previousBody, command.body),
          source: command.body,
        },
        createBlockId: runtime.createId,
        entryId: parsed.entry.id,
        updatedAt: timestamp,
      });

      next = updated.content;
      break;
    }
  }
  return { next, result, timestamp };
}

export function projectApiV1JournalChanges(
  before: JournalContent,
  after: JournalContent,
  timestamp: string,
) {
  const beforeIndex = createJournalParseIndex(before);
  const afterIndex = createJournalParseIndex(after, beforeIndex);
  const beforeEntries = new Map(
    listJournalEntries(before).map((entry) => [entry.id, entry]),
  );
  const afterEntries = new Map(
    listJournalEntries(after).map((entry) => [entry.id, entry]),
  );
  const changedIds = new Set<JournalEntryId>();
  const resources: ApiV1ResourceChangeDto[] = [];

  for (const [id] of beforeEntries) {
    if (!afterEntries.has(id)) {
      changedIds.add(id);
      resources.push({
        domain: "journal",
        kind: "deleted",
        resourceId: id,
      });
    }
  }
  for (const [id, entry] of afterEntries) {
    const previous = beforeEntries.get(id);
    const version = createJournalEntryVersion(entry.source);

    if (!previous) {
      changedIds.add(id);
      resources.push({
        domain: "journal",
        kind: "created",
        resourceId: id,
        version,
      });
    } else if (previous.source !== entry.source) {
      changedIds.add(id);
      resources.push({
        domain: "journal",
        kind: "updated",
        resourceId: id,
        version,
      });
    }
  }
  const beforeEntriesVersion = createJournalEntriesVersion(before);
  const afterEntriesVersion = createJournalEntriesVersion(after);

  if (beforeEntriesVersion !== afterEntriesVersion) {
    resources.push({
      domain: "journal",
      kind: "updated",
      resourceId: "entries",
      version: afterEntriesVersion,
    });
  }
  const blocks = [...changedIds].flatMap((entryId) =>
    createDomainChangeSet({
      next: afterIndex.getParsedEntry(entryId)
        ? {
            document: afterIndex.getParsedEntry(entryId)!.analysis.document,
            domain: "journal",
            resourceId: entryId,
            version: createJournalEntryVersion(
              afterIndex.getParsedEntry(entryId)!.entry.source,
            ),
          }
        : null,
      occurredAt: timestamp,
      previous: beforeIndex.getParsedEntry(entryId)
        ? {
            document: beforeIndex.getParsedEntry(entryId)!.analysis.document,
            domain: "journal",
            resourceId: entryId,
            version: createJournalEntryVersion(
              beforeIndex.getParsedEntry(entryId)!.entry.source,
            ),
          }
        : null,
    }).blocks
  );
  const diff = [...changedIds].flatMap((entryId) =>
    projectApiV1TextEdits(
      entryId,
      createMyersTextEdits(
        journalBody(before, entryId),
        journalBody(after, entryId),
      ),
    )
  );

  return {
    changes: { blocks, occurredAt: timestamp, resources },
    diff,
  };
}

export async function executeApiV1JournalCommand({
  command,
  runtime,
  store,
}: {
  command: ApiV1JournalCommandDto;
  runtime: ApiV1Runtime;
  store: VersionedContentStore<JournalContent>;
}) {
  const now = readApiV1RuntimeNow(runtime);
  const allocatedIds: string[] = [];

  return executeApiV1VersionedCommand({
    apply(content) {
      let nextId = 0;
      const replayRuntime: ApiV1Runtime = {
        ...runtime,
        createId() {
          allocatedIds[nextId] ??= runtime.createId();
          return allocatedIds[nextId++]!;
        },
        now: () => new Date(now.date),
      };
      const applied = asDomainValidation(() =>
        applyJournalCommand(content, command, replayRuntime)
      );
      const projection = projectApiV1JournalChanges(
        content,
        applied.next,
        applied.timestamp,
      );

      return {
        ...projection,
        content: applied.next,
        result: applied.result,
        revision: createJournalRevision(applied.next),
      };
    },
    mode: command.mode,
    store,
  });
}
