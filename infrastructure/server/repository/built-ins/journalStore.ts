// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  WireContractError,
  UnsupportedWireVersionError,
  serializeJsonIteratively,
} from "../../../../contracts/common/index.ts";

import {
  parseJournalContent,
  serializeJournalRevisionContent,
} from "../../../../contracts/journal/index.ts";

import type {
  JournalContentDto,
  JournalRevisionDto,
} from "../../../../contracts/journal/index.ts";
import {
  JournalContentValidationError,
} from "../../../../core/journal/index.ts";
import type { JournalParseIndex } from "../../../../core/journal/index.ts";
import {
  prepareJournalRepositoryContent,
  validateJournalRepositoryPreparedTransition,
} from "../../../../application/journal/index.ts";
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

export function prepareJournalWriteContent(
  content: JournalContentDto,
  previous?: JournalParseIndex | null,
) {
  return validateWriteBoundary(() =>
    prepareJournalRepositoryContent(content, previous)
  );
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
    prepareContent: prepareJournalRepositoryContent,
    serializeContent(content) {
      return `${serializeJsonIteratively(content, { indent: 2 })}\n`;
    },
    validateTransition: validateJournalRepositoryPreparedTransition,
    validateWriteBoundary,
  });
}
