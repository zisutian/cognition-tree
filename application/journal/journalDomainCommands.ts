// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnCanonicalSourceAnalysis,
} from "../../core/ctn/analysis/sourceAnalysis.ts";
import {
  createMyersTextEdits,
} from "../../core/ctn/metadata/myersTextEdits.ts";
import type {
  CtnEditableSourceChange,
} from "../../core/ctn/metadata/textEdits.ts";
import { DomainNotFoundError } from "../../core/errors/domainErrors.ts";
import {
  createJournalEntry,
  deleteJournalEntry,
  updateJournalEntryBody,
} from "../../core/journal/commands/journalCommands.ts";
import type {
  JournalCommandOutcome,
} from "../../core/journal/commands/journalCommandOutcome.ts";
import {
  createJournalParseIndex,
  type JournalParseIndex,
} from "../../core/journal/indexes/journalParseIndex.ts";
import {
  listJournalEntries,
  type JournalContent,
  type JournalEntryId,
} from "../../core/journal/model/journalContent.ts";
import {
  createJournalEntryBodyProjection,
} from "../../core/journal/model/journalEntryProjection.ts";
import {
  isJournalEntryId,
} from "../../core/journal/model/journalIdentity.ts";
import {
  createDomainChangeSet,
  type DomainResourceChange,
} from "../../core/sync/domainChangeSet.ts";
import {
  assertDomainResourceVersion,
  projectDomainTextEdits,
  type DomainMutationProjection,
} from "../commands/domainCommand.ts";

export type JournalDomainVersions = {
  entries(content: JournalContent): `sha256:${string}`;
  entry(source: string): `sha256:${string}`;
};

export type JournalDomainCommand =
  | {
      body: string;
      createdAt: string;
      entryId: JournalEntryId;
      expectedEntriesVersion?: `sha256:${string}`;
      kind: "create-entry";
      timezoneOffsetMinutes: number;
    }
  | {
      entryId: string;
      expectedVersion?: `sha256:${string}`;
      kind: "delete-entry";
      timestamp: string;
    }
  | {
      change: CtnEditableSourceChange;
      entryId: string;
      expectedVersion?: `sha256:${string}`;
      kind: "replace-entry-body";
      updatedAt: string;
    };

export type PreparedJournalMutation = {
  analysisOverrides?: ReadonlyMap<
    JournalEntryId,
    CtnCanonicalSourceAnalysis
  >;
  content: JournalContent;
  index: JournalParseIndex;
  outcome: JournalCommandOutcome;
  timestamp: string;
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

export function createJournalBodyReplacement(
  previousBody: string,
  body: string,
): CtnEditableSourceChange {
  return {
    edits: createMyersTextEdits(previousBody, body),
    source: body,
  };
}

export function prepareJournalMutation({
  command,
  content,
  createBlockId,
  index: preparedIndex,
  versions,
}: {
  command: JournalDomainCommand;
  content: JournalContent;
  createBlockId: () => string;
  index?: JournalParseIndex;
  versions?: JournalDomainVersions;
}): PreparedJournalMutation {
  const index = preparedIndex ?? createJournalParseIndex(content);

  if (command.kind === "create-entry") {
    if (versions) {
      assertDomainResourceVersion(
        command.expectedEntriesVersion,
        versions.entries(content),
        "entries",
      );
    }
    const created = createJournalEntry(content, index, {
      createBlockId,
      createdAt: command.createdAt,
      entryId: command.entryId,
      timezoneOffsetMinutes: command.timezoneOffsetMinutes,
    });
    let next = created.content;
    let analysis = created.analysis;

    if (command.body !== "") {
      const createdIndex = createJournalParseIndex(
        next,
        index,
        new Map([[command.entryId, created.analysis]]),
      );
      const updated = updateJournalEntryBody(next, createdIndex, {
        change: createJournalBodyReplacement("", command.body),
        createBlockId,
        entryId: command.entryId,
        updatedAt: command.createdAt,
      });

      next = updated.content;
      analysis = updated.analysis;
    }
    const analysisOverrides = new Map([[command.entryId, analysis]]);

    return {
      analysisOverrides,
      content: next,
      index: createJournalParseIndex(next, index, analysisOverrides),
      outcome: {
        entryId: command.entryId,
        kind: "journal-entry-created",
      },
      timestamp: command.createdAt,
    };
  }
  const parsed = requireParsedEntry(index, command.entryId);

  if (versions) {
    assertDomainResourceVersion(
      command.expectedVersion,
      versions.entry(parsed.entry.source),
      command.entryId,
    );
  }
  if (command.kind === "delete-entry") {
    const next = deleteJournalEntry(content, parsed.entry.id);

    return {
      content: next,
      index: createJournalParseIndex(next, index),
      outcome: { kind: "ok" },
      timestamp: command.timestamp,
    };
  }
  const updated = updateJournalEntryBody(content, index, {
    change: command.change,
    createBlockId,
    entryId: parsed.entry.id,
    updatedAt: command.updatedAt,
  });

  const analysisOverrides = new Map([[parsed.entry.id, updated.analysis]]);

  return {
    analysisOverrides,
    content: updated.content,
    index: createJournalParseIndex(
      updated.content,
      index,
      analysisOverrides,
    ),
    outcome: { kind: "ok" },
    timestamp: command.updatedAt,
  };
}

function journalBody(
  index: JournalParseIndex,
  entryId: string,
) {
  if (!isJournalEntryId(entryId)) return "";
  const parsed = index.getParsedEntry(entryId);

  return parsed ? createJournalEntryBodyProjection(parsed).source : "";
}

export function projectJournalMutation({
  after,
  before,
  timestamp,
  versions,
  afterIndex: preparedAfterIndex,
  beforeIndex: preparedBeforeIndex,
}: {
  after: JournalContent;
  afterIndex?: JournalParseIndex;
  before: JournalContent;
  beforeIndex?: JournalParseIndex;
  timestamp: string;
  versions: JournalDomainVersions;
}): DomainMutationProjection {
  const beforeIndex = preparedBeforeIndex ?? createJournalParseIndex(before);
  const afterIndex = preparedAfterIndex ??
    createJournalParseIndex(after, beforeIndex);
  const beforeEntries = new Map(
    listJournalEntries(before).map((entry) => [entry.id, entry]),
  );
  const afterEntries = new Map(
    listJournalEntries(after).map((entry) => [entry.id, entry]),
  );
  const changedIds = new Set<JournalEntryId>();
  const resources: DomainResourceChange[] = [];

  for (const [id] of beforeEntries) {
    if (afterEntries.has(id)) continue;
    changedIds.add(id);
    resources.push({
      domain: "journal",
      kind: "deleted",
      resourceId: id,
    });
  }
  for (const [id, entry] of afterEntries) {
    const previous = beforeEntries.get(id);
    const version = versions.entry(entry.source);

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
  const beforeEntriesVersion = versions.entries(before);
  const afterEntriesVersion = versions.entries(after);

  if (beforeEntriesVersion !== afterEntriesVersion) {
    resources.push({
      domain: "journal",
      kind: "updated",
      resourceId: "entries",
      version: afterEntriesVersion,
    });
  }
  const blocks = [...changedIds].flatMap((entryId) => {
    const previous = beforeIndex.getParsedEntry(entryId);
    const next = afterIndex.getParsedEntry(entryId);

    return createDomainChangeSet({
      next: next
        ? {
            document: next.analysis.document,
            domain: "journal",
            resourceId: entryId,
            version: versions.entry(next.entry.source),
          }
        : null,
      occurredAt: timestamp,
      previous: previous
        ? {
            document: previous.analysis.document,
            domain: "journal",
            resourceId: entryId,
            version: versions.entry(previous.entry.source),
          }
        : null,
    }).blocks;
  });
  const diff = [...changedIds].flatMap((entryId) =>
    projectDomainTextEdits(
      entryId,
      createMyersTextEdits(
        journalBody(beforeIndex, entryId),
        journalBody(afterIndex, entryId),
      ),
    )
  );

  return {
    changes: { blocks, occurredAt: timestamp, resources },
    diff,
  };
}
