// SPDX-License-Identifier: GPL-3.0-or-later

import { createMyersTextEdits } from "../../../core/ctn/metadata/myersTextEdits.ts";
import {
  createJournalEntry,
  updateJournalEntryBody,
} from "../../../core/journal/commands/journalCommands.ts";
import {
  createJournalParseIndex,
  type JournalParseIndex,
} from "../../../core/journal/indexes/journalParseIndex.ts";
import type {
  JournalContent,
  JournalEntryId,
} from "../../../core/journal/model/journalContent.ts";
import { createJournalEntryBodyProjection } from "../../../core/journal/model/journalEntryProjection.ts";
import type { PreparedVersionedContent } from "../../persistence/versionedRepository.ts";

export type JournalConflictRecoveryDependencies = {
  createBlockId(): string;
  createJournalEntryId(): JournalEntryId;
  now(): string;
  timezoneOffsetMinutes(): number;
};

function journalConflictEntryIds(unitIds: readonly string[]) {
  return unitIds.flatMap((unitId) =>
    unitId.startsWith("journal:entry:")
      ? [unitId.slice("journal:entry:".length) as JournalEntryId]
      : []
  );
}

export function recoverJournalLocalConflictCopies(
  selected: PreparedVersionedContent<JournalContent, JournalParseIndex>,
  conflict: Readonly<{ unitIds: readonly string[] }>,
  dependencies: JournalConflictRecoveryDependencies,
  localPrepared: PreparedVersionedContent<JournalContent, JournalParseIndex>,
) {
  const localIndex = localPrepared.projection;
  let next = selected.content;
  let currentIndex = selected.projection;
  let recovered = 0;

  for (const sourceEntryId of journalConflictEntryIds(conflict.unitIds)) {
    const localEntry = localIndex.getParsedEntry(sourceEntryId);

    if (!localEntry) continue;
    const body = createJournalEntryBodyProjection(localEntry).source;
    const timestamp = dependencies.now();
    const entryId = dependencies.createJournalEntryId();
    const created = createJournalEntry(next, currentIndex, {
      createBlockId: dependencies.createBlockId,
      createdAt: timestamp,
      entryId,
      timezoneOffsetMinutes: dependencies.timezoneOffsetMinutes(),
    });
    const createdIndex = createJournalParseIndex(
      created.content,
      currentIndex,
      new Map([[entryId, created.analysis]]),
    );
    const updated = updateJournalEntryBody(created.content, createdIndex, {
      change: {
        edits: createMyersTextEdits("", body),
        source: body,
      },
      createBlockId: dependencies.createBlockId,
      entryId,
      updatedAt: timestamp,
    });

    next = updated.content;
    currentIndex = createJournalParseIndex(
      next,
      createdIndex,
      new Map([[entryId, updated.analysis]]),
    );
    recovered += 1;
  }
  if (recovered === 0) {
    throw new Error("当前冲突不包含可另存的本地正文。");
  }
  return { content: next, projection: currentIndex };
}
