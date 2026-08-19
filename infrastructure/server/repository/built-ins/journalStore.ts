// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  WireContractError,
  UnsupportedWireVersionError,
} from "../../../../contracts/common/contractValue.ts";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import {
  parseJournalContent,
} from "../../../../contracts/journal/parseJournal.ts";
import { serializeJournalRevisionContent } from "../../../../contracts/journal/revision.ts";
import type {
  JournalContentDto,
  JournalRevisionDto,
} from "../../../../contracts/journal/types.ts";
import {
  JournalContentValidationError,
} from "../../../../core/journal/model/journalErrors.ts";
import {
  validateJournalContentAnalysisTransition,
} from "../../../../core/journal/model/journalValidation.ts";
import {
  createJournalParseIndex,
  type JournalParseIndex,
} from "../../../../core/journal/indexes/journalParseIndex.ts";
import { RepositoryCorruptError } from "../store.ts";
import {
  FileSystemVersionedContentStore,
  type VersionedContentStore,
} from "../versioned/contentStore.ts";

export type JournalContentStore = VersionedContentStore<
  JournalContentDto,
  JournalParseIndex
>;

export function createJournalRevision(
  content: JournalContentDto,
): JournalRevisionDto {
  return `sha256:${createHash("sha256")
    .update(serializeJournalRevisionContent(content))
    .digest("hex")}`;
}

function validateWriteBoundary<Result>(operation: () => Result): Result {
  try {
    return operation();
  } catch (error) {
    if (error instanceof JournalContentValidationError) {
      throw new WireContractError("Journal v3", "$.content", error.message);
    }
    throw error;
  }
}

function prepareJournalContent(
  content: JournalContentDto,
  previous?: JournalParseIndex | null,
) {
  try {
    return createJournalParseIndex(content, previous);
  } catch (error) {
    if (error instanceof JournalContentValidationError) throw error;
    throw new JournalContentValidationError(
      `Journal CTN preparation failed: ${
        error instanceof Error ? error.message : "unknown CTN error"
      }`,
    );
  }
}

export function createFileSystemJournalContentStore(
  filePath: string,
): JournalContentStore {
  return new FileSystemVersionedContentStore(filePath, {
    createRevision: createJournalRevision,
    normalizeReadError(error) {
      if (error instanceof UnsupportedWireVersionError) return error;
      if (
        error instanceof WireContractError ||
        error instanceof JournalContentValidationError
      ) {
        return new RepositoryCorruptError("Journal content is invalid");
      }
      return error;
    },
    parseContent: parseJournalContent,
    prepareContent: prepareJournalContent,
    serializeContent(content) {
      return `${serializeJsonIteratively(content, { indent: 2 })}\n`;
    },
    validateTransition(previous, next) {
      validateJournalContentAnalysisTransition(
        previous.projection.validation,
        next.projection.validation,
      );
    },
    validateWriteBoundary,
  });
}
