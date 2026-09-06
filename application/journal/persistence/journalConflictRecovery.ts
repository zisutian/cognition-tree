// SPDX-License-Identifier: GPL-3.0-or-later

import { createMyersTextEdits } from "../../../core/ctn/index.ts";
import {
  createJournalEntry,
  updateJournalEntryBody,
  createJournalParseIndex,
  type JournalParseIndex,
  createJournalEntryBodyProjection,
} from "../../../core/journal/index.ts";

import type {
  JournalContent,
  JournalEntryId,
} from "../../../core/journal/index.ts";

import type { PreparedVersionedContent } from "../../persistence/index.ts";

export type JournalConflictRecoveryDependencies = {
  createBlockId(): string;
  createJournalEntryId(): JournalEntryId;
  now(): string;
  timezoneOffsetMinutes(): number;
};

function journalConflictEntryIds(unitIds: readonly string[]) {
  return unitIds.map((unitId) => {
    const prefix = "journal:entry:";
    const entryId = unitId.startsWith(prefix) ? unitId.slice(prefix.length) : "";

    if (!entryId) {
      throw new Error(`当前冲突单元无法无损另存：${unitId}`);
    }
    return entryId as JournalEntryId;
  });
}

export function recoverJournalLocalConflictCopies(
  selected: PreparedVersionedContent<JournalContent, JournalParseIndex>,
  conflict: Readonly<{ unitIds: readonly string[] }>,
  dependencies: JournalConflictRecoveryDependencies,
  localPrepared: PreparedVersionedContent<JournalContent, JournalParseIndex>,
) {
  const localIndex = localPrepared.projection;
  const recoverableEntries = journalConflictEntryIds(conflict.unitIds).map(
    (sourceEntryId) => {
      const localEntry = localIndex.getParsedEntry(sourceEntryId);

      if (!localEntry) {
        throw new Error(`本地冲突日记不可用于另存：${sourceEntryId}`);
      }
      return localEntry;
    },
  );
  let next = selected.content;
  let currentIndex = selected.projection;
  let recovered = 0;

  for (const localEntry of recoverableEntries) {
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
  if (recovered !== conflict.unitIds.length || recovered === 0) {
    throw new Error("当前冲突不包含可另存的本地正文。");
  }
  return {
    coveredUnitIds: [...conflict.unitIds],
    prepared: { content: next, projection: currentIndex },
  };
}
