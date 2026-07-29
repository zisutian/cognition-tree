// SPDX-License-Identifier: GPL-3.0-or-later

import { createCtnBlockIdAllocator } from "../../ctn/metadata/blockIdAllocator.ts";
import {
  recanonicalizeCtnSourceBlockMetadata,
  reconcileCtnSourceBlockMetadata,
} from "../../ctn/metadata/reconcileSourceMetadata.ts";
import {
  initializeCtnSourceBlockMetadataAnalysis,
} from "../../ctn/metadata/sourceMetadata.ts";
import {
  assertCtnEditableSourceChange,
  type CtnEditableSourceChange,
} from "../../ctn/metadata/textEdits.ts";
import { requireCtnSyntax } from "../../ctn/syntax/compiler.ts";
import {
  analyzeCtnSource,
  type CtnCanonicalSourceAnalysis,
} from "../../ctn/analysis/sourceAnalysis.ts";
import type {
  JournalParseIndex,
} from "../indexes/journalParseIndex.ts";
import {
  formatJournalEntryDate,
  formatJournalEntryTitle,
  journalMaximumDailySequence,
  isJournalEntryId,
  type JournalContent,
  type JournalEntryId,
} from "../model/journalContent.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../errors/domainErrors.ts";

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

export type UpdateJournalSyntaxSourceInput = {
  createBlockId: () => string;
  source: string;
  updatedAt: string;
};

function canonicalTimestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);

  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new DomainValidationError(
      `${label} must be a canonical ISO timestamp.`,
    );
  }
  return milliseconds;
}

function findEntryPosition(content: JournalContent, entryId: JournalEntryId) {
  const dayIndex = content.days.findIndex((day) =>
    day.entries.some((entry) => entry.id === entryId)
  );

  if (dayIndex < 0) {
    throw new DomainNotFoundError(
      entryId,
      `Journal entry does not exist: ${entryId}`,
    );
  }
  const entryIndex = content.days[dayIndex].entries.findIndex(
    (entry) => entry.id === entryId,
  );
  return { dayIndex, entryIndex };
}

export function createJournalEntry(
  content: JournalContent,
  index: JournalParseIndex,
  input: CreateJournalEntryInput,
) {
  if (!isJournalEntryId(input.entryId)) {
    throw new DomainValidationError(
      `Invalid journal entry id: ${input.entryId}`,
    );
  }
  if (index.entryById.has(input.entryId)) {
    throw new DomainValidationError(
      `Journal entry already exists: ${input.entryId}`,
    );
  }

  const date = formatJournalEntryDate(
    input.createdAt,
    input.timezoneOffsetMinutes,
  );
  const existingDay = content.days.find((day) => day.date === date);
  const lastIssuedSequence = existingDay?.lastIssuedSequence ?? 0;

  if (lastIssuedSequence >= journalMaximumDailySequence) {
    throw new DomainValidationError(
      `Journal date ${date} has reached the daily limit of ${journalMaximumDailySequence} entries.`,
    );
  }
  const sequence = lastIssuedSequence + 1;
  const title = formatJournalEntryTitle(
    input.createdAt,
    input.timezoneOffsetMinutes,
    sequence,
  );
  const initialized = initializeCtnSourceBlockMetadataAnalysis(
    `${title}\n`,
    index.syntax,
    {
      createdAt: input.createdAt,
      createId: input.createBlockId,
      reservedIds: index.blockIds,
      updatedAt: input.createdAt,
    },
  );
  const source = initialized.source;
  const next: JournalContent = {
    ...content,
    days: (existingDay
      ? content.days.map((day) =>
          day.date === date
            ? {
                ...day,
                entries: [...day.entries, {
                  createdAt: input.createdAt,
                  id: input.entryId,
                  sequence,
                  source,
                  timezoneOffsetMinutes: input.timezoneOffsetMinutes,
                  updatedAt: input.createdAt,
                }],
                lastIssuedSequence: sequence,
              }
            : day
        )
      : [...content.days, {
          date,
          entries: [{
            createdAt: input.createdAt,
            id: input.entryId,
            sequence,
            source,
            timezoneOffsetMinutes: input.timezoneOffsetMinutes,
            updatedAt: input.createdAt,
          }],
          lastIssuedSequence: sequence,
        }]
    ).sort((left, right) => left.date.localeCompare(right.date)),
  };

  return {
    analysis: initialized.analysis,
    content: next,
    entryId: input.entryId,
  };
}

export function updateJournalEntryBody(
  content: JournalContent,
  index: JournalParseIndex,
  input: UpdateJournalEntryBodyInput,
) {
  const { dayIndex, entryIndex } = findEntryPosition(content, input.entryId);
  const parsed = index.getParsedEntry(input.entryId);

  if (!parsed || parsed.entry.source !==
      content.days[dayIndex].entries[entryIndex]?.source) {
    throw new Error(`Journal entry analysis is stale: ${input.entryId}`);
  }
  const editable = parsed.analysis.editableProjection.source;
  const prefix = `${parsed.title}\n`;
  const body = editable === parsed.title
    ? ""
    : editable.startsWith(prefix)
      ? editable.slice(prefix.length)
      : (() => {
          throw new Error(
            `Journal entry ${input.entryId} has an invalid editable title.`,
          );
        })();
  const current = {
    body,
    editable,
    entry: parsed.entry,
    parsed,
  };
  const syntax = index.syntax;

  assertCtnEditableSourceChange(current.body, input.change);
  if (current.body === input.change.source) {
    return { analysis: parsed.analysis, content };
  }
  if (Date.parse(input.updatedAt) < Date.parse(current.entry.updatedAt)) {
    throw new DomainValidationError(
      "Journal entry updatedAt cannot move backwards.",
    );
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
    current.parsed.analysis,
    analyzeCtnSource({
      mode: { kind: "editable-document" },
      source: nextEditableSource,
      syntax,
    }),
    {
      edits,
      source: nextEditableSource,
    },
    {
      createId: input.createBlockId,
      reservedIds: index.blockIds,
      timestamp: input.updatedAt,
      touchTitle: false,
    },
  );
  const entries = [...content.days[dayIndex].entries];

  entries[entryIndex] = {
    ...current.entry,
    source: reconciled.source,
    updatedAt: input.updatedAt,
  };
  const days = [...content.days];

  days[dayIndex] = { ...days[dayIndex], entries };
  return {
    analysis: reconciled.analysis,
    content: { ...content, days },
  };
}

export function updateJournalSyntaxSource(
  content: JournalContent,
  index: JournalParseIndex,
  input: UpdateJournalSyntaxSourceInput,
) {
  if (content.syntaxSource === input.source) {
    return {
      analysisOverrides:
        new Map<JournalEntryId, CtnCanonicalSourceAnalysis>(),
      content,
    };
  }
  canonicalTimestamp(input.updatedAt, "Journal syntax updatedAt");
  const syntax = requireCtnSyntax(input.source, "journal");

  if (syntax.blockGrammarKey === index.syntax.blockGrammarKey) {
    return {
      analysisOverrides:
        new Map<JournalEntryId, CtnCanonicalSourceAnalysis>(),
      content: { ...content, syntaxSource: input.source },
    };
  }
  const allocator = createCtnBlockIdAllocator(
    input.createBlockId,
    index.blockIds,
  );
  const analysisOverrides =
    new Map<JournalEntryId, CtnCanonicalSourceAnalysis>();
  const days = content.days.map((day) => ({
    ...day,
    entries: day.entries.map((entry) => {
      const previous = index.getParsedEntry(entry.id);

      if (!previous || previous.entry.source !== entry.source) {
        throw new Error(`Journal entry analysis is stale: ${entry.id}`);
      }
      const candidate = analyzeCtnSource({
        mode: { kind: "editable-document" },
        source: previous.analysis.editableProjection.source,
        syntax,
      });
      const reconciled = recanonicalizeCtnSourceBlockMetadata(
        previous.analysis,
        candidate,
        {
          allocateId: allocator.allocate,
          timestamp: input.updatedAt,
          touchTitle: false,
        },
      );

      analysisOverrides.set(entry.id, reconciled.analysis);
      return reconciled.source === entry.source
        ? entry
        : {
            ...entry,
            source: reconciled.source,
            updatedAt: input.updatedAt,
          };
    }),
  }));

  return {
    analysisOverrides,
    content: {
      ...content,
      days,
      syntaxSource: input.source,
    },
  };
}

export function deleteJournalEntry(
  content: JournalContent,
  entryId: JournalEntryId,
) {
  const { dayIndex, entryIndex } = findEntryPosition(content, entryId);
  const entries = [...content.days[dayIndex].entries];

  entries.splice(entryIndex, 1);
  const days = [...content.days];

  days[dayIndex] = { ...days[dayIndex], entries };
  return { ...content, days };
}
