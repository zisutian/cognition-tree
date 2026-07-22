// SPDX-License-Identifier: GPL-3.0-or-later

import { createMyersTextEdits } from "../../core/ctn/metadata/myersTextEdits";
import {
  formatCtnBlockMetadataLine,
  parseCtnBlockMetadataLine,
} from "../../core/ctn/metadata/blockMetadata";
import {
  parseCtnCanonicalDocument,
  readCtnCanonicalTitleHeader,
} from "../../core/ctn/parser/parseCtnDocument";
import {
  createJournalEntry,
  updateJournalEntryBody,
} from "../../core/journal/commands/journalCommands";
import type {
  JournalContent,
  JournalEntryId,
} from "../../core/journal/model/journalContent";
import {
  createEmptyJournalContent as createDomainEmptyJournalContent,
  formatJournalEntryDate,
  formatJournalEntryTitle,
} from "../../core/journal/model/journalContent";
import { requireJournalSyntaxProfile } from "../../core/journal/syntax/journalSyntax";

export function journalEntryId(index: number): JournalEntryId {
  return `journal-entry-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function journalBlockId(index: number) {
  return `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function createEmptyJournalContent(): JournalContent {
  return createDomainEmptyJournalContent();
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

  return createJournalEntry(content, {
    createBlockId: () => journalBlockId(nextBlockId++),
    createdAt,
    entryId: journalEntryId(entryIndex),
    timezoneOffsetMinutes,
  }).content;
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

  return updateJournalEntryBody(content, {
    change: {
      edits: createMyersTextEdits(previousBody, body),
      source: body,
    },
    createBlockId: () => journalBlockId(nextBlockId++),
    entryId: journalEntryId(entryIndex),
    updatedAt,
  });
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
  const entryIndexInContent = content.entries.findIndex(
    ({ id }) => id === entryId,
  );

  if (entryIndexInContent < 0) {
    throw new Error(`Journal test entry does not exist: ${entryId}`);
  }
  const entry = content.entries[entryIndexInContent];
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
  const entries = [...content.entries];

  entries[entryIndexInContent] = {
    ...entry,
    createdAt,
    source: lines.join("\n"),
    timezoneOffsetMinutes,
    updatedAt: createdAt,
  };
  const date = formatJournalEntryDate(createdAt, timezoneOffsetMinutes);
  const dailyCounters = content.dailyCounters.some(
      (counter) => counter.date === date,
    )
    ? content.dailyCounters.map((counter) =>
        counter.date === date
          ? {
              ...counter,
              lastIssuedSequence: Math.max(
                counter.lastIssuedSequence,
                entry.sequence,
              ),
            }
          : counter
      )
    : [
        ...content.dailyCounters,
        { date, lastIssuedSequence: entry.sequence },
      ];

  return { ...content, dailyCounters, entries };
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
  const entryIndexInContent = content.entries.findIndex(
    ({ id }) => id === entryId,
  );

  if (entryIndexInContent < 0) {
    throw new Error(`Journal test entry does not exist: ${entryId}`);
  }
  const entry = content.entries[entryIndexInContent];
  const document = parseCtnCanonicalDocument(
    entry.source,
    requireJournalSyntaxProfile(content.syntaxSource),
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
  const entries = [...content.entries];

  entries[entryIndexInContent] = { ...entry, source: lines.join("\n") };
  return { ...content, entries };
}
