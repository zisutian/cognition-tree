// SPDX-License-Identifier: GPL-3.0-or-later

import { parseJournalContent, parseJournalSnapshot } from "../../../contracts/journal/index.ts";
import { parseContentRevision } from "../../../contracts/common/index.ts";
import {
  type JournalContent,
  JournalContentValidationError,
  validateJournalContent,
  validateJournalContentTransition,
} from "../../../core/journal/index.ts";


import type { JournalParseIndex } from "../../../core/journal/index.ts";
import type { JournalRevision } from "../../../application/journal/index.ts";
import {
  prepareJournalRepositoryContent,
  validateJournalRepositoryPreparedTransition,
} from "../../../application/journal/index.ts";
import type {
  VersionedContentPreparationPolicy,
  VersionedRepositoryCodec,
} from "../../../application/persistence/index.ts";

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
      return prepareJournalRepositoryContent(content, previous);
    } catch (error) {
      if (error instanceof JournalContentValidationError) {
        throw new Error(`Journal content is invalid: ${error.message}`);
      }
      throw error;
    }
  },
  validateTransition(previous, next) {
    try {
      validateJournalRepositoryPreparedTransition(previous, next);
    } catch (error) {
      if (error instanceof JournalContentValidationError) {
        throw new Error(`Journal transition is invalid: ${error.message}`);
      }
      throw error;
    }
  },
};
