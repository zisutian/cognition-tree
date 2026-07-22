// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  WireContractError,
  UnsupportedWireVersionError,
} from "../../../contracts/common/contractValue.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import {
  parseJournalCommit,
  parseJournalContent,
} from "../../../contracts/journal/parseJournal.ts";
import { serializeJournalRevisionContent } from "../../../contracts/journal/revision.ts";
import type {
  JournalContentDto,
  JournalRevisionDto,
} from "../../../contracts/journal/types.ts";
import {
  JournalContentValidationError,
  validateJournalContent,
  validateJournalContentTransition,
} from "../../../core/journal/model/journalContent.ts";
import { RepositoryCorruptError } from "./repositoryStore.ts";
import {
  FileSystemVersionedContentStore,
  type VersionedContentStore,
} from "./versionedContentStore.ts";

export type JournalContentStore = VersionedContentStore<JournalContentDto>;

export function createJournalRevision(
  content: JournalContentDto,
): JournalRevisionDto {
  return `sha256:${createHash("sha256")
    .update(serializeJournalRevisionContent(content))
    .digest("hex")}`;
}

function validateWriteBoundary(operation: () => void) {
  try {
    operation();
  } catch (error) {
    if (error instanceof JournalContentValidationError) {
      throw new WireContractError("Journal v3", "$.content", error.message);
    }
    throw error;
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
    parseCommit: parseJournalCommit,
    parseContent: parseJournalContent,
    serializeContent(content) {
      return `${serializeJsonIteratively(content, { indent: 2 })}\n`;
    },
    validateContent(content) {
      validateJournalContent(content);
    },
    validateTransition(previous, next) {
      validateJournalContentTransition(previous, next);
    },
    validateWriteBoundary,
  });
}
