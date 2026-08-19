// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createJournalBodyReplacement,
  prepareJournalMutation,
  projectJournalMutation,
  type JournalDomainCommand,
  type JournalDomainVersions,
} from "../../../../application/journal/journalDomainCommands.ts";
import {
  createDomainTransition,
} from "../../../../application/commands/domainCommand.ts";
import type {
  ApiV1JournalCommandDto,
} from "../../../../contracts/api/types.ts";
import type { JournalParseIndex } from "../../../../core/journal/indexes/journalParseIndex.ts";
import {
  type JournalContent,
  type JournalEntryId,
} from "../../../../core/journal/model/journalContent.ts";
import {
  createJournalEntryBodyProjection,
} from "../../../../core/journal/model/journalEntryProjection.ts";
import {
  isJournalEntryId,
} from "../../../../core/journal/model/journalIdentity.ts";
import type {
  VersionedContentStore,
} from "../../repository/versioned/contentStore.ts";
import {
  createJournalRevision,
} from "../../repository/built-ins/journalStore.ts";
import {
  executeApiV1VersionedCommand,
} from "./common.ts";
import {
  createJournalEntriesVersion,
  createJournalEntryVersion,
} from "../resources/versions.ts";
import {
  readApiV1RuntimeNow,
  type ApiV1Runtime,
} from "../http/runtime.ts";

const journalVersions: JournalDomainVersions = {
  entries: createJournalEntriesVersion,
  entry: createJournalEntryVersion,
};

function toJournalDomainCommand(
  command: ApiV1JournalCommandDto,
  runtime: ApiV1Runtime,
  index: JournalParseIndex,
): JournalDomainCommand {
  const { date, timestamp } = readApiV1RuntimeNow(runtime);

  if (command.kind === "create-entry") {
    const entryId = `journal-entry-${runtime.createId()}` as JournalEntryId;

    return {
      body: command.body,
      createdAt: timestamp,
      entryId,
      expectedEntriesVersion: command.expectedEntriesVersion,
      kind: command.kind,
      timezoneOffsetMinutes: runtime.timezoneOffsetMinutes(date),
    };
  }
  if (command.kind === "delete-entry") {
    return {
      entryId: command.entryId,
      expectedVersion: command.expectedVersion,
      kind: command.kind,
      timestamp,
    };
  }
  const parsed = isJournalEntryId(command.entryId)
    ? index.getParsedEntry(command.entryId)
    : null;
  const previousBody = parsed
    ? createJournalEntryBodyProjection(parsed).source
    : "";

  return {
    change: createJournalBodyReplacement(previousBody, command.body),
    entryId: command.entryId,
    expectedVersion: command.expectedVersion,
    kind: command.kind,
    updatedAt: timestamp,
  };
}

export function projectApiV1JournalChanges(
  before: JournalContent,
  after: JournalContent,
  timestamp: string,
  beforeIndex: JournalParseIndex,
  afterIndex: JournalParseIndex,
) {
  return projectJournalMutation({
    after,
    afterIndex,
    before,
    beforeIndex,
    timestamp,
    versions: journalVersions,
  });
}

export async function executeApiV1JournalCommand({
  command,
  runtime,
  store,
}: {
  command: ApiV1JournalCommandDto;
  runtime: ApiV1Runtime;
  store: VersionedContentStore<JournalContent, JournalParseIndex>;
}) {
  const now = readApiV1RuntimeNow(runtime);
  const allocatedIds: string[] = [];

  return executeApiV1VersionedCommand({
    apply({ content, projection: index }) {
      let nextId = 0;
      const replayRuntime: ApiV1Runtime = {
        ...runtime,
        createId() {
          allocatedIds[nextId] ??= runtime.createId();
          return allocatedIds[nextId++]!;
        },
        now: () => new Date(now.date),
      };
      const mutation = prepareJournalMutation({
        command: toJournalDomainCommand(
          command,
          replayRuntime,
          index,
        ),
        content,
        createBlockId: replayRuntime.createId,
        index,
        versions: journalVersions,
      });
      const projection = projectJournalMutation({
        after: mutation.content,
        afterIndex: mutation.index,
        before: content,
        beforeIndex: index,
        timestamp: mutation.timestamp,
        versions: journalVersions,
      });
      const transition = createDomainTransition(mutation, projection);

      return {
        changes: transition.changes,
        content: transition.content,
        diff: transition.diff,
        projection: mutation.index,
        result: transition.result,
        revision: createJournalRevision(transition.content),
      };
    },
    mode: command.mode,
    store,
  });
}
