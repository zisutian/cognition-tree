// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createDomainTransition,
} from "../commands/domainCommand.ts";
import {
  executePreparedCommand,
  type CommandExecutionMode,
  type PreparedCommandStore,
} from "../commands/preparedCommandExecutor.ts";
import {
  readCommandRuntimeNow,
  type CommandRuntime,
} from "../commands/commandRuntime.ts";
import {
  createJournalBodyReplacement,
  prepareJournalMutation,
  projectJournalMutation,
  type JournalDomainCommand,
  type JournalDomainVersions,
} from "./journalDomainCommands.ts";
import type {
  JournalParseIndex,
} from "../../core/journal/indexes/journalParseIndex.ts";
import type {
  JournalContent,
  JournalEntryId,
} from "../../core/journal/model/journalContent.ts";
import {
  createJournalEntryBodyProjection,
} from "../../core/journal/model/journalEntryProjection.ts";
import {
  isJournalEntryId,
} from "../../core/journal/model/journalIdentity.ts";
import type {
  JournalRevision,
} from "./persistence/journalRepository.ts";

type ResourceVersion = `sha256:${string}`;

type JournalCommandInput =
  | {
      command: { body: string; kind: "create-entry" };
      preconditions: { expectedEntriesVersion: ResourceVersion };
    }
  | {
      command: { entryId: string; kind: "delete-entry" };
      preconditions: { expectedVersion: ResourceVersion };
    }
  | {
      command: {
        body: string;
        entryId: string;
        kind: "replace-entry-body";
      };
      preconditions: { expectedVersion: ResourceVersion };
    };

export type JournalCommandExecutionRequest = JournalCommandInput & {
  mode: CommandExecutionMode;
};

type JournalCommandKind = JournalCommandInput["command"]["kind"];
type JournalCommandInputFor<Kind extends JournalCommandKind> = Extract<
  JournalCommandInput,
  { command: { kind: Kind } }
>;

export type JournalCommandRuntime = CommandRuntime & {
  timezoneOffsetMinutes(date: Date): number;
};

function inputFor<Kind extends JournalCommandKind>(
  input: JournalCommandInput,
  kind: Kind,
) {
  if (input.command.kind !== kind) {
    throw new Error(`Expected Journal command ${kind}.`);
  }
  return input as JournalCommandInputFor<Kind>;
}

function toJournalDomainCommand({
  createId,
  date,
  index,
  input,
  runtime,
  timestamp,
}: {
  createId: () => string;
  date: Date;
  index: JournalParseIndex;
  input: JournalCommandInput;
  runtime: JournalCommandRuntime;
  timestamp: string;
}): JournalDomainCommand {
  if (input.command.kind === "create-entry") {
    const { command, preconditions } = inputFor(input, "create-entry");

    return {
      body: command.body,
      createdAt: timestamp,
      entryId: `journal-entry-${createId()}` as JournalEntryId,
      expectedEntriesVersion: preconditions.expectedEntriesVersion,
      kind: command.kind,
      timezoneOffsetMinutes: runtime.timezoneOffsetMinutes(date),
    };
  }
  if (input.command.kind === "delete-entry") {
    const { command, preconditions } = inputFor(input, "delete-entry");

    return {
      entryId: command.entryId,
      expectedVersion: preconditions.expectedVersion,
      kind: command.kind,
      timestamp,
    };
  }
  const { command, preconditions } = inputFor(input, "replace-entry-body");
  const parsed = isJournalEntryId(command.entryId)
    ? index.getParsedEntry(command.entryId)
    : null;
  const previousBody = parsed
    ? createJournalEntryBodyProjection(parsed).source
    : "";

  return {
    change: createJournalBodyReplacement(
      previousBody,
      command.body,
    ),
    entryId: command.entryId,
    expectedVersion: preconditions.expectedVersion,
    kind: command.kind,
    updatedAt: timestamp,
  };
}

export function projectJournalContentChanges(
  before: JournalContent,
  after: JournalContent,
  timestamp: string,
  beforeIndex: JournalParseIndex,
  afterIndex: JournalParseIndex,
  versionPolicy: JournalDomainVersions,
) {
  return projectJournalMutation({
    after,
    afterIndex,
    before,
    beforeIndex,
    timestamp,
    versions: versionPolicy,
  });
}

export function executeJournalCommand({
  createRevision,
  request,
  runtime,
  store,
  versionPolicy,
}: {
  createRevision(content: JournalContent): JournalRevision;
  request: JournalCommandExecutionRequest;
  runtime: JournalCommandRuntime;
  store: PreparedCommandStore<
    JournalContent,
    JournalParseIndex,
    JournalRevision
  >;
  versionPolicy: JournalDomainVersions;
}) {
  const now = readCommandRuntimeNow(runtime);
  const allocatedIds: string[] = [];

  return executePreparedCommand({
    mode: request.mode,
    prepare({ content, projection: index }) {
      let nextId = 0;
      const createId = () => {
        allocatedIds[nextId] ??= runtime.createId();
        return allocatedIds[nextId++]!;
      };
      const mutation = prepareJournalMutation({
        command: toJournalDomainCommand({
          createId,
          date: now.date,
          index,
          input: request,
          runtime,
          timestamp: now.timestamp,
        }),
        content,
        createBlockId: createId,
        index,
        versions: versionPolicy,
      });
      const projection = projectJournalMutation({
        after: mutation.content,
        afterIndex: mutation.index,
        before: content,
        beforeIndex: index,
        timestamp: mutation.timestamp,
        versions: versionPolicy,
      });
      const transition = createDomainTransition(mutation, projection);

      return {
        changes: transition.changes,
        content: transition.content,
        diff: transition.diff,
        projection: mutation.index,
        result: transition.result,
        revision: createRevision(transition.content),
      };
    },
    store,
  });
}
