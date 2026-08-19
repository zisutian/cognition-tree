// SPDX-License-Identifier: GPL-3.0-or-later

import { createMyersTextEdits } from "../../../core/ctn/metadata/myersTextEdits";
import {
  formatCtnBlockMetadataLine,
  parseCtnBlockMetadataLine,
} from "../../../core/ctn/metadata/blockMetadata";
import {
  readCtnCanonicalTitleHeader,
} from "../../../core/ctn/parser/parseCtnDocument";
import {
  readCanonicalTestDocument,
} from "../ctn/analysis/analysisTestHelpers";
import {
  createJournalEntry,
  updateJournalEntryBody,
} from "../../../core/journal/commands/journalCommands";
import type {
  JournalContent,
  JournalEntry,
  JournalEntryId,
} from "../../../core/journal/model/journalContent";
import {
  createEmptyJournalContent as createDomainEmptyJournalContent,
  listJournalEntries,
} from "../../../core/journal/model/journalContent";
import {
  formatJournalEntryDate,
  formatJournalEntryTitle,
} from "../../../core/journal/model/journalIdentity";
import { requireCtnSyntax } from "../../../core/ctn/syntax/compiler";
import {
  createJournalParseIndex,
} from "../../../core/journal/indexes/journalParseIndex";

export function journalEntryId(index: number): JournalEntryId {
  return `journal-entry-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function journalBlockId(index: number) {
  return `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function createEmptyJournalContent(): JournalContent {
  return createDomainEmptyJournalContent();
}

export function journalEntries(content: JournalContent) {
  return listJournalEntries(content);
}

export function replaceJournalTestEntries(
  content: JournalContent,
  entries: JournalEntry[],
) {
  return {
    ...content,
    days: content.days.map((day) => ({
      ...day,
      entries: entries.filter((entry) =>
        formatJournalEntryDate(
          entry.createdAt,
          entry.timezoneOffsetMinutes,
        ) === day.date
      ),
    })),
  };
}

function findJournalTestEntryPosition(
  content: JournalContent,
  entryId: JournalEntryId,
) {
  const dayIndex = content.days.findIndex((day) =>
    day.entries.some(({ id }) => id === entryId)
  );

  if (dayIndex < 0) {
    throw new Error(`Journal test entry does not exist: ${entryId}`);
  }
  const entryIndex = content.days[dayIndex].entries.findIndex(
    ({ id }) => id === entryId,
  );
  return { dayIndex, entryIndex };
}

export function appendJournalTestEntry(
  content: JournalContent,
  {
    blockIdStart = 1,
    createdAt,
    entryIndex,
    timezoneOffsetMinutes = 480,
  }: {
    blockIdStart?: number;
    createdAt: string;
    entryIndex: number;
    timezoneOffsetMinutes?: number;
  },
) {
  let nextBlockId = blockIdStart;

  return createJournalEntry(
    content,
    createJournalParseIndex(content),
    {
      createBlockId: () => journalBlockId(nextBlockId++),
      createdAt,
      entryId: journalEntryId(entryIndex),
      timezoneOffsetMinutes,
    },
  ).content;
}

export function updateJournalTestBody(
  content: JournalContent,
  {
    body,
    createBlockIdStart = 100,
    entryIndex,
    previousBody = "",
    updatedAt,
  }: {
    body: string;
    createBlockIdStart?: number;
    entryIndex: number;
    previousBody?: string;
    updatedAt: string;
  },
) {
  let nextBlockId = createBlockIdStart;

  return updateJournalEntryBody(
    content,
    createJournalParseIndex(content),
    {
    change: {
      edits: createMyersTextEdits(previousBody, body),
      source: body,
    },
    createBlockId: () => journalBlockId(nextBlockId++),
    entryId: journalEntryId(entryIndex),
    updatedAt,
    },
  ).content;
}

export function tamperJournalTestEntryCreation(
  content: JournalContent,
  {
    createdAt,
    entryIndex,
    headerBlockId = journalBlockId(999),
    timezoneOffsetMinutes,
  }: {
    createdAt: string;
    entryIndex: number;
    headerBlockId?: string;
    timezoneOffsetMinutes: number;
  },
) {
  const entryId = journalEntryId(entryIndex);
  const { dayIndex, entryIndex: positionEntryIndex } = findJournalTestEntryPosition(
    content,
    entryId,
  );
  const entry = content.days[dayIndex].entries[positionEntryIndex];
  const header = readCtnCanonicalTitleHeader(entry.source);
  const lines = entry.source.split("\n");

  lines[0] = formatCtnBlockMetadataLine({
    ...header.metadata,
    createdAt,
    id: headerBlockId,
    updatedAt: createdAt,
  });
  lines[1] = formatJournalEntryTitle(
    createdAt,
    timezoneOffsetMinutes,
    entry.sequence,
  );
  const tamperedEntry = {
    ...entry,
    createdAt,
    source: lines.join("\n"),
    timezoneOffsetMinutes,
    updatedAt: createdAt,
  };
  const date = formatJournalEntryDate(createdAt, timezoneOffsetMinutes);
  const days = content.days.map((day, index) =>
    index === dayIndex
      ? {
          ...day,
          entries: day.entries.filter(({ id }) => id !== entryId),
        }
      : day
  );
  const targetDay = days.find((day) => day.date === date);

  if (targetDay) {
    targetDay.entries = [...targetDay.entries, tamperedEntry].sort(
      (left, right) => left.sequence - right.sequence,
    );
    targetDay.lastIssuedSequence = Math.max(
      targetDay.lastIssuedSequence,
      entry.sequence,
    );
  } else {
    days.push({
      date,
      entries: [tamperedEntry],
      lastIssuedSequence: entry.sequence,
    });
  }

  return { ...content, days: days.sort((left, right) =>
    left.date.localeCompare(right.date)
  ) };
}

export function tamperJournalTestBodyBlockTime(
  content: JournalContent,
  {
    blockIndex = 1,
    createdAt,
    entryIndex,
    updatedAt,
  }: {
    blockIndex?: number;
    createdAt?: string;
    entryIndex: number;
    updatedAt?: string;
  },
) {
  const entryId = journalEntryId(entryIndex);
  const { dayIndex, entryIndex: positionEntryIndex } = findJournalTestEntryPosition(
    content,
    entryId,
  );
  const entry = content.days[dayIndex].entries[positionEntryIndex];
  const document = readCanonicalTestDocument(
    entry.source,
    requireCtnSyntax(content.syntaxSource, "journal"),
  );
  const block = document.blocks[blockIndex];

  if (!block) {
    throw new Error(`Journal test block does not exist at index ${blockIndex}`);
  }
  const lines = entry.source.split("\n");
  const lineIndex = block.metadataLineNumber - 1;
  const metadata = parseCtnBlockMetadataLine(lines[lineIndex] ?? "");

  if (!metadata) {
    throw new Error(`Journal test block metadata is missing at ${lineIndex + 1}`);
  }
  lines[lineIndex] = formatCtnBlockMetadataLine({
    ...metadata,
    createdAt: createdAt ?? metadata.createdAt,
    updatedAt: updatedAt ?? metadata.updatedAt,
  });
  const entries = [...content.days[dayIndex].entries];

  entries[positionEntryIndex] = { ...entry, source: lines.join("\n") };
  const days = [...content.days];

  days[dayIndex] = { ...days[dayIndex], entries };
  return { ...content, days };
}
