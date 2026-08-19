// SPDX-License-Identifier: GPL-3.0-or-later

import { parseJournalContent, parseJournalSnapshot } from "../../../contracts/journal/parseJournal";
import { parseContentRevision } from "../../../contracts/common/contractValue";
import {
  type JournalContent,
} from "../../../core/journal/model/journalContent";
import {
  JournalContentValidationError,
} from "../../../core/journal/model/journalErrors";
import {
  validateJournalContent,
  validateJournalContentAnalysisTransition,
  validateJournalContentTransition,
} from "../../../core/journal/model/journalValidation";
import {
  createJournalParseIndex,
  type JournalParseIndex,
} from "../../../core/journal/indexes/journalParseIndex";
import type { JournalRevision } from "../../../application/journal/persistence/journalRepository";
import type {
  VersionedContentPreparationPolicy,
  VersionedRepositoryCodec,
} from "../../../application/persistence/versionedRepository";

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

export const journalRepositoryPreparation: VersionedContentPreparationPolicy<
  JournalContent,
  JournalParseIndex
> = {
  prepare(content, previous) {
    try {
      return createJournalParseIndex(content, previous);
    } catch (error) {
      if (error instanceof JournalContentValidationError) {
        throw new Error(`Journal content is invalid: ${error.message}`);
      }
      throw error;
    }
  },
  validateTransition(previous, next) {
    try {
      validateJournalContentAnalysisTransition(
        previous.projection.validation,
        next.projection.validation,
      );
    } catch (error) {
      if (error instanceof JournalContentValidationError) {
        throw new Error(`Journal transition is invalid: ${error.message}`);
      }
      throw error;
    }
  },
};
