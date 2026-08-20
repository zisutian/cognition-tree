// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentPreparedCommand } from "../commands/agentCommandPreparation.ts";
import {
  readCommandRuntimeNow,
  type CommandRuntime,
} from "../commands/commandRuntime.ts";
import {
  createJournalBodyReplacement,
  prepareJournalMutation,
  type JournalDomainCommand,
  type JournalDomainVersions,
} from "./journalDomainCommands.ts";
import type { JournalCommandOutcome } from "../../core/journal/commands/journalCommandOutcome.ts";
import type { JournalParseIndex } from "../../core/journal/indexes/journalParseIndex.ts";
import type {
  JournalContent,
  JournalEntryId,
} from "../../core/journal/model/journalContent.ts";
import { createJournalEntryBodyProjection } from "../../core/journal/model/journalEntryProjection.ts";
import { isJournalEntryId } from "../../core/journal/model/journalIdentity.ts";
import { DomainNotFoundError } from "../../core/errors/domainErrors.ts";
import type { PreparedVersionedSnapshot } from "../persistence/versionedRepository.ts";
import type { JournalRevision } from "./persistence/journalRepository.ts";

export type JournalAgentCommandIntent =
  | { body: string; kind: "create-entry" }
  | { entryId: string; kind: "delete-entry" }
  | { body: string; entryId: string; kind: "replace-entry-body" };

export type JournalAgentCommandRuntime = CommandRuntime & {
  timezoneOffsetMinutes(date: Date): number;
};

function requireParsedEntry(index: JournalParseIndex, entryId: string) {
  if (!isJournalEntryId(entryId)) {
    throw new DomainNotFoundError(entryId, "Journal entry does not exist");
  }
  const parsed = index.getParsedEntry(entryId);

  if (!parsed) {
    throw new DomainNotFoundError(entryId, "Journal entry does not exist");
  }
  return parsed;
}

function toDomainCommand({
  createId,
  date,
  index,
  intent,
  runtime,
  timestamp,
  versions,
  content,
}: {
  content: JournalContent;
  createId(): string;
  date: Date;
  index: JournalParseIndex;
  intent: JournalAgentCommandIntent;
  runtime: JournalAgentCommandRuntime;
  timestamp: string;
  versions: JournalDomainVersions;
}): JournalDomainCommand {
  if (intent.kind === "create-entry") {
    return {
      body: intent.body,
      createdAt: timestamp,
      entryId: `journal-entry-${createId()}` as JournalEntryId,
      expectedEntriesVersion: versions.entries(content),
      kind: intent.kind,
      timezoneOffsetMinutes: runtime.timezoneOffsetMinutes(date),
    };
  }
  const parsed = requireParsedEntry(index, intent.entryId);

  if (intent.kind === "delete-entry") {
    return {
      entryId: intent.entryId,
      expectedVersion: versions.entry(parsed.source),
      kind: intent.kind,
      timestamp,
    };
  }
  return {
    change: createJournalBodyReplacement(
      createJournalEntryBodyProjection(parsed).source,
      intent.body,
    ),
    entryId: intent.entryId,
    expectedVersion: versions.entry(parsed.source),
    kind: intent.kind,
    updatedAt: timestamp,
  };
}

export function prepareAgentJournalCommand({
  intent,
  runtime,
  snapshot,
  versionPolicy,
}: {
  intent: JournalAgentCommandIntent;
  runtime: JournalAgentCommandRuntime;
  snapshot: PreparedVersionedSnapshot<
    JournalContent,
    JournalParseIndex,
    JournalRevision
  >;
  versionPolicy: JournalDomainVersions;
}): AgentPreparedCommand<
  JournalContent,
  JournalParseIndex,
  JournalCommandOutcome,
  JournalRevision
> {
  const now = readCommandRuntimeNow(runtime);
  const mutation = prepareJournalMutation({
    command: toDomainCommand({
      content: snapshot.content,
      createId: runtime.createId,
      date: now.date,
      index: snapshot.projection,
      intent,
      runtime,
      timestamp: now.timestamp,
      versions: versionPolicy,
    }),
    content: snapshot.content,
    createBlockId: runtime.createId,
    index: snapshot.projection,
    versions: versionPolicy,
  });

  return {
    baseRevision: snapshot.revision,
    content: mutation.content,
    destructive: intent.kind === "delete-entry",
    outcome: mutation.outcome,
    projection: mutation.index,
    timestamp: mutation.timestamp,
  };
}
