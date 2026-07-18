// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnCanonicalDocument } from "../../ctn/parser/types.ts";
import {
  createCtnEditableSourceFromDocument,
  getCtnEditableLineNumber,
} from "../../ctn/metadata/editableSource.ts";
import {
  parseCtnCanonicalDocument,
  readCtnCanonicalTitleHeader,
} from "../../ctn/parser/parseCtnDocument.ts";
import { journalCtnSyntaxProfileV1 } from "../syntax/journalSyntaxV1.ts";

export const journalRepositoryPurpose = "system-journal" as const;
export const journalRepositorySchemaVersion = 1 as const;

export type JournalEntryId = `journal-entry-${string}`;

export type JournalEntry = {
  id: JournalEntryId;
  createdAt: string;
  timezoneOffsetMinutes: number;
  updatedAt: string;
  source: string;
};

/** Shape accepted after the runtime-neutral system wire parser has run. */
export type JournalEntryValue = Omit<JournalEntry, "id"> & { id: string };

export type JournalContent = {
  purpose: typeof journalRepositoryPurpose;
  schemaVersion: typeof journalRepositorySchemaVersion;
  entries: JournalEntry[];
};

export type JournalContentValue = Omit<JournalContent, "entries"> & {
  entries: JournalEntryValue[];
};

export type ParsedJournalEntry = {
  document: CtnCanonicalDocument;
  entry: JournalEntry;
  title: string;
};

const entryIdPattern =
  /^journal-entry-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

export function isJournalEntryId(value: string): value is JournalEntryId {
  return entryIdPattern.test(value);
}

export function getJournalCreationTimezoneOffsetMinutes(date: Date) {
  return -date.getTimezoneOffset();
}

export function formatJournalEntryTitle(
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
  const localIso = new Date(localTimestamp).toISOString();

  return `${localIso.slice(0, 10)} ${localIso.slice(11, 19)}`;
}

export function parseJournalEntry(entry: JournalEntryValue): ParsedJournalEntry {
  if (!isJournalEntryId(entry.id)) {
    throw new JournalContentValidationError(
      `Invalid journal entry id: ${entry.id}`,
    );
  }
  assertCanonicalTimestamp(entry.createdAt, `Journal entry ${entry.id} createdAt`);
  assertCanonicalTimestamp(entry.updatedAt, `Journal entry ${entry.id} updatedAt`);
  if (Date.parse(entry.updatedAt) < Date.parse(entry.createdAt)) {
    throw new JournalContentValidationError(
      `Journal entry ${entry.id} updatedAt is before createdAt.`,
    );
  }

  const expectedTitle = formatJournalEntryTitle(
    entry.createdAt,
    entry.timezoneOffsetMinutes,
  );
  let document: CtnCanonicalDocument;
  let header: ReturnType<typeof readCtnCanonicalTitleHeader>;

  try {
    header = readCtnCanonicalTitleHeader(entry.source);
    document = parseCtnCanonicalDocument(
      entry.source,
      journalCtnSyntaxProfileV1,
    );
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

  for (const block of document.blocks) {
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

  return { document, entry: entry as JournalEntry, title: expectedTitle };
}

export function createJournalEntryBodyProjection(entry: JournalEntryValue) {
  const parsed = parseJournalEntry(entry);
  const editable = createCtnEditableSourceFromDocument(
    parsed.entry.source,
    parsed.document,
  );
  const prefix = `${parsed.title}\n`;
  let source: string;

  if (editable.source === parsed.title) {
    source = "";
  } else if (editable.source.startsWith(prefix)) {
    source = editable.source.slice(prefix.length);
  } else {
    throw new JournalContentValidationError(
      `Journal entry ${entry.id} has an invalid editable title.`,
    );
  }

  return {
    document: parsed.document,
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

export function collectJournalBlockIds(content: JournalContentValue) {
  const ownerByBlockId = new Map<string, JournalEntryId>();

  for (const entry of content.entries) {
    const parsed = parseJournalEntry(entry);

    for (const block of parsed.document.blocks) {
      const existingOwner = ownerByBlockId.get(block.id);

      if (existingOwner) {
        throw new JournalContentValidationError(
          `Duplicate CTN block id ${block.id} in journal entries ${existingOwner} and ${entry.id}.`,
        );
      }
      ownerByBlockId.set(block.id, parsed.entry.id);
    }
  }

  return new Set(ownerByBlockId.keys());
}

export function validateJournalContent(
  content: JournalContentValue,
): JournalContent {
  if (content.purpose !== journalRepositoryPurpose) {
    throw new JournalContentValidationError(
      `Journal purpose must be ${journalRepositoryPurpose}.`,
    );
  }
  if (content.schemaVersion !== journalRepositorySchemaVersion) {
    throw new JournalContentValidationError(
      `Journal schema version must be ${journalRepositorySchemaVersion}.`,
    );
  }

  const entryIds = new Set<JournalEntryId>();

  for (const entry of content.entries) {
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
  }
  collectJournalBlockIds(content);
  return content as JournalContent;
}

function assertJournalTitleHeaderUnchanged(
  previous: JournalEntry,
  next: JournalEntry,
) {
  const previousHeader = readCtnCanonicalTitleHeader(previous.source);
  const nextHeader = readCtnCanonicalTitleHeader(next.source);

  if (
    previousHeader.title !== nextHeader.title ||
    previousHeader.metadata.id !== nextHeader.metadata.id ||
    previousHeader.metadata.createdAt !== nextHeader.metadata.createdAt ||
    previousHeader.metadata.updatedAt !== nextHeader.metadata.updatedAt ||
    previousHeader.metadata.indentText !== nextHeader.metadata.indentText
  ) {
    throw new JournalContentValidationError(
      `Journal entry ${previous.id} title header metadata is immutable.`,
    );
  }
}

/**
 * Validates invariants that require both repository generations. Entries may
 * be added or removed, but the creation identity of an entry that survives a
 * transition is permanent.
 */
export function validateJournalContentTransition(
  previousValue: JournalContentValue,
  nextValue: JournalContentValue,
): JournalContent {
  const previous = validateJournalContent(previousValue);
  const next = validateJournalContent(nextValue);
  const nextById = new Map(next.entries.map((entry) => [entry.id, entry]));

  for (const previousEntry of previous.entries) {
    const nextEntry = nextById.get(previousEntry.id);

    if (!nextEntry) continue;
    if (previousEntry.createdAt !== nextEntry.createdAt) {
      throw new JournalContentValidationError(
        `Journal entry ${previousEntry.id} createdAt is immutable.`,
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
    assertJournalTitleHeaderUnchanged(previousEntry, nextEntry);
    const previousDocument = parseJournalEntry(previousEntry).document;
    const nextBlocksById = new Map(
      parseJournalEntry(nextEntry).document.blocks.map((block) => [
        block.id,
        block,
      ]),
    );

    for (const previousBlock of previousDocument.blocks) {
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
