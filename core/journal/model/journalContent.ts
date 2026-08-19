// SPDX-License-Identifier: GPL-3.0-or-later

import {
  analyzeCtnSource,
  type CtnCanonicalSourceAnalysis,
} from "../../ctn/analysis/sourceAnalysis.ts";
import { compileCtnSyntaxSource } from "../../ctn/syntax/compiler.ts";
import type { CtnCompiledSyntax } from "../../ctn/syntax/types.ts";
import {
  getCtnEditableLineNumber,
} from "../../ctn/metadata/editableSource.ts";
import {
  readCtnCanonicalTitleHeader,
} from "../../ctn/parser/parseCtnDocument.ts";
import {
  defaultJournalSyntaxSource,
} from "../syntax/defaultJournalSyntax.ts";

export const journalRepositorySchemaVersion = 3 as const;
export const journalMaximumDailySequence = 9_999;

export type JournalEntryId = `journal-entry-${string}`;

export type JournalDay = {
  date: string;
  entries: JournalEntry[];
  lastIssuedSequence: number;
};

export type JournalEntry = {
  id: JournalEntryId;
  createdAt: string;
  sequence: number;
  timezoneOffsetMinutes: number;
  updatedAt: string;
  source: string;
};

/** Shape accepted after the runtime-neutral system wire parser has run. */
export type JournalEntryValue = Omit<JournalEntry, "id"> & { id: string };

export type JournalContent = {
  schemaVersion: typeof journalRepositorySchemaVersion;
  syntaxSource: string;
  days: JournalDay[];
};

export type JournalDayValue = Omit<JournalDay, "entries"> & {
  entries: JournalEntryValue[];
};

export type JournalContentValue = Omit<JournalContent, "days"> & {
  days: JournalDayValue[];
};

export type ParsedJournalEntry = {
  analysis: CtnCanonicalSourceAnalysis;
  entry: JournalEntry;
  title: string;
};

export type ValidatedJournalContentAnalysis = {
  content: JournalContent;
  entries: readonly ParsedJournalEntry[];
  syntax: CtnCompiledSyntax;
};

const entryIdPattern =
  /^journal-entry-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const journalDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export class JournalContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalContentValidationError";
  }
}

function assertCanonicalTimestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);

  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new JournalContentValidationError(
      `${label} must be a canonical ISO timestamp.`,
    );
  }
}

function assertJournalSequence(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1 ||
      value > journalMaximumDailySequence) {
    throw new JournalContentValidationError(
      `${label} must be an integer between 1 and ${journalMaximumDailySequence}.`,
    );
  }
}

function assertJournalDate(value: string, label: string) {
  if (!journalDatePattern.test(value) ||
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new JournalContentValidationError(
      `${label} must be a canonical YYYY-MM-DD date.`,
    );
  }
}

export function isJournalEntryId(value: string): value is JournalEntryId {
  return entryIdPattern.test(value);
}

export function listJournalEntries(content: JournalContent): JournalEntry[];
export function listJournalEntries(
  content: JournalContentValue,
): JournalEntryValue[];
export function listJournalEntries(content: JournalContentValue) {
  return content.days.flatMap((day) => day.entries);
}

export function findJournalEntry(
  content: JournalContent,
  entryId: JournalEntryId,
): JournalEntry | null;
export function findJournalEntry(
  content: JournalContentValue,
  entryId: JournalEntryId,
): JournalEntryValue | null;
export function findJournalEntry(
  content: JournalContentValue,
  entryId: JournalEntryId,
) {
  for (const day of content.days) {
    const entry = day.entries.find(({ id }) => id === entryId);

    if (entry) return entry;
  }
  return null;
}

export function getJournalCreationTimezoneOffsetMinutes(date: Date) {
  return -date.getTimezoneOffset();
}

export function formatJournalEntryDate(
  createdAt: string,
  timezoneOffsetMinutes: number,
) {
  assertCanonicalTimestamp(createdAt, "Journal entry createdAt");
  if (
    !Number.isSafeInteger(timezoneOffsetMinutes) ||
    timezoneOffsetMinutes < -840 ||
    timezoneOffsetMinutes > 840
  ) {
    throw new JournalContentValidationError(
      "Journal timezone offset must be an integer between -840 and 840 minutes.",
    );
  }

  const localTimestamp =
    Date.parse(createdAt) + timezoneOffsetMinutes * 60_000;

  return new Date(localTimestamp).toISOString().slice(0, 10);
}

export function formatJournalEntryTitle(
  createdAt: string,
  timezoneOffsetMinutes: number,
  sequence: number,
) {
  assertJournalSequence(sequence, "Journal entry sequence");
  return `${formatJournalEntryDate(createdAt, timezoneOffsetMinutes)}-${String(
    sequence,
  ).padStart(4, "0")}`;
}

export function validateJournalEntryAnalysis(
  entry: JournalEntryValue,
  syntax: CtnCompiledSyntax,
  analysis: CtnCanonicalSourceAnalysis,
): ParsedJournalEntry {
  if (!isJournalEntryId(entry.id)) {
    throw new JournalContentValidationError(
      `Invalid journal entry id: ${entry.id}`,
    );
  }
  assertCanonicalTimestamp(entry.createdAt, `Journal entry ${entry.id} createdAt`);
  assertCanonicalTimestamp(entry.updatedAt, `Journal entry ${entry.id} updatedAt`);
  assertJournalSequence(entry.sequence, `Journal entry ${entry.id} sequence`);
  if (Date.parse(entry.updatedAt) < Date.parse(entry.createdAt)) {
    throw new JournalContentValidationError(
      `Journal entry ${entry.id} updatedAt is before createdAt.`,
    );
  }

  const expectedTitle = formatJournalEntryTitle(
    entry.createdAt,
    entry.timezoneOffsetMinutes,
    entry.sequence,
  );
  let header: ReturnType<typeof readCtnCanonicalTitleHeader>;

  try {
    header = readCtnCanonicalTitleHeader(entry.source);
    if (
      (
        analysis.sourceText.source !== entry.source ||
        analysis.syntax.analysisKey !== syntax.analysisKey
      )
    ) {
      throw new Error("Prepared Journal analysis does not match its entry.");
    }
  } catch (error) {
    throw new JournalContentValidationError(
      `Journal entry ${entry.id} has invalid canonical CTN source: ${
        error instanceof Error ? error.message : "unknown CTN error"
      }`,
    );
  }

  if (header.title !== expectedTitle) {
    throw new JournalContentValidationError(
      `Journal entry ${entry.id} title must remain ${expectedTitle}.`,
    );
  }
  if (header.metadata.createdAt !== entry.createdAt) {
    throw new JournalContentValidationError(
      `Journal entry ${entry.id} title createdAt must match the entry.`,
    );
  }
  if (header.metadata.updatedAt !== entry.createdAt) {
    throw new JournalContentValidationError(
      `Journal entry ${entry.id} title metadata is immutable.`,
    );
  }

  const entryCreatedAt = Date.parse(entry.createdAt);
  const entryUpdatedAt = Date.parse(entry.updatedAt);

  for (const block of analysis.document.blocks) {
    const blockCreatedAt = Date.parse(block.metadata.createdAt);
    const blockUpdatedAt = Date.parse(block.metadata.updatedAt);

    if (blockCreatedAt < entryCreatedAt) {
      throw new JournalContentValidationError(
        `Journal entry ${entry.id} block ${block.id} was created before the entry.`,
      );
    }
    if (blockUpdatedAt < blockCreatedAt) {
      throw new JournalContentValidationError(
        `Journal entry ${entry.id} block ${block.id} updatedAt is before its createdAt.`,
      );
    }
    if (blockUpdatedAt > entryUpdatedAt) {
      throw new JournalContentValidationError(
        `Journal entry ${entry.id} block ${block.id} was updated after the entry.`,
      );
    }
  }

  return { analysis, entry: entry as JournalEntry, title: expectedTitle };
}

export function createJournalEntryBodyProjection(
  parsed: ParsedJournalEntry,
) {
  const editable = parsed.analysis.editableProjection;
  const prefix = `${parsed.title}\n`;
  let source: string;

  if (editable.source === parsed.title) {
    source = "";
  } else if (editable.source.startsWith(prefix)) {
    source = editable.source.slice(prefix.length);
  } else {
      throw new JournalContentValidationError(
        `Journal entry ${parsed.entry.id} has an invalid editable title.`,
      );
  }

  return {
    analysis: parsed.analysis,
    editableSource: editable.source,
    source,
    title: parsed.title,
    projectCanonicalLineNumber(canonicalLineNumber: number) {
      return Math.max(
        1,
        getCtnEditableLineNumber(editable, canonicalLineNumber) - 1,
      );
    },
  };
}

export function createEmptyJournalContent(): JournalContent {
  return {
    days: [],
    schemaVersion: journalRepositorySchemaVersion,
    syntaxSource: defaultJournalSyntaxSource,
  };
}

export function validateJournalContentAnalysis(
  content: JournalContentValue,
  {
    analysisByEntryId = new Map(),
    syntax: preparedSyntax,
  }: {
    analysisByEntryId?: ReadonlyMap<
      JournalEntryId,
      CtnCanonicalSourceAnalysis
    >;
    syntax?: CtnCompiledSyntax;
  } = {},
): ValidatedJournalContentAnalysis {
  if (content.schemaVersion !== journalRepositorySchemaVersion) {
    throw new JournalContentValidationError(
      `Journal schema version must be ${journalRepositorySchemaVersion}.`,
    );
  }
  const syntaxResult = preparedSyntax
    ? { diagnostics: [], syntax: preparedSyntax }
    : compileCtnSyntaxSource(content.syntaxSource, "journal");

  if (!syntaxResult.syntax || syntaxResult.syntax.owner !== "journal") {
    throw new JournalContentValidationError(
      `Journal syntax is invalid: ${syntaxResult.diagnostics[0]?.message ?? "unknown syntax error"}`,
    );
  }

  const dates = new Set<string>();
  let previousDate: string | null = null;
  const entryIds = new Set<JournalEntryId>();
  const issuedTitles = new Set<string>();
  const ownerByBlockId = new Map<string, JournalEntryId>();
  const entries: ParsedJournalEntry[] = [];

  for (const day of content.days) {
    assertJournalDate(day.date, "Journal day date");
    assertJournalSequence(
      day.lastIssuedSequence,
      `Journal day ${day.date}`,
    );
    if (dates.has(day.date)) {
      throw new JournalContentValidationError(
        `Duplicate journal day: ${day.date}`,
      );
    }
    if (previousDate !== null && previousDate.localeCompare(day.date) >= 0) {
      throw new JournalContentValidationError(
        "Journal days must be stored in ascending date order.",
      );
    }
    dates.add(day.date);
    previousDate = day.date;
    let previousSequence = 0;

    for (const entry of day.entries) {
      if (!isJournalEntryId(entry.id)) {
        throw new JournalContentValidationError(
          `Invalid journal entry id: ${entry.id}`,
        );
      }
      if (entryIds.has(entry.id)) {
        throw new JournalContentValidationError(
          `Duplicate journal entry id: ${entry.id}`,
        );
      }
      entryIds.add(entry.id);
      const date = formatJournalEntryDate(
        entry.createdAt,
        entry.timezoneOffsetMinutes,
      );
      const title = formatJournalEntryTitle(
        entry.createdAt,
        entry.timezoneOffsetMinutes,
        entry.sequence,
      );

      if (date !== day.date) {
        throw new JournalContentValidationError(
          `Journal entry ${entry.id} belongs to ${date}, not ${day.date}.`,
        );
      }
      if (entry.sequence <= previousSequence) {
        throw new JournalContentValidationError(
          `Journal day ${day.date} entries must be stored by ascending sequence.`,
        );
      }
      if (entry.sequence > day.lastIssuedSequence) {
        throw new JournalContentValidationError(
          `Journal entry ${entry.id} exceeds day counter ${day.date}.`,
        );
      }
      if (issuedTitles.has(title)) {
        throw new JournalContentValidationError(
          `Duplicate journal daily sequence: ${title}`,
        );
      }
      previousSequence = entry.sequence;
      issuedTitles.add(title);

      let analysis = analysisByEntryId.get(entry.id as JournalEntryId);

      if (!analysis) {
        try {
          analysis = analyzeCtnSource({
            mode: { kind: "canonical-document" },
            source: entry.source,
            syntax: syntaxResult.syntax,
          });
        } catch (error) {
          throw new JournalContentValidationError(
            `Journal entry ${entry.id} has invalid canonical CTN source: ${
              error instanceof Error ? error.message : "unknown CTN error"
            }`,
          );
        }
      }
      const parsed = validateJournalEntryAnalysis(
        entry,
        syntaxResult.syntax,
        analysis,
      );

      for (const block of parsed.analysis.document.blocks) {
        const existingOwner = ownerByBlockId.get(block.id);

        if (existingOwner) {
          throw new JournalContentValidationError(
            `Duplicate CTN block id ${block.id} in journal entries ${existingOwner} and ${entry.id}.`,
          );
        }
        ownerByBlockId.set(block.id, parsed.entry.id);
      }
      entries.push(parsed);
    }
  }
  return {
    content: content as JournalContent,
    entries,
    syntax: syntaxResult.syntax,
  };
}

export function validateJournalContent(
  content: JournalContentValue,
  options: Parameters<typeof validateJournalContentAnalysis>[1] = {},
): JournalContent {
  return validateJournalContentAnalysis(content, options).content;
}

function assertJournalTitleHeaderUnchanged(
  previous: ParsedJournalEntry,
  next: ParsedJournalEntry,
) {
  const previousTitle = previous.analysis.document.blocks[0]!;
  const nextTitle = next.analysis.document.blocks[0]!;

  if (
    previous.title !== next.title ||
    previousTitle.id !== nextTitle.id ||
    previousTitle.metadata.createdAt !== nextTitle.metadata.createdAt ||
    previousTitle.metadata.updatedAt !== nextTitle.metadata.updatedAt ||
    previousTitle.indentText !== nextTitle.indentText
  ) {
    throw new JournalContentValidationError(
      `Journal entry ${previous.entry.id} title header metadata is immutable.`,
    );
  }
}

/** Validate invariants whose immutability spans repository generations. */
export function validateJournalContentAnalysisTransition(
  previousResult: ValidatedJournalContentAnalysis,
  nextResult: ValidatedJournalContentAnalysis,
): JournalContent {
  const previous = previousResult.content;
  const next = nextResult.content;
  const nextById = new Map(
    nextResult.entries.map((parsed) => [parsed.entry.id, parsed]),
  );
  const nextDayByDate = new Map(next.days.map((day) => [day.date, day]));

  for (const previousDay of previous.days) {
    const nextDay = nextDayByDate.get(previousDay.date);

    if (!nextDay || nextDay.lastIssuedSequence < previousDay.lastIssuedSequence) {
      throw new JournalContentValidationError(
        `Journal day ${previousDay.date} cannot be removed or move backwards.`,
      );
    }
  }

  for (const previousParsed of previousResult.entries) {
    const previousEntry = previousParsed.entry;
    const nextParsed = nextById.get(previousEntry.id);

    if (!nextParsed) continue;
    const nextEntry = nextParsed.entry;
    if (previousEntry.createdAt !== nextEntry.createdAt) {
      throw new JournalContentValidationError(
        `Journal entry ${previousEntry.id} createdAt is immutable.`,
      );
    }
    if (previousEntry.sequence !== nextEntry.sequence) {
      throw new JournalContentValidationError(
        `Journal entry ${previousEntry.id} sequence is immutable.`,
      );
    }
    if (
      previousEntry.timezoneOffsetMinutes !==
        nextEntry.timezoneOffsetMinutes
    ) {
      throw new JournalContentValidationError(
        `Journal entry ${previousEntry.id} timezoneOffsetMinutes is immutable.`,
      );
    }
    if (Date.parse(nextEntry.updatedAt) < Date.parse(previousEntry.updatedAt)) {
      throw new JournalContentValidationError(
        `Journal entry ${previousEntry.id} updatedAt cannot move backwards.`,
      );
    }
    assertJournalTitleHeaderUnchanged(previousParsed, nextParsed);
    const nextBlocksById = new Map(
      nextParsed.analysis.document.blocks.map(
        (block) => [block.id, block],
      ),
    );

    for (const previousBlock of previousParsed.analysis.document.blocks) {
      const nextBlock = nextBlocksById.get(previousBlock.id);

      if (!nextBlock) continue;
      if (
        previousBlock.metadata.createdAt !== nextBlock.metadata.createdAt
      ) {
        throw new JournalContentValidationError(
          `Journal entry ${previousEntry.id} block ${previousBlock.id} createdAt is immutable.`,
        );
      }
      if (
        Date.parse(nextBlock.metadata.updatedAt) <
          Date.parse(previousBlock.metadata.updatedAt)
      ) {
        throw new JournalContentValidationError(
          `Journal entry ${previousEntry.id} block ${previousBlock.id} updatedAt cannot move backwards.`,
        );
      }
    }
  }
  return next;
}

/** Validate invariants whose immutability spans repository generations. */
export function validateJournalContentTransition(
  previousValue: JournalContentValue,
  nextValue: JournalContentValue,
): JournalContent {
  return validateJournalContentAnalysisTransition(
    validateJournalContentAnalysis(previousValue),
    validateJournalContentAnalysis(nextValue),
  );
}
