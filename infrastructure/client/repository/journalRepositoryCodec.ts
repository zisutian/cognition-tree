// SPDX-License-Identifier: GPL-3.0-or-later

import { parseJournalContent, parseJournalSnapshot } from "../../../contracts/journal/parseJournal";
import { parseContentRevision } from "../../../contracts/common/contractValue";
import {
  JournalContentValidationError,
  validateJournalContent,
  validateJournalContentTransition,
  type JournalContent,
} from "../../../core/journal/model/journalContent";
import type { JournalRevision } from "../../../application/repository/builtInRepository";
import type { VersionedRepositoryCodec } from "../../../application/persistence/versionedRepository";

export const journalRepositoryCodec: VersionedRepositoryCodec<
  JournalContent,
  JournalRevision
> = {
  parseContent: (value) => validateJournalContent(parseJournalContent(value)),
  parseRevision: parseContentRevision,
  parseSnapshot(value) {
    const snapshot = parseJournalSnapshot(value);

    return {
      ...snapshot,
      content: validateJournalContent(snapshot.content),
    };
  },
};

export function validateJournalRepositoryContent(content: JournalContent) {
  try {
    validateJournalContent(content);
  } catch (error) {
    if (error instanceof JournalContentValidationError) {
      throw new Error(`Journal content is invalid: ${error.message}`);
    }
    throw error;
  }
}

export function validateJournalRepositoryTransition(
  previous: JournalContent,
  next: JournalContent,
) {
  try {
    validateJournalContentTransition(previous, next);
  } catch (error) {
    if (error instanceof JournalContentValidationError) {
      throw new Error(`Journal transition is invalid: ${error.message}`);
    }
    throw error;
  }
}
