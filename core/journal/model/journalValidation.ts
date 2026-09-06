// SPDX-License-Identifier: GPL-3.0-or-later

import {
  analyzeCtnSource,
  type CtnCanonicalSourceAnalysis,
  readCtnCanonicalTitleHeader,
  compileCtnSyntaxSource,
} from "../../ctn/index.ts";


import type { CtnCompiledSyntax } from "../../ctn/index.ts";
import {
  journalRepositorySchemaVersion,
  type JournalContent,
  type JournalContentValue,
  type JournalEntry,
  type JournalEntryId,
  type JournalEntryValue,
} from "./journalContent.ts";
import { JournalContentValidationError } from "./journalErrors.ts";
import {
  assertJournalCanonicalTimestamp,
  assertJournalDate,
  assertJournalSequence,
  formatJournalEntryDate,
  formatJournalEntryTitle,
  isJournalEntryId,
} from "./journalIdentity.ts";

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
  assertJournalCanonicalTimestamp(
    entry.createdAt,
    `Journal entry ${entry.id} createdAt`,
  );
  assertJournalCanonicalTimestamp(
    entry.updatedAt,
    `Journal entry ${entry.id} updatedAt`,
  );
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
      analysis.sourceText.source !== entry.source ||
      analysis.syntax.analysisKey !== syntax.analysisKey
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
      `Journal syntax is invalid: ${
        syntaxResult.diagnostics[0]?.message ?? "unknown syntax error"
      }`,
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

      let analysis = analysisByEntryId.get(entry.id);

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

    if (
      !nextDay ||
      nextDay.lastIssuedSequence < previousDay.lastIssuedSequence
    ) {
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
      previousEntry.timezoneOffsetMinutes !== nextEntry.timezoneOffsetMinutes
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
      nextParsed.analysis.document.blocks.map((block) => [block.id, block]),
    );

    for (const previousBlock of previousParsed.analysis.document.blocks) {
      const nextBlock = nextBlocksById.get(previousBlock.id);

      if (!nextBlock) continue;
      if (previousBlock.metadata.createdAt !== nextBlock.metadata.createdAt) {
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
