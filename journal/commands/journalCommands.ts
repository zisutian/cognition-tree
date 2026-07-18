// SPDX-License-Identifier: GPL-3.0-or-later

import { reconcileCtnSourceBlockMetadata } from "../../ctn/metadata/reconcileSourceMetadata.ts";
import {
  initializeCtnSourceBlockMetadata,
  replaceCtnSourceTitle,
} from "../../ctn/metadata/sourceMetadata.ts";
import {
  assertCtnEditableSourceChange,
  type CtnEditableSourceChange,
} from "../../ctn/metadata/textEdits.ts";
import { readCtnCanonicalTitleHeader } from "../../ctn/parser/parseCtnDocument.ts";
import {
  collectJournalBlockIds,
  createJournalEntryBodyProjection,
  formatJournalEntryTitle,
  isJournalEntryId,
  validateJournalContent,
  type JournalContent,
  type JournalEntryId,
} from "../model/journalContent.ts";
import { journalCtnSyntaxProfileV1 } from "../syntax/journalSyntaxV1.ts";

export type CreateJournalEntryInput = {
  createBlockId: () => string;
  createdAt: string;
  entryId: JournalEntryId;
  timezoneOffsetMinutes: number;
};

export type UpdateJournalEntryBodyInput = {
  change: CtnEditableSourceChange;
  createBlockId: () => string;
  entryId: JournalEntryId;
  updatedAt: string;
};

function findEntryIndex(content: JournalContent, entryId: JournalEntryId) {
  const index = content.entries.findIndex((entry) => entry.id === entryId);

  if (index < 0) {
    throw new Error(`Journal entry does not exist: ${entryId}`);
  }
  return index;
}

function getEditableBodySource(content: JournalContent, entryId: JournalEntryId) {
  const entry = content.entries[findEntryIndex(content, entryId)];
  const projection = createJournalEntryBodyProjection(entry);

  return {
    body: projection.source,
    editable: projection.editableSource,
    entry,
    parsed: projection,
  };
}

export function createJournalEntry(
  content: JournalContent,
  input: CreateJournalEntryInput,
) {
  validateJournalContent(content);
  if (!isJournalEntryId(input.entryId)) {
    throw new Error(`Invalid journal entry id: ${input.entryId}`);
  }
  if (content.entries.some(({ id }) => id === input.entryId)) {
    throw new Error(`Journal entry already exists: ${input.entryId}`);
  }

  const title = formatJournalEntryTitle(
    input.createdAt,
    input.timezoneOffsetMinutes,
  );
  const source = initializeCtnSourceBlockMetadata(
    `${title}\n`,
    journalCtnSyntaxProfileV1,
    {
      createdAt: input.createdAt,
      createId: input.createBlockId,
      reservedIds: collectJournalBlockIds(content),
      updatedAt: input.createdAt,
    },
  );
  const next: JournalContent = {
    ...content,
    entries: [
      ...content.entries,
      {
        createdAt: input.createdAt,
        id: input.entryId,
        source,
        timezoneOffsetMinutes: input.timezoneOffsetMinutes,
        updatedAt: input.createdAt,
      },
    ],
  };

  validateJournalContent(next);
  return { content: next, entryId: input.entryId };
}

export function updateJournalEntryBody(
  content: JournalContent,
  input: UpdateJournalEntryBodyInput,
) {
  validateJournalContent(content);
  const entryIndex = findEntryIndex(content, input.entryId);
  const current = getEditableBodySource(content, input.entryId);

  assertCtnEditableSourceChange(current.body, input.change);
  if (current.body === input.change.source) {
    return content;
  }
  if (Date.parse(input.updatedAt) < Date.parse(current.entry.updatedAt)) {
    throw new Error("Journal entry updatedAt cannot move backwards.");
  }

  const nextEditableSource = `${current.parsed.title}\n${input.change.source}`;
  const titleSeparatorOffset = current.parsed.title.length + 1;
  const edits = current.editable === current.parsed.title
    ? [{
        from: current.parsed.title.length,
        insertedText: `\n${input.change.source}`,
        to: current.parsed.title.length,
      }]
    : input.change.edits.map((edit) => ({
        ...edit,
        from: edit.from + titleSeparatorOffset,
        to: edit.to + titleSeparatorOffset,
      }));
  const reconciled = reconcileCtnSourceBlockMetadata(
    current.entry.source,
    {
      edits,
      source: nextEditableSource,
    },
    journalCtnSyntaxProfileV1,
    {
      createId: input.createBlockId,
      reservedIds: collectJournalBlockIds(content),
      timestamp: input.updatedAt,
    },
  );
  const previousTitleMetadata = readCtnCanonicalTitleHeader(
    current.entry.source,
  ).metadata;
  const sourceWithImmutableTitle = replaceCtnSourceTitle(
    reconciled,
    current.parsed.title,
    previousTitleMetadata.updatedAt,
  );
  const entries = [...content.entries];

  entries[entryIndex] = {
    ...current.entry,
    source: sourceWithImmutableTitle,
    updatedAt: input.updatedAt,
  };
  const next = { ...content, entries };

  validateJournalContent(next);
  return next;
}

export function deleteJournalEntry(
  content: JournalContent,
  entryId: JournalEntryId,
) {
  validateJournalContent(content);
  const entryIndex = findEntryIndex(content, entryId);
  const entries = [...content.entries];

  entries.splice(entryIndex, 1);
  const next = { ...content, entries };

  validateJournalContent(next);
  return next;
}
