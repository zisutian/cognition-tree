// SPDX-License-Identifier: GPL-3.0-or-later

import {
  moveCtnContentSubtree,
  type CtnContentMoveTarget,
} from "../../ctn/index.ts";
import type { JournalParseIndex } from "../indexes/journalParseIndex.ts";
import type {
  JournalContent,
  JournalEntryId,
} from "../model/journalContent.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../errors/index.ts";

export function moveJournalBlock(
  content: JournalContent,
  index: JournalParseIndex,
  input: {
    entryId: JournalEntryId;
    blockId: string;
    target: CtnContentMoveTarget;
    updatedAt: string;
  },
) {
  const parsed = index.getParsedEntry(input.entryId);
  if (!parsed)
    throw new DomainNotFoundError(
      input.entryId,
      "Journal entry does not exist.",
    );
  const time = Date.parse(input.updatedAt);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString() !== input.updatedAt ||
    time < Date.parse(parsed.entry.updatedAt)
  )
    throw new DomainValidationError(
      "Journal modification timestamp is invalid.",
    );
  const moved = moveCtnContentSubtree(
    parsed.analysis,
    input.blockId,
    input.target,
    input.updatedAt,
    false,
  );
  return {
    analysis: moved.analysis,
    content: {
      ...content,
      days: content.days.map((day) => ({
        ...day,
        entries: day.entries.map((entry) =>
          entry.id === input.entryId
            ? { ...entry, source: moved.nextText, updatedAt: input.updatedAt }
            : entry,
        ),
      })),
    },
  };
}
